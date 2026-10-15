import { estimateMessage, type MessageSnapshot } from '@promptpulse/adapters';
import { estimateTokens, knownTokens, type TokenEvent } from '@promptpulse/core';
import type { Store } from '@promptpulse/storage';

export interface CollectorState {
  enabled: boolean; permitted: boolean; health: string;
  estimatedTokens: number | null; inputTokens: number | null; outputTokens: number | null;
  messageCount: number; draftTokens: number | null;
}
export function conversationCounts(events: TokenEvent[], sessionId: string | null) {
  const messages = events.filter(event => sessionId && event.sessionId === sessionId && event.kind === 'message' && event.measurement === 'estimated');
  const input = messages.filter(event => event.inputTokens !== null);
  const output = messages.filter(event => event.outputTokens !== null);
  return {
    estimatedTokens: messages.length ? messages.reduce((sum, event) => sum + (knownTokens(event) ?? 0), 0) : null,
    inputTokens: input.length ? input.reduce((sum, event) => sum + event.inputTokens!, 0) : null,
    outputTokens: output.length ? output.reduce((sum, event) => sum + event.outputTokens!, 0) : null,
    messageCount: messages.length
  };
}
export async function collectorState(store: Store, sessionId: string | null, permitted: boolean, health: string): Promise<CollectorState> {
  const settings = await store.getSettings();
  return { enabled: settings.captureEnabled, permitted,
    health: !permitted ? 'ChatGPT site access is disabled' : !settings.captureEnabled ? 'Collection is paused' : health,
    ...conversationCounts(permitted ? await store.load() : [], sessionId), draftTokens: null };
}
export async function captureMessages(store: Store, sessionId: string | null, payload: { messages?: unknown; draft?: unknown; health?: unknown }): Promise<{ accepted: boolean; state: CollectorState }> {
  const settings = await store.getSettings();
  const health = typeof payload.health === 'string' ? payload.health.slice(0, 200) : 'Adapter state unavailable';
  if (!settings.captureEnabled) return { accepted: false, state: await collectorState(store, sessionId, true, health) };
  const snapshots = Array.isArray(payload.messages) ? (payload.messages as MessageSnapshot[]).filter(message =>
    message && typeof message.id === 'string' && message.id.length > 0 && message.id.length < 300 &&
    ['user', 'assistant'].includes(message.role) && typeof message.text === 'string' && message.text.length <= 1_000_000 && typeof message.streaming === 'boolean') : [];
  if (sessionId) {
    const events = snapshots.slice(0, 200).map(message => estimateMessage(sessionId, message, settings.rawText));
    if (!(await store.getSettings()).captureEnabled) return { accepted: false, state: await collectorState(store, sessionId, true, health) };
    await store.upsert(events);
  }
  const state = await collectorState(store, sessionId, true, health);
  // A composer draft is inspected in memory; it never becomes a usage record.
  state.draftTokens = typeof payload.draft === 'string' && payload.draft.length <= 100_000 ? estimateTokens(payload.draft) : null;
  return { accepted: true, state };
}
