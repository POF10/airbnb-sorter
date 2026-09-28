import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCache, saveCache } from '../src/cache.js';

function memoryStorage() {
  const data = new Map();
  return {
    get: (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
    set: (key, value) => data.set(key, structuredClone(value)),
  };
}

const URL_A = 'https://www.airbnb.com/s/Riga--Latvia/homes?adults=2';
const URL_B = 'https://www.airbnb.com/s/Riga--Latvia/homes?adults=3';
const collection = { listings: [{ id: '1' }], meta: { collectedAt: '2026-09-28T12:00:00.000Z' } };

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
