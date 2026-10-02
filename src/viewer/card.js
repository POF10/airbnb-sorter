import { el, button } from './dom.js';
import { formatMoney, formatRating, photoUrl } from './logic.js';
import { t } from '../i18n.js';

const MAX_DOTS = 5;

// Only the first photo loads up front; the rest load when the user flips the carousel.
function createCarousel(listing) {
  const box = el('div', 'abs-photo');
  const img = el('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  if (listing.photos[0]) img.src = photoUrl(listing.photos[0]);
  box.append(img);
  if (listing.badges[0]) box.append(el('span', 'abs-badge', listing.badges[0]));

  const count = listing.photos.length;
  if (count > 1) {
    const dots = el('div', 'abs-dots');
    const dotCount = Math.min(count, MAX_DOTS);
    for (let i = 0; i < dotCount; i++) dots.append(el('span', 'abs-dot'));
    let index = 0;
    const show = target => {
      index = (target + count) % count;
      img.src = photoUrl(listing.photos[index]);
      const active = Math.round((index / (count - 1)) * (dotCount - 1));
      [...dots.children].forEach((dot, i) => dot.classList.toggle('abs-dot--on', i === active));
    };
    const prev = button('‹', 'abs-nav abs-nav--prev');
    const next = button('›', 'abs-nav abs-nav--next');
    prev.setAttribute('aria-label', t().prevPhoto);
    next.setAttribute('aria-label', t().nextPhoto);
    for (const [btn, step] of [[prev, -1], [next, 1]]) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        show(index + step);
      });
    }
    box.append(prev, next, dots);
    show(0);
  }
  return box;
}

function createBody(listing) {
  const body = el('div', 'abs-body');
  const top = el('div', 'abs-row');
  top.append(el('span', 'abs-title', listing.title ?? ''), el('span', 'abs-rating', formatRating(listing)));
  body.append(top);
  if (listing.name) body.append(el('div', 'abs-muted abs-ellipsis', listing.name));
  if (listing.details.length) body.append(el('div', 'abs-muted abs-ellipsis', listing.details.join(' · ')));

  const { amount, currency, qualifier, original } = listing.price;
  const price = el('div', 'abs-price');
  if (original != null) price.append(el('s', 'abs-muted', formatMoney(original, currency)));
  price.append(el('b', null, formatMoney(amount, currency)));
  if (qualifier) price.append(` ${qualifier}`);
  if (listing.pricePerNight != null) {
    price.append(el('span', 'abs-muted', ` · ≈ ${formatMoney(listing.pricePerNight, currency)}${t().perNight}`));
  }
  body.append(price);
  return body;
}

// The whole card links to the listing on Airbnb (new tab). `compact` is the map-popup variant;
// `viewed` marks a listing the user has already opened.
export function createCard(listing, { compact = false, viewed = false } = {}) {
  const card = el('a', compact ? 'abs-card abs-card--compact' : 'abs-card');
  card.href = listing.url;
  card.target = '_blank';
  card.rel = 'noopener';
  card.dataset.id = listing.id;
  card.append(createCarousel(listing), createBody(listing));
  if (viewed) setCardViewed(card, true);
  return card;
}

// Gives a rendered card the "viewed" look, or takes it away.
export function setCardViewed(card, viewed) {
  card.classList.toggle('abs-card--viewed', viewed);
  const photo = card.querySelector('.abs-photo');
  const mark = photo.querySelector('.abs-viewed');
  if (viewed && !mark) photo.append(el('span', 'abs-viewed', `✓ ${t().viewed}`));
  if (!viewed && mark) mark.remove();
}
