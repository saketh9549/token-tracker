import { BrowserStore } from '@promptpulse/storage';
import { captureMessages, collectorState } from './collector-service';

const store = new BrowserStore();
const origins = ['https://chatgpt.com/*'];
let registration: Promise<unknown> = Promise.resolve();
function syncPermission() {
  const work = registration.catch(() => {}).then(async () => {
    const enabled = await chrome.permissions.contains({ origins });
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: ['promptpulse-chatgpt'] });
    if (!enabled && registered.length) await chrome.scripting.unregisterContentScripts({ ids: ['promptpulse-chatgpt'] });
    if (enabled && !registered.length) await chrome.scripting.registerContentScripts([{ id: 'promptpulse-chatgpt', matches: origins, js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
  });
  registration = work; return work;
}
async function notifyTabs() {
  const tabs = await chrome.tabs.query({ url: origins });
  await Promise.allSettled(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, { type: 'RESET_CAPTURE' }) : Promise.resolve()));
}
chrome.runtime.onInstalled.addListener(() => { void syncPermission().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { void syncPermission().catch(() => {}); });
chrome.permissions.onAdded.addListener(() => { void syncPermission().catch(() => {}); });
chrome.permissions.onRemoved.addListener(() => { void syncPermission().catch(() => {}); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const supported = ['CAPTURE', 'GET_COLLECTOR_STATE', 'SET_COLLECTOR_ENABLED', 'OPEN_OBSERVATORY', 'CONNECT_CHATGPT'];
  if (!supported.includes(message?.type) || sender.id !== chrome.runtime.id) return;
  let url: URL | undefined;
  try { url = sender.url ? new URL(sender.url) : undefined; } catch { sendResponse({ accepted: false }); return; }
  const site = !!sender.tab && url?.origin === 'https://chatgpt.com';
  const internal = !sender.tab && url?.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id;
  if (!site && !internal) { sendResponse({ accepted: false }); return; }
  void (async () => {
    if (message.type === 'OPEN_OBSERVATORY') { await chrome.runtime.openOptionsPage(); sendResponse({ accepted: true }); return; }
    const permitted = await chrome.permissions.contains({ origins });
    const conversation = site ? url!.pathname.match(/\/c\/([^/]+)/)?.[1] : undefined;
    const sessionId = conversation ? `chatgpt:${conversation}` : null;
    if (!permitted) { sendResponse({ accepted: false, state: await collectorState(store, sessionId, false, '') }); return; }
    if (message.type === 'CONNECT_CHATGPT') {
      if (!internal) { sendResponse({ accepted: false }); return; }
      await syncPermission();
      const tabs = await chrome.tabs.query({ url: origins });
      await Promise.allSettled(tabs.filter(tab => tab.id).map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ['content.js'] })));
      await notifyTabs();
      sendResponse({ accepted: true, state: await collectorState(store, sessionId, true, 'Open a ChatGPT conversation to begin') }); return;
    }
    if (message.type === 'SET_COLLECTOR_ENABLED') {
      if (typeof message.enabled !== 'boolean') { sendResponse({ accepted: false }); return; }
      await store.setSettings({ ...await store.getSettings(), captureEnabled: message.enabled }); await notifyTabs();
      sendResponse({ accepted: true, state: await collectorState(store, sessionId, true, 'Collection resumed') }); return;
    }
    if (message.type === 'GET_COLLECTOR_STATE') {
      const saved = await chrome.storage.local.get<{ adapterHealth?: { health: string } }>('adapterHealth');
      sendResponse({ accepted: true, state: await collectorState(store, sessionId, true, saved.adapterHealth?.health ?? 'Waiting for visible messages') }); return;
    }
    if (!site || message.sessionId !== sessionId) { sendResponse({ accepted: false }); return; }
    const result = await captureMessages(store, sessionId, message);
    if (result.accepted) await chrome.storage.local.set({ adapterHealth: { health: result.state.health, updatedAt: new Date().toISOString() } });
    sendResponse(result);
  })().catch(() => sendResponse({ accepted: false }));
  return true;
});
