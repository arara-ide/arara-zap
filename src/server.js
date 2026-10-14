import { t, language } from './i18n.mjs';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { verify, validateCommand } from './security.js';
/** Antes do login só cabem mensagens pequenas; imagens (base64) só depois de autenticar. */
const MAX_UNAUTHENTICATED = 32768;
const MAX_MESSAGE = 12 * 1024 * 1024;
const serverVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export function createZapServer({ key, locale = 'en', host = '127.0.0.1', port = 7310, number, adapterFactory }) {
  let owner, allowed = number, adapter;
  const server = createServer((req, res) => { res.writeHead(404); res.end(); });
  server.maxConnections = 32; server.maxHeadersCount = 32; server.headersTimeout = 5000; server.requestTimeout = 5000; server.keepAliveTimeout = 1000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE, perMessageDeflate: false });
  let windowStart = Date.now(), attempts = 0;
  server.on('upgrade', (req, socket, head) => {
    if (Date.now() - windowStart > 60000) { attempts = 0; windowStart = Date.now(); }
    if (req.url !== '/zap' || req.headers.origin || owner || ++attempts > 30 || wss.clients.size >= 4) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const send = (ws, value) => { if (ws.readyState !== 1) return; if (ws.bufferedAmount > 65536) { ws.terminate(); return; } ws.send(JSON.stringify(value)); };
  wss.on('connection', ws => {
    const nonce = randomBytes(32).toString('hex');
    const timeout = setTimeout(() => ws.terminate(), 5000);
    let clientLocale = locale;
    let authenticated = false, processing = false, count = 0, since = Date.now();
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    send(ws, { type: 'challenge', version: 1, nonce });
    ws.on('message', async (raw, binary) => {
      try {
        if (binary) throw Error('Binary unsupported');
        if (!authenticated && raw.length > MAX_UNAUTHENTICATED) throw Error('Too large');
        const m = JSON.parse(raw.toString());
        if (!authenticated) {
          if (m.type !== 'auth' || !/^\d{10,15}$/.test(m.number) || (number && number !== m.number) || !verify(key, nonce, m.number, m.proof) || owner) { ws.close(1008, t(locale, 'authFailed')); return; }
          clientLocale = language(m.locale || locale);
          authenticated = true; clearTimeout(timeout); owner = ws; allowed = m.number;
          send(ws, { type: 'ready', serverVersion, features: ['image'] });
          adapter ||= adapterFactory(value => { if (owner) send(owner, value); }, () => allowed, clientLocale);
          const snapshot = adapter.snapshot();
          if (snapshot.qr) send(ws, { type: 'qr', qr: snapshot.qr });
          send(ws, { type: 'status', status: t(clientLocale, snapshot.ready ? 'connected' : 'waiting') });
          return;
        }
        if (Date.now() - since > 60000) { since = Date.now(); count = 0; }
        if (++count > 120 || processing) { ws.close(1008, t(locale, 'limit')); return; }
        validateCommand(m); processing = true;
        try { const result = await adapter.command(m); send(ws, { type: 'result', id: m.id, result }); }
        catch { send(ws, { type: 'result', id: m.id, error: t(clientLocale, 'sendFailed') }); }
        finally { processing = false; }
      } catch { ws.close(1008, t(locale, 'invalidRequest')); }
    });
    ws.on('error', () => {});
    ws.on('close', () => { clearTimeout(timeout); if (owner === ws) { owner = undefined; adapter?.close(); adapter = undefined; } });
  });
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } } }, 15000);
  return { server, async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); return server.address(); }, async close() { clearInterval(heartbeat); adapter?.close(); for (const ws of wss.clients) ws.terminate(); wss.close(); await new Promise(resolve => server.close(resolve)); } };
}
