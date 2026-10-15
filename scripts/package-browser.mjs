import { zipSync } from 'fflate';
import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises';
import { join } from 'node:path';

const folder = 'apps/browser-extension/dist';
await cp('apps/browser-extension/INSTALL.md', join(folder, 'INSTALL.md'));
const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
const entries = {};
async function collect(directory, relative = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, item.name); const key = relative ? `${relative}/${item.name}` : item.name;
    if (item.isDirectory()) await collect(filename, key);
    else entries[key] = new Uint8Array(await readFile(filename));
  }
}
await collect(folder); await mkdir('dist', { recursive: true });
const target = `dist/promptpulse-browser-${manifest.version}.zip`;
await writeFile(target, zipSync(entries, { level: 6 }));
console.log(`Created ${target}. Extract it, then Load unpacked in Chrome/Edge.`);
