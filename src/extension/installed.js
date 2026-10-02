// What the extension does when Chrome reports chrome.runtime.onInstalled: the welcome page opens after the
// first install only — not on an update of the extension or of the browser.
export function handleInstalled({ reason } = {}, openWelcome) {
  if (reason === 'install') openWelcome();
}
