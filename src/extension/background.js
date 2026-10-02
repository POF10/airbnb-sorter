/* global chrome */
// Background service worker. Its only job: show the welcome page once, right after the first install.
import { handleInstalled } from './installed.js';

chrome.runtime.onInstalled.addListener(details => {
  handleInstalled(details, () => {
    // The page is a courtesy (the popup links to it too): if the tab cannot be opened, there is nothing to report.
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(() => {});
  });
});
