// Shared UI building blocks (pure DOM + createElementNS, zero innerHTML).
import { AFFILIATION_NOTICE, PRODUCT_NAME, REPO_URL } from '../config.js';
import { snippet } from '../core/text.js';
import { app } from '../app/state.js';
import { h, fmt, safeLinkedInUrl } from './h.js';
import { icon, ghostAvatar, ghostCompany, logo, svgEl } from './icons.js';

export function avatar(size = 56, extraClass = '') {
  return h(`div.avatar${extraClass ? `.${extraClass}` : ''}`, { style: { width: `${size}px`, height: `${size}px` } }, ghostAvatar(size));
}

export function companyLogo(size = 48) {
  return h('div.co-logo', { style: { width: `${size}px`, height: `${size}px` } }, ghostCompany(size));
}

export function headlineOf(p, fallbackCompany = '') {
  const company = p.company || fallbackCompany;
  if (p.position && company) return `${p.position} at ${company}`;
  if (p.position) return p.position;
  if (company) return company;
  return p.isConnection ? 'Connection' : 'Not a connection';
}

/** Person name, linked to their LinkedIn profile only in real archives (disabled in sample mode). */
export function personName(p, cls = 'row__name') {
  const url = app.report?.isSample ? null : safeLinkedInUrl(p.url);
  if (!url) return h(`span.${cls}`, p.name);
  return h(`a.${cls}`, { href: url, target: '_blank', rel: 'noopener noreferrer', title: `Open ${p.name}'s profile on LinkedIn` }, p.name);
}

export function card(...children) { return h('section.card', ...children); }

export function cardHeader(title, subtitle, right = null, { lg = false, small = false, level = 'h2' } = {}) {
  return h(
    `header.card__header${lg ? '.card__header--lg' : ''}`,
    h(
      'div.card__titles',
      h(`${level}.card__title${small ? '.card__title--16' : ''}`, title),
      subtitle ? h('p.card__subtitle', subtitle) : null,
    ),
    right,
  );
}

export function cardFooterLink(label, href) {
  return h('a.card__footer', { href }, label, icon('arrowRight', 16));
}

export function pills(options, value, onChange, label = 'Filter') {
  return h(
    'div.pills',
    { role: 'group', 'aria-label': label },
    options.map((o) => h(
      'button.pill',
      {
        type: 'button',
        'aria-pressed': String(o.value === value),
        onclick: () => onChange(o.value),
      },
      o.label,
      o.count !== undefined ? h('span.pill__count', ` (${fmt(o.count)})`) : null,
    )),
  );
}

