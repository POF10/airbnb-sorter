// Viewer dev stand: the overlay on synthetic data, no Airbnb involved. Run `npm run dev`.
import { createOverlay } from '../src/viewer/overlay.js';
import css from '../src/viewer/styles.css';
import { sampleCollection } from './sample-data.js';

(async () => {
  const leafletCss = await fetch('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css').then(r => r.text());
  let timer = null;
  const overlay = createOverlay({
    L: globalThis.L,
    css: `${leafletCss}\n${css}`,
    onRefresh: simulate,
    onCancel: () => {
      clearInterval(timer);
      overlay.showResults(sampleCollection({ count: 150, partial: true }));
    },
    onClose: () => clearInterval(timer),
  });

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
})();
