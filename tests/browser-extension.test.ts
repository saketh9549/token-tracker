import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { estimateTokens, upsertEvents, type TokenEvent } from '@promptpulse/core';
import { DEFAULT_SETTINGS, type Settings, type Store } from '@promptpulse/storage';
import { captureMessages, collectorState } from '../apps/browser-extension/src/collector-service';
import { createOverlay, readComposer } from '../apps/browser-extension/src/overlay';

function memoryStore(): Store {
  let events: TokenEvent[] = []; let settings: Settings = { ...DEFAULT_SETTINGS };
  return {
    load: async () => [...events], getSettings: async () => ({ ...settings }),
    upsert: async incoming => { events = upsertEvents(events, incoming, settings.rawText); },
    clear: async () => { events = []; }, setSettings: async next => { settings = { ...next }; }
  };
}
describe('browser extension collection', () => {
  it('returns live conversation and composer estimates without saving drafts or raw messages', async () => {
    const store = memoryStore();
    const result = await captureMessages(store, 'chatgpt:c1', { messages: [{ id: 'm1', role: 'user', text: 'hello world', streaming: false }], draft: 'never persist this draft', health: 'Visible text only' });
    expect(result.state).toMatchObject({ estimatedTokens: 2, inputTokens: 2, outputTokens: null, messageCount: 1, draftTokens: estimateTokens('never persist this draft') });
    expect(JSON.stringify(await store.load())).not.toContain('never persist');
    expect((await store.load())[0]).not.toHaveProperty('text');
  });
  it('updates a streaming reply once and preserves a separate observed prompt total', async () => {
    const store = memoryStore();
    await captureMessages(store, 'chatgpt:c1', { messages: [{ id: 'p', role: 'user', text: 'hello world', streaming: false }, { id: 'r', role: 'assistant', text: 'hello', streaming: true }] });
    const result = await captureMessages(store, 'chatgpt:c1', { messages: [{ id: 'r', role: 'assistant', text: 'hello world', streaming: false }] });
    expect(result.state).toMatchObject({ inputTokens: 2, outputTokens: 2, estimatedTokens: 4, messageCount: 2 });
    expect(await store.load()).toHaveLength(2);
  });
  it('does not record a new-chat draft as usage and keeps unobserved counts unknown', async () => {
    const store = memoryStore();
    const result = await captureMessages(store, null, { messages: [], draft: 'hello world' });
    expect(result.state).toMatchObject({ draftTokens: 2, estimatedTokens: null, inputTokens: null, outputTokens: null, messageCount: 0 });
    expect(await store.load()).toEqual([]);
  });
  it('honors pause and does not expose stored usage after permission is removed', async () => {
    const store = memoryStore();
    await captureMessages(store, 'chatgpt:c1', { messages: [{ id: 'p', role: 'user', text: 'hello', streaming: false }] });
    await store.setSettings({ ...DEFAULT_SETTINGS, captureEnabled: false });
    const paused = await captureMessages(store, 'chatgpt:c1', { messages: [{ id: 'r', role: 'assistant', text: 'world', streaming: false }], draft: 'private draft' });
    expect(paused.accepted).toBe(false); expect(paused.state.draftTokens).toBeNull(); expect(await store.load()).toHaveLength(1);
    expect(await collectorState(store, 'chatgpt:c1', false, '')).toMatchObject({ permitted: false, estimatedTokens: null, messageCount: 0 });
  });
});
describe('ChatGPT in-page controls', () => {
  it('reads both editor-style and textarea composers, including a missing composer', () => {
    expect(readComposer(new JSDOM('<div id="prompt-textarea" contenteditable="true">Draft text</div>').window.document)).toBe('Draft text');
    expect(readComposer(new JSDOM('<textarea id="prompt-textarea">Textarea draft</textarea>').window.document)).toBe('Textarea draft');
    expect(readComposer(new JSDOM('').window.document)).toBeNull();
  });
  it('shows a scoped meter on the chatbot page with working pause/history controls', () => {
    const document = new JSDOM('<main>Chatbot</main>').window.document;
    const toggleCapture = vi.fn(); const openHistory = vi.fn();
    const overlay = createOverlay(document, { toggleCapture, openHistory });
    const shadow = document.getElementById('promptpulse-meter')!.shadowRoot!;
    overlay.update({ enabled: true, permitted: true, health: '<img src=x onerror=alert(1)>', estimatedTokens: 42, inputTokens: 12, outputTokens: 30, messageCount: 2, draftTokens: 5 });
    expect(shadow.getElementById('pill-count')!.textContent).toContain('Draft · 5');
    expect(shadow.getElementById('total')!.textContent).toBe('42'); expect(shadow.querySelector('img')).toBeNull();
    (shadow.querySelector('.pill') as HTMLButtonElement).click(); expect((shadow.querySelector('.panel') as HTMLElement).hidden).toBe(false);
    (shadow.getElementById('pause') as HTMLButtonElement).click(); (shadow.getElementById('history') as HTMLButtonElement).click();
    expect(toggleCapture).toHaveBeenCalledOnce(); expect(openHistory).toHaveBeenCalledOnce();
    overlay.update({ enabled: false, permitted: true, health: 'Paused', estimatedTokens: null, inputTokens: null, outputTokens: null, messageCount: 0, draftTokens: null });
    expect(shadow.getElementById('total')!.textContent).toBe('—'); expect(shadow.getElementById('pause')!.textContent).toBe('Resume');
    overlay.destroy(); expect(document.getElementById('promptpulse-meter')).toBeNull();
  });
});
