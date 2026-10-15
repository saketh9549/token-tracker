import { estimateTokens, summarize, type Summary, type TokenEvent } from '@promptpulse/core';

export const MAX_SELECTION_CHARACTERS = 100_000;
export interface OffsetRange { start: number; end: number }
export type SelectionEstimate =
  | { state: 'empty'; characters: 0; tokens: 0 }
  | { state: 'too_large'; characters: number; tokens: null }
  | { state: 'estimated'; characters: number; tokens: number };

export function editorHost(appName: string): { name: string; antigravity: boolean } {
  return { name: appName.trim() || 'VS Code compatible editor', antigravity: /antigravity/i.test(appName) };
}

/** Treat overlapping cursors as a union, and never read text above the live-count limit. */
export function estimateSelection(ranges: OffsetRange[], readRange: (start: number, end: number) => string): SelectionEstimate {
  const merged: OffsetRange[] = [];
  for (const range of ranges.map(({ start, end }) => ({ start: Math.min(start, end), end: Math.max(start, end) }))
    .filter(range => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.start >= 0 && range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const characters = merged.reduce((total, range) => total + range.end - range.start, 0);
  if (!characters) return { state: 'empty', characters: 0, tokens: 0 };
  if (characters > MAX_SELECTION_CHARACTERS) return { state: 'too_large', characters, tokens: null };
  // Disjoint selections are counted separately; no invented separator enters the estimate.
  return { state: 'estimated', characters, tokens: merged.reduce((total, range) => total + estimateTokens(readRange(range.start, range.end)), 0) };
}

export function todaySummary(events: TokenEvent[], now = new Date()): Summary {
  return summarize(events.filter(event => new Date(event.timestamp).toDateString() === now.toDateString()));
}
