// Popup dev stand: the extension popup without chrome.* APIs. http://localhost:8000/popup.html
// Settings go to localStorage; ?lang=ru pretends the browser is Russian; ?viewed=37 pretends 37 listings were opened.
import { renderPopup } from '../src/extension/popup-view.js';
import css from '../src/extension/popup.css';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const params = new URLSearchParams(location.search);
const PREFIX = 'airbnb-sorter:';
const storage = {
  get(key, fallback) {
    const value = localStorage.getItem(PREFIX + key);
    return value == null ? fallback : JSON.parse(value);
  },
  set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
};
if (params.has('viewed')) {
  storage.set('viewed', Object.fromEntries(Array.from({ length: Number(params.get('viewed')) }, (_, i) => [String(1000 + i), Date.now()])));
}

renderPopup(document.getElementById('app'), {
  storage,
  version: '0.0.0-dev',
  browserLang: params.get('lang') ?? navigator.language,
  welcomeUrl: 'welcome.html',
});
