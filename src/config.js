// Project links shown in the UI.
export const HOMEPAGE_URL = 'https://github.com/POF10/airbnb-sorter';
export const ISSUES_URL = 'https://github.com/POF10/airbnb-sorter/issues';

// Donation pages; the first one is the primary link (the ♥ in the overlay header). An empty list hides
// every support control. The example.com entries are placeholders to preview the UI: replace them with
// real pages before publishing (the build warns while any is left).
export const SUPPORT_LINKS = [
  { label: 'Ko-fi', url: 'https://example.com/support/ko-fi' },
  { label: 'Buy Me a Coffee', url: 'https://example.com/support/buy-me-a-coffee' },
  { label: 'PayPal', url: 'https://example.com/support/paypal' },
];

export function hasPlaceholderSupportLinks(links = SUPPORT_LINKS) {
  return links.some(link => new URL(link.url).hostname === 'example.com');
}
