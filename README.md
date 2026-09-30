# Airbnb Sorter

**English** · [Русский](README.ru.md)

A Tampermonkey userscript that adds the one thing Airbnb search is missing: **sorting the whole search by price**. Airbnb shows at most 270 listings per search and cannot sort them by price. This script collects the entire search (about 1,300 listings for a weekend in Riga) and opens it on top of the page in the familiar look: cards with photos, a map with price pins, and sorting by price, rating or number of reviews.

The interface is in English, or in Russian on Russian-language Airbnb pages.

## Features

- **The whole search, not 270 listings.** The search is split into price ranges until each one fits under Airbnb's limit, then every range is collected in full.
- **Sorting:** price descending (default) and ascending, rating, number of reviews.
- **A map** with price pins, like Airbnb's: hovering a card highlights its pin, clicking a pin opens a mini card. An "Only in map area" filter.
- **Cards like Airbnb's:** photo carousel, "Guest favorite" badge, rating, discounts with the old price struck through, and an "≈ per night" price.
- **All your filters apply:** dates, guests, property type, bedrooms, amenities, price range, map area. Works on www.airbnb.com and on the language sites (airbnb.co.uk, lv.airbnb.com, ru.airbnb.com, …).
- **The last collection is cached:** reopening the same search is instant, "⟳ Refresh" collects again.
- **Gentle with Airbnb:** three requests at a time with pauses in between, automatic stop at the first sign of blocking, and a cap on the number of requests.

## Installation

Step by step, no technical knowledge needed. Takes about two minutes.

1. **Install Tampermonkey**, a free browser extension that runs userscripts. Open [tampermonkey.net](https://www.tampermonkey.net/) and click the button for your browser (Chrome, Edge, Firefox, Opera, Safari). Confirm the installation in the browser's dialog.
2. **Allow userscripts** (Chrome and Edge only; Chrome requires this from every userscript extension):
   1. Type `chrome://extensions` in the address bar (`edge://extensions` in Edge) and press Enter.
   2. Find Tampermonkey and click **Details**.
   3. Turn on **Allow User Scripts**. If there is no such switch, your browser is older: turn on **Developer mode** in the top-right corner of the same page instead.
3. **Install the script.** Open this link:

   **[Install Airbnb Sorter](https://raw.githubusercontent.com/POF10/airbnb-sorter/main/dist/airbnb-sorter.user.js)**

   Tampermonkey opens a page describing the script. Click **Install**. That's it: the script is installed, and Tampermonkey will update it automatically when a new version comes out.

If the link shows plain text instead of the Install page, step 2 has not been done or Tampermonkey is disabled. The releases page with every version is [here](https://github.com/POF10/airbnb-sorter/releases).

## How to use

1. Open a homes search on Airbnb and set everything up as usual: dates, guests, filters. If you moved the map with "Search as I move the map" on, only the visible area is collected.
2. Click the **"↕ Sort all"** button in the bottom-right corner.
3. Wait for the collection to finish. For ~1,300 listings it takes about 45 seconds and 60 MB of traffic (Airbnb serves whole search pages, ~750 KB each). The progress is shown while it runs.

From there everything works like Airbnb: cards open the listing in a new tab with your dates, the map can be dragged and zoomed, "Only in map area" keeps only what is visible on the map. Esc or × closes the overlay.

What the header says:

- **"Collected 1,361 of ~1,258"** — how many listings were collected and how many Airbnb estimates from its price histogram. The estimate is rough; the collected number can exceed it.
- **⚠** — the collection is incomplete; hover for the reason: cancelled, Airbnb started blocking requests, some pages failed to load.
- **"· 12 min ago"** — the result comes from the cache. "⟳ Refresh" collects again.
- **"≈ €74/night"** — the total price of the stay (fees included) divided by the number of nights. In a search without dates Airbnb prices each listing for its own dates, usually 5 nights; the card links to those same dates.

"Cancel" during a collection (or closing the overlay) shows what has been collected so far; such a partial result is not cached.

## How it works

Airbnb returns at most 15 pages of 18 listings per search, but it accepts a nightly price filter, `price_min`/`price_max`. The script requests the first page of the search; if there are 15 pages (the range is overfull), it halves the price range and repeats for each half until the ranges are narrow enough. Neighbouring ranges overlap at the boundary so listings priced exactly there are not lost, and duplicates are removed by id. For ~1,300 listings that is about 8 ranges and 90 requests.

The data comes from the JSON that Airbnb embeds in the HTML of its search pages (the same data the page itself is rendered from); no internal API is called. The result is normalized into one shape, and the viewer knows nothing about Airbnb.

The collection stops by itself when Airbnb starts blocking requests (a page without data, HTTP 401/403, three failures in a row) or when the number of requests gets suspicious (no more than `max(300, 4 × expected pages)`). 429/5xx errors are retried after 2, 4 and 8 s.

If you set a price range yourself, only that range is split, and in the same mode as yours: per night, or per stay when "Display total price" is on.

The full design, including what was verified against the live site, is in [docs/superpowers/specs/2026-09-28-airbnb-sorter-design.md](docs/superpowers/specs/2026-09-28-airbnb-sorter-design.md) (in Russian).

## Limitations and risks

- Homes search only (`/s/…/homes`); experiences and services are not supported.
- Airbnb's results are personalized and can change while the collection runs, so single listings may be lost.
- The script depends on the structure of Airbnb's pages. When Airbnb changes it, the collection fails with a message like "Could not collect the search: no …", where the part after "no" names the path that stopped resolving — a hint for what to fix in `src/extract.js`.
- Airbnb's terms of service prohibit automated data collection. The script runs in your own session, with pauses and limits, but the risk of account restrictions is not zero. Use at your own risk.

## Development

```bash
npm install
npm test        # unit tests (node:test); the collector is tested against a synthetic Airbnb
npm run dev     # UI dev stand on synthetic data: http://localhost:8000/  (?lang=ru for Russian)
npm run build   # dist/airbnb-sorter.user.js and dist/airbnb-sorter.inject.js
```

`dist/airbnb-sorter.inject.js` is the same program without Tampermonkey: paste its contents into the console on an Airbnb search page and the same button appears. Handy for debugging; the cache lives in localStorage in that mode.

Layout:

| File | Responsibility |
|---|---|
| `src/extract.js` | search page HTML → results, page cursors, price histogram |
| `src/normalize.js` | Airbnb listing → the app's `Listing` shape |
| `src/price.js` | price strings ("€1,234", "1 234 €", "CHF 1'234") |
| `src/search-url.js` | search URLs: cleanup, price ranges, pages |
| `src/collector.js` | price splitting, request queue, retries, stopping, cancel |
| `src/cache.js` | cache of the last collection |
| `src/i18n.js` | UI texts (English, Russian) |
| `src/viewer/` | the overlay in a Shadow DOM: cards, list, map (Leaflet + OpenStreetMap), sorting |
| `src/launcher.js`, `src/main.js` | the on-page button and the wiring |
| `src/userscript.js`, `dev/inject.js` | entry points for Tampermonkey and for running without it |

Releasing: bump `version` in `package.json`, `npm run build`, commit the rebuilt `dist/airbnb-sorter.user.js` (it is the install/update URL) and attach it to a GitHub release named `v<version>`. Installed copies update themselves from that file.

Requires Node.js 22+.

## License

[MIT](LICENSE). Map by [Leaflet](https://leafletjs.com/) with [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles.
