/* global chrome */
// Background service worker. Its only job: show the welcome page once, right after the first install.
import { handleInstalled } from './installed.js';

chrome.runtime.onInstalled.addListener(details => {
  handleInstalled(details, () => chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }));
});
