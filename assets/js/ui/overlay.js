// Bottom-right draft composer. Copies a draft message and opens the matching LinkedIn thread or profile.
import { app } from '../app/state.js';
import { templatesFor } from '../analyze/templates.js';
import { h, copyText, pasteHint, safeLinkedInUrl, threadUrl } from './h.js';
import { icon } from './icons.js';
import { avatar, headlineOf } from './parts.js';

let current = null;

export function closeComposer({ restoreFocus = true } = {}) {
  if (!current) return;
  const { el, cleanup, previouslyFocused } = current;
  current = null;
  cleanup();
  el.remove();
  if (restoreFocus && previouslyFocused && previouslyFocused.isConnected && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }
}

/**
 * @param {object} opts
 * @param {object} opts.person   report person
 * @param {'recruiter'|'reply'|'reconnect'|'intro'} opts.kind
 * @param {object} opts.ctx      template context ({ me, date, target, since })
 * @param {string} [opts.context] quoted text shown above the composer
 * @param {string} [opts.convId] conversation to open
 * @param {() => void} [opts.onSent] called after primary action
 */
export function openComposer({ person, kind, ctx = {}, context, convId, onSent, contextLabel = 'They wrote' }) {
  const previouslyFocused = document.activeElement;
  closeComposer({ restoreFocus: false });

  const isSample = Boolean(app.report?.isSample);
  const templates = templatesFor(kind, person, ctx);
  let selected = templates[0]?.id;

  const textarea = h('textarea.composer', { 'aria-label': `Message to ${person.name}`, spellcheck: 'true' });
  textarea.value = templates[0]?.text || '';

  const chips = h('div.chips', { role: 'group', 'aria-label': 'Templates' });
  const renderChips = () => {
    chips.replaceChildren(...templates.map((t) => h('button.chip', {
      type: 'button',
      'aria-pressed': String(t.id === selected),
      onclick: () => {
        selected = t.id;
        textarea.value = t.text;
        renderChips();
        textarea.focus();
      },
    }, t.label)));
  };
  renderChips();

  const url = threadUrl(convId || person.lastConvId) || safeLinkedInUrl(person.url) || 'https://www.linkedin.com/messaging/';
  const opensThread = Boolean(threadUrl(convId || person.lastConvId));
  const first = person.name.split(' ')[0];

  const copyBtn = h('button.btn.btn--tertiary.btn--sm', {
    type: 'button',
    onclick: async () => {
      const ok = await copyText(textarea.value);
      copyBtn.lastChild.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => { if (copyBtn.isConnected) copyBtn.lastChild.textContent = 'Copy'; }, 1600);
    },
  }, icon('copy', 16), h('span', 'Copy'));

  const sendBtn = h(
    'button.btn.btn--primary.btn--sm',
    {
      type: 'button',
      onclick: async () => {
        await copyText(textarea.value);
        if (!isSample) window.open(url, '_blank', 'noopener,noreferrer');
        closeComposer({ restoreFocus: false });
        onSent?.();
      },
    },
    isSample ? 'Copy draft & mark done' : 'Copy & open in LinkedIn',
    isSample ? null : icon('external', 16),
  );

  let minimized = false;
  const minBtn = h('button.btn.btn--circle.btn--small', {
    type: 'button',
    'aria-label': 'Minimize message window',
    'aria-expanded': 'true',
  }, icon('chevronDown', 20));

  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  let el;
  const syncViewport = () => {
    if (!el) return;
    if (!vv || minimized || window.innerWidth > 767) {
      el.style.top = '';
      el.style.height = '';
      el.style.bottom = '';
      return;
    }
    el.style.top = `${Math.max(0, Math.round(vv.offsetTop))}px`;
    el.style.height = `${Math.round(vv.height)}px`;
    el.style.bottom = 'auto';
  };

  const toggleMinimize = () => {
    minimized = !minimized;
    el.classList.toggle('msg-overlay--min', minimized);
    minBtn.setAttribute('aria-label', minimized ? 'Expand message window' : 'Minimize message window');
    minBtn.setAttribute('aria-expanded', String(!minimized));
    minBtn.replaceChildren(icon(minimized ? 'chevronUp' : 'chevronDown', 20));
    syncViewport();
  };
  minBtn.addEventListener('click', toggleMinimize);

  const header = h(
    'header.msg-overlay__header',
    { onclick: (e) => { if (!e.target.closest('button')) toggleMinimize(); } },
    avatar(32),
    h(
      'div.msg-overlay__who',
      h('div.msg-overlay__name.clamp-1', person.name),
      h('div.msg-overlay__headline.clamp-1', headlineOf(person)),
    ),
    minBtn,
    h('button.btn.btn--circle.btn--small', { type: 'button', 'aria-label': 'Close message window', onclick: () => closeComposer() }, icon('close', 20)),
  );

  const hintText = isSample
    ? 'Sample mode: copies your draft to the clipboard and marks this item handled without opening LinkedIn.'
    : opensThread
      ? `Opens your conversation with ${first} on LinkedIn. Then ${pasteHint()} and press Send.`
      : `Opens ${first}'s LinkedIn profile. Click Message, ${pasteHint()}, and press Send.`;

  el = h(
    'aside.msg-overlay',
    { role: 'dialog', 'aria-label': `Message ${person.name}` },
    header,
    h(
      'div.msg-overlay__body',
      context ? h('p.msg-overlay__context.clamp-2', `${contextLabel}: `, h('q', context)) : null,
      chips,
      textarea,
      h('p.msg-overlay__hint', icon('info', 16), h('span', hintText)),
    ),
    h('footer.msg-overlay__footer', copyBtn, sendBtn),
  );

  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) closeComposer();
  };
  document.addEventListener('keydown', onKey);
  if (vv) {
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
  }
  window.addEventListener('resize', syncViewport);

  document.body.appendChild(el);
  syncViewport();
  current = {
    el,
    previouslyFocused,
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      if (vv) {
        vv.removeEventListener('resize', syncViewport);
        vv.removeEventListener('scroll', syncViewport);
      }
      window.removeEventListener('resize', syncViewport);
    },
  };
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}
