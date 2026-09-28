import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCache, saveCache, cacheKey } from '../src/cache.js';

function memoryStorage() {
  const data = new Map();
  return {
    get: (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
    set: (key, value) => data.set(key, structuredClone(value)),
  };
}

const URL_A = 'https://www.airbnb.com/s/Riga--Latvia/homes?adults=2';
const URL_B = 'https://www.airbnb.com/s/Riga--Latvia/homes?adults=3';
const collection = { listings: [{ id: '1' }], meta: { searchUrl: URL_A, collectedAt: '2026-09-28T12:00:00.000Z' } };

test('returns the saved collection for the same search', () => {
  const storage = memoryStorage();
  saveCache(storage, URL_A, collection);
  assert.deepEqual(loadCache(storage, URL_A), collection);
});

test('a different search misses the cache', () => {
  const storage = memoryStorage();
  saveCache(storage, URL_A, collection);
  assert.equal(loadCache(storage, URL_B), null);
});

test('only the last collection is kept', () => {
  const storage = memoryStorage();
  saveCache(storage, URL_A, collection);
  saveCache(storage, URL_B, collection);
  assert.equal(loadCache(storage, URL_A), null);
  assert.deepEqual(loadCache(storage, URL_B), collection);
});

test('storage failures are swallowed', () => {
  const broken = { get: () => { throw new Error('boom'); }, set: () => { throw new Error('quota'); } };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.doesNotThrow(() => saveCache(broken, URL_A, collection));
    assert.equal(loadCache(broken, URL_A), null);
  } finally {
    console.warn = warn;
  }
});

test('photos are trimmed to 10 in the cache', () => {
  const storage = memoryStorage();
  const photos = Array.from({ length: 27 }, (_, i) => `https://a0.muscache.com/im/pictures/${i}.jpeg`);
  saveCache(storage, URL_A, { listings: [{ id: '1', photos }], meta: collection.meta });
  assert.deepEqual(loadCache(storage, URL_A).listings[0].photos, photos.slice(0, 10));
});

test('a cache written by another version is ignored', () => {
  const storage = memoryStorage();
  storage.set('lastCollection', { key: cacheKey(URL_A), listings: [{ id: '1' }], meta: {} });
  assert.equal(loadCache(storage, URL_A), null);
});

test('tracking params and parameter order do not change the cache key', () => {
  assert.equal(
    cacheKey('https://www.airbnb.com/s/Riga--Latvia/homes?adults=2&checkin=2026-10-16&search_type=filter_change&source=structured_search_input_header'),
    cacheKey('https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&adults=2'),
  );
  assert.notEqual(cacheKey(URL_A), cacheKey(URL_B));
});

test('an entry without usable meta is ignored', () => {
  const storage = memoryStorage();
  storage.set('lastCollection', { v: 1, key: cacheKey(URL_A), listings: [{ id: '1' }], meta: null });
  assert.equal(loadCache(storage, URL_A), null);
});
