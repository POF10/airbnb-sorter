import { el } from './dom.js';
import { createCard } from './card.js';
import { formatMoney } from './logic.js';

// More pins than this in view -> pins shrink to dots (price shows on hover).
const DENSE_LIMIT = 150;

// Leaflet map with Airbnb-style price pins. `L` is the Leaflet global. The map always shows every
// collected listing; filtering the list by the visible area is the overlay's job.
export function createMap(container, { L, onMarkerHover, onMoveEnd }) {
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

  // A hidden (0×0) map cannot be fitted; the fit then waits for the container to get a size.
  let pendingFit = false;
  function fitAll() {
    if (markers.size === 0) return;
    const size = map.getSize();
    if (!size.x || !size.y) {
      pendingFit = true;
      return;
    }
    pendingFit = false;
    const bounds = L.latLngBounds([...markers.values()].map(m => m.getLatLng()));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
  }

  // Leaflet only reacts to window resizes; the header wrapping and the list/map switch resize the container too.
  new ResizeObserver(() => {
    map.invalidateSize();
    if (pendingFit) fitAll();
  }).observe(container);

  return {
    setListings(listings) {
      layer.clearLayers();
      markers.clear();
      highlighted = null;
      for (const listing of listings) {
        if (listing.lat == null || listing.lng == null) continue;
        const label = el('span', 'abs-pin-label', formatMoney(listing.price.amount, listing.price.currency));
        const marker = L.marker([listing.lat, listing.lng], {
          icon: L.divIcon({ className: 'abs-pin', html: label, iconSize: null }),
          riseOnHover: true,
          keyboard: false,
        });
        marker.on('mouseover', () => onMarkerHover(listing.id));
        marker.on('mouseout', () => onMarkerHover(null));
        marker.bindPopup(() => createCard(listing, { compact: true }), {
          className: 'abs-popup', closeButton: false, minWidth: 260, maxWidth: 260, offset: [0, -12],
        });
        marker.addTo(layer);
        markers.set(listing.id, marker);
      }
      fitAll();
      updateDensity();
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
    getBounds() {
      const b = map.getBounds();
      return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    },
    invalidateSize() {
      map.invalidateSize();
    },
    fitAll,
  };
}
