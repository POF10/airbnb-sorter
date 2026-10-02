import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInstalled } from '../src/extension/installed.js';

function opened(details) {
  let count = 0;
  handleInstalled(details, () => { count++; });
  return count;
}

test('the welcome page opens after the first install', () => {
  assert.equal(opened({ reason: 'install' }), 1);
});

test('it does not open on updates or other events', () => {
  assert.equal(opened({ reason: 'update', previousVersion: '0.2.0' }), 0);
  assert.equal(opened({ reason: 'chrome_update' }), 0);
  assert.equal(opened({ reason: 'shared_module_update' }), 0);
  assert.equal(opened({}), 0);
  assert.equal(opened(undefined), 0);
});
