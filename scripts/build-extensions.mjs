import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const browser = resolve('apps/browser-extension/dist');
const ide = resolve('apps/vscode-extension/dist');
const generatedRoot = resolve('apps') + sep;
for (const target of [browser, ide]) {
  if (!target.startsWith(generatedRoot) || ![resolve('apps/browser-extension/dist'), resolve('apps/vscode-extension/dist')].includes(target)) throw new Error('Unexpected generated build directory');
  await rm(target, { recursive: true, force: true });
}
await mkdir(browser, { recursive: true }); await mkdir(ide, { recursive: true });
await cp('apps/dashboard/dist', browser, { recursive: true });
for (const filename of ['manifest.json', 'popup.html', 'popup.css']) await cp(`apps/browser-extension/${filename}`, `${browser}/${filename}`);
await cp('apps/browser-extension/icons', `${browser}/icons`, { recursive: true });
const shared = { bundle: true, minify: true, target: 'es2022', logLevel: 'info', tsconfig: 'tsconfig.json' };
await build({ ...shared, entryPoints: ['apps/browser-extension/src/background.ts'], outfile: `${browser}/background.js`, format: 'esm', platform: 'browser' });
await build({ ...shared, entryPoints: ['apps/browser-extension/src/content.ts'], outfile: `${browser}/content.js`, format: 'iife', platform: 'browser' });
await build({ ...shared, entryPoints: ['apps/browser-extension/src/popup.ts'], outfile: `${browser}/popup.js`, format: 'iife', platform: 'browser' });
await build({ ...shared, entryPoints: ['apps/vscode-extension/src/extension.ts'], outfile: `${ide}/extension.cjs`, format: 'cjs', platform: 'node', external: ['vscode'] });
await build({ ...shared, entryPoints: ['apps/vscode-extension/src/webview.tsx'], outfile: `${ide}/webview.js`, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } });
// Keep the webview build self-contained, with no remote assets or eval.
const manifest = JSON.parse(await readFile('apps/browser-extension/manifest.json', 'utf8'));
await writeFile(`${browser}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log('PromptPulse browser and VS Code bundles built.');
