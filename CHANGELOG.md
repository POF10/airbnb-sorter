# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.3.1] - 2026-10-02

### Fixed

- Dragging the map no longer selects the text of the note on it.

## [0.3.0] - 2026-10-02

### Added

- Filters by minimum rating (4.5+, 4.7+, 4.8+, 4.9+) and by minimum number of reviews (5+, 20+, 50+, 100+), each option with a count of the listings it leaves. Airbnb has neither.
- "Viewed" marks: listings opened from the overlay or on Airbnb itself are dimmed in the list and grey on the map; "Hide viewed" removes them.
- A note on the map and an "empty area" message saying that the overlay only shows what the Airbnb search found.
- "· map area" in the title when the search was limited to a map rectangle.
- Chrome extension: a welcome page after the install, and in the popup a "How it works" link, a "Rate" link and a counter of viewed listings with "Clear".

### Changed

- Sort order, filters and toggles sit in one toolbar under the header; the choices are remembered.
- Filtering never moves the map: pins appear and disappear in place.

## [0.2.0] - 2026-10-01

### Added

- Chrome extension (Manifest V3) built from the same code, with a settings popup for the interface language. Published in the Chrome Web Store.
- The overlay remembers the last sort order.
- A support link: the ♥ in the overlay header and a button in the popup.
- Privacy policy.

### Changed

- With both the userscript and the extension installed, only one of them runs on a page.

## [0.1.0] - 2026-09-30

### Added

- First release: a Tampermonkey userscript that collects a whole Airbnb homes search past the 270-listing cap by splitting it into price ranges, and shows it sortable by price, rating or number of reviews, with photos and a map.
- English and Russian interface; the last collection is cached.

[0.3.1]: https://github.com/POF10/airbnb-sorter/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/POF10/airbnb-sorter/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/POF10/airbnb-sorter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/POF10/airbnb-sorter/releases/tag/v0.1.0
