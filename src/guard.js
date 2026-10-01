// One instance per page. The userscript, the extension and the console build may all be present; their
// isolated worlds share the DOM, so the claim is an attribute on <html>.
const ATTRIBUTE = 'data-airbnb-sorter';

export function isPageClaimed(doc) {
  return doc.documentElement.hasAttribute(ATTRIBUTE);
}

// True for the first caller on a page, false for everyone after it.
export function claimPage(doc) {
  if (isPageClaimed(doc)) return false;
  doc.documentElement.setAttribute(ATTRIBUTE, '');
  return true;
}
