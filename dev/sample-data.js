// Deterministic fake collection for the viewer dev stand (no Airbnb involved).
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = ['Apartment in Riga', 'Condo in Centrs', 'Loft in Old Riga', 'Home in Āgenskalns', 'Guest suite in Teika'];

export function sampleCollection({ count = 1300, partial = false } = {}) {
  const random = mulberry32(42);
  const listings = Array.from({ length: count }, (_, i) => {
    const id = String(100000 + i);
    const total = Math.round(90 + random() ** 2 * 1400);
    const discounted = random() < 0.15;
    const noRating = random() < 0.1;
    const hasCoords = i % 50 !== 0;
    return {
      id,
      url: `https://www.airbnb.com/rooms/${id}?check_in=2026-10-16&check_out=2026-10-19&adults=2`,
      title: TYPES[i % TYPES.length],
      name: `Sample listing #${i + 1} with a fairly long descriptive name`,
      photos: Array.from({ length: 1 + ((i * 7) % 27) }, (_, k) => `https://picsum.photos/seed/${id}-${k}/600/570`),
      price: { amount: total, currency: '€', label: `€${total} total`, qualifier: 'total', original: discounted ? Math.round(total * 1.2) : null },
      pricePerNight: Math.round((total / 3) * 100) / 100,
      rating: noRating ? null : Math.round((4 + random()) * 100) / 100,
      reviews: noRating ? null : Math.floor(random() * 400),
      lat: hasCoords ? 56.95 + (random() - 0.5) * 0.12 : null,
      lng: hasCoords ? 24.11 + (random() - 0.5) * 0.25 : null,
      details: [`${1 + (i % 3)} bedroom`, `${1 + (i % 4)} beds`],
      badges: i % 7 === 0 ? ['Guest favorite'] : [],
    };
  });
  return {
    listings,
    meta: {
      searchUrl: 'https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2',
      origin: 'https://www.airbnb.com',
      nights: 3,
      placeLabel: 'Riga, Latvia',
      collectedAt: new Date().toISOString(),
      expectedTotal: 1320,
      saturatedRanges: partial ? 1 : 0,
      failedPages: 0,
      partial,
      stopReason: partial ? 'cancelled' : null,
    },
  };
}
