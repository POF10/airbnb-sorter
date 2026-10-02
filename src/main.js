import { collect, HttpError } from './collector.js';
import { parseSearchUrl, placeLabel } from './search-url.js';
import { loadCache, saveCache, cacheKey } from './cache.js';
import { loadSettings, saveSettings, resolveLocale, SETTINGS_KEY } from './settings.js';
import { loadViewed, markViewed, listingIdFromPath, VIEWED_KEY } from './viewed.js';
import { claimPage } from './guard.js';
import { SUPPORT_LINKS } from './config.js';
import { createLauncher } from './launcher.js';
import { createOverlay } from './viewer/overlay.js';
import { describeSearch } from './viewer/logic.js';
import { setLocale, getLocale, detectLocale } from './i18n.js';
import css from './viewer/styles.css';

async function fetchPage(url, signal) {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) throw new HttpError(response.status);
  return response.text();
}

// env: {
//   L: Leaflet, leafletCss: string,
//   storage: { get(key, fallback), set(key, value) } — sync or async,
//   watch?: (key, callback) — calls back when the key is changed elsewhere (the extension popup, another tab)
// }
// Resolves to false when another copy (userscript, extension, console build) already runs on the page.
export async function start({ L, leafletCss, storage, watch }) {
  if (!claimPage(document)) return false;

  let settings = await loadSettings(storage);
  let viewed = await loadViewed(storage);
  const applyLocale = () => setLocale(resolveLocale(
    settings.language,
    () => detectLocale({ pageLang: document.documentElement.lang, browserLang: navigator.language }),
  ));
  applyLocale();

  const saveSetting = patch => {
    settings = { ...settings, ...patch };
    void saveSettings(storage, patch);
  };
  const recordView = async id => {
    viewed = await markViewed(storage, id);
  };

  let overlay = null;
  let overlayLocale = null; // the language the overlay was built in
  let shownKey = null; // cache key of the search whose results the overlay is showing
  let controller = null;
  let running = false;

  function getOverlay() {
    // The overlay's controls get their texts when it is built, so after a language change it is rebuilt on its
    // next opening — never while it is open or collecting. (Left open across a change, it keeps the old controls
    // and shows newly rendered texts in the new language until then.)
    if (overlay && overlayLocale !== getLocale() && !running && !overlay.isOpen()) {
      overlay.destroy();
      overlay = null;
    }
    if (!overlay) {
      overlayLocale = getLocale();
      shownKey = null;
      overlay = createOverlay({
        L,
        css: `${leafletCss}\n${css}`,
        initialSort: settings.sort,
        initialFilters: { minRating: settings.minRating, minReviews: settings.minReviews, hideViewed: settings.hideViewed },
        viewedIds: Object.keys(viewed),
        showMapHint: !settings.mapHintSeen,
        supportUrl: SUPPORT_LINKS[0]?.url,
        onSortChange: sort => saveSetting({ sort }),
        onFiltersChange: filters => saveSetting(filters),
        onListingOpen: id => { void recordView(id); },
        onMapHintDismiss: () => saveSetting({ mapHintSeen: true }),
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

    const key = cacheKey(searchUrl);
    const title = describeSearch({ placeLabel: placeLabel(searchUrl), searchUrl });
    // Shown before the cache read: with an async storage the overlay would otherwise sit there empty, or with
    // the previous search, until the read ends. Results of this very search stay on screen instead: reopening
    // them must not flash a spinner.
    if (force || shownKey !== key) {
      shownKey = null;
      view.showProgress(null, title);
    }
    const [cached, stored] = await Promise.all([force ? null : loadCache(storage, searchUrl), loadViewed(storage)]);
    if (current !== controller) return; // another click took over while the storage was being read
    if (current.signal.aborted) {
      // Closed or cancelled during the read: nothing has been collected, so there is nothing to show.
      view.close();
      return;
    }
    // Listings opened in other tabs since the overlay was last shown.
    viewed = stored;
    view.setViewed(Object.keys(viewed));
    if (cached) {
      try {
        view.showResults(cached, { fromCache: true });
        shownKey = key;
        return;
      } catch (e) {
        console.warn('[airbnb-sorter] cached result failed to render, collecting afresh', e);
      }
    }

    running = true;
    shownKey = null;
    // Again: the cache may have missed for results left on screen, or failed half-way through rendering.
    view.showProgress(null, title);
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
    shownKey = key;
  }

  const launcher = createLauncher(() => run(false), {
    // A listing page opened on Airbnb itself counts as viewed too.
    onUrlChange: pathname => {
      const id = listingIdFromPath(pathname);
      if (id) void recordView(id);
    },
  });

  watch?.(SETTINGS_KEY, async () => {
    settings = await loadSettings(storage);
    const previous = getLocale();
    applyLocale();
    if (getLocale() !== previous) launcher.refreshLabel();
  });
  watch?.(VIEWED_KEY, async () => {
    viewed = await loadViewed(storage);
    overlay?.setViewed(Object.keys(viewed));
  });
  return true;
}
