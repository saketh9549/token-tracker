import { describe, expect, it, vi } from 'vitest';
import { ESTIMATOR, makeEvent } from '@promptpulse/core';
import { editorHost, estimateSelection, MAX_SELECTION_CHARACTERS, todaySummary } from '../apps/vscode-extension/src/editor-model';

describe('editor selection estimates', () => {
  it('does not read an empty selection', () => {
    const read = vi.fn();
    expect(estimateSelection([{ start: 2, end: 2 }], read)).toEqual({ state: 'empty', characters: 0, tokens: 0 });
    expect(read).not.toHaveBeenCalled();
  });
  it('merges overlapping selections without counting text twice', () => {
    const text = 'hello world';
    const read = vi.fn((start: number, end: number) => text.slice(start, end));
    expect(estimateSelection([{ start: 0, end: 5 }, { start: 11, end: 3 }, { start: 0, end: 5 }], read))
      .toEqual({ state: 'estimated', characters: 11, tokens: 2 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(0, 11);
  });
  it('counts disjoint selections without invented context between them', () => {
    const text = 'hello ignored world';
    expect(estimateSelection([{ start: 0, end: 5 }, { start: 14, end: 19 }], (start, end) => text.slice(start, end)))
      .toEqual({ state: 'estimated', characters: 10, tokens: 2 });
  });
  it('rejects oversized selections before reading or tokenizing their text', () => {
    const read = vi.fn();
    expect(estimateSelection([{ start: 0, end: MAX_SELECTION_CHARACTERS + 1 }], read))
      .toEqual({ state: 'too_large', characters: MAX_SELECTION_CHARACTERS + 1, tokens: null });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('editor usage and host labeling', () => {
  it('detects Antigravity without labeling unrelated editor hosts as Antigravity', () => {
    expect(editorHost('Google Antigravity')).toEqual({ name: 'Google Antigravity', antigravity: true });
    expect(editorHost('Visual Studio Code')).toEqual({ name: 'Visual Studio Code', antigravity: false });
    expect(editorHost('')).toEqual({ name: 'VS Code compatible editor', antigravity: false });
  });
  it('summarizes the local calendar day with reported and estimated usage kept separate', () => {
    const now = new Date(2026, 9, 15, 14);
    const events = [
      makeEvent({ eventId: 'today', sessionId: 's', measurement: 'telemetry_reported', inputTokens: 10, timestamp: new Date(2026, 9, 15, 1).toISOString() }),
      makeEvent({ eventId: 'estimate', sessionId: 's', measurement: 'estimated', estimator: ESTIMATOR, inputTokens: 5, timestamp: new Date(2026, 9, 15, 2).toISOString() }),
      makeEvent({ eventId: 'yesterday', sessionId: 's', measurement: 'telemetry_reported', inputTokens: 99, timestamp: new Date(2026, 9, 14, 23).toISOString() })
    ];
    expect(todaySummary(events, now)).toMatchObject({ reported: 10, estimated: 5, modelCalls: 2 });
  });
});
