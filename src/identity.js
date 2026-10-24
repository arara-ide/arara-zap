import { jidNormalizedUser } from '@whiskeysockets/baileys';

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
  const selfChat = async () => {
    const account = jidNormalizedUser(socket.user?.id || '');
    return account.endsWith('@s.whatsapp.net') && account === await destination();
  };
  const resolveSender = async (primary, alternative) => {
    let sender = jidNormalizedUser(primary || '');
    if (sender.endsWith('@lid')) {
      const alt = jidNormalizedUser(alternative || '');
      sender = alt.endsWith('@s.whatsapp.net') ? alt : jidNormalizedUser(await socket.signalRepository?.lidMapping?.getPNForLID(sender) || '');
    }
    return sender.endsWith('@s.whatsapp.net') ? sender : '';
  };
  const isAuthorized = async sender => {
    if (!sender) return false;
    if (sender === configured) return true;
    try { return sender === await destination(); } catch { return false; }
  };
  const acceptsGroup = async (key, groups) => {
    const group = key.remoteJid || '';
    if (!group.endsWith('@g.us') || !groups.has(group) || key.fromMe) return false;
    return isAuthorized(await resolveSender(key.participant, key.participantAlt));
  };
  return { destination, selfChat, acceptsGroup, async accepts(key) {
    if (key.fromMe && !await selfChat().catch(() => false)) return false;
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
