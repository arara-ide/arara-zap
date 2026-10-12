import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const file of await readdir(new URL('../src/', import.meta.url))) {
  if (/\.(m?js)$/.test(file)) execFileSync(process.execPath, ['--check', fileURLToPath(new URL(`../src/${file}`, import.meta.url))], { stdio: 'inherit' });
}
