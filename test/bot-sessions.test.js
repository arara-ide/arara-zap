import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { whatsapp } from '../src/whatsapp.js';
import { validateCommand } from '../src/security.js';
import { groupStore } from '../src/groups.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const OWNER = '5511999999999';

function setup(groups) {
  const sockets = [], events = [];
  const adapter = whatsapp({ state: {}, reset: async () => {}, saveCreds: async () => {} }, e => events.push(e), () => OWNER, 'pt', {
    ...(groups ? { groups } : {}),
    makeSocket: config => {
      const socket = { config, ev: new EventEmitter(), end() {}, sent: [], loggedOut: 0, created: [],
        async sendMessage(jid, content) { socket.sent.push({ jid, content }); return { key: { id: `m-${socket.sent.length}` } }; },
        async logout() { socket.loggedOut++; },
        async groupCreate(subject, members) { socket.created.push({ subject, members }); return { id: '120363000000000001@g.us' }; } };
      sockets.push(socket); return socket;
    },
    toQR: async () => 'data:image/png;base64,AAAA', schedule: () => 0, cancel() {},
  });
  return { adapter, sockets, events };
}

test('the connected account number is announced and kept in the snapshot', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  socket.user = { id: '5521988887777:12@s.whatsapp.net' };
  socket.ev.emit('connection.update', { connection: 'open' });
  assert.deepEqual(f.events.find(e => e.type === 'account'), { type: 'account', number: '5521988887777' });
  assert.equal(f.adapter.snapshot().account, '5521988887777');
  socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } });
  assert.equal(f.adapter.snapshot().account, undefined);
});

test('logout ends the WhatsApp session', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  await assert.rejects(f.adapter.command({ op: 'logout' }), /desconectado/);
  socket.ev.emit('connection.update', { connection: 'open' });
  assert.equal(await f.adapter.command({ op: 'logout' }), null);
  assert.equal(socket.loggedOut, 1);
});

test('a created group always includes the authorized number and only known groups receive text', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  socket.ev.emit('connection.update', { connection: 'open' });
  const id = await f.adapter.command({ op: 'group', subject: 'Equipe', participants: ['5511888888888'] });
  assert.equal(id, '120363000000000001@g.us');
  assert.deepEqual(socket.created[0], { subject: '🦜 | Equipe', members: [`${OWNER}@s.whatsapp.net`, '5511888888888@s.whatsapp.net'] });
  await f.adapter.command({ op: 'send', text: 'oi', group: id });
  assert.deepEqual(socket.sent.at(-1), { jid: id, content: { text: '🦜 | oi' } });
  await assert.rejects(f.adapter.command({ op: 'send', text: 'oi', group: '120363999999999999@g.us' }), /desconhecido/);
});

test('adopt only accepts a group this account is in', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  socket.user = { id: '5511888888888:3@s.whatsapp.net' };
  socket.groupMetadata = async id => ({ id, participants: id.startsWith('1203630') ? [{ id: '5511888888888@s.whatsapp.net' }] : [{ id: '5511777777777@s.whatsapp.net' }] });
  socket.ev.emit('connection.update', { connection: 'open' });
  assert.equal(await f.adapter.command({ op: 'adopt', group: '120363000000000001@g.us' }), '120363000000000001@g.us');
  await f.adapter.command({ op: 'send', text: 'oi', group: '120363000000000001@g.us' });
  await assert.rejects(f.adapter.command({ op: 'adopt', group: '999999999999@g.us' }), /não está/);
});

test('group messages count only in known groups and only from the authorized number', async t => {
  const f = setup(); t.after(f.adapter.close); const socket = f.sockets[0];
  socket.ev.emit('connection.update', { connection: 'open' });
  const id = await f.adapter.command({ op: 'group', subject: 'Equipe', participants: ['5511888888888'] });
  const msg = (key, text = 'pedido') => ({ key: { remoteJid: id, fromMe: false, ...key }, message: { conversation: text } });
  socket.ev.emit('messages.upsert', { type: 'notify', messages: [
    msg({ id: 'owner', participant: `${OWNER}@s.whatsapp.net` }),
    msg({ id: 'bot', participant: '5511888888888@s.whatsapp.net' }),
    msg({ id: 'unknown-group', remoteJid: '120363999999999999@g.us', participant: `${OWNER}@s.whatsapp.net` }),
    msg({ id: 'self', participant: `${OWNER}@s.whatsapp.net`, fromMe: true }),
  ] });
  await tick(); await tick();
  assert.deepEqual(f.events.filter(e => e.type === 'message').map(e => [e.id, e.group]), [['owner', id]]);
});

