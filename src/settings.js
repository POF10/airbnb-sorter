// User settings, kept under one storage key. storage: { get(key, fallback), set(key, value) }, sync or async.
import { SORTS, DEFAULT_SORT, RATING_STEPS, REVIEW_STEPS } from './viewer/logic.js';

export const SETTINGS_KEY = 'settings';
export const LANGUAGES = ['auto', 'en', 'ru'];
export const DEFAULT_SETTINGS = Object.freeze({
  language: 'auto',
  sort: DEFAULT_SORT,
  minRating: 0,
  minReviews: 0,
  hideViewed: false,
  mapHintSeen: false,
});

// Unknown or missing values become the defaults, so a damaged entry never breaks the UI.
export function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    language: LANGUAGES.includes(value.language) ? value.language : DEFAULT_SETTINGS.language,
    sort: typeof value.sort === 'string' && Object.hasOwn(SORTS, value.sort) ? value.sort : DEFAULT_SETTINGS.sort,
    minRating: RATING_STEPS.includes(value.minRating) ? value.minRating : DEFAULT_SETTINGS.minRating,
    minReviews: REVIEW_STEPS.includes(value.minReviews) ? value.minReviews : DEFAULT_SETTINGS.minReviews,
    hideViewed: value.hideViewed === true,
    mapHintSeen: value.mapHintSeen === true,
  };
}

export async function loadSettings(storage) {
  try {
    return normalizeSettings(await storage.get(SETTINGS_KEY, null));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// Merges the patch into what is stored and returns the result; a failed write is logged, not thrown.
export async function saveSettings(storage, patch) {
  const next = normalizeSettings({ ...(await loadSettings(storage)), ...patch });
  try {
    await storage.set(SETTINGS_KEY, next);
  } catch (e) {
    console.warn('[airbnb-sorter] could not save the settings', e);
  }
  return next;
}

// 'auto' asks detect() (page language, then browser language); an explicit choice wins.
export function resolveLocale(language, detect) {
  return language === 'auto' ? detect() : language;
}
