/* global chrome */
// Welcome page entry: opened by the background worker after the install and from the popup's "How it works".
import { renderWelcome } from './welcome-view.js';
import { chromeStorage } from './storage.js';

renderWelcome(document.getElementById('app'), {
  storage: chromeStorage(chrome.storage.local),
  browserLang: chrome.i18n.getUILanguage(),
  iconUrl: 'icons/128.png',
});
