import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale, getLocale, detectLocale, t } from '../src/i18n.js';
import { LANGUAGES } from '../src/settings.js';
import { SORTS, formatMoney, formatRating, describeSearch, formatAge, summaryText, partialReasons, progressText } from '../src/viewer/logic.js';

test('detectLocale follows the page language first, then the browser', () => {
  assert.equal(detectLocale({ pageLang: 'ru', browserLang: 'en-US' }), 'ru');
  assert.equal(detectLocale({ pageLang: 'ru-RU', browserLang: 'en-US' }), 'ru');
  assert.equal(detectLocale({ pageLang: 'en', browserLang: 'ru-RU' }), 'en');
  assert.equal(detectLocale({ pageLang: 'lv', browserLang: 'ru-RU' }), 'en');
  assert.equal(detectLocale({ pageLang: '', browserLang: 'ru' }), 'ru');
  assert.equal(detectLocale({ pageLang: '', browserLang: 'de-DE' }), 'en');
  assert.equal(detectLocale(), 'en');
});

test('unknown locales fall back to English', () => {
  setLocale('xx');
  assert.equal(getLocale(), 'en');
});

test('English texts', () => {
  setLocale('en');
  const now = Date.parse('2026-09-28T12:00:00Z');
  const meta = { expectedTotal: 1263, collectedAt: new Date(now - 12 * 60_000).toISOString(), stopReason: 'blocked', failedPages: 2, saturatedRanges: 1 };
  assert.equal(SORTS['price-desc'].label, 'Price ↓');
  assert.equal(formatMoney(1234, '€'), '€1,234');
  assert.equal(formatRating({ rating: null, reviews: null }), '★ New');
  assert.equal(describeSearch({ placeLabel: 'Riga, Latvia', searchUrl: 'https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2' }), 'Riga, Latvia · 16 Oct – 19 Oct · 2 guests');
  assert.equal(describeSearch({ placeLabel: null, searchUrl: 'https://www.airbnb.com/s/homes?adults=1' }), '1 guest');
  assert.equal(formatAge(meta.collectedAt, now), '12 min ago');
  assert.equal(summaryText(meta, 1240, 84, { fromCache: true, now }), 'Collected 1,240 of ~1,263 · showing 84 · 12 min ago');
  assert.deepEqual(partialReasons(meta), ['Airbnb started blocking requests', 'pages failed to load: 2', 'overfull price ranges: 1 (some listings unavailable)']);
  assert.equal(progressText({ ranges: 6, pagesDone: 41, pagesPlanned: 70, listings: 812, expectedTotal: 1263 }), 'Ranges: 6 · Pages: 41 / ~70 · Listings: 812 of ~1,263');
  assert.equal(progressText(null), 'Loading the first page…');
  assert.equal(t().guests(2), '2 guests');
});

test('switching the locale switches the texts and number format', () => {
  setLocale('ru');
  assert.equal(SORTS['price-desc'].label, 'Цена ↓');
  assert.match(formatMoney(1234, '€'), /^€1\s234$/);
  setLocale('en');
  assert.equal(formatMoney(1234, '€'), '€1,234');
});

// Every key path of a dictionary: "sort.price-desc", "popup.languages.auto", …
function keyPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, inner]) => keyPaths(inner, prefix ? `${prefix}.${key}` : key));
}

test('both dictionaries have the same keys', () => {
  setLocale('en');
  const en = keyPaths(t()).sort();
  setLocale('ru');
  const ru = keyPaths(t()).sort();
  assert.deepEqual(ru, en);
  assert.ok(en.includes('support'));
  assert.ok(en.includes('popup.title'));
});

test('the popup has a label for every settings language', () => {
  for (const locale of ['en', 'ru']) {
    setLocale(locale);
    for (const language of LANGUAGES) assert.equal(typeof t().popup.languages[language], 'string', `${locale}: ${language}`);
  }
});
