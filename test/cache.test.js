import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCache, saveCache, cacheKey } from '../src/cache.js';
import { memoryStorage, asyncStorage, brokenStorage, rejectingStorage, captureWarnings } from './helpers/storage.js';

const URL_A = 'https://www.airbnb.com/s/Riga--Latvia/homes?adults=2';
const URL_B = 'https://www.airbnb.com/s/Riga--Latvia/homes?adults=3';
const collection = { listings: [{ id: '1' }], meta: { searchUrl: URL_A, collectedAt: '2026-09-28T12:00:00.000Z' } };

// Tampermonkey and localStorage answer synchronously, chrome.storage.local with promises: both must work.
for (const [kind, makeStorage] of [['sync', memoryStorage], ['async', asyncStorage]]) {
  test(`${kind} storage: returns the saved collection for the same search`, async () => {
    const storage = makeStorage();
    await saveCache(storage, URL_A, collection);
    assert.deepEqual(await loadCache(storage, URL_A), collection);
  });

  test(`${kind} storage: a different search misses the cache`, async () => {
    const storage = makeStorage();
    await saveCache(storage, URL_A, collection);
    assert.equal(await loadCache(storage, URL_B), null);
  });

  test(`${kind} storage: only the last collection is kept`, async () => {
    const storage = makeStorage();
    await saveCache(storage, URL_A, collection);
    await saveCache(storage, URL_B, collection);
    assert.equal(await loadCache(storage, URL_A), null);
    assert.deepEqual(await loadCache(storage, URL_B), collection);
  });

  test(`${kind} storage: photos are trimmed to 10 in the cache`, async () => {
    const storage = makeStorage();
    const photos = Array.from({ length: 27 }, (_, i) => `https://a0.muscache.com/im/pictures/${i}.jpeg`);
    await saveCache(storage, URL_A, { listings: [{ id: '1', photos }], meta: collection.meta });
    assert.deepEqual((await loadCache(storage, URL_A)).listings[0].photos, photos.slice(0, 10));
  });

  test(`${kind} storage: a cache written by another version is ignored`, async () => {
    const storage = makeStorage();
    await storage.set('lastCollection', { v: 0, key: cacheKey(URL_A), listings: [{ id: '1' }], meta: collection.meta });
    assert.equal(await loadCache(storage, URL_A), null);
  });

  test(`${kind} storage: an entry without usable meta is ignored`, async () => {
    const storage = makeStorage();
    await storage.set('lastCollection', { v: 1, key: cacheKey(URL_A), listings: [{ id: '1' }], meta: null });
    assert.equal(await loadCache(storage, URL_A), null);
  });
}

for (const [kind, broken] of [['throwing', brokenStorage], ['rejecting', rejectingStorage]]) {
  test(`${kind} storage: failures are swallowed, the failed write is logged`, async () => {
    const warnings = await captureWarnings(async () => {
      await assert.doesNotReject(saveCache(broken, URL_A, collection));
      assert.equal(await loadCache(broken, URL_A), null);
    });
    assert.equal(warnings.length, 1);
  });
}

test('a collection that cannot be prepared for the cache is logged, not thrown', async () => {
  const storage = memoryStorage();
  const warnings = await captureWarnings(async () => {
    await assert.doesNotReject(saveCache(storage, URL_A, { listings: [null], meta: collection.meta }));
  });
  assert.equal(warnings.length, 1);
  assert.equal(await loadCache(storage, URL_A), null);
});

test('tracking params and parameter order do not change the cache key', () => {
  assert.equal(
    cacheKey('https://www.airbnb.com/s/Riga--Latvia/homes?adults=2&checkin=2026-10-16&search_type=filter_change&source=structured_search_input_header'),
    cacheKey('https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&adults=2'),
  );
  assert.notEqual(cacheKey(URL_A), cacheKey(URL_B));
});
