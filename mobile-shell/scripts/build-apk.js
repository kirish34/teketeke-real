#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidDir = resolve(__dirname, '..', 'android');
const isWindows = process.platform === 'win32';
const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';

const result = spawnSync(gradleCmd, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true
});

if (result.error) {
  console.error(result.error);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);

