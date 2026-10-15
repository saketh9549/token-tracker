import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { upsertEvents, validateEvent, withoutText, type TokenEvent } from '@promptpulse/core';
import { DEFAULT_SETTINGS, validateSettings, type Settings, type Store } from './index';

export class FileStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  private async read(): Promise<{ events: TokenEvent[]; settings: Settings }> {
    try {
      const data = JSON.parse(await readFile(join(this.directory, 'usage-v1.json'), 'utf8'));
      return { events: data.events.map(validateEvent), settings: validateSettings(data.settings) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { events: [], settings: { ...DEFAULT_SETTINGS } };
      throw error;
    }
  }
  private async write(data: { events: TokenEvent[]; settings: Settings }) {
    await mkdir(this.directory, { recursive: true });
    const filename = join(this.directory, 'usage-v1.json');
    await writeFile(`${filename}.tmp`, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
    await rename(`${filename}.tmp`, filename);
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(task);
    this.queue = operation.catch(() => {});
    return operation;
  }
  private retained(events: TokenEvent[], settings: Settings) {
    return events.filter(e => !settings.retentionDays || Date.parse(e.timestamp) >= Date.now() - settings.retentionDays * 86_400_000).map(e => settings.rawText ? e : withoutText(e));
  }
  async load() {
    return this.serial(async () => {
      const data = await this.read();
      const retained = this.retained(data.events, data.settings);
      if (retained.length !== data.events.length) await this.write({ ...data, events: retained });
      return retained;
    });
  }
  async getSettings() { return this.serial(async () => (await this.read()).settings); }
  async setSettings(settings: Settings) {
    return this.serial(async () => {
      const valid = validateSettings(settings); const data = await this.read();
      await this.write({ settings: valid, events: this.retained(data.events, valid) });
    });
  }
  async upsert(events: TokenEvent[]) {
    const valid = events.map(validateEvent);
    return this.serial(async () => {
      const data = await this.read();
      await this.write({ ...data, events: this.retained(upsertEvents(data.events, valid, data.settings.rawText), data.settings) });
    });
  }
  async clear() { return this.serial(async () => { const data = await this.read(); await this.write({ ...data, events: [] }); }); }
}
