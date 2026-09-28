import { parsePrice } from './price.js';

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

export function listingUrl(id, { origin, searchParams }) {
  const url = new URL(`/rooms/${id}`, origin);
  for (const [from, to] of ROOM_PARAMS) {
    const value = searchParams.get(from);
    if (value) url.searchParams.set(to, value);
  }
  return url.toString();
}

function normalizePrice(line) {
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

// "5.0 (200)" -> { rating: 5, reviews: 200 }; "New" -> nulls.
function parseRating(text) {
  const m = typeof text === 'string' ? /^(\d+(?:[.,]\d+)?)(?:\s*\(([\d\s.,]+)\))?/.exec(text.trim()) : null;
  if (!m) return { rating: null, reviews: null };
  return { rating: Number(m[1].replace(',', '.')), reviews: m[2] ? Number(m[2].replace(/\D/g, '')) : null };
}

const finiteOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// StaySearchResult -> Listing (spec "Модель данных"); null when the id is missing. ctx = searchContext(searchUrl).
export function normalizeListing(raw, ctx) {
  const id = decodeListingId(raw?.demandStayListing?.id);
  if (!id) return null;
  const coordinate = raw.demandStayListing.location?.coordinate;
  const price = normalizePrice(raw.structuredDisplayPrice?.primaryLine);
  const perNight = price.amount != null && price.qualifier === 'total' && ctx.nights
    ? Math.round((price.amount / ctx.nights) * 100) / 100
    : null;
  return {
    id,
    url: listingUrl(id, ctx),
    title: raw.title ?? null,
    name: raw.nameLocalized?.localizedStringWithTranslationPreference ?? raw.subtitle ?? null,
    photos: (raw.contextualPictures ?? []).map(p => p?.picture).filter(Boolean),
    price,
    pricePerNight: perNight,
    ...parseRating(raw.avgRatingLocalized),
    lat: finiteOrNull(coordinate?.latitude),
    lng: finiteOrNull(coordinate?.longitude),
    details: (raw.structuredContent?.primaryLine ?? []).map(line => line?.body).filter(Boolean),
    badges: (raw.badges ?? []).map(b => b?.text).filter(Boolean),
  };
}
