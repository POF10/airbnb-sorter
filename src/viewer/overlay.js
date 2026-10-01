import { el, button } from './dom.js';
import { createList } from './list.js';
import { createMap } from './map.js';
import {
  SORTS, DEFAULT_SORT, sortListings, filterByBounds, describeSearch, summaryText, partialReasons, progressText,
} from './logic.js';
import { t } from '../i18n.js';

// Full-screen layer in a Shadow DOM. Knows nothing about Airbnb or storage: renders { listings, meta } and
// reports user intents. L — Leaflet; css — Leaflet CSS + styles.css; initialSort — the sort to open with;
// supportUrl — where the ♥ in the header leads (no link without it).
export function createOverlay({ L, css, initialSort, supportUrl, onSortChange, onRefresh, onCancel, onClose }) {
  const host = document.createElement('div');
  host.id = 'airbnb-sorter';
  // Inline, so no page rule matching the host div can override the placement.
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;

  // Header
  const sub = el('div', 'abs-sub');
  const summary = el('span');
  const warn = el('span', 'abs-warn', '⚠');
  warn.hidden = true;
  const summaryLine = el('div', 'abs-summary');
  summaryLine.append(summary, warn);
  const info = el('div', 'abs-info');
  info.append(sub, summaryLine);

  const startSort = Object.hasOwn(SORTS, initialSort ?? '') ? initialSort : DEFAULT_SORT;
  const sortSelect = el('select', 'abs-select');
  for (const [id, { label }] of Object.entries(SORTS)) {
    const option = el('option', null, label);
    option.value = id;
    sortSelect.append(option);
  }
  sortSelect.value = startSort;
  const areaBox = el('input');
  areaBox.type = 'checkbox';
  const areaLabel = el('label', 'abs-toggle');
  areaLabel.append(areaBox, t().onlyInMap);
  const refreshBtn = button(t().refresh, 'abs-btn');
  const viewBtn = button(t().showMap, 'abs-btn abs-only-narrow');
  const closeBtn = button('×', 'abs-close');
  closeBtn.title = t().close;
  const controls = el('div', 'abs-controls');
  controls.append(sortSelect, areaLabel, refreshBtn, viewBtn);
  if (supportUrl) {
    const support = el('a', 'abs-support', '♥');
    support.href = supportUrl;
    support.target = '_blank';
    support.rel = 'noopener';
    support.title = t().support;
    support.setAttribute('aria-label', t().support);
    controls.append(support);
  }
  controls.append(closeBtn);
  const head = el('header', 'abs-head');
  head.append(info, controls);

  // Body: progress | error | results
  const progressLabel = el('div');
  const cancelBtn = button(t().cancel, 'abs-btn');
  const progress = el('div', 'abs-progress');
  progress.append(el('div', 'abs-spinner'), progressLabel, cancelBtn);
  const errorBox = el('div', 'abs-error');
  let map = null;
  const list = createList({ onHover: id => map?.highlight(id) });
  list.el.tabIndex = -1; // focused with the results, so keys scroll the list
  const mapBox = el('div', 'abs-map');
  const main = el('main', 'abs-main');
  main.append(list.el, mapBox);

  const root = el('div', 'abs-root');
  root.tabIndex = -1; // focused on open, so keys no longer reach the launcher under the overlay
  root.append(head, progress, errorBox, main);
  shadow.append(style, root);
  document.body.append(host);

  const state = { listings: [], meta: null, fromCache: false, sortId: startSort, onlyInMap: false };
  let savedOverflow = '';

  function setMode(mode) {
    progress.hidden = mode !== 'progress';
    errorBox.hidden = mode !== 'error';
    main.hidden = mode !== 'results';
    sortSelect.disabled = mode !== 'results';
    areaBox.disabled = mode !== 'results';
    refreshBtn.disabled = mode === 'progress';
    summaryLine.hidden = mode !== 'results'; // counts belong to the results on screen
  }

  // Re-rendering the list resets its scroll, so it only happens when the shown listings actually change.
  let shownKey = '';
  function render() {
    let shown = state.listings;
    // While hidden (narrow screens, list view) the map has no size and its bounds are meaningless.
    if (state.onlyInMap && map && mapBox.clientWidth > 0) shown = filterByBounds(shown, map.getBounds());
    const sorted = sortListings(shown, state.sortId);
    const key = sorted.map(l => l.id).join(',');
    if (key !== shownKey) {
      shownKey = key;
      list.set(sorted);
    }
    summary.textContent = summaryText(state.meta, state.listings.length, state.onlyInMap ? shown.length : null, { fromCache: state.fromCache });
    const reasons = state.meta.partial ? partialReasons(state.meta) : [];
    warn.hidden = reasons.length === 0;
    warn.title = t().partial(reasons.join('; '));
  }

  sortSelect.addEventListener('change', () => {
    state.sortId = sortSelect.value;
    onSortChange?.(state.sortId);
    render();
  });
  areaBox.addEventListener('change', () => { state.onlyInMap = areaBox.checked; render(); });
  refreshBtn.addEventListener('click', () => onRefresh());
  cancelBtn.addEventListener('click', () => onCancel());
  closeBtn.addEventListener('click', () => api.close());
  viewBtn.addEventListener('click', () => {
    const showMap = main.classList.toggle('abs-main--map');
    viewBtn.textContent = showMap ? t().showList : t().showMap;
    if (showMap && map) {
      map.invalidateSize();
      map.fitAll();
    }
    if (state.meta) render();
  });
  const onKey = e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    api.close();
  };

  const api = {
    isOpen() {
      return host.style.display !== 'none';
    },
    open() {
      if (api.isOpen()) return;
      host.style.display = '';
      savedOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey, true);
      root.focus({ preventScroll: true });
    },
    close() {
      if (!api.isOpen()) return;
      host.style.display = 'none';
      document.documentElement.style.overflow = savedOverflow;
      window.removeEventListener('keydown', onKey, true);
      onClose();
    },
    // Removes the layer from the page; the instance must not be used afterwards.
    destroy() {
      api.close();
      map?.remove();
      list.destroy();
      host.remove();
    },
    // title: the search being collected (the header may still show the previous one).
    showProgress(p, title) {
      setMode('progress');
      if (title !== undefined) sub.textContent = title;
      progressLabel.textContent = progressText(p);
    },
    showError(message) {
      setMode('error');
      errorBox.textContent = t().collectFailed(message);
    },
    showResults({ listings, meta }, { fromCache = false } = {}) {
      Object.assign(state, { listings, meta, fromCache });
      shownKey = ''; // new data: always re-render, even if the ids are the same
      sub.textContent = describeSearch(meta);
      setMode('results');
      if (api.isOpen()) list.el.focus({ preventScroll: true });
      map ??= createMap(mapBox, {
        L,
        onMarkerHover: id => list.highlight(id),
        onMoveEnd: () => { if (state.onlyInMap) render(); },
      });
      map.invalidateSize();
      map.setListings(listings);
      render();
    },
  };
  return api;
}
