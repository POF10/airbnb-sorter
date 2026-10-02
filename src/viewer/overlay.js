import { el, button } from './dom.js';
import { createList } from './list.js';
import { createMap } from './map.js';
import { createToolbar } from './toolbar.js';
import {
  SORTS, DEFAULT_SORT, NO_FILTERS, RATING_STEPS, REVIEW_STEPS, sanitizeFilters, sortListings, filterListings,
  thresholdCounts, hasActiveFilters, filterByBounds, describeSearch, summaryText, partialReasons, progressText,
} from './logic.js';
import { t } from '../i18n.js';

// Full-screen layer in a Shadow DOM. Knows nothing about Airbnb or storage: renders { listings, meta } and
// reports user intents.
//   L — Leaflet; css — Leaflet CSS + styles.css;
//   initialSort, initialFilters — the sort order and { minRating, minReviews, hideViewed } to open with;
//   viewedIds — ids of the listings the user has already opened;
//   showMapHint — whether the "only collected results" note may still appear on the map;
//   supportUrl — where the ♥ in the header leads (no link without it).
export function createOverlay({
  L, css, initialSort, initialFilters, viewedIds = [], showMapHint = false, supportUrl,
  onSortChange, onFiltersChange, onListingOpen, onMapHintDismiss, onRefresh, onCancel, onClose,
}) {
  const host = document.createElement('div');
  host.id = 'airbnb-sorter';
  // Inline, so no page rule matching the host div can override the placement.
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;

  const startSort = Object.hasOwn(SORTS, initialSort ?? '') ? initialSort : DEFAULT_SORT;
  const state = {
    listings: [], meta: null, fromCache: false, sortId: startSort, onlyInMap: false,
    filters: sanitizeFilters(initialFilters),
  };
  let viewed = new Set(viewedIds);
  // "Hide viewed" works on a snapshot, so a card opened a moment ago does not vanish from under the cursor.
  // The snapshot is retaken when the filters change and when results are shown.
  let hidden = new Set(viewed);
  const isViewed = id => viewed.has(id);
  const isHidden = id => hidden.has(id);

  // Header: what was collected on the left, utilities on the right.
  const sub = el('div', 'abs-sub');
  const summary = el('span');
  const warn = el('span', 'abs-warn', '⚠');
  warn.hidden = true;
  const summaryLine = el('div', 'abs-summary');
  summaryLine.append(summary, warn);
  const info = el('div', 'abs-info');
  info.append(sub, summaryLine);

  const refreshBtn = button(t().refresh, 'abs-btn');
  const viewBtn = button(t().showMap, 'abs-btn abs-only-narrow');
  const closeBtn = button('×', 'abs-close');
  closeBtn.title = t().close;
  const controls = el('div', 'abs-controls');
  controls.append(refreshBtn, viewBtn);
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

  // Toolbar: everything that changes what is shown.
  const toolbar = createToolbar({
    sortId: startSort,
    onSort: sortId => {
      state.sortId = sortId;
      onSortChange?.(sortId);
      render();
    },
    onFilter: patch => setFilters({ ...state.filters, ...patch }),
    onAreaToggle: checked => {
      state.onlyInMap = checked;
      render();
    },
    onReset: () => resetFilters(),
  });

  // Body: progress | error | results
  const progressLabel = el('div');
  const cancelBtn = button(t().cancel, 'abs-btn');
  const progress = el('div', 'abs-progress');
  progress.append(el('div', 'abs-spinner'), progressLabel, cancelBtn);
  const errorBox = el('div', 'abs-error');
  let map = null;
  const list = createList({ onHover: id => map?.highlight(id), isViewed });
  list.el.tabIndex = -1; // focused with the results, so keys scroll the list
  const emptyText = el('p', 'abs-empty-text');
  const emptyHint = el('p', 'abs-empty-hint');
  const emptyReset = button(t().filters.reset, 'abs-btn');
  const emptyBox = el('div', 'abs-empty');
  emptyBox.append(emptyText, emptyHint, emptyReset);
  emptyBox.hidden = true;
  list.el.prepend(emptyBox);
  const mapBox = el('div', 'abs-map');
  const main = el('main', 'abs-main');
  main.append(list.el, mapBox);

  const root = el('div', 'abs-root');
  root.tabIndex = -1; // focused on open, so keys no longer reach the launcher under the overlay
  root.append(head, toolbar.el, progress, errorBox, main);
  shadow.append(style, root);
  document.body.append(host);

  let savedOverflow = '';

  function setMode(mode) {
    progress.hidden = mode !== 'progress';
    errorBox.hidden = mode !== 'error';
    main.hidden = mode !== 'results';
    toolbar.el.hidden = mode !== 'results';
    if (mode !== 'results') toolbar.closeMenus();
    refreshBtn.disabled = mode === 'progress';
    summaryLine.hidden = mode !== 'results'; // counts belong to the results on screen
  }

  // The map shows what passed the filters; its pins are redrawn only when that set may have changed.
  let mapStale = true;

  function setFilters(filters) {
    state.filters = filters;
    hidden = new Set(viewed);
    mapStale = true;
    onFiltersChange?.(filters);
    render();
  }

  function resetFilters() {
    state.onlyInMap = false;
    setFilters({ ...NO_FILTERS });
    // The button that was pressed is gone now; keep the focus inside the overlay. On narrow screens the
    // list may be the hidden one of the two views.
    (list.el.clientWidth > 0 ? list.el : root).focus({ preventScroll: true });
  }

  // Re-rendering the list resets its scroll, so it only happens when the shown listings actually change.
  let shownKey = '';
  function render() {
    const filtered = filterListings(state.listings, state.filters, isHidden);
    if (map && mapStale) {
      mapStale = false;
      map.setListings(filtered); // pins follow the filters; the view stays where it is
    }

    let shown = filtered;
    // While hidden (narrow screens, list view) the map has no size and its bounds are meaningless.
    const bounds = state.onlyInMap && map && mapBox.clientWidth > 0 ? map.getBounds() : null;
    if (bounds) shown = filterByBounds(shown, bounds);
    const sorted = sortListings(shown, state.sortId);
    const key = sorted.map(l => l.id).join(',');
    if (key !== shownKey) {
      shownKey = key;
      list.set(sorted);
    }

    // Nothing to show: either the filters removed everything there was, or nothing was collected in this area.
    emptyBox.hidden = sorted.length > 0 || state.listings.length === 0;
    if (!emptyBox.hidden) {
      const nothingHere = bounds !== null && filterByBounds(state.listings, bounds).length === 0;
      emptyText.textContent = nothingHere ? t().filters.emptyArea : t().filters.empty;
      emptyHint.textContent = nothingHere ? t().mapHint : '';
      emptyHint.hidden = !nothingHere;
    }

    const narrowed = hasActiveFilters(state.filters) || state.onlyInMap;
    summary.textContent = summaryText(state.meta, state.listings.length, narrowed ? shown.length : null, { fromCache: state.fromCache });
    const reasons = state.meta.partial ? partialReasons(state.meta) : [];
    warn.hidden = reasons.length === 0;
    warn.title = t().partial(reasons.join('; '));
    drawToolbar();
  }

  // Counts say what choosing an option would give, and choosing retakes the "hide viewed" snapshot.
  function drawToolbar() {
    toolbar.draw({
      filters: state.filters,
      onlyInMap: state.onlyInMap,
      ratingCounts: thresholdCounts(state.listings, state.filters, 'minRating', RATING_STEPS, isViewed),
      reviewCounts: thresholdCounts(state.listings, state.filters, 'minReviews', REVIEW_STEPS, isViewed),
    });
  }

  function refreshViewed() {
    list.refreshViewed();
    map?.refreshViewed();
    if (state.filters.hideViewed) drawToolbar(); // the counts leave out the viewed ones
  }

  // The first time the user moves the map: say that it only shows what was collected.
  let hintPending = showMapHint;
  function onUserMove() {
    if (!hintPending) return;
    hintPending = false;
    map.showHint(t().mapHint, t().dismiss, () => onMapHintDismiss?.());
  }

  // Capture phase: the photo arrows stop the propagation of their clicks, and a click on them must still
  // close an open menu.
  function onRootClick(e) {
    if (!e.target.closest('.abs-dd')) toolbar.closeMenus();
    if (e.type === 'auxclick' && e.button !== 1) return; // only the middle button opens a link
    if (e.target.closest('.abs-nav')) return; // flipping photos is not opening the listing
    const card = e.target.closest('a.abs-card');
    if (!card) return;
    viewed.add(card.dataset.id);
    refreshViewed();
    onListingOpen?.(card.dataset.id);
  }
  root.addEventListener('click', onRootClick, true);
  root.addEventListener('auxclick', onRootClick, true);

  emptyReset.addEventListener('click', () => resetFilters());
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
    if (toolbar.closeMenus()) return; // Esc closes an open menu first
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
      map = null; // Leaflet throws when a map is removed twice
      list.destroy();
      host.remove();
    },
    // ids of every listing the user has opened; repaints the marks without re-rendering the list.
    setViewed(ids) {
      viewed = new Set(ids);
      refreshViewed();
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
      hidden = new Set(viewed);
      mapStale = true;
      sub.textContent = describeSearch(meta);
      setMode('results');
      if (api.isOpen()) list.el.focus({ preventScroll: true });
      map ??= createMap(mapBox, {
        L,
        isViewed,
        onMarkerHover: id => list.highlight(id),
        onMoveEnd: () => { if (state.onlyInMap) render(); },
        onUserMove,
      });
      map.invalidateSize();
      // The frame is everything collected, whatever the filters leave: changing them later must not move the map.
      map.fit(listings);
      render();
    },
  };
  return api;
}
