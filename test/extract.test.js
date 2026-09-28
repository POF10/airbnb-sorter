import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSearchPage, ExtractError } from '../src/extract.js';
import { pageHtml, searchState, rawResult, cursorFor } from './helpers/fake-airbnb.js';

test('extracts results, cursors and the price filter', () => {
  const html = pageHtml(searchState({
    results: [rawResult({ id: 1, nightly: 50 })],
    pageCursors: [cursorFor(0), cursorFor(18)],
    histogram: [3, 0, 5],
    min: 30,
    max: 520,
  }));
  const page = extractSearchPage(html);
  assert.equal(page.results.length, 1);
  assert.equal(page.results[0].title, 'Apartment 1');
  assert.deepEqual(page.pageCursors, [cursorFor(0), cursorFor(18)]);
  assert.deepEqual(page.priceFilter, { min: 30, max: 520, histogramTotal: 8 });
});

test('priceFilter is null without a histogram and cursors default to []', () => {
  const state = searchState({ results: [], pageCursors: [] });
  const results = state.niobeClientData[1][1].data.presentation.staysSearch.results;
  delete results.filters;
  delete results.paginationInfo;
  const page = extractSearchPage(pageHtml(state));
  assert.equal(page.priceFilter, null);
  assert.deepEqual(page.pageCursors, []);
});

test('no state script -> ExtractError', () => {
  assert.throws(() => extractSearchPage('<html><body>captcha</body></html>'), { name: 'ExtractError', message: /data-deferred-state-0/ });
});

test('invalid JSON -> ExtractError', () => {
  const html = '<script id="data-deferred-state-0" type="application/json">{oops</script>';
  assert.throws(() => extractSearchPage(html), ExtractError);
});

test('no StaysSearch entry -> ExtractError', () => {
  const html = pageHtml({ niobeClientData: [['Header:{}', { data: {} }]] });
  assert.throws(() => extractSearchPage(html), { name: 'ExtractError', message: /StaysSearch/ });
});

test('missing results -> ExtractError naming the path', () => {
  const html = pageHtml({ niobeClientData: [['StaysSearch:{}', { data: { presentation: { staysSearch: {} } } }]] });
  assert.throws(() => extractSearchPage(html), { name: 'ExtractError', message: /staysSearch\.results/ });
});
