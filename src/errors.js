import { t } from './i18n.mjs';

export function startupError(error, locale, { host = '127.0.0.1', port } = {}) {
  if (error?.code === 'EADDRINUSE') return t(locale, 'portInUse', { port: error.port ?? port ?? '' });
  if (error?.code === 'EACCES') {
    if (error.syscall === 'listen') return t(locale, 'portPermission', { host, port: error.port ?? port ?? '' });
    return t(locale, 'permissionDenied');
  }
  return error?.message || String(error);
}
