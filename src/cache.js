// Keeps only the last collection. storage: { get(key, fallback), set(key, value) }, sync or async —
// GM_getValue/GM_setValue, a localStorage shim or chrome.storage.local.
const KEY = 'lastCollection';
// Bump when the Listing shape changes, so an old cache is ignored instead of breaking the viewer.
const VERSION = 1;
// ~1,300 listings with ~27 photo URLs each is ~6 MB of JSON; 10 photos keep it under ~3 MB.
const MAX_PHOTOS = 10;
// Parameters Airbnb adds while the user navigates that do not change the results.
const VOLATILE = ['search_type', 'source', 'channel', 'federated_search_session_id', 'federated_search_id', 'pagination_search', 'cursor'];

// The same search gives the same key regardless of tracking params and parameter order.
export function cacheKey(searchUrl) {
  const url = new URL(searchUrl);
  for (const key of VOLATILE) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

export async function loadCache(storage, searchUrl) {
  try {
    const cached = await storage.get(KEY, null);
    const valid = cached && cached.v === VERSION && Array.isArray(cached.listings) && typeof cached.meta?.searchUrl === 'string';
    return valid && cached.key === cacheKey(searchUrl)
      ? { listings: cached.listings, meta: cached.meta }
      : null;
  } catch {
    return null;
  }
}

export async function saveCache(storage, searchUrl, { listings, meta }) {
  try {
    const trimmed = listings.map(l => (l.photos?.length > MAX_PHOTOS ? { ...l, photos: l.photos.slice(0, MAX_PHOTOS) } : l));
    await storage.set(KEY, { v: VERSION, key: cacheKey(searchUrl), listings: trimmed, meta });
  } catch (e) {
    console.warn('[airbnb-sorter] could not save the cache', e);
  }
}
