import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { startupError } from '../src/errors.js';
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

test('startup error helper maps EADDRINUSE and EACCES across languages', () => {
  assert.equal(startupError(Object.assign(Error('listen EADDRINUSE'), { code: 'EADDRINUSE', port: 7310 }), 'pt-BR'), 'A porta 7310 já está em uso.');
  assert.equal(startupError(Object.assign(Error('listen EADDRINUSE'), { code: 'EADDRINUSE', port: 7310 }), 'es'), 'El puerto 7310 ya está en uso.');
  assert.equal(startupError(Object.assign(Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }), 'en', { port: 7310 }), 'Port 7310 is already in use.');
  assert.equal(startupError(Object.assign(Error('listen EACCES'), { code: 'EACCES', syscall: 'listen', port: 80 }), 'pt', { host: '127.0.0.1' }), 'Permissão negada para ouvir em 127.0.0.1:80.');
  assert.equal(startupError(Object.assign(Error('open EACCES'), { code: 'EACCES', syscall: 'open' }), 'es'), 'Permiso denegado.');
  assert.equal(startupError(Error('boom'), 'en'), 'boom');
});

test('port conflict prints localized error and cleans process lock', async t => {
  const blocker = createServer();
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => blocker.close(resolve)));
  const { port } = blocker.address();
  const f = await processFixture(t, { ZAP_PORT: String(port), ZAP_LANG: 'pt-BR' });
  assert.equal((await f.ended)[0], 1);
  assert.match(f.output(), new RegExp(`A porta ${port} já está em uso\\.`));
  assert.doesNotMatch(f.output(), /EADDRINUSE/);
  await assert.rejects(lstat(join(f.data, 'process.lock')), { code: 'ENOENT' });
});

test('stopping before spawn prints localized cancellation instead of AbortError', async t => {
  const data = await mkdtemp(join(tmpdir(), 'zap-abort-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  const preload = join(data, 'preload.mjs');
  await writeFile(preload, "globalThis.fetch = async () => { process.emit('message', { type: 'stop' }); return new Response('', { status: 404 }); };\n");
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'src/run.js'], { cwd: root, env: { ...process.env, ZAP_DATA_DIR: data, ZAP_LANG: 'pt-BR', ZAP_SKIP_UPDATE: '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', raw => output += raw);
  child.stderr.on('data', raw => output += raw);
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(output, /Atualização cancelada\./);
  assert.doesNotMatch(output, /This operation was aborted/);
});
