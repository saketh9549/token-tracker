import { zipSync, strToU8 } from 'fflate';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile('apps/vscode-extension/package.json', 'utf8'));
// The runtime is bundled; no workspace dependency resolution is needed after installation.
delete manifest.dependencies;
const entries = {
  'extension/package.json': strToU8(JSON.stringify(manifest, null, 2)),
  'extension/README.md': new Uint8Array(await readFile('apps/vscode-extension/README.md')),
  'extension/LICENSE': new Uint8Array(await readFile('LICENSE')),
  '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".vsixmanifest" ContentType="text/xml"/><Default Extension=".cjs" ContentType="application/javascript"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".css" ContentType="text/css"/><Default Extension=".svg" ContentType="image/svg+xml"/><Default Extension=".md" ContentType="text/markdown"/></Types>'),
  'extension.vsixmanifest': strToU8(`<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011"><Metadata><Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}"/><DisplayName>${manifest.displayName}</DisplayName><Description xml:space="preserve">Local AI usage estimates and telemetry traces.</Description><Tags>ai,tokens,telemetry</Tags><Categories>Other</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/><Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/></Properties><License>extension/LICENSE</License></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets></PackageManifest>`)
};
for (const filename of await readdir('apps/vscode-extension/dist')) entries[`extension/dist/${filename}`] = new Uint8Array(await readFile(join('apps/vscode-extension/dist', filename)));
for (const filename of await readdir('apps/vscode-extension/media')) entries[`extension/media/${filename}`] = new Uint8Array(await readFile(join('apps/vscode-extension/media', filename)));
await mkdir('dist', { recursive: true });
const target = `dist/promptpulse-${manifest.version}.vsix`;
await writeFile(target, zipSync(entries, { level: 6 }));
console.log(`Created ${target}`);
