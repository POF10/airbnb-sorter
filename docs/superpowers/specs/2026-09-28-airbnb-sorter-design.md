# Airbnb Sorter — дизайн

Дата: 2026-09-28
Статус: согласован, ждёт ревью спеки

## Цель

У Airbnb нет сортировки выдачи по цене. Нужен инструмент, который собирает **всю** выдачу текущего поиска (а не только 270 объявлений, которые Airbnb показывает на 15 страницах) и показывает её «как в Airbnb» — карточки с фото, ценами, рейтингом и картой — но с сортировкой, в первую очередь по убыванию цены.

Критерии успеха:

- На поиске «Рига, 3 ночи, 2 гостя» (~1263 объявления по гистограмме) собрано ≥ 95 % от ожидаемого числа.
- Порядок «Цена ↓» верный на всей собранной выдаче.
- Карточка ↔ маркер на карте связаны (наведение, попап), тумблер «Только в области карты» работает.
- Клик по карточке открывает объявление на Airbnb с теми же датами и гостями.

## Выбранный подход

**Userscript (Tampermonkey) + полноэкранный слой поверх airbnb.com**, слой изолирован в Shadow DOM.

- Сбор идёт same-origin из вкладки пользователя (его куки, без CORS).
- Результат — один файл `dist/airbnb-sorter.user.js`, собранный esbuild из модулей.
- Модуль просмотра ничего не знает про Airbnb и принимает на вход массив `Listing` + `meta`. Это оставляет дешёвый путь отступления, если подход A себя не оправдает:
  - **B** — userscript-сборщик + отдельная страница-вьюер (данные через хранилище Tampermonkey);
  - **C** — MV3-расширение Chrome (контент-скрипт + страница расширения).
  При переезде меняется только точка входа (`main.js`), `extract`/`normalize`/`collector`/`viewer` переиспользуются.

## Проверенные факты об Airbnb (спайк 2026-09-28)

Проверено на живой выдаче `https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2`.

### Где лежат данные

- HTML страницы поиска содержит `<script id="data-deferred-state-0">` с JSON (~460 КБ).
- `niobeClientData` — массив пар `[key, value]`; нужная пара — та, чей `key` начинается с `StaysSearch:` (искать по префиксу, не по индексу).
- `value.data.presentation.staysSearch.results`:
  - `searchResults[]` — 18 объявлений на страницу (`__typename: "StaySearchResult"`);
  - `paginationInfo.pageCursors[]` — курсоры **всех** страниц сразу, максимум 15. Курсор — base64 от `{"section_offset":0,"items_offset":N,"version":1}`;
  - `filters.filterPanel.filterPanelSections.sections[*].sectionData.discreteFilterItems[*]` — у элемента, чьи `searchParams.params[*].key` включают `price_min`/`price_max`, есть `minValue` (например `"30"`), `maxValue` (`"520"`, означает «520+»), `priceHistogram` (50 столбиков, сумма ≈ общее число объявлений; границы столбиков нелинейные — использовать только сумму).
- Страницу N получаем `fetch(searchUrl + "&cursor=" + pageCursors[N])` — тот же HTML с тем же блоком. ~0,7 с и ~750 КБ на страницу. Внутренний GraphQL API с persisted-query хэшами не нужен.

### Поля объявления (`StaySearchResult`)

| Поле `Listing` | Источник |
|---|---|
| `id` | `demandStayListing.id` — base64 от `DemandStayListing:<числовой id>` |
| `lat`, `lng` | `demandStayListing.location.coordinate.latitude/longitude` |
| `title` | `title` (например «Condo in Centrs») |
| `name` | `nameLocalized.localizedStringWithTranslationPreference` (запасной — `subtitle`) |
| `photos` | `contextualPictures[].picture` |
| цена | `structuredDisplayPrice.primaryLine`: `QualifiedDisplayPriceLine` → `price`, `qualifier`, `accessibilityLabel`; `DiscountedDisplayPriceLine` → `discountedPrice`, `originalPrice`, `qualifier` |
| `rating`, `reviews` | `avgRatingLocalized`: `"5.0 (200)"` или `"New"` (→ `null`) |
| `details` | `structuredContent.primaryLine[].body` (тип `BEDINFO`: «1 bedroom», «2 beds») |
| `badges` | `badges[].text` («Guest favorite») |

