// Accessible modal dialog with focus trap, clean listener teardown, and ESC to close.
import { h } from './h.js';
import { icon } from './icons.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';
const openModals = new Set();
let modalSeq = 0;

export function closeAllModals() {
  for (const close of [...openModals]) close();
}

export function openModal({ title, body, footer = [], wide = false, onClose, label }) {
  const previouslyFocused = document.activeElement;
  const titleId = `modal-title-${++modalSeq}`;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    openModals.delete(close);
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (openModals.size === 0) document.body.style.overflow = '';
    onClose?.();
    if (previouslyFocused && previouslyFocused.isConnected && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  };

  const dialog = h(
    `div.modal${wide ? '.modal--wide' : ''}`,
    { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-label': label, tabindex: '-1' },
    h(
      'div.modal__header',
      h('h2.modal__title', { id: titleId }, title),
      h('button.btn.btn--circle', { type: 'button', 'aria-label': 'Dismiss', onclick: close }, icon('close')),
    ),
    h('div.modal__body', body),
    footer.length ? h('div.modal__footer', footer) : null,
  );
  const backdrop = h('div.modal-backdrop', { onpointerdown: (e) => { if (e.target === backdrop) close(); } }, dialog);

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  openModals.add(close);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const bodyEl = dialog.querySelector('.modal__body');
  const footerEl = dialog.querySelector('.modal__footer');
  const target = dialog.querySelector('[data-autofocus]')
    || bodyEl?.querySelector(FOCUSABLE)
    || footerEl?.querySelector(FOCUSABLE)
    || dialog;
  target.focus();

  return { close, dialog };
}

/** Confirmation dialog. Resolves true/false. */
export function confirmModal({ title, text, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title,
      body: h('p', text),
      footer: [
        h('button.btn.btn--secondary', { type: 'button', onclick: () => m.close() }, cancelLabel),
        h('button.btn.btn--primary', { type: 'button', 'data-autofocus': true, onclick: () => { result = true; m.close(); } }, confirmLabel),
      ],
      onClose: () => resolve(result),
    });
  });
}
