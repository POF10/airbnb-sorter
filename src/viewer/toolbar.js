import { el, button } from './dom.js';
import { SORTS, RATING_STEPS, REVIEW_STEPS, hasActiveFilters, formatCount } from './logic.js';
import { t } from '../i18n.js';

// The row of controls that decide what is shown: sort order, rating and review thresholds, the two
// toggles and Reset. The filters and the toggles are the overlay's state: draw() repaints them, and
// every user action comes back through a callback. The toolbar itself only knows which menu is open.
//   onSort(sortId), onFilter(patch of { minRating, minReviews, hideViewed }), onAreaToggle(checked), onReset()
export function createToolbar({ sortId, onSort, onFilter, onAreaToggle, onReset }) {
  const sortSelect = el('select', 'abs-select abs-select--small');
  for (const [id, { label }] of Object.entries(SORTS)) {
    const option = el('option', null, label);
    option.value = id;
    sortSelect.append(option);
  }
  sortSelect.value = sortId;
  sortSelect.addEventListener('change', () => onSort(sortSelect.value));

  const menus = [];
  // Closes whatever menu is open; true when there was one.
  function closeMenus() {
    let closed = false;
    for (const { pill, box } of menus) {
      if (box.hidden) continue;
      box.hidden = true;
      pill.setAttribute('aria-expanded', 'false');
      closed = true;
    }
    return closed;
  }

  // A pill showing the current threshold; its menu lists the thresholds with how many listings each leaves.
  function dropdown(key, title, steps, format) {
    const pill = button('', 'abs-pill');
    pill.setAttribute('aria-haspopup', 'true');
    pill.setAttribute('aria-expanded', 'false');
    const box = el('div', 'abs-menu');
    box.hidden = true;
    menus.push({ pill, box });
    pill.addEventListener('click', () => {
      const open = box.hidden;
      closeMenus();
      box.hidden = !open;
      pill.setAttribute('aria-expanded', String(open));
    });
    const wrap = el('div', 'abs-dd');
    wrap.append(pill, box);
    return {
      el: wrap,
      draw(current, counts) {
        pill.textContent = current === 0 ? `${title} ▾` : `${title}: ${format(current)} ▾`;
        pill.classList.toggle('abs-pill--on', current !== 0);
        box.replaceChildren(...steps.map((step, i) => {
          const option = button('', 'abs-opt');
          option.setAttribute('aria-pressed', String(step === current));
          option.append(el('span', null, step === 0 ? t().filters.any : format(step)), el('span', 'abs-count', formatCount(counts[i])));
          option.addEventListener('click', () => {
            closeMenus();
            onFilter({ [key]: step });
            pill.focus(); // the option is gone; without this the focus would fall out of the overlay
          });
          return option;
        }));
      },
    };
  }

  function toggle(text, onChange) {
    const box = el('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => onChange(box.checked));
    const label = el('label', 'abs-toggle');
    label.append(box, text);
    return { box, label };
  }

  const rating = dropdown('minRating', `★ ${t().filters.rating}`, RATING_STEPS, step => `${step.toFixed(1)}+`);
  const reviews = dropdown('minReviews', t().filters.reviews, REVIEW_STEPS, step => `${step}+`);
  const area = toggle(t().onlyInMap, onAreaToggle);
  const hide = toggle(t().filters.hideViewed, checked => onFilter({ hideViewed: checked }));
  const resetBtn = button(t().filters.reset, 'abs-btn abs-btn--small abs-reset');
  resetBtn.addEventListener('click', () => onReset());

  const root = el('div', 'abs-filters');
  root.append(sortSelect, el('span', 'abs-sep'), rating.el, reviews.el, el('span', 'abs-sep'), area.label, hide.label, resetBtn);

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
    },
  };
}
