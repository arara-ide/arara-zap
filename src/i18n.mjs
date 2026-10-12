/*! @license
MIT License

Copyright (c) 2026 Gabriel Rodrigues

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export function language(locale = 'en') {
  const base = String(locale).toLowerCase().split(/[-_]/)[0];
  return ['en', 'pt', 'es'].includes(base) ? base : 'en';
}
const messages = {
  en: {
    checking: 'Checking GitHub for updates…', installing: 'Installing update…', updated: 'Updated to {version}.', offline: 'Could not check GitHub. Starting the installed version.', dirty: 'Local changes detected. Automatic update skipped.', docker: 'A newer Docker image is available: {version}. Pull the image and recreate the container.',
    busy: 'Arara Zap is already running.', invalid: 'Invalid Arara Zap installation.', failed: 'Update failed; the previous installation was preserved.', cancelled: 'Update cancelled.',
    listening: 'Arara Zap listening on {host}:{port}. Connect through Arara Code → WhatsApp.', storage: 'Session storage failed.', passwordRequired: 'ZAP_PASSWORD (at least 24 characters) is required on servers.', passwordLength: 'ZAP_PASSWORD must contain 24–1024 characters.', invalidNumber: 'Invalid ZAP_ALLOWED_NUMBER.',
    connected: 'WhatsApp connected', waiting: 'Waiting for WhatsApp', reconnecting: 'Reconnecting to WhatsApp…', loggedOut: 'Session ended. Stop the service and remove session.enc to pair again.', sendFailed: 'Could not send to WhatsApp.', decrypt: 'Cannot decrypt the WhatsApp session; restore the original password.', notStarted: 'Not started yet.',
    authFailed: 'Authentication failed', limit: 'Request limit', invalidRequest: 'Invalid request', stopped: 'Service stopped', disconnected: 'WhatsApp disconnected', lock: 'Arara Zap is already running, or a previous session was interrupted. Check the service before removing process.lock.',
  },
  pt: {
    checking: 'Verificando atualizações no GitHub…', installing: 'Instalando atualização…', updated: 'Atualizado para {version}.', offline: 'Não foi possível consultar o GitHub. Iniciando a versão instalada.', dirty: 'Alterações locais detectadas. Atualização automática ignorada.', docker: 'Uma imagem Docker mais recente está disponível: {version}. Baixe a imagem e recrie o container.',
    busy: 'Arara Zap já está em execução.', invalid: 'Instalação do Arara Zap inválida.', failed: 'Falha na atualização; a instalação anterior foi preservada.', cancelled: 'Atualização cancelada.',
    listening: 'Arara Zap ouvindo em {host}:{port}. Conecte pelo Arara Code → WhatsApp.', storage: 'Falha ao salvar sessão.', passwordRequired: 'ZAP_PASSWORD (pelo menos 24 caracteres) é obrigatória em servidores.', passwordLength: 'ZAP_PASSWORD deve ter de 24 a 1024 caracteres.', invalidNumber: 'ZAP_ALLOWED_NUMBER inválido.',
    connected: 'WhatsApp conectado', waiting: 'Aguardando WhatsApp', reconnecting: 'Reconectando WhatsApp…', loggedOut: 'Sessão encerrada. Pare o serviço e remova session.enc para parear novamente.', sendFailed: 'Não foi possível enviar ao WhatsApp.', decrypt: 'Não foi possível decifrar a sessão do WhatsApp; restaure a senha original.', notStarted: 'Não foi iniciado ainda.',
    authFailed: 'Autenticação inválida', limit: 'Limite de requisições', invalidRequest: 'Requisição inválida', stopped: 'Serviço encerrado', disconnected: 'WhatsApp desconectado', lock: 'Arara Zap já está em execução, ou a sessão anterior foi interrompida. Confira o serviço antes de remover process.lock.',
  },
  es: {
    checking: 'Buscando actualizaciones en GitHub…', installing: 'Instalando actualización…', updated: 'Actualizado a {version}.', offline: 'No se pudo consultar GitHub. Iniciando la versión instalada.', dirty: 'Se detectaron cambios locales. Se omitió la actualización automática.', docker: 'Hay una imagen Docker más reciente: {version}. Descargue la imagen y vuelva a crear el contenedor.',
    busy: 'Arara Zap ya está en ejecución.', invalid: 'Instalación de Arara Zap inválida.', failed: 'La actualización falló; se conservó la instalación anterior.', cancelled: 'Actualización cancelada.',
    listening: 'Arara Zap escuchando en {host}:{port}. Conecte desde Arara Code → WhatsApp.', storage: 'Error al guardar la sesión.', passwordRequired: 'ZAP_PASSWORD (al menos 24 caracteres) es obligatoria en servidores.', passwordLength: 'ZAP_PASSWORD debe tener entre 24 y 1024 caracteres.', invalidNumber: 'ZAP_ALLOWED_NUMBER no válido.',
    connected: 'WhatsApp conectado', waiting: 'Esperando WhatsApp', reconnecting: 'Reconectando WhatsApp…', loggedOut: 'Sesión cerrada. Detenga el servicio y elimine session.enc para vincularlo de nuevo.', sendFailed: 'No se pudo enviar a WhatsApp.', decrypt: 'No se pudo descifrar la sesión de WhatsApp; restaure la contraseña original.', notStarted: 'No se ha iniciado todavía.',
    authFailed: 'Autenticación fallida', limit: 'Límite de solicitudes', invalidRequest: 'Solicitud no válida', stopped: 'Servicio detenido', disconnected: 'WhatsApp desconectado', lock: 'Arara Zap ya está en ejecución, o la sesión anterior fue interrumpida. Compruebe el servicio antes de eliminar process.lock.',
  },
};
export function t(locale, key, values = {}) {
  const selected = messages[language(locale)];
  let text = selected[key] || messages.en[key] || key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
export const messageKeys = Object.keys(messages.en);
