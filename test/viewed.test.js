import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEWED_KEY, VIEWED_LIMIT, loadViewed, markViewed, clearViewed, listingIdFromPath } from '../src/viewed.js';
import { memoryStorage, asyncStorage, brokenStorage, rejectingStorage, captureWarnings } from './helpers/storage.js';

for (const [kind, makeStorage] of [['sync', memoryStorage], ['async', asyncStorage]]) {
  test(`${kind} storage: nothing is viewed at first`, async () => {
    assert.deepEqual(await loadViewed(makeStorage()), {});
  });

  test(`${kind} storage: markViewed records the listing with its time and returns the whole map`, async () => {
    const storage = makeStorage();
    assert.deepEqual(await markViewed(storage, '101', 1000), { 101: 1000 });
    assert.deepEqual(await markViewed(storage, '202', 2000), { 101: 1000, 202: 2000 });
    assert.deepEqual(await loadViewed(storage), { 101: 1000, 202: 2000 });
    assert.deepEqual(await storage.get(VIEWED_KEY, null), { 101: 1000, 202: 2000 });
  });

  test(`${kind} storage: viewing the same listing again only refreshes its time`, async () => {
    const storage = makeStorage();
    await markViewed(storage, '101', 1000);
    assert.deepEqual(await markViewed(storage, '101', 5000), { 101: 5000 });
  });

  test(`${kind} storage: clearViewed forgets everything`, async () => {
    const storage = makeStorage();
    await markViewed(storage, '101', 1000);
    await clearViewed(storage);
    assert.deepEqual(await loadViewed(storage), {});
  });
}

test('past the limit the oldest views are dropped', async () => {
  const storage = memoryStorage();
  const full = Object.fromEntries(Array.from({ length: VIEWED_LIMIT }, (_, i) => [String(i + 1), i + 1]));
  storage.set(VIEWED_KEY, full);
  const viewed = await markViewed(storage, 'new', VIEWED_LIMIT + 1);
  assert.equal(Object.keys(viewed).length, VIEWED_LIMIT);
  assert.equal(viewed.new, VIEWED_LIMIT + 1);
  assert.equal(viewed[1], undefined); // the oldest one went
  assert.equal(viewed[2], 2);
});

test('refreshing an old view saves it from being dropped', async () => {
  const storage = memoryStorage();
  storage.set(VIEWED_KEY, Object.fromEntries(Array.from({ length: VIEWED_LIMIT }, (_, i) => [String(i + 1), i + 1])));
  await markViewed(storage, '1', VIEWED_LIMIT + 1); // listing 1 becomes the newest
  const viewed = await markViewed(storage, 'new', VIEWED_LIMIT + 2);
  assert.equal(viewed[1], VIEWED_LIMIT + 1);
  assert.equal(viewed[2], undefined);
});

test('a damaged entry reads as nothing viewed, stray values are dropped', async () => {
  for (const junk of ['oops', 42, [1, 2], null]) {
    const storage = memoryStorage();
    storage.set(VIEWED_KEY, junk);
    assert.deepEqual(await loadViewed(storage), {});
  }
  const storage = memoryStorage();
  storage.set(VIEWED_KEY, { 101: 1000, 202: 'yesterday', 303: null, 404: Number.NaN });
  assert.deepEqual(await loadViewed(storage), { 101: 1000 });
});

for (const [kind, broken] of [['throwing', brokenStorage], ['rejecting', rejectingStorage]]) {
  test(`${kind} storage: reading gives nothing viewed, writing is logged, not thrown`, async () => {
    const warnings = await captureWarnings(async () => {
      assert.deepEqual(await loadViewed(broken), {});
      assert.deepEqual(await markViewed(broken, '101', 1000), { 101: 1000 });
      await assert.doesNotReject(clearViewed(broken));
    });
    assert.equal(warnings.length, 2);
  });
}

test('listingIdFromPath recognises listing pages only', () => {
  assert.equal(listingIdFromPath('/rooms/891289662212272148'), '891289662212272148');
  assert.equal(listingIdFromPath('/rooms/12345/'), '12345');
  assert.equal(listingIdFromPath('/rooms/plus/12345'), '12345');
  assert.equal(listingIdFromPath('/rooms/12345/photos'), '12345');
  assert.equal(listingIdFromPath('/s/Riga--Latvia/homes'), null);
  assert.equal(listingIdFromPath('/rooms'), null);
  assert.equal(listingIdFromPath('/rooms/abc'), null);
  assert.equal(listingIdFromPath('/rooms/123abc'), null);
  assert.equal(listingIdFromPath('/experiences/12345'), null);
  assert.equal(listingIdFromPath('/'), null);
  assert.equal(listingIdFromPath(undefined), null);
});
