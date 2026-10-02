import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOMEPAGE_URL, ISSUES_URL, PRIVACY_URL, STORE_URL, REVIEWS_URL, SUPPORT_LINKS, hasPlaceholderSupportLinks } from '../src/config.js';

test('project links are https URLs of the repository', () => {
  assert.equal(new URL(HOMEPAGE_URL).protocol, 'https:');
  assert.ok(ISSUES_URL.startsWith(`${HOMEPAGE_URL}/`));
});

test('every support link has a label and an https URL', () => {
  for (const link of SUPPORT_LINKS) {
    assert.ok(link.label.trim(), 'label');
    assert.equal(new URL(link.url).protocol, 'https:');
  }
});

test('hasPlaceholderSupportLinks spots example.com entries', () => {
  assert.equal(hasPlaceholderSupportLinks([]), false);
  assert.equal(hasPlaceholderSupportLinks([{ label: 'Ko-fi', url: 'https://ko-fi.com/someone' }]), false);
  assert.equal(hasPlaceholderSupportLinks([{ label: 'Ko-fi', url: 'https://ko-fi.com/someone' }, { label: 'X', url: 'https://example.com/support/x' }]), true);
});

test('the privacy policy lives in the repository, the reviews on the store page', () => {
  assert.ok(PRIVACY_URL.startsWith(`${HOMEPAGE_URL}/`));
  assert.equal(new URL(STORE_URL).hostname, 'chromewebstore.google.com');
  assert.equal(REVIEWS_URL, `${STORE_URL}/reviews`);
});
