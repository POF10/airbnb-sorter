// The page shown once after the install: three steps, a link to Airbnb, a tip about pinning the icon.
// Rendered into `root`; storage and the browser facts come from outside, like in the popup.
import { el } from '../viewer/dom.js';
import { t, setLocale, getLocale, detectLocale } from '../i18n.js';
import { loadSettings, resolveLocale, SETTINGS_KEY } from '../settings.js';
import { HOMEPAGE_URL, ISSUES_URL, PRIVACY_URL } from '../config.js';

function link(text, href, className) {
  const a = el('a', className, text);
  a.href = href;
  return a;
}

// Reference links open next to the page instead of replacing it.
function outLink(text, href) {
  const a = link(text, href);
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

// The step that shows the button itself, drawn like the real one.
const BUTTON_STEP = 1;

// storage: { get, set }; browserLang: the browser UI language; iconUrl: the extension icon;
// watch: optional (key, callback) — re-renders when the language is changed in the popup.
export async function renderWelcome(root, { storage, browserLang, iconUrl, watch }) {
  async function draw() {
    const settings = await loadSettings(storage);
    setLocale(resolveLocale(settings.language, () => detectLocale({ browserLang })));
    document.documentElement.lang = getLocale();
    const texts = t().welcome;
    document.title = t().popup.title;

    const icon = el('img', 'wel-icon');
    icon.src = iconUrl;
    icon.alt = '';
    const head = el('header', 'wel-head');
    head.append(icon, el('h1', 'wel-title', t().popup.title));

    const steps = el('ol', 'wel-steps');
    texts.steps.forEach((text, i) => {
      const step = el('li', 'wel-step', text);
      if (i === BUTTON_STEP) step.append(' ', el('span', 'wel-launcher', t().launcher));
      steps.append(step);
    });

    const open = link(texts.open, 'https://www.airbnb.com/', 'wel-open');

    const foot = el('footer', 'wel-foot');
    foot.append(outLink(t().popup.github, HOMEPAGE_URL), ' · ', outLink(t().popup.report, ISSUES_URL), ' · ', outLink(texts.privacy, PRIVACY_URL));

    root.replaceChildren(head, steps, open, el('p', 'wel-note', texts.pin), el('p', 'wel-note', texts.free), foot);
  }

  await draw();
  watch?.(SETTINGS_KEY, draw);
}
