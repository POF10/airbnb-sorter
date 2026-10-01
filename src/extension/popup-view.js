// The extension popup: how-to line, language choice, support links. Rendered into `root`; storage and the
// browser facts come from outside, so the dev stand can show it without chrome.* APIs.
import { el } from '../viewer/dom.js';
import { t, setLocale, getLocale, detectLocale } from '../i18n.js';
import { loadSettings, saveSettings, resolveLocale, LANGUAGES } from '../settings.js';
import { SUPPORT_LINKS, HOMEPAGE_URL, ISSUES_URL } from '../config.js';

function link(text, href, className) {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

// storage: { get, set }; version: shown next to the title; browserLang: the browser UI language ("ru", "en-GB", …).
export async function renderPopup(root, { storage, version, browserLang }) {
  let settings = await loadSettings(storage);

  function draw({ focusLanguage = false } = {}) {
    // 'auto' follows the browser here: the popup is not an Airbnb page.
    setLocale(resolveLocale(settings.language, () => detectLocale({ browserLang })));
    document.documentElement.lang = getLocale();
    const texts = t().popup;

    const head = el('header', 'pop-head');
    head.append(el('h1', 'pop-title', texts.title), el('span', 'pop-version', `v${version}`));

    const select = el('select', 'pop-select');
    select.id = 'pop-language';
    for (const id of LANGUAGES) {
      const option = el('option', null, texts.languages[id]);
      option.value = id;
      select.append(option);
    }
    select.value = settings.language;
    select.addEventListener('change', async () => {
      settings = await saveSettings(storage, { language: select.value });
      draw({ focusLanguage: true });
    });
    const label = el('label', 'pop-label', texts.language);
    label.htmlFor = select.id;
    const row = el('div', 'pop-row');
    row.append(label, select);

    const parts = [head, el('p', 'pop-howto', texts.howTo), row];

    if (SUPPORT_LINKS.length) {
      const support = el('section', 'pop-support');
      const links = el('div', 'pop-support-links');
      for (const { label: name, url } of SUPPORT_LINKS) links.append(link(name, url, 'pop-btn'));
      support.append(el('h2', 'pop-support-title', `♥ ${t().support}`), links);
      parts.push(support);
    }

    const foot = el('footer', 'pop-foot');
    foot.append(link(texts.github, HOMEPAGE_URL), ' · ', link(texts.report, ISSUES_URL));
    parts.push(foot);

    root.replaceChildren(...parts);
    if (focusLanguage) select.focus();
  }

  draw();
}
