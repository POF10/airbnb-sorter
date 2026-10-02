/* global chrome */
// Chrome extension entry (content script, isolated world). Leaflet is bundled: the Web Store forbids remote code.
import * as L from 'leaflet/dist/leaflet-src.esm.js';
import leafletCss from 'leaflet/dist/leaflet.css';
import { start } from '../main.js';
import { chromeStorage, onLocalChange } from './storage.js';

start({
  L,
  leafletCss,
  storage: chromeStorage(chrome.storage.local),
  watch: (key, callback) => onLocalChange(chrome.storage.onChanged, key, callback),
});
