import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { language, t } from './i18n.mjs';
import { deriveKey } from './security.js';
import { authStore } from './auth-store.js';
import { whatsapp } from './whatsapp.js';
import { createZapServer } from './server.js';
import { acquireProcessLock } from './process-lock.mjs';
process.umask(0o077);
const locale = language(process.env.ZAP_LANG || process.env.LC_ALL || process.env.LANG);
const host = process.env.ZAP_HOST || '127.0.0.1';
const local = ['127.0.0.1', '::1'].includes(host);
const dir = process.env.ZAP_DATA_DIR || join(homedir(), '.arara-zap');
await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700);
const lock = join(dir, 'process.lock');
let releaseLock;
try { releaseLock = acquireProcessLock(lock, t(locale, 'lock')); } catch (error) { console.error(error.message); process.exit(1); }
let zap;
try {
  let password = process.env.ZAP_PASSWORD;
  if (!password && !local) throw Error(t(locale, 'passwordRequired'));
  if (!password) {
    try { password = await readFile(join(dir, 'local-secret'), 'utf8'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; password = randomBytes(32).toString('hex'); await writeFile(join(dir, 'local-secret'), password, { mode: 0o600, flag: 'wx' }); }
  }
  if (password.length < 24 || password.length > 1024) throw Error(t(locale, 'passwordLength'));
  if (process.env.ZAP_ALLOWED_NUMBER && !/^\d{10,15}$/.test(process.env.ZAP_ALLOWED_NUMBER)) throw Error(t(locale, 'invalidNumber'));
  const key = deriveKey(password), auth = await authStore(join(dir, 'session.enc'), key, locale);
  zap = createZapServer({ key, host, locale, port: Number(process.env.ZAP_PORT || 7310), number: process.env.ZAP_ALLOWED_NUMBER, adapterFactory: (emit, allowed, clientLocale) => whatsapp(auth, emit, allowed, clientLocale) });
  const address = await zap.listen();
  if (local) await writeFile(join(dir, 'connection.json'), JSON.stringify({ version: 1, url: `ws://${host === '::1' ? '[::1]' : host}:${address.port}/zap`, password }), { mode: 0o600 });
  if (local) await chmod(join(dir, 'connection.json'), 0o600);
  console.log(t(locale, 'listening', { host, port: address.port }));
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await zap.close(); await auth.flush().catch(() => console.error(t(locale, 'storage'))); if (local) await unlink(join(dir, 'connection.json')).catch(() => {}); releaseLock(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  process.on('message', message => { if (message?.type === 'stop') void stop(); });
} catch (e) { await zap?.close(); releaseLock(); console.error(e.message); process.exitCode = 1; }
