import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, LANGUAGES, DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings, resolveLocale } from '../src/settings.js';
import { memoryStorage, asyncStorage, brokenStorage, rejectingStorage, quietly } from './helpers/storage.js';

test('defaults: automatic language, price descending', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { language: 'auto', sort: 'price-desc' });
  assert.deepEqual(LANGUAGES, ['auto', 'en', 'ru']);
});

test('normalizeSettings keeps known values and replaces everything else with the defaults', () => {
  assert.deepEqual(normalizeSettings({ language: 'ru', sort: 'rating-desc' }), { language: 'ru', sort: 'rating-desc' });
  assert.deepEqual(normalizeSettings({ language: 'de', sort: 'cheapest' }), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ language: 'en' }), { language: 'en', sort: 'price-desc' });
  assert.deepEqual(normalizeSettings({ sort: 'toString' }), DEFAULT_SETTINGS); // inherited names are not sorts
  assert.deepEqual(normalizeSettings({ language: 'ru', extra: 1 }), { language: 'ru', sort: 'price-desc' });
  for (const junk of [null, undefined, 'ru', 42, []]) assert.deepEqual(normalizeSettings(junk), DEFAULT_SETTINGS);
});

for (const [kind, makeStorage] of [['sync', memoryStorage], ['async', asyncStorage]]) {
  test(`${kind} storage: empty storage gives the defaults`, async () => {
    assert.deepEqual(await loadSettings(makeStorage()), DEFAULT_SETTINGS);
  });

  test(`${kind} storage: saveSettings merges the patch into what is stored`, async () => {
    const storage = makeStorage();
    assert.deepEqual(await saveSettings(storage, { language: 'ru' }), { language: 'ru', sort: 'price-desc' });
    assert.deepEqual(await saveSettings(storage, { sort: 'price-asc' }), { language: 'ru', sort: 'price-asc' });
    assert.deepEqual(await loadSettings(storage), { language: 'ru', sort: 'price-asc' });
    assert.deepEqual(await storage.get(SETTINGS_KEY, null), { language: 'ru', sort: 'price-asc' });
  });

  test(`${kind} storage: an invalid patch value falls back to the default`, async () => {
    const storage = makeStorage();
    await saveSettings(storage, { language: 'ru' });
    assert.deepEqual(await saveSettings(storage, { language: 'klingon' }), DEFAULT_SETTINGS);
  });
}

for (const [kind, broken] of [['throwing', brokenStorage], ['rejecting', rejectingStorage]]) {
  test(`${kind} storage: loading gives the defaults, saving still returns the merged settings`, async () => {
    await quietly(async () => {
      assert.deepEqual(await loadSettings(broken), DEFAULT_SETTINGS);
      assert.deepEqual(await saveSettings(broken, { language: 'ru' }), { language: 'ru', sort: 'price-desc' });
    });
  });
}

test('loadSettings returns a fresh object, not the frozen defaults', async () => {
  const settings = await loadSettings(brokenStorage);
  settings.language = 'ru';
  assert.equal(DEFAULT_SETTINGS.language, 'auto');
});

test('resolveLocale: auto asks the detector, an explicit language wins', () => {
  assert.equal(resolveLocale('auto', () => 'ru'), 'ru');
  assert.equal(resolveLocale('auto', () => 'en'), 'en');
  assert.equal(resolveLocale('en', () => 'ru'), 'en');
  assert.equal(resolveLocale('ru', () => { throw new Error('not called'); }), 'ru');
});
