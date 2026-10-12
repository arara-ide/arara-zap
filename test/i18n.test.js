import test from 'node:test';
import assert from 'node:assert/strict';
import { language, messageKeys, t } from '../src/i18n.mjs';
test('locale follows IDE language, regional variants and English fallback', () => {
  for (const [input, expected] of [['pt-BR', 'pt'], ['pt_PT', 'pt'], ['es-MX', 'es'], ['en-US', 'en'], ['de-DE', 'en'], ['fr', 'en'], ['', 'en']]) assert.equal(language(input), expected);
});
test('all runtime/update messages exist in English, Portuguese and Spanish', () => {
  for (const locale of ['en', 'pt', 'es']) for (const key of messageKeys) assert.notEqual(t(locale, key), key);
  assert.equal(t('pt-BR', 'notStarted'), 'Não foi iniciado ainda.');
  assert.equal(t('es', 'checking'), 'Buscando actualizaciones en GitHub…');
  assert.equal(t('de', 'connected'), 'WhatsApp connected');
  assert.equal(t('es', 'updated', { version: '0.2.0' }), 'Actualizado a 0.2.0.');
});
