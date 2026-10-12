import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { deriveKey } from './security.js';
import { authStore } from './auth-store.js';
import { whatsapp } from './whatsapp.js';
import { createZapServer } from './server.js';
process.umask(0o077);
const host = process.env.ZAP_HOST || '127.0.0.1';
const local = ['127.0.0.1', '::1'].includes(host);
const dir = process.env.ZAP_DATA_DIR || join(homedir(), '.arara-zap');
await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700);
// Exclusive lock prevents two processes corrupting the same session.
const lock = join(dir, 'process.lock');
await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
let zap;
try {
  let password = process.env.ZAP_PASSWORD;
  if (!password && !local) throw Error('ZAP_PASSWORD (at least 24 characters) is required on servers.');
  if (!password) {
    try { password = await readFile(join(dir, 'local-secret'), 'utf8'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; password = randomBytes(32).toString('hex'); await writeFile(join(dir, 'local-secret'), password, { mode: 0o600, flag: 'wx' }); }
  }
  if (password.length < 24 || password.length > 1024) throw Error('ZAP_PASSWORD must contain 24–1024 characters.');
  if (process.env.ZAP_ALLOWED_NUMBER && !/^\d{10,15}$/.test(process.env.ZAP_ALLOWED_NUMBER)) throw Error('Invalid ZAP_ALLOWED_NUMBER');
  const key = deriveKey(password), auth = await authStore(join(dir, 'session.enc'), key);
  zap = createZapServer({ key, host, port: Number(process.env.ZAP_PORT || 7310), number: process.env.ZAP_ALLOWED_NUMBER, adapterFactory: (emit, allowed) => whatsapp(auth, emit, allowed) });
  const address = await zap.listen();
  if (local) await writeFile(join(dir, 'connection.json'), JSON.stringify({ version: 1, url: `ws://${host === '::1' ? '[::1]' : host}:${address.port}/zap`, password }), { mode: 0o600 });
  if (local) await chmod(join(dir, 'connection.json'), 0o600);
  console.log(`Arara Zap listening on ${host}:${address.port}. Connect through Arara Code → WhatsApp.`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await zap.close(); await auth.flush().catch(() => console.error('Session storage failed.')); await unlink(lock); if (local) await unlink(join(dir, 'connection.json')).catch(() => {}); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (e) { await zap?.close(); await unlink(lock).catch(() => {}); console.error(e.message); process.exitCode = 1; }
