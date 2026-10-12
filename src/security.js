import { createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
export const deriveKey = (password) => scryptSync(password, 'arara-zap/v1', 32);
export const proof = (key, nonce, number) => createHmac('sha256', key).update(`arara-zap/v1:${nonce}:${number}`).digest('hex');
export function verify(key, nonce, number, value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(proof(key, nonce, number), 'hex'), Buffer.from(value, 'hex'));
}
export function authorized(jid, number) { return jid === `${number}@s.whatsapp.net`; }
export function validateCommand(m) {
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !/^[\w-]{1,80}$/.test(m.id)) throw Error('Invalid request');
  const allowed = m.op === 'send' ? ['id', 'op', 'text'] : ['id', 'op', 'title', 'values'];
  if (Object.keys(m).some(k => !allowed.includes(k))) throw Error('Invalid request');
  if (m.op === 'send' && typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 3500) return m;
  if (m.op === 'poll' && typeof m.title === 'string' && m.title.length <= 200 && Array.isArray(m.values) && m.values.length >= 2 && m.values.length <= 12 && new Set(m.values).size === m.values.length && m.values.every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)) return m;
  throw Error('Invalid request');
}
