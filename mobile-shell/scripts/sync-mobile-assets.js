#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync, cpSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const publicSource = resolve(repoRoot, 'public');
const dest = resolve(__dirname, '..', 'web');
const capConfigPath = resolve(__dirname, '..', 'capacitor.config.json');
const androidStringsPath = resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
const androidGradlePath = resolve(__dirname, '..', 'android', 'app', 'build.gradle');

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
const appId = process.env.TEKETEKE_APP_ID;
const appName = process.env.TEKETEKE_APP_NAME;

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const targetPublicDir = resolve(dest, 'public');
mkdirSync(targetPublicDir, { recursive: true });
cpSync(publicSource, targetPublicDir, { recursive: true, force: true });

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

// Optionally update Capacitor + Android config when env vars are provided
if (appId || appName){
  try {
    let cfg = {
      appId: 'com.teketeke.app',
      appName: 'TekeTeke Go',
      webDir: 'web',
      bundledWebRuntime: false,
      server: { androidScheme: 'https' }
    };
    if (existsSync(capConfigPath)){
      const raw = readFileSync(capConfigPath, 'utf8');
      try{
        cfg = { ...cfg, ...JSON.parse(raw) };
      }catch(_){}
    }
    if (appId) cfg.appId = appId;
    if (appName) cfg.appName = appName;
    writeFileSync(capConfigPath, JSON.stringify(cfg, null, 4));
    console.log(`[sync-mobile-assets] Updated Capacitor config: ${cfg.appId} (${cfg.appName})`);

    if (existsSync(androidStringsPath)){
      let xml = readFileSync(androidStringsPath, 'utf8');
      if (appName){
        xml = xml.replace(/<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${appName}</string>`);
        xml = xml.replace(/<string name="title_activity_main">[^<]*<\/string>/, `<string name="title_activity_main">${appName}</string>`);
      }
      if (appId){
        xml = xml.replace(/<string name="package_name">[^<]*<\/string>/, `<string name="package_name">${appId}</string>`);
        xml = xml.replace(/<string name="custom_url_scheme">[^<]*<\/string>/, `<string name="custom_url_scheme">${appId}</string>`);
      }
      writeFileSync(androidStringsPath, xml);
      console.log('[sync-mobile-assets] Updated Android app strings for current role');
    }

    if (appId && existsSync(androidGradlePath)){
      let gradle = readFileSync(androidGradlePath, 'utf8');
      if (/applicationId\s+"[^"]+"/.test(gradle)){
        gradle = gradle.replace(/applicationId\s+"[^"]+"/, `applicationId "${appId}"`);
        writeFileSync(androidGradlePath, gradle);
        console.log(`[sync-mobile-assets] Updated Android applicationId to ${appId}`);
      }
    }
  } catch (err){
    console.warn('[sync-mobile-assets] Failed to update Capacitor / Android config', err);
  }
}
