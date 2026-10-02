// Pure viewer logic: sorting, map-area filtering and all user-visible texts (via i18n).
import { t } from '../i18n.js';

// `then` breaks ties (descending): among equal 5.0 ratings, more reviews first. Labels follow the current language.
export const SORTS = {
  'price-desc': { get label() { return t().sort['price-desc']; }, key: l => l.price.amount, dir: -1 },
  'price-asc': { get label() { return t().sort['price-asc']; }, key: l => l.price.amount, dir: 1 },
  'rating-desc': { get label() { return t().sort['rating-desc']; }, key: l => l.rating, dir: -1, then: l => l.reviews },
  'reviews-desc': { get label() { return t().sort['reviews-desc']; }, key: l => l.reviews, dir: -1, then: l => l.rating },
};
export const DEFAULT_SORT = 'price-desc';

// Thresholds offered by the rating and review filters; 0 means "any".
export const RATING_STEPS = [0, 4.5, 4.7, 4.8, 4.9];
export const REVIEW_STEPS = [0, 5, 20, 50, 100];
export const NO_FILTERS = Object.freeze({ minRating: 0, minReviews: 0, hideViewed: false });

// Anything that is not an offered threshold or a real boolean reads as "no filter".
export function sanitizeFilters(raw) {
  return {
    minRating: RATING_STEPS.includes(raw?.minRating) ? raw.minRating : 0,
    minReviews: REVIEW_STEPS.includes(raw?.minReviews) ? raw.minReviews : 0,
    hideViewed: raw?.hideViewed === true,
  };
}

export function hasActiveFilters({ minRating, minReviews, hideViewed }) {
  return minRating > 0 || minReviews > 0 || hideViewed === true;
}

// A listing without a rating ("New") fails any rating threshold; one without a review count fails any review threshold.
export function passesFilters(listing, { minRating, minReviews, hideViewed }, isViewed = () => false) {
  if (minRating > 0 && !(listing.rating != null && listing.rating >= minRating)) return false;
  if (minReviews > 0 && !(listing.reviews != null && listing.reviews >= minReviews)) return false;
  return !(hideViewed && isViewed(listing.id));
}

export function filterListings(listings, filters, isViewed) {
  return listings.filter(listing => passesFilters(listing, filters, isViewed));
}

// How many listings each step of one filter would leave while the other filters stay as they are.
export function thresholdCounts(listings, filters, key, steps, isViewed) {
  return steps.map(step => filterListings(listings, { ...filters, [key]: step }, isViewed).length);
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Sorted copy; listings without a key go last in either direction; ties go by `then`, then by id.
export function sortListings(listings, sortId) {
  const { key, dir, then } = Object.hasOwn(SORTS, sortId) ? SORTS[sortId] : SORTS[DEFAULT_SORT];
  const tie = then ? (a, b) => (then(b) ?? -1) - (then(a) ?? -1) : () => 0;
  return [...listings].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null || kb == null) {
      if (ka == null && kb == null) return byId(a, b);
      return ka == null ? 1 : -1;
    }
    return (ka - kb) * dir || tie(a, b) || byId(a, b);
  });
}

// bounds: { south, west, north, east }
export function filterByBounds(listings, { south, west, north, east }) {
  return listings.filter(l => l.lat != null && l.lng != null && l.lat >= south && l.lat <= north && l.lng >= west && l.lng <= east);
}

const formatters = new Map();
function formatter(kind) {
  const key = `${kind}:${t().numberLocale}`;
  if (!formatters.has(key)) {
    formatters.set(key, kind === 'number'
      ? new Intl.NumberFormat(t().numberLocale, { maximumFractionDigits: 0 })
      : new Intl.DateTimeFormat(t().dateLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' }));
  }
  return formatters.get(key);
}
const count = n => formatter('number').format(n);
export const formatCount = count;

// Symbols stick to the number ("€1 234"), letter codes get a no-break space ("CHF 1 234").
export function formatMoney(amount, currency) {
  if (amount == null) return '—';
  const gap = /\p{L}$/u.test(currency ?? '') ? '\u00a0' : '';
  return `${currency ?? ''}${gap}${count(amount)}`;
}

export function formatRating({ rating, reviews }) {
  if (rating == null) return t().newRating;
  const value = Number.isInteger(rating) ? rating.toFixed(1) : String(rating);
  return reviews != null ? `★ ${value} (${reviews})` : `★ ${value}`;
}

// Airbnb image URLs accept ?im_w=<width>; without it the original (huge) file is served.
export function photoUrl(url, width = 720) {
  if (!url) return '';
  try {
    const result = new URL(url);
    if (!result.searchParams.has('im_w')) result.searchParams.set('im_w', String(width));
    return result.toString();
  } catch {
    return url;
  }
}

const MAP_BOUNDS = ['ne_lat', 'ne_lng', 'sw_lat', 'sw_lng'];

// "Riga, Latvia · 16 Oct – 19 Oct · 2 guests", plus "· map area" for a search by map bounds
export function describeSearch({ placeLabel, searchUrl }) {
  const params = new URL(searchUrl).searchParams;
  const parts = [placeLabel];
  const from = new Date(params.get('checkin') ?? '');
  const to = new Date(params.get('checkout') ?? '');
  if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
    parts.push(`${formatter('date').format(from)} – ${formatter('date').format(to)}`);
  }
  const guests = Number(params.get('adults') || 0) + Number(params.get('children') || 0);
  if (guests) parts.push(t().guests(guests));
  // The search was limited to a map rectangle on Airbnb, so this is not the whole place.
  if (MAP_BOUNDS.every(key => params.has(key))) parts.push(t().mapArea);
  return parts.filter(Boolean).join(' · ');
}

export function formatAge(iso, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t().justNow;
  if (minutes < 60) return t().minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t().hoursAgo(hours);
  return t().daysAgo(Math.floor(hours / 24));
}

// "Collected 1,240 of ~1,263 · showing 84 · 12 min ago"
export function summaryText(meta, total, shown = null, { fromCache = false, now = Date.now() } = {}) {
  let text = t().collected(count(total));
  if (meta.expectedTotal) text += t().ofExpected(count(meta.expectedTotal));
  if (shown != null) text += t().showing(count(shown));
  if (fromCache) text += ` · ${formatAge(meta.collectedAt, now)}`;
  return text;
}

export function partialReasons(meta) {
  const reasons = [];
  if (meta.stopReason === 'cancelled') reasons.push(t().cancelled);
  if (meta.stopReason === 'blocked') reasons.push(t().blocked);
  if (meta.stopReason === 'limit') reasons.push(t().limit);
  if (meta.failedPages) reasons.push(t().failedPages(meta.failedPages));
  if (meta.saturatedRanges) reasons.push(t().saturated(meta.saturatedRanges));
  return reasons;
}

export function progressText(p) {
  if (!p) return t().loadingFirst;
  const of = p.expectedTotal ? t().ofExpected(count(p.expectedTotal)) : '';
  return t().progress({ ...p, listings: count(p.listings) }, of);
}
