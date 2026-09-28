import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, splitRange, HttpError } from '../src/collector.js';
import { ExtractError } from '../src/extract.js';
import { fakeAirbnb, listingsWithPrices, pageOffset } from './helpers/fake-airbnb.js';

const HREF = 'https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2';
const fast = { pause: async () => {}, retryDelays: [0, 0, 0] };
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test('small search: loads every page without a price split', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(51, 90)));
  const { listings, meta } = await collect(HREF, { fetchPage: air.fetchPage, ...fast });
  assert.equal(listings.length, 40);
  assert.equal(air.calls.length, 3);
  assert.ok(air.calls.every(u => !u.includes('price_min') && !u.includes('price_max')));
  assert.equal(meta.expectedTotal, 40);
  assert.equal(meta.partial, false);
  assert.equal(meta.stopReason, null);
  assert.equal(meta.nights, 3);
  assert.equal(meta.placeLabel, 'Riga, Latvia');
  assert.equal(meta.origin, 'https://www.airbnb.com');
});

test('listings are normalized with the search context', async () => {
  const air = fakeAirbnb(listingsWithPrices([80]));
  const { listings } = await collect(HREF, { fetchPage: air.fetchPage, ...fast });
  assert.equal(listings[0].id, '1');
  assert.equal(listings[0].url, 'https://www.airbnb.com/rooms/1?check_in=2026-10-16&check_out=2026-10-19&adults=2');
  assert.equal(listings[0].price.amount, 240);
  assert.equal(listings[0].pricePerNight, 80);
});

test('progress ends with the final counts', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 40)));
  const seen = [];
  await collect(HREF, { fetchPage: air.fetchPage, onProgress: p => seen.push(p), ...fast });
  const last = seen.at(-1);
  assert.equal(last.pagesDone, 3);
  assert.equal(last.listings, 40);
  assert.equal(last.expectedTotal, 40);
  assert.equal(last.pagesPlanned, 3);
  assert.equal(last.ranges, 1);
});

test('never runs more than `concurrency` requests at once', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 200)), { latencyMs: 5 });
  await collect(HREF, { fetchPage: air.fetchPage, concurrency: 3, ...fast });
  assert.equal(air.maxInFlight, 3);
});

test('splitRange', () => {
  assert.deepEqual(splitRange({ lo: 0, hi: null }, 520), [{ lo: 0, hi: 520 }, { lo: 520, hi: null }]);
  assert.deepEqual(splitRange({ lo: 520, hi: null }, 520), [{ lo: 520, hi: 1040 }, { lo: 1040, hi: null }]);
  assert.deepEqual(splitRange({ lo: 10, hi: null }, null), [{ lo: 10, hi: 60 }, { lo: 60, hi: null }]);
  assert.deepEqual(splitRange({ lo: 0, hi: 520 }, 520), [{ lo: 0, hi: 260 }, { lo: 260, hi: 520 }]);
  assert.deepEqual(splitRange({ lo: 98, hi: 100 }, 520), [{ lo: 98, hi: 99 }, { lo: 99, hi: 100 }]);
  assert.equal(splitRange({ lo: 99, hi: 100 }, 520), null);
});

test('saturated search is split by price and collected completely', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(30, 629))); // 600 listings
  const { listings, meta } = await collect(HREF, { fetchPage: air.fetchPage, ...fast });
  assert.equal(listings.length, 600);
  assert.equal(new Set(listings.map(l => l.id)).size, 600);
  assert.equal(meta.saturatedRanges, 0);
  assert.equal(meta.partial, false);
  assert.equal(meta.expectedTotal, 600);
  assert.ok(air.calls.some(u => new URL(u).searchParams.get('price_max') === '520'));
});

test('listings priced exactly on a split boundary are not lost', async () => {
  // Fractional prices catch splits that do not overlap ([lo, mid] + [mid + 1, hi] would lose 260.5).
  const prices = [...Array(200).fill(260), ...Array(100).fill(100), 260.5, 520.5];
  const air = fakeAirbnb(listingsWithPrices(prices));
  const { listings, meta } = await collect(HREF, { fetchPage: air.fetchPage, ...fast });
  assert.equal(listings.length, 302);
  assert.equal(meta.partial, false);
});