### Фильтр по цене

- URL-параметры `price_min`, `price_max`, `price_filter_input_type=0` работают.
- Фильтр — **за ночь**, а показанная цена — **итог за даты с комиссиями** (фильтр €60–70 за ночь → карточки ~€190 за 3 ночи). Для деления по диапазонам это неважно, сортируем по показанной цене.
- Насыщенность диапазона: `pageCursors.length === 15` ⇒ в диапазоне ≥ 270 объявлений, Airbnb отдаёт не все.

### Фильтры пользователя

- Все фильтры Airbnb живут в URL поиска (`room_types[]`, `min_bedrooms`, `amenities[]`, `category_tag`, границы карты `ne_lat`/`sw_lng`/… при поиске по карте и т. д.), поэтому сбор от `location.href` их учитывает автоматически — отдельной логики не нужно.
- Гистограмма цен пересчитывается под фильтры: без фильтров — 1264, `room_types[]=Entire home/apt&min_bedrooms=3` — 89 (5 страниц, деление не нужно), `amenities[]=7` — 11.
- Ключ кэша — `searchUrl` вместе с фильтрами: поменял фильтры на Airbnb → нажал кнопку → новый сбор.

### CSP airbnb.com

`img-src 'self' https: data: blob:` — тайлы OpenStreetMap грузятся. `script-src` ограничен, но Tampermonkey подключает `@require` сам. `connect-src 'self' https:` — same-origin fetch разрешён.

## Архитектура

```
airbnb-sorter/
  src/
    main.js          точка входа userscript: кнопка, SPA-навигация, кэш, связка collector → viewer
    extract.js       HTML → { results, pageCursors, priceFilter: {min, max, histogramTotal} }   (чистый)
    normalize.js     StaySearchResult → Listing                                                (чистый)
    price.js         разбор строк цены                                                         (чистый)
    collector.js     деление по ценам, пагинация, дедуп, повторы, прогресс; fetchPage внедряется
    viewer/
      overlay.js     Shadow DOM, каркас слоя, шапка, Esc/закрытие, блокировка прокрутки
      list.js        сетка карточек, подгрузка порциями
      card.js        карточка + карусель фото
      map.js         Leaflet: маркеры-ценники/точки, попапы, подсветка, границы
      logic.js       sortListings, filterByBounds, форматирование                             (чистый)
      styles.css     стили слоя (инлайнятся в сборку)
    header.txt       шапка userscript (шаблон, версия подставляется при сборке)
  test/
    fixtures/        вырезанные JSON-блоки реальных выдач
    *.test.js        node:test
  dev/
    viewer.html      стенд просмотра на фикстурах
  build.mjs          esbuild → dist/airbnb-sorter.user.js
```

Поток данных: `location.href` → `collector` → `{ listings: Listing[], meta }` → `viewer`.

### Модель данных

```js
// Listing
{
  id: "1115734396810872631",
  url: "https://www.airbnb.com/rooms/1115734396810872631?check_in=2026-10-16&check_out=2026-10-19&adults=2",
  title: "Condo in Centrs",
  name: "Charming Apartment with Terrace and Free Parking",
  photos: ["https://a0.muscache.com/im/pictures/…"],
  price: {
    amount: 223,            // число из показанной цены (со скидкой — цена со скидкой); null, если не разобрали
    currency: "€",          // как показал Airbnb
    label: "€223 total",    // accessibilityLabel
    qualifier: "total",     // "total" | "night" | … как у Airbnb
    original: null,         // число до скидки или null
  },
  pricePerNight: 74.33,     // amount / nights, если qualifier = total и даты известны; иначе null
  rating: 5.0,              // null для "New"/нет отзывов
  reviews: 200,             // null, если нет
  lat: 56.9536, lng: 24.1324, // null, если нет координат
  details: ["1 bedroom", "2 beds"],
  badges: ["Guest favorite"],
}

// meta
{
  searchUrl,        // URL поиска без cursor
  origin,           // location.origin (домен Airbnb)
  nights,           // из checkin/checkout или null
  placeLabel,       // «Riga» — из query/title, для шапки
  collectedAt,      // ISO-время
  expectedTotal,    // сумма priceHistogram или null
  saturatedRanges,  // число неделимых переполненных диапазонов
  failedPages,      // число страниц, не загруженных после повторов
  partial,          // true при отмене/блокировке/failedPages > 0/saturatedRanges > 0
  stopReason,       // null | "cancelled" | "blocked" | "error"
}
```