test('several authorized numbers: any of them may talk, replies go to the one asked for', async t => {
  const sockets = [], events = [];
  const adapter = whatsapp({ state: {}, reset: async () => {}, saveCreds: async () => {} }, e => events.push(e), () => [OWNER, '5521977776666'], 'pt', {
    makeSocket: config => { const socket = { config, ev: new EventEmitter(), end() {}, sent: [], async sendMessage(jid, content) { socket.sent.push({ jid, content }); return { key: { id: `m-${socket.sent.length}` } }; } }; sockets.push(socket); return socket; },
    toQR: async () => '', schedule: () => 0, cancel() {},
  });
  t.after(adapter.close);
  const socket = sockets[0];
  socket.ev.emit('connection.update', { connection: 'open' });
  const msg = (id, jid) => ({ key: { id, remoteJid: jid, fromMe: false }, message: { conversation: 'oi' } });
  socket.ev.emit('messages.upsert', { type: 'notify', messages: [msg('a', `${OWNER}@s.whatsapp.net`), msg('b', '5521977776666@s.whatsapp.net'), msg('c', '5511000000000@s.whatsapp.net')] });
  await tick(); await tick();
  assert.deepEqual(events.filter(e => e.type === 'message').map(e => [e.id, e.from]), [['a', undefined], ['b', '5521977776666']]);
  await adapter.command({ op: 'send', text: 'resposta', to: '5521977776666' });
  assert.equal(socket.sent.at(-1).jid, '5521977776666@s.whatsapp.net');
  await adapter.command({ op: 'send', text: 'padrão' });
  assert.equal(socket.sent.at(-1).jid, `${OWNER}@s.whatsapp.net`);
  await assert.rejects(adapter.command({ op: 'send', text: 'x', to: '5511000000000' }), /não autorizado/);
  assert.equal(validateCommand({ id: 'a', op: 'send', text: 'x', to: '5521977776666' }).op, 'send');
  assert.throws(() => validateCommand({ id: 'a', op: 'send', text: 'x', to: 'abc' }));
});

test('commands keep a strict shape', () => {
  assert.equal(validateCommand({ id: 'a', op: 'adopt', group: '120363000000000001@g.us' }).op, 'adopt');
  assert.throws(() => validateCommand({ id: 'a', op: 'adopt', group: 'x@s.whatsapp.net' }));
  assert.equal(validateCommand({ id: 'a', op: 'logout' }).op, 'logout');
  assert.throws(() => validateCommand({ id: 'a', op: 'logout', number: '1' }));
  assert.equal(validateCommand({ id: 'a', op: 'group', subject: 'Equipe', participants: ['5511888888888'] }).op, 'group');
  assert.throws(() => validateCommand({ id: 'a', op: 'group', subject: 'x', participants: [] }));
  assert.throws(() => validateCommand({ id: 'a', op: 'group', subject: 'x', participants: ['abc'] }));
  assert.throws(() => validateCommand({ id: 'a', op: 'group', subject: 'x', participants: Array.from({ length: 11 }, (_, i) => `55119999999${String(i).padStart(2, '0')}`) }));
  assert.equal(validateCommand({ id: 'a', op: 'send', text: 'oi', group: '120363000000000001@g.us' }).op, 'send');
  assert.throws(() => validateCommand({ id: 'a', op: 'send', text: 'oi', group: '5511999999999@s.whatsapp.net' }));
});

test('the group store keeps only valid ids, survives reloads and caps its size', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'zap-groups-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'groups.json');
  const store = await groupStore(path);
  await store.add('120363000000000001@g.us');
  await store.add('not-a-group');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), ['120363000000000001@g.us']);
  for (let i = 0; i < 60; i++) await store.add(`1203630000000${String(i).padStart(5, '0')}@g.us`);
  const again = await groupStore(path);
  assert.equal(again.list().length, 50);
  assert.equal(again.has('120363000000000001@g.us'), false);
});
