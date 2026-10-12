import { jidNormalizedUser } from '@whiskeysockets/baileys';

// Resolve only the configured number through WhatsApp. Never guess phone-number aliases.
export function whatsappIdentity(socket, number) {
  const configured = `${number}@s.whatsapp.net`;
  let lookup;
  const destination = () => lookup ||= (async () => {
    if (!socket.onWhatsApp) return configured;
    const results = await socket.onWhatsApp(configured);
    const matches = results?.filter(result => result.exists && result.jid?.endsWith('@s.whatsapp.net')) || [];
    if (matches.length !== 1) throw Error('Authorized WhatsApp number could not be resolved');
    return jidNormalizedUser(matches[0].jid);
  })();
  return { destination, async accepts(key) {
    if (key.fromMe) return false;
    const primary = jidNormalizedUser(key.remoteJid || '');
    if (!primary.endsWith('@s.whatsapp.net') && !primary.endsWith('@lid')) return false;
    let sender = primary;
    if (primary.endsWith('@lid')) {
      sender = jidNormalizedUser(key.remoteJidAlt || '');
      if (!sender.endsWith('@s.whatsapp.net')) {
        sender = jidNormalizedUser(await socket.signalRepository?.lidMapping?.getPNForLID(primary) || '');
      }
    }
    if (!sender.endsWith('@s.whatsapp.net')) return false;
    if (sender === configured) return true;
    try { return sender === await destination(); } catch { return false; }
  } };
}
