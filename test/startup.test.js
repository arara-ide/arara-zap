import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
const root = new URL('..', import.meta.url);
async function processFixture(t, env, prepare = async () => {}) {
  const data = await mkdtemp(join(tmpdir(), 'zap-startup-')); t.after(() => rm(data, { recursive: true, force: true }));
  await prepare(data);
  const child = spawn(process.execPath, ['src/run.js'], { cwd: root, env: { ...process.env, ZAP_DATA_DIR: data, ZAP_SKIP_UPDATE: '1', ZAP_HOST: '127.0.0.1', ZAP_PORT: '0', ZAP_PASSWORD: '', ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = ''; child.stdout.on('data', raw => output += raw); child.stderr.on('data', raw => output += raw);
  const ended = once(child, 'exit'); t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.send({ type: 'stop' }); await ended; } });
  return { data, child, ended, output: () => output };
}
async function ready(f) {
  for (let i = 0; i < 100; i++) { try { const value = JSON.parse(await readFile(join(f.data, 'connection.json'), 'utf8')); if (f.output().includes('Arara Zap')) return value; } catch {} await new Promise(resolve => setTimeout(resolve, 25)); }
  throw Error(`Startup timed out: ${f.output()}`);
}
test('bootstrap starts local service in IDE language, protects credentials and cleans descriptor on shutdown', async t => {
  for (const [locale, expected] of [['pt-BR', 'ouvindo'], ['es-MX', 'escuchando'], ['de-DE', 'listening']]) {
    await t.test(locale, async sub => {
      const f = await processFixture(sub, { ZAP_LANG: locale }), descriptor = await ready(f);
      assert.match(f.output(), new RegExp(expected)); assert.equal(f.output().includes(descriptor.password), false);
      if (process.platform !== 'win32') assert.equal((await lstat(join(f.data, 'connection.json'))).mode & 0o077, 0);
      const ws = new WebSocket(descriptor.url); const [raw] = await once(ws, 'message'); assert.equal(JSON.parse(raw).type, 'challenge'); ws.terminate();
      f.child.send({ type: 'stop' }); assert.equal((await f.ended)[0], 0);
      await assert.rejects(lstat(join(f.data, 'process.lock')), { code: 'ENOENT' });
      await assert.rejects(lstat(join(f.data, 'connection.json')), { code: 'ENOENT' });
      assert.equal((await readFile(join(f.data, 'local-secret'), 'utf8')).length, 64);
    });
  }
});
test('server mode requires password, reports localized error and cleans process lock', async t => {
  const f = await processFixture(t, { ZAP_HOST: '0.0.0.0', ZAP_LANG: 'es', ZAP_PASSWORD: '' });
  assert.equal((await f.ended)[0], 1); assert.match(f.output(), /obligatoria en servidores/);
  await assert.rejects(lstat(join(f.data, 'process.lock')), { code: 'ENOENT' });
});

test('startup recovers an interrupted process and a second live startup cannot take its lock', async t => {
  const deadPid = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).stdout.trim();
  const f = await processFixture(t, {}, data => writeFile(join(data, 'process.lock'), deadPid));
  await ready(f);
  const owner = await readFile(join(f.data, 'process.lock'), 'utf8');
  const second = await processFixture(t, { ZAP_DATA_DIR: f.data, ZAP_LANG: 'en' });
  assert.equal((await second.ended)[0], 1); assert.match(second.output(), /already running/);
  assert.equal(await readFile(join(f.data, 'process.lock'), 'utf8'), owner);
  f.child.send({ type: 'stop' }); assert.equal((await f.ended)[0], 0);
});
