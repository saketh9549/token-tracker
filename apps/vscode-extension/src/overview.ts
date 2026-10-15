import * as vscode from 'vscode';
import { ESTIMATOR, type Summary } from '@promptpulse/core';
import { MAX_SELECTION_CHARACTERS, type SelectionEstimate } from './editor-model';
import { basename } from 'node:path';
import type { TelemetrySourceState } from './telemetry-watch';

interface OverviewState {
  host: { name: string; antigravity: boolean };
  selection: SelectionEstimate;
  summary: Summary;
  records: number;
  error?: string;
  telemetrySource: TelemetrySourceState;
}

class OverviewItem extends vscode.TreeItem {
  constructor(label: string, description: string | undefined, tooltip: string, icon: string, readonly children?: OverviewItem[], command?: string) {
    super(label, children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(icon);
    if (command) this.command = { command, title: label };
  }
}

export class OverviewProvider implements vscode.TreeDataProvider<OverviewItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<OverviewItem | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  constructor(private state: OverviewState) {}
  update(state: OverviewState) { this.state = state; this.changed.fire(undefined); }
  getTreeItem(item: OverviewItem) { return item; }
  getChildren(item?: OverviewItem): OverviewItem[] {
    if (item) return item.children ?? [];
    const { host, selection, summary, records, error, telemetrySource } = this.state;
    const live = selection.state === 'estimated' ? `~${selection.tokens.toLocaleString()} tokens` : selection.state === 'too_large' ? 'Selection too large' : 'Select text to estimate';
    const selectedText = selection.state === 'too_large'
      ? `Select up to ${MAX_SELECTION_CHARACTERS.toLocaleString()} characters for live token estimates. No text has been read or saved.`
      : `${selection.characters.toLocaleString()} selected characters. ${ESTIMATOR}. Selected editor text only; hidden agent context and actual billed usage are unknown. Text and estimates are never saved as usage.`;
    return [
      new OverviewItem('Editor', host.name, `Running inside ${host.name}.`, 'window'),
      new OverviewItem('Live selection', live, selectedText, 'symbol-keyword', undefined, 'promptpulse.countSelection'),
      new OverviewItem('Today’s saved usage', undefined, 'Imported and saved records for today in your local timezone. Selection estimates are excluded.', 'history', [
        new OverviewItem('Reported tokens', error ? 'Unavailable' : summary.reported.toLocaleString(), error ?? 'Known usage fields from imported model-call telemetry; partial records may omit usage.', 'check'),
        new OverviewItem('Estimated text tokens', error ? 'Unavailable' : summary.estimated.toLocaleString(), error ?? 'Visible-text estimates from imported PromptPulse records. Separate from reported totals.', 'symbol-numeric'),
        new OverviewItem('Model calls', error ? 'Unavailable' : summary.modelCalls.toLocaleString(), error ?? `${summary.unknownCalls} calls without usage; ${summary.partialCalls} with partial usage.`, 'sparkle'),
        new OverviewItem('Saved records', error ? 'Unavailable' : records.toLocaleString(), error ?? 'All locally retained records, including dates before today.', 'database')
      ]),
      new OverviewItem('Telemetry source', telemetrySource.status === 'stopped' ? 'Off' : telemetrySource.status === 'reading' ? 'Reading…' : telemetrySource.status === 'error' ? 'Needs attention' : 'Watching', telemetrySource.detail, telemetrySource.status === 'error' ? 'warning' : 'eye', [
        ...(telemetrySource.source ? [new OverviewItem('File', basename(telemetrySource.source), telemetrySource.source, 'file-code')] : []),
        new OverviewItem('Source status', telemetrySource.detail, telemetrySource.detail, telemetrySource.status === 'error' ? 'warning' : 'info'),
        ...(telemetrySource.lastImportedAt ? [new OverviewItem('Last import', new Date(telemetrySource.lastImportedAt).toLocaleTimeString(), 'Last successful processing of this source. Token records retain the original span timestamps.', 'history')] : []),
        telemetrySource.source
          ? new OverviewItem('Stop watching', undefined, 'Stop automatic imports and forget the selected source. Existing records are retained.', 'debug-stop', undefined, 'promptpulse.stopWatchingTelemetry')
          : new OverviewItem('Choose telemetry file', undefined, 'Select a Copilot JSONL export explicitly to enable automatic imports after file changes.', 'eye', undefined, 'promptpulse.startWatchingTelemetry'),
        ...(telemetrySource.source ? [new OverviewItem('Choose telemetry file again', undefined, 'Restart watching this file or explicitly choose a different telemetry export.', 'file-symlink-file', undefined, 'promptpulse.startWatchingTelemetry')] : [])
      ]),
      new OverviewItem('Integration coverage', undefined, 'PromptPulse labels the source and limits of each measurement.', 'info', [
        new OverviewItem('Editor text', 'Live estimate', 'Select prompt or code text in any editor tab. Runs locally and is never recorded as a model call.', 'check'),
        new OverviewItem(host.antigravity ? 'Antigravity agent usage' : 'Native chat / agent usage', 'Unavailable', 'PromptPulse does not read private chat databases or internal agent APIs. Automatic native agent usage has not been integrated.', 'circle-slash'),
        new OverviewItem('Copilot telemetry', telemetrySource.source ? 'Selected file' : 'Import or watch file', 'Import or explicitly choose an OpenTelemetry JSONL export to watch. No source paths are read from workspace settings.', 'file-code', undefined, 'promptpulse.startWatchingTelemetry'),
        new OverviewItem('Browser conversations', 'Companion extension', 'The browser extension counts supported visible chatbot messages. Its store is independent; import a PromptPulse export here to combine records.', 'globe')
      ]),
      new OverviewItem('Open usage details', undefined, 'Open local history, traces, prompt comparison, imports and privacy settings inside this editor.', 'graph', undefined, 'promptpulse.openDashboard'),
      new OverviewItem('Import usage file', undefined, 'Import Copilot telemetry or a PromptPulse export from the browser extension.', 'cloud-download', undefined, 'promptpulse.importTelemetry')
    ];
  }
  dispose() { this.changed.dispose(); }
}
