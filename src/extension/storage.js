// chrome.storage behind the app's storage contract. The chrome objects are passed in, so this is testable.

// area: chrome.storage.local
export function chromeStorage(area) {
  return {
    async get(key, fallback) {
      const found = await area.get(key);
      return Object.hasOwn(found, key) ? found[key] : fallback;
    },
    set: (key, value) => area.set({ [key]: value }),
  };
}

// events: chrome.storage.onChanged. Calls back when `key` changes in the local area — from the popup or another tab.
export function onLocalChange(events, key, callback) {
  events.addListener((changes, areaName) => {
    if (areaName === 'local' && Object.hasOwn(changes, key)) callback();
  });
}
