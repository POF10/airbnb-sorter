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

test('no niobeClientData -> ExtractError', () => {
  assert.throws(() => extractSearchPage(pageHtml({})), { name: 'ExtractError', message: /niobeClientData/ });
});

test('"</script>" inside the data does not end the state script', () => {
  const html = pageHtml(searchState({ results: [{ ...rawResult({ id: 1, nightly: 50 }), title: 'Nice </script> flat' }], pageCursors: [] }));
  assert.equal(extractSearchPage(html).results[0].title, 'Nice </script> flat');
});

test('the price item is found by its price_min/price_max keys', () => {
  const state = searchState({ results: [], pageCursors: [], histogram: [4, 6], min: 30, max: 520 });
  const { sections } = state.niobeClientData[1][1].data.presentation.staysSearch.results.filters.filterPanel.filterPanelSections;
  sections.unshift({ sectionData: { discreteFilterItems: [{ minValue: '0', maxValue: '50', priceHistogram: [99] }] } });
  assert.deepEqual(extractSearchPage(pageHtml(state)).priceFilter, { min: 30, max: 520, histogramTotal: 10 });
});

test('non-numeric price filter values become null', () => {
  const state = searchState({ results: [], pageCursors: [], histogram: [{ count: 5 }], max: '520+' });
  assert.deepEqual(extractSearchPage(pageHtml(state)).priceFilter, { min: 30, max: null, histogramTotal: null });
});

test('non-array pageCursors become []', () => {
  const state = searchState({ results: [], pageCursors: [] });
  state.niobeClientData[1][1].data.presentation.staysSearch.results.paginationInfo.pageCursors = {};
  assert.deepEqual(extractSearchPage(pageHtml(state)).pageCursors, []);
});
