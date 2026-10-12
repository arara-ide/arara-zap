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
