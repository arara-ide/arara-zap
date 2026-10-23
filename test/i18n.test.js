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
test('JSON catalogs have the same keys and interpolation parameters without relying on fallback', async () => {
  const { readFile } = await import('node:fs/promises');
  const catalogs = await Promise.all(['en', 'pt', 'es'].map(async locale => JSON.parse(await readFile(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8'))));
  const params = text => [...text.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
  for (const catalog of catalogs) {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(catalogs[0]).sort());
    for (const [key, text] of Object.entries(catalogs[0])) assert.deepEqual(params(catalog[key]), params(text), key);
  }
  assert.equal(t('en', 'updated', { version: '$& {host}' }), 'Updated to $& {host}.');
});
