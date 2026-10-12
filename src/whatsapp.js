import makeWASocket, { DisconnectReason, getAggregateVotesInPollMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { authorized } from './security.js';
export function whatsapp(auth, emit, allowed) {
  let epoch = 0;
  let socket, timer, closed = false, ready = false, qr, retry = 0;
  const polls = new Map(), seen = new Map();
  const remember = id => { if (!id || seen.has(id)) return false; seen.set(id, Date.now()); if (seen.size > 2000) seen.delete(seen.keys().next().value); return true; };
  const start = () => {
    const current = ++epoch;
    socket = makeWASocket({ auth: auth.state, logger: pino({ level: 'silent' }), syncFullHistory: false, markOnlineOnConnect: false, getMessage: async key => polls.get(key.id)?.message });
    socket.ev.on('creds.update', () => auth.saveCreds().catch(() => { emit({ type: 'status', status: 'Falha ao salvar sessão' }); close(); }));
    socket.ev.on('connection.update', async update => {
      if (closed || current !== epoch) return;
      if (update.qr) { qr = await QRCode.toDataURL(update.qr); if (!closed && current === epoch) emit({ type: 'qr', qr }); }
      if (update.connection === 'open') { ready = true; qr = undefined; retry = 0; emit({ type: 'qr', qr: null }); emit({ type: 'status', status: 'WhatsApp conectado' }); }
      if (update.connection === 'close') {
        ready = false; qr = undefined; emit({ type: 'qr', qr: null });
        const code = update.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) { emit({ type: 'status', status: 'Sessão encerrada. Pare o serviço e remova session.enc para parear novamente.' }); return; }
        emit({ type: 'status', status: 'Reconectando WhatsApp…' });
        timer = setTimeout(start, Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)));
      }
    });
    socket.ev.on('messages.upsert', ({ type, messages }) => {
      if (type !== 'notify' || closed || current !== epoch) return;
      for (const m of messages) {
        const jid = m.key.remoteJid?.endsWith('@lid') ? m.key.remoteJidAlt : m.key.remoteJid;
        if (m.key.fromMe || !authorized(jid, allowed()) || !remember(m.key.id)) continue;
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text;
        if (typeof text === 'string' && text.length <= 16000) emit({ type: 'message', id: m.key.id, text });
      }
    });
    socket.ev.on('messages.update', async updates => {
      for (const { key, update } of updates) {
        const original = polls.get(key.id);
        if (!original || !update.pollUpdates || closed || current !== epoch) continue;
        // Decryption uses the original poll's secret through getMessage above.
        for (const vote of update.pollUpdates) {
          const voter = vote.pollUpdateMessageKey?.remoteJid?.endsWith('@lid') ? vote.pollUpdateMessageKey.remoteJidAlt : vote.pollUpdateMessageKey?.remoteJid;
          if (vote.pollUpdateMessageKey?.fromMe || !authorized(voter, allowed()) || !remember(vote.pollUpdateMessageKey?.id)) continue;
          try {
            const result = await getAggregateVotesInPollMessage({ message: original.message, pollUpdates: [vote] });
            const selected = result.filter(v => v.voters?.length);
            if (!closed && current === epoch && selected.length === 1 && selected[0].name !== 'Unknown') emit({ type: 'message', id: vote.pollUpdateMessageKey.id, text: '', poll: { id: key.id, option: selected[0].name } });
          } catch { /* Reject malformed or undecipherable votes. */ }
        }
      }
    });
  };
  const close = () => { closed = true; clearTimeout(timer); socket?.end(new Error('Service stopped')); };
  start();
  return { close, snapshot: () => ({ ready, qr }), async command(m) {
    if (!ready) throw Error('WhatsApp disconnected');
    const result = await socket.sendMessage(`${allowed()}@s.whatsapp.net`, m.op === 'send' ? { text: m.text } : { poll: { name: m.title, values: m.values, selectableCount: 1 } });
    if (m.op === 'poll') { polls.set(result.key.id, result); if (polls.size > 100) polls.delete(polls.keys().next().value); }
    return m.op === 'poll' ? result.key.id : null;
  } };
}
