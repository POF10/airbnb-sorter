// Listings the user has opened, as { [listingId]: time of the last view in ms }, under one storage key.
// storage: { get(key, fallback), set(key, value) }, sync or async.
export const VIEWED_KEY = 'viewed';
// ~40 bytes per entry; past the limit the oldest views are forgotten.
export const VIEWED_LIMIT = 5000;

// Anything that is not an { id: time } object reads as "nothing viewed"; stray entries are dropped.
function normalizeViewed(raw) {
  const viewed = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return viewed;
  for (const [id, time] of Object.entries(raw)) {
    if (typeof time === 'number' && Number.isFinite(time)) viewed[id] = time;
  }
  return viewed;
}

export async function loadViewed(storage) {
  try {
    return normalizeViewed(await storage.get(VIEWED_KEY, null));
  } catch {
    return {};
  }
}

// Records one view (or refreshes its time) and resolves to the updated map; a failed write is logged, not thrown.
export async function markViewed(storage, id, now = Date.now()) {
  const viewed = await loadViewed(storage);
  viewed[id] = now;
  const ids = Object.keys(viewed);
  if (ids.length > VIEWED_LIMIT) {
    ids.sort((a, b) => viewed[a] - viewed[b]);
    for (const oldest of ids.slice(0, ids.length - VIEWED_LIMIT)) delete viewed[oldest];
  }
  try {
    await storage.set(VIEWED_KEY, viewed);
  } catch (e) {
    console.warn('[airbnb-sorter] could not save the viewed listings', e);
  }
  return viewed;
}

export async function clearViewed(storage) {
  try {
    await storage.set(VIEWED_KEY, {});
  } catch (e) {
    console.warn('[airbnb-sorter] could not clear the viewed listings', e);
  }
}

// "/rooms/123" and "/rooms/plus/123" -> "123"; any other page -> null.
export function listingIdFromPath(pathname) {
  const m = /^\/rooms\/(?:plus\/)?(\d+)(?:\/|$)/.exec(pathname ?? '');
  return m ? m[1] : null;
}
