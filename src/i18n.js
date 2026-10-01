// UI language: Russian on Russian-language Airbnb pages or in a Russian browser, English elsewhere.

const DICTS = {
  en: {
    numberLocale: 'en-US',
    dateLocale: 'en-GB',
    launcher: '↕ Sort all',
    sort: { 'price-desc': 'Price ↓', 'price-asc': 'Price ↑', 'rating-desc': 'Rating ↓', 'reviews-desc': 'Reviews ↓' },
    newRating: '★ New',
    perNight: '/night',
    onlyInMap: 'Only in map area',
    refresh: '⟳ Refresh',
    showMap: 'Map',
    showList: 'List',
    close: 'Close (Esc)',
    cancel: 'Cancel',
    prevPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    guests: n => `${n} ${n === 1 ? 'guest' : 'guests'}`,
    justNow: 'just now',
    minutesAgo: n => `${n} min ago`,
    hoursAgo: n => `${n} h ago`,
    daysAgo: n => `${n} d ago`,
    collected: total => `Collected ${total}`,
    ofExpected: expected => ` of ~${expected}`,
    showing: shown => ` · showing ${shown}`,
    loadingFirst: 'Loading the first page…',
    progress: (p, of) => `Ranges: ${p.ranges} · Pages: ${p.pagesDone} / ~${p.pagesPlanned} · Listings: ${p.listings}${of}`,
    cancelled: 'collection cancelled',
    blocked: 'Airbnb started blocking requests',
    limit: 'request limit reached',
    failedPages: n => `pages failed to load: ${n}`,
    saturated: n => `overfull price ranges: ${n} (some listings unavailable)`,
    partial: reasons => `Incomplete collection: ${reasons}`,
    collectFailed: message => `Could not collect the search: ${message}`,
    support: 'Support the developer',
    popup: {
      title: 'Price Sorter for Airbnb',
      howTo: 'Open a homes search on Airbnb and press “↕ Sort all”.',
      language: 'Language',
      languages: { auto: 'Auto', en: 'English', ru: 'Русский' },
      github: 'GitHub',
      report: 'Report a problem',
    },
  },
  ru: {
    numberLocale: 'ru-RU',
    dateLocale: 'ru-RU',
    launcher: '↕ Сортировать все',
    sort: { 'price-desc': 'Цена ↓', 'price-asc': 'Цена ↑', 'rating-desc': 'Рейтинг ↓', 'reviews-desc': 'Отзывов ↓' },
    newRating: '★ Новое',
    perNight: '/ночь',
    onlyInMap: 'Только в области карты',
    refresh: '⟳ Обновить',
    showMap: 'Карта',
    showList: 'Список',
    close: 'Закрыть (Esc)',
    cancel: 'Отмена',
    prevPhoto: 'Предыдущее фото',
    nextPhoto: 'Следующее фото',
    guests: n => `${n} ${pluralRu(n, 'гость', 'гостя', 'гостей')}`,
    justNow: 'только что',
    minutesAgo: n => `${n} мин назад`,
    hoursAgo: n => `${n} ч назад`,
    daysAgo: n => `${n} дн назад`,
    collected: total => `Собрано ${total}`,
    ofExpected: expected => ` из ~${expected}`,
    showing: shown => ` · показано ${shown}`,
    loadingFirst: 'Загружаю первую страницу…',
    progress: (p, of) => `Диапазонов: ${p.ranges} · Страниц: ${p.pagesDone} / ~${p.pagesPlanned} · Объявлений: ${p.listings}${of}`,
    cancelled: 'сбор отменён',
    blocked: 'Airbnb начал блокировать запросы',
    limit: 'достигнут предел числа запросов',
    failedPages: n => `не загрузилось страниц: ${n}`,
    saturated: n => `переполненных ценовых диапазонов: ${n} (часть объявлений недоступна)`,
    partial: reasons => `Неполный сбор: ${reasons}`,
    collectFailed: message => `Не удалось собрать выдачу: ${message}`,
    support: 'Поддержать разработчика',
    popup: {
      title: 'Сортировка по цене для Airbnb',
      howTo: 'Откройте поиск жилья на Airbnb и нажмите «↕ Сортировать все».',
      language: 'Язык',
      languages: { auto: 'Авто', en: 'English', ru: 'Русский' },
      github: 'GitHub',
      report: 'Сообщить о проблеме',
    },
  },
};

function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

let locale = 'en';

export function setLocale(next) {
  locale = Object.hasOwn(DICTS, next) ? next : 'en';
}

export function getLocale() {
  return locale;
}

// The current dictionary: t().launcher, t().guests(2), …
export function t() {
  return DICTS[locale];
}

// pageLang: <html lang> of the Airbnb page (ru.airbnb.com says "ru"); browserLang: navigator.language.
export function detectLocale({ pageLang = '', browserLang = '' } = {}) {
  const isRu = s => /^ru\b/i.test(s ?? '');
  if (isRu(pageLang)) return 'ru';
  if (pageLang) return 'en'; // the page says another language: follow the site, not the browser
  return isRu(browserLang) ? 'ru' : 'en';
}
