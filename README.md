# PromptPulse extensions

PromptPulse runs inside your browser, VS Code, and compatible Antigravity IDE editors. The extensions contain their own interface and local storage. A local website/server is not required to use them.

## Install the built extensions

- **Chrome / Edge:** extract `dist/promptpulse-browser-0.1.0.zip`, open the browser's Extensions page, enable Developer mode, and choose **Load unpacked** for the extracted folder containing `manifest.json`. Open the PromptPulse popup and enable ChatGPT access.
- **VS Code:** use **Extensions: Install from VSIX** and select `dist/promptpulse-0.1.0.vsix`. Open PromptPulse in the Activity Bar.
- **Antigravity IDE:** install the same VSIX using **Install from VSIX**, then open the PromptPulse sidebar. The separate Antigravity desktop app is not the VSIX target.

See the complete [extension installation guide](docs/EXTENSION_INSTALLATION.md). You do not need Node.js or pnpm to install these built packages.

## Browser extension

PromptPulse adds a compact token meter directly to ChatGPT. Expand it to see observed user/assistant token estimates, a composer draft estimate, pause/resume controls, and extension history. The popup shows daily totals and site-permission controls. Enabling access also attempts to attach the meter to already-open ChatGPT tabs; reload a tab if needed.

Draft counts update while you type and are never stored as usage. Stable messages in saved `/c/…` conversations update during streaming and on revisits. New-chat drafts can be estimated before the conversation is saved. The collector skips messages without safe stable identity rather than inventing IDs from DOM positions.

Supported chatbot origin: `https://chatgpt.com`. Counts are local visible-text estimates, excluding hidden instructions, backend context assembly, tools, files, reasoning, and billed usage. Regenerated branches with distinct IDs may remain separate observed messages. Claude, Gemini, and Grok adapters are planned.

The full history and privacy interface opens as a packaged browser-extension page. It does not connect to localhost or require the developer preview.

## VS Code and Antigravity IDE extension

The shared VSIX adds a native Activity Bar sidebar, live selected-text estimates in the status bar, usage imports, and a local history/trace view in an editor tab. Multiple overlapping selections count once. Selected text is never saved or presented as actual model usage.

Reported Copilot usage comes from an explicitly selected supported OpenTelemetry JSONL export. Configure the official exporter, then import it or choose a file to watch for automatic updates. Browser exports can also be imported into the editor. Selection estimates remain separate from reported model-call totals.

Antigravity IDE uses the same compatible extension package. The sidebar detects its editor host and explicitly marks native Antigravity agent token counts unavailable. PromptPulse does not read private chat databases, credentials, or undocumented agent endpoints. This version provides local selection estimates and imports inside Antigravity; exact native agent capture remains a separate integration task.

See the [editor extension README](apps/vscode-extension/README.md) and [Antigravity compatibility notes](docs/ANTIGRAVITY_COMPATIBILITY.md).

## Privacy and accounting

- Local storage only; raw conversation text is disabled by default. Disabling raw text scrubs existing stored text.
- Drafts and editor selections are never stored as usage.
- Telemetry prompt content, tool arguments, identity/resource metadata, and arbitrary attributes are discarded. Numeric usage field names are retained.
- JSON exports contain metadata and counts, including no raw text.
- Retention defaults to 30 days; choose 7, 30, 90, 365 days or manual deletion. Retention also applies to old imports.
- Reported, estimated, and unknown fields stay distinct. Cache/reasoning subsets, parent-agent summaries, and tool steps are not added twice.
- Browser, VS Code, and Antigravity profiles keep independent stores. JSON export/import combines records without duplicate IDs; there is no automatic cross-app sync.
- No analytics, cookies, auth headers, API keys, provider API calls, remote fonts, prompt uploads, subscription cost estimates, or private request interception.

## Build and test from source

Requirements: Node.js 22.12+ and pnpm 11.25.0. If needed, install pnpm with `npm install --global pnpm@11.25.0`.

Python is not required. The comments-only `requirements.txt` points to the JavaScript workspace manifests and lockfile. For GitHub preparation and first-push steps, see [publishing the source repository](docs/GIT_PUBLISHING.md).

```sh
pnpm install
npm run check
npm run package:extensions
```

Outputs:

- Unpacked browser extension: `apps/browser-extension/dist`
- Browser ZIP: `dist/promptpulse-browser-0.1.0.zip`
- Editor bundle: `apps/vscode-extension/dist`
- VS Code / Antigravity VSIX: `dist/promptpulse-0.1.0.vsix`

`npm run package:browser` and `npm run package:vscode` package one extension. VS Code's F5 development configuration launches an Extension Development Host.

## Optional UI development preview

`npm run dev` serves the shared history interface at `http://127.0.0.1:5173` for frontend development. This preview is not needed when running either extension. It uses its own browser store, separate from the installed extension stores.

Sample mode uses synthetic records in memory. `fixtures/telemetry/copilot-sample.jsonl` is also synthetic: seven spans, four model calls, 10,000 reported tokens.

## Project structure and progress

`apps/` contains the extension hosts and optional UI preview. `packages/core` owns validation, tokenization, traces, exports, and accounting. `packages/adapters` owns ChatGPT DOM extraction and OTel parsing. `packages/storage` contains IndexedDB and local-file persistence. `packages/ui` contains the shared history interface.

See the [implementation plan](docs/IMPLEMENTATION_PLAN.md), [progress report](docs/PROGRESS.md), and [release checklist](docs/RELEASE_CHECKLIST.md). Public distribution, additional chatbot adapters, native Antigravity usage capture, and cloud synchronization are future milestones.
