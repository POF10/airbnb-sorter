import { isHomesSearchPath } from './search-url.js';
import { t } from './i18n.js';

const STYLE = [
  'all:initial', 'position:fixed', 'right:24px', 'bottom:24px', 'z-index:2147483646',
  'padding:12px 18px', 'border-radius:24px', 'background:#222', 'color:#fff', 'cursor:pointer',
  'font:600 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
  'box-shadow:0 4px 12px rgba(0,0,0,.25)',
].join(';');

// Floating launch button, visible only on homes search pages. Airbnb is a SPA and the userscript runs
// in an isolated world (it can't hook the page's history.pushState), so the URL is polled.
export function createLauncher(onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = t().launcher;
  btn.setAttribute('style', STYLE);
  btn.addEventListener('click', () => {
    btn.blur(); // otherwise Space/Enter under the overlay would press it again
    onClick();
  });
  document.body.append(btn);

  let lastHref = null;
  const sync = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    btn.style.display = isHomesSearchPath(location.pathname) ? 'block' : 'none';
  };
  sync();
  setInterval(sync, 500);
  return btn;
}
