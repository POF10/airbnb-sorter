import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMAINS } from '../src/extension/domains.js';

test('70 Airbnb domains, no duplicates, all lower-case airbnb.<zone>', () => {
  assert.equal(DOMAINS.length, 70);
  assert.equal(new Set(DOMAINS).size, DOMAINS.length);
  for (const domain of DOMAINS) assert.match(domain, /^airbnb\.[a-z]{2,3}(\.[a-z]{2})?$/);
  for (const expected of ['airbnb.com', 'airbnb.co.uk', 'airbnb.lv', 'airbnb.ru', 'airbnb.com.br', 'airbnb.cat']) {
    assert.ok(DOMAINS.includes(expected), expected);
  }
});

test('the userscript @include regex accepts every domain of the extension', async () => {
  const header = await readFile(new URL('../src/header.txt', import.meta.url), 'utf8');
  const source = header.match(/^\/\/ @include\s+\/(.+)\/\s*$/m)[1];
  const include = new RegExp(source);
  for (const domain of DOMAINS) {
    assert.match(`https://www.${domain}/s/Riga--Latvia/homes`, include, domain);
    assert.match(`https://ru.${domain}/`, include, domain);
  }
});