`url` строится из `origin` + `/rooms/<id>` + параметры `check_in`, `check_out`, `adults`, `children`, `infants`, `pets` из поиска (те, что есть).

## Алгоритм сбора

**Старт.** Берём `location.href`, удаляем `cursor`, `pagination_search`, `price_min`, `price_max`, `price_filter_input_type`, `price_filter_num_nights`. Если пользователь сам задал `price_min`/`price_max`, они становятся внешними границами `[lo, hi]`; иначе `[0, ∞)`.

**Диапазон** — `{lo, hi}` (`hi = null` означает ∞). Обработка диапазона:

1. Запросить первую страницу с `price_min=lo` (если `lo > 0`), `price_max=hi` (если не ∞), `price_filter_input_type=0`. Её результаты сразу идут в копилку.
2. Если `pageCursors.length < 15` → диапазон «влезает»: загрузить страницы `pageCursors[1..]`.
3. Если `pageCursors.length === 15` → переполнен, делим:
   - `hi = ∞`: на `[lo, H]` и `[H, ∞)`, где `H = maxValue` из гистограммы, если `H > lo`; иначе `H = max(2·lo, lo + 50)`;
   - иначе: `mid = round((lo + hi) / 2)` → `[lo, mid]` и `[mid, hi]` (границы **пересекаются** — объявления ровно на `mid` не теряются, дубли убирает дедуп);
   - если `hi − lo ≤ 1` — делить некуда: загрузить все 15 страниц, `saturatedRanges += 1`.
4. `minValue`/`maxValue`/`priceHistogram` берём из самого первого ответа. `expectedTotal` = сумма гистограммы, но только если пользователь **не** задавал свои `price_min`/`price_max` (гистограмма описывает все цены, а не его диапазон); иначе `expectedTotal = null`, и в шапке просто «Собрано 1240».

**Дедуп** по `id`, побеждает первое вхождение.

**Очередь и вежливость.** Все запросы идут через общую очередь: 3 одновременных, после каждого случайная пауза 250–600 мс.

**Повторы.** HTTP 429, 5xx, сетевая ошибка → повтор через 2 с, 4 с, 8 с. Не помогло → страница пропущена, `failedPages += 1`. Если не загрузилась **первая** страница диапазона — пропущен весь диапазон (считаем как одну `failedPages`).

**Блокировка.** Ответ 200, но без `data-deferred-state-0` / без записи `StaysSearch:` (капча, стена логина) → `stopReason = "blocked"`, сбор останавливается, возвращается собранное. Если это случилось на самом первом запросе — ошибка `ExtractError` в UI.

**Отмена.** `AbortController`; кнопка «Отмена» в прогрессе → `stopReason = "cancelled"`, возвращается собранное.

**Прогресс** (колбэк `onProgress`): `{ ranges, pagesDone, pagesPlanned, listings, expectedTotal }` → в UI: `Диапазонов: 6 · Страниц: 41 / ~70 · Объявлений: 812 из ~1263`. `pagesPlanned` — оценка, растёт по мере деления.

**Оценка для Риги:** ~8 конечных диапазонов, ~15 проб, ~70 страниц ≈ 85–90 запросов, 30–45 с, **~60 МБ трафика**.

