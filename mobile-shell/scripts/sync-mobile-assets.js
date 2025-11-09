#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import cpy from 'cpy';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const publicSource = resolve(repoRoot, 'public');
const dest = resolve(__dirname, '..', 'web');

if (!existsSync(publicSource)) {
  console.error('[sync-mobile-assets] Expected public/ to exist');
  process.exit(1);
}

function parseArgs(){
  const args = process.argv.slice(2);
  let entry = process.env.TEKETEKE_ENTRY_FILE || 'public/mobile/index.html';
  for (let i = 0; i < args.length; i += 1){
    const arg = args[i];
    if (arg.startsWith('--entry=')){
      entry = arg.split('=').slice(1).join('=') || entry;
    } else if (arg === '--entry' && args[i+1]){
      entry = args[i+1];
      i += 1;
    }
  }
  return entry;
}

const entryFile = parseArgs();
const entryUrl = '/' + entryFile.replace(/^\.?\//, '');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

await cpy(['**/*'], resolve(dest, 'public'), {
  cwd: publicSource,
  parents: true
});

const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="refresh" content="0;url=${entryUrl}">
  <title>TekeTeke</title>
  <script>window.location.replace(${JSON.stringify(entryUrl)});</script>
</head>
<body></body>
</html>`;

writeFileSync(resolve(dest, 'index.html'), indexHtml);

console.log(`[sync-mobile-assets] Copied /public and pointing entry to ${entryUrl}`);
