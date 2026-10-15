# Install PromptPulse extensions

PromptPulse is a browser extension and an editor extension. Both contain their own interface and local storage. The localhost page is only a developer preview; you do not need to run it to use either extension.

## Chrome or Edge

Package: `dist/promptpulse-browser-0.1.0.zip`.

1. Extract the ZIP to a permanent folder.
2. Open Chrome's `chrome://extensions` or Edge's `edge://extensions` page.
3. Turn on **Developer mode**, click **Load unpacked**, and choose the extracted folder containing `manifest.json`.
4. Pin PromptPulse from the browser's Extensions menu and open its popup.
5. Click **Enable ChatGPT access** and approve access to ChatGPT. The package requests no other chatbot origins.
6. Open a ChatGPT tab. A PromptPulse pill appears at the bottom right. Click it to see the observed conversation's user/assistant estimates and the current composer draft estimate. Reload an existing tab if the pill has not appeared.

Use **Pause collection** in the popup or meter to stop updates. Use **Extension history & settings** to open the full history packaged within the extension. This opens a browser-extension page, with no local server involved.

Current capture is for `https://chatgpt.com`. Saved `/c/…` conversations support persistent observed-message records. A draft can be estimated before a saved conversation URL exists. Counts are approximate visible-text tokens, excluding hidden model input and backend billing quantities. Drafts are never stored as usage. Raw conversation text is off by default.

## VS Code

Package: `dist/promptpulse-0.1.0.vsix`.

1. Open the Extensions sidebar and choose **Install from VSIX…** from the menu.
2. Select the VSIX package. Reload the editor if prompted.
3. Click the PromptPulse icon in the Activity Bar, or run **PromptPulse: Open Sidebar**.
4. Select prompt or code text in an editor tab. A live `~N selected` estimate appears in the status bar and sidebar. The estimate is not recorded as actual usage.
5. For reported Copilot usage, configure the supported JSONL exporter described below, then run **PromptPulse: Start Watching Telemetry File** and choose that export file for automatic updates. **PromptPulse: Stop Watching Telemetry File** stops updates and forgets the selected source. For a one-time import use **PromptPulse: Import Usage or Copilot Telemetry**. Records update by trace/span identity.

Full history, traces, prompt comparison, and settings open through **PromptPulse: Open Usage Details** inside an editor tab.

## Antigravity IDE

Use the same `dist/promptpulse-0.1.0.vsix` package.

1. Open **Antigravity IDE**, its Extensions view, then **Install from VSIX…**.
2. Select the VSIX and reload if requested.
3. Open the PromptPulse Activity Bar sidebar and select text to see the live estimate.

The installed Antigravity IDE exposes a compatible VS Code extension API. This targets the IDE, separate from Google's other Antigravity desktop app. Exact native Antigravity agent usage is currently unavailable; the sidebar says so. Host compatibility does not expose private agent requests or token counts. Explicitly supplied compatible telemetry can be imported, and browser usage can be brought in through a PromptPulse JSON export.

See [Antigravity compatibility evidence](ANTIGRAVITY_COMPATIBILITY.md) for the installed version, supported CLI flags, official references, and verification boundary.

## Copilot reported usage

Use VS Code's documented settings, with your own absolute path:

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "file",
  "github.copilot.chat.otel.outfile": "C:/Users/YOUR_NAME/copilot-otel.jsonl",
  "github.copilot.chat.otel.captureContent": false,
  "github.copilot.chat.otel.captureIdentity": false
}
```

Check the current [Copilot OpenTelemetry guide](https://code.visualstudio.com/docs/agents/guides/monitoring-agents) against your installed version. The extension consumes user-selected files and does not enable Google or Microsoft telemetry settings on your behalf. Import a synthetic example from `fixtures/telemetry/copilot-sample.jsonl` to try trace inspection without using private chat data.

## Sharing usage between extensions

Each extension/editor profile has its own local store. Export JSON from the browser and import it in the editor, or vice versa. Duplicate IDs update existing records. Raw text is excluded from exports. Automatic cross-app synchronization is not included.

## Build packages from source

With Node.js 22.12+ and pnpm installed:

```sh
pnpm install
npm run check
npm run package:extensions
```

For development, the unpacked browser build is at `apps/browser-extension/dist`. In VS Code, F5 launches the extension development configuration. `npm run dev` opens an optional UI development preview; it is not the runtime for the extensions.