**Оговорка:** выдача персонализирована и может сдвигаться за время сбора — несколько объявлений могут потеряться; честное «собрано X из ~Y» показывает это.

## Интерфейс

Язык интерфейса — русский. Светлая тема (как у Airbnb).

### Кнопка запуска

- Плавающая кнопка «↕ Сортировать все» справа внизу на страницах поиска жилья (`/s/…/homes`).
- Airbnb — SPA: скрипт отслеживает смену URL (перехват `pushState`/`replaceState` + `popstate`) и показывает/прячет кнопку.

### Кэш

- В хранилище Tampermonkey (`GM_setValue`) хранится **последний** сбор: `{ key: searchUrl, listings, meta }`.
- Если кнопку нажали на том же поиске — слой открывается сразу с пометкой «собрано 12 мин назад»; «⟳ Обновить» запускает сбор заново.
- Ошибка записи (квота) → кэш пропускается, `console.warn`.

### Слой

- Полноэкранный `position: fixed`, максимальный `z-index`, содержимое в Shadow DOM (open). Прокрутка страницы Airbnb заблокирована, пока слой открыт. Esc или × — закрыть.
- **Шапка:** место · даты · гости; «Собрано 1240 из ~1263» (⚠ с подсказкой, если `partial`); селект сортировки; тумблер «Только в области карты»; «⟳ Обновить»; ×.
- **Во время сбора** вместо контента — прогресс и кнопка «Отмена».
- **Раскладка:** слева список (~60 %), справа карта (~40 %) во всю высоту. Узкий экран (< 900 px): одна колонка и кнопка «Список / Карта».

### Сортировка

Варианты: **Цена ↓** (по умолчанию), Цена ↑, Рейтинг ↓, Отзывов ↓. Ключ цены — `price.amount`. Объявления с `null` в ключе сортировки — в конце при любом направлении. При равенстве — по `id` (стабильно).

### Список и карточка

- Сетка карточек (auto-fill, мин. ширина ~260 px). Сначала рендер 60 карточек, следующие 60 — при прокрутке к концу (IntersectionObserver). Смена сортировки/фильтра — перерисовка с начала, прокрутка вверх.
- **Карточка:**
  - фото с каруселью: стрелки ‹ › при наведении, точки (до 5); грузится только первое фото, остальные — при листании (`loading="lazy"`);
  - бейдж поверх фото («Guest favorite»);
  - `title` жирным + ★ 5.0 (200) справа; «New», если нет рейтинга;
  - `name` серым, `details` через « · »;
  - цена: жирная `€223` + `total`; при скидке — зачёркнутая старая цена; серым «≈ €74/ночь», если есть `pricePerNight`;
  - вся карточка — ссылка на `url` в новой вкладке.

### Карта

- Leaflet 1.9.4 + тайлы OpenStreetMap (с атрибуцией). При открытии — `fitBounds` по всем объявлениям с координатами.
- **Маркеры:** белый ценник-пилюля с `€223`; активный (наведение на карточку или маркер) — чёрный, поверх остальных.
- **Плотность:** если в видимой области > 150 объявлений — вместо ценников точки (переключение CSS-класса на контейнере по `moveend`); ценник у точки появляется при наведении.
- Наведение на карточку → подсветка маркера. Клик по маркеру → попап с мини-карточкой (фото, `title`, рейтинг, цена, ссылка).
- **Тумблер «Только в области карты»** (по умолчанию выключен): список = объявления внутри `map.getBounds()`, пересчёт на `moveend`; в шапке «показано 84 из 1240».
- Тайлы не загрузились — список работает как обычно.

## Обработка ошибок

- `extract` на первой странице не нашёл данные → `ExtractError` с путём, где оборвалось (например `нет …staysSearch.results`), текст показывается в слое. Нужен, чтобы быстро чинить после изменений Airbnb.
- В объявлении нет поля → `null`, карточка показывается. Без `id` — объявление отбрасывается (нельзя дедупить и построить ссылку). Без координат — только в списке. Без цены — в конце сортировки.
- Прочие сбои сбора — см. «Алгоритм сбора» (повторы, блокировка, отмена).

