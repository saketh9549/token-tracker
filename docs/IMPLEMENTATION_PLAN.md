# PromptPulse implementation plan

Build a local AI usage observatory based on the supplied project blueprint. The first release covers visible ChatGPT messages and imported Copilot OpenTelemetry spans. Reported usage, estimated text, and unavailable usage stay distinct throughout collection, storage, aggregation, and display.

## Product delivery priority

The product is delivered as a browser extension and a shared VS Code / Antigravity IDE extension. ChatGPT gets an in-page live conversation/draft meter and browser popup. Editors get a native Activity Bar sidebar, live selected-text status bar, imports and file following. The history dashboard is packaged inside those extensions; localhost is only a frontend development preview. No server is required by installed extensions. Antigravity IDE compatibility and native agent-token capture are distinct: selection estimates/imports are supported, while exact native agent usage remains unavailable.

## Milestone 1 — Shared foundation

- Set up a pnpm TypeScript workspace with shared core, adapters, storage, and UI packages.
- Define versioned events, strict import validation, source provenance, null usage fields, and stable identifiers.
- Tokenize text locally with a pinned cl100k_base estimator; label it as a model approximation.
- Test accounting: sum model calls only; caches and reasoning are subsets; parent summaries and tools are excluded.

Exit: local selected-text estimates and reproducible accounting tests work.

## Milestone 2 — Browser collector

- Package a Chrome Manifest V3 extension with opt-in ChatGPT permission.
- Read rendered messages through a DOM adapter; update stable IDs while streaming and on revisits.
- Persist metadata in IndexedDB, omit raw content by default, and provide pause, raw-text opt-in, retention, export, and delete controls.
- Show adapter health and the limit of visible-message coverage.

Exit: extension builds and fixture tests verify streaming, edited messages, stable identity, and privacy. Live ChatGPT smoke testing remains a release gate.

## Milestone 3 — IDE and telemetry

- Import JSONL spans from Copilot's documented file exporter, including serialized SDK spans and OTLP JSON envelopes.
- Normalize trace IDs, parents, tools, agents, errors, durations, and known token fields.
- Add VS Code commands for selection estimates, telemetry import, dashboard, export, and delete.
- Bundle a local VSIX; inspect trace trees with missing-parent and cycle diagnostics.

Exit: synthetic traces reconcile without double counting and both extensions build. Extension Development Host testing remains a release gate.

## Milestone 4 — Unified local insights

- Reuse one dashboard for the browser, VS Code webview, and standalone local preview.
- Provide overview, sessions, trace explorer, prompt draft comparison, settings, and cross-source JSON imports.
- Keep sample data explicitly labeled and isolated from saved user data.
- Exercise import/export, persistence, privacy, and responsive UI.

Exit: a runnable first version with passing tests, builds, and clear installation instructions.

## Milestone 5 — Expand and release

- Validate actual ChatGPT markup and Copilot exports on installed versions.
- Add Claude, Gemini, and Grok independently, each with DOM fixtures and health diagnostics.
- Investigate Antigravity extension support and documented telemetry; do not claim native usage access without evidence.
- Add CI, signed distribution, marketplace listings, retention migration tests, and optional companion sync.

Publishing, cloud accounts, paid services, subscription cost estimates, and automatic cross-app sync are later work. This execution creates local reviewable builds.

## Technical choices

Node 22.12+; pnpm workspaces; TypeScript; React with Vite; esbuild for extension entry points; IndexedDB through idb; VS Code local global storage; Vitest and DOM fixtures. No backend, sign-in, outbound analytics, remote fonts, or provider API credentials.

Browser estimates count observed text once, not the full history sent on each hidden model request. Missing fields stay null. OTel raw usage field names are preserved through an allowlist; prompt, code, tool arguments, resource identity, and arbitrary span attributes are discarded.

## Documentation verified at implementation

- [Copilot OpenTelemetry](https://code.visualstudio.com/docs/agents/guides/monitoring-agents)
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [OTel GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [js-tiktoken implementation](https://github.com/dqbd/tiktoken/tree/main/js)

## Delivery status

Milestones 1–4 are implemented for local review. Type checking, automated tests, production builds, and isolated VSIX installation have been verified. Live ChatGPT capture and VS Code command execution with real Copilot telemetry remain release gates. See `docs/PROGRESS.md` for the checkpoint and `docs/RELEASE_CHECKLIST.md` for host checks. Milestone 5 remains planned.
