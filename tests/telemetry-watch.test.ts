import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readTelemetryFile, TelemetryWatch, validTelemetrySource, type TelemetrySourceState } from '../apps/vscode-extension/src/telemetry-watch';

const source = resolve('copilot.jsonl');
const span = JSON.stringify({ traceId: 'trace', spanId: 'call', name: 'chat', startTime: '2026-10-15T10:00:00Z', endTime: '2026-10-15T10:00:01Z', attributes: { 'gen_ai.usage.input_tokens': 12, 'gen_ai.usage.output_tokens': 3 } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { vi.useRealTimers(); });

describe('explicit telemetry source', () => {
  it('accepts only absolute JSON/JSONL source paths', () => {
    expect(validTelemetrySource(source)).toBe(true);
    expect(validTelemetrySource(resolve('export.JSON'))).toBe(true);
    expect(validTelemetrySource('relative.jsonl')).toBe(false);
    expect(validTelemetrySource(resolve('history.db'))).toBe(false);
    expect(validTelemetrySource(null)).toBe(false);
  });
  it('bounds file bytes and closes the source after oversized reads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptpulse-watch-'));
    const filename = join(directory, 'export.jsonl');
    try {
      await writeFile(filename, 'oversized');
      await expect(readTelemetryFile(filename, 4)).rejects.toThrow('exceeds');
      await writeFile(filename, 'ok');
      await expect(readTelemetryFile(filename, 4)).resolves.toBe('ok');
    } finally {
      await unlink(filename);
      await rmdir(directory);
    }
  });
});

describe('telemetry watching lifecycle', () => {
  it('coalesces changes while reading and avoids reimporting identical snapshots', async () => {
    vi.useFakeTimers();
    const first = deferred<string>();
    let changed!: () => void;
    const read = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(span);
    const consume = vi.fn().mockResolvedValue(undefined);
    const watcher = new TelemetryWatch({ read, consume, onState: vi.fn(), subscribe(_filename, notify) { changed = notify; return { dispose() {} }; } });
    try {
      await watcher.start(source);
      await vi.runAllTimersAsync();
      expect(read).toHaveBeenCalledTimes(1);
      changed(); changed(); changed();
      await vi.runAllTimersAsync();
      expect(read).toHaveBeenCalledTimes(1);
      first.resolve(span);
      await vi.runAllTimersAsync();
      expect(read).toHaveBeenCalledTimes(2);
      expect(consume).toHaveBeenCalledTimes(1);
      expect(consume.mock.calls[0][0][0]).toMatchObject({ eventId: 'otel:trace:call', inputTokens: 12, outputTokens: 3 });
    } finally { await watcher.stop(); watcher.dispose(); }
  });
  it('discards an in-flight read after Stop Watching', async () => {
    vi.useFakeTimers();
    const contents = deferred<string>();
    const consume = vi.fn().mockResolvedValue(undefined);
    const states: TelemetrySourceState[] = [];
    const dispose = vi.fn();
    const watcher = new TelemetryWatch({ read: () => contents.promise, consume, onState: state => states.push(state), subscribe: () => ({ dispose }) });
    await watcher.start(source);
    await vi.runAllTimersAsync();
    const stopped = watcher.stop();
    contents.resolve(span);
    await stopped;
    expect(consume).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ status: 'stopped' });
    expect(states.at(-1)).not.toHaveProperty('source');
    watcher.dispose();
  });
  it('waits for an already-started storage write before stop completes', async () => {
    vi.useFakeTimers();
    const written = deferred<void>();
    const consume = vi.fn(() => written.promise);
    const watcher = new TelemetryWatch({ read: async () => span, consume, onState: vi.fn(), subscribe: () => ({ dispose() {} }) });
    await watcher.start(source);
    await vi.runAllTimersAsync();
    expect(consume).toHaveBeenCalledTimes(1);
    let done = false;
    const stopped = watcher.stop().then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    written.resolve(undefined);
    await stopped;
    expect(done).toBe(true);
    watcher.dispose();
  });
  it('keeps read errors visible with the explicitly selected source', async () => {
    vi.useFakeTimers();
    const states: TelemetrySourceState[] = [];
    const consume = vi.fn();
    const watcher = new TelemetryWatch({ read: async () => { throw new Error('Permission denied'); }, consume, onState: state => states.push(state), subscribe: () => ({ dispose() {} }) });
    await watcher.start(source);
    await vi.runAllTimersAsync();
    expect(states.at(-1)).toMatchObject({ status: 'error', source, detail: 'Permission denied' });
    expect(consume).not.toHaveBeenCalled();
    await watcher.stop(); watcher.dispose();
  });
  it('does not claim automatic watching recovered when only a manual read succeeds', async () => {
    vi.useFakeTimers();
    const states: TelemetrySourceState[] = [];
    let failed!: (error: Error) => void;
    const watcher = new TelemetryWatch({ read: async () => span, consume: async () => {}, onState: state => states.push(state), subscribe(_filename, _changed, onError) { failed = onError; return { dispose() {} }; } });
    await watcher.start(source);
    await vi.runAllTimersAsync();
    failed(new Error('Notifications stopped'));
    watcher.refresh(0);
    await vi.runAllTimersAsync();
    expect(states.at(-1)).toMatchObject({ status: 'error', source });
    expect(states.at(-1)?.detail).toContain('Choose the source again');
    await watcher.stop(); watcher.dispose();
  });
});
