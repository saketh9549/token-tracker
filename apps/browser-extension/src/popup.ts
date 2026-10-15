import { summarize } from '@promptpulse/core';
import { BrowserStore } from '@promptpulse/storage';
const store = new BrowserStore();
const connect = document.getElementById('connect') as HTMLButtonElement;
const pause = document.getElementById('pause') as HTMLButtonElement;
let captureEnabled = true;
let siteEnabled = false;
async function refresh() {
  const today = new Date().toDateString();
  const summary = summarize((await store.load()).filter(e => new Date(e.timestamp).toDateString() === today));
  document.getElementById('estimate')!.textContent = summary.estimated.toLocaleString();
  document.getElementById('reported')!.textContent = summary.reported.toLocaleString();
  const enabled = await chrome.permissions.contains({ origins: ['https://chatgpt.com/*'] });
  siteEnabled = enabled;
  connect.textContent = enabled ? 'Remove ChatGPT access' : 'Enable ChatGPT access';
  captureEnabled = (await store.getSettings()).captureEnabled;
  pause.hidden = !enabled; pause.textContent = captureEnabled ? 'Pause collection' : 'Resume collection';
  const state = await chrome.storage.local.get<{ adapterHealth?: { health: string; updatedAt: string } }>('adapterHealth');
  document.getElementById('health')!.textContent = !captureEnabled && enabled ? 'Collection is paused. Resume to update the on-page meter.' : enabled ? state.adapterHealth?.health ?? 'Open a ChatGPT conversation. The token meter appears in the bottom-right corner.' : 'Enable access to show a live token meter inside ChatGPT.';
}
connect.onclick = async () => {
  try {
    const permissions = { origins: ['https://chatgpt.com/*'] };
    if (siteEnabled) await chrome.permissions.remove(permissions);
    else if (await chrome.permissions.request(permissions)) await chrome.runtime.sendMessage({ type: 'CONNECT_CHATGPT' });
    await refresh();
  } catch (error) { document.getElementById('health')!.textContent = String(error); }
};
document.getElementById('open')!.onclick = () => { void chrome.runtime.openOptionsPage(); };
document.getElementById('chatgpt')!.onclick = () => { void chrome.tabs.create({ url: 'https://chatgpt.com/' }); };
pause.onclick = async () => {
  try { await chrome.runtime.sendMessage({ type: 'SET_COLLECTOR_ENABLED', enabled: !captureEnabled }); await refresh(); }
  catch (error) { document.getElementById('health')!.textContent = String(error); }
};
void refresh().catch(error => { document.getElementById('health')!.textContent = String(error); });
setInterval(() => { void refresh().catch(() => {}); }, 1500);
