import { readFileSync, writeFileSync, statSync, unlinkSync, linkSync } from 'node:fs';
import { uptime } from 'node:os';
import { randomUUID } from 'node:crypto';

function linuxIdentity(pid) {
  if (process.platform !== 'linux') return undefined;
  try {
    const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return `${boot}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`;
  } catch { return undefined; }
}
function readLock(path) {
  try { return { raw: readFileSync(path, 'utf8'), stat: statSync(path) }; }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
function alive(lock) {
  if (!lock.raw.trim()) return Date.now() - lock.stat.mtimeMs < 30000;
  let value;
  try { value = JSON.parse(lock.raw); } catch { return true; }
  const pid = typeof value === 'number' ? value : value?.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  if (lock.stat.mtimeMs < Date.now() - uptime() * 1000 - 5000) return false;
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return false; return true; }
  if (value?.identity) {
    const identity = linuxIdentity(pid);
    if (identity && identity !== value.identity) return false;
  }
  return true;
}
export function isProcessLocked(path) {
  const lock = readLock(path);
  return !!lock && alive(lock);
}
export function acquireProcessLock(path, message = 'Arara Zap is already running.') {
  const value = JSON.stringify({ pid: process.pid, identity: linuxIdentity(process.pid), nonce: randomUUID() });
  const candidate = `${path}.${process.pid}.${randomUUID()}`;
  writeFileSync(candidate, value, { flag: 'wx', mode: 0o600 });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { linkSync(candidate, path); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const prior = readLock(path);
        if (!prior) continue;
        if (alive(prior)) throw Error(message);
        const current = readLock(path);
        if (!current || current.raw !== prior.raw || current.stat.ino !== prior.stat.ino) continue;
        try { unlinkSync(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        continue;
      }
      return () => { if (readLock(path)?.raw === value) unlinkSync(path); };
    }
    throw Error(message);
  } finally { unlinkSync(candidate); }
}
