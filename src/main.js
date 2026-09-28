import { collect, HttpError } from './collector.js';
import { parseSearchUrl } from './search-url.js';
import { loadCache, saveCache } from './cache.js';
import { createLauncher } from './launcher.js';
import { createOverlay } from './viewer/overlay.js';
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
    const { searchUrl } = parseSearchUrl(location.href);
    const cached = force ? null : loadCache(storage, searchUrl);
    if (cached) {
      view.showResults(cached, { fromCache: true });
      return;
    }
    controller?.abort();
    const current = (controller = new AbortController());
    view.showProgress(null);
    try {
      const result = await collect(location.href, {
        fetchPage,
        signal: current.signal,
        onProgress: p => { if (current === controller) view.showProgress(p); },
      });
      if (current !== controller) return;
      // A cancelled run is shown but not cached, so the next click collects afresh.
      if (result.meta.stopReason !== 'cancelled') saveCache(storage, searchUrl, result);
      view.showResults(result);
    } catch (e) {
      if (current !== controller) return;
      console.error('[airbnb-sorter]', e);
      view.showError(e.message);
    }
  }

  createLauncher(() => run(false));
}
