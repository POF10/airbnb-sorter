import { el, button } from './dom.js';
import { createCard, setCardViewed } from './card.js';
import { formatMoney } from './logic.js';

// More pins than this in view -> pins shrink to dots (price shows on hover).
const DENSE_LIMIT = 150;

const hasPoint = listing => listing.lat != null && listing.lng != null;

// Leaflet map with Airbnb-style price pins. `L` is Leaflet. The map shows the listings it is given;
// which ones those are (filters) and what the list does with the visible area is the overlay's job.
//   isViewed(id) — already opened listings get a grey pin;
//   onUserMove() — the user dragged, zoomed or key-panned the map (not a fit, not a resize).
export function createMap(container, { L, onMarkerHover, onMoveEnd, onUserMove = () => {}, isViewed = () => false }) {
  const map = L.map(container, { zoomControl: true }).setView([0, 0], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const markers = new Map();
  let highlighted = null;

  function updateDensity() {
    const bounds = map.getBounds();
    let visible = 0;
    for (const marker of markers.values()) if (bounds.contains(marker.getLatLng())) visible++;
    container.classList.toggle('abs-map--dense', visible > DENSE_LIMIT);
  }

  map.on('moveend', () => {
    updateDensity();
    onMoveEnd();
  });

  // The frame is the area the map was last asked to show (all collected listings). A hidden (0×0) map
  // cannot be fitted; the fit then waits for the container to get a size.
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

  // Dragging and the keyboard are always the user; zooming is the user unless it comes from our own fit.
  map.on('dragstart', () => onUserMove());
  map.on('zoomstart', () => { if (!fitting) onUserMove(); });
  container.addEventListener('keydown', e => {
    if (/^Arrow/.test(e.key) || ['+', '-', '='].includes(e.key)) onUserMove();
  });

  // Leaflet only reacts to window resizes; the header wrapping and the list/map switch resize the container too.
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
        const label = el('span', 'abs-pin-label', formatMoney(listing.price.amount, listing.price.currency));
        const marker = L.marker([listing.lat, listing.lng], {
          icon: L.divIcon({ className: isViewed(listing.id) ? 'abs-pin abs-pin--viewed' : 'abs-pin', html: label, iconSize: null }),
          riseOnHover: true,
          keyboard: false,
        });
        marker.on('mouseover', () => onMarkerHover(listing.id));
        marker.on('mouseout', () => onMarkerHover(null));
        marker.bindPopup(() => createCard(listing, { compact: true, viewed: isViewed(listing.id) }), {
          className: 'abs-popup', closeButton: false, minWidth: 260, maxWidth: 260, offset: [0, -12],
        });
        marker.addTo(layer);
        markers.set(listing.id, marker);
      }
      updateDensity();
    },
    // Frames these listings — all collected ones, so the frame does not depend on the filters.
    fit(listings) {
      const points = listings.filter(hasPoint).map(listing => [listing.lat, listing.lng]);
      if (points.length === 0) return;
      frame = L.latLngBounds(points);
      fitFrame();
      updateDensity();
    },
    // Back to the last frame (the narrow-screen switch to the map uses it).
    fitAll: fitFrame,
    // Re-reads the viewed state of the pins on the map and of the open popup's card.
    refreshViewed() {
      for (const [id, marker] of markers) marker.getElement()?.classList.toggle('abs-pin--viewed', isViewed(id));
      const card = container.querySelector('.leaflet-popup a.abs-card');
      if (card) setCardViewed(card, isViewed(card.dataset.id));
    },
    highlight(id) {
      const previous = highlighted && markers.get(highlighted);
      if (previous) {
        previous.getElement()?.classList.remove('abs-pin--hl');
        previous.setZIndexOffset(0);
      }
      highlighted = id;
      const marker = id && markers.get(id);
      if (marker) {
        marker.getElement()?.classList.add('abs-pin--hl');
        marker.setZIndexOffset(10000);
      }
    },
    // A note at the bottom of the map with a close button.
    showHint(text, closeLabel, onDismiss) {
      const control = L.control({ position: 'bottomleft' });
      control.onAdd = () => {
        const box = el('div', 'abs-map-hint');
        const close = button('×', 'abs-map-hint-close');
        close.title = closeLabel;
        close.setAttribute('aria-label', closeLabel);
        close.addEventListener('click', () => {
          control.remove();
          onDismiss();
        });
        box.append(el('span', null, text), close);
        // Clicks and scrolling on the note must not pan or zoom the map under it.
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
    },
  };
}
