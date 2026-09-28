// Runs the userscript without Tampermonkey: evaluate dist/airbnb-sorter.inject.js in an Airbnb tab
// (DevTools console or an agent's browser JS tool). Storage goes to localStorage.
import { start } from '../src/main.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
// Same SRI hashes as the userscript header (src/header.txt): the code is evaluated with the user's session.
const HASHES = {
  'leaflet.js': 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  'leaflet.css': 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
const PREFIX = 'airbnb-sorter:';

async function fetchVerified(file) {
  const response = await fetch(LEAFLET + file);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (`sha256-${btoa(String.fromCharCode(...digest))}` !== HASHES[file]) throw new Error(`${file}: хэш не совпадает`);
  return new TextDecoder().decode(bytes);
}

(async () => {
  if (window.__airbnbSorter) return console.log('[airbnb-sorter] already injected');
  window.__airbnbSorter = true;
  const [js, leafletCss] = await Promise.all(['leaflet.js', 'leaflet.css'].map(fetchVerified));
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
