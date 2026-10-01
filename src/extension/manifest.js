// The extension manifest (Manifest V3), built from the package version and the domain list.
import { DOMAINS } from './domains.js';

// "https://*.airbnb.co.uk/*" covers www. and the language subdomains (ru.airbnb.com, fr.airbnb.ch, …).
export const matchPattern = domain => `https://*.${domain}/*`;

export function buildManifest({ version }) {
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version,
    // chrome.storage.local holds 10 MB since Chrome 114; the cache takes up to ~3 MB.
    minimum_chrome_version: '114',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    permissions: ['storage'],
    // Every page of the site, not just /s/…: Airbnb is a SPA and reaches the search without a page load.
    content_scripts: [{ matches: DOMAINS.map(matchPattern), js: ['content.js'], run_at: 'document_idle' }],
    action: { default_title: '__MSG_extName__', default_popup: 'popup.html' },
    options_ui: { page: 'popup.html', open_in_tab: false },
  };
}
