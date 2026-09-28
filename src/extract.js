// Pulls the StaysSearch payload out of an Airbnb search page (paths verified 2026-09-28, see spec).

export class ExtractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtractError';
  }
}

const STATE_RE = /<script id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/;

const toNumber = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const hasHistogram = item => Array.isArray(item?.priceHistogram);
const isPriceItem = item => (item?.searchParams?.params ?? []).some(p => p?.key === 'price_min' || p?.key === 'price_max');

// The price slider item: the one filtering by price_min/price_max, else the first one with a histogram.
function findPriceFilter(filters) {
  const items = (filters?.filterPanel?.filterPanelSections?.sections ?? []).flatMap(s => s?.sectionData?.discreteFilterItems ?? []);
  const item = items.find(i => hasHistogram(i) && isPriceItem(i)) ?? items.find(hasHistogram);
  if (!item) return null;
  const counts = item.priceHistogram.map(Number).filter(Number.isFinite);
  return {
    min: toNumber(item.minValue),
    max: toNumber(item.maxValue),
    histogramTotal: counts.length ? counts.reduce((sum, n) => sum + n, 0) : null,
  };
}

// Search page HTML -> { results: StaySearchResult[], pageCursors: string[], priceFilter: {min,max,histogramTotal}|null }.
export function extractSearchPage(html) {
  const m = STATE_RE.exec(html);
  if (!m) throw new ExtractError('нет <script id="data-deferred-state-0">');
  let state;
  try {
    state = JSON.parse(m[1]);
  } catch {
    throw new ExtractError('data-deferred-state-0: невалидный JSON');
  }
  const entries = state?.niobeClientData;
  if (!Array.isArray(entries)) throw new ExtractError('нет niobeClientData');
  const entry = entries.find(e => Array.isArray(e) && typeof e[0] === 'string' && e[0].startsWith('StaysSearch:'));
  if (!entry) throw new ExtractError('нет записи StaysSearch: в niobeClientData');
  const results = entry[1]?.data?.presentation?.staysSearch?.results;
  if (!results) throw new ExtractError('нет …staysSearch.results');
  if (!Array.isArray(results.searchResults)) throw new ExtractError('нет …staysSearch.results.searchResults');
  const cursors = results.paginationInfo?.pageCursors;
  return {
    results: results.searchResults,
    pageCursors: Array.isArray(cursors) ? cursors.filter(c => typeof c === 'string') : [],
    priceFilter: findPriceFilter(results.filters),
  };
}
