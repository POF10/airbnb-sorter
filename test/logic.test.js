import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SORTS, DEFAULT_SORT, sortListings, filterByBounds, formatMoney, formatRating, photoUrl,
  describeSearch, formatAge, summaryText, partialReasons, progressText,
} from '../src/viewer/logic.js';

const make = (id, amount, rating = null, reviews = null, lat = 56.95, lng = 24.1) => ({ id, price: { amount }, rating, reviews, lat, lng });
const ids = list => list.map(l => l.id);

test('price-desc: expensive first, unknown prices last', () => {
  const list = [make('a', 100), make('b', null), make('c', 300), make('d', 200)];
  assert.deepEqual(ids(sortListings(list, 'price-desc')), ['c', 'd', 'a', 'b']);
});

test('price-asc keeps unknown prices last too', () => {
  const list = [make('a', 100), make('b', null), make('c', 300), make('d', 200)];
  assert.deepEqual(ids(sortListings(list, 'price-asc')), ['a', 'd', 'c', 'b']);
});

test('rating-desc and reviews-desc', () => {
  const list = [make('a', 1, 4.5, 10), make('b', 1, null, null), make('c', 1, 4.9, 3)];
  assert.deepEqual(ids(sortListings(list, 'rating-desc')), ['c', 'a', 'b']);
  assert.deepEqual(ids(sortListings(list, 'reviews-desc')), ['a', 'c', 'b']);
});

test('ties are broken by id and the input is not mutated', () => {
  const list = [make('2', 100), make('1', 100)];
  assert.deepEqual(ids(sortListings(list, 'price-desc')), ['1', '2']);
  assert.deepEqual(ids(list), ['2', '1']);
});

test('sort options and the default', () => {
  assert.equal(DEFAULT_SORT, 'price-desc');
  assert.deepEqual(Object.keys(SORTS), ['price-desc', 'price-asc', 'rating-desc', 'reviews-desc']);
  assert.deepEqual(ids(sortListings([make('a', 1), make('b', 2)], 'nope')), ['b', 'a']);
});

test('filterByBounds keeps listings inside and drops ones without coordinates', () => {
  const list = [make('in', 1, null, null, 56.95, 24.1), make('out', 1, null, null, 57.5, 24.1), make('none', 1, null, null, null, null)];
  assert.deepEqual(ids(filterByBounds(list, { south: 56.9, west: 24.0, north: 57.0, east: 24.2 })), ['in']);
});

test('formatMoney', () => {
  assert.match(formatMoney(1234, '€'), /^€1\s234$/);
  assert.equal(formatMoney(74.33, '€'), '€74');
  assert.equal(formatMoney(null, '€'), '—');
  assert.equal(formatMoney(50, null), '50');
});

test('formatRating', () => {
  assert.equal(formatRating({ rating: 5, reviews: 200 }), '★ 5.0 (200)');
  assert.equal(formatRating({ rating: 4.87, reviews: null }), '★ 4.87');
  assert.equal(formatRating({ rating: null, reviews: null }), '★ Новое');
});

test('photoUrl asks Airbnb for a 720px image', () => {
  assert.equal(photoUrl('https://a0.muscache.com/im/pictures/x.jpeg'), 'https://a0.muscache.com/im/pictures/x.jpeg?im_w=720');
  assert.equal(photoUrl('https://a0.muscache.com/im/pictures/x.jpeg?im_w=1200'), 'https://a0.muscache.com/im/pictures/x.jpeg?im_w=1200');
  assert.equal(photoUrl(''), '');
});

test('describeSearch', () => {
  const meta = { placeLabel: 'Riga, Latvia', searchUrl: 'https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2' };
  assert.match(describeSearch(meta), /^Riga, Latvia · 16\sокт\.?\s–\s19\sокт\.? · 2 гостя$/);
  assert.equal(describeSearch({ placeLabel: null, searchUrl: 'https://www.airbnb.com/s/homes?adults=1' }), '1 гость');
  assert.equal(describeSearch({ placeLabel: 'X', searchUrl: 'https://www.airbnb.com/s/X/homes?adults=5' }), 'X · 5 гостей');
});

