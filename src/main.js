import { collect, HttpError } from './collector.js';
import { parseSearchUrl, placeLabel } from './search-url.js';
import { loadCache, saveCache } from './cache.js';
import { loadSettings, saveSettings, resolveLocale } from './settings.js';
import { claimPage } from './guard.js';
import { SUPPORT_LINKS } from './config.js';
import { createLauncher } from './launcher.js';
import { createOverlay } from './viewer/overlay.js';
import { describeSearch } from './viewer/logic.js';
import { setLocale, detectLocale } from './i18n.js';
import css from './viewer/styles.css';

async function fetchPage(url, signal) {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) throw new HttpError(response.status);
  return response.text();
}

// env: {
//   L: Leaflet, leafletCss: string,
//   storage: { get(key, fallback), set(key, value) } — sync or async,
//   onSettingsChange?: register a callback for settings changed elsewhere (the extension popup, another tab)
// }
// Resolves to false when another copy (userscript, extension, console build) already runs on the page.
export async function start({ L, leafletCss, storage, onSettingsChange }) {
  if (!claimPage(document)) return false;

  let settings = await loadSettings(storage);
  const applyLocale = () => setLocale(resolveLocale(
    settings.language,
    () => detectLocale({ pageLang: document.documentElement.lang, browserLang: navigator.language }),
  ));
  applyLocale();

  let overlay = null;
  let overlayStale = false; // built in a language that is no longer current
  let controller = null;
  let running = false;

  function getOverlay() {
    // Texts are set when the overlay is built, so a language change rebuilds it — but never under the user's hands.
    if (overlay && overlayStale && !running && !overlay.isOpen()) {
      overlay.destroy();
      overlay = null;
    }
    if (!overlay) {
      overlayStale = false;
      overlay = createOverlay({
        L,
        css: `${leafletCss}\n${css}`,
        initialSort: settings.sort,
        supportUrl: SUPPORT_LINKS[0]?.url,
        onSortChange: sort => {
          settings = { ...settings, sort };
          void saveSettings(storage, { sort });
        },
        onRefresh: () => run(true),
        onCancel: () => controller?.abort(),
        onClose: () => controller?.abort(),
      });
    }
    return overlay;
  }

  async function run(force) {
    const view = getOverlay();
    view.open();
    // Clicking the launcher again while collecting only brings the overlay back; it never restarts the run.
    if (running && !force) return;
    const href = location.href;
    const { searchUrl } = parseSearchUrl(href);
    // Replaced before the cache check, so a run still winding down cannot overwrite what is shown next.
    controller?.abort();
    const current = (controller = new AbortController());

    const cached = force ? null : await loadCache(storage, searchUrl);
    if (current !== controller) return; // another click took over while the cache was being read
    if (cached) {
      try {
        view.showResults(cached, { fromCache: true });
        return;
      } catch (e) {
        console.warn('[airbnb-sorter] cached result failed to render, collecting afresh', e);
      }
    }

    running = true;
    view.showProgress(null, describeSearch({ placeLabel: placeLabel(searchUrl), searchUrl }));
    let result;
    try {
      result = await collect(href, {
        fetchPage,
        signal: current.signal,
        onProgress: p => { if (current === controller) view.showProgress(p); },
      });
    } catch (e) {
      if (current !== controller) return;
      console.error('[airbnb-sorter]', e);
      view.showError(e.message);
      return;
    } finally {
      if (current === controller) running = false;
    }
    if (current !== controller) return;
    // A cancelled run is shown but not cached, so the next click collects afresh.
    if (result.meta.stopReason !== 'cancelled') void saveCache(storage, searchUrl, result);
    view.showResults(result);
  }

  const launcher = createLauncher(() => run(false));

  onSettingsChange?.(async () => {
    const previous = settings.language;
    settings = await loadSettings(storage);
    if (settings.language === previous) return;
    applyLocale();
    launcher.refreshLabel();
    overlayStale = true;
  });
  return true;
}
