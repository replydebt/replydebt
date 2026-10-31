// Portaled dropdown menus (Me menu, row "..." menus). Avoids card overflow clipping and supports keyboard navigation.
import { h } from './h.js';

let current = null;

export function closeMenu() {
  if (!current) return;
  const { el, anchor, cleanup } = current;
  current = null;
  cleanup();
  el.remove();
  anchor.setAttribute('aria-expanded', 'false');
}

function bottomObstructionHeight(vh) {
  const bnav = document.querySelector('.gnav__items');
  if (!bnav) return 0;
  const r = bnav.getBoundingClientRect();
  if (r.height <= 0 || r.top >= vh || r.height > 120) return 0;
  return r.top > vh * 0.5 ? Math.max(0, vh - r.top) : 0;
}

function positionMenu(anchor, el) {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeVh = vh - bottomObstructionHeight(vh);
  const spaceBelow = safeVh - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
  const availH = Math.max(96, Math.min(safeVh - 16, Math.floor(openAbove ? spaceAbove : spaceBelow)));
  el.style.maxHeight = `${availH}px`;
  document.body.appendChild(el);

  const menuW = el.offsetWidth || 264;
  const menuH = el.offsetHeight || 160;

  let left = rect.right - menuW;
  if (left < 8) left = 8;
  if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8);

  let top = openAbove ? rect.top - menuH - 4 : rect.bottom + 4;
  if (top + menuH > safeVh - 8) top = safeVh - menuH - 8;
  if (top < 8) top = 8;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/**
 * @param {HTMLElement} anchor   button that toggles the menu
 * @param {() => Node[]} build   content builder
 */
export function toggleMenu(anchor, build, className = 'menu--row') {
  if (current && current.anchor === anchor) {
    closeMenu();
    return;
  }
  closeMenu();
  const el = h(`div.menu.${className}`, { role: 'menu' }, build(closeMenu));
  positionMenu(anchor, el);
  anchor.setAttribute('aria-expanded', 'true');

  const items = () => [...el.querySelectorAll('[role="menuitem"]')];
  const initVw = window.innerWidth;
  const initVh = window.innerHeight;

  const onDown = (e) => {
    if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  const onResize = () => {
    if (Math.abs(window.innerWidth - initVw) > 2 || Math.abs(window.innerHeight - initVh) > 120) {
      closeMenu();
    }
  };
  const onScroll = (e) => {
    if (e?.target && (e.target === el || (e.target instanceof Node && el.contains(e.target)))) return;
    closeMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      anchor.focus();
      return;
    }
    const list = items();
    if (!list.length) return;
    const idx = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(idx + 1) % list.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(idx - 1 + list.length) % list.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1].focus();
    }
  };

  setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, true);

  current = {
    el,
    anchor,
    cleanup: () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    },
  };
  items()[0]?.focus();
}

export function menuItem(label, onClick, iconEl = null) {
  return h(
    'button.menu__item',
    { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); onClick(); } },
    iconEl,
    label,
  );
}
