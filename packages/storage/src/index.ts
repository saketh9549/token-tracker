import { openDB, type DBSchema } from 'idb';
import { upsertEvents, validateEvent, withoutText, type TokenEvent } from '@promptpulse/core';

export interface Settings { rawText: boolean; captureEnabled: boolean; retentionDays: number }
export const DEFAULT_SETTINGS: Settings = { rawText: false, captureEnabled: true, retentionDays: 30 };
export interface Store {
  load(): Promise<TokenEvent[]>;
  upsert(events: TokenEvent[]): Promise<void>;
  clear(): Promise<void>;
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;
}
export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings');
  const s = value as Settings;
  if (typeof s.rawText !== 'boolean' || typeof s.captureEnabled !== 'boolean' || ![0, 7, 30, 90, 365].includes(s.retentionDays)) throw new Error('Invalid privacy settings');
  return { rawText: s.rawText, captureEnabled: s.captureEnabled, retentionDays: s.retentionDays };
}
interface Database extends DBSchema {
  events: { key: string; value: TokenEvent };
  settings: { key: string; value: Settings };
}
export class BrowserStore implements Store {
  private database = openDB<Database>('promptpulse-v1', 1, { upgrade(db) { db.createObjectStore('events', { keyPath: 'eventId' }); db.createObjectStore('settings'); } });
  async getSettings(): Promise<Settings> {
    return validateSettings(await (await this.database).get('settings', 'privacy') ?? DEFAULT_SETTINGS);
  }
  async load(): Promise<TokenEvent[]> {
    const db = await this.database;
    const tx = db.transaction(['events', 'settings'], 'readwrite');
    const settings = await tx.objectStore('settings').get('privacy') ?? DEFAULT_SETTINGS;
    const all = await tx.objectStore('events').getAll();
    const cutoff = Date.now() - settings.retentionDays * 86_400_000;
    const visible: TokenEvent[] = [];
    for (const event of all) {
      if (settings.retentionDays && Date.parse(event.timestamp) < cutoff) await tx.objectStore('events').delete(event.eventId);
      else visible.push(settings.rawText ? event : withoutText(event));
    }
    await tx.done;
    return visible.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  async upsert(events: TokenEvent[]): Promise<void> {
    const valid = events.map(validateEvent);
    const db = await this.database;
    const tx = db.transaction(['events', 'settings'], 'readwrite');
    const settings = await tx.objectStore('settings').get('privacy') ?? DEFAULT_SETTINGS;
    for (const event of valid) {
      if (settings.retentionDays && Date.parse(event.timestamp) < Date.now() - settings.retentionDays * 86_400_000) continue;
      const old = await tx.objectStore('events').get(event.eventId);
      const merged = upsertEvents(old ? [old] : [], [event], settings.rawText)[0];
      await tx.objectStore('events').put(merged);
    }
    await tx.done;
  }
  async clear(): Promise<void> { await (await this.database).clear('events'); }
  async setSettings(settings: Settings): Promise<void> {
    const valid = validateSettings(settings);
    const db = await this.database;
    const tx = db.transaction(['settings', 'events'], 'readwrite');
    await tx.objectStore('settings').put(valid, 'privacy');
    const records = await tx.objectStore('events').getAll();
    for (const event of records) {
      if (valid.retentionDays && Date.parse(event.timestamp) < Date.now() - valid.retentionDays * 86_400_000) await tx.objectStore('events').delete(event.eventId);
      else if (!valid.rawText) await tx.objectStore('events').put(withoutText(event));
    }
    await tx.done;
  }
}
