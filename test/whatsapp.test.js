import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { whatsapp } from '../src/whatsapp.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(locale = 'pt', reset = async () => {}) {
  const sockets = [], events = [], scheduled = [], saves = [];
  const adapter = whatsapp({ state: {}, reset, saveCreds: async () => saves.push(true) }, event => events.push(event), () => '5511999999999', locale, {
    makeSocket: config => { const socket = { config, ev: new EventEmitter(), end() {}, async sendMessage(jid, content) { socket.sent.push({ jid, content }); return { key: { id: `poll-${socket.sent.length}` }, message: { pollCreationMessage: { options: content.poll?.values.map(optionName => ({ optionName })) }, messageContextInfo: { messageSecret: Buffer.from('secret') } } }; }, sent: [] }; sockets.push(socket); return socket; },
    toQR: async () => 'data:image/png;base64,AAAA', schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; }, cancel() {},
    aggregate: async ({ pollUpdates }) => pollUpdates[0].vote.selectedOptions.map(name => ({ name, voters: ['5511999999999@s.whatsapp.net'] })),
  });
  return { adapter, sockets, events, scheduled, saves };
}
test('QR, connection status and credentials follow lifecycle and requested language', async t => {
  const f = setup('es'); t.after(f.adapter.close); const socket = f.sockets[0];
  socket.ev.emit('connection.update', { qr: 'private-qr' }); await tick(); assert.equal(f.events.at(-1).qr, 'data:image/png;base64,AAAA');
  socket.ev.emit('creds.update', {}); await tick(); assert.equal(f.saves.length, 1);
  socket.ev.emit('connection.update', { connection: 'open' }); assert.deepEqual(f.adapter.snapshot(), { ready: true, qr: undefined }); assert.equal(f.events.at(-1).status, 'WhatsApp conectado');
  f.adapter.close(); socket.ev.emit('connection.update', { qr: 'late' }); await tick(); assert.equal(f.events.some(e => e.qr === 'late'), false);
});
test('authorized text and LID alternatives pass; history, groups, own messages, media and duplicates do not', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  const message = (id, overrides = {}, content = { conversation: 'hello' }) => ({ key: { id, remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, ...overrides }, message: content });
  socket.ev.emit('messages.upsert', { type: 'append', messages: [message('history')] });
  socket.ev.emit('messages.upsert', { type: 'notify', messages: [message('text'), message('text'), message('own', { fromMe: true }), message('group', { remoteJid: '5511999999999@g.us' }), message('other', { remoteJid: '5511888888888@s.whatsapp.net' }), message('media', {}, { imageMessage: {} }), message('lid', { remoteJid: '123@lid', remoteJidAlt: '5511999999999@s.whatsapp.net' }), message('too-long', {}, { conversation: 'a'.repeat(16001) })] });
  await tick();
  assert.deepEqual(f.events.filter(e => e.type === 'message').map(e => e.id), ['text', 'lid']);
});
test('send and poll use only the authorized number and retain original poll for decryption', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  await assert.rejects(f.adapter.command({ op: 'send', text: 'hello' }), /desconectado/);
  socket.ev.emit('connection.update', { connection: 'open' });
  const sentId = await f.adapter.command({ op: 'send', text: 'hello', number: 'other' });
  const id = await f.adapter.command({ op: 'poll', title: 'menu', values: ['A', 'B'] });
  assert.equal(socket.sent.every(m => m.jid === '5511999999999@s.whatsapp.net'), true);
  assert.equal(socket.sent[0].content.text, '🦜 | hello');
  assert.equal(socket.sent[1].content.poll.name, '🦜 | menu');
  assert.equal(socket.sent[1].content.poll.selectableCount, 1); assert.ok(await socket.config.getMessage({ id }));
  await f.adapter.command({ op: 'edit', messageId: sentId, text: 'hello\n\nPedido encerrado.' });
  assert.deepEqual(socket.sent[2].content, { text: '🦜 | hello\n\nPedido encerrado.', edit: { id: sentId } });
  assert.ok(socket.sent.every(({ content }) => (content.text || content.poll?.name).startsWith('🦜 | ')));
  await assert.rejects(f.adapter.command({ op: 'edit', messageId: id, text: 'unrelated' }), /indisponível/);
  await assert.rejects(f.adapter.command({ op: 'edit', messageId: sentId, text: 'changed old answer' }), /indisponível/);
});
test('self chat accepts typed messages and ignores prefixed assistant replies without looping', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  socket.user = { id: '5511999999999:1@s.whatsapp.net' };
  socket.ev.emit('connection.update', { connection: 'open' });
  await f.adapter.command({ op: 'send', text: 'resposta da IA' });
  assert.equal(socket.sent.at(-1).content.text, '🦜 | resposta da IA');
  await f.adapter.command({ op: 'send', text: '🦜 | Conversa concluída.' });
  assert.equal(socket.sent.at(-1).content.text, '🦜 | Conversa concluída.');
  const own = (id, text) => ({ key: { id, remoteJid: '5511999999999@s.whatsapp.net', fromMe: true }, message: { conversation: text } });
  socket.ev.emit('messages.upsert', { type: 'notify', messages: [own('typed', 'ArArA'), own('assistant', socket.sent.at(-1).content.text)] });
  await tick();
  assert.deepEqual(f.events.filter(e => e.type === 'message').map(e => e.text), ['ArArA']);
  const pollId = await f.adapter.command({ op: 'poll', title: 'Escolha', values: ['A', 'B'] });
  socket.ev.emit('messages.update', [{ key: { id: pollId }, update: { pollUpdates: [{
    pollUpdateMessageKey: { id: 'self-vote', remoteJid: '5511999999999@s.whatsapp.net', fromMe: true },
    vote: { selectedOptions: ['A'] },
  }] } }]);
  await tick();
  assert.deepEqual(f.events.filter(e => e.poll).map(e => e.poll), [{ id: pollId, option: 'A' }]);
});
test('poll votes require exact sender, known original, one option and unused message id', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0]; socket.ev.emit('connection.update', { connection: 'open' });
  const id = await f.adapter.command({ op: 'poll', title: 'menu', values: ['A', 'B'] });
  const vote = (messageId, values, overrides = {}, pollId = id) => ({ key: { id: pollId }, update: { pollUpdates: [{ pollUpdateMessageKey: { id: messageId, fromMe: false, remoteJid: '5511999999999@s.whatsapp.net', ...overrides }, vote: { selectedOptions: values } }] } });
  for (const update of [vote('wrong', ['A'], { remoteJid: '5511888888888@s.whatsapp.net' }), vote('self', ['A'], { fromMe: true }), vote('unknown', ['A'], {}, 'unknown-poll'), vote('multiple', ['A', 'B']), vote('valid', ['A']), vote('valid', ['A'])]) { socket.ev.emit('messages.update', [update]); await tick(); }
  assert.deepEqual(f.events.filter(e => e.poll).map(e => e.poll), [{ id, option: 'A' }]);
});
test('reconnection backs off and ignores stale events; logout starts fresh pairing', async t => {
  const f = setup('en'); t.after(f.adapter.close); const first = f.sockets[0];
  first.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } }); assert.equal(f.scheduled[0].delay, 1000);
  f.scheduled[0].callback(); assert.equal(f.sockets.length, 2);
  first.ev.emit('connection.update', { connection: 'open' }); assert.equal(f.adapter.snapshot().ready, false);
  f.sockets[1].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  await tick();
  assert.equal(f.scheduled.length, 1); assert.match(f.events.at(-1).status, /Session ended/);
  assert.equal(f.sockets.length, 3);
  f.sockets[2].ev.emit('connection.update', { qr: 'new-pairing' }); await tick();
  assert.equal(f.events.at(-1).qr, 'data:image/png;base64,AAAA');
});

