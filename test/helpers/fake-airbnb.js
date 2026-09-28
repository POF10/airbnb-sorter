// Synthetic Airbnb for tests: search-page HTML over a list of { id, nightly } listings that honors
// price_min / price_max / cursor like the real site (18 results per page, at most 15 page cursors).
export const PAGE_SIZE = 18;
export const MAX_CURSORS = 15;

export function cursorFor(offset) {
  return btoa(JSON.stringify({ section_offset: 0, items_offset: offset, version: 1 }));
}

export function pageOffset(url) {
  const cursor = new URL(url).searchParams.get('cursor');
  return cursor ? JSON.parse(atob(cursor)).items_offset : 0;
}

export function rawResult({ id, nightly, nights = 3, lat = 56.95, lng = 24.1 }) {
  const total = nightly * nights;
  return {
    __typename: 'StaySearchResult',
    avgRatingLocalized: '4.9 (12)',
    badges: [],
    contextualPictures: [{ picture: `https://a0.muscache.com/im/pictures/${id}.jpeg` }],
    demandStayListing: { id: btoa(`DemandStayListing:${id}`), location: { coordinate: { latitude: lat, longitude: lng } } },
    nameLocalized: { localizedStringWithTranslationPreference: `Listing ${id}` },
    structuredContent: { primaryLine: [{ body: '1 bedroom', type: 'BEDINFO' }] },
    structuredDisplayPrice: {
      primaryLine: { __typename: 'QualifiedDisplayPriceLine', accessibilityLabel: `€${total} total`, price: `€${total}`, qualifier: 'total' },
    },
    title: `Apartment ${id}`,
  };
}

export function searchState({ results, pageCursors, histogram = [0], min = 30, max = 520 }) {
  return {
    niobeClientData: [
      ['Header:{}', { data: {} }],
      ['StaysSearch:{"aiSearchEnabled":false}', { data: { presentation: { staysSearch: { results: {
        searchResults: results,
        paginationInfo: { pageCursors },
        filters: { filterPanel: { filterPanelSections: { sections: [
          { sectionData: { discreteFilterItems: [{ minValue: '0', maxValue: '8' }] } },
          { sectionData: { discreteFilterItems: [{ minValue: String(min), maxValue: String(max), priceHistogram: histogram }] } },
        ] } } },
      } } } } }],
    ],
  };
}

export function pageHtml(state) {
  return `<!doctype html><html><head></head><body><script id="data-deferred-state-0" data-deferred-state-0="true" type="application/json">${JSON.stringify(state)}</script></body></html>`;
}

export function listingsWithPrices(prices) {
  return prices.map((nightly, i) => ({ id: i + 1, nightly }));
}

export function fakeAirbnb(listings, { latencyMs = 0, histogramMax = 520 } = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  async function fetchPage(url) {
    calls.push(url);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs));
      const params = new URL(url).searchParams;
      const min = params.has('price_min') ? Number(params.get('price_min')) : 0;
      const max = params.has('price_max') ? Number(params.get('price_max')) : Infinity;
      const matched = listings.filter(l => l.nightly >= min && l.nightly <= max);
      const cursorCount = Math.min(MAX_CURSORS, Math.ceil(matched.length / PAGE_SIZE));
      const offset = pageOffset(url);
      return pageHtml(searchState({
        results: matched.slice(offset, offset + PAGE_SIZE).map(l => rawResult(l)),
        pageCursors: Array.from({ length: cursorCount }, (_, i) => cursorFor(i * PAGE_SIZE)),
        histogram: [listings.length],
        max: histogramMax,
      }));
    } finally {
      inFlight--;
    }
  }
  return { fetchPage, calls, get maxInFlight() { return maxInFlight; } };
}
