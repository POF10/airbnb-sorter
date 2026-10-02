// Listings the user has opened, as { [listingId]: time of the last view in ms }, under one storage key.
// storage: { get(key, fallback), set(key, value) }, sync or async.
export const VIEWED_KEY = 'viewed';
// ~40 bytes per entry; past the limit the oldest views are forgotten.
export const VIEWED_LIMIT = 5000;

// Airbnb listing ids are strings of digits.
const isListingId = id => typeof id === 'string' && /^\d+$/.test(id);

// Anything that is not an { id: time } object reads as "nothing viewed"; stray entries are dropped.
function normalizeViewed(raw) {
  const viewed = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return viewed;
  for (const [id, time] of Object.entries(raw)) {
    if (isListingId(id) && typeof time === 'number' && Number.isFinite(time)) viewed[id] = time;
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

// Records one view (or refreshes its time) and resolves to the stored map; a failed write is logged, not thrown.
// Anything that is not a listing id is ignored.
export async function markViewed(storage, id, now = Date.now()) {
  const viewed = await loadViewed(storage);
  if (!isListingId(id)) return viewed;
  viewed[id] = now;
  const ids = Object.keys(viewed);
  if (ids.length > VIEWED_LIMIT) {
    // The view being recorded is never the one forgotten, whatever the clock says.
    const others = ids.filter(other => other !== id).sort((a, b) => viewed[a] - viewed[b]);
    for (const oldest of others.slice(0, ids.length - VIEWED_LIMIT)) delete viewed[oldest];
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

// The listing id of an Airbnb listing page — "/rooms/123", "/rooms/plus/123", "/luxury/listing/123" — or null.
export function listingIdFromPath(pathname) {
  const m = /^\/(?:rooms\/(?:plus\/)?|luxury\/listing\/)(\d+)(?:\/|$)/.exec(pathname ?? '');
  return m ? m[1] : null;
}
