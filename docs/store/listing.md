# Chrome Web Store listing

Texts and answers for the Chrome Web Store developer dashboard. The package to upload is `dist/airbnb-sorter-extension-<version>.zip` (`npm run build`).

## Store listing

| Field | English (default) | Русский |
|---|---|---|
| Name | Price Sorter for Airbnb | Сортировка по цене для Airbnb |
| Summary | Sort Airbnb search results by price: collects the whole search, past the 270-listing cap, and shows it with photos and a map. | Сортировка выдачи Airbnb по цене: собирает весь поиск, а не только 270 объявлений, и показывает его с фото и картой. |

Name and summary come from `src/extension/_locales/`. Category: Travel. Language: English, Russian.

### Description (English)

```
Airbnb search cannot sort by price, and it shows at most 270 listings per search. This extension adds a "↕ Sort all" button to Airbnb's search page. Press it, and the whole search is collected and opened on top of the page: cards with photos, a map with price pins, and sorting by price (high to low or low to high), rating or number of reviews.

• The whole search, not 270 listings: the search is split into price ranges until each one fits under Airbnb's limit.
• All your filters apply: dates, guests, property type, amenities, price range, map area.
• A map with price pins and an "Only in map area" filter.
• Cards like Airbnb's: photo carousel, rating, discounts, price per night.
• The last collection is cached, so reopening the same search is instant.
• Gentle with Airbnb: a few requests at a time with pauses, and it stops at the first sign of blocking.
• English and Russian interface.

How to use: open a homes search on Airbnb, set dates and filters as usual, then press "↕ Sort all" in the bottom-right corner. Collecting about 1,300 listings takes around 45 seconds.

Nothing leaves your browser: no account, no analytics, no server. Open source (MIT): https://github.com/POF10/airbnb-sorter

This extension is not affiliated with, endorsed by or sponsored by Airbnb. Airbnb's terms of service prohibit automated data collection; use it at your own risk.
```

### Description (Русский)

```
В поиске Airbnb нет сортировки по цене, а показывает он не больше 270 объявлений. Расширение добавляет на страницу поиска Airbnb кнопку «↕ Сортировать все». Нажмите её — вся выдача будет собрана и открыта поверх страницы: карточки с фото, карта с ценниками и сортировка по цене (по убыванию или возрастанию), рейтингу или числу отзывов.

• Вся выдача, а не 270 объявлений: поиск делится на ценовые диапазоны, пока каждый не уложится в лимит Airbnb.
• Учитываются все ваши фильтры: даты, гости, тип жилья, удобства, ценовой диапазон, область карты.
• Карта с ценниками и фильтр «Только в области карты».
• Карточки как на Airbnb: карусель фото, рейтинг, скидки, цена за ночь.
• Последний сбор запоминается: тот же поиск открывается мгновенно.
• Бережно к Airbnb: несколько запросов одновременно с паузами и остановка при первых признаках блокировки.
• Интерфейс на русском и английском.

Как пользоваться: откройте поиск жилья на Airbnb, задайте даты и фильтры как обычно и нажмите «↕ Сортировать все» в правом нижнем углу. Сбор примерно 1 300 объявлений занимает около 45 секунд.

Ничего не покидает ваш браузер: нет учётной записи, аналитики и сервера. Открытый исходный код (MIT): https://github.com/POF10/airbnb-sorter

Расширение не связано с Airbnb, не одобрено и не спонсируется Airbnb. Пользовательское соглашение Airbnb запрещает автоматический сбор данных; используйте на свой страх и риск.
```

## Privacy practices

**Single purpose.** Sorting the results of an Airbnb search by price: the extension collects the whole search the user is looking at and shows it sorted, with photos and a map.

**Permission justification — storage.** Keeps the last collected search, so reopening the same search does not repeat the requests, and the user's settings (interface language, sort order). Stored locally in `chrome.storage.local`, never synced or sent anywhere.

**Permission justification — host permissions (Airbnb domains).** The content script runs only on Airbnb's own domains (airbnb.com and its country domains). It adds the "↕ Sort all" button to the search page and, when the user presses it, requests the pages of that search from the same Airbnb site in the user's session. It runs on every page of those sites because Airbnb is a single-page application and reaches the search page without a page load. No other site is accessed.

**Remote code.** No. All code, including the Leaflet map library, is inside the package. Map tiles (images) come from OpenStreetMap and listing photos (images) from Airbnb.

**Data usage.** The extension does not collect or transmit any user data. Check none of the data categories. Certify all three statements (no sale of data, no unrelated use, no creditworthiness use).

**Privacy policy URL.** https://github.com/POF10/airbnb-sorter/blob/main/PRIVACY.md

## Images

- Icon: `src/extension/icons/128.png`.
- Screenshots (1280×800): `docs/store/screenshots/overlay-en.png`, `docs/store/screenshots/overlay-ru.png` — the dev stand on synthetic data.

## Before submitting

- `src/config.js` has real support links or an empty `SUPPORT_LINKS` (the build prints no placeholder warning).
- The version in `package.json` is higher than the published one.
- `PRIVACY.md` is on the `main` branch, so the privacy policy URL works.
