// Bottom-left toasts with optional Undo, like LinkedIn.
import { h } from './h.js';
import { icon } from './icons.js';

let host = null;

export function clearToasts() {
  if (!host) return;
  host.querySelectorAll('.toast').forEach((t) => t.remove());
}

export function toast(text, { action, icon: iconName = 'checkCircle', tone = 'success', duration = 6000 } = {}) {
  if (!host) {
    host = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  // LinkedIn shows one toast at a time.
  clearToasts();

  let timer;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('toast--leaving');
    setTimeout(() => el.remove(), 160);
  };
  const el = h(`div.toast${tone === 'info' ? '.toast--info' : ''}`,
    icon(iconName, 24),
    h('div.toast__text', text, action && h('button.toast__action', {
      type: 'button',
      onclick: () => { action.onClick(); close(); },
    }, action.label)),
    h('button.btn.btn--circle.btn--small', { type: 'button', 'aria-label': 'Dismiss notification', onclick: close }, icon('close', 20)),
  );
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(close, 2500); });
  host.appendChild(el);
  timer = setTimeout(close, duration);
  return close;
}
