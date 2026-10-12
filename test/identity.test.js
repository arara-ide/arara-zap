import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappIdentity } from '../src/identity.js';
test('only WhatsApp-confirmed identity aliases authorize the sender and destination', async () => {
  let lookups = 0;
  const canonical = '551188888888@s.whatsapp.net';
  const identity = whatsappIdentity({ onWhatsApp: async number => {
    lookups++; assert.equal(number, '5511988888888@s.whatsapp.net'); return [{ exists: true, jid: canonical }];
  } }, '5511988888888');
  assert.equal(await identity.accepts({ remoteJid: '123@lid', remoteJidAlt: canonical }), true);
  assert.equal(await identity.accepts({ remoteJid: '551188888888:4@s.whatsapp.net' }), true);
  assert.equal(await identity.destination(), canonical); assert.equal(lookups, 1);
  for (const key of [
    { remoteJid: '551177777777@s.whatsapp.net' },
    { remoteJid: '123@g.us', remoteJidAlt: canonical },
    { remoteJid: canonical, fromMe: true },
    { remoteJid: '999@lid' },
  ]) assert.equal(await identity.accepts(key), false);
});
test('LIDs without alternate number use Baileys authenticated mapping', async () => {
  const identity = whatsappIdentity({ signalRepository: { lidMapping: { getPNForLID: async lid => lid === '123@lid' ? '5511999999999:0@s.whatsapp.net' : null } } }, '5511999999999');
  assert.equal(await identity.accepts({ remoteJid: '123@lid' }), true);
  assert.equal(await identity.accepts({ remoteJid: '456@lid' }), false);
});
test('lookup failure never guesses ninth-digit equivalence or accepts another number', async () => {
  for (const onWhatsApp of [async () => [], async () => { throw Error('offline'); }]) {
    const identity = whatsappIdentity({ onWhatsApp }, '5511988888888');
    assert.equal(await identity.accepts({ remoteJid: '551188888888@s.whatsapp.net' }), false);
    await assert.rejects(identity.destination());
  }
});
test('self chat accepts the account own messages only when it is the configured destination', async () => {
  const self = whatsappIdentity({ user: { id: '5511999999999:4@s.whatsapp.net' } }, '5511999999999');
  assert.equal(await self.selfChat(), true);
  assert.equal(await self.accepts({ remoteJid: '5511999999999@s.whatsapp.net', fromMe: true }), true);
  assert.equal(await self.accepts({ remoteJid: '5511888888888@s.whatsapp.net', fromMe: true }), false);
  const other = whatsappIdentity({ user: { id: '5511888888888@s.whatsapp.net' } }, '5511999999999');
  assert.equal(await other.selfChat(), false);
  assert.equal(await other.accepts({ remoteJid: '5511999999999@s.whatsapp.net', fromMe: true }), false);
});
