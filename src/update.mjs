/*! @license
MIT License

Copyright (c) 2026 Gabriel Rodrigues

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { execFile } from 'node:child_process';
import { lstat, readFile, writeFile, mkdtemp, rename, rm, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { t } from './i18n.mjs';
export const SOURCE = 'https://github.com/arara-ide/arara-zap.git';
export const RELEASE_URL = 'https://api.github.com/repos/arara-ide/arara-zap/releases/latest';
function version(value) { const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value); return match && match.slice(1).map(Number); }
export function newer(candidate, current) {
  const a = version(candidate), b = version(current);
  if (!a || !b || [...a, ...b].some(v => !Number.isSafeInteger(v))) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
export const runCommand = (command, args, cwd, signal) => new Promise((resolve, reject) => {
  const windowsNpm = process.platform === 'win32' && command === 'npm';
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0', npm_config_ignore_scripts: 'true' };
  execFile(windowsNpm ? (process.env.ComSpec || 'cmd.exe') : command, windowsNpm ? ['/d', '/s', '/c', 'npm ci --ignore-scripts --no-audit --no-fund'] : args, { cwd, env, signal, timeout: 180000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
});
export async function latestRelease({ fetchImpl = fetch, signal }) {
  const response = await fetchImpl(RELEASE_URL, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), headers: { accept: 'application/vnd.github+json', 'user-agent': 'arara-zap', 'x-github-api-version': '2022-11-28' } });
  if (response.status === 404) { await response.body?.cancel(); return undefined; }
  if (!response.ok) { await response.body?.cancel(); throw Error('GitHub unavailable'); }
  const text = await response.text();
  if (text.length > 262144) throw Error('Invalid release');
  const release = JSON.parse(text);
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name) || !version(release.tag_name)) throw Error('Invalid release');
  return { tag: release.tag_name, version: release.tag_name.slice(1) };
}
export async function installation(directory) {
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return undefined;
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (pkg.name !== 'arara-zap' || !version(pkg.version)) return undefined;
    await lstat(join(directory, 'src', 'index.js'));
    return { directory, version: pkg.version };
  } catch { return undefined; }
}
export async function updateInstallation({ directory, locale = 'en', signal, fetchImpl = fetch, run = runCommand, report = () => {}, docker = false, dataDirectory = process.env.ZAP_DATA_DIR || join(homedir(), '.arara-zap'), move = rename }) {
  signal.throwIfAborted();
  const current = await installation(directory);
  if (!current) throw Error(t(locale, 'invalid'));
  // Check before network or mutation. The service must not update files under a live process.
  try { const pid = Number(await readFile(join(dataDirectory, 'process.lock'), 'utf8')); if (!Number.isInteger(pid) || pid <= 0) throw Error(t(locale, 'busy')); try { process.kill(pid, 0); throw Error(t(locale, 'busy')); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  report(t(locale, 'checking'));
  let latest;
  try { latest = await latestRelease({ fetchImpl, signal }); }
  catch (e) { if (signal.aborted) throw Error(t(locale, 'cancelled')); report(t(locale, 'offline')); return { updated: false, version: current.version, reason: 'offline' }; }
  if (!latest || !newer(latest.version, current.version)) return { updated: false, version: current.version, reason: 'current' };
  if (docker) { report(t(locale, 'docker', latest)); return { updated: false, version: current.version, reason: 'docker' }; }
  const source = await run('git', ['remote', 'get-url', 'origin'], directory, signal).catch(() => '');
  const dirty = await run('git', ['status', '--porcelain', '--untracked-files=all'], directory, signal).catch(() => 'dirty');
  // Never overwrite hand-edited source, or a repository belonging to someone else.
  if (![SOURCE, 'git@github.com:arara-ide/arara-zap.git'].includes(source) || dirty) { report(t(locale, 'dirty')); return { updated: false, version: current.version, reason: 'dirty' }; }
  const lock = `${directory}.update-lock`;
  try { await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); }
  catch { throw Error(t(locale, 'busy')); }
  let staging, backup;
  try {
    staging = await mkdtemp(join(dirname(directory), '.arara-zap-update-'));
    report(t(locale, 'installing'));
    await run('git', ['init', '--template=', staging], dirname(directory), signal);
    await run('git', ['remote', 'add', 'origin', SOURCE], staging, signal);
    await run('git', ['fetch', '--depth=1', 'origin', `refs/tags/${latest.tag}`], staging, signal);
    await run('git', ['checkout', '--detach', 'FETCH_HEAD'], staging, signal);
    const candidate = await installation(staging);
    if (candidate?.version !== latest.version) throw Error('Release version mismatch');
    await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], staging, signal);
    await run('node', ['--check', 'src/index.js'], staging, signal);
    try { const env = await lstat(join(directory, '.env')); if (!env.isFile() || env.isSymbolicLink()) throw Error('Invalid .env'); await copyFile(join(directory, '.env'), join(staging, '.env')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const ignored = await run('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], directory, signal);
    for (const file of ignored.split('\0').filter(Boolean)) {
      const parts = file.split(/[\\/]/);
      if (parts[0] === 'node_modules' || file === '.env') continue;
      if (isAbsolute(file) || parts.some(part => part === '..' || part === '.git' || !part)) throw Error('Invalid local file');
      const sourceFile = join(directory, ...parts), targetFile = join(staging, ...parts);
      const stat = await lstat(sourceFile);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Invalid local file');
      await mkdir(dirname(targetFile), { recursive: true, mode: 0o700 });
      // No ignored user file can replace a file shipped by the new release.
      await copyFile(sourceFile, targetFile, 1);
    }
    signal.throwIfAborted();
    // Reject edits made while downloading, too. Keep the old directory as a recoverable backup.
    if (await run('git', ['status', '--porcelain', '--untracked-files=all'], directory, signal)) throw Error('Local changes');
    backup = `${directory}.backup-${Date.now()}`;
    await move(directory, backup);
    try { await move(staging, directory); }
    catch (e) { await move(backup, directory); backup = undefined; throw e; }
    staging = undefined;
    report(t(locale, 'updated', latest));
    return { updated: true, version: latest.version, backup };
  } catch (e) { throw Error(t(locale, signal.aborted ? 'cancelled' : 'failed'), { cause: e }); }
  finally { if (staging) await rm(staging, { recursive: true, force: true }); await rm(lock, { force: true }); }
}
