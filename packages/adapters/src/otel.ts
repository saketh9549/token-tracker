import { makeEvent, upsertEvents, type TokenEvent } from '@promptpulse/core';

type RecordValue = Record<string, any>;
export interface TelemetryImport { events: TokenEvent[]; warnings: string[]; skipped: number }
const isObject = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
function unwrap(value: any): any {
  if (!isObject(value)) return value;
  for (const key of ['stringValue', 'intValue', 'doubleValue', 'boolValue']) if (key in value) return value[key];
  return value;
}
function attributes(value: any): RecordValue {
  if (Array.isArray(value)) return Object.fromEntries(value.filter(v => isObject(v) && typeof v.key === 'string').map(v => [v.key, unwrap(v.value)]));
  return isObject(value) ? value : {};
}
function spansFrom(value: any): RecordValue[] {
  if (Array.isArray(value)) return value.flatMap(spansFrom);
  if (!isObject(value)) return [];
  if (value.resourceSpans) return spansFrom(value.resourceSpans);
  if (value.scopeSpans || value.instrumentationLibrarySpans) return spansFrom(value.scopeSpans ?? value.instrumentationLibrarySpans);
  if (value.spans) return spansFrom(value.spans);
  // Copilot file exporters may wrap signal data in {type:"span", data:{...}}.
  if (value.type === 'span' && value.data) return spansFrom(value.data);
  if (value.spanId || value.spanContext?.spanId || value.context?.spanId) return [value];
  return [];
}
function token(value: any, field: string, warnings: string[]): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  warnings.push(`Invalid ${field} discarded`); return null;
}
function millis(value: any): number | null {
  if (value == null) return null;
  // OTel JS high-resolution time tuple [epoch seconds, nanoseconds].
  if (Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v))) return value[0] * 1000 + value[1] / 1e6;
  if (typeof value === 'string' && !/^\d+$/.test(value)) { const date = Date.parse(value); return Number.isFinite(date) ? date : null; }
  if (typeof value === 'string' && /^\d+$/.test(value)) { try { return Number(BigInt(value) / 1_000_000n); } catch { return null; } }
  return typeof value === 'number' && Number.isFinite(value) ? (value > 1e16 ? value / 1e6 : value) : null;
}
const text = (v: unknown): string | null => typeof v === 'string' && v.length > 0 && v.length <= 400 ? v : null;
export function importTelemetry(input: string): TelemetryImport {
  const warnings: string[] = [];
  const events: TokenEvent[] = [];
  let skipped = 0;
  const lines = input.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    let parsed: any;
    try { parsed = JSON.parse(lines[index]); } catch { warnings.push(`Line ${index + 1}: invalid JSON skipped`); skipped++; continue; }
    const spans = spansFrom(parsed);
    if (!spans.length) { skipped++; continue; }
    for (const span of spans) {
      const context = span.spanContext ?? span.context ?? span;
      const traceId = text(context.traceId ?? span.traceId);
      const spanId = text(context.spanId ?? span.spanId);
      if (!traceId || !spanId || traceId.length > 128 || spanId.length > 128) { warnings.push(`Line ${index + 1}: missing or invalid trace or span ID`); skipped++; continue; }
      const a = attributes(span.attributes);
      const operation = text(a['gen_ai.operation.name']) ?? text(span.name)?.split(' ')[0];
      const kind = operation === 'execute_tool' || operation === 'execute_hook' ? 'tool' : operation === 'invoke_agent' || operation === 'create_agent' ? 'agent' : ['chat', 'generate_content', 'text_completion', 'completion'].includes(operation ?? '') ? 'model_call' : null;
      if (!kind) { skipped++; continue; }
      const inputTokens = token(a['gen_ai.usage.input_tokens'], 'input tokens', warnings);
      const outputTokens = token(a['gen_ai.usage.output_tokens'], 'output tokens', warnings);
      const parent = text(span.parentSpanId ?? span.parentSpanContext?.spanId ?? span.parent_span_id);
      const start = millis(span.startTimeUnixNano ?? span.startTime ?? span.start_time);
      const end = millis(span.endTimeUnixNano ?? span.endTime ?? span.end_time);
      if (start === null || !Number.isFinite(start) || start < 0 || start > 8.64e15) { warnings.push(`Line ${index + 1}: missing or invalid span timestamp`); skipped++; continue; }
      const rawUsage: Record<string, number | null> = {};
      for (const [key, value] of Object.entries(a)) if (/^gen_ai\.usage\.[a-z_.]+$/.test(key)) rawUsage[key] = token(value, key, warnings);
      const model = text(a['gen_ai.response.model'] ?? a['gen_ai.request.model']);
      const name = kind === 'tool' ? `Tool · ${text(a['gen_ai.tool.name']) ?? operation}` : kind === 'agent' ? `Agent · ${text(a['gen_ai.agent.name']) ?? 'Copilot'}` : `Model call · ${model ?? 'unavailable model'}`;
      const total = token(a['gen_ai.usage.total_tokens'], 'total tokens', warnings);
      const reported = inputTokens !== null || outputTokens !== null || total !== null;
      const timestamp = new Date(start).toISOString();
      const coverage = kind === 'agent' ? ['Parent summary excluded from token totals'] : kind === 'tool' ? ['Tool execution has no independent LLM usage'] : !reported ? ['Token usage unavailable'] : inputTokens === null || outputTokens === null ? ['Partial usage: one token field unavailable'] : ['Reported by imported telemetry; completeness depends on exporter'];
      events.push(makeEvent({ eventId: `otel:${traceId}:${spanId}`, sessionId: `copilot:${text(a['gen_ai.conversation.id']) ?? traceId}`,
        interactionId: spanId, parentEventId: parent && !/^0+$/.test(parent) ? `otel:${traceId}:${parent}` : null,
        traceId, spanId, platform: 'vscode', kind, model, name, timestamp, updatedAt: end !== null && end >= start && end <= 8.64e15 ? new Date(end).toISOString() : timestamp,
        inputTokens, outputTokens, cachedInputTokens: token(a['gen_ai.usage.cache_read.input_tokens'], 'cached input', warnings),
        reasoningTokens: token(a['gen_ai.usage.reasoning.output_tokens'] ?? a['gen_ai.usage.reasoning_tokens'], 'reasoning output', warnings),
        reportedTotalTokens: total,
        measurement: reported ? 'telemetry_reported' : 'unknown', durationMs: end !== null && end >= start ? Math.round(end - start) : null,
        status: span.status?.code === 2 || span.status?.code === 'STATUS_CODE_ERROR' || a['error.type'] ? 'error' : end === null ? 'in_progress' : 'complete', coverage, rawUsage }));
    }
  }
  const unique = upsertEvents([], events);
  const byId = new Map(unique.map(e => [e.eventId, e]));
  const explicit = new Map(unique.filter(e => e.sessionId !== `copilot:${e.traceId}`).map(e => [e.eventId, e.sessionId]));
  const traceSessions = new Map<string, string>();
  for (const e of unique) if (explicit.has(e.eventId) && e.traceId && (!traceSessions.has(e.traceId) || (e.kind === 'agent' && !e.parentEventId))) traceSessions.set(e.traceId, e.sessionId);
  for (const event of unique) {
    if (explicit.has(event.eventId)) continue;
    const seen = new Set<string>([event.eventId]);
    let parent = event.parentEventId ? byId.get(event.parentEventId) : undefined;
    let inherited: string | undefined;
    while (parent && !seen.has(parent.eventId)) {
      seen.add(parent.eventId);
      if (explicit.has(parent.eventId)) { inherited = explicit.get(parent.eventId); break; }
      parent = parent.parentEventId ? byId.get(parent.parentEventId) : undefined;
    }
    event.sessionId = inherited ?? traceSessions.get(event.traceId!) ?? event.sessionId;
  }
  return { events: unique, warnings: [...new Set(warnings)], skipped };
}
