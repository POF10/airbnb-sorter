// Viewer dev stand: the overlay on synthetic data, no Airbnb involved. Run `npm run dev`.
// Leaflet is bundled from npm exactly as in the extension, so the stand also checks that build of it.
// URL parameters: lang=ru, sort=price-asc, rating=4.8, reviews=20, hide (hide viewed), hint=0 (no map note).
import * as L from 'leaflet/dist/leaflet-src.esm.js';
import leafletCss from 'leaflet/dist/leaflet.css';
import { createOverlay } from '../src/viewer/overlay.js';
import css from '../src/viewer/styles.css';
import { setLocale, detectLocale } from '../src/i18n.js';
import { SUPPORT_LINKS } from '../src/config.js';
import { sampleCollection } from './sample-data.js';

const params = new URLSearchParams(location.search);
setLocale(detectLocale({ pageLang: params.get('lang') ?? '', browserLang: navigator.language }));
// Every third listing by price counts as already viewed, so the marks are visible at once.
const byPrice = [...sampleCollection().listings].sort((a, b) => b.price.amount - a.price.amount);
const viewedIds = byPrice.filter((_, rank) => rank % 3 === 1).map(listing => listing.id);
let timer = null;
const overlay = createOverlay({
  L,
  css: `${leafletCss}\n${css}`,
  initialSort: params.get('sort') ?? undefined,
  initialFilters: {
    minRating: Number(params.get('rating') ?? 0),
    minReviews: Number(params.get('reviews') ?? 0),
    hideViewed: params.has('hide'),
  },
  viewedIds,
  showMapHint: params.get('hint') !== '0',
  supportUrl: SUPPORT_LINKS[0]?.url,
  onSortChange: sort => console.log('[dev] sort changed:', sort),
  onFiltersChange: filters => console.log('[dev] filters changed:', JSON.stringify(filters)),
  onListingOpen: id => console.log('[dev] listing opened:', id),
  onMapHintDismiss: () => console.log('[dev] map hint dismissed'),
  onRefresh: simulate,
  onCancel: () => {
    clearInterval(timer);
    overlay.showResults(sampleCollection({ count: 150, partial: true }));
  },
  onClose: () => clearInterval(timer),
});
window.devOverlay = overlay; // for poking from the console: devOverlay.isOpen(), devOverlay.setViewed([...])

// Fakes a collection run: a few progress updates, then the results.
function simulate() {
  clearInterval(timer);
  overlay.showProgress(null);
  let pages = 0;
  timer = setInterval(() => {
    pages += 12;
    overlay.showProgress({ ranges: Math.ceil(pages / 8), pagesDone: pages, pagesPlanned: 74, listings: Math.min(1300, pages * 18), expectedTotal: 1320 });
    if (pages >= 74) {
      clearInterval(timer);
      overlay.showResults(sampleCollection());
    }
  }, 250);
}

document.getElementById('open').addEventListener('click', () => {
  overlay.open();
  simulate();
});
overlay.open();
simulate();
