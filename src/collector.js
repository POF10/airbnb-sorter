import { extractSearchPage, ExtractError } from './extract.js';
import { normalizeListing } from './normalize.js';
import { parseSearchUrl, rangeUrl, pageUrl, searchContext, placeLabel } from './search-url.js';

export const MAX_PAGES = 15;
const PAGE_SIZE = 18;
// Request budget: at least MIN_BUDGET, or 4 requests per expected page. Guards against endless splitting
// if Airbnb ever stops applying the price filter.
const MIN_BUDGET = 300;
// This many pages failing in a row (after retries) look like a block, not bad luck.
const MAX_FAIL_STREAK = 3;
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

const politePause = signal => sleep(250 + Math.random() * 350, signal);

// 429, 5xx and network failures (fetch rejects with TypeError) are worth retrying.
const isRetryable = e => (e instanceof HttpError ? e.status === 429 || e.status >= 500 : e instanceof TypeError);
// A page without data (captcha, login wall) or an auth refusal means Airbnb is blocking us.
const isBlock = e => e instanceof ExtractError || (e instanceof HttpError && (e.status === 401 || e.status === 403));

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
 * maxRequests overrides the request budget (see MIN_BUDGET).
 */
export async function collect(href, {
  fetchPage,
  signal,
  onProgress = () => {},
  concurrency = 3,
  pause = politePause,
  retryDelays = [2000, 4000, 8000],
  maxRequests = null,
}) {
  const { searchUrl, userMin, userMax } = parseSearchUrl(href);
  const ctx = searchContext(searchUrl);
  const hasUserPrice = userMin != null || userMax != null;
  const byId = new Map();
  const limit = createLimiter(concurrency);
  const s = {
    ranges: 0, pagesDone: 0, pagesKnown: 1, saturatedRanges: 0, failedPages: 0, failStreak: 0, requests: 0,
    stopReason: null, expectedTotal: null, priceMax: null,
  };
  const budget = () => maxRequests ?? Math.max(MIN_BUDGET, s.expectedTotal ? 4 * Math.ceil(s.expectedTotal / PAGE_SIZE) : 0);

  // A broken progress callback must not break (or orphan) the run.
  const report = () => {
    try {
      onProgress({
        ranges: s.ranges,
        pagesDone: s.pagesDone,
        pagesPlanned: Math.max(s.pagesKnown, s.expectedTotal ? Math.ceil(s.expectedTotal / PAGE_SIZE) : 0),
        listings: byId.size,
        expectedTotal: s.expectedTotal,
      });
    } catch (e) {
      console.warn('[airbnb-sorter] onProgress failed', e);
    }
  };

  const add = results => {
    for (const raw of results) {
      const listing = normalizeListing(raw, ctx);
      if (listing && !byId.has(listing.id)) byId.set(listing.id, listing);
    }
  };

  // Only the network part is retried; parsing a page that arrived is not. Throws STOP once the run is
  // cancelled, blocked or over budget.
  const fetchWithRetry = async url => {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) s.stopReason ??= 'cancelled';
      if (!s.stopReason && s.requests >= budget()) s.stopReason = 'limit';
      if (s.stopReason) throw STOP;
      s.requests++;
      try {
        return await fetchPage(url, signal);
      } catch (e) {
        if (signal?.aborted) { s.stopReason ??= 'cancelled'; throw STOP; }
        if (!isRetryable(e) || attempt >= retryDelays.length) throw e;
        await sleep(retryDelays[attempt], signal);
      }
    }
  };

  // One page through the shared queue, followed by a polite pause.
  const loadPage = url => limit(async () => {
    const before = s.requests;
    try {
      const page = extractSearchPage(await fetchWithRetry(url));
      s.failStreak = 0;
      return page;
    } finally {
      if (s.requests > before && !s.stopReason) await pause(signal);
    }
  });

  const pageFailed = (e, isRoot) => {
    if (e === STOP) return;
    if (isRoot) throw e;
    if (isBlock(e)) {
      s.stopReason ??= 'blocked';
      return;
    }
    s.failedPages++;
    if (++s.failStreak >= MAX_FAIL_STREAK) s.stopReason ??= 'blocked';
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

  try {
    await processRange({ lo: userMin ?? 0, hi: userMax ?? null }, true);
  } catch (e) {
    s.stopReason ??= 'error'; // let queued pages drain without sending requests
    throw e;
  }

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
