import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromeStorage, onLocalChange } from '../src/extension/storage.js';

// The slice of chrome.storage.local the adapter uses.
function fakeArea() {
  const data = {};
  return {
    data,
    get: async key => (Object.hasOwn(data, key) ? { [key]: structuredClone(data[key]) } : {}),
    set: async items => { Object.assign(data, structuredClone(items)); },
  };
}

test('chromeStorage reads a stored value and falls back when the key is absent', async () => {
  const area = fakeArea();
  const storage = chromeStorage(area);
  assert.equal(await storage.get('settings', null), null);
  assert.deepEqual(await storage.get('settings', { language: 'auto' }), { language: 'auto' });
  await storage.set('settings', { language: 'ru' });
  assert.deepEqual(area.data, { settings: { language: 'ru' } });
  assert.deepEqual(await storage.get('settings', null), { language: 'ru' });
});

test('chromeStorage returns stored falsy values instead of the fallback', async () => {
  const storage = chromeStorage(fakeArea());
  for (const value of [false, 0, '', null]) {
    await storage.set('flag', value);
    assert.equal(await storage.get('flag', 'fallback'), value);
  }
});

test('chromeStorage turns failures into rejections (an updated extension invalidates the context)', async () => {
  const throwing = () => { throw new Error('Extension context invalidated.'); }; // what real Chrome does
  const rejecting = async () => { throw new Error('Extension context invalidated.'); };
  for (const dead of [{ get: throwing, set: throwing }, { get: rejecting, set: rejecting }]) {
    const storage = chromeStorage(dead);
    await assert.rejects(storage.get('settings', null), /invalidated/);
    await assert.rejects(storage.set('settings', {}), /invalidated/);
  }
});

test('onLocalChange fires only for the given key in the local area', () => {
  const listeners = [];
  const events = { addListener: listener => listeners.push(listener) };
  let calls = 0;
  onLocalChange(events, 'settings', () => { calls++; });
  assert.equal(listeners.length, 1);
  listeners[0]({ settings: { newValue: { language: 'ru' } } }, 'local');
  assert.equal(calls, 1);
  listeners[0]({ lastCollection: { newValue: {} } }, 'local');
  listeners[0]({ settings: { newValue: {} } }, 'sync');
  assert.equal(calls, 1);
});
