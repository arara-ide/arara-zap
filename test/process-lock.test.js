import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir, uptime } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireProcessLock, isProcessLocked } from '../src/process-lock.mjs';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'zap-lock-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'process.lock');
}
test('dead PID from an interrupted service is recovered; live owner cannot be replaced', t => {
  const path = fixture(t), pid = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(path, pid); assert.equal(isProcessLocked(path), false);
  const release = acquireProcessLock(path); assert.equal(isProcessLocked(path), true);
  assert.throws(() => acquireProcessLock(path), /already running/);
  release(); assert.equal(existsSync(path), false);
});
test('legacy live PID is retained, but a lock from before reboot is recovered', t => {
  const path = fixture(t); writeFileSync(path, String(process.pid));
  assert.equal(isProcessLocked(path), true); assert.throws(() => acquireProcessLock(path));
  const beforeBoot = new Date(Date.now() - (uptime() + 60) * 1000); utimesSync(path, beforeBoot, beforeBoot);
  acquireProcessLock(path)(); assert.equal(existsSync(path), false);
});
test('PID reuse is detected through Linux boot and process start identity', { skip: process.platform !== 'linux' }, t => {
  const path = fixture(t); writeFileSync(path, JSON.stringify({ pid: process.pid, identity: 'old-boot:old-process' }));
  acquireProcessLock(path)(); assert.equal(existsSync(path), false);
});
test('cleanup never removes a replacement lock and filesystem errors are preserved', t => {
  const path = fixture(t), release = acquireProcessLock(path);
  writeFileSync(path, String(process.pid)); release(); assert.equal(readFileSync(path, 'utf8'), String(process.pid));
  assert.throws(() => acquireProcessLock(join(path, 'invalid')), { code: process.platform === 'win32' ? 'ENOENT' : 'ENOTDIR' });
});

test('a legacy empty lock is recovered only after its write grace period', t => {
  const path = fixture(t); writeFileSync(path, '');
  assert.throws(() => acquireProcessLock(path));
  const old = new Date(Date.now() - 60000); utimesSync(path, old, old);
  acquireProcessLock(path)(); assert.equal(existsSync(path), false);
});