test('closing invalidates readiness and prevents a queued reconnect from opening another socket', async () => {
  const f = setup(); const socket = f.sockets[0];
  socket.ev.emit('connection.update', { connection: 'close' });
  const reconnect = f.scheduled[0].callback;
  socket.ev.emit('connection.update', { connection: 'open' });
  assert.equal(f.adapter.snapshot().ready, true);
  f.adapter.close(); f.adapter.close(); reconnect();
  assert.deepEqual(f.adapter.snapshot(), { ready: false, qr: undefined });
  assert.equal(f.sockets.length, 1);
  await assert.rejects(f.adapter.command({ op: 'send', text: 'late' }), /desconectado/);
  assert.equal(socket.sent.length, 0);
});

test('logout resets once and cannot restart after disconnect during reset', async () => {
  let release, resets = 0;
  const f = setup('en', () => { resets++; return new Promise(resolve => { release = resolve; }); });
  const old = f.sockets[0], logout = { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } };
  old.ev.emit('connection.update', logout); old.ev.emit('connection.update', logout);
  old.ev.emit('creds.update', {}); old.ev.emit('connection.update', { connection: 'open' });
  assert.equal(resets, 1); assert.equal(f.saves.length, 0); assert.equal(f.adapter.snapshot().ready, false);
  f.adapter.close(); release(); await tick(); assert.equal(f.sockets.length, 1);
});
test('reset storage failures stop pairing without unhandled rejection', async () => {
  const f = setup('en', async () => { throw Error('disk full'); });
  f.sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  await tick(); assert.equal(f.sockets.length, 1); assert.equal(f.adapter.snapshot().ready, false);
  assert.match(f.events.at(-1).status, /save|storage/i); f.adapter.close();
});
