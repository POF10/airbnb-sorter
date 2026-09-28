import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchUrl, rangeUrl, pageUrl, searchContext, placeLabel, isHomesSearchPath } from '../src/search-url.js';

const BASE = 'https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2';

test('parseSearchUrl strips paging and price bounds but keeps the price mode and other filters', () => {
  const { searchUrl, userMin, userMax } = parseSearchUrl(
    `${BASE}&cursor=abc&pagination_search=true&price_min=50&price_max=150&price_filter_input_type=0&price_filter_num_nights=3&min_bedrooms=3`,
  );
  const params = new URL(searchUrl).searchParams;
  for (const key of ['cursor', 'pagination_search', 'price_min', 'price_max']) {
    assert.equal(params.has(key), false, key);
  }
  assert.equal(params.get('price_filter_input_type'), '0');
  assert.equal(params.get('price_filter_num_nights'), '3');
  assert.equal(params.get('min_bedrooms'), '3');
  assert.equal(params.get('checkin'), '2026-10-16');
  assert.equal(userMin, 50);
  assert.equal(userMax, 150);
});

test('parseSearchUrl without a user price filter', () => {
  const { userMin, userMax } = parseSearchUrl(BASE);
  assert.equal(userMin, null);
  assert.equal(userMax, null);
});

test('parseSearchUrl ignores empty, blank, negative and non-numeric bounds', () => {
  for (const bad of ['', '%20', '-5', 'abc']) {
    const { userMin, userMax } = parseSearchUrl(`${BASE}&price_min=${bad}&price_max=${bad}`);
    assert.equal(userMin, null, bad);
    assert.equal(userMax, null, bad);
  }
});

test('repeated array filters survive parsing and range URLs', () => {
  const { searchUrl } = parseSearchUrl(`${BASE}&room_types[]=Entire%20home%2Fapt&room_types[]=Private%20room&amenities[]=4&amenities[]=7`);
  const params = new URL(rangeUrl(searchUrl, { lo: 60, hi: 70 })).searchParams;
  assert.deepEqual(params.getAll('room_types[]'), ['Entire home/apt', 'Private room']);
  assert.deepEqual(params.getAll('amenities[]'), ['4', '7']);
});

test('rangeUrl adds nothing for the open range [0, ∞)', () => {
  const { searchUrl } = parseSearchUrl(BASE);
  assert.equal(rangeUrl(searchUrl, { lo: 0, hi: null }), searchUrl);
});

test('rangeUrl sets both price bounds', () => {
  const params = new URL(rangeUrl(BASE, { lo: 60, hi: 70 })).searchParams;
  assert.equal(params.get('price_min'), '60');
  assert.equal(params.get('price_max'), '70');
  assert.equal(params.get('price_filter_input_type'), '0');
});

test('rangeUrl with an open upper bound sets only price_min', () => {
  const params = new URL(rangeUrl(BASE, { lo: 520, hi: null })).searchParams;
  assert.equal(params.get('price_min'), '520');
  assert.equal(params.has('price_max'), false);
  assert.equal(params.get('price_filter_input_type'), '0');
});

test('rangeUrl from zero sets only price_max', () => {
  const params = new URL(rangeUrl(BASE, { lo: 0, hi: 520 })).searchParams;
  assert.equal(params.has('price_min'), false);
  assert.equal(params.get('price_max'), '520');
  assert.equal(params.get('price_filter_input_type'), '0');
});

test("rangeUrl keeps the user's total-price mode", () => {
  // price_filter_input_type=2: price_min/max are totals for price_filter_num_nights (verified live 2026-09-28).
  const { searchUrl, userMin, userMax } = parseSearchUrl(`${BASE}&price_filter_input_type=2&price_filter_num_nights=3&price_min=300&price_max=390`);
  assert.equal(userMin, 300);
  assert.equal(userMax, 390);
  const params = new URL(rangeUrl(searchUrl, { lo: 300, hi: 345 })).searchParams;
  assert.equal(params.get('price_filter_input_type'), '2');
  assert.equal(params.get('price_filter_num_nights'), '3');
  assert.equal(params.get('price_min'), '300');
  assert.equal(params.get('price_max'), '345');
});

test('pageUrl sets the cursor', () => {
  assert.equal(new URL(pageUrl(BASE, 'eyJ4IjoxfQ==')).searchParams.get('cursor'), 'eyJ4IjoxfQ==');
});

test('searchContext counts nights and keeps params', () => {
  const ctx = searchContext(BASE);
  assert.equal(ctx.origin, 'https://www.airbnb.com');
  assert.equal(ctx.nights, 3);
  assert.equal(ctx.searchParams.get('adults'), '2');
});

test('searchContext without dates has no nights', () => {
  assert.equal(searchContext('https://www.airbnb.com/s/Riga--Latvia/homes').nights, null);
});

test('searchContext rejects same-day and reversed dates', () => {
  assert.equal(searchContext('https://www.airbnb.com/s/Riga/homes?checkin=2026-10-16&checkout=2026-10-16').nights, null);
  assert.equal(searchContext('https://www.airbnb.com/s/Riga/homes?checkin=2026-10-19&checkout=2026-10-16').nights, null);
});

test('placeLabel', () => {
  assert.equal(placeLabel(BASE), 'Riga, Latvia');
  assert.equal(placeLabel('https://www.airbnb.com/s/R%C4%ABga--Latvia/homes'), 'Rīga, Latvia');
  assert.equal(placeLabel('https://www.airbnb.com/s/New-York--NY/homes'), 'New York, NY');
  assert.equal(placeLabel('https://www.airbnb.com/s/homes?query=J%C5%ABrmala'), 'Jūrmala');
  assert.equal(placeLabel('https://www.airbnb.com/s/homes'), null);
  assert.equal(placeLabel('https://www.airbnb.com/s/Riga--Latvia/homes?query=Old%20Riga'), 'Old Riga');
  assert.equal(placeLabel('https://www.airbnb.com/s/Aix~en~Provence--France/homes'), 'Aix-en-Provence, France');
  assert.equal(placeLabel('https://www.airbnb.com/s/50%off/homes'), '50%off');
});

test('isHomesSearchPath', () => {
  assert.equal(isHomesSearchPath('/s/Riga--Latvia/homes'), true);
  assert.equal(isHomesSearchPath('/s/Riga--Latvia/homes/'), true);
  assert.equal(isHomesSearchPath('/s/homes'), true);
  assert.equal(isHomesSearchPath('/s/Riga--Latvia/experiences'), false);
  assert.equal(isHomesSearchPath('/rooms/123'), false);
});
