import { readFile, writeFile, rename } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
// One encrypted atomic snapshot; serialized writes prevent lost key updates.
export async function authStore(path, key) {
  let data;
  try {
    const raw = await readFile(path);
    const cipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    cipher.setAuthTag(raw.subarray(12, 28));
    data = JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString(), BufferJSON.reviver);
  } catch (e) { if (e.code !== 'ENOENT') throw Error('Cannot decrypt WhatsApp session; restore the original password.'); data = { creds: initAuthCreds(), keys: {} }; }
  let chain = Promise.resolve();
  const save = () => {
    const snapshot = JSON.stringify(data, BufferJSON.replacer);
    chain = chain.then(async () => {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(snapshot), cipher.final()]);
      await writeFile(`${path}.tmp`, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    });
    return chain;
  };
  return { state: { creds: data.creds, keys: {
    get: async (type, ids) => Object.fromEntries(ids.map(id => { let value = data.keys[`${type}:${id}`]; if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value); return [id, value]; })),
    set: async changes => { for (const [type, entries] of Object.entries(changes)) for (const [id, value] of Object.entries(entries)) { if (value) data.keys[`${type}:${id}`] = value; else delete data.keys[`${type}:${id}`]; } await save(); },
  } }, saveCreds: save, flush: () => chain };
}
