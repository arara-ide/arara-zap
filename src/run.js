import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { language } from './i18n.mjs';
import { updateInstallation } from './update.mjs';
const directory = dirname(dirname(fileURLToPath(import.meta.url)));
try { process.loadEnvFile(join(directory, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const locale = language(process.env.ZAP_LANG || process.env.LC_ALL || process.env.LANG);
const controller = new AbortController();
let child;
const stop = () => { if (child?.connected) child.send({ type: 'stop' }); else if (child) child.kill('SIGTERM'); else controller.abort(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
process.on('message', message => { if (message?.type === 'stop') stop(); });
try {
  if (process.env.ZAP_SKIP_UPDATE !== '1') await updateInstallation({ directory, locale, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]), docker: process.env.ZAP_DOCKER === '1', report: console.log });
  controller.signal.throwIfAborted();
  // Fresh process loads the new files after a successful directory swap.
  child = spawn(process.execPath, [join(directory, 'src/index.js')], { cwd: directory, env: { ...process.env, ZAP_LANG: locale }, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
  child.once('error', () => { process.exitCode = 1; if (process.connected) process.disconnect(); });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); if (process.connected) process.disconnect(); });
} catch (error) { console.error(error.message); process.exitCode = 1; if (process.connected) process.disconnect(); }
