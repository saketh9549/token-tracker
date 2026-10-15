import { readChatGPT } from '@promptpulse/adapters';
import { createOverlay, readComposer } from './overlay';
import type { CollectorState } from './collector-service';

// Dynamic registration and immediate injection may meet on the same page.
const scope = globalThis as typeof globalThis & { __promptpulseCollectorStarted?: boolean };
if (!scope.__promptpulseCollectorStarted) {
  scope.__promptpulseCollectorStarted = true;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let lastUrl = location.href;
  const sent = new Map<string, string>();
  let generation = 0;
  let current: CollectorState | undefined;
  let scanning = false;
  let scanAgain = false;
  const overlay = createOverlay(document, {
    toggleCapture: () => { void chrome.runtime.sendMessage({ type: 'SET_COLLECTOR_ENABLED', enabled: !current?.enabled }).then(response => { current = response?.state; sent.clear(); generation++; schedule(); }).catch(() => overlay.unavailable()); },
    openHistory: () => { void chrome.runtime.sendMessage({ type: 'OPEN_OBSERVATORY' }).catch(() => overlay.unavailable()); }
  });
  async function scan() {
    if (scanning) { scanAgain = true; return; } scanning = true;
    try {
      const ownGeneration = generation;
      if (lastUrl !== location.href) { sent.clear(); current = undefined; lastUrl = location.href; }
      if (!current || !current.enabled || !current.permitted) {
        const response = await chrome.runtime.sendMessage({ type: 'GET_COLLECTOR_STATE' }); current = response?.state;
        if (current) overlay.update(current);
        if (!current?.enabled || !current.permitted) return;
      }
      const snapshot = readChatGPT(document, location.href);
      const changed = snapshot.messages.filter(message => sent.get(`${snapshot.sessionId}:${message.id}:${message.role}`) !== `${message.streaming}:${message.text}`);
      const messages = changed.slice(0, 200);
      if (changed.length > messages.length) scanAgain = true;
      const response = await chrome.runtime.sendMessage({ type: 'CAPTURE', sessionId: snapshot.sessionId, messages, draft: readComposer(document), health: snapshot.health });
      if (response?.state) { current = response.state; overlay.update(response.state); }
      if (response?.accepted && ownGeneration === generation) for (const message of messages) sent.set(`${snapshot.sessionId}:${message.id}:${message.role}`, `${message.streaming}:${message.text}`);
    } catch { overlay.unavailable(); }
    finally { scanning = false; if (scanAgain) { scanAgain = false; schedule(); } }
  }
  function schedule() { if (!pending) pending = setTimeout(() => { pending = undefined; void scan(); }, 450); }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('input', schedule, true);
  chrome.runtime.onMessage.addListener(message => { if (message?.type === 'RESET_CAPTURE') { generation++; sent.clear(); current = undefined; schedule(); } });
  setInterval(() => { if (lastUrl !== location.href || !current?.enabled || !current.permitted) schedule(); }, 1500);
  schedule();
}
