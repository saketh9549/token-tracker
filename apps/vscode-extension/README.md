# PromptPulse for VS Code and Antigravity

PromptPulse runs inside the editor. It adds an Activity Bar sidebar, a live token estimate for selected text, and a local usage viewer. No local web server or account is required.

## Install

1. Open the editor’s Extensions view and choose **Install from VSIX…** from its menu.
2. Select `dist/promptpulse-0.1.0.vsix` from this project.
3. Open **PromptPulse** in the Activity Bar, or run **PromptPulse: Open Sidebar** from the Command Palette.
4. Select prompt or code text in an editor tab. The status bar shows `~N selected`, and the sidebar explains the estimate.

The package requires the VS Code extension API `^1.99.0`. The installed Antigravity IDE 2.5.5 uses a VS Code API base of 1.107.0, which satisfies that requirement. Other Antigravity IDE versions must expose a compatible API and support VSIX installation. This package targets Antigravity IDE; the separate Antigravity desktop app is not a VSIX host. Host compatibility does not grant access to native Antigravity agent usage.

## Daily use

- **Live selection:** local `cl100k_base` token estimates for one or more editor selections, updated after a short typing pause. Overlapping selections are counted once. The limit is 100,000 selected characters.
- **Saved usage:** the native sidebar separates reported and estimated totals for the local calendar day. Unknown and partial model-call usage remains labeled in the tooltip.
- **Import usage:** use the sidebar’s import action or **PromptPulse: Import Usage or Copilot Telemetry**. Choose a PromptPulse JSON export from the browser companion or a supported Copilot OpenTelemetry JSONL file, up to 20 MB. Imports deduplicate by event ID and honor retention.
- **Automatic telemetry updates:** run **PromptPulse: Start Watching Telemetry File** and explicitly choose your Copilot JSONL export. The sidebar shows its filename, scan status, warnings and last import. Appends and file replacement trigger debounced imports, with one scan/import at a time and stable event IDs. The file must stay at or below 20 MB; rotate the exporter output when needed. This follows an already configured exporter; it does not enable Copilot telemetry for you.
- **Stop automatic updates:** run **PromptPulse: Stop Watching Telemetry File** or use the sidebar action. This forgets the watched source and keeps existing records. Deleting local usage also stops and forgets the source before clearing records.
- **Usage details:** inspect history, traces, prompt comparison and privacy settings in an editor tab. The interface is packaged inside the VSIX.
- **Export or delete:** use the corresponding PromptPulse command. Exports omit raw text; deleting records pauses collection in this store.

## Coverage and privacy

Selection estimates are a preview of the text you selected. They do not include hidden prompts, retrieved files, previous conversation turns, tool payloads, reasoning, model-specific tokenization or billing overhead. They are never saved as usage or attributed to a model call.

Native Copilot and Antigravity chat/agent token counts are currently **unavailable**. PromptPulse does not inspect private chat databases, credentials or undocumented internal endpoints. Explicit telemetry-file imports can provide reported usage when their records contain it.

Automatic watching reads only the local JSON/JSONL path you selected in the file dialog. That source is saved in this extension’s global state and restored when this editor/profile starts again. Workspace settings cannot enable a source. A missing file, oversized file or read/parse error stays visible in the sidebar; subsequent file changes or **Refresh Saved Usage** retry the scan. You can stop watching at any time. Watch controls are separate from the browser collector’s capture setting.

Browser conversations are collected by the separate PromptPulse browser extension. Browser and editor stores are independent. To view browser records inside the editor, export them from the browser extension and import the JSON here. VS Code and Antigravity also keep separate extension storage by editor/profile.

The sidebar detects the current editor using the public `vscode.env.appName` API. In an Antigravity host it explicitly labels Antigravity agent usage as unavailable. A VS Code window with an Antigravity plugin continues to identify its editor host as VS Code.

Official installation and compatibility references: [VS Code extension installation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace), [VS Code engine compatibility](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#visual-studio-code-compatibility), and [Google Antigravity IDE extensions](https://antigravity.google/docs/ide/extensions/).
