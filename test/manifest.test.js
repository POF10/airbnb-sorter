import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMAINS } from '../src/extension/domains.js';
import { buildManifest, matchPattern } from '../src/extension/manifest.js';
import { setLocale, t } from '../src/i18n.js';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('match patterns cover the subdomains of a domain over https', () => {
  assert.equal(matchPattern('airbnb.co.uk'), 'https://*.airbnb.co.uk/*');
});

test('the manifest is MV3 with the package version and only the storage permission', () => {
  const manifest = buildManifest({ version: '1.2.3' });
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.2.3');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.options_ui.page, 'popup.html');
});

test('one content script on every Airbnb domain, top frame only', () => {
  const { content_scripts: scripts } = buildManifest({ version: '1.2.3' });
  assert.equal(scripts.length, 1);
  assert.deepEqual(scripts[0].js, ['content.js']);
  assert.equal(scripts[0].run_at, 'document_idle');
  assert.equal(scripts[0].all_frames, undefined);
  assert.deepEqual(scripts[0].matches, DOMAINS.map(domain => `https://*.${domain}/*`));
});

test('the manifest is plain JSON', () => {
  const manifest = buildManifest({ version: '1.2.3' });
  assert.deepEqual(JSON.parse(JSON.stringify(manifest)), manifest);
});

test('both locales define the name and a description within the Web Store limit', async () => {
  for (const locale of ['en', 'ru']) {
    const messages = await readJson(`../src/extension/_locales/${locale}/messages.json`);
    assert.deepEqual(Object.keys(messages).sort(), ['extDescription', 'extName']);
    assert.ok(messages.extName.message.length <= 45, `${locale}: name length`);
    assert.ok(messages.extDescription.message.length <= 132, `${locale}: description length`);
    assert.match(messages.extName.message, /Airbnb$/); // "… for Airbnb" / "… для Airbnb": never Airbnb first
  }
});

test('the popup title is the extension name in each language', async () => {
  for (const locale of ['en', 'ru']) {
    const messages = await readJson(`../src/extension/_locales/${locale}/messages.json`);
    setLocale(locale);
    assert.equal(t().popup.title, messages.extName.message);
  }
});
