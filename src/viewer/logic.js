// Pure viewer logic: sorting, map-area filtering and all user-visible texts.

export const SORTS = {
  'price-desc': { label: 'Цена ↓', key: l => l.price.amount, dir: -1 },
  'price-asc': { label: 'Цена ↑', key: l => l.price.amount, dir: 1 },
  'rating-desc': { label: 'Рейтинг ↓', key: l => l.rating, dir: -1 },
  'reviews-desc': { label: 'Отзывов ↓', key: l => l.reviews, dir: -1 },
};
export const DEFAULT_SORT = 'price-desc';

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Sorted copy; listings without a key go last in either direction; ties are ordered by id.
export function sortListings(listings, sortId) {
  const { key, dir } = SORTS[sortId] ?? SORTS[DEFAULT_SORT];
  return [...listings].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null || kb == null) {
      if (ka == null && kb == null) return byId(a, b);
      return ka == null ? 1 : -1;
    }
    return (ka - kb) * dir || byId(a, b);
  });
}

// bounds: { south, west, north, east }
export function filterByBounds(listings, { south, west, north, east }) {
  return listings.filter(l => l.lat != null && l.lng != null && l.lat >= south && l.lat <= north && l.lng >= west && l.lng <= east);
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const count = n => numberFormat.format(n);

export function formatMoney(amount, currency) {
  if (amount == null) return '—';
  return `${currency ?? ''}${numberFormat.format(amount)}`;
}

export function formatRating({ rating, reviews }) {
  if (rating == null) return '★ New';
  const value = Number.isInteger(rating) ? rating.toFixed(1) : String(rating);
  return reviews != null ? `★ ${value} (${reviews})` : `★ ${value}`;
}

// Airbnb image URLs accept ?im_w=<width>; without it the original (huge) file is served.
export function photoUrl(url, width = 720) {
  if (!url) return '';
  const result = new URL(url);
  if (!result.searchParams.has('im_w')) result.searchParams.set('im_w', String(width));
  return result.toString();
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// "Riga, Latvia · 16 окт. – 19 окт. · 2 гостя"
export function describeSearch({ placeLabel, searchUrl }) {
  const params = new URL(searchUrl).searchParams;
  const parts = [placeLabel];
  const checkin = params.get('checkin');
  const checkout = params.get('checkout');
  if (checkin && checkout) parts.push(`${dayMonth.format(new Date(checkin))} – ${dayMonth.format(new Date(checkout))}`);
  const guests = Number(params.get('adults') || 0) + Number(params.get('children') || 0);
  if (guests) parts.push(`${guests} ${plural(guests, 'гость', 'гостя', 'гостей')}`);
  return parts.filter(Boolean).join(' · ');
}

export function formatAge(iso, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн назад`;
}

// "Собрано 1 240 из ~1 263 · показано 84 · 12 мин назад"
export function summaryText(meta, total, shown = null, { fromCache = false, now = Date.now() } = {}) {
  let text = `Собрано ${count(total)}`;
  if (meta.expectedTotal) text += ` из ~${count(meta.expectedTotal)}`;
  if (shown != null) text += ` · показано ${count(shown)}`;
  if (fromCache) text += ` · ${formatAge(meta.collectedAt, now)}`;
  return text;
}

export function partialReasons(meta) {
  const reasons = [];
  if (meta.stopReason === 'cancelled') reasons.push('сбор отменён');
  if (meta.stopReason === 'blocked') reasons.push('Airbnb начал блокировать запросы');
  if (meta.failedPages) reasons.push(`не загрузилось страниц: ${meta.failedPages}`);
  if (meta.saturatedRanges) reasons.push(`переполненных ценовых диапазонов: ${meta.saturatedRanges} (часть объявлений недоступна)`);
  return reasons;
}

export function progressText(p) {
  if (!p) return 'Загружаю первую страницу…';
  const of = p.expectedTotal ? ` из ~${count(p.expectedTotal)}` : '';
  return `Диапазонов: ${p.ranges} · Страниц: ${p.pagesDone} / ~${p.pagesPlanned} · Объявлений: ${count(p.listings)}${of}`;
}
