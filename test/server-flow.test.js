import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createZapServer } from '../src/server.js';
import { deriveKey, proof } from '../src/security.js';
const number = '5511999999999';
function inbox(ws) { const queue = [], waiting = []; ws.on('message', raw => { const value = JSON.parse(raw); if (waiting.length) waiting.shift()(value); else queue.push(value); }); return () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiting.push(resolve)); }
async function setup(t) {
  const key = deriveKey('a'.repeat(32)), events = [], calls = [], closed = [];
  const service = createZapServer({ key, port: 0, number, adapterFactory: (emit, allowed, locale) => { events.push({ emit, allowed, locale }); return { snapshot: () => ({ qr: 'data:image/png;base64,AAAA', ready: false }), close: () => closed.push(true), command: async m => { calls.push(m); return 'id'; } }; } });
  const address = await service.listen(); t.after(() => service.close());
  const url = `ws://127.0.0.1:${address.port}/zap`;
  const connect = async (extra = {}) => { const ws = new WebSocket(url), next = inbox(ws); ws.on('error', () => {}); t.after(() => ws.terminate()); const challenge = await next(); const ready = next(); ws.send(JSON.stringify({ type: 'auth', number, proof: proof(key, challenge.nonce, number), ...extra })); return { ws, next, challenge, ready }; };
  return { key, service, url, address, events, calls, closed, connect };
}
test('QR appears only after authentication and locale reaches the WhatsApp adapter', async t => {
  const f = await setup(t), c = await f.connect({ locale: 'es-MX' });
  assert.equal((await c.ready).type, 'ready'); assert.equal((await c.next()).type, 'qr'); assert.equal((await c.next()).status, 'Esperando WhatsApp');
  assert.equal(f.events[0].locale, 'es'); assert.equal(f.events[0].allowed(), number);
  f.events[0].emit({ type: 'message', text: '!arara', id: 'message' }); assert.equal((await c.next()).text, '!arara');
  const result = c.next(); c.ws.send(JSON.stringify({ id: 'send', op: 'send', text: 'hello' })); assert.equal((await result).type, 'result');
  const closed = once(c.ws, 'close'); c.ws.close(); await closed; assert.equal(f.closed.length, 1);
});
test('HTTP endpoints and browser-origin upgrades expose no service data', async t => {
  const f = await setup(t);
  assert.equal((await fetch(`http://127.0.0.1:${f.address.port}/zap`)).status, 404);
  for (const [url, options] of [[f.url, { origin: 'https://evil.example' }], [f.url.replace('/zap', '/other'), {}]]) {
    const ws = new WebSocket(url, options); const error = once(ws, 'error'); await error; assert.equal(f.events.length, 0);
  }
});
test('wrong number, wrong password and replay cannot expose QR or start WhatsApp', async t => {
  const f = await setup(t);
  for (const extra of [{ number: '5511888888888' }, { proof: '0'.repeat(64) }]) {
    const c = await f.connect(extra); const close = once(c.ws, 'close'); await close; assert.equal(f.events.length, 0);
  }
  const first = await f.connect(); await first.ready; const oldProof = proof(f.key, first.challenge.nonce, number); const closed = once(first.ws, 'close'); first.ws.close(); await closed;
  const c = await f.connect({ proof: oldProof }); await once(c.ws, 'close'); assert.equal(f.events.length, 1);
});
test('second IDE is rejected and oversized or arbitrary recipient payloads are rejected', async t => {
  const f = await setup(t), c = await f.connect(); await c.ready;
  const second = new WebSocket(f.url); await once(second, 'error');
  const closed = once(c.ws, 'close'); c.ws.send(JSON.stringify({ id: 'one', op: 'send', number: '5511888888888', text: 'hello' })); const [code] = await closed; assert.equal(code, 1008); assert.equal(f.calls.length, 0);
  const large = await f.connect(); await large.ready; const tooLarge = once(large.ws, 'close'); large.ws.send('x'.repeat(40000)); assert.equal((await tooLarge)[0], 1009);
});
