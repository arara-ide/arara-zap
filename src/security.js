import { createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
export const deriveKey = (password) => scryptSync(password, 'arara-zap/v1', 32);
export const proof = (key, nonce, number) => createHmac('sha256', key).update(`arara-zap/v1:${nonce}:${number}`).digest('hex');
export function verify(key, nonce, number, value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(proof(key, nonce, number), 'hex'), Buffer.from(value, 'hex'));
}
export function authorized(jid, number) { return jid === `${number}@s.whatsapp.net`; }
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export function imageMatches(buf, mimeType) {
  const at = (i, ...b) => b.every((v, j) => buf[i + j] === v);
  const real = at(0, 0x89, 0x50, 0x4e, 0x47) ? 'image/png' : at(0, 0xff, 0xd8, 0xff) ? 'image/jpeg' : at(0, 0x47, 0x49, 0x46, 0x38) ? 'image/gif' : at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50) ? 'image/webp' : '';
  return real === mimeType;
}
export function validateCommand(m) {
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !/^[\w-]{1,80}$/.test(m.id)) throw Error('Invalid request');
  const allowed = m.op === 'send' ? ['id', 'op', 'text'] : m.op === 'edit' ? ['id', 'op', 'messageId', 'text'] : m.op === 'image' ? ['id', 'op', 'data', 'mimeType', 'caption'] : ['id', 'op', 'title', 'values'];
  if (Object.keys(m).some(k => !allowed.includes(k))) throw Error('Invalid request');
  const prefixedLength = text => text.startsWith('🦜 | ') ? text.length : text.length + '🦜 | '.length;
  if (m.op === 'send' && typeof m.text === 'string' && m.text.length > 0 && prefixedLength(m.text) <= 3500) return m;
  if (m.op === 'edit' && typeof m.messageId === 'string' && /^[\w-]{1,120}$/.test(m.messageId) && typeof m.text === 'string' && m.text.length > 0 && prefixedLength(m.text) <= 3500) return m;
  if (m.op === 'image' && typeof m.data === 'string' && m.data.length > 0 && m.data.length <= MAX_IMAGE_BASE64 && /^[A-Za-z0-9+/]+={0,2}$/.test(m.data) && IMAGE_TYPES.includes(m.mimeType) && typeof m.caption === 'string' && prefixedLength(m.caption) <= 1024) return m;
  if (m.op === 'poll' && typeof m.title === 'string' && m.title.length > 0 && prefixedLength(m.title) <= 200 && Array.isArray(m.values) && m.values.length >= 2 && m.values.length <= 12 && new Set(m.values).size === m.values.length && m.values.every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)) return m;
  throw Error('Invalid request');
}
