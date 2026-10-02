// Welcome page dev stand: the page shown after the install, without chrome.* APIs. http://localhost:8000/welcome.html
// The language follows the popup stand's setting in localStorage, or ?lang=ru.
import { renderWelcome } from '../src/extension/welcome-view.js';
import css from '../src/extension/welcome.css';
import iconUrl from '../src/extension/icons/128.png';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const PREFIX = 'airbnb-sorter:';
renderWelcome(document.getElementById('app'), {
  storage: {
    get(key, fallback) {
      const value = localStorage.getItem(PREFIX + key);
      return value == null ? fallback : JSON.parse(value);
    },
    set(key, value) {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    },
  },
  browserLang: new URLSearchParams(location.search).get('lang') ?? navigator.language,
  iconUrl,
});
