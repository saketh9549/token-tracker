import { ESTIMATOR, makeEvent, type TokenEvent } from '@promptpulse/core';

// Explicitly synthetic, generated in memory. Never automatically saved to the store.
export function sampleEvents(): TokenEvent[] {
  const events: TokenEvent[] = [];
  for (let day = 6; day >= 0; day--) {
    const date = new Date(); date.setDate(date.getDate() - day); date.setHours(10, 20, 0, 0);
    const timestamp = date.toISOString();
    const sessionId = `sample:chatgpt:${day}`;
    events.push(makeEvent({ eventId: `${sessionId}:user`, sessionId, platform: 'chatgpt', kind: 'message', measurement: 'estimated', name: 'Visible prompt', inputTokens: 420 + day * 231, estimator: ESTIMATOR, timestamp, updatedAt: timestamp, status: 'complete', coverage: ['Sample visible-text estimate', 'Hidden context unavailable'] }));
    events.push(makeEvent({ eventId: `${sessionId}:assistant`, sessionId, platform: 'chatgpt', kind: 'message', measurement: 'estimated', name: 'Visible response', outputTokens: 920 + day * 302, estimator: ESTIMATOR, timestamp, updatedAt: timestamp, status: 'complete', coverage: ['Sample visible-text estimate'] }));
    const traceId = `sample-trace-${day}`;
    const ideSession = `sample:copilot:${day}`;
    const parent = `sample:${traceId}:agent`;
    events.push(makeEvent({ eventId: parent, sessionId: ideSession, kind: 'agent', name: 'Agent · Copilot', traceId, spanId: 'agent', measurement: 'telemetry_reported', inputTokens: 11280 + day * 432, outputTokens: 3600 + day * 231, model: 'sample-model', timestamp, updatedAt: timestamp, durationMs: 18320, status: 'complete', coverage: ['Sample parent summary; excluded from totals'] }));
    for (let call = 0; call < 3; call++) events.push(makeEvent({ eventId: `sample:${traceId}:call${call}`, sessionId: ideSession, parentEventId: parent, traceId, spanId: `call${call}`, name: ['Model call · Analyze request', 'Model call · Implement changes', 'Model call · Summarize result'][call], kind: 'model_call', model: 'sample-model', measurement: 'telemetry_reported', inputTokens: 2300 + call * 1460 + day * 144, outputTokens: 620 + call * 580 + day * 77, cachedInputTokens: call === 0 ? null : 1800, reasoningTokens: call === 1 ? 200 : null, timestamp, updatedAt: timestamp, durationMs: 2340 + call * 450, status: 'complete', coverage: ['Synthetic sample telemetry'] }));
    events.push(makeEvent({ eventId: `sample:${traceId}:tool`, sessionId: ideSession, parentEventId: parent, traceId, spanId: 'tool', name: 'Tool · readFile', kind: 'tool', timestamp, updatedAt: timestamp, durationMs: 41, status: 'complete', coverage: ['Tool spans excluded from token totals'] }));
  }
  const date = new Date().toISOString();
  events.push(makeEvent({ eventId: 'sample:missing', sessionId: 'sample:copilot:0', parentEventId: 'sample:missing-parent', traceId: 'sample-trace-0', spanId: 'missing', kind: 'model_call', name: 'Model call · Usage unavailable', timestamp: date, updatedAt: date, status: 'error', coverage: ['Missing parent span', 'Exporter omitted usage'] }));
  return events;
}
