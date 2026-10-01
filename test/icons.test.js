import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildManifest } from '../src/extension/manifest.js';

test('icons are square PNGs of the sizes the manifest names', async () => {
  const { icons } = buildManifest({ version: '1.2.3' });
  assert.deepEqual(Object.keys(icons), ['16', '32', '48', '128']);
  for (const [size, path] of Object.entries(icons)) {
    const png = await readFile(new URL(`../src/extension/${path}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG', path);
    assert.equal(png.readUInt32BE(16), Number(size), `${path}: width`);
    assert.equal(png.readUInt32BE(20), Number(size), `${path}: height`);
  }
});
