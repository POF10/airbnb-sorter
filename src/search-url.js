// Pure helpers around Airbnb search URLs.

const STRIPPED = ['cursor', 'pagination_search', 'price_min', 'price_max', 'price_filter_input_type', 'price_filter_num_nights'];

function numberParam(params, key) {
  const value = params.get(key);
  return value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
}

// Current page URL -> search URL without paging/price params, plus the user's own price bounds.
export function parseSearchUrl(href) {
  const url = new URL(href);
  const userMin = numberParam(url.searchParams, 'price_min');
  const userMax = numberParam(url.searchParams, 'price_max');
  for (const key of STRIPPED) url.searchParams.delete(key);
  return { searchUrl: url.toString(), userMin, userMax };
}

// Search URL restricted to a nightly price range { lo, hi }; hi = null means no upper bound.
export function rangeUrl(searchUrl, { lo, hi }) {
  const url = new URL(searchUrl);
  if (lo > 0) url.searchParams.set('price_min', String(lo));
  if (hi != null) url.searchParams.set('price_max', String(hi));
  if (lo > 0 || hi != null) url.searchParams.set('price_filter_input_type', '0');
  return url.toString();
}

export function pageUrl(url, cursor) {
  const result = new URL(url);
  result.searchParams.set('cursor', cursor);
  return result.toString();
}

// Everything normalizeListing needs to know about the search.
export function searchContext(searchUrl) {
  const url = new URL(searchUrl);
  const checkin = url.searchParams.get('checkin');
  const checkout = url.searchParams.get('checkout');
  const days = checkin && checkout ? Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000) : NaN;
  return { origin: url.origin, searchParams: url.searchParams, nights: days > 0 ? days : null };
}

// "Riga, Latvia" from ?query= or from the /s/Riga--Latvia/homes path; null when unknown.
export function placeLabel(searchUrl) {
  const url = new URL(searchUrl);
  const query = url.searchParams.get('query');
  if (query) return query;
  const m = /^\/s\/([^/]+)\/homes/.exec(url.pathname);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/--/g, ', ').replace(/-/g, ' ');
}

export function isHomesSearchPath(pathname) {
  return /^\/s\/(?:[^/]+\/)?homes\/?$/.test(pathname);
}
