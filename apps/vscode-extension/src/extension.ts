import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { FileStore } from '../../../packages/storage/src/file';
import { ESTIMATOR, exportUsage, importUsage, validateEvent } from '@promptpulse/core';
import { importTelemetry } from '@promptpulse/adapters';
import { validateSettings } from '@promptpulse/storage';
import { editorHost, estimateSelection, MAX_SELECTION_CHARACTERS, todaySummary, type SelectionEstimate } from './editor-model';
import { OverviewProvider } from './overview';
import { TelemetryWatch, validTelemetrySource, type TelemetrySourceState } from './telemetry-watch';

const TELEMETRY_SOURCE_KEY = 'promptpulse.telemetrySource.v1';

export function activate(context: vscode.ExtensionContext) {
  const store = new FileStore(context.globalStorageUri.fsPath);
  const host = editorHost(vscode.env.appName);
  let panel: vscode.WebviewPanel | undefined;
  let selection: SelectionEstimate = { state: 'empty', characters: 0, tokens: 0 };
  let summary = todaySummary([]);
  let records = 0;
  let storageError: string | undefined;
  let telemetrySource: TelemetrySourceState = { status: 'stopped', detail: 'Choose a telemetry file to enable automatic updates.' };
  let sourceChange: Promise<void> = Promise.resolve();
  let disposed = false;
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;
  const overview = new OverviewProvider({ host, selection, summary, records, telemetrySource });
  const view = vscode.window.createTreeView('promptpulse.overview', { treeDataProvider: overview });
  view.message = 'Select prompt or code text for a live estimate. Native agent usage is unavailable.';
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.name = 'PromptPulse token estimate';
  status.command = 'promptpulse.openOverview';
  status.show();
  const telemetryWatch = new TelemetryWatch({
    async consume(events) { await store.upsert(events); await refreshUsage(); },
    onState(state) { telemetrySource = state; refreshPresentation(); }
  });
  function changeTelemetrySource(action: () => Promise<void>): Promise<void> {
    const operation = sourceChange.then(action);
    sourceChange = operation.catch(() => {});
    return operation;
  }
  function stopWatching(): Promise<void> {
    return changeTelemetrySource(async () => {
      await telemetryWatch.stop();
      await context.globalState.update(TELEMETRY_SOURCE_KEY, undefined);
    });
  }
  function refreshPresentation() {
    if (disposed) return;
    const sourceNote = telemetrySource.source ? `\nTelemetry source: ${telemetrySource.detail}` : '';
    const usage = (storageError ?? `Today: ${summary.reported.toLocaleString()} known reported tokens; ${summary.estimated.toLocaleString()} estimated text tokens from saved records.`) + sourceNote;
    if (selection.state === 'estimated') {
      status.text = `$(pulse) ~${selection.tokens.toLocaleString()} selected`;
      status.tooltip = `PromptPulse · ${host.name}\n${selection.characters.toLocaleString()} selected characters · ${ESTIMATOR}.\nSelected text only; actual agent input and billing are unknown. Selection text and estimates are never saved.\n${usage}\nClick to open PromptPulse.`;
    } else if (selection.state === 'too_large') {
      status.text = '$(pulse) Selection too large';
      status.tooltip = `PromptPulse: select up to ${MAX_SELECTION_CHARACTERS.toLocaleString()} characters for a live estimate.\n${usage}`;
    } else {
      status.text = storageError || telemetrySource.status === 'error' ? '$(warning) PromptPulse' : records ? `$(pulse) ${summary.reported.toLocaleString()} reported` : '$(pulse) PromptPulse';
      status.tooltip = `PromptPulse · ${host.name}\nSelect prompt or code text for a live token estimate.\n${usage}\nNative chat and agent usage is unavailable. Click for integration coverage.`;
    }
    overview.update({ host, selection, summary, records, error: storageError, telemetrySource });
    void vscode.commands.executeCommand('setContext', 'promptpulse.watchingTelemetry', !!telemetrySource.source);
  }
  async function refreshUsage() {
    try {
      const events = await store.load();
      summary = todaySummary(events); records = events.length; storageError = undefined;
    } catch (error) {
      storageError = `Unable to read local usage: ${error instanceof Error ? error.message : String(error)}`;
    }
    refreshPresentation();
  }
  function refreshSelection() {
    const editor = vscode.window.activeTextEditor;
    selection = editor ? estimateSelection(editor.selections.map(range => ({
      start: editor.document.offsetAt(range.start), end: editor.document.offsetAt(range.end)
    })), (start, end) => editor.document.getText(new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end))))
      : { state: 'empty', characters: 0, tokens: 0 };
    refreshPresentation();
  }
  function scheduleSelection() {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(refreshSelection, 175);
  }
  function openDashboard() {
    if (panel) { panel.reveal(); return; }
    const assets = vscode.Uri.joinPath(context.extensionUri, 'dist');
    panel = vscode.window.createWebviewPanel('promptpulse', 'PromptPulse', vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [assets], retainContextWhenHidden: true });
    const nonce = randomBytes(24).toString('base64');
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(assets, 'webview.js'));
    const style = panel.webview.asWebviewUri(vscode.Uri.joinPath(assets, 'webview.css'));
    panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${panel.webview.cspSource} blob:; connect-src 'none';"><link rel="stylesheet" href="${style}"><title>PromptPulse</title></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
    panel.webview.onDidReceiveMessage(async message => {
      if (!message || !Number.isSafeInteger(message.id) || typeof message.method !== 'string') return;
      try {
        let result: unknown;
        switch (message.method) {
          case 'load': result = await store.load(); break;
          case 'getSettings': result = await store.getSettings(); break;
          case 'setSettings': result = await store.setSettings(validateSettings(message.args)); break;
          case 'clear': await stopWatching(); result = await store.clear(); break;
          case 'upsert':
            if (!Array.isArray(message.args) || message.args.length > 100000) throw new Error('Invalid import batch');
            result = await store.upsert(message.args.map(validateEvent)); break;
          case 'export': {
            if (!message.args || typeof message.args.contents !== 'string' || message.args.contents.length > 40_000_000) throw new Error('Invalid export');
            const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(message.args.filename === 'promptpulse-sample.json' ? 'promptpulse-sample.json' : 'promptpulse-export.json'), filters: { JSON: ['json'] } });
            if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(message.args.contents, 'utf8'));
            break;
          }
          default: throw new Error('Unknown storage command');
        }
        await panel?.webview.postMessage({ id: message.id, result });
        await refreshUsage();
      } catch (error) { await panel?.webview.postMessage({ id: message.id, error: error instanceof Error ? error.message : 'Storage operation failed' }); }
    }, undefined, context.subscriptions);
  }
  const command = (name: string, action: () => unknown) => context.subscriptions.push(vscode.commands.registerCommand(`promptpulse.${name}`, async () => {
    try { await action(); } catch (error) { void vscode.window.showErrorMessage(`PromptPulse: ${error instanceof Error ? error.message : String(error)}`); }
  }));
  command('countSelection', () => {
    refreshSelection();
    if (selection.state === 'empty') { void vscode.window.showInformationMessage('Select prompt or code text in an editor tab. The token estimate appears live in the status bar and PromptPulse sidebar.'); return; }
    if (selection.state === 'too_large') throw new Error(`Select up to ${MAX_SELECTION_CHARACTERS.toLocaleString()} characters for a token estimate.`);
    void vscode.window.showInformationMessage(`${selection.tokens.toLocaleString()} estimated tokens · ${ESTIMATOR}. Selected text only; actual model input is unknown. Text and estimates are not saved as usage.`);
  });
  command('openOverview', () => vscode.commands.executeCommand('promptpulse.overview.focus'));
  command('refreshUsage', async () => { telemetryWatch.refresh(0); await refreshUsage(); });
  command('openDashboard', openDashboard);
  command('startWatchingTelemetry', async () => {
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFolders: false, filters: { 'Telemetry JSONL': ['jsonl', 'json'] }, title: 'Choose a Copilot telemetry export to watch automatically' });
    const source = files?.[0];
    if (!source) return;
    if (source.scheme !== 'file' || !validTelemetrySource(source.fsPath)) throw new Error('Choose a local .jsonl or .json telemetry file.');
    await changeTelemetrySource(async () => {
      // Only this explicit picker writes the source that may be restored on startup.
      await context.globalState.update(TELEMETRY_SOURCE_KEY, source.fsPath);
      await telemetryWatch.start(source.fsPath);
    });
    await vscode.commands.executeCommand('promptpulse.overview.focus');
  });
  command('stopWatchingTelemetry', stopWatching);
  command('importTelemetry', async () => {
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Usage JSON / OTel JSONL': ['jsonl', 'json'] }, title: 'Import PromptPulse usage or Copilot telemetry' });
    if (!files?.[0]) return;
    const bytes = await vscode.workspace.fs.readFile(files[0]);
    if (bytes.length > 20_000_000) throw new Error('Choose a telemetry file smaller than 20 MB');
    const contents = Buffer.from(bytes).toString('utf8');
    let envelope: { format?: string } | undefined;
    try { envelope = JSON.parse(contents); } catch { /* JSONL telemetry is parsed below. */ }
    const parsed = envelope?.format === 'promptpulse'
      ? { events: importUsage(contents, (await store.getSettings()).rawText), warnings: [], skipped: 0 }
      : importTelemetry(contents);
    if (!parsed.events.length) throw new Error(parsed.warnings.join('; ') || 'No supported spans found. Choose a JSONL span export.');
    await store.upsert(parsed.events); await refreshUsage();
    await vscode.commands.executeCommand('promptpulse.overview.focus');
    void vscode.window.showInformationMessage(`Processed ${parsed.events.length} unique records; ${parsed.skipped} unsupported records skipped; ${parsed.warnings.length} warnings. Retention applies to old records.`);
  });
  command('exportData', async () => {
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('promptpulse-export.json'), filters: { JSON: ['json'] } });
    if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(exportUsage(await store.load()), 'utf8'));
  });
  command('deleteData', async () => {
    const choice = await vscode.window.showWarningMessage('Permanently delete PromptPulse local usage records?', { modal: true }, 'Delete data');
    if (choice === 'Delete data') { await stopWatching(); await store.setSettings({ ...await store.getSettings(), captureEnabled: false }); await store.clear(); await refreshUsage(); }
  });
  const interval = setInterval(() => { void refreshUsage(); }, 60_000);
  context.subscriptions.push(status, view, overview, telemetryWatch,
    vscode.window.onDidChangeActiveTextEditor(scheduleSelection),
    vscode.window.onDidChangeTextEditorSelection(scheduleSelection),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === vscode.window.activeTextEditor?.document) scheduleSelection();
    }),
    { dispose() { disposed = true; clearInterval(interval); if (selectionTimer) clearTimeout(selectionTimer); } }
  );
  refreshSelection();
  void refreshUsage();
  const savedSource = context.globalState.get<unknown>(TELEMETRY_SOURCE_KEY);
  if (validTelemetrySource(savedSource)) {
    // Restored only from extension global state previously populated by the explicit picker.
    void changeTelemetrySource(() => telemetryWatch.start(savedSource)).catch(() => { /* The sidebar displays the source error. */ });
  }
}
