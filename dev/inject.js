// Runs the userscript without Tampermonkey: evaluate dist/airbnb-sorter.inject.js in an Airbnb tab
// (DevTools console or an agent's browser JS tool). Storage goes to localStorage.
import { start } from '../src/main.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
const PREFIX = 'airbnb-sorter:';

(async () => {
  const [js, leafletCss] = await Promise.all(['leaflet.js', 'leaflet.css'].map(f => fetch(LEAFLET + f).then(r => r.text())));
  if (!globalThis.L) {
    // Hide AMD loaders so Leaflet's UMD wrapper defines window.L.
    const define = globalThis.define;
    globalThis.define = undefined;
    try { (0, eval)(js); } finally { globalThis.define = define; }
  }
  start({
    L: globalThis.L,
    leafletCss,
    storage: {
      get(key, fallback) {
        const value = localStorage.getItem(PREFIX + key);
        return value == null ? fallback : JSON.parse(value);
      },
      set(key, value) {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      },
    },
  });
  console.log('[airbnb-sorter] injected');
})();
