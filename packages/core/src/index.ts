import { Tiktoken } from 'js-tiktoken/lite';
import cl100k from 'js-tiktoken/ranks/cl100k_base';

export type Platform = 'chatgpt' | 'vscode' | 'claude' | 'gemini' | 'grok' | 'antigravity';
export type Measurement = 'provider_reported' | 'telemetry_reported' | 'estimated' | 'unknown';
export type EventKind = 'message' | 'model_call' | 'agent' | 'tool';
export interface TokenEvent {
  schemaVersion: 1;
  eventId: string;
  sessionId: string;
  interactionId: string;
  parentEventId: string | null;
  traceId: string | null;
  spanId: string | null;
  platform: Platform;
  kind: EventKind;
  measurement: Measurement;
  name: string;
  model: string | null;
  timestamp: string;
  updatedAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  reportedTotalTokens: number | null;
  durationMs: number | null;
  status: 'complete' | 'in_progress' | 'error' | 'unknown';
  estimator: string | null;
  coverage: string[];
  rawUsage: Record<string, number | null>;
  text?: string;
}

const platforms: Platform[] = ['chatgpt', 'vscode', 'claude', 'gemini', 'grok', 'antigravity'];
const measurements: Measurement[] = ['provider_reported', 'telemetry_reported', 'estimated', 'unknown'];
const kinds: EventKind[] = ['message', 'model_call', 'agent', 'tool'];
const countFields = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningTokens', 'reportedTotalTokens', 'durationMs'] as const;
export const ESTIMATOR = 'js-tiktoken 1.0.21 / cl100k_base';
let encoding: Tiktoken | undefined;
export function estimateTokens(text: string): number {
  encoding ??= new Tiktoken(cl100k);
  // Special token literals in user text are ordinary text, not control tokens.
  return encoding.encode(text, [], []).length;
}

export function makeEvent(values: Partial<TokenEvent> & Pick<TokenEvent, 'eventId' | 'sessionId'>): TokenEvent {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, interactionId: values.eventId, parentEventId: null, traceId: null, spanId: null,
    platform: 'vscode', kind: 'model_call', measurement: 'unknown', name: 'Model call', model: null,
    timestamp: now, updatedAt: now, inputTokens: null, outputTokens: null, cachedInputTokens: null,
    reasoningTokens: null, reportedTotalTokens: null, durationMs: null, status: 'unknown',
    estimator: null, coverage: [], rawUsage: {}, ...values
  };
}

function stringValue(value: unknown, field: string, max = 512): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${field}`);
  return value;
}
function nullableString(value: unknown, field: string): string | null {
  return value == null ? null : stringValue(value, field);
}
function count(value: unknown, field: string): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${field}: expected a nonnegative integer or null`);
  return value;
}
export function validateEvent(value: unknown): TokenEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event object');
  const e = value as Record<string, unknown>;
  if (e.schemaVersion !== 1) throw new Error('Unsupported event schema version');
  if (!platforms.includes(e.platform as Platform) || !measurements.includes(e.measurement as Measurement) || !kinds.includes(e.kind as EventKind)) throw new Error('Invalid platform, measurement, or event kind');
  if (!['complete', 'in_progress', 'error', 'unknown'].includes(e.status as string)) throw new Error('Invalid event status');
  const timestamp = stringValue(e.timestamp, 'timestamp');
  const updatedAt = stringValue(e.updatedAt, 'updatedAt');
  if (!Number.isFinite(Date.parse(timestamp)) || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid timestamp');
  if (!Array.isArray(e.coverage) || e.coverage.length > 30 || !e.coverage.every(v => typeof v === 'string' && v.length < 512)) throw new Error('Invalid coverage');
  const rawUsage: Record<string, number | null> = {};
  if (e.rawUsage && typeof e.rawUsage === 'object' && !Array.isArray(e.rawUsage)) {
    for (const [key, value] of Object.entries(e.rawUsage)) {
      if (/^gen_ai\.usage\.[a-z_.]+$/.test(key) || ['input_tokens', 'output_tokens', 'total_tokens', 'cached_tokens', 'reasoning_tokens'].includes(key)) rawUsage[key] = count(value, key);
    }
  }
  const event = makeEvent({
    eventId: stringValue(e.eventId, 'eventId'), sessionId: stringValue(e.sessionId, 'sessionId'),
    interactionId: stringValue(e.interactionId, 'interactionId'),
    parentEventId: nullableString(e.parentEventId, 'parentEventId'), traceId: nullableString(e.traceId, 'traceId'), spanId: nullableString(e.spanId, 'spanId'),
    platform: e.platform as Platform, kind: e.kind as EventKind, measurement: e.measurement as Measurement,
    name: stringValue(e.name, 'name'), model: nullableString(e.model, 'model'), timestamp, updatedAt,
    status: e.status as TokenEvent['status'], estimator: nullableString(e.estimator, 'estimator'),
    coverage: [...e.coverage] as string[], rawUsage
  });
  for (const field of countFields) event[field] = count(e[field], field);
  if (e.text !== undefined) {
    if (typeof e.text !== 'string' || e.text.length > 1_000_000) throw new Error('Invalid raw text');
    event.text = e.text;
  }
  if (event.measurement === 'estimated' && !event.estimator) throw new Error('Estimated events require an estimator');
  return event;
}

