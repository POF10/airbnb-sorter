import { el } from './dom.js';
import { createCard } from './card.js';

const CHUNK = 60;

// Card grid that renders CHUNK cards at a time; the next chunk renders when the sentinel nears the viewport.
export function createList({ onHover }) {
  const root = el('div', 'abs-list');
  const grid = el('div', 'abs-grid');
  const sentinel = el('div', 'abs-sentinel');
  root.append(grid, sentinel);

  let items = [];
  let rendered = 0;
  const observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) renderMore();
  }, { root, rootMargin: '800px 0px' });

  function renderMore() {
    if (rendered >= items.length) return;
    const fragment = document.createDocumentFragment();
    for (const listing of items.slice(rendered, rendered + CHUNK)) fragment.append(createCard(listing));
    rendered = Math.min(items.length, rendered + CHUNK);
    grid.append(fragment);
    // Re-observing makes a sentinel that is still visible fire again for the next chunk.
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }

  let hovered = null;
  const hover = id => {
    if (id === hovered) return;
    hovered = id;
    onHover(id);
  };
  grid.addEventListener('mouseover', e => hover(e.target.closest('.abs-card')?.dataset.id ?? null));
  grid.addEventListener('mouseleave', () => hover(null));

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
      grid.querySelector('.abs-card--hl')?.classList.remove('abs-card--hl');
      if (id) grid.querySelector(`.abs-card[data-id="${id}"]`)?.classList.add('abs-card--hl');
    },
  };
}
