import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHmac, createCipheriv, createHash, randomBytes } from 'node:crypto';
import { proto } from '@whiskeysockets/baileys';
import { whatsapp } from '../src/whatsapp.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
for (const addressing of ['lid', 'pn']) test(`encrypted ${addressing} upsert votes reach the menu once; unauthorized and tampered votes fail closed`, async t => {
  const secret = randomBytes(32), events = [], ev = new EventEmitter();
  const number = '5511999999999';
  const creator = addressing === 'lid' ? '100@lid' : '5511888888888@s.whatsapp.net';
  const voter = addressing === 'lid' ? '200@lid' : `${number}@s.whatsapp.net`;
  const socket = { ev, user: { id: '5511888888888:2@s.whatsapp.net' }, end() {},
    async sendMessage() { return { key: { id: 'poll-real' }, message: { messageContextInfo: { messageSecret: secret }, pollCreationMessageV3: { options: [{ optionName: 'Projeto' }, { optionName: 'Outro' }] } } }; } };
  const adapter = whatsapp({ state: { creds: { me: { lid: '100@lid' } } }, saveCreds: async () => {} }, e => events.push(e), () => number, 'pt', { makeSocket: () => socket });
  t.after(adapter.close); ev.emit('connection.update', { connection: 'open' });
  await adapter.command({ op: 'poll', title: 'Projeto', values: ['Projeto', 'Outro'] });
  const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
  const key = hmac(hmac(Buffer.alloc(32), secret), Buffer.concat([Buffer.from('poll-real' + creator + voter + 'Poll Vote'), Buffer.from([1])]));
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('poll-real\0' + voter));
  const payload = proto.Message.PollVoteMessage.encode({ selectedOptions: [createHash('sha256').update('Projeto').digest()] }).finish();
  const encPayload = Buffer.concat([cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
  const message = (id, alt = `${number}@s.whatsapp.net`, encrypted = encPayload) => ({ key: { id, remoteJid: alt === '5511777777777@s.whatsapp.net' ? alt : voter, remoteJidAlt: alt }, message: { pollUpdateMessage: { pollCreationMessageKey: { id: 'poll-real', fromMe: true }, vote: { encPayload: encrypted, encIv: iv } } } });
  for (const m of [message('wrong', '5511777777777@s.whatsapp.net'), message('tampered', undefined, Buffer.alloc(encPayload.length)), message('valid'), message('valid')]) {
    ev.emit('messages.upsert', { type: 'notify', messages: [m] }); await tick();
  }
  assert.deepEqual(events.filter(e => e.poll), [{ type: 'message', id: 'valid', text: '', poll: { id: 'poll-real', option: 'Projeto' } }]);
});
