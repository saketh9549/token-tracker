import { describe, expect, it } from 'vitest';
import { buildTrace, estimateTokens, exportUsage, importUsage, knownTokens, makeEvent, summarize, upsertEvents, validateEvent, ESTIMATOR } from '@promptpulse/core';

const call = (id: string, input: number | null, output: number | null) => makeEvent({ eventId: id, sessionId: 's', kind: 'model_call', measurement: 'telemetry_reported', inputTokens: input, outputTokens: output });
describe('token accounting', () => {
  it('excludes parent rollups, tools, cache and reasoning subsets', () => {
    const events = [call('1', 1500, 500), call('2', 3500, 1000), call('3', 1000, 500), call('4', 1300, 700), { ...call('parent', 7300, 2700), kind: 'agent' as const }, { ...call('tool', 999, 999), kind: 'tool' as const }];
    events[0].cachedInputTokens = 800; events[1].reasoningTokens = 200;
    expect(summarize(events)).toMatchObject({ reported: 10000, modelCalls: 4, toolCalls: 1, cachedInput: 800, reasoning: 200 });
  });
  it('retains missing fields and distinguishes partial usage from no usage', () => {
    const partial = call('partial', 123, null); const missing = call('missing', null, null);
    expect(knownTokens(missing)).toBeNull(); expect(partial.outputTokens).toBeNull();
    expect(summarize([partial, missing])).toMatchObject({ reported: 123, partialCalls: 1, unknownCalls: 1 });
  });
  it('keeps estimated and reported usage separate, including zero values', () => {
    const estimate = makeEvent({ eventId: 'estimate', sessionId: 'browser', kind: 'message', measurement: 'estimated', inputTokens: 25, estimator: ESTIMATOR });
    expect(summarize([estimate, call('r', 100, 10), call('zero', 0, 0)])).toMatchObject({ reported: 110, estimated: 25, modelCalls: 2, unknownCalls: 0 });
  });
  it('uses reported total when present and deduplicates repeated call IDs', () => {
    const e = { ...call('r', 100, 30), reportedTotalTokens: 150 };
    expect(summarize([e, e]).reported).toBe(150);
  });
});
describe('identity and privacy', () => {
  it('updates streaming/revisited records without changing first observed date', () => {
    const old = { ...call('a', 10, 1), timestamp: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:01Z', text: 'secret' };
    const next = { ...old, timestamp: '2026-10-02T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z', outputTokens: 20 };
    const result = upsertEvents([old], [next]);
    expect(result).toHaveLength(1); expect(result[0].outputTokens).toBe(20); expect(result[0].timestamp).toBe(old.timestamp); expect(result[0]).not.toHaveProperty('text');
  });
  it('ignores older snapshots', () => {
    const old = { ...call('a', 10, 20), updatedAt: '2026-10-02T10:00:00Z' };
    expect(upsertEvents([old], [{ ...old, outputTokens: 1, updatedAt: '2026-10-01T10:00:00Z' }])[0].outputTokens).toBe(20);
  });
  it('round trips exports with metadata only, even if text was opted in locally', () => {
    const event = { ...call('a', 10, 20), text: 'private prompt', arbitrarySecret: 'not allowed' };
    const output = exportUsage([event]); expect(output).not.toContain('private prompt'); expect(output).not.toContain('not allowed');
    expect(importUsage(output)[0]).toMatchObject({ inputTokens: 10, outputTokens: 20 });
  });
  it('rejects negative/fractional usage, unversioned imports, and missing estimators', () => {
    expect(() => validateEvent({ ...call('a', 0, 0), inputTokens: -1 })).toThrow();
    expect(() => validateEvent({ ...call('a', 0, 0), outputTokens: 1.1 })).toThrow();
    expect(() => importUsage('{"events":[]}')).toThrow();
    expect(() => validateEvent({ ...call('a', 0, 0), measurement: 'estimated' })).toThrow();
  });
});
describe('trace trees', () => {
  it('keeps missing spans visible and reports broken parent links', () => {
    const roots = buildTrace([{ ...call('child', 1, 2), parentEventId: 'missing' }]);
    expect(roots[0].diagnostics[0]).toContain('missing');
  });
  it('breaks cycles safely while preserving all events', () => {
    const roots = buildTrace([{ ...call('a', 1, 2), parentEventId: 'b' }, { ...call('b', 1, 2), parentEventId: 'a' }]);
    expect(roots).toHaveLength(2); expect(roots.every(n => n.diagnostics.length)).toBe(true);
  });
});
describe('local tokenizer', () => {
  it('uses a real tokenizer for text, code, unicode, and literal special tokens', () => {
    expect(estimateTokens('hello world')).toBe(2); expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('你好 नमस्ते 👋')).toBeGreaterThan(3);
    expect(() => estimateTokens('<|endoftext|>')).not.toThrow();
  });
});