test('a range that cannot be split is marked saturated', async () => {
  const air = fakeAirbnb(listingsWithPrices(Array(300).fill(100)));
  const { listings, meta } = await collect(HREF, { fetchPage: air.fetchPage, ...fast });
  assert.equal(listings.length, 270);
  assert.ok(meta.saturatedRanges >= 1);
  assert.equal(meta.partial, true);
});

test('keeps splitting above the histogram maximum', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1000, 1399))); // all above maxValue 520
  const { listings } = await collect(HREF, { fetchPage: air.fetchPage, ...fast });
  assert.equal(listings.length, 400);
});

test("the user's own price filter becomes the outer range", async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 300)));
  const { listings, meta } = await collect(`${HREF}&price_min=100&price_max=150&price_filter_input_type=0`, { fetchPage: air.fetchPage, ...fast });
  assert.equal(listings.length, 51);
  assert.equal(meta.expectedTotal, null);
  assert.ok(air.calls.every(u => {
    const p = new URL(u).searchParams;
    return p.get('price_min') === '100' && p.get('price_max') === '150';
  }));
});

test('429 is retried and the page still loads', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 40)));
  let failed = false;
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) === 18 && !failed) { failed = true; throw new HttpError(429); }
    return air.fetchPage(url, signal);
  };
  const { listings, meta } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(listings.length, 40);
  assert.equal(meta.failedPages, 0);
});

test('network errors are retried', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 40)));
  let failed = false;
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) === 18 && !failed) { failed = true; throw new TypeError('Failed to fetch'); }
    return air.fetchPage(url, signal);
  };
  const { listings } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(listings.length, 40);
});

test('a page that keeps failing is skipped after 3 retries', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 40)));
  let attempts = 0;
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) === 18) { attempts++; throw new HttpError(503); }
    return air.fetchPage(url, signal);
  };
  const { listings, meta } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(attempts, 4);
  assert.equal(listings.length, 22);
  assert.equal(meta.failedPages, 1);
  assert.equal(meta.partial, true);
  assert.equal(meta.stopReason, null);
});

test('404 is not retried', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 40)));
  let attempts = 0;
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) === 18) { attempts++; throw new HttpError(404); }
    return air.fetchPage(url, signal);
  };
  const { meta } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(attempts, 1);
  assert.equal(meta.failedPages, 1);
});

test('a blocked page stops the run and keeps what was collected', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 250)));
  let captchas = 0;
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) < 36) return air.fetchPage(url, signal);
    captchas++;
    return '<html><body>captcha</body></html>';
  };
  const { listings, meta } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(meta.stopReason, 'blocked');
  assert.equal(meta.partial, true);
  assert.ok(listings.length >= 18 && listings.length < 250);
  assert.ok(captchas <= 3, `requests after the block: ${captchas}`);
});

test('no data on the very first page rejects with ExtractError without retrying', async () => {
  let calls = 0;
  const fetchPage = async () => { calls++; return '<html>login</html>'; };
  await assert.rejects(collect(HREF, { fetchPage, ...fast }), ExtractError);
  assert.equal(calls, 1);
});

test('403 stops the run as blocked', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 250)));
  let refused = 0;
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) < 36) return air.fetchPage(url, signal);
    refused++;
    throw new HttpError(403);
  };
  const { meta } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(meta.stopReason, 'blocked');
  assert.ok(refused <= 3, `requests after the block: ${refused}`);
});

test('pages failing three times in a row stop the run as blocked', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 250))); // 14 pages
  let failed = 0;
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) < 36) return air.fetchPage(url, signal);
    failed++;
    throw new HttpError(503);
  };
  const { meta } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(meta.stopReason, 'blocked');
  assert.ok(meta.failedPages >= 3 && meta.failedPages < 12, `failed pages: ${meta.failedPages}`);
  assert.ok(failed <= 5 * 4, `failed requests: ${failed}`);
});

