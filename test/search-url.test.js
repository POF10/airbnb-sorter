import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchUrl, rangeUrl, pageUrl, searchContext, placeLabel, isHomesSearchPath } from '../src/search-url.js';

const BASE = 'https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2';

test('parseSearchUrl strips paging and price params but keeps other filters', () => {
  const { searchUrl, userMin, userMax } = parseSearchUrl(
    `${BASE}&cursor=abc&pagination_search=true&price_min=50&price_max=150&price_filter_input_type=0&price_filter_num_nights=3&min_bedrooms=3`,
  );
  const params = new URL(searchUrl).searchParams;
  for (const key of ['cursor', 'pagination_search', 'price_min', 'price_max', 'price_filter_input_type', 'price_filter_num_nights']) {
    assert.equal(params.has(key), false, key);
  }
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

test('placeLabel', () => {
  assert.equal(placeLabel(BASE), 'Riga, Latvia');
  assert.equal(placeLabel('https://www.airbnb.com/s/R%C4%ABga--Latvia/homes'), 'Rīga, Latvia');
  assert.equal(placeLabel('https://www.airbnb.com/s/New-York--NY/homes'), 'New York, NY');
  assert.equal(placeLabel('https://www.airbnb.com/s/homes?query=J%C5%ABrmala'), 'Jūrmala');
  assert.equal(placeLabel('https://www.airbnb.com/s/homes'), null);
});

test('isHomesSearchPath', () => {
  assert.equal(isHomesSearchPath('/s/Riga--Latvia/homes'), true);
  assert.equal(isHomesSearchPath('/s/Riga--Latvia/homes/'), true);
  assert.equal(isHomesSearchPath('/s/homes'), true);
  assert.equal(isHomesSearchPath('/s/Riga--Latvia/experiences'), false);
  assert.equal(isHomesSearchPath('/rooms/123'), false);
});
