# PromptPulse release checks

These manual checks cover real host behavior that fixture tests cannot establish. Run them on each target extension/version before distributing v0.1 publicly.

## Chrome or Edge

- Load the unpacked build, verify no site access is granted at install, and grant only ChatGPT access from the popup.
- Verify the in-page PromptPulse pill appears, expands and collapses, shows live composer counts, and never stores a draft as a usage event. Test pause/resume and history links from the pill.
- Reload an existing conversation. Verify user and assistant estimates appear and the adapter health is visible.
- Stream a response, reopen the conversation, edit a prompt, regenerate a response, and load older history. Check stable records and the branch coverage note.
- Verify saved records contain no text by default. Enable raw text, collect a message, disable raw text, and inspect export/storage again.
- Pause capture, remove site access, and confirm counts stop updating.
- Export/import twice; totals must remain stable. Restart the browser and verify history persists.
- Test delete, retention changes, and invalid imports. Delete pauses collection, so data should not reappear automatically.
- Break fixture selectors against the real DOM intentionally and verify the adapter health reports unavailable coverage.

## VS Code

- Install the VSIX and verify the PromptPulse Activity Bar icon, native sidebar and commands are discoverable.
- Verify live selection counts in the status bar and sidebar, including multiple and overlapping selections, and no selected text being recorded as usage.
- Count selected Unicode text and code. The command must label the estimate and must not save source text or record it as actual model usage.
- Enable Copilot's documented file exporter with content and identity capture off. Import its real output.
- Choose the export through Watch Telemetry File. Verify appends, replacement/rotation, error reporting, restart restoration, Stop Watching and deletion without reimporting erased records.
- Compare distinct chat-span input/output sums against the dashboard; exclude invoke_agent parent summaries and tools.
- Inspect subagents, errors, cached-input subsets, reasoning subsets, and partial exports.
- Restart VS Code, verify retained data, then export and import it into the browser dashboard.
- Verify the webview CSP rejects network requests and external resources.

## Antigravity IDE

- Install the same VSIX in the IDE's extension host and verify package acceptance, Activity Bar contribution and registered commands.
- Verify selection estimates and imported usage work locally. Native agent-token usage must remain explicitly unavailable unless a supported source is implemented.
- Keep this separate from the Antigravity desktop app and SDK/CLI usage metadata; extension installation is not evidence of access to native agent requests.

## Delivery

- Run `pnpm check` and `pnpm package:vscode` from a clean dependency installation.
- Check the dashboard on desktop and narrow screens; exercise all navigation, file import/export, filters, and raw-text controls.
- Review permissions, estimator label, unknown-field rendering, sample-data labels, and privacy documentation.
- Validate compatibility with the actual installed versions. Antigravity compatibility is experimental until independently tested.
- Add marketplace publisher credentials, icons, store privacy disclosures, signing, CI, and release versioning when preparing public distribution.
