import { t } from './i18n.mjs';
import makeWASocket, { DisconnectReason, decryptPollVote, jidNormalizedUser, normalizeMessageContent, getAggregateVotesInPollMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { whatsappIdentity } from './identity.js';
import { imageMatches, MAX_IMAGE_BYTES } from './security.js';
export function whatsapp(auth, emit, allowed, locale = 'en', deps = {}) {
  const makeSocket = deps.makeSocket || makeWASocket, toQR = deps.toQR || QRCode.toDataURL, aggregate = deps.aggregate || getAggregateVotesInPollMessage;
  const schedule = deps.schedule || setTimeout, cancel = deps.cancel || clearTimeout;
  const debug = value => { if (process.env.ZAP_DEBUG === '1') console.log(`[zap-debug] ${value}`); };
  let epoch = 0;
  let socket, identity, timer, closed = false, ready = false, qr, retry = 0;
  const polls = new Map(), seen = new Map(), sentTexts = new Map();
  const prefix = text => text.startsWith('🦜 | ') ? text : `🦜 | ${text}`;
  const remember = id => { if (!id || seen.has(id)) return false; seen.set(id, Date.now()); if (seen.size > 2000) seen.delete(seen.keys().next().value); return true; };
  const start = () => {
    if (closed) return;
    const current = ++epoch;
    socket = makeSocket({ auth: auth.state, logger: pino({ level: 'silent' }), syncFullHistory: false, markOnlineOnConnect: false, getMessage: async key => polls.get(key.id)?.message });
    const currentSocket = socket;
    const currentIdentity = identity = whatsappIdentity(socket, allowed());
    socket.ev.on('creds.update', () => { if (!closed && current === epoch) void auth.saveCreds().catch(() => { emit({ type: 'status', status: t(locale, 'storage') }); close(); }); });
    socket.ev.on('connection.update', async update => {
      if (closed || current !== epoch) return;
      if (update.qr) { qr = await toQR(update.qr); if (!closed && current === epoch) emit({ type: 'qr', qr }); }
      if (update.connection === 'open') { ready = true; qr = undefined; retry = 0; emit({ type: 'qr', qr: null }); emit({ type: 'status', status: t(locale, 'connected') }); }
      if (update.connection === 'close') {
        ready = false; qr = undefined; emit({ type: 'qr', qr: null });
        const code = update.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          // Invalidate the revoked socket before awaiting storage; late events cannot restore it.
          const resetting = ++epoch;
          cancel(timer); polls.clear(); seen.clear(); sentTexts.clear(); retry = 0;
          emit({ type: 'status', status: t(locale, 'loggedOut') });
          try {
            await auth.reset();
            if (!closed && epoch === resetting) start();
          } catch {
            if (!closed && epoch === resetting) { emit({ type: 'status', status: t(locale, 'storage') }); close(); }
          }
          return;
        }
        emit({ type: 'status', status: t(locale, 'reconnecting') });
        cancel(timer);
        timer = schedule(start, Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)));
      }
    });
    socket.ev.on('messages.upsert', async ({ type, messages }) => {
      if (type !== 'notify' || closed || current !== epoch) return;
      for (const m of messages) {
        if (!await currentIdentity.accepts(m.key).catch(() => false) || closed || current !== epoch || !remember(m.key.id)) continue;
        const content = normalizeMessageContent(m.message);
        const poll = content?.pollUpdateMessage;
        if (poll) {
          const original = polls.get(poll.pollCreationMessageKey?.id);
          if (!original || !poll.vote || !original.message?.messageContextInfo?.messageSecret) { debug('poll-vote unavailable-original'); continue; }
          // Baileys 7 delivers encrypted votes as upserts, without emitting pollUpdates.
          // PN and LID are distinct cryptographic identities; use only this account and
          // the already-authorized sender, and require authenticated decryption.
          const creators = [...new Set([currentSocket.user?.id, currentSocket.user?.lid, auth.state.creds?.me?.id, auth.state.creds?.me?.lid].filter(Boolean).map(jidNormalizedUser))];
          const voters = [...new Set([m.key.remoteJid, m.key.remoteJidAlt].filter(Boolean).map(jidNormalizedUser))];
          let vote;
          for (const pollCreatorJid of creators) {
            for (const voterJid of voters) {
              try { vote = decryptPollVote(poll.vote, { pollCreatorJid, voterJid, pollMsgId: original.key.id, pollEncKey: original.message.messageContextInfo.messageSecret }); break; }
              catch { /* Try the other authenticated address representation. */ }
            }
            if (vote) break;
          }
          if (!vote) { debug('poll-vote decryption-failed'); continue; }
          try {
            const result = await aggregate({ message: original.message, pollUpdates: [{ pollUpdateMessageKey: m.key, vote }] });
            const selected = result.filter(v => v.voters?.length);
            if (!closed && current === epoch && selected.length === 1 && selected[0].name !== 'Unknown') {
              emit({ type: 'message', id: m.key.id, text: '', poll: { id: original.key.id, option: selected[0].name } });
              debug('poll-vote forwarded');
            } else debug('poll-vote rejected-selection');
          } catch { debug('poll-vote malformed'); }
          continue;
        }
        const text = content?.conversation || content?.extendedTextMessage?.text;
        if (typeof text === 'string' && text.length <= 16000 && !(m.key.fromMe && text.startsWith('🦜 | '))) emit({ type: 'message', id: m.key.id, text });
      }
    });
    socket.ev.on('messages.update', async updates => {
      for (const { key, update } of updates) {
        const original = polls.get(key.id);
        if (!original || !update.pollUpdates || closed || current !== epoch) continue;
        // Decryption uses the original poll's secret through getMessage above.
        for (const vote of update.pollUpdates) {
          if (!vote.pollUpdateMessageKey || !await currentIdentity.accepts(vote.pollUpdateMessageKey).catch(() => false) || closed || current !== epoch || !remember(vote.pollUpdateMessageKey.id)) continue;
          try {
            const result = await aggregate({ message: original.message, pollUpdates: [vote] });
            const selected = result.filter(v => v.voters?.length);
            if (!closed && current === epoch && selected.length === 1 && selected[0].name !== 'Unknown') emit({ type: 'message', id: vote.pollUpdateMessageKey.id, text: '', poll: { id: key.id, option: selected[0].name } });
          } catch { /* Reject malformed or undecipherable votes. */ }
        }
      }
    });
  };
  const close = () => { if (closed) return; closed = true; ready = false; qr = undefined; epoch++; cancel(timer); sentTexts.clear(); socket?.end(new Error(t(locale, 'stopped'))); };
  start();
  return { close, snapshot: () => ({ ready, qr }), async command(m) {
    if (!ready) throw Error(t(locale, 'disconnected'));
    const current = epoch, target = socket;
    const destination = await identity.destination();
    if (closed || !ready || current !== epoch) throw Error(t(locale, 'disconnected'));
    if (m.op === 'edit') {
      const previous = sentTexts.get(m.messageId);
      if (!previous || previous.destination !== destination || previous.socket !== target || !m.text.startsWith(previous.text)) throw Error('Mensagem anterior indisponível para edição.');
      if (prefix(m.text).length > 3500) throw Error('Mensagem editada excede o limite.');
      await target.sendMessage(destination, { text: prefix(m.text), edit: previous.key });
      previous.text = m.text;
      debug('outgoing-completed edit');
      return null;
    }
    if (m.op === 'image') {
      const image = Buffer.from(m.data, 'base64');
      if (image.length > MAX_IMAGE_BYTES || !imageMatches(image, m.mimeType)) throw Error('Imagem inválida.');
      const sent = await target.sendMessage(destination, { image, mimetype: m.mimeType, caption: prefix(m.caption) });
      debug('outgoing-completed image');
      return sent.key.id;
    }
    const content = m.op === 'send' ? { text: prefix(m.text) } : { poll: { name: prefix(m.title), values: m.values, selectableCount: 1 } };
    const result = await target.sendMessage(destination, content);
    debug(`outgoing-completed ${m.op}`);
    if (m.op === 'poll') { polls.set(result.key.id, result); if (polls.size > 100) polls.delete(polls.keys().next().value); }
    if (m.op === 'send') { sentTexts.set(result.key.id, { key: result.key, text: m.text, destination, socket: target }); if (sentTexts.size > 100) sentTexts.delete(sentTexts.keys().next().value); }
    return result.key.id;
  } };
}
