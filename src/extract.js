// Pulls the StaysSearch payload out of an Airbnb search page (paths verified 2026-09-28, see spec).

export class ExtractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtractError';
  }
}

const STATE_RE = /<script id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/;

function findPriceFilter(filters) {
  const toNumber = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  for (const section of filters?.filterPanel?.filterPanelSections?.sections ?? []) {
    for (const item of section?.sectionData?.discreteFilterItems ?? []) {
      if (!Array.isArray(item?.priceHistogram)) continue;
      return {
        min: toNumber(item.minValue),
        max: toNumber(item.maxValue),
        histogramTotal: item.priceHistogram.reduce((sum, n) => sum + (Number(n) || 0), 0),
      };
    }
  }
  return null;
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
  return {
    results: results.searchResults,
    pageCursors: results.paginationInfo?.pageCursors ?? [],
    priceFilter: findPriceFilter(results.filters),
  };
}
