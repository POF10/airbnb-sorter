import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice } from '../src/price.js';

test('euro prefix with thousands comma', () => {
  assert.deepEqual(parsePrice('€1,234'), { amount: 1234, currency: '€' });
});

test('plain euro', () => {
  assert.deepEqual(parsePrice('€223'), { amount: 223, currency: '€' });
});

test('currency suffix with no-break space grouping', () => {
  assert.deepEqual(parsePrice('1\u00a0234\u00a0€'), { amount: 1234, currency: '€' });
});

test('dollar with decimals', () => {
  assert.deepEqual(parsePrice('$1,234.50'), { amount: 1234.5, currency: '$' });
});

test('yen', () => {
  assert.deepEqual(parsePrice('¥12,345'), { amount: 12345, currency: '¥' });
});

test('rouble with narrow no-break spaces', () => {
  assert.deepEqual(parsePrice('₽\u202f12\u202f345'), { amount: 12345, currency: '₽' });
});

test('dot as thousands separator', () => {
  assert.deepEqual(parsePrice('1.234 €'), { amount: 1234, currency: '€' });
});

test('comma as decimal separator', () => {
  assert.deepEqual(parsePrice('12,50 €'), { amount: 12.5, currency: '€' });
});

test('multi-letter currency', () => {
  assert.deepEqual(parsePrice('CA$1,234'), { amount: 1234, currency: 'CA$' });
});

test('garbage and empty input', () => {
  assert.equal(parsePrice('free'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(undefined), null);
});
