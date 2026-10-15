import { watch } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { importTelemetry } from '@promptpulse/adapters';
import type { TokenEvent } from '@promptpulse/core';

export const MAX_TELEMETRY_BYTES = 20_000_000;
export interface TelemetrySourceState {
  status: 'stopped' | 'watching' | 'reading' | 'error';
  source?: string;
  detail: string;
  lastImportedAt?: string;
}
interface WatchHandle { dispose(): void }
interface WatchOptions {
  consume(events: TokenEvent[]): Promise<void>;
  onState(state: TelemetrySourceState): void;
  read?: (filename: string) => Promise<string>;
  subscribe?: (filename: string, changed: () => void, failed: (error: Error) => void) => WatchHandle;
  debounceMs?: number;
}

export function validTelemetrySource(filename: unknown): filename is string {
  return typeof filename === 'string' && filename.length < 32_768 && isAbsolute(filename) && ['.jsonl', '.json'].includes(extname(filename).toLowerCase());
}

/** Bound the bytes actually read, including when the exporter appends during the read. */
export async function readTelemetryFile(filename: string, limit = MAX_TELEMETRY_BYTES): Promise<string> {
  const file = await open(filename, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('Choose a regular JSONL telemetry file.');
    if (info.size > limit) throw new Error('Telemetry file exceeds 20 MB. Rotate the exporter file or choose a smaller file.');
    const chunks: Buffer[] = [];
    let bytes = 0;
    while (bytes <= limit) {
      const chunk = Buffer.allocUnsafe(Math.min(65_536, limit + 1 - bytes));
      const result = await file.read(chunk, 0, chunk.length, null);
      if (!result.bytesRead) break;
      chunks.push(chunk.subarray(0, result.bytesRead));
      bytes += result.bytesRead;
    }
    if (bytes > limit) throw new Error('Telemetry file exceeds 20 MB. Rotate the exporter file or choose a smaller file.');
    return Buffer.concat(chunks, bytes).toString('utf8');
  } finally { await file.close(); }
}

function subscribeToSource(filename: string, changed: () => void, failed: (error: Error) => void): WatchHandle {
  // Watching the directory also catches an exporter replacing or rotating the selected file.
  const sourceName = basename(filename);
  const watcher = watch(dirname(filename), { persistent: false }, (_event, name) => {
    if (name === null || (process.platform === 'win32' ? name.toString().toLowerCase() === sourceName.toLowerCase() : name.toString() === sourceName)) changed();
  });
  watcher.on('error', failed);
  return { dispose() { watcher.close(); } };
}

/** One source, one read/import at a time. A stopped or replaced source cannot queue a later write. */
export class TelemetryWatch {
  private source?: string;
  private subscription?: WatchHandle;
  private timer?: ReturnType<typeof setTimeout>;
  private running: Promise<void> = Promise.resolve();
  private busy = false;
  private pending = false;
  private generation = 0;
  private disposed = false;
  private fingerprint?: string;
  private lastImportedAt?: string;
  private watchFailure?: string;
  constructor(private readonly options: WatchOptions) {}

  async start(filename: string): Promise<void> {
    if (!validTelemetrySource(filename)) throw new Error('Choose a local .jsonl or .json telemetry file.');
    await this.stop();
    if (this.disposed) return;
    this.source = filename;
    const generation = this.generation;
    try {
      this.subscription = (this.options.subscribe ?? subscribeToSource)(filename, () => this.refresh(), error => {
        if (this.current(generation)) {
          this.watchFailure = `File watcher failed: ${error.message}. Choose the source again to restart watching.`;
          this.subscription?.dispose(); this.subscription = undefined;
          this.report('error', 'Automatic change notifications are unavailable.');
        }
      });
      this.report('watching', 'Waiting for the first telemetry scan.');
      this.refresh(0);
    } catch (error) {
      this.watchFailure = `File watcher failed: ${error instanceof Error ? error.message : String(error)}. Choose the source again to restart watching.`;
      this.report('error', 'Automatic change notifications could not start.');
      throw error;
    }
  }

  refresh(delay = this.options.debounceMs ?? 400): void {
    if (!this.source || this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; this.read(); }, delay);
  }

  async stop(): Promise<void> {
    this.release();
    if (!this.disposed) this.options.onState({ status: 'stopped', detail: 'Choose a telemetry file to enable automatic updates.' });
    // Wait for an already-started store write before deletion or a replacement source proceeds.
    await this.running;
  }

  dispose(): void { this.disposed = true; this.release(); }

  private release(): void {
    this.generation++;
    this.subscription?.dispose(); this.subscription = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined; this.pending = false; this.source = undefined;
    this.fingerprint = undefined; this.lastImportedAt = undefined; this.watchFailure = undefined;
  }
  private current(generation: number): boolean { return !this.disposed && !!this.source && generation === this.generation; }
  private report(status: TelemetrySourceState['status'], detail: string): void {
    if (!this.disposed) this.options.onState({ status: this.watchFailure ? 'error' : status, source: this.source, detail: this.watchFailure ? `${detail} ${this.watchFailure}` : detail, lastImportedAt: this.lastImportedAt });
  }
  private read(): void {
    if (!this.source || this.disposed) return;
    if (this.busy) { this.pending = true; return; }
    const source = this.source;
    const generation = this.generation;
    this.busy = true;
    this.running = this.readAndImport(source, generation).catch(error => {
      if (this.current(generation)) this.report('error', error instanceof Error ? error.message : String(error));
    }).finally(() => {
      this.busy = false;
      if (this.pending && this.current(generation)) { this.pending = false; this.refresh(0); }
    });
  }
  private async readAndImport(source: string, generation: number): Promise<void> {
    this.report('reading', 'Reading the selected telemetry file.');
    const contents = await (this.options.read ?? readTelemetryFile)(source);
    if (!this.current(generation)) return;
    const fingerprint = createHash('sha256').update(contents).digest('hex');
    if (fingerprint === this.fingerprint) { this.report('watching', 'No new telemetry since the last scan.'); return; }
    const parsed = importTelemetry(contents);
    if (!parsed.events.length) {
      this.report(parsed.warnings.length ? 'error' : 'watching', parsed.warnings[0] ?? (contents.trim() ? `No supported spans yet; ${parsed.skipped} unsupported records skipped.` : 'The export file is empty; waiting for spans.'));
      return;
    }
    // Recheck before storage; stop() waits for an import already in progress to finish.
    if (!this.current(generation)) return;
    await this.options.consume(parsed.events);
    if (!this.current(generation)) return;
    this.fingerprint = fingerprint;
    this.lastImportedAt = new Date().toISOString();
    this.report('watching', `Processed ${parsed.events.length} unique spans; ${parsed.skipped} skipped; ${parsed.warnings.length} warnings.${parsed.warnings.length ? ` ${parsed.warnings[0]}` : ''} Retention applies.`);
  }
}
