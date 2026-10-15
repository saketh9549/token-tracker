import { ESTIMATOR, estimateTokens, makeEvent, type TokenEvent } from '@promptpulse/core';

export interface MessageSnapshot { id: string; role: 'user' | 'assistant'; text: string; streaming: boolean }
export interface ChatGPTSnapshot { sessionId: string | null; messages: MessageSnapshot[]; health: string }
export function readChatGPT(document: Document, url: string): ChatGPTSnapshot {
  const location = new URL(url);
  if (location.hostname !== 'chatgpt.com') return { sessionId: null, messages: [], health: 'Unsupported origin' };
  const conversation = location.pathname.match(/\/c\/([^/]+)/)?.[1];
  if (!conversation) return { sessionId: null, messages: [], health: 'Waiting for a saved conversation URL' };
  const elements = [...document.querySelectorAll<HTMLElement>('[data-message-author-role]')];
  const messages: MessageSnapshot[] = [];
  let skipped = 0;
  for (const element of elements) {
    const role = element.dataset.messageAuthorRole;
    if (role !== 'user' && role !== 'assistant') continue;
    const turn = element.closest<HTMLElement>('article[data-testid^="conversation-turn-"], [data-turn-id]');
    // Positional conversation-turn indexes can change during pagination or edits.
    const stableId = element.dataset.messageId || turn?.dataset.turnId;
    if (!stableId) { skipped++; continue; }
    const content = element.querySelector<HTMLElement>(role === 'assistant' ? '.markdown' : '.whitespace-pre-wrap') ?? element;
    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button, svg, script, style, [aria-hidden="true"]').forEach(node => node.remove());
    const blockTags = new Set(['P', 'DIV', 'PRE', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'TR']);
    const visibleText = (node: Node): string => {
      if (node.nodeType === 3) return node.textContent ?? '';
      if (node.nodeType !== 1) return '';
      const tag = (node as Element).tagName;
      if (tag === 'BR') return '\n';
      return [...node.childNodes].map(visibleText).join('') + (blockTags.has(tag) ? '\n' : tag === 'TD' || tag === 'TH' ? '\t' : '');
    };
    const text = visibleText(clone).replace(/\n{3,}/g, '\n\n').trim();
    if (!text) continue;
    messages.push({ id: stableId, role, text, streaming: false });
  }
  if (document.querySelector('[data-testid="stop-button"], button[aria-label="Stop generating"]')) {
    const lastAssistant = messages.filter(m => m.role === 'assistant').at(-1);
    if (lastAssistant) lastAssistant.streaming = true;
  }
  return { sessionId: `chatgpt:${conversation}`, messages,
    health: skipped ? `${skipped} messages skipped: stable identity unavailable` : messages.length ? 'Collecting visible messages; hidden context unavailable' : 'No supported message markup found; coverage unavailable' };
}
export function estimateMessage(sessionId: string, message: MessageSnapshot, saveText = false, now = new Date().toISOString()): TokenEvent {
  const eventId = `${sessionId}:${message.id}:${message.role}`;
  return makeEvent({ eventId, sessionId, interactionId: message.id, platform: 'chatgpt', kind: 'message',
    name: message.role === 'user' ? 'Visible prompt' : 'Visible response', measurement: 'estimated',
    timestamp: now, updatedAt: now, inputTokens: message.role === 'user' ? estimateTokens(message.text) : null,
    outputTokens: message.role === 'assistant' ? estimateTokens(message.text) : null,
    estimator: ESTIMATOR, status: message.streaming ? 'in_progress' : 'complete',
    coverage: ['Visible text only', 'Hidden instructions, history assembly, reasoning, files, and tools unavailable', 'Regenerated branches may be retained as distinct observed messages'],
    ...(saveText ? { text: message.text } : {}) });
}
