// Parses Airbnb display prices: "€1,234", "1 234 €", "$1,234.50", "₽ 12 345", "12,50 €".

function parseNumber(raw) {
  const s = raw.replace(/\s/g, '');
  // A last separator followed by exactly 1–2 digits is the decimal point; any other separator groups thousands.
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let intPart = s;
  let fraction = '';
  if (lastSep !== -1 && /^\d{1,2}$/.test(s.slice(lastSep + 1))) {
    intPart = s.slice(0, lastSep);
    fraction = s.slice(lastSep + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(intPart)) return null;
  return Number(fraction ? `${intPart}.${fraction}` : intPart);
}

// -> { amount, currency } or null when there is no number.
export function parsePrice(text) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/[\u00a0\u202f]/g, ' ').trim();
  const m = /\d[\d\s.,]*/.exec(s);
  if (!m) return null;
  const amount = parseNumber(m[0].trim());
  if (amount === null) return null;
  const currency = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim() || null;
  return { amount, currency };
}
