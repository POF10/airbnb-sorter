// Popup dev stand: the extension popup without chrome.* APIs. http://localhost:8000/popup.html
// Settings go to localStorage; ?lang=ru pretends the browser is Russian.
import { renderPopup } from '../src/extension/popup-view.js';
import css from '../src/extension/popup.css';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const PREFIX = 'airbnb-sorter:';
renderPopup(document.getElementById('app'), {
  storage: {
    get(key, fallback) {
      const value = localStorage.getItem(PREFIX + key);
      return value == null ? fallback : JSON.parse(value);
    },
    set(key, value) {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    },
  },
  version: '0.0.0-dev',
  browserLang: new URLSearchParams(location.search).get('lang') ?? navigator.language,
});
