import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { estimateMessage, importTelemetry, readChatGPT } from '@promptpulse/adapters';
import { buildTrace, summarize, upsertEvents } from '@promptpulse/core';
const fixture = readFileSync('fixtures/telemetry/copilot-sample.jsonl', 'utf8');
const html = readFileSync('fixtures/conversations/chatgpt.html', 'utf8');
describe('Copilot telemetry', () => {
  it('parses the current file-exporter shape, subagents, hrtime and token subsets', () => {
    const result = importTelemetry(fixture);
    expect(result.events).toHaveLength(7); expect(result.warnings).toEqual([]);
    expect(summarize(result.events)).toMatchObject({ reported: 10000, modelCalls: 4, toolCalls: 1 });
    const tree = buildTrace(result.events); expect(tree).toHaveLength(1);
    expect(tree[0].children.find(n => n.event.kind === 'tool')?.children[0].event.kind).toBe('agent');
    expect(result.events.find(e => e.kind === 'tool')?.durationMs).toBe(50);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('supports OTLP JSON envelope typed attributes and nanosecond timestamps', () => {
    const input = { resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: 't', spanId: 's', name: 'chat', startTimeUnixNano: '1791972000000000000', endTimeUnixNano: '1791972001000000000', attributes: [{ key: 'gen_ai.operation.name', value: { stringValue: 'chat' } }, { key: 'gen_ai.usage.input_tokens', value: { intValue: '100' } }, { key: 'gen_ai.usage.output_tokens', value: { intValue: '20' } }] }] }] }] };
    const result = importTelemetry(JSON.stringify(input));
    expect(result.events[0].durationMs).toBe(1000); expect(summarize(result.events).reported).toBe(120);
  });
  it('keeps malformed lines, missing fields, unsupported signals, and invalid counts visible', () => {
    const input = ['not json', '{"metrics":[]}', JSON.stringify({ traceId: 't', spanId: 's', name: 'chat', startTime: [1791972000, 0], attributes: { 'gen_ai.usage.input_tokens': -2 } })].join('\n');
    const result = importTelemetry(input); expect(result.events).toHaveLength(1); expect(result.skipped).toBe(2);
    expect(result.events[0].inputTokens).toBeNull(); expect(result.events[0].measurement).toBe('unknown'); expect(result.warnings.length).toBeGreaterThan(1);
  });
  it('does not double count repeated imports or retries with different span IDs', () => {
    const first = importTelemetry(fixture).events;
    expect(upsertEvents(first, first)).toHaveLength(7);
    const retry = { ...first.find(e => e.kind === 'model_call')!, eventId: 'otel:retry:new', spanId: 'retry', inputTokens: 10, outputTokens: 5 };
    expect(summarize(upsertEvents(first, [retry])).reported).toBe(10015);
  });
  it('rejects spans without timestamps instead of silently attributing them to today', () => {
    const result = importTelemetry(JSON.stringify({ traceId: 't', spanId: 's', name: 'chat', attributes: {} }));
    expect(result.events).toHaveLength(0); expect(result.warnings[0]).toContain('timestamp');
  });
  it('inherits conversation IDs when only parent agents emit them', () => {
    const lines = fixture.trim().split('\n').map(line => JSON.parse(line));
    for (const span of lines) if (span.attributes['gen_ai.operation.name'] !== 'invoke_agent') delete span.attributes['gen_ai.conversation.id'];
    const result = importTelemetry(lines.map(line => JSON.stringify(line)).join('\n'));
    expect(new Set(result.events.map(e => e.sessionId))).toEqual(new Set(['copilot:fixture-session']));
  });
});
describe('ChatGPT visible DOM', () => {
  const url = 'https://chatgpt.com/c/conversation-123';
  it('captures visible turns with stable identities and excludes controls', () => {
    const snapshot = readChatGPT(new JSDOM(html).window.document, url);
    expect(snapshot.messages).toHaveLength(2); expect(snapshot.messages[1].text).toContain('It accepts a value.\nThen');
    expect(snapshot.messages[1].text).not.toContain('Copy'); expect(snapshot.sessionId).toBe('chatgpt:conversation-123');
  });
  it('updates streamed text and retains one event after reopening history', () => {
    const dom = new JSDOM(html); const document = dom.window.document;
    const initial = readChatGPT(document, url).messages.map(m => estimateMessage('chatgpt:conversation-123', m));
    document.querySelector('.markdown')!.textContent += ' More streamed content.';
    document.body.insertAdjacentHTML('beforeend', '<button data-testid="stop-button">Stop</button>');
    const next = readChatGPT(document, url).messages.map(m => estimateMessage('chatgpt:conversation-123', m));
    expect(next[1].status).toBe('in_progress');
    const records = upsertEvents(initial, next); expect(records).toHaveLength(2); expect(records[1]).not.toHaveProperty('text');
    expect(upsertEvents(records, next)).toHaveLength(2);
  });
  it('updates edited prompts and keeps regenerated messages distinct', () => {
    const dom = new JSDOM(html); const document = dom.window.document;
    const initial = readChatGPT(document, url).messages.map(m => estimateMessage('s', m));
    document.querySelector('.whitespace-pre-wrap')!.textContent = 'Updated prompt with more content';
    document.querySelector('[data-message-id="assistant-1"]')!.setAttribute('data-message-id', 'regeneration-2');
    const updates = readChatGPT(document, url).messages.map(m => estimateMessage('s', m));
    const records = upsertEvents(initial, updates); expect(records).toHaveLength(3);
    expect(records.find(e => e.eventId.includes('user-1'))?.inputTokens).toBe(updates[0].inputTokens);
  });
  it('fails visibly on unsupported origins, new-chat URLs, and missing stable identity', () => {
    const document = new JSDOM('<div data-message-author-role="assistant">Test</div>').window.document;
    expect(readChatGPT(document, 'https://claude.ai/c/abc').health).toContain('Unsupported');
    expect(readChatGPT(document, 'https://chatgpt.com/').health).toContain('Waiting');
    expect(readChatGPT(document, url).health).toContain('skipped');
  });
  it('does not treat a positional DOM turn index as a stable message ID', () => {
    const document = new JSDOM('<article data-testid="conversation-turn-0"><div data-message-author-role="user">Prompt</div></article>').window.document;
    const result = readChatGPT(document, url);
    expect(result.messages).toHaveLength(0); expect(result.health).toContain('stable identity');
  });
});
