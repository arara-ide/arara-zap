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
import en from './locales/en.json' with { type: 'json' };
import pt from './locales/pt.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };

export function language(locale = 'en') {
  const base = String(locale).toLowerCase().split(/[-_]/)[0];
  return ['en', 'pt', 'es'].includes(base) ? base : 'en';
}
const messages = { en, pt, es };
export function t(locale, key, values = {}) {
  const selected = messages[language(locale)];
  let text = selected[key] || messages.en[key] || key;
  text = text.replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token);
  return text;
}
export const messageKeys = Object.keys(messages.en);
