import { createRoot } from 'react-dom/client';
import { App } from '@promptpulse/ui';
import type { Settings, Store } from '@promptpulse/storage';
import type { TokenEvent } from '@promptpulse/core';
import '@promptpulse/ui/styles.css';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
let sequence = 0;
const requests = new Map<number, { resolve: (data: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
function request<T>(method: string, args?: unknown): Promise<T> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('Extension host did not respond')); }, 15000);
    requests.set(id, { resolve, reject, timer }); api.postMessage({ id, method, args });
  });
}
window.addEventListener('message', event => {
  const response = event.data;
  if (!response || typeof response.id !== 'number') return;
  const pending = requests.get(response.id); if (!pending) return;
  clearTimeout(pending.timer); requests.delete(response.id);
  if (response.error) pending.reject(new Error(response.error)); else pending.resolve(response.result);
});
const store: Store = {
  load: () => request<TokenEvent[]>('load'), getSettings: () => request<Settings>('getSettings'),
  upsert: events => request<void>('upsert', events), clear: () => request<void>('clear'),
  setSettings: settings => request<void>('setSettings', settings)
};
createRoot(document.getElementById('root')!).render(<App store={store} onExport={(contents, filename) => request<void>('export', { contents, filename })}/>);
