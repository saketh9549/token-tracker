# Antigravity compatibility

Checked on 15 October 2026 against the installed Windows applications and current official documentation.

## Extension host

PromptPulse's VSIX targets **Antigravity IDE**, the editor with VS Code extension APIs. Google also distributes a separate Antigravity app and an Antigravity CLI; installing a VSIX in the IDE does not install it in those applications. Google's [IDE overview](https://antigravity.google/docs/ide/overview) and [getting-started guide](https://antigravity.google/docs/getting-started) describe the separate surfaces.

Read-only local inspection found:

- Editor executable: `%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe`.
- Editor product/file version: `2.5.5`.
- VS Code API base from `resources/app/package.json`, `product.json`, and CLI help: `1.107.0`.
- Editor application name: `antigravity-ide`.
- Product commit: `ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8`.
- Editor CLI: `%LOCALAPPDATA%\Programs\Antigravity IDE\bin\antigravity-ide.cmd`.

The installed CLI documents `--install-extension <ext-id | path>`, `--extensions-dir <dir>`, `--user-data-dir <dir>`, `--list-extensions`, and `--show-versions`. Use an absolute VSIX path when installing. PromptPulse's declared minimum VS Code API version is compatible with this installed editor base.

## Native agent usage

Local editor selection estimates and PromptPulse's own data view can run inside the IDE. Automatic exact token capture from Antigravity's native agent has not been verified.

The documented [Antigravity hooks](https://antigravity.google/docs/hooks) expose model and invocation metadata, but their documented `PostInvocation` payload does not include token counts. Hooks are therefore insufficient evidence for reporting exact native agent token use. PromptPulse currently leaves those counts unavailable rather than inferring them from selection size or invocation counts.

Google's [SDK lifecycle documentation](https://antigravity.google/docs/sdk/lifecycle) exposes usage metadata for calls made through that SDK. This does not establish access to existing IDE conversations.

## Verification boundary

The freshly rebuilt `dist/promptpulse-0.1.0.vsix` was successfully installed through the installed Antigravity IDE CLI. Both commands exited with code 0, and a subsequent `--list-extensions --show-versions` returned `promptpulse-local.promptpulse@0.1.0`.

Installation and listing used these isolated directories inside the project:

- Extension directory: `.local/antigravity-verification/extensions`.
- User-data directory: `.local/antigravity-verification/user-data`.

The installed manifest contains the PromptPulse Activity Bar container, the `promptpulse.overview` view, `promptpulse.startWatchingTelemetry` and `promptpulse.stopWatchingTelemetry` commands, and the bundled `media/pulse.svg` icon. The CLI emitted sandbox `EPERM` diagnostics when attempting to change into its application directory and an unregistered analytics-service warning; neither prevented successful installation or listing.

No normal Antigravity profile, settings, account data, or chat history was inspected or changed.

Package acceptance does not alone prove activation, sidebar rendering, or live native agent integration. Those require separate checks.