// ---------- Empty-state illustrations (pure createElementNS, dark-mode contrast safe) ----------
const ART = {
  done: () => svgEl(
    'svg',
    { viewBox: '0 0 160 120', 'aria-hidden': 'true' },
    svgEl('rect', { x: 22, y: 30, width: 116, height: 74, rx: 8, fill: 'var(--surface-2)' }),
    svgEl('rect', { x: 34, y: 18, width: 92, height: 74, rx: 6, fill: 'var(--surface)', stroke: 'var(--border-strong)' }),
    svgEl('rect', { x: 46, y: 34, width: 48, height: 6, rx: 3, fill: 'var(--ghost-bg)' }),
    svgEl('rect', { x: 46, y: 48, width: 68, height: 6, rx: 3, fill: 'var(--ghost-bg)' }),
    svgEl('rect', { x: 46, y: 62, width: 40, height: 6, rx: 3, fill: 'var(--ghost-bg)' }),
    svgEl('circle', { cx: 118, cy: 82, r: 18, fill: 'var(--success)' }),
    svgEl('path', { d: 'M110 82l6 6 11-12', fill: 'none', stroke: 'var(--on-accent)', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ),
  search: () => svgEl(
    'svg',
    { viewBox: '0 0 160 120', 'aria-hidden': 'true' },
    svgEl('rect', { x: 20, y: 24, width: 100, height: 72, rx: 8, fill: 'var(--surface-2)' }),
    svgEl('rect', { x: 32, y: 40, width: 40, height: 40, rx: 4, fill: 'var(--ghost-bg)' }),
    svgEl('rect', { x: 80, y: 44, width: 28, height: 6, rx: 3, fill: 'var(--ghost-bg)' }),
    svgEl('rect', { x: 80, y: 58, width: 20, height: 6, rx: 3, fill: 'var(--ghost-bg)' }),
    svgEl('circle', { cx: 112, cy: 70, r: 20, fill: 'var(--surface)', stroke: 'var(--action)', 'stroke-width': 6 }),
    svgEl('path', { d: 'M126 84l14 14', stroke: 'var(--action)', 'stroke-width': 8, 'stroke-linecap': 'round' }),
  ),
  people: () => svgEl(
    'svg',
    { viewBox: '0 0 160 120', 'aria-hidden': 'true' },
    svgEl('circle', { cx: 56, cy: 46, r: 18, fill: 'var(--ghost-bg)' }),
    svgEl('path', { d: 'M26 100c0-18 13-30 30-30s30 12 30 30z', fill: 'var(--ghost-bg)' }),
    svgEl('circle', { cx: 106, cy: 50, r: 15, fill: 'var(--cover-1)' }),
    svgEl('path', { d: 'M80 100c0-15 11-25 26-25s26 10 26 25z', fill: 'var(--cover-1)' }),
    svgEl('circle', { cx: 128, cy: 30, r: 12, fill: 'var(--action)' }),
    svgEl('path', { d: 'M123 30h10M128 25v10', stroke: 'var(--on-accent)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
  ),
  briefcase: () => svgEl(
    'svg',
    { viewBox: '0 0 160 120', 'aria-hidden': 'true' },
    svgEl('rect', { x: 36, y: 38, width: 88, height: 62, rx: 8, fill: 'var(--ghost-bg)' }),
    svgEl('rect', { x: 62, y: 26, width: 36, height: 16, rx: 4, fill: 'none', stroke: 'var(--ghost-fg)', 'stroke-width': 5 }),
    svgEl('rect', { x: 36, y: 58, width: 88, height: 6, fill: 'var(--ghost-fg)', opacity: 0.5 }),
    svgEl('circle', { cx: 120, cy: 88, r: 18, fill: 'var(--success)' }),
    svgEl('path', { d: 'M112 88l6 6 11-12', fill: 'none', stroke: 'var(--on-accent)', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ),
};

export function emptyState({ art = 'done', title, text, action, compact = false, level = 'h2' }) {
  const buildArt = ART[art] || ART.done;
  return h(
    `div.empty${compact ? '.empty--compact' : ''}`,
    h('div.empty__art', buildArt()),
    h(`${level}.empty__title`, title),
    text ? h('p.empty__text', text) : null,
    action || null,
  );
}

// ---------- Rails ----------
export function siteFooter(actions) {
  return h(
    'footer.site-footer',
    h(
      'div.site-footer__links',
      h('button', { type: 'button', onclick: actions.about }, 'About'),
      h('a', { href: 'privacy.html' }, 'Privacy Policy'),
      h('button', { type: 'button', onclick: actions.help }, 'Help'),
      h('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
      actions.deleteAll ? h('button', { type: 'button', onclick: actions.deleteAll }, 'Delete my data') : null,
    ),
    h('p.site-footer__notice', AFFILIATION_NOTICE),
    h('div.site-footer__brand', logo(14), h('span', h('b', PRODUCT_NAME), ' · MIT License')),
  );
}

export function manageCard(current, counts) {
  const item = (route, label, iconName, count) => h(
    'a.side-item',
    { href: `#/${route}`, 'aria-current': current === route ? 'page' : null },
    icon(iconName, 24),
    h('span.side-item__label', label),
    count !== undefined ? h('span.side-item__count', fmt(count)) : null,
  );
  return card(
    cardHeader('Manage', null, null, { small: true, level: 'div' }),
    h(
      'nav.side-list',
      { 'aria-label': 'Lists' },
      item('replies', 'Replies', 'message', counts.replies),
      item('recruiters', 'Recruiters', 'briefcase', counts.recruiters),
      item('reconnect', 'Reconnect', 'people', counts.reconnect),
      item('companies', 'Companies', 'building'),
    ),
  );
}

export function shareCard(onShare) {
  return card(
    h(
      'div.card__body.share-card',
      h('p.t-12.t-low.share-card__tag', 'Open source · Local-only'),
      h('p.t-16.t-bold', 'Know someone who is job hunting?'),
      h('p.t-14.t-low.share-card__copy', `Their next role may be sitting in an unanswered LinkedIn message. Share ${PRODUCT_NAME} with your network.`),
      h('button.btn.btn--secondary.btn--block', { type: 'button', onclick: onShare }, icon('share', 16), 'Share on LinkedIn'),
    ),
  );
}

export const COVERS = ['var(--cover-1)', 'var(--cover-2)', 'var(--cover-3)', 'var(--cover-4)', 'var(--cover-5)'];
export function coverFor(key) {
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
  return COVERS[n % COVERS.length];
}

/** A quoted message with "... see more" expansion (session RAM only). */
export function quote(text, max = 220) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  if (clean.length <= max) return h('div.row__quote', clean);
  const el = h('div.row__quote', snippet(clean, max), ' ');
  const more = h('button.see-more', {
    type: 'button',
    onclick: () => { el.textContent = clean; },
  }, 'see more');
  el.appendChild(more);
  return el;
}