test('stops at the request budget if Airbnb ignores the price filter', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 400)));
  let requests = 0;
  const fetchPage = async (url, signal) => {
    requests++;
    const ignored = new URL(url);
    ignored.searchParams.delete('price_min');
    ignored.searchParams.delete('price_max');
    return air.fetchPage(ignored.toString(), signal);
  };
  const { meta } = await collect(HREF, { fetchPage, ...fast });
  assert.equal(meta.stopReason, 'limit');
  assert.equal(meta.partial, true);
  assert.ok(requests <= 300, `requests: ${requests}`);
});

test('maxRequests overrides the budget', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 100)));
  const { listings, meta } = await collect(HREF, { fetchPage: air.fetchPage, maxRequests: 2, ...fast });
  assert.equal(meta.stopReason, 'limit');
  assert.equal(listings.length, 36);
});

test('a failing first page rejects with its error', async () => {
  await assert.rejects(collect(HREF, { fetchPage: async () => { throw new HttpError(404); }, ...fast }), HttpError);
});

test('cancel during the first page resolves with nothing collected', async () => {
  const controller = new AbortController();
  const fetchPage = async () => {
    controller.abort();
    throw new DOMException('This operation was aborted', 'AbortError');
  };
  const { listings, meta } = await collect(HREF, { fetchPage, signal: controller.signal, ...fast });
  assert.equal(listings.length, 0);
  assert.equal(meta.stopReason, 'cancelled');
});

test('no requests are sent after cancel', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 250)), { latencyMs: 5 });
  const controller = new AbortController();
  let calls = 0;
  const fetchPage = async (url, signal) => {
    if (++calls === 4) controller.abort();
    return air.fetchPage(url, signal);
  };
  const { meta } = await collect(HREF, { fetchPage, signal: controller.signal, ...fast });
  assert.equal(meta.stopReason, 'cancelled');
  assert.equal(calls, 4);
});

test('cancel interrupts a retry wait', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 40)));
  const controller = new AbortController();
  const fetchPage = async (url, signal) => {
    if (pageOffset(url) !== 18) return air.fetchPage(url, signal);
    setTimeout(() => controller.abort(), 20);
    throw new HttpError(503);
  };
  const started = Date.now();
  const { meta } = await collect(HREF, { fetchPage, signal: controller.signal, pause: async () => {}, retryDelays: [10_000] });
  assert.equal(meta.stopReason, 'cancelled');
  assert.ok(Date.now() - started < 2000);
});

test('a throwing onProgress does not break the run', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 40)));
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { listings } = await collect(HREF, { fetchPage: air.fetchPage, onProgress: () => { throw new Error('ui'); }, ...fast });
    assert.equal(listings.length, 40);
  } finally {
    console.warn = warn;
  }
});

test('progress without an expected total still plans every page', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 300)));
  const seen = [];
  await collect(`${HREF}&price_min=100&price_max=150`, { fetchPage: air.fetchPage, onProgress: p => seen.push(p), ...fast });
  assert.ok(seen.every(p => p.pagesPlanned >= p.pagesDone));
  assert.equal(seen.at(-1).pagesPlanned, 3);
  assert.equal(seen.at(-1).expectedTotal, null);
});

test('cancel returns the listings collected so far', async () => {
  const air = fakeAirbnb(listingsWithPrices(range(1, 100)));
  const controller = new AbortController();
  let calls = 0;
  const fetchPage = async (url, signal) => {
    if (++calls === 3) controller.abort();
    return air.fetchPage(url, signal);
  };
  const { listings, meta } = await collect(HREF, { fetchPage, signal: controller.signal, ...fast });
  assert.equal(meta.stopReason, 'cancelled');
  assert.equal(meta.partial, true);
  assert.ok(listings.length >= 18 && listings.length < 100);
});
