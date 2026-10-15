import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { makeEvent } from '@promptpulse/core';
import { BrowserStore, DEFAULT_SETTINGS } from '@promptpulse/storage';
import { FileStore } from '../packages/storage/src/file';
const event = () => makeEvent({ eventId: 'e', sessionId: 's', inputTokens: 10, measurement: 'telemetry_reported', text: 'sensitive text' });
describe('IndexedDB persistence', () => {
  let store: BrowserStore;
  beforeEach(async () => { store = new BrowserStore(); await store.clear(); await store.setSettings(DEFAULT_SETTINGS); });
  it('survives a new store instance and upserts rather than duplicating', async () => {
    await store.upsert([event()]); await new BrowserStore().upsert([{ ...event(), inputTokens: 20 }]);
    const saved = await store.load(); expect(saved).toHaveLength(1); expect(saved[0].inputTokens).toBe(20); expect(saved[0]).not.toHaveProperty('text');
  });
  it('requires raw-text opt-in and scrubs previously saved text when disabled', async () => {
    await store.setSettings({ ...DEFAULT_SETTINGS, rawText: true }); await store.upsert([event()]);
    expect((await store.load())[0].text).toBe('sensitive text');
    await store.setSettings(DEFAULT_SETTINGS); expect((await store.load())[0]).not.toHaveProperty('text');
  });
  it('enforces retention and deletes all records', async () => {
    await store.setSettings({ ...DEFAULT_SETTINGS, retentionDays: 0 });
    await store.upsert([{ ...event(), timestamp: '2020-01-01T00:00:00Z' }]); expect(await store.load()).toHaveLength(1);
    await store.setSettings(DEFAULT_SETTINGS); expect(await store.load()).toEqual([]);
    await store.upsert([event()]); await store.clear(); expect(await store.load()).toEqual([]);
  });
  it('serializes simultaneous streaming writes without dropping records', async () => {
    await Promise.all([store.upsert([{ ...event(), eventId: '1' }]), new BrowserStore().upsert([{ ...event(), eventId: '2' }])]);
    expect(await store.load()).toHaveLength(2);
  });
});
describe('IDE file persistence', () => {
  it('serializes concurrent updates and stores metadata without text by default', async () => {
    const testRoot = resolve(process.cwd(), '.local');
    await mkdir(testRoot, { recursive: true });
    const directory = await mkdtemp(join(testRoot, 'storage-tests-'));
    try {
      const store = new FileStore(directory);
      await Promise.all([store.upsert([{ ...event(), eventId: '1' }]), store.upsert([{ ...event(), eventId: '2' }])]);
      expect(await new FileStore(directory).load()).toHaveLength(2);
      expect(await readFile(join(directory, 'usage-v1.json'), 'utf8')).not.toContain('sensitive text');
      await store.clear(); expect(await store.load()).toEqual([]);
    } finally {
      if (!resolve(directory).startsWith(join(testRoot, 'storage-tests-'))) throw new Error('Unexpected test cleanup path');
      await rm(directory, { recursive: true, force: true });
    }
  });
});
