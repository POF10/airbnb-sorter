import { parsePrice } from './price.js';
import { nightsBetween } from './search-url.js';

// Airbnb encodes listing ids as base64("DemandStayListing:<digits>"). Ids exceed 2^53, so they stay strings.
export function decodeListingId(encoded) {
  if (typeof encoded !== 'string' || encoded === '') return null;
  let decoded;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const m = /^DemandStayListing:(\d+)$/.exec(decoded);
  return m ? m[1] : null;
}

const ROOM_PARAMS = [['checkin', 'check_in'], ['checkout', 'check_out'], ['adults', 'adults'], ['children', 'children'], ['infants', 'infants'], ['pets', 'pets']];

// Searches without dates price each listing for its own dates (overrides.checkin/checkout); the link uses them too.
export function listingUrl(id, { origin, searchParams }, overrides = null) {
  const ownDates = overrides?.checkin && overrides?.checkout;
  const url = new URL(`/rooms/${id}`, origin);
  for (const [from, to] of ROOM_PARAMS) {
    const value = ownDates && (from === 'checkin' || from === 'checkout') ? overrides[from] : searchParams.get(from);
    if (value) url.searchParams.set(to, value);
  }
  return url.toString();
}

// OrderedDisplayPriceLine (hotel-style listings) spreads its fields over orderedComponents.
function flattenPriceLine(line) {
  if (!Array.isArray(line?.orderedComponents)) return line;
  const flat = { ...line };
  for (const part of line.orderedComponents) {
    for (const [key, value] of Object.entries(part ?? {})) if (value != null && flat[key] == null) flat[key] = value;
  }
  return flat;
}

function normalizePrice(rawLine) {
  const line = flattenPriceLine(rawLine);
  const shown = parsePrice(line?.discountedPrice ?? line?.price);
  const original = parsePrice(line?.originalPrice);
  return {
    amount: shown?.amount ?? null,
    currency: shown?.currency ?? null,
    label: line?.accessibilityLabel ?? null,
    qualifier: line?.qualifier ?? null,
    original: original?.amount ?? null,
  };
}

// "5.0 (200)" / "5,0 (200)" -> { rating: 5, reviews: 200 }; "New" / "Новое" -> nulls.
function parseRating(text) {
  const s = typeof text === 'string' ? text.replace(/[\u200e\u200f\u061c]/g, '').trim() : '';
  const m = /^(\d[.,]\d{1,2})(?:\s*\(([\d\s.,]+)\))?/.exec(s);
  if (!m) return { rating: null, reviews: null };
  return { rating: Number(m[1].replace(',', '.')), reviews: m[2] ? Number(m[2].replace(/\D/g, '')) : null };
}

const finiteOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const list = v => (Array.isArray(v) ? v : []);

// The qualifier is localized ("total", "kopā", "Всего"), displayPriceStyle is not ("REGULATED_TOTAL").
function isTotalPrice(raw, price) {
  return /TOTAL/.test(raw.structuredDisplayPrice?.displayPriceStyle ?? '') || price.qualifier === 'total';
}

// StaySearchResult -> Listing (spec "Data model"); null when the id is missing. ctx = searchContext(searchUrl).
export function normalizeListing(raw, ctx) {
  const id = decodeListingId(raw?.demandStayListing?.id);
  if (!id) return null;
  const coordinate = raw.demandStayListing.location?.coordinate;
  const overrides = raw.listingParamOverrides;
  const nights = nightsBetween(overrides?.checkin, overrides?.checkout) ?? ctx.nights;
  const price = normalizePrice(raw.structuredDisplayPrice?.primaryLine);
  const perNight = price.amount != null && nights && isTotalPrice(raw, price)
    ? Math.round((price.amount / nights) * 100) / 100
    : null;
  return {
    id,
    url: listingUrl(id, ctx, overrides),
    title: raw.title ?? null,
    name: raw.nameLocalized?.localizedStringWithTranslationPreference ?? raw.subtitle ?? null,
    photos: list(raw.contextualPictures).map(p => p?.picture).filter(Boolean),
    price,
    pricePerNight: perNight,
    ...parseRating(raw.avgRatingLocalized),
    lat: finiteOrNull(coordinate?.latitude),
    lng: finiteOrNull(coordinate?.longitude),
    details: list(raw.structuredContent?.primaryLine).map(line => line?.body).filter(Boolean),
    badges: list(raw.badges).map(b => b?.text).filter(Boolean),
  };
}
