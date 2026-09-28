import { extractSearchPage, ExtractError } from './extract.js';
import { normalizeListing } from './normalize.js';
import { parseSearchUrl, rangeUrl, pageUrl, searchContext, placeLabel } from './search-url.js';

export const MAX_PAGES = 15;
const PAGE_SIZE = 18;
const STOP = Symbol('stop');

export class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

// Resolves after `ms`, or right away when `signal` aborts.
function sleep(ms, signal) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

const politePause = () => sleep(250 + Math.random() * 350);

// 429, 5xx and network failures (fetch rejects with TypeError) are worth retrying.
const isRetryable = e => (e instanceof HttpError ? e.status === 429 || e.status >= 500 : e instanceof TypeError);

function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => { active--; next(); });
  };
  return task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

// Splits a saturated nightly price range { lo, hi } (hi = null is ∞). Halves overlap on the boundary
// so listings priced exactly there are not lost. Returns null when the range cannot be split.
export function splitRange({ lo, hi }, priceMax) {
  if (hi == null) {
    const h = priceMax != null && priceMax > lo ? priceMax : Math.max(2 * lo, lo + 50);
    return [{ lo, hi: h }, { lo: h, hi: null }];
  }
  if (hi - lo <= 1) return null;
  const mid = Math.round((lo + hi) / 2);
  return [{ lo, hi: mid }, { lo: mid, hi }];
}

/**
 * Collects every listing of the Airbnb search at `href`.
 * fetchPage(url, signal) -> Promise<html>; must throw HttpError for non-2xx responses.
 * Returns { listings, meta } (spec "Модель данных"); rejects when the very first page fails.
 */
export async function collect(href, {
  fetchPage,
  signal,
  onProgress = () => {},
  concurrency = 3,
  pause = politePause,
  retryDelays = [2000, 4000, 8000],
}) {
  const { searchUrl, userMin, userMax } = parseSearchUrl(href);
  const ctx = searchContext(searchUrl);
  const hasUserPrice = userMin != null || userMax != null;
  const byId = new Map();
  const limit = createLimiter(concurrency);
  const s = { ranges: 0, pagesDone: 0, pagesKnown: 1, saturatedRanges: 0, failedPages: 0, stopReason: null, expectedTotal: null, priceMax: null };

  const report = () => onProgress({
    ranges: s.ranges,
    pagesDone: s.pagesDone,
    pagesPlanned: Math.max(s.pagesKnown, s.expectedTotal ? Math.ceil(s.expectedTotal / PAGE_SIZE) : 0),
    listings: byId.size,
    expectedTotal: s.expectedTotal,
  });

  const add = results => {
    for (const raw of results) {
      const listing = normalizeListing(raw, ctx);
      if (listing && !byId.has(listing.id)) byId.set(listing.id, listing);
    }
  };

  // One page through the shared queue, with retries. Throws STOP once the run is cancelled or blocked.
  const loadPage = url => limit(async () => {
    let fetched = false;
    try {
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) s.stopReason ??= 'cancelled';
        if (s.stopReason) throw STOP;
        try {
          fetched = true;
          return extractSearchPage(await fetchPage(url, signal));
        } catch (e) {
          if (signal?.aborted) { s.stopReason ??= 'cancelled'; throw STOP; }
          if (isRetryable(e) && attempt < retryDelays.length) {
            await sleep(retryDelays[attempt], signal);
            continue;
          }
          throw e;
        }
      }
    } finally {
      if (fetched && !s.stopReason) await pause();
    }
  });

  const pageFailed = (e, isRoot) => {
    if (e === STOP) return;
    if (isRoot) throw e;
    if (e instanceof ExtractError) s.stopReason ??= 'blocked';
    else s.failedPages++;
  };

  async function processRange(range, isRoot) {
    const url = rangeUrl(searchUrl, range);
    let first;
    try {
      first = await loadPage(url);
    } catch (e) {
      pageFailed(e, isRoot);
      report();
      return;
    }
    s.ranges++;
    s.pagesDone++;
    if (isRoot) {
      s.priceMax = first.priceFilter?.max ?? null;
      s.expectedTotal = hasUserPrice ? null : first.priceFilter?.histogramTotal ?? null;
    }
    add(first.results);

    if (first.pageCursors.length >= MAX_PAGES) {
      const halves = splitRange(range, s.priceMax);
      if (halves) {
        s.pagesKnown += halves.length;
        report();
        await Promise.all(halves.map(half => processRange(half, false)));
        return;
      }
      s.saturatedRanges++;
    }

    const rest = first.pageCursors.slice(1);
    s.pagesKnown += rest.length;
    report();
    await Promise.all(rest.map(async cursor => {
      try {
        const page = await loadPage(pageUrl(url, cursor));
        s.pagesDone++;
        add(page.results);
      } catch (e) {
        pageFailed(e, false);
      }
      report();
    }));
  }

  await processRange({ lo: userMin ?? 0, hi: userMax ?? null }, true);

  return {
    listings: [...byId.values()],
    meta: {
      searchUrl,
      origin: ctx.origin,
      nights: ctx.nights,
      placeLabel: placeLabel(searchUrl),
      collectedAt: new Date().toISOString(),
      expectedTotal: s.expectedTotal,
      saturatedRanges: s.saturatedRanges,
      failedPages: s.failedPages,
      partial: s.stopReason != null || s.failedPages > 0 || s.saturatedRanges > 0,
      stopReason: s.stopReason,
    },
  };
}
