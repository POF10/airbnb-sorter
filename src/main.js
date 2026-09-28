import { collect, HttpError } from './collector.js';
import { parseSearchUrl, placeLabel } from './search-url.js';
import { loadCache, saveCache } from './cache.js';
import { createLauncher } from './launcher.js';
import { createOverlay } from './viewer/overlay.js';
import { describeSearch } from './viewer/logic.js';
import css from './viewer/styles.css';

async function fetchPage(url, signal) {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) throw new HttpError(response.status);
  return response.text();
}

// env: { L: Leaflet global, leafletCss: string, storage: { get(key, fallback), set(key, value) } }
export function start({ L, leafletCss, storage }) {
  let overlay = null;
  let controller = null;
  let running = false;

  const getOverlay = () => (overlay ??= createOverlay({
    L,
    css: `${leafletCss}\n${css}`,
    onRefresh: () => run(true),
    onCancel: () => controller?.abort(),
    onClose: () => controller?.abort(),
  }));

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

    const cached = force ? null : loadCache(storage, searchUrl);
    if (cached) {
      try {
        view.showResults(cached, { fromCache: true });
        return;
      } catch (e) {
        console.warn('[airbnb-sorter] кэш не отображается, собираю заново', e);
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
    if (result.meta.stopReason !== 'cancelled') saveCache(storage, searchUrl, result);
    view.showResults(result);
  }

  createLauncher(() => run(false));
}
