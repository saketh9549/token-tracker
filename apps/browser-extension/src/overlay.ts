import type { CollectorState } from './collector-service';

export function readComposer(document: Document): string | null {
  const composer = document.querySelector<HTMLElement>('#prompt-textarea, [data-testid="composer-input"]');
  if (!composer) return null;
  return composer.tagName === 'TEXTAREA' ? (composer as HTMLTextAreaElement).value : composer.innerText ?? composer.textContent ?? '';
}
export function createOverlay(document: Document, actions: { toggleCapture: () => void; openHistory: () => void }) {
  const host = document.createElement('div'); host.id = 'promptpulse-meter';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;max-width:calc(100vw - 32px);';
  const root = host.attachShadow({ mode: 'open' });
  // Static markup only; all page-derived values are assigned with textContent.
  root.innerHTML = `<style>
    :host{all:initial}*{box-sizing:border-box}.widget{font:12px/1.5 system-ui,-apple-system,sans-serif;color:#243c33;width:270px;max-width:calc(100vw - 32px)}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #9ebc70;outline-offset:3px}.pill{border:1px solid #d4ddca;border-radius:24px;background:#eff4e7;color:#355335;display:flex;align-items:center;gap:8px;padding:9px 13px;margin-left:auto;box-shadow:0 3px 16px #00000012}.pulse{font-weight:750;background:#30543f;color:#e2efb7;display:grid;place-items:center;width:20px;height:20px;border-radius:6px;font-size:12px}.panel{margin-top:8px;border:1px solid #d9e2cf;background:#f9fbf5;border-radius:12px;padding:16px;box-shadow:0 4px 22px #00000016}.panel[hidden]{display:none}.heading{display:flex;justify-content:space-between;align-items:center;font-weight:650}.tag{font-size:9px;color:#697b58;letter-spacing:1px}.big{font-size:28px;letter-spacing:-1px;font-weight:650;margin:12px 0 0}.sub{font-size:10px;color:#718263;margin:0 0 13px}.row{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.row strong{font-weight:600}.draft{padding-top:9px;border-top:1px solid #dde6d3}.health{font-size:10px;line-height:1.6;color:#6d805d;margin:13px 0 8px}.limits{font-size:9px;color:#86937b;line-height:1.5;margin:0 0 13px}.actions{display:flex;gap:8px}.actions button{border:1px solid #d3dfc5;border-radius:6px;background:#edf3e5;color:#506a40;padding:7px 9px;font-size:10px}.actions .history{background:#315640;border-color:#315640;color:#fff;flex:1}
    </style><div class="widget"><button class="pill" type="button" aria-label="Open PromptPulse token meter" aria-expanded="false"><span class="pulse">P</span><span id="pill-count">PromptPulse · connecting</span></button><section class="panel" aria-label="PromptPulse token meter" hidden><div class="heading">PromptPulse <span class="tag">LOCAL ESTIMATES</span></div><div class="big" id="total">—</div><p class="sub">estimated tokens · observed conversation</p><div class="row"><span>User text</span><strong id="input">—</strong></div><div class="row"><span>Assistant text</span><strong id="output">—</strong></div><div class="row draft"><span>Draft estimate</span><strong id="draft">—</strong></div><p class="health" id="health" role="status">Connecting to the extension…</p><p class="limits">Visible text only. Hidden context and billed usage are unknown. Drafts are never saved.</p><div class="actions"><button id="pause" type="button">Pause</button><button class="history" id="history" type="button">Open extension history ↗</button></div></section></div>`;
  const pill = root.querySelector<HTMLButtonElement>('.pill')!; const panel = root.querySelector<HTMLElement>('.panel')!;
  pill.onclick = () => { panel.hidden = !panel.hidden; pill.setAttribute('aria-expanded', String(!panel.hidden)); };
  root.querySelector<HTMLButtonElement>('#pause')!.onclick = actions.toggleCapture;
  root.querySelector<HTMLButtonElement>('#history')!.onclick = actions.openHistory;
  function mount() { if (!host.isConnected) (document.body ?? document.documentElement).append(host); }
  mount();
  return {
    update(state: CollectorState) {
      mount(); const display = (value: number | null) => value === null ? '—' : value.toLocaleString();
      const set = (id: string, text: string) => { const element = root.getElementById(id)!; if (element.textContent !== text) element.textContent = text; };
      set('pill-count', !state.permitted ? 'PromptPulse · access disabled' : !state.enabled ? 'PromptPulse · paused' : state.draftTokens !== null && state.draftTokens > 0 ? `Draft · ${display(state.draftTokens)} est. tokens` : `PromptPulse · ${display(state.estimatedTokens)} est. tokens`);
      set('total', display(state.estimatedTokens)); set('input', display(state.inputTokens)); set('output', display(state.outputTokens)); set('draft', display(state.draftTokens));
      set('health', state.health); set('pause', state.enabled ? 'Pause' : 'Resume'); root.querySelector<HTMLButtonElement>('#pause')!.disabled = !state.permitted;
    },
    unavailable() { root.getElementById('pill-count')!.textContent = 'PromptPulse · reconnect needed'; root.getElementById('health')!.textContent = 'Extension connection unavailable. Reload this tab after updating PromptPulse.'; },
    destroy() { host.remove(); }
  };
}