## Тестирование

`npm test` → `node --test`.

- **Фикстуры** (`test/fixtures/`): вырезанный JSON-блок `StaysSearch` из 2–3 реальных выдач — Рига с датами (итоговые цены, есть `DiscountedDisplayPriceLine`, есть `"New"`), выдача без дат (цены за ночь). Лишние поля можно обрезать, структуру путей — нет.
- `price.test.js`: `€1,234`, `1 234 €` (неразрывный пробел), `$1,234.50`, `¥12,345`, `₽ 12 345`, мусор → `null`.
- `extract.test.js`: фикстура в HTML-обёртке → результаты, 15 курсоров, `min/max/histogramTotal`; нет блока / нет `StaysSearch:` → `ExtractError`.
- `normalize.test.js`: ключевые поля `Listing` на фикстуре; скидка; «New»; отсутствующие координаты; декодирование `id` из base64.
- `collector.test.js` с фейковым `fetchPage`: маленькая выдача (< 15 страниц); переполнение → деление, в т. ч. `[lo, ∞)`; неделимый диапазон → `saturatedRanges`; 429 → повтор и успех; 429 до упора → `failedPages`; блокировка посреди → `partial`, `stopReason = "blocked"`; отмена; дубли на пересечении границ. Паузы и таймеры внедряются, чтобы тесты шли быстро.
- `logic.test.js`: `sortListings` (все 4 режима, `null` в конце, стабильность), `filterByBounds`.
- **Стенд просмотра** (`npm run dev`): `dev/viewer.html` рендерит слой на данных фикстур без Airbnb — для доводки UI.
- **Приёмка вживую** на поиске по Риге — по критериям успеха из начала документа.

## Сборка и установка

- `npm run build`: esbuild бандлит `src/main.js` в IIFE (ES2020), CSS инлайнится строкой, шапка из `src/header.txt` с версией из `package.json` → `dist/airbnb-sorter.user.js`.
- Шапка userscript:
  - `@match https://www.airbnb.com/*`; прочие домены Airbnb — `@include` с регуляркой `^https://www\.airbnb\.[a-z.]+/`;
  - `@require` Leaflet 1.9.4 с cdnjs (с SRI-хэшем);
  - `@resource leafletCss` — CSS Leaflet с cdnjs, вставляется в Shadow DOM через `GM_getResourceText`;
  - `@grant GM_getValue`, `GM_setValue`, `GM_getResourceText`;
  - `@run-at document-idle`, `@noframes`.
- Установка: Tampermonkey в Chrome → в настройках расширения включить «Allow User Scripts» → открыть `dist/airbnb-sorter.user.js` → Install. Обновление — пересобрать и переустановить.

## Риски

| Риск | Что делаем |
|---|---|
| Leaflet в Shadow DOM глючит (события, попапы, drag) | Первая задача плана — спайк карты с маркерами в Shadow DOM на airbnb.com. Запасной путь: слой без Shadow DOM, все классы с префиксом `abs-`. |
| Airbnb меняет структуру данных | Все пути в `extract`/`normalize`, `ExtractError` с путём, фикстуры для быстрой перепроверки. |
| Антибот при ~90 запросах | Очередь 3 параллельно + паузы, остановка на первом признаке блокировки, показ собранного. |
| Пользовательское соглашение Airbnb запрещает автоматический сбор | Только личное использование в своей сессии, умеренный темп. Риск ограничения аккаунта низкий, но не нулевой. |
| ~60 МБ трафика на сбор | Принято для v1; экономия через перехват JSON-API — вне v1. |

## Вне v1

- Впечатления и услуги — только жильё (`/s/…/homes`).
- Несколько сохранённых поисков, сравнение, история цен.
- Перехват внутреннего JSON-API ради экономии трафика.
- Дополнительные фильтры в слое (помимо области карты).
