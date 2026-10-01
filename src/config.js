// Project links shown in the UI.
export const HOMEPAGE_URL = 'https://github.com/POF10/airbnb-sorter';
export const ISSUES_URL = 'https://github.com/POF10/airbnb-sorter/issues';

// Donation pages; the first one is the primary link (the ♥ in the overlay header). An empty list hides
// every support control.
export const SUPPORT_LINKS = [
  { label: 'PayPal', url: 'https://paypal.me/Maksims1001' },
];

// example.com entries are placeholders for previewing the UI; the build warns while any is left.
export function hasPlaceholderSupportLinks(links = SUPPORT_LINKS) {
  return links.some(link => new URL(link.url).hostname === 'example.com');
}
