import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { whatsapp } from '../src/whatsapp.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(locale = 'pt') {
  const sockets = [], events = [], scheduled = [], saves = [];
  const adapter = whatsapp({ state: {}, saveCreds: async () => saves.push(true) }, event => events.push(event), () => '5511999999999', locale, {
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
test('authorized text and LID alternatives pass; history, groups, own messages, media and duplicates do not', t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  const message = (id, overrides = {}, content = { conversation: 'hello' }) => ({ key: { id, remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, ...overrides }, message: content });
  socket.ev.emit('messages.upsert', { type: 'append', messages: [message('history')] });
  socket.ev.emit('messages.upsert', { type: 'notify', messages: [message('text'), message('text'), message('own', { fromMe: true }), message('group', { remoteJid: '5511999999999@g.us' }), message('other', { remoteJid: '5511888888888@s.whatsapp.net' }), message('media', {}, { imageMessage: {} }), message('lid', { remoteJid: '123@lid', remoteJidAlt: '5511999999999@s.whatsapp.net' }), message('too-long', {}, { conversation: 'a'.repeat(16001) })] });
  assert.deepEqual(f.events.filter(e => e.type === 'message').map(e => e.id), ['text', 'lid']);
});
test('send and poll use only the authorized number and retain original poll for decryption', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  await assert.rejects(f.adapter.command({ op: 'send', text: 'hello' }), /desconectado/);
  socket.ev.emit('connection.update', { connection: 'open' });
  await f.adapter.command({ op: 'send', text: 'hello', number: 'other' });
  const id = await f.adapter.command({ op: 'poll', title: 'menu', values: ['A', 'B'] });
  assert.equal(socket.sent.every(m => m.jid === '5511999999999@s.whatsapp.net'), true);
  assert.equal(socket.sent[1].content.poll.selectableCount, 1); assert.ok(await socket.config.getMessage({ id }));
});
test('poll votes require exact sender, known original, one option and unused message id', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0]; socket.ev.emit('connection.update', { connection: 'open' });
  const id = await f.adapter.command({ op: 'poll', title: 'menu', values: ['A', 'B'] });
  const vote = (messageId, values, overrides = {}, pollId = id) => ({ key: { id: pollId }, update: { pollUpdates: [{ pollUpdateMessageKey: { id: messageId, fromMe: false, remoteJid: '5511999999999@s.whatsapp.net', ...overrides }, vote: { selectedOptions: values } }] } });
  for (const update of [vote('wrong', ['A'], { remoteJid: '5511888888888@s.whatsapp.net' }), vote('self', ['A'], { fromMe: true }), vote('unknown', ['A'], {}, 'unknown-poll'), vote('multiple', ['A', 'B']), vote('valid', ['A']), vote('valid', ['A'])]) { socket.ev.emit('messages.update', [update]); await tick(); }
  assert.deepEqual(f.events.filter(e => e.poll).map(e => e.poll), [{ id, option: 'A' }]);
});
test('reconnection backs off and ignores stale events; logout stops reconnection', async t => {
  const f = setup('en'); t.after(f.adapter.close); const first = f.sockets[0];
  first.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } }); assert.equal(f.scheduled[0].delay, 1000);
  f.scheduled[0].callback(); assert.equal(f.sockets.length, 2);
  first.ev.emit('connection.update', { connection: 'open' }); assert.equal(f.adapter.snapshot().ready, false);
  f.sockets[1].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  assert.equal(f.scheduled.length, 1); assert.match(f.events.at(-1).status, /Session ended/);
});
