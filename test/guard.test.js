import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimPage, isPageClaimed } from '../src/guard.js';

// The two methods of <html> the guard uses; `attributes` lets a test look at what was set.
function fakeDocument() {
  const attributes = new Map();
  return {
    attributes,
    documentElement: {
      hasAttribute: name => attributes.has(name),
      setAttribute: (name, value) => { attributes.set(name, String(value)); },
    },
  };
}

test('the first claim wins, later ones are refused', () => {
  const doc = fakeDocument();
  assert.equal(isPageClaimed(doc), false);
  assert.equal(claimPage(doc), true);
  assert.equal(isPageClaimed(doc), true);
  assert.equal(claimPage(doc), false);
  assert.equal(claimPage(doc), false);
});

test('pages are claimed independently', () => {
  const first = fakeDocument();
  const second = fakeDocument();
  assert.equal(claimPage(first), true);
  assert.equal(claimPage(second), true);
});

// Separately released builds (userscript, extension) recognise each other by this exact name: never rename it.
test('the claim is the data-airbnb-sorter attribute on <html>', () => {
  const doc = fakeDocument();
  claimPage(doc);
  assert.deepEqual([...doc.attributes.keys()], ['data-airbnb-sorter']);
});
