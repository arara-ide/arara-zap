import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authStore } from '../src/auth-store.js';
import { deriveKey } from '../src/security.js';
test('encrypted session persists concurrent key updates and rejects wrong password or tampering', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'zap-auth-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'session.enc'), key = deriveKey('a'.repeat(32)), store = await authStore(path, key);
  await Promise.all([store.state.keys.set({ session: { one: Buffer.from('private-first') } }), store.state.keys.set({ session: { two: Buffer.from('private-second') } })]);
  const raw = await readFile(path); assert.equal(raw.includes(Buffer.from('private')), false);
  const restored = await authStore(path, key), keys = await restored.state.keys.get('session', ['one', 'two']);
  assert.equal(keys.one.toString(), 'private-first'); assert.equal(keys.two.toString(), 'private-second');
  await assert.rejects(authStore(path, deriveKey('b'.repeat(32))), /Cannot decrypt/);
  raw[raw.length - 1] ^= 1; await writeFile(path, raw); await assert.rejects(authStore(path, key), /Cannot decrypt/);
});

test('reset replaces revoked credentials and keys, persists them and ignores stale socket writes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'zap-reset-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'session.enc'), key = deriveKey('a'.repeat(32)), store = await authStore(path, key);
  const old = store.state;
  old.creds.registered = true;
  const pending = old.keys.set({ session: { revoked: Buffer.from('old-key') } });
  await store.reset(); await pending;
  old.creds.registered = true;
  await old.keys.set({ session: { stale: Buffer.from('late-key') } });
  await store.flush();
  const restored = await authStore(path, key);
  assert.equal(restored.state.creds.registered, false);
  assert.notDeepEqual(restored.state.creds.noiseKey, old.creds.noiseKey);
  assert.deepEqual(await restored.state.keys.get('session', ['revoked', 'stale']), { revoked: undefined, stale: undefined });
  await store.state.keys.set({ session: { fresh: Buffer.from('new-key') } });
  assert.equal((await (await authStore(path, key)).state.keys.get('session', ['fresh'])).fresh.toString(), 'new-key');
});
