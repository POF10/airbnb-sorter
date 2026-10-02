// Project links shown in the UI.
export const HOMEPAGE_URL = 'https://github.com/POF10/airbnb-sorter';
export const ISSUES_URL = 'https://github.com/POF10/airbnb-sorter/issues';
export const PRIVACY_URL = 'https://github.com/POF10/airbnb-sorter/blob/main/PRIVACY.md';
// The extension's page in the Chrome Web Store and its reviews tab.
export const STORE_URL = 'https://chromewebstore.google.com/detail/price-sorter-for-airbnb/fpjgmgmmkdefjjdpplcdppkajpojdnkg';
export const REVIEWS_URL = `${STORE_URL}/reviews`;

// Donation pages; the first one is the primary link (the ♥ in the overlay header). With an empty list the
// overlay has no ♥ and the popup offers only the Rate link.
export const SUPPORT_LINKS = [
  { label: 'PayPal', url: 'https://paypal.me/Maksims1001' },
];

// example.com entries are placeholders for previewing the UI; the build warns while any is left.
export function hasPlaceholderSupportLinks(links = SUPPORT_LINKS) {
  return links.some(link => new URL(link.url).hostname === 'example.com');
}
