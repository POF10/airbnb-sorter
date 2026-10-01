/* global chrome */
// Popup entry: the toolbar icon's popup and the "Extension options" dialog share this page.
import { renderPopup } from './popup-view.js';
import { chromeStorage } from './storage.js';

renderPopup(document.getElementById('app'), {
  storage: chromeStorage(chrome.storage.local),
  version: chrome.runtime.getManifest().version,
  browserLang: chrome.i18n.getUILanguage(),
});