export function withoutText(event: TokenEvent): TokenEvent {
  const { text: _text, ...safe } = event;
  return safe;
}
export function upsertEvents(existing: TokenEvent[], incoming: TokenEvent[], keepText = false): TokenEvent[] {
  const records = new Map(existing.map(event => [event.eventId, keepText ? event : withoutText(event)]));
  for (const candidate of incoming) {
    const event = validateEvent(candidate);
    const old = records.get(event.eventId);
    if (old && Date.parse(old.updatedAt) > Date.parse(event.updatedAt)) continue;
    records.set(event.eventId, { ...(keepText ? event : withoutText(event)), timestamp: old?.timestamp ?? event.timestamp });
  }
  return [...records.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function knownTokens(event: TokenEvent): number | null {
  if (event.kind === 'agent' || event.kind === 'tool' || event.measurement === 'unknown') return null;
  if (event.reportedTotalTokens !== null) return event.reportedTotalTokens;
  if (event.inputTokens === null && event.outputTokens === null) return null;
  return (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
}
export interface Summary {
  reported: number; estimated: number; modelCalls: number; toolCalls: number; sessions: number;
  unknownCalls: number; partialCalls: number; cachedInput: number; reasoning: number;
}
export function summarize(events: TokenEvent[]): Summary {
  const result: Summary = { reported: 0, estimated: 0, modelCalls: 0, toolCalls: 0, sessions: 0, unknownCalls: 0, partialCalls: 0, cachedInput: 0, reasoning: 0 };
  const unique = new Map(events.map(e => [e.eventId, e]));
  result.sessions = new Set([...unique.values()].map(e => e.sessionId)).size;
  for (const event of unique.values()) {
    if (event.kind === 'tool') result.toolCalls++;
    if (event.kind === 'model_call') {
      result.modelCalls++;
      if (knownTokens(event) === null) result.unknownCalls++;
      else if (event.reportedTotalTokens === null && (event.inputTokens === null || event.outputTokens === null)) result.partialCalls++;
    }
    const tokens = knownTokens(event);
    if (tokens === null) continue;
    if (event.measurement === 'estimated') result.estimated += tokens;
    else result.reported += tokens;
    // Display subsets separately, never add them into totals.
    result.cachedInput += event.cachedInputTokens ?? 0;
    result.reasoning += event.reasoningTokens ?? 0;
  }
  return result;
}
export interface TraceNode { event: TokenEvent; children: TraceNode[]; diagnostics: string[] }
export function buildTrace(events: TokenEvent[]): TraceNode[] {
  const nodes = new Map(events.map(event => [event.eventId, { event, children: [], diagnostics: [] } as TraceNode]));
  const roots: TraceNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.event.parentEventId;
    if (!parentId) { roots.push(node); continue; }
    const parent = nodes.get(parentId);
    if (!parent) { node.diagnostics.push('Parent span missing from import'); roots.push(node); continue; }
    const seen = new Set([node.event.eventId]);
    let cursor: TraceNode | undefined = parent;
    while (cursor) {
      if (seen.has(cursor.event.eventId)) break;
      seen.add(cursor.event.eventId);
      cursor = cursor.event.parentEventId ? nodes.get(cursor.event.parentEventId) : undefined;
    }
    if (cursor) { node.diagnostics.push('Cyclic parent link ignored'); roots.push(node); }
    else parent.children.push(node);
  }
  return roots.sort((a, b) => a.event.timestamp.localeCompare(b.event.timestamp));
}

export interface UsageExport { format: 'promptpulse'; schemaVersion: 1; exportedAt: string; events: TokenEvent[] }
export function exportUsage(events: TokenEvent[], includeText = false): string {
  return JSON.stringify({ format: 'promptpulse', schemaVersion: 1, exportedAt: new Date().toISOString(), events: events.map(e => includeText ? validateEvent(e) : withoutText(validateEvent(e))) } satisfies UsageExport, null, 2);
}
export function importUsage(text: string, keepText = false): TokenEvent[] {
  const data = JSON.parse(text);
  if (data.format !== 'promptpulse' || data.schemaVersion !== 1 || !Array.isArray(data.events)) throw new Error('Expected a PromptPulse v1 export');
  if (data.events.length > 100_000) throw new Error('Import exceeds 100,000 records');
  return data.events.map((value: unknown) => keepText ? validateEvent(value) : withoutText(validateEvent(value)));
}
