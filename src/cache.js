// Keeps only the last collection. storage: { get(key, fallback), set(key, value) } — GM_getValue/GM_setValue or a shim.
const KEY = 'lastCollection';

export function loadCache(storage, searchUrl) {
  try {
    const cached = storage.get(KEY, null);
    return cached && cached.key === searchUrl && Array.isArray(cached.listings)
      ? { listings: cached.listings, meta: cached.meta }
      : null;
  } catch {
    return null;
  }
}

export function saveCache(storage, searchUrl, { listings, meta }) {
  try {
    storage.set(KEY, { key: searchUrl, listings, meta });
  } catch (e) {
    console.warn('[airbnb-sorter] не удалось сохранить кэш', e);
  }
}
