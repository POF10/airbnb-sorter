/* global GM_getValue, GM_setValue, GM_getResourceText */
// Tampermonkey entry: Leaflet comes from @require, its CSS from @resource leafletCss.
// Leaflet assigns `window.L`; in the Tampermonkey sandbox that is the sandbox window, not necessarily globalThis.
import { start } from './main.js';

start({
  L: window.L,
  leafletCss: GM_getResourceText('leafletCss'),
  storage: { get: GM_getValue, set: GM_setValue },
});
