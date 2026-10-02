// ==UserScript==
// @name         Airbnb Sorter
// @namespace    airbnb-sorter.local
// @version      0.3.0
// @description  Collects a whole Airbnb search (past the 270-listing cap) and shows it sortable by price, with photos and a map
// @description:ru Собирает всю выдачу поиска Airbnb (а не только 270 объявлений) и показывает её с сортировкой по цене, фото и картой
// @author       POF10
// @homepageURL  https://github.com/POF10/airbnb-sorter
// @supportURL   https://github.com/POF10/airbnb-sorter/issues
// @downloadURL  https://raw.githubusercontent.com/POF10/airbnb-sorter/main/dist/airbnb-sorter.user.js
// @updateURL    https://raw.githubusercontent.com/POF10/airbnb-sorter/main/dist/airbnb-sorter.user.js
// @match        https://www.airbnb.com/*
// @include      /^https:\/\/[a-z][a-z-]*\.airbnb\.(?:[a-z]{2,3}|com?\.[a-z]{2})\//
// @require      https://unpkg.com/leaflet@1.9.4/dist/leaflet.js#sha256=20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=
// @resource     leafletCss https://unpkg.com/leaflet@1.9.4/dist/leaflet.css#sha256=p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_getResourceText
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  // src/extract.js
  var ExtractError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "ExtractError";
    }
  };
  var STATE_RE = /<script id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/;
  var list = (v) => Array.isArray(v) ? v : [];
  var toNumber = (v) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  var hasHistogram = (item) => Array.isArray(item?.priceHistogram);
  var isPriceItem = (item) => list(item?.searchParams?.params).some((p) => p?.key === "price_min" || p?.key === "price_max");
  function findPriceFilter(filters) {
    const items = list(filters?.filterPanel?.filterPanelSections?.sections).flatMap((s) => list(s?.sectionData?.discreteFilterItems));
    const item = items.find((i) => hasHistogram(i) && isPriceItem(i)) ?? items.find(hasHistogram);
    if (!item) return null;
    const counts = item.priceHistogram.map(Number).filter(Number.isFinite);
    return {
      min: toNumber(item.minValue),
      max: toNumber(item.maxValue),
      histogramTotal: counts.length ? counts.reduce((sum, n) => sum + n, 0) : null
    };
  }
  function extractSearchPage(html) {
    try {
      return parseSearchPage(html);
    } catch (e) {
      if (e instanceof ExtractError) throw e;
      throw new ExtractError(`unexpected page structure: ${e.message}`);
    }
  }
  function parseSearchPage(html) {
    const m = STATE_RE.exec(html);
    if (!m) throw new ExtractError('no <script id="data-deferred-state-0">');
    let state;
    try {
      state = JSON.parse(m[1]);
    } catch {
      throw new ExtractError("data-deferred-state-0: invalid JSON");
    }
    const entries = state?.niobeClientData;
    if (!Array.isArray(entries)) throw new ExtractError("no niobeClientData");
    const entry = entries.find((e) => Array.isArray(e) && typeof e[0] === "string" && e[0].startsWith("StaysSearch:"));
    if (!entry) throw new ExtractError("no StaysSearch: entry in niobeClientData");
    const results = entry[1]?.data?.presentation?.staysSearch?.results;
    if (!results) throw new ExtractError("no …staysSearch.results");
    if (!Array.isArray(results.searchResults)) throw new ExtractError("no …staysSearch.results.searchResults");
    const cursors = results.paginationInfo?.pageCursors;
    return {
      results: results.searchResults,
      pageCursors: Array.isArray(cursors) ? cursors.filter((c) => typeof c === "string") : [],
      priceFilter: findPriceFilter(results.filters)
    };
  }

  // src/price.js
  function parseNumber(raw) {
    const s = raw.replace(/[\s'\u2019]/g, "");
    const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
    let intPart = s;
    let fraction = "";
    if (lastSep !== -1 && /^\d{1,2}$/.test(s.slice(lastSep + 1))) {
      intPart = s.slice(0, lastSep);
      fraction = s.slice(lastSep + 1);
    }
    intPart = intPart.replace(/[.,]/g, "");
    if (!/^\d+$/.test(intPart)) return null;
    return Number(fraction ? `${intPart}.${fraction}` : intPart);
  }
  function parsePrice(text) {
    if (typeof text !== "string") return null;
    const s = text.replace(/[\u00a0\u202f]/g, " ").replace(/[\u200e\u200f\u061c]/g, "").trim();
    const m = /\d[\d\s.,'\u2019]*/.exec(s);
    if (!m) return null;
    const amount = parseNumber(m[0].trim());
    if (amount === null) return null;
    const currency = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim() || null;
    if (currency && /\d/.test(currency)) return null;
    return { amount, currency };
  }

  // src/search-url.js
  var STRIPPED = ["cursor", "pagination_search", "price_min", "price_max"];
  var PRICE_MODE = ["price_filter_input_type", "price_filter_num_nights"];
  function numberParam(params, key) {
    const value = params.get(key);
    return value != null && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
  }
  function parseSearchUrl(href) {
    const url = new URL(href);
    const userMin = numberParam(url.searchParams, "price_min");
    const userMax = numberParam(url.searchParams, "price_max");
    for (const key of STRIPPED) url.searchParams.delete(key);
    if (userMin == null && userMax == null) for (const key of PRICE_MODE) url.searchParams.delete(key);
    return { searchUrl: url.toString(), userMin, userMax };
  }
  function rangeUrl(searchUrl, { lo, hi }) {
    const url = new URL(searchUrl);
    if (lo > 0) url.searchParams.set("price_min", String(lo));
    if (hi != null) url.searchParams.set("price_max", String(hi));
    if ((lo > 0 || hi != null) && !url.searchParams.has("price_filter_input_type")) {
      url.searchParams.set("price_filter_input_type", "0");
    }
    return url.toString();
  }
  function pageUrl(url, cursor) {
    const result = new URL(url);
    result.searchParams.set("cursor", cursor);
    return result.toString();
  }
  function nightsBetween(checkin, checkout) {
    const days = checkin && checkout ? Math.round((Date.parse(checkout) - Date.parse(checkin)) / 864e5) : NaN;
    return days > 0 ? days : null;
  }
  function searchContext(searchUrl) {
    const url = new URL(searchUrl);
    const nights = nightsBetween(url.searchParams.get("checkin"), url.searchParams.get("checkout"));
    return { origin: url.origin, searchParams: url.searchParams, nights };
  }
  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }
  function placeLabel(searchUrl) {
    const url = new URL(searchUrl);
    const query = url.searchParams.get("query");
    if (query) return query;
    const m = /^\/s\/([^/]+)\/homes/.exec(url.pathname);
    if (!m) return null;
    return safeDecode(m[1]).replace(/--/g, ", ").replace(/-/g, " ").replace(/~/g, "-");
  }
  function isHomesSearchPath(pathname) {
    return /^\/s\/(?:[^/]+\/)?homes\/?$/.test(pathname);
  }

  // src/normalize.js
  function decodeListingId(encoded) {
    if (typeof encoded !== "string" || encoded === "") return null;
    let decoded;
    try {
      decoded = atob(encoded);
    } catch {
      return null;
    }
    const m = /^DemandStayListing:(\d+)$/.exec(decoded);
    return m ? m[1] : null;
  }
  var ROOM_PARAMS = [["checkin", "check_in"], ["checkout", "check_out"], ["adults", "adults"], ["children", "children"], ["infants", "infants"], ["pets", "pets"]];
  function listingUrl(id, { origin, searchParams }, overrides = null) {
    const ownDates = overrides?.checkin && overrides?.checkout;
    const url = new URL(`/rooms/${id}`, origin);
    for (const [from, to] of ROOM_PARAMS) {
      const value = ownDates && (from === "checkin" || from === "checkout") ? overrides[from] : searchParams.get(from);
      if (value) url.searchParams.set(to, value);
    }
    return url.toString();
  }
  function flattenPriceLine(line) {
    if (!Array.isArray(line?.orderedComponents)) return line;
    const flat = { ...line };
    for (const part of line.orderedComponents) {
      for (const [key, value] of Object.entries(part ?? {})) if (value != null && flat[key] == null) flat[key] = value;
    }
    return flat;
  }
  function normalizePrice(rawLine) {
    const line = flattenPriceLine(rawLine);
    const shown = parsePrice(line?.discountedPrice ?? line?.price);
    const original = parsePrice(line?.originalPrice);
    return {
      amount: shown?.amount ?? null,
      currency: shown?.currency ?? null,
      label: line?.accessibilityLabel ?? null,
      qualifier: line?.qualifier ?? null,
      original: original?.amount ?? null
    };
  }
  function parseRating(text) {
    const s = typeof text === "string" ? text.replace(/[\u200e\u200f\u061c]/g, "").trim() : "";
    const m = /^(\d[.,]\d{1,2})(?:\s*\(([\d\s.,]+)\))?/.exec(s);
    if (!m) return { rating: null, reviews: null };
    return { rating: Number(m[1].replace(",", ".")), reviews: m[2] ? Number(m[2].replace(/\D/g, "")) : null };
  }
  var finiteOrNull = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
  var list2 = (v) => Array.isArray(v) ? v : [];
  function isTotalPrice(raw, price) {
    return /TOTAL/.test(raw.structuredDisplayPrice?.displayPriceStyle ?? "") || price.qualifier === "total";
  }
  function normalizeListing(raw, ctx) {
    const id = decodeListingId(raw?.demandStayListing?.id);
    if (!id) return null;
    const coordinate = raw.demandStayListing.location?.coordinate;
    const overrides = raw.listingParamOverrides;
    const nights = nightsBetween(overrides?.checkin, overrides?.checkout) ?? ctx.nights;
    const price = normalizePrice(raw.structuredDisplayPrice?.primaryLine);
    const perNight = price.amount != null && nights && isTotalPrice(raw, price) ? Math.round(price.amount / nights * 100) / 100 : null;
    return {
      id,
      url: listingUrl(id, ctx, overrides),
      title: raw.title ?? null,
      name: raw.nameLocalized?.localizedStringWithTranslationPreference ?? raw.subtitle ?? null,
      photos: list2(raw.contextualPictures).map((p) => p?.picture).filter(Boolean),
      price,
      pricePerNight: perNight,
      ...parseRating(raw.avgRatingLocalized),
      lat: finiteOrNull(coordinate?.latitude),
      lng: finiteOrNull(coordinate?.longitude),
      details: list2(raw.structuredContent?.primaryLine).map((line) => line?.body).filter(Boolean),
      badges: list2(raw.badges).map((b) => b?.text).filter(Boolean)
    };
  }

  // src/collector.js
  var MAX_PAGES = 15;
  var PAGE_SIZE = 18;
  var MIN_BUDGET = 300;
  var MAX_FAIL_STREAK = 3;
  var STOP = /* @__PURE__ */ Symbol("stop");
  var HttpError = class extends Error {
    constructor(status) {
      super(`HTTP ${status}`);
      this.name = "HttpError";
      this.status = status;
    }
  };
  function sleep(ms, signal) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
  var politePause = (signal) => sleep(250 + Math.random() * 350, signal);
  var isRetryable = (e) => e instanceof HttpError ? e.status === 429 || e.status >= 500 : e instanceof TypeError;
  var isBlock = (e) => e instanceof ExtractError || e instanceof HttpError && (e.status === 401 || e.status === 403);
  function createLimiter(max) {
    let active = 0;
    const queue = [];
    const next = () => {
      if (active >= max || queue.length === 0) return;
      active++;
      const { task, resolve, reject } = queue.shift();
      task().then(resolve, reject).finally(() => {
        active--;
        next();
      });
    };
    return (task) => new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
  }
  function splitRange({ lo, hi }, priceMax) {
    if (hi == null) {
      const h = priceMax != null && priceMax > lo ? priceMax : Math.max(2 * lo, lo + 50);
      return [{ lo, hi: h }, { lo: h, hi: null }];
    }
    if (hi - lo <= 1) return null;
    const mid = Math.round((lo + hi) / 2);
    return [{ lo, hi: mid }, { lo: mid, hi }];
  }
  async function collect(href, {
    fetchPage: fetchPage2,
    signal,
    onProgress = () => {
    },
    concurrency = 3,
    pause = politePause,
    retryDelays = [2e3, 4e3, 8e3],
    maxRequests = null
  }) {
    const { searchUrl, userMin, userMax } = parseSearchUrl(href);
    const ctx = searchContext(searchUrl);
    const hasUserPrice = userMin != null || userMax != null;
    const byId2 = /* @__PURE__ */ new Map();
    const limit = createLimiter(concurrency);
    const s = {
      ranges: 0,
      pagesDone: 0,
      pagesKnown: 1,
      saturatedRanges: 0,
      failedPages: 0,
      failStreak: 0,
      requests: 0,
      stopReason: null,
      expectedTotal: null,
      priceMax: null
    };
    const budget = () => maxRequests ?? Math.max(MIN_BUDGET, s.expectedTotal ? 4 * Math.ceil(s.expectedTotal / PAGE_SIZE) : 0);
    const report = () => {
      try {
        onProgress({
          ranges: s.ranges,
          pagesDone: s.pagesDone,
          pagesPlanned: Math.max(s.pagesKnown, s.expectedTotal ? Math.ceil(s.expectedTotal / PAGE_SIZE) : 0),
          listings: byId2.size,
          expectedTotal: s.expectedTotal
        });
      } catch (e) {
        console.warn("[airbnb-sorter] onProgress failed", e);
      }
    };
    const add = (results) => {
      for (const raw of results) {
        const listing = normalizeListing(raw, ctx);
        if (listing && !byId2.has(listing.id)) byId2.set(listing.id, listing);
      }
    };
    const fetchWithRetry = async (url) => {
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) s.stopReason ?? (s.stopReason = "cancelled");
        if (!s.stopReason && s.requests >= budget()) s.stopReason = "limit";
        if (s.stopReason) throw STOP;
        s.requests++;
        try {
          return await fetchPage2(url, signal);
        } catch (e) {
          if (signal?.aborted) {
            s.stopReason ?? (s.stopReason = "cancelled");
            throw STOP;
          }
          if (!isRetryable(e) || attempt >= retryDelays.length) throw e;
          await sleep(retryDelays[attempt], signal);
        }
      }
    };
    const loadPage = (url) => limit(async () => {
      const before = s.requests;
      try {
        const page = extractSearchPage(await fetchWithRetry(url));
        s.failStreak = 0;
        return page;
      } finally {
        if (s.requests > before && !s.stopReason) await pause(signal);
      }
    });
    const pageFailed = (e, isRoot) => {
      if (e === STOP) return;
      if (isRoot) throw e;
      if (isBlock(e)) {
        s.stopReason ?? (s.stopReason = "blocked");
        return;
      }
      s.failedPages++;
      if (++s.failStreak >= MAX_FAIL_STREAK) s.stopReason ?? (s.stopReason = "blocked");
    };
    async function processRange(range, isRoot) {
      const url = rangeUrl(searchUrl, range);
      let first;
      try {
        first = await loadPage(url);
      } catch (e) {
        pageFailed(e, isRoot);
        report();
        return;
      }
      s.ranges++;
      s.pagesDone++;
      if (isRoot) {
        s.priceMax = first.priceFilter?.max ?? null;
        s.expectedTotal = hasUserPrice ? null : first.priceFilter?.histogramTotal ?? null;
      }
      add(first.results);
      if (first.pageCursors.length >= MAX_PAGES) {
        const halves = splitRange(range, s.priceMax);
        if (halves) {
          s.pagesKnown += halves.length;
          report();
          await Promise.all(halves.map((half) => processRange(half, false)));
          return;
        }
        s.saturatedRanges++;
      }
      const rest = first.pageCursors.slice(1);
      s.pagesKnown += rest.length;
      report();
      await Promise.all(rest.map(async (cursor) => {
        try {
          const page = await loadPage(pageUrl(url, cursor));
          s.pagesDone++;
          add(page.results);
        } catch (e) {
          pageFailed(e, false);
        }
        report();
      }));
    }
    try {
      await processRange({ lo: userMin ?? 0, hi: userMax ?? null }, true);
    } catch (e) {
      s.stopReason ?? (s.stopReason = "error");
      throw e;
    }
    return {
      listings: [...byId2.values()],
      meta: {
        searchUrl,
        origin: ctx.origin,
        nights: ctx.nights,
        placeLabel: placeLabel(searchUrl),
        collectedAt: (/* @__PURE__ */ new Date()).toISOString(),
        expectedTotal: s.expectedTotal,
        saturatedRanges: s.saturatedRanges,
        failedPages: s.failedPages,
        partial: s.stopReason != null || s.failedPages > 0 || s.saturatedRanges > 0,
        stopReason: s.stopReason
      }
    };
  }

  // src/cache.js
  var KEY = "lastCollection";
  var VERSION = 1;
  var MAX_PHOTOS = 10;
  var VOLATILE = ["search_type", "source", "channel", "federated_search_session_id", "federated_search_id", "pagination_search", "cursor"];
  function cacheKey(searchUrl) {
    const url = new URL(searchUrl);
    for (const key of VOLATILE) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  }
  async function loadCache(storage, searchUrl) {
    try {
      const cached = await storage.get(KEY, null);
      const valid = cached && cached.v === VERSION && Array.isArray(cached.listings) && typeof cached.meta?.searchUrl === "string";
      return valid && cached.key === cacheKey(searchUrl) ? { listings: cached.listings, meta: cached.meta } : null;
    } catch {
      return null;
    }
  }
  async function saveCache(storage, searchUrl, { listings, meta }) {
    try {
      const trimmed = listings.map((l) => l.photos?.length > MAX_PHOTOS ? { ...l, photos: l.photos.slice(0, MAX_PHOTOS) } : l);
      await storage.set(KEY, { v: VERSION, key: cacheKey(searchUrl), listings: trimmed, meta });
    } catch (e) {
      console.warn("[airbnb-sorter] could not save the cache", e);
    }
  }

  // src/i18n.js
  var DICTS = {
    en: {
      numberLocale: "en-US",
      dateLocale: "en-GB",
      launcher: "↕ Sort all",
      sort: { "price-desc": "Price ↓", "price-asc": "Price ↑", "rating-desc": "Rating ↓", "reviews-desc": "Reviews ↓" },
      newRating: "★ New",
      perNight: "/night",
      onlyInMap: "Only in map area",
      refresh: "⟳ Refresh",
      showMap: "Map",
      showList: "List",
      close: "Close (Esc)",
      cancel: "Cancel",
      prevPhoto: "Previous photo",
      nextPhoto: "Next photo",
      guests: (n) => `${n} ${n === 1 ? "guest" : "guests"}`,
      justNow: "just now",
      minutesAgo: (n) => `${n} min ago`,
      hoursAgo: (n) => `${n} h ago`,
      daysAgo: (n) => `${n} d ago`,
      collected: (total) => `Collected ${total}`,
      ofExpected: (expected) => ` of ~${expected}`,
      showing: (shown) => ` · showing ${shown}`,
      loadingFirst: "Loading the first page…",
      progress: (p, of) => `Ranges: ${p.ranges} · Pages: ${p.pagesDone} / ~${p.pagesPlanned} · Listings: ${p.listings}${of}`,
      cancelled: "collection cancelled",
      blocked: "Airbnb started blocking requests",
      limit: "request limit reached",
      failedPages: (n) => `pages failed to load: ${n}`,
      saturated: (n) => `overfull price ranges: ${n} (some listings unavailable)`,
      partial: (reasons) => `Incomplete collection: ${reasons}`,
      collectFailed: (message) => `Could not collect the search: ${message}`,
      mapArea: "map area",
      filters: {
        rating: "Rating",
        reviews: "Reviews",
        any: "Any",
        hideViewed: "Hide viewed",
        reset: "Reset",
        empty: "Nothing matches these filters",
        emptyArea: "Nothing was collected in this area"
      },
      viewed: "Viewed",
      mapHint: "Only what your Airbnb search found is shown here. To search another area, move the map on Airbnb and press “↕ Sort all” again.",
      dismiss: "Close",
      support: "Support the developer",
      popup: {
        title: "Price Sorter for Airbnb",
        howTo: "Open a homes search on Airbnb and press “↕ Sort all”.",
        language: "Language",
        languages: { auto: "Auto", en: "English", ru: "Русский" },
        github: "GitHub",
        report: "Report a problem",
        howItWorks: "How it works",
        rate: "Rate",
        viewedCount: (n) => `Viewed: ${n}`,
        clearViewed: "Clear"
      },
      welcome: {
        steps: [
          "Open a homes search on Airbnb and set the dates, guests, filters and map area as usual — that exact search is what gets collected.",
          "Press the button in the bottom-right corner of the page:",
          "Sort by price, filter by rating and reviews, and browse on the map."
        ],
        open: "Open Airbnb",
        pin: "Tip: pin the extension — the puzzle icon in the Chrome toolbar, then the pin. Clicking the extension’s icon opens its settings.",
        free: "Free, with no ads. Nothing leaves your browser.",
        privacy: "Privacy policy"
      }
    },
    ru: {
      numberLocale: "ru-RU",
      dateLocale: "ru-RU",
      launcher: "↕ Сортировать все",
      sort: { "price-desc": "Цена ↓", "price-asc": "Цена ↑", "rating-desc": "Рейтинг ↓", "reviews-desc": "Отзывов ↓" },
      newRating: "★ Новое",
      perNight: "/ночь",
      onlyInMap: "Только в области карты",
      refresh: "⟳ Обновить",
      showMap: "Карта",
      showList: "Список",
      close: "Закрыть (Esc)",
      cancel: "Отмена",
      prevPhoto: "Предыдущее фото",
      nextPhoto: "Следующее фото",
      guests: (n) => `${n} ${pluralRu(n, "гость", "гостя", "гостей")}`,
      justNow: "только что",
      minutesAgo: (n) => `${n} мин назад`,
      hoursAgo: (n) => `${n} ч назад`,
      daysAgo: (n) => `${n} дн назад`,
      collected: (total) => `Собрано ${total}`,
      ofExpected: (expected) => ` из ~${expected}`,
      showing: (shown) => ` · показано ${shown}`,
      loadingFirst: "Загружаю первую страницу…",
      progress: (p, of) => `Диапазонов: ${p.ranges} · Страниц: ${p.pagesDone} / ~${p.pagesPlanned} · Объявлений: ${p.listings}${of}`,
      cancelled: "сбор отменён",
      blocked: "Airbnb начал блокировать запросы",
      limit: "достигнут предел числа запросов",
      failedPages: (n) => `не загрузилось страниц: ${n}`,
      saturated: (n) => `переполненных ценовых диапазонов: ${n} (часть объявлений недоступна)`,
      partial: (reasons) => `Неполный сбор: ${reasons}`,
      collectFailed: (message) => `Не удалось собрать выдачу: ${message}`,
      mapArea: "область карты",
      filters: {
        rating: "Рейтинг",
        reviews: "Отзывов",
        any: "Любой",
        hideViewed: "Скрыть просмотренные",
        reset: "Сбросить",
        empty: "Под эти фильтры ничего не подходит",
        emptyArea: "В этой области ничего не собрано"
      },
      viewed: "Просмотрено",
      mapHint: "Здесь только то, что собрано по вашему поиску на Airbnb. Чтобы искать в другом месте, передвиньте карту на Airbnb и нажмите «↕ Сортировать все» ещё раз.",
      dismiss: "Закрыть",
      support: "Поддержать разработчика",
      popup: {
        title: "Сортировка по цене для Airbnb",
        howTo: "Откройте поиск жилья на Airbnb и нажмите «↕ Сортировать все».",
        language: "Язык",
        languages: { auto: "Авто", en: "English", ru: "Русский" },
        github: "GitHub",
        report: "Сообщить о проблеме",
        howItWorks: "Как это работает",
        rate: "Оценить",
        viewedCount: (n) => `Просмотрено: ${n}`,
        clearViewed: "Очистить"
      },
      welcome: {
        steps: [
          "Откройте поиск жилья на Airbnb и задайте даты, гостей, фильтры и область карты как обычно — соберётся именно эта выдача.",
          "Нажмите кнопку в правом нижнем углу страницы:",
          "Сортируйте по цене, фильтруйте по рейтингу и отзывам, смотрите на карте."
        ],
        open: "Открыть Airbnb",
        pin: "Иконку расширения удобно закрепить: значок-пазл на панели Chrome, затем булавка. Клик по иконке открывает настройки.",
        free: "Бесплатно, без рекламы. Ничего не покидает ваш браузер.",
        privacy: "Политика конфиденциальности"
      }
    }
  };
  function pluralRu(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }
  var locale = "en";
  function setLocale(next) {
    locale = Object.hasOwn(DICTS, next) ? next : "en";
  }
  function getLocale() {
    return locale;
  }
  function t() {
    return DICTS[locale];
  }
  function detectLocale({ pageLang = "", browserLang = "" } = {}) {
    const isRu = (s) => /^ru\b/i.test(s ?? "");
    if (isRu(pageLang)) return "ru";
    if (pageLang) return "en";
    return isRu(browserLang) ? "ru" : "en";
  }

  // src/viewer/logic.js
  var SORTS = {
    "price-desc": { get label() {
      return t().sort["price-desc"];
    }, key: (l) => l.price.amount, dir: -1 },
    "price-asc": { get label() {
      return t().sort["price-asc"];
    }, key: (l) => l.price.amount, dir: 1 },
    "rating-desc": { get label() {
      return t().sort["rating-desc"];
    }, key: (l) => l.rating, dir: -1, then: (l) => l.reviews },
    "reviews-desc": { get label() {
      return t().sort["reviews-desc"];
    }, key: (l) => l.reviews, dir: -1, then: (l) => l.rating }
  };
  var DEFAULT_SORT = "price-desc";
  var RATING_STEPS = [0, 4.5, 4.7, 4.8, 4.9];
  var REVIEW_STEPS = [0, 5, 20, 50, 100];
  var NO_FILTERS = Object.freeze({ minRating: 0, minReviews: 0, hideViewed: false });
  function sanitizeFilters(raw) {
    return {
      minRating: RATING_STEPS.includes(raw?.minRating) ? raw.minRating : 0,
      minReviews: REVIEW_STEPS.includes(raw?.minReviews) ? raw.minReviews : 0,
      hideViewed: raw?.hideViewed === true
    };
  }
  function hasActiveFilters({ minRating, minReviews, hideViewed }) {
    return minRating > 0 || minReviews > 0 || hideViewed === true;
  }
  function passesFilters(listing, { minRating, minReviews, hideViewed }, isViewed = () => false) {
    if (minRating > 0 && !(listing.rating != null && listing.rating >= minRating)) return false;
    if (minReviews > 0 && !(listing.reviews != null && listing.reviews >= minReviews)) return false;
    return !(hideViewed && isViewed(listing.id));
  }
  function filterListings(listings, filters, isViewed) {
    return listings.filter((listing) => passesFilters(listing, filters, isViewed));
  }
  function thresholdCounts(listings, filters, key, steps, isViewed) {
    return steps.map((step) => filterListings(listings, { ...filters, [key]: step }, isViewed).length);
  }
  var byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  function sortListings(listings, sortId) {
    const { key, dir, then } = Object.hasOwn(SORTS, sortId) ? SORTS[sortId] : SORTS[DEFAULT_SORT];
    const tie = then ? (a, b) => (then(b) ?? -1) - (then(a) ?? -1) : () => 0;
    return [...listings].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka == null || kb == null) {
        if (ka == null && kb == null) return byId(a, b);
        return ka == null ? 1 : -1;
      }
      return (ka - kb) * dir || tie(a, b) || byId(a, b);
    });
  }
  function filterByBounds(listings, { south, west, north, east }) {
    return listings.filter((l) => l.lat != null && l.lng != null && l.lat >= south && l.lat <= north && l.lng >= west && l.lng <= east);
  }
  var formatters = /* @__PURE__ */ new Map();
  function formatter(kind) {
    const key = `${kind}:${t().numberLocale}`;
    if (!formatters.has(key)) {
      formatters.set(key, kind === "number" ? new Intl.NumberFormat(t().numberLocale, { maximumFractionDigits: 0 }) : new Intl.DateTimeFormat(t().dateLocale, { day: "numeric", month: "short", timeZone: "UTC" }));
    }
    return formatters.get(key);
  }
  var count = (n) => formatter("number").format(n);
  var formatCount = count;
  function formatMoney(amount, currency) {
    if (amount == null) return "—";
    const gap = /\p{L}$/u.test(currency ?? "") ? " " : "";
    return `${currency ?? ""}${gap}${count(amount)}`;
  }
  function formatRating({ rating, reviews }) {
    if (rating == null) return t().newRating;
    const value = Number.isInteger(rating) ? rating.toFixed(1) : String(rating);
    return reviews != null ? `★ ${value} (${reviews})` : `★ ${value}`;
  }
  function photoUrl(url, width = 720) {
    if (!url) return "";
    try {
      const result = new URL(url);
      if (!result.searchParams.has("im_w")) result.searchParams.set("im_w", String(width));
      return result.toString();
    } catch {
      return url;
    }
  }
  var MAP_BOUNDS = ["ne_lat", "ne_lng", "sw_lat", "sw_lng"];
  function describeSearch({ placeLabel: placeLabel2, searchUrl }) {
    const params = new URL(searchUrl).searchParams;
    const parts = [placeLabel2];
    const from = new Date(params.get("checkin") ?? "");
    const to = new Date(params.get("checkout") ?? "");
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      parts.push(`${formatter("date").format(from)} – ${formatter("date").format(to)}`);
    }
    const guests = Number(params.get("adults") || 0) + Number(params.get("children") || 0);
    if (guests) parts.push(t().guests(guests));
    if (MAP_BOUNDS.every((key) => params.has(key))) parts.push(t().mapArea);
    return parts.filter(Boolean).join(" · ");
  }
  function formatAge(iso, now = Date.now()) {
    const minutes = Math.floor((now - Date.parse(iso)) / 6e4);
    if (minutes < 1) return t().justNow;
    if (minutes < 60) return t().minutesAgo(minutes);
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t().hoursAgo(hours);
    return t().daysAgo(Math.floor(hours / 24));
  }
  function summaryText(meta, total, shown = null, { fromCache = false, now = Date.now() } = {}) {
    let text = t().collected(count(total));
    if (meta.expectedTotal) text += t().ofExpected(count(meta.expectedTotal));
    if (shown != null) text += t().showing(count(shown));
    if (fromCache) text += ` · ${formatAge(meta.collectedAt, now)}`;
    return text;
  }
  function partialReasons(meta) {
    const reasons = [];
    if (meta.stopReason === "cancelled") reasons.push(t().cancelled);
    if (meta.stopReason === "blocked") reasons.push(t().blocked);
    if (meta.stopReason === "limit") reasons.push(t().limit);
    if (meta.failedPages) reasons.push(t().failedPages(meta.failedPages));
    if (meta.saturatedRanges) reasons.push(t().saturated(meta.saturatedRanges));
    return reasons;
  }
  function progressText(p) {
    if (!p) return t().loadingFirst;
    const of = p.expectedTotal ? t().ofExpected(count(p.expectedTotal)) : "";
    return t().progress({ ...p, listings: count(p.listings) }, of);
  }

  // src/settings.js
  var SETTINGS_KEY = "settings";
  var LANGUAGES = ["auto", "en", "ru"];
  var DEFAULT_SETTINGS = Object.freeze({
    language: "auto",
    sort: DEFAULT_SORT,
    ...NO_FILTERS,
    // minRating, minReviews, hideViewed
    mapHintSeen: false
  });
  function normalizeSettings(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    return {
      language: LANGUAGES.includes(value.language) ? value.language : DEFAULT_SETTINGS.language,
      sort: typeof value.sort === "string" && Object.hasOwn(SORTS, value.sort) ? value.sort : DEFAULT_SETTINGS.sort,
      ...sanitizeFilters(value),
      mapHintSeen: value.mapHintSeen === true
    };
  }
  async function loadSettings(storage) {
    try {
      return normalizeSettings(await storage.get(SETTINGS_KEY, null));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  async function saveSettings(storage, patch) {
    const next = normalizeSettings({ ...await loadSettings(storage), ...patch });
    try {
      await storage.set(SETTINGS_KEY, next);
    } catch (e) {
      console.warn("[airbnb-sorter] could not save the settings", e);
    }
    return next;
  }
  function resolveLocale(language, detect) {
    return language === "auto" ? detect() : language;
  }

  // src/viewed.js
  var VIEWED_KEY = "viewed";
  var VIEWED_LIMIT = 5e3;
  var isListingId = (id) => typeof id === "string" && /^\d+$/.test(id);
  function normalizeViewed(raw) {
    const viewed = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return viewed;
    for (const [id, time] of Object.entries(raw)) {
      if (isListingId(id) && typeof time === "number" && Number.isFinite(time)) viewed[id] = time;
    }
    return viewed;
  }
  async function loadViewed(storage) {
    try {
      return normalizeViewed(await storage.get(VIEWED_KEY, null));
    } catch {
      return {};
    }
  }
  async function markViewed(storage, id, now = Date.now()) {
    const viewed = await loadViewed(storage);
    if (!isListingId(id)) return viewed;
    viewed[id] = now;
    const ids = Object.keys(viewed);
    if (ids.length > VIEWED_LIMIT) {
      const others = ids.filter((other) => other !== id).sort((a, b) => viewed[a] - viewed[b]);
      for (const oldest of others.slice(0, ids.length - VIEWED_LIMIT)) delete viewed[oldest];
    }
    try {
      await storage.set(VIEWED_KEY, viewed);
    } catch (e) {
      console.warn("[airbnb-sorter] could not save the viewed listings", e);
    }
    return viewed;
  }
  function listingIdFromPath(pathname) {
    const m = /^\/(?:rooms\/(?:plus\/)?|luxury\/listing\/)(\d+)(?:\/|$)/.exec(pathname ?? "");
    return m ? m[1] : null;
  }

  // src/guard.js
  var ATTRIBUTE = "data-airbnb-sorter";
  function isPageClaimed(doc) {
    return doc.documentElement.hasAttribute(ATTRIBUTE);
  }
  function claimPage(doc) {
    if (isPageClaimed(doc)) return false;
    doc.documentElement.setAttribute(ATTRIBUTE, "");
    return true;
  }

  // src/config.js
  var STORE_URL = "https://chromewebstore.google.com/detail/price-sorter-for-airbnb/fpjgmgmmkdefjjdpplcdppkajpojdnkg";
  var REVIEWS_URL = `${STORE_URL}/reviews`;
  var SUPPORT_LINKS = [
    { label: "PayPal", url: "https://paypal.me/Maksims1001" }
  ];

  // src/launcher.js
  var STYLE = [
    "all:initial",
    "position:fixed",
    "right:24px",
    "bottom:24px",
    "z-index:2147483646",
    "padding:12px 18px",
    "border-radius:24px",
    "background:#222",
    "color:#fff",
    "cursor:pointer",
    'font:600 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
    "box-shadow:0 4px 12px rgba(0,0,0,.25)"
  ].join(";");
  function createLauncher(onClick, { onUrlChange } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t().launcher;
    btn.setAttribute("style", STYLE);
    btn.addEventListener("click", () => {
      btn.blur();
      onClick();
    });
    document.body.append(btn);
    let lastHref = null;
    const sync = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      btn.style.display = isHomesSearchPath(location.pathname) ? "block" : "none";
      onUrlChange?.(location.pathname);
    };
    sync();
    setInterval(sync, 500);
    return {
      refreshLabel() {
        btn.textContent = t().launcher;
      }
    };
  }

  // src/viewer/dom.js
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, className) {
    const node = el("button", className, text);
    node.type = "button";
    return node;
  }

  // src/viewer/card.js
  var MAX_DOTS = 5;
  function createCarousel(listing) {
    const box = el("div", "abs-photo");
    const img = el("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    if (listing.photos[0]) img.src = photoUrl(listing.photos[0]);
    box.append(img);
    if (listing.badges[0]) box.append(el("span", "abs-badge", listing.badges[0]));
    const count2 = listing.photos.length;
    if (count2 > 1) {
      const dots = el("div", "abs-dots");
      const dotCount = Math.min(count2, MAX_DOTS);
      for (let i = 0; i < dotCount; i++) dots.append(el("span", "abs-dot"));
      let index = 0;
      const show = (target) => {
        index = (target + count2) % count2;
        img.src = photoUrl(listing.photos[index]);
        const active = Math.round(index / (count2 - 1) * (dotCount - 1));
        [...dots.children].forEach((dot, i) => dot.classList.toggle("abs-dot--on", i === active));
      };
      const prev = button("‹", "abs-nav abs-nav--prev");
      const next = button("›", "abs-nav abs-nav--next");
      prev.setAttribute("aria-label", t().prevPhoto);
      next.setAttribute("aria-label", t().nextPhoto);
      for (const [btn, step] of [[prev, -1], [next, 1]]) {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          show(index + step);
        });
        btn.addEventListener("auxclick", (e) => e.preventDefault());
      }
      box.append(prev, next, dots);
      show(0);
    }
    return box;
  }
  function createBody(listing) {
    const body = el("div", "abs-body");
    const top = el("div", "abs-row");
    top.append(el("span", "abs-title", listing.title ?? ""), el("span", "abs-rating", formatRating(listing)));
    body.append(top);
    if (listing.name) body.append(el("div", "abs-muted abs-ellipsis", listing.name));
    if (listing.details.length) body.append(el("div", "abs-muted abs-ellipsis", listing.details.join(" · ")));
    const { amount, currency, qualifier, original } = listing.price;
    const price = el("div", "abs-price");
    if (original != null) price.append(el("s", "abs-muted", formatMoney(original, currency)));
    price.append(el("b", null, formatMoney(amount, currency)));
    if (qualifier) price.append(` ${qualifier}`);
    if (listing.pricePerNight != null) {
      price.append(el("span", "abs-muted", ` · ≈ ${formatMoney(listing.pricePerNight, currency)}${t().perNight}`));
    }
    body.append(price);
    return body;
  }
  function createCard(listing, { compact = false, viewed = false } = {}) {
    const card = el("a", compact ? "abs-card abs-card--compact" : "abs-card");
    card.href = listing.url;
    card.target = "_blank";
    card.rel = "noopener";
    card.dataset.id = listing.id;
    card.append(createCarousel(listing), createBody(listing));
    if (viewed) setCardViewed(card, true);
    return card;
  }
  function setCardViewed(card, viewed) {
    card.classList.toggle("abs-card--viewed", viewed);
    const photo = card.querySelector(".abs-photo");
    const mark = photo.querySelector(".abs-viewed");
    if (viewed && !mark) photo.append(el("span", "abs-viewed", `✓ ${t().viewed}`));
    if (!viewed && mark) mark.remove();
  }

  // src/viewer/list.js
  var CHUNK = 60;
  function createList({ onHover, isViewed = () => false }) {
    const root = el("div", "abs-list");
    const grid = el("div", "abs-grid");
    const sentinel = el("div", "abs-sentinel");
    root.append(grid, sentinel);
    let items = [];
    let rendered = 0;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) renderMore();
    }, { root, rootMargin: "800px 0px" });
    function renderMore() {
      if (rendered >= items.length) return;
      const fragment = document.createDocumentFragment();
      for (const listing of items.slice(rendered, rendered + CHUNK)) fragment.append(createCard(listing, { viewed: isViewed(listing.id) }));
      rendered = Math.min(items.length, rendered + CHUNK);
      grid.append(fragment);
      observer.unobserve(sentinel);
      observer.observe(sentinel);
    }
    let hovered = null;
    const hover = (id) => {
      if (id === hovered) return;
      hovered = id;
      onHover(id);
    };
    grid.addEventListener("mouseover", (e) => hover(e.target.closest(".abs-card")?.dataset.id ?? null));
    grid.addEventListener("mouseleave", () => hover(null));
    return {
      el: root,
      set(listings) {
        items = listings;
        rendered = 0;
        hovered = null;
        grid.replaceChildren();
        root.scrollTop = 0;
        renderMore();
      },
      highlight(id) {
        grid.querySelector(".abs-card--hl")?.classList.remove("abs-card--hl");
        if (id) grid.querySelector(`.abs-card[data-id="${id}"]`)?.classList.add("abs-card--hl");
      },
      // Re-reads the viewed state of the rendered cards; cards rendered later read it when they are created.
      refreshViewed() {
        for (const card of grid.children) setCardViewed(card, isViewed(card.dataset.id));
      },
      destroy() {
        observer.disconnect();
      }
    };
  }

  // src/viewer/map.js
  var DENSE_LIMIT = 150;
  var hasPoint = (listing) => listing.lat != null && listing.lng != null;
  function createMap(container, { L, onMarkerHover, onMoveEnd, onUserMove = () => {
  }, isViewed = () => false }) {
    const map = L.map(container, { zoomControl: true }).setView([0, 0], 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    const markers = /* @__PURE__ */ new Map();
    let highlighted = null;
    function updateDensity() {
      const bounds = map.getBounds();
      let visible = 0;
      for (const marker of markers.values()) if (bounds.contains(marker.getLatLng())) visible++;
      container.classList.toggle("abs-map--dense", visible > DENSE_LIMIT);
    }
    map.on("moveend", () => {
      updateDensity();
      onMoveEnd();
    });
    let frame = null;
    let pendingFit = false;
    let fitting = false;
    function fitFrame() {
      if (!frame) return;
      const size = map.getSize();
      if (!size.x || !size.y) {
        pendingFit = true;
        return;
      }
      pendingFit = false;
      fitting = true;
      try {
        map.fitBounds(frame, { padding: [24, 24], maxZoom: 16, animate: false });
      } finally {
        fitting = false;
      }
    }
    map.on("dragstart", () => onUserMove());
    map.on("zoomstart", () => {
      if (!fitting) onUserMove();
    });
    container.addEventListener("keydown", (e) => {
      if (/^Arrow/.test(e.key) || ["+", "-", "="].includes(e.key)) onUserMove();
    });
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
      if (pendingFit) fitFrame();
    });
    resizeObserver.observe(container);
    return {
      // Replaces the pins. The view stays where it is: fit() is what moves it.
      setListings(listings) {
        layer.clearLayers();
        markers.clear();
        highlighted = null;
        for (const listing of listings) {
          if (!hasPoint(listing)) continue;
          const label = el("span", "abs-pin-label", formatMoney(listing.price.amount, listing.price.currency));
          const marker = L.marker([listing.lat, listing.lng], {
            icon: L.divIcon({ className: isViewed(listing.id) ? "abs-pin abs-pin--viewed" : "abs-pin", html: label, iconSize: null }),
            riseOnHover: true,
            keyboard: false
          });
          marker.on("mouseover", () => onMarkerHover(listing.id));
          marker.on("mouseout", () => onMarkerHover(null));
          marker.bindPopup(() => createCard(listing, { compact: true, viewed: isViewed(listing.id) }), {
            className: "abs-popup",
            closeButton: false,
            minWidth: 260,
            maxWidth: 260,
            offset: [0, -12]
          });
          marker.addTo(layer);
          markers.set(listing.id, marker);
        }
        updateDensity();
      },
      // Frames these listings — all collected ones, so the frame does not depend on the filters.
      fit(listings) {
        const points = listings.filter(hasPoint).map((listing) => [listing.lat, listing.lng]);
        if (points.length === 0) return;
        frame = L.latLngBounds(points);
        fitFrame();
        updateDensity();
      },
      // Back to the last frame (the narrow-screen switch to the map uses it).
      fitAll: fitFrame,
      // Re-reads the viewed state of the pins on the map and of the open popup's card.
      refreshViewed() {
        for (const [id, marker] of markers) marker.getElement()?.classList.toggle("abs-pin--viewed", isViewed(id));
        const card = container.querySelector(".leaflet-popup a.abs-card");
        if (card) setCardViewed(card, isViewed(card.dataset.id));
      },
      highlight(id) {
        const previous = highlighted && markers.get(highlighted);
        if (previous) {
          previous.getElement()?.classList.remove("abs-pin--hl");
          previous.setZIndexOffset(0);
        }
        highlighted = id;
        const marker = id && markers.get(id);
        if (marker) {
          marker.getElement()?.classList.add("abs-pin--hl");
          marker.setZIndexOffset(1e4);
        }
      },
      // A note at the bottom of the map with a close button.
      showHint(text, closeLabel, onDismiss) {
        const control = L.control({ position: "bottomleft" });
        control.onAdd = () => {
          const box = el("div", "abs-map-hint");
          const close = button("×", "abs-map-hint-close");
          close.title = closeLabel;
          close.setAttribute("aria-label", closeLabel);
          close.addEventListener("click", () => {
            control.remove();
            onDismiss();
          });
          box.append(el("span", null, text), close);
          L.DomEvent.disableClickPropagation(box);
          L.DomEvent.disableScrollPropagation(box);
          return box;
        };
        control.addTo(map);
      },
      getBounds() {
        const b = map.getBounds();
        return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
      },
      invalidateSize() {
        map.invalidateSize();
      },
      // Leaflet listens on window (resize) until the map is removed.
      remove() {
        resizeObserver.disconnect();
        map.remove();
      }
    };
  }

  // src/viewer/toolbar.js
  function createToolbar({ sortId, onSort, onFilter, onAreaToggle, onReset }) {
    const sortSelect = el("select", "abs-select abs-select--small");
    for (const [id, { label }] of Object.entries(SORTS)) {
      const option = el("option", null, label);
      option.value = id;
      sortSelect.append(option);
    }
    sortSelect.value = sortId;
    sortSelect.addEventListener("change", () => onSort(sortSelect.value));
    const menus = [];
    function closeMenus() {
      let closed = false;
      for (const { pill, box } of menus) {
        if (box.hidden) continue;
        box.hidden = true;
        pill.setAttribute("aria-expanded", "false");
        closed = true;
      }
      return closed;
    }
    function dropdown(key, title, steps, format) {
      const pill = button("", "abs-pill");
      pill.setAttribute("aria-haspopup", "true");
      pill.setAttribute("aria-expanded", "false");
      const box = el("div", "abs-menu");
      box.hidden = true;
      menus.push({ pill, box });
      pill.addEventListener("click", () => {
        const open = box.hidden;
        closeMenus();
        box.hidden = !open;
        pill.setAttribute("aria-expanded", String(open));
      });
      const wrap = el("div", "abs-dd");
      wrap.append(pill, box);
      return {
        el: wrap,
        draw(current, counts) {
          pill.textContent = current === 0 ? `${title} ▾` : `${title}: ${format(current)} ▾`;
          pill.classList.toggle("abs-pill--on", current !== 0);
          box.replaceChildren(...steps.map((step, i) => {
            const option = button("", "abs-opt");
            option.setAttribute("aria-pressed", String(step === current));
            option.append(el("span", null, step === 0 ? t().filters.any : format(step)), el("span", "abs-count", formatCount(counts[i])));
            option.addEventListener("click", () => {
              closeMenus();
              onFilter({ [key]: step });
              pill.focus();
            });
            return option;
          }));
        }
      };
    }
    function toggle(text, onChange) {
      const box = el("input");
      box.type = "checkbox";
      box.addEventListener("change", () => onChange(box.checked));
      const label = el("label", "abs-toggle");
      label.append(box, text);
      return { box, label };
    }
    const rating = dropdown("minRating", `★ ${t().filters.rating}`, RATING_STEPS, (step) => `${step.toFixed(1)}+`);
    const reviews = dropdown("minReviews", t().filters.reviews, REVIEW_STEPS, (step) => `${step}+`);
    const area = toggle(t().onlyInMap, onAreaToggle);
    const hide = toggle(t().filters.hideViewed, (checked) => onFilter({ hideViewed: checked }));
    const resetBtn = button(t().filters.reset, "abs-btn abs-btn--small abs-reset");
    resetBtn.addEventListener("click", () => onReset());
    const root = el("div", "abs-filters");
    root.append(sortSelect, el("span", "abs-sep"), rating.el, reviews.el, el("span", "abs-sep"), area.label, hide.label, resetBtn);
    return {
      el: root,
      closeMenus,
      // filters: { minRating, minReviews, hideViewed }; ratingCounts / reviewCounts: one number per step.
      draw({ filters, onlyInMap, ratingCounts, reviewCounts }) {
        rating.draw(filters.minRating, ratingCounts);
        reviews.draw(filters.minReviews, reviewCounts);
        area.box.checked = onlyInMap;
        hide.box.checked = filters.hideViewed;
        resetBtn.hidden = !(hasActiveFilters(filters) || onlyInMap);
      }
    };
  }

  // src/viewer/overlay.js
  function createOverlay({
    L,
    css,
    initialSort,
    initialFilters,
    viewedIds = [],
    showMapHint = false,
    supportUrl,
    onSortChange,
    onFiltersChange,
    onListingOpen,
    onMapHintDismiss,
    onRefresh,
    onCancel,
    onClose
  }) {
    const host = document.createElement("div");
    host.id = "airbnb-sorter";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:none";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    const startSort = Object.hasOwn(SORTS, initialSort ?? "") ? initialSort : DEFAULT_SORT;
    const state = {
      listings: [],
      meta: null,
      fromCache: false,
      sortId: startSort,
      onlyInMap: false,
      filters: sanitizeFilters(initialFilters)
    };
    let viewed = new Set(viewedIds);
    let hidden = new Set(viewed);
    const isViewed = (id) => viewed.has(id);
    const isHidden = (id) => hidden.has(id);
    const sub = el("div", "abs-sub");
    const summary = el("span");
    const warn = el("span", "abs-warn", "⚠");
    warn.hidden = true;
    const summaryLine = el("div", "abs-summary");
    summaryLine.append(summary, warn);
    const info = el("div", "abs-info");
    info.append(sub, summaryLine);
    const refreshBtn = button(t().refresh, "abs-btn");
    const viewBtn = button(t().showMap, "abs-btn abs-only-narrow");
    const closeBtn = button("×", "abs-close");
    closeBtn.title = t().close;
    const controls = el("div", "abs-controls");
    controls.append(refreshBtn, viewBtn);
    if (supportUrl) {
      const support = el("a", "abs-support", "♥");
      support.href = supportUrl;
      support.target = "_blank";
      support.rel = "noopener";
      support.title = t().support;
      support.setAttribute("aria-label", t().support);
      controls.append(support);
    }
    controls.append(closeBtn);
    const head = el("header", "abs-head");
    head.append(info, controls);
    const toolbar = createToolbar({
      sortId: startSort,
      onSort: (sortId) => {
        state.sortId = sortId;
        onSortChange?.(sortId);
        render();
      },
      onFilter: (patch) => setFilters({ ...state.filters, ...patch }),
      onAreaToggle: (checked) => {
        state.onlyInMap = checked;
        render();
      },
      onReset: () => resetFilters()
    });
    const progressLabel = el("div");
    const cancelBtn = button(t().cancel, "abs-btn");
    const progress = el("div", "abs-progress");
    progress.append(el("div", "abs-spinner"), progressLabel, cancelBtn);
    const errorBox = el("div", "abs-error");
    let map = null;
    const list3 = createList({ onHover: (id) => map?.highlight(id), isViewed });
    list3.el.tabIndex = -1;
    const emptyText = el("p", "abs-empty-text");
    const emptyHint = el("p", "abs-empty-hint");
    const emptyReset = button(t().filters.reset, "abs-btn");
    const emptyBox = el("div", "abs-empty");
    emptyBox.append(emptyText, emptyHint, emptyReset);
    emptyBox.hidden = true;
    list3.el.prepend(emptyBox);
    const mapBox = el("div", "abs-map");
    const main = el("main", "abs-main");
    main.append(list3.el, mapBox);
    const root = el("div", "abs-root");
    root.tabIndex = -1;
    root.append(head, toolbar.el, progress, errorBox, main);
    shadow.append(style, root);
    document.body.append(host);
    let savedOverflow = "";
    function setMode(mode) {
      progress.hidden = mode !== "progress";
      errorBox.hidden = mode !== "error";
      main.hidden = mode !== "results";
      toolbar.el.hidden = mode !== "results";
      if (mode !== "results") toolbar.closeMenus();
      refreshBtn.disabled = mode === "progress";
      summaryLine.hidden = mode !== "results";
    }
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
      list3.el.focus({ preventScroll: true });
    }
    let shownKey = "";
    function render() {
      const filtered = filterListings(state.listings, state.filters, isHidden);
      if (map && mapStale) {
        mapStale = false;
        map.setListings(filtered);
      }
      let shown = filtered;
      const bounds = state.onlyInMap && map && mapBox.clientWidth > 0 ? map.getBounds() : null;
      if (bounds) shown = filterByBounds(shown, bounds);
      const sorted = sortListings(shown, state.sortId);
      const key = sorted.map((l) => l.id).join(",");
      if (key !== shownKey) {
        shownKey = key;
        list3.set(sorted);
      }
      emptyBox.hidden = sorted.length > 0 || state.listings.length === 0;
      if (!emptyBox.hidden) {
        const nothingHere = bounds !== null && filterByBounds(state.listings, bounds).length === 0;
        emptyText.textContent = nothingHere ? t().filters.emptyArea : t().filters.empty;
        emptyHint.textContent = nothingHere ? t().mapHint : "";
        emptyHint.hidden = !nothingHere;
      }
      const narrowed = hasActiveFilters(state.filters) || state.onlyInMap;
      summary.textContent = summaryText(state.meta, state.listings.length, narrowed ? shown.length : null, { fromCache: state.fromCache });
      const reasons = state.meta.partial ? partialReasons(state.meta) : [];
      warn.hidden = reasons.length === 0;
      warn.title = t().partial(reasons.join("; "));
      toolbar.draw({
        filters: state.filters,
        onlyInMap: state.onlyInMap,
        ratingCounts: thresholdCounts(state.listings, state.filters, "minRating", RATING_STEPS, isViewed),
        reviewCounts: thresholdCounts(state.listings, state.filters, "minReviews", REVIEW_STEPS, isViewed)
      });
    }
    function refreshViewed() {
      list3.refreshViewed();
      map?.refreshViewed();
    }
    let hintPending = showMapHint;
    function onUserMove() {
      if (!hintPending) return;
      hintPending = false;
      map.showHint(t().mapHint, t().dismiss, () => onMapHintDismiss?.());
    }
    function onRootClick(e) {
      if (!e.target.closest(".abs-dd")) toolbar.closeMenus();
      if (e.type === "auxclick" && e.button !== 1) return;
      if (e.target.closest(".abs-nav")) return;
      const card = e.target.closest("a.abs-card");
      if (!card) return;
      viewed.add(card.dataset.id);
      refreshViewed();
      onListingOpen?.(card.dataset.id);
    }
    root.addEventListener("click", onRootClick, true);
    root.addEventListener("auxclick", onRootClick, true);
    emptyReset.addEventListener("click", () => resetFilters());
    refreshBtn.addEventListener("click", () => onRefresh());
    cancelBtn.addEventListener("click", () => onCancel());
    closeBtn.addEventListener("click", () => api.close());
    viewBtn.addEventListener("click", () => {
      const showMap = main.classList.toggle("abs-main--map");
      viewBtn.textContent = showMap ? t().showList : t().showMap;
      if (showMap && map) {
        map.invalidateSize();
        map.fitAll();
      }
      if (state.meta) render();
    });
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (toolbar.closeMenus()) return;
      api.close();
    };
    const api = {
      isOpen() {
        return host.style.display !== "none";
      },
      open() {
        if (api.isOpen()) return;
        host.style.display = "";
        savedOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
        window.addEventListener("keydown", onKey, true);
        root.focus({ preventScroll: true });
      },
      close() {
        if (!api.isOpen()) return;
        host.style.display = "none";
        document.documentElement.style.overflow = savedOverflow;
        window.removeEventListener("keydown", onKey, true);
        onClose();
      },
      // Removes the layer from the page; the instance must not be used afterwards.
      destroy() {
        api.close();
        map?.remove();
        map = null;
        list3.destroy();
        host.remove();
      },
      // ids of every listing the user has opened; repaints the marks without re-rendering the list.
      setViewed(ids) {
        viewed = new Set(ids);
        refreshViewed();
      },
      // title: the search being collected (the header may still show the previous one).
      showProgress(p, title) {
        setMode("progress");
        if (title !== void 0) sub.textContent = title;
        progressLabel.textContent = progressText(p);
      },
      showError(message) {
        setMode("error");
        errorBox.textContent = t().collectFailed(message);
      },
      showResults({ listings, meta }, { fromCache = false } = {}) {
        Object.assign(state, { listings, meta, fromCache });
        shownKey = "";
        hidden = new Set(viewed);
        mapStale = true;
        sub.textContent = describeSearch(meta);
        setMode("results");
        if (api.isOpen()) list3.el.focus({ preventScroll: true });
        map ?? (map = createMap(mapBox, {
          L,
          isViewed,
          onMarkerHover: (id) => list3.highlight(id),
          onMoveEnd: () => {
            if (state.onlyInMap) render();
          },
          onUserMove
        }));
        map.invalidateSize();
        map.fit(listings);
        render();
      }
    };
    return api;
  }

  // src/viewer/styles.css
  var styles_default = ':host { all: initial; position: fixed; inset: 0; z-index: 2147483647; }\n[hidden] { display: none !important; }\n\n.abs-root {\n  position: absolute; inset: 0; display: flex; flex-direction: column;\n  background: #fff; color: #222;\n  font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\n}\n.abs-root *, .abs-root *::before, .abs-root *::after { box-sizing: border-box; }\n.abs-root:focus, .abs-list:focus { outline: none; } /* programmatic focus targets, not controls */\n\n/* Header */\n.abs-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 12px 24px; border-bottom: 1px solid #ebebeb; }\n.abs-sub { font-size: 16px; font-weight: 600; }\n.abs-summary { display: flex; align-items: center; gap: 6px; color: #6a6a6a; font-size: 13px; }\n.abs-warn { color: #c13515; cursor: help; }\n.abs-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }\n.abs-select, .abs-btn { height: 36px; padding: 0 14px; border: 1px solid #b0b0b0; border-radius: 18px; background: #fff; color: inherit; font: inherit; cursor: pointer; }\n.abs-select:hover:not(:disabled), .abs-btn:hover:not(:disabled) { border-color: #222; }\n.abs-select:disabled, .abs-btn:disabled { opacity: .5; cursor: default; }\n.abs-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }\n.abs-close { width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: inherit; font-size: 26px; line-height: 1; cursor: pointer; }\n.abs-close:hover { background: #f2f2f2; }\n.abs-support { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; color: #e0245e; font-size: 18px; line-height: 1; text-decoration: none; }\n.abs-support:hover { background: #fdecef; }\n\n/* Toolbar: sort, filters, toggles */\n.abs-filters { position: relative; z-index: 1100; display: flex; align-items: center; gap: 10px 18px; flex-wrap: wrap; padding: 10px 24px; border-bottom: 1px solid #ebebeb; }\n.abs-select--small { height: 32px; padding: 0 10px; font-size: 13px; }\n.abs-sep { width: 1px; height: 22px; background: #dcdcdc; }\n.abs-filters .abs-toggle { font-size: 13px; }\n.abs-btn--small { height: 32px; font-size: 13px; }\n.abs-reset { margin-left: auto; }\n.abs-dd { position: relative; }\n.abs-pill { display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border: 1px solid #b0b0b0; border-radius: 16px; background: #fff; color: inherit; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }\n.abs-pill:hover { border-color: #222; }\n.abs-pill--on { border-color: #222; background: #222; color: #fff; }\n.abs-menu { position: absolute; top: 38px; left: 0; display: flex; flex-direction: column; gap: 2px; min-width: 200px; padding: 6px; border: 1px solid #ddd; border-radius: 12px; background: #fff; box-shadow: 0 6px 20px rgba(0, 0, 0, .16); }\n.abs-opt { display: flex; align-items: center; justify-content: space-between; gap: 24px; height: 34px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }\n.abs-opt:hover { background: #f2f2f2; }\n.abs-opt[aria-pressed="true"] { background: #222; color: #fff; }\n.abs-count { color: #8a8a8a; font-size: 12px; }\n.abs-opt[aria-pressed="true"] .abs-count { color: #cfcfcf; }\n\n/* Nothing to show */\n.abs-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 460px; margin: 48px auto; text-align: center; }\n.abs-empty p { margin: 0; }\n.abs-empty-text { font-size: 16px; font-weight: 600; }\n.abs-empty-hint { color: #6a6a6a; }\n\n/* Viewed listings */\n.abs-card--viewed .abs-photo img { opacity: .5; filter: saturate(.55); }\n.abs-card--viewed .abs-title, .abs-card--viewed .abs-price b { color: #6a6a6a; }\n.abs-viewed { position: absolute; top: 12px; right: 12px; padding: 4px 10px; border-radius: 12px; background: rgba(34, 34, 34, .8); color: #fff; font-size: 12px; font-weight: 600; }\n.abs-pin--viewed .abs-pin-label { background: #e2e2e2; color: #717171; }\n.abs-map--dense .abs-pin--viewed .abs-pin-label { background: #9b9b9b; }\n\n/* Note on the map */\n.abs-map-hint { display: flex; align-items: flex-start; gap: 10px; max-width: 380px; padding: 10px 12px; border-radius: 10px; background: rgba(34, 34, 34, .92); color: #fff; font-size: 13px; line-height: 1.4; }\n.abs-map-hint-close { flex: none; width: 22px; height: 22px; border: 0; border-radius: 50%; background: transparent; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; }\n.abs-map-hint-close:hover { background: rgba(255, 255, 255, .18); }\n\n/* Progress / error */\n.abs-progress, .abs-error { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center; }\n.abs-error { color: #c13515; }\n.abs-spinner { width: 32px; height: 32px; border: 3px solid #ebebeb; border-top-color: #ff385c; border-radius: 50%; animation: abs-spin .9s linear infinite; }\n@keyframes abs-spin { to { transform: rotate(360deg); } }\n\n/* Layout */\n.abs-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); grid-template-rows: minmax(0, 1fr); }\n.abs-list { overflow-y: auto; padding: 24px; }\n.abs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 28px 20px; }\n.abs-sentinel { height: 1px; }\n.abs-map { position: relative; min-height: 0; }\n\n/* Card */\n.abs-card { display: block; color: inherit; text-decoration: none; border-radius: 14px; outline-offset: 4px; }\n.abs-card--hl { outline: 2px solid #222; }\n.abs-photo { position: relative; aspect-ratio: 20 / 19; overflow: hidden; border-radius: 12px; background: #f2f2f2; }\n.abs-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }\n.abs-badge { position: absolute; top: 12px; left: 12px; padding: 4px 10px; border-radius: 12px; background: #fff; font-size: 12px; font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .15); }\n.abs-nav { position: absolute; top: 50%; width: 30px; height: 30px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .9); color: #222; font-size: 18px; line-height: 1; cursor: pointer; opacity: 0; transform: translateY(-50%); transition: opacity .15s; }\n.abs-photo:hover .abs-nav, .abs-photo:focus-within .abs-nav { opacity: 1; }\n.abs-nav--prev { left: 10px; }\n.abs-nav--next { right: 10px; }\n.abs-dots { position: absolute; left: 0; right: 0; bottom: 10px; display: flex; justify-content: center; gap: 5px; }\n.abs-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, .6); }\n.abs-dot--on { background: #fff; }\n.abs-body { display: flex; flex-direction: column; gap: 2px; padding-top: 10px; }\n.abs-row { display: flex; justify-content: space-between; gap: 8px; }\n.abs-title { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }\n.abs-rating { white-space: nowrap; }\n.abs-muted { color: #6a6a6a; }\n.abs-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.abs-price { margin-top: 4px; }\n.abs-price s { margin-right: 4px; }\n.abs-card--compact .abs-photo { border-radius: 12px 12px 0 0; }\n.abs-card--compact .abs-body { padding: 8px 10px 10px; }\n\n/* Map popup */\n.abs-popup .leaflet-popup-content-wrapper { padding: 0; overflow: hidden; border-radius: 12px; }\n.abs-popup .leaflet-popup-content { width: 260px !important; margin: 0; font-size: inherit; line-height: inherit; }\n/* Leaflet colours links (.leaflet-container a) and sets its own font on the map; cards keep ours. */\n.abs-popup a.abs-card { color: #222; }\n.abs-map.leaflet-container { font: inherit; }\n\n/* Map pins */\n.abs-pin { width: 0; height: 0; }\n.abs-pin-label {\n  position: absolute; padding: 4px 8px; border-radius: 14px; background: #fff; color: #222; white-space: nowrap;\n  font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;\n  box-shadow: 0 0 0 1px rgba(0, 0, 0, .08), 0 2px 4px rgba(0, 0, 0, .18);\n  transform: translate(-50%, -50%); transition: transform .1s;\n}\n.abs-pin:hover .abs-pin-label { transform: translate(-50%, -50%) scale(1.08); }\n.abs-pin:hover .abs-pin-label, .abs-pin--hl .abs-pin-label { background: #222; color: #fff; }\n.abs-map--dense .abs-pin-label { width: 10px; height: 10px; padding: 0; border-radius: 50%; background: #ff385c; font-size: 0; box-shadow: 0 0 0 2px #fff; }\n.abs-map--dense .abs-pin:hover .abs-pin-label,\n.abs-map--dense .abs-pin--hl .abs-pin-label { width: auto; height: auto; padding: 4px 8px; border-radius: 14px; background: #222; color: #fff; font-size: 13px; box-shadow: none; }\n\n/* Narrow screens: list or map, switched by a button */\n.abs-only-narrow { display: none; }\n@media (max-width: 900px) {\n  .abs-head { padding: 10px 16px; }\n  .abs-list { padding: 16px; }\n  .abs-main { grid-template-columns: minmax(0, 1fr); }\n  .abs-main .abs-map { display: none; }\n  .abs-main--map .abs-map { display: block; }\n  .abs-main--map .abs-list { display: none; }\n  .abs-only-narrow { display: inline-block; }\n}\n';

  // src/main.js
  async function fetchPage(url, signal) {
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) throw new HttpError(response.status);
    return response.text();
  }
  async function start({ L, leafletCss, storage, watch }) {
    if (!claimPage(document)) return false;
    let settings = await loadSettings(storage);
    const applyLocale = () => setLocale(resolveLocale(
      settings.language,
      () => detectLocale({ pageLang: document.documentElement.lang, browserLang: navigator.language })
    ));
    applyLocale();
    const saveSetting = (patch) => {
      settings = { ...settings, ...patch };
      void saveSettings(storage, patch);
    };
    let stored = await loadViewed(storage);
    let opened = {};
    const viewedIds = () => Object.keys({ ...stored, ...opened });
    const recordView = (id) => {
      opened = { ...opened, [id]: Date.now() };
      void markViewed(storage, id);
    };
    let overlay = null;
    let overlayLocale = null;
    let shownKey = null;
    let controller = null;
    let running = false;
    function getOverlay() {
      if (overlay && overlayLocale !== getLocale() && !running && !overlay.isOpen()) {
        overlay.destroy();
        overlay = null;
      }
      if (!overlay) {
        overlayLocale = getLocale();
        shownKey = null;
        overlay = createOverlay({
          L,
          css: `${leafletCss}
${styles_default}`,
          initialSort: settings.sort,
          initialFilters: settings,
          viewedIds: viewedIds(),
          showMapHint: !settings.mapHintSeen,
          supportUrl: SUPPORT_LINKS[0]?.url,
          onSortChange: (sort) => saveSetting({ sort }),
          onFiltersChange: (filters) => saveSetting(filters),
          onListingOpen: (id) => recordView(id),
          onMapHintDismiss: () => saveSetting({ mapHintSeen: true }),
          onRefresh: () => run(true),
          onCancel: () => controller?.abort(),
          onClose: () => controller?.abort()
        });
      }
      return overlay;
    }
    async function run(force) {
      const view = getOverlay();
      view.open();
      if (running && !force) return;
      const href = location.href;
      const { searchUrl } = parseSearchUrl(href);
      controller?.abort();
      const current = controller = new AbortController();
      const key = cacheKey(searchUrl);
      const title = describeSearch({ placeLabel: placeLabel(searchUrl), searchUrl });
      if (force || shownKey !== key) {
        shownKey = null;
        view.showProgress(null, title);
      }
      const [cached, reread] = await Promise.all([
        force ? null : loadCache(storage, searchUrl),
        watch ? null : loadViewed(storage)
      ]);
      if (current !== controller) return;
      if (current.signal.aborted) {
        view.close();
        return;
      }
      if (reread) stored = reread;
      view.setViewed(viewedIds());
      if (cached) {
        try {
          view.showResults(cached, { fromCache: true });
          shownKey = key;
          return;
        } catch (e) {
          console.warn("[airbnb-sorter] cached result failed to render, collecting afresh", e);
        }
      }
      running = true;
      shownKey = null;
      view.showProgress(null, title);
      let result;
      try {
        result = await collect(href, {
          fetchPage,
          signal: current.signal,
          onProgress: (p) => {
            if (current === controller) view.showProgress(p);
          }
        });
      } catch (e) {
        if (current !== controller) return;
        console.error("[airbnb-sorter]", e);
        view.showError(e.message);
        return;
      } finally {
        if (current === controller) running = false;
      }
      if (current !== controller) return;
      if (result.meta.stopReason !== "cancelled") void saveCache(storage, searchUrl, result);
      view.showResults(result);
      shownKey = key;
    }
    let pageListing = null;
    const launcher = createLauncher(() => run(false), {
      onUrlChange: (pathname) => {
        const id = listingIdFromPath(pathname);
        if (id && id !== pageListing) recordView(id);
        pageListing = id;
      }
    });
    watch?.(SETTINGS_KEY, async () => {
      settings = await loadSettings(storage);
      const previous = getLocale();
      applyLocale();
      if (getLocale() !== previous) launcher.refreshLabel();
    });
    watch?.(VIEWED_KEY, async () => {
      const next = await loadViewed(storage);
      if (Object.keys(stored).some((id) => !Object.hasOwn(next, id))) opened = {};
      stored = next;
      overlay?.setViewed(viewedIds());
    });
    return true;
  }

  // src/userscript.js
  start({
    L: window.L,
    leafletCss: GM_getResourceText("leafletCss"),
    storage: { get: GM_getValue, set: GM_setValue }
  });
})();
