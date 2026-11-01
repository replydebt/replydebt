// Global navigation bar: distinct Network Audit mark + company search + primary tabs + Me menu.
import { AFFILIATION_NOTICE, PRODUCT_NAME, REPO_URL } from '../config.js';
import { h, isMobileViewport } from './h.js';
import { icon, logo } from './icons.js';
import { avatar } from './parts.js';
import { toggleMenu, menuItem, closeMenu } from './menu.js';

const TABS = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'reconnect', label: 'Reconnect', icon: 'people', badge: 'reconnect' },
  { route: 'recruiters', label: 'Recruiters', icon: 'briefcase', badge: 'recruiters' },
  { route: 'replies', label: 'Replies', icon: 'message', badge: 'replies' },
  { route: 'companies', label: 'Companies', icon: 'building' },
];

export function appNav({ route, counts, me, query = '', actions }) {
  let currentMe = me;
  const input = h('input', {
    type: 'search',
    placeholder: 'Search companies',
    'aria-label': 'Search companies in your network',
    enterkeyhint: 'search',
    value: query,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const clearBtn = h(
    'button.gnav__search-clear',
    {
      type: 'button',
      'aria-label': 'Clear company search',
      hidden: query ? null : true,
      onclick: () => {
        input.value = '';
        syncClearBtn();
        actions.searchCompany('', { live: true });
        input.focus();
      },
    },
    icon('close', 14),
  );
  const syncClearBtn = () => {
    if (input.value.length > 0) clearBtn.removeAttribute('hidden');
    else clearBtn.setAttribute('hidden', '');
  };
  input.addEventListener('input', () => {
    syncClearBtn();
    const trimmed = input.value.trim();
    if (trimmed.length >= 2 || trimmed.length === 0) {
      actions.searchCompany(trimmed, { live: true });
    }
  });

  const search = h('form.gnav__search', {
    role: 'search',
    onsubmit: (e) => {
      e.preventDefault();
      actions.searchCompany(input.value.trim());
      if (isMobileViewport()) input.blur();
    },
  }, icon('search', 16), input, clearBtn);

  const tabRefs = new Map();
  const buildBadge = (n) => (n ? h('span.badge', { 'aria-label': `${n} pending` }, n > 99 ? '99+' : String(n)) : null);
  const tab = (t) => {
    const n = t.badge ? counts[t.badge] : 0;
    const iconWrap = h('span.gnav__icon', icon(t.icon, 24), buildBadge(n));
    const el = h(
      'a.gnav__item',
      { href: `#/${t.route}`, 'aria-current': route === t.route ? 'page' : null, title: t.label },
      iconWrap,
      h('span.gnav__label', t.label),
    );
    tabRefs.set(t.route, { el, iconWrap, spec: t });
    return el;
  };

  const meBtn = h(
    'button.gnav__item.gnav__me',
    { type: 'button', 'aria-label': 'Account and settings', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    h('span.gnav__icon', avatar(24)),
    h('span.gnav__label', 'Me', icon('caretDown', 16)),
  );
  meBtn.addEventListener('click', () => toggleMenu(meBtn, () => meMenu(currentMe, actions), 'menu--me'));

  const header = h(
    'header.gnav.gnav--app',
    h(
      'div.gnav__inner',
      h('a.gnav__brand', { href: '#/home', 'aria-label': `${PRODUCT_NAME} home` }, logo(34)),
      search,
      h(
        'nav.gnav__items',
        { 'aria-label': 'Primary' },
        TABS.map(tab),
      ),
      h('div.menu-anchor.gnav__me-anchor', meBtn),
      h('div.gnav__divider'),
      h('button.gnav__share', { type: 'button', 'aria-label': 'Share with your network', onclick: actions.share }, icon('share', 18), h('span.gnav__share-label', 'Share')),
    ),
  );

  header.sync = ({ route: nextRoute, counts: nextCounts, me: nextMe, query: nextQuery = '' }) => {
    currentMe = nextMe;
    for (const [r, ref] of tabRefs.entries()) {
      if (r === nextRoute) ref.el.setAttribute('aria-current', 'page');
      else ref.el.removeAttribute('aria-current');
      if (ref.spec.badge) {
        const n = nextCounts[ref.spec.badge] || 0;
        const oldBadge = ref.iconWrap.querySelector('.badge');
        if (n > 0) {
          const text = n > 99 ? '99+' : String(n);
          if (oldBadge) {
            oldBadge.textContent = text;
            oldBadge.setAttribute('aria-label', `${n} pending`);
          } else {
            ref.iconWrap.appendChild(buildBadge(n));
          }
        } else if (oldBadge) {
          oldBadge.remove();
        }
      }
    }
    if (document.activeElement !== input && input.value !== nextQuery) {
      input.value = nextQuery;
      syncClearBtn();
    }
  };

  return header;
}

function meMenu(me, actions) {
  const isDark = document.documentElement.dataset.theme === 'dark';
  return [
    h(
      'div.menu__header',
      h(
        'div.menu__me',
        avatar(56),
        h(
          'div',
          h('div.menu__me-name', me.name || 'You'),
          me.headline ? h('div.menu__me-headline.clamp-2', me.headline) : null,
        ),
      ),
      h('button.btn.btn--secondary.btn--sm.btn--block', { type: 'button', onclick: () => { closeMenu(); actions.openArchive(); } }, icon('upload', 16), 'Open a newer archive'),
    ),
    h(
      'div.menu__section',
      h('div.menu__title', 'Account'),
      menuItem('Archive & algorithm insights', actions.openInsights, icon('chart', 18)),
      menuItem('Change who I am', actions.changeMe, icon('user', 18)),
      menuItem(isDark ? 'Display: Light mode' : 'Display: Dark mode', actions.toggleTheme, icon(isDark ? 'sun' : 'moon', 18)),
      menuItem('How to get your archive', actions.help, icon('help', 18)),
    ),
    h(
      'div.menu__section',
      h('div.menu__title', 'Manage'),
      menuItem('Hidden people & dismissed items', actions.hidden, icon('eyeOff', 18)),
      menuItem('Privacy & storage', actions.privacy, icon('shield', 18)),
      menuItem('Delete data from this browser', actions.deleteAll, icon('trash', 18)),
    ),
  ];
}

export function guestNav({ onSample, onHow }) {
  const homeHref = typeof location !== 'undefined' && location.protocol === 'file:' ? 'index.html' : './';
  return h(
    'header.gnav.gnav--guest',
    h(
      'div.gnav__inner',
      h(
        'div.gnav__brand-wrap',
        h('a.gnav__brand', { href: homeHref, 'aria-label': PRODUCT_NAME }, logo(34), h('span.wordmark', PRODUCT_NAME)),
        h('span.gnav__affiliation', AFFILIATION_NOTICE),
      ),
      h(
        'div.gnav__guest-actions',
        h('button.btn.btn--tertiary.gnav__hide-mobile', { type: 'button', onclick: onHow }, 'How it works'),
        h('a.btn.btn--tertiary', { href: 'privacy.html' }, 'Privacy'),
        h('a.btn.btn--tertiary.gnav__hide-mobile', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
        h('button.btn.btn--secondary', { type: 'button', onclick: onSample }, 'Try sample data'),
      ),
    ),
  );
}
