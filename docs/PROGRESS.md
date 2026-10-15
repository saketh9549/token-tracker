# PromptPulse progress

Checkpoint: 15 October 2026, Asia/Calcutta.

The product is delivered as a browser extension and a shared VS Code / Antigravity IDE extension. The history interface is packaged within them; localhost is only an optional developer preview. The MVP is ready for installation and live integration testing, and has not been published to an extension marketplace. See `docs/EXTENSION_INSTALLATION.md`.

## Implemented

- pnpm TypeScript workspace with dashboard, Chrome extension, VS Code extension, and shared core, adapter, storage, and UI packages.
- Versioned event validation, stable upserts, explicit null usage, provenance, estimator version, numeric raw usage fields, and metadata-only JSON exports.
- Pinned js-tiktoken 1.0.21 cl100k_base estimates. Selected text and draft comparison run locally.
- Accounting that separates reported from estimated usage and excludes agent summaries, tools, cache subsets, and reasoning subsets from additive totals.
- ChatGPT DOM adapter, throttled stream observation, opt-in site permission, service worker, IndexedDB persistence, popup, and collector health. An on-page meter shows observed user/assistant tokens and a live composer estimate, with pause/resume and extension-history controls. Drafts are never saved as usage.
- Copilot JSONL normalization, OTLP envelope support, high-resolution timestamps, inherited session IDs, retries, missing-parent diagnostics, and cycle-safe trace trees.
- Shared VS Code / Antigravity IDE VSIX with a native Activity Bar sidebar, live multi-selection status estimates, import/history/export/delete commands, and atomic local storage. Optional user-selected telemetry-file watching is debounced, bounded, serialized, and restored from explicit prior selection. Stop/deletion drain pending writes and forget the source.
- Shared dashboard with source/date filters, session details, trace inspection, prompt comparison, raw-text opt-in, capture pause, retention, import/export, and local deletion.
- Browser raw content disabled by default. Telemetry content discarded. Disabling raw-text storage scrubs existing text. Exports exclude text.
- Synthetic sample mode isolated from saved data; no outbound analytics or provider API calls.

## Verification

- `npm run check`: TypeScript check, 46 automated tests, and production builds pass. A subsequent UI settings-label correction also passes TypeScript and fresh builds.
- Tests cover token accounting, partial usage, streaming and revisits, edits and regenerations, unsupported DOMs, stable-identity requirements, telemetry normalization, session inheritance, privacy, retention, concurrent writes, and restart persistence. Extension tests also cover on-page controls and draft privacy, multi-selection union estimates, host labeling, file-following bounds/coalescing, stop/write races, and visible watcher errors.
- Browser UI exercised: overview, synthetic sample mode, trace selection and unknown usage, prompt comparison, and JSONL fixture import through the actual file picker.
- The imported fixture contains seven spans and four model calls totaling 10,000 reported tokens. It remains in the standalone preview's local test store; sample mode is separate.
- Narrow-screen prompt layout checked at 390 pixels; wide tables scroll within their panels. Desktop overview screenshot saved in `.local/promptpulse-preview.jpg`.
- VSIX package installation has been accepted by VS Code and by the installed Antigravity IDE CLI in isolated workspace-local profiles. The refreshed Antigravity installation includes the sidebar, watch commands, and icon. Normal editor profiles were not used. Package acceptance does not establish host activation or live native agent access.
- Local preview is available while the dev server runs at `http://127.0.0.1:5173`. Restart with `npm run dev` if needed.

Installable packages are `dist/promptpulse-browser-0.1.0.zip` and `dist/promptpulse-0.1.0.vsix`. The browser ZIP extracts directly to an unpacked extension folder containing `manifest.json`, icons, scripts, assets, and installation instructions. The production history interface includes roughly 1.37 MB of JavaScript before compression, mostly due to the local tokenizer vocabulary. The browser content script is about 11.3 KB; tokenization runs in the extension worker. Tokenizer loading and further splitting can be optimized later.

## Next release gates

1. Load the browser build in Chrome/Edge and validate current ChatGPT message IDs, streaming, permission removal, pagination, and restart behavior against live conversations.
2. Launch the VS Code Extension Development Host and exercise all commands with a real installed Copilot file exporter. Package installation alone does not establish runtime compatibility.
3. Complete the privacy and host checks in `docs/RELEASE_CHECKLIST.md`.
4. Add provider adapters independently, starting with Claude, Gemini, and Grok; investigate native Antigravity agent usage separately from its compatible editor-extension host.
5. Add release automation, icons, marketplace publisher configuration, and optional synchronization after host validation.

There is no automatic browser-to-IDE synchronization, subscription cost calculation, hidden-context reconstruction, exact native Antigravity agent-token capture, cloud service, or marketplace publication in this version. Antigravity IDE has the native extension UI, selection estimates and explicit usage imports/file following.