test('formatAge', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const ago = ms => new Date(now - ms).toISOString();
  assert.equal(formatAge(ago(30_000), now), 'только что');
  assert.equal(formatAge(ago(12 * 60_000), now), '12 мин назад');
  assert.equal(formatAge(ago(3 * 3_600_000), now), '3 ч назад');
  assert.equal(formatAge(ago(2 * 86_400_000), now), '2 дн назад');
});

test('summaryText', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const meta = { expectedTotal: 1263, collectedAt: new Date(now - 12 * 60_000).toISOString() };
  assert.match(summaryText(meta, 1240), /^Собрано 1\s240 из ~1\s263$/);
  assert.match(summaryText(meta, 1240, 84), /^Собрано 1\s240 из ~1\s263 · показано 84$/);
  assert.match(summaryText({ ...meta, expectedTotal: null }, 1240), /^Собрано 1\s240$/);
  assert.match(summaryText(meta, 1240, null, { fromCache: true, now }), / · 12 мин назад$/);
});

test('partialReasons', () => {
  assert.deepEqual(partialReasons({ stopReason: 'blocked', failedPages: 2, saturatedRanges: 0 }), ['Airbnb начал блокировать запросы', 'не загрузилось страниц: 2']);
  assert.deepEqual(partialReasons({ stopReason: 'cancelled', failedPages: 0, saturatedRanges: 1 }), ['сбор отменён', 'переполненных ценовых диапазонов: 1 (часть объявлений недоступна)']);
});

test('progressText', () => {
  assert.equal(progressText(null), 'Загружаю первую страницу…');
  assert.match(progressText({ ranges: 6, pagesDone: 41, pagesPlanned: 70, listings: 812, expectedTotal: 1263 }), /^Диапазонов: 6 · Страниц: 41 \/ ~70 · Объявлений: 812 из ~1\s263$/);
  assert.equal(progressText({ ranges: 1, pagesDone: 1, pagesPlanned: 3, listings: 18, expectedTotal: null }), 'Диапазонов: 1 · Страниц: 1 / ~3 · Объявлений: 18');
});

test('rating ties go to more reviews; review ties to the higher rating', () => {
  const list = [make('a', 1, 5, 3), make('b', 1, 5, 200), make('c', 1, 5, null), make('d', 1, 4.9, 200), make('e', 1, 4.8, 200)];
  assert.deepEqual(ids(sortListings(list, 'rating-desc')), ['b', 'a', 'c', 'd', 'e']);
  assert.deepEqual(ids(sortListings(list, 'reviews-desc')), ['b', 'd', 'e', 'a', 'c']);
});

test('an unknown or inherited sort id falls back to the default', () => {
  assert.deepEqual(ids(sortListings([make('a', 1), make('b', 2)], 'toString')), ['b', 'a']);
});

test('formatMoney separates letter currency codes', () => {
  assert.match(formatMoney(1234, 'CHF'), /^CHF\s1\s234$/);
  assert.match(formatMoney(1234, 'CA$'), /^CA\$1\s234$/);
});

test('photoUrl keeps existing query params and tolerates relative URLs', () => {
  assert.equal(photoUrl('https://a0.muscache.com/im/x.jpeg?aki_policy=large'), 'https://a0.muscache.com/im/x.jpeg?aki_policy=large&im_w=720');
  assert.equal(photoUrl('/im/pictures/x.jpeg'), '/im/pictures/x.jpeg');
});

test('describeSearch: plurals, children count as guests, invalid dates are skipped', () => {
  const at = q => describeSearch({ placeLabel: null, searchUrl: `https://www.airbnb.com/s/homes?${q}` });
  assert.equal(at('adults=11'), '11 гостей');
  assert.equal(at('adults=14'), '14 гостей');
  assert.equal(at('adults=21'), '21 гость');
  assert.equal(at('adults=22'), '22 гостя');
  assert.equal(at('adults=2&children=1'), '3 гостя');
  assert.equal(at('checkin=2026-13-01&checkout=2026-10-19&adults=1'), '1 гость');
  assert.equal(at('checkin=2026-10-16&adults=1'), '1 гость');
});

test('partialReasons mentions the request limit', () => {
  assert.deepEqual(partialReasons({ stopReason: 'limit', failedPages: 0, saturatedRanges: 0 }), ['достигнут предел числа запросов']);
});
