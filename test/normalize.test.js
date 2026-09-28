import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListing, decodeListingId, listingUrl } from '../src/normalize.js';
import { searchContext } from '../src/search-url.js';
import { RIGA_URL, regular, discounted, noCoords, noId } from './fixtures/riga.js';

const ctx = searchContext(RIGA_URL);

test('normalizes a regular listing', () => {
  assert.deepEqual(normalizeListing(regular, ctx), {
    id: '1115734396810872631',
    url: 'https://www.airbnb.com/rooms/1115734396810872631?check_in=2026-10-16&check_out=2026-10-19&adults=2',
    title: 'Condo in Centrs',
    name: 'Charming Apartment with  Terrace and Free Parking',
    photos: [regular.contextualPictures[0].picture, regular.contextualPictures[1].picture],
    price: { amount: 223, currency: '€', label: '€223 total', qualifier: 'total', original: null },
    pricePerNight: 74.33,
    rating: 5,
    reviews: 200,
    lat: 56.9536,
    lng: 24.1324,
    details: ['1 bedroom', '2 beds'],
    badges: ['Guest favorite'],
  });
});

test('discounted price keeps the original; "New" has no rating', () => {
  const listing = normalizeListing(discounted, ctx);
  assert.equal(listing.id, '42');
  assert.deepEqual(listing.price, { amount: 146, currency: '€', label: '€146 total, originally €175', qualifier: 'total', original: 175 });
  assert.equal(listing.pricePerNight, 48.67);
  assert.equal(listing.rating, null);
  assert.equal(listing.reviews, null);
  assert.deepEqual(listing.badges, []);
});

test('missing coordinates, photos and price become null or empty', () => {
  const listing = normalizeListing(noCoords, ctx);
  assert.equal(listing.lat, null);
  assert.equal(listing.lng, null);
  assert.deepEqual(listing.photos, []);
  assert.deepEqual(listing.price, { amount: null, currency: null, label: null, qualifier: null, original: null });
  assert.equal(listing.pricePerNight, null);
  assert.equal(listing.name, 'Fallback name');
});

test('a listing without id is dropped', () => {
  assert.equal(normalizeListing(noId, ctx), null);
});

test('no dates -> no per-night price and a bare listing URL', () => {
  const listing = normalizeListing(regular, searchContext('https://www.airbnb.com/s/Riga--Latvia/homes'));
  assert.equal(listing.pricePerNight, null);
  assert.equal(listing.url, 'https://www.airbnb.com/rooms/1115734396810872631');
});

test('review count with a thousands separator', () => {
  const listing = normalizeListing({ ...regular, avgRatingLocalized: '4.87 (1,234)' }, ctx);
  assert.equal(listing.rating, 4.87);
  assert.equal(listing.reviews, 1234);
});

test('decodeListingId', () => {
  assert.equal(decodeListingId(btoa('DemandStayListing:123')), '123');
  assert.equal(decodeListingId(btoa('StaySupplyListing:123')), null);
  assert.equal(decodeListingId('not base64!'), null);
  assert.equal(decodeListingId(undefined), null);
});

test('listingUrl passes dates and guests through', () => {
  const c = searchContext('https://www.airbnb.com/s/Riga/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2&children=1&pets=1');
  assert.equal(listingUrl('9', c), 'https://www.airbnb.com/rooms/9?check_in=2026-10-16&check_out=2026-10-19&adults=2&children=1&pets=1');
});
