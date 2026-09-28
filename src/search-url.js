// Pure helpers around Airbnb search URLs.

const STRIPPED = ['cursor', 'pagination_search', 'price_min', 'price_max'];
// Whether price_min/max mean nightly (0) or total-stay (2) prices. Kept when the user set price bounds,
// so collected ranges use the user's mode; dropped otherwise, so ranges are nightly like the histogram.
const PRICE_MODE = ['price_filter_input_type', 'price_filter_num_nights'];

function numberParam(params, key) {
  const value = params.get(key);
  return value != null && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

// Current page URL -> search URL without paging/price bounds, plus the user's own price bounds.
export function parseSearchUrl(href) {
  const url = new URL(href);
  const userMin = numberParam(url.searchParams, 'price_min');
  const userMax = numberParam(url.searchParams, 'price_max');
  for (const key of STRIPPED) url.searchParams.delete(key);
  if (userMin == null && userMax == null) for (const key of PRICE_MODE) url.searchParams.delete(key);
  return { searchUrl: url.toString(), userMin, userMax };
}

// Search URL restricted to a price range { lo, hi }; hi = null means no upper bound. The range is in
// the search's own price mode (nightly unless the URL already says price_filter_input_type=2, total).
export function rangeUrl(searchUrl, { lo, hi }) {
  const url = new URL(searchUrl);
  if (lo > 0) url.searchParams.set('price_min', String(lo));
  if (hi != null) url.searchParams.set('price_max', String(hi));
  if ((lo > 0 || hi != null) && !url.searchParams.has('price_filter_input_type')) {
    url.searchParams.set('price_filter_input_type', '0');
  }
  return url.toString();
}

export function pageUrl(url, cursor) {
  const result = new URL(url);
  result.searchParams.set('cursor', cursor);
  return result.toString();
}

// Nights between two YYYY-MM-DD dates; null when missing, invalid or not positive.
export function nightsBetween(checkin, checkout) {
  const days = checkin && checkout ? Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000) : NaN;
  return days > 0 ? days : null;
}

// Everything normalizeListing needs to know about the search.
export function searchContext(searchUrl) {
  const url = new URL(searchUrl);
  const nights = nightsBetween(url.searchParams.get('checkin'), url.searchParams.get('checkout'));
  return { origin: url.origin, searchParams: url.searchParams, nights };
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// "Riga, Latvia" from ?query= or from the /s/Riga--Latvia/homes path; null when unknown.
// In path slugs Airbnb writes ", " as "--", spaces as "-" and hyphens as "~".
export function placeLabel(searchUrl) {
  const url = new URL(searchUrl);
  const query = url.searchParams.get('query');
  if (query) return query;
  const m = /^\/s\/([^/]+)\/homes/.exec(url.pathname);
  if (!m) return null;
  return safeDecode(m[1]).replace(/--/g, ', ').replace(/-/g, ' ').replace(/~/g, '-');
}

export function isHomesSearchPath(pathname) {
  return /^\/s\/(?:[^/]+\/)?homes\/?$/.test(pathname);
}
