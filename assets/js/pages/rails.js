// Shared left and right rails plus Sample Mode and saved-session banners.
import { h, fmt } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { avatar, card, cardHeader, manageCard, shareCard, siteFooter, companyLogo } from '../ui/parts.js';
import { shortDate } from '../core/time.js';
import { app, counts, hasSessionQuotes } from '../app/state.js';

export function leftRail(route, actions) {
  const r = app.report;
  const s = r.stats;
  const storageNote = r.isSample
    ? 'Sample session (not saved)'
    : app.persist
      ? 'Saved locally (90-day expiry, no message text)'
      : 'Memory only (cleared when tab closes)';

  const profile = h(
    'section.card.profile-card',
    h('div.profile-card__cover'),
    h(
      'div.profile-card__body',
      avatar(72, 'profile-card__avatar'),
      h(
        'div.profile-card__info',
        h('div.profile-card__name', r.me.name || 'You'),
        r.me.headline ? h('p.profile-card__headline.clamp-2', r.me.headline) : null,
      ),
    ),
    h(
      'div.profile-card__stats',
      h('a.stat-row', { href: '#/companies' }, h('span', 'Connections'), h('span.stat-row__value', fmt(s.connections))),
      h('div.stat-row', h('span', 'Never messaged'), h('span.stat-row__value', `${s.neverMessagedPct}%`)),
      h('div.stat-row', h('span', 'Active this year'), h('span.stat-row__value', fmt(s.activeThisYear))),
    ),
    h(
      'div.profile-card__archive',
      h('div', r.isSample ? 'Sample data' : `Archive up to ${shortDate(r.archiveDate || r.createdAt)}`),
      h('div.t-low', storageNote),
      h('button.inline-link.t-12', { type: 'button', onclick: actions.openArchive }, r.isSample ? 'Open your own archive' : 'Open a newer archive'),
    ),
  );
  return h(`aside.rail.rail--left${route === 'home' ? '.rail--left-home' : ''}`, profile, h('div.rail--sticky', manageCard(route, counts())));
}

export function rightRail(actions, { insights = true, extra = null } = {}) {
  const r = app.report;
  const s = r.stats;
  const blocks = [];
  if (extra) blocks.push(extra);
  if (insights) {
    blocks.push(card(
      cardHeader('Network insights', null, h('span.t-low', { title: 'Calculated locally on this device' }, icon('info', 16)), { small: true }),
      h(
        'ul.insights',
        h('li.insight', h('span.insight__dot'), h('span', h('b', `${s.neverMessagedPct}%`), ` of your ${fmt(s.connections)} connections have never exchanged a message with you`)),
        h('li.insight', h('span.insight__dot'), h('span', h('b', fmt(s.activeThisYear)), ' people you had a two-way conversation with this year')),
        h('li.insight', h('span.insight__dot'), h('span', h('b', fmt(s.conversations)), ' conversations analyzed, ', h('b', fmt(s.messages)), ' messages')),
      ),
    ));
    if (r.topCompanies.length) {
      blocks.push(card(
        cardHeader('Top companies in your network', null, null, { small: true }),
        h(
          'div.company-rows',
          r.topCompanies.slice(0, 5).map((c) => h(
            'button.company-row',
            { type: 'button', onclick: () => actions.searchCompany(c.name) },
            companyLogo(32),
            h('span.company-row__name', h('span.clamp-1', c.name), h('span.company-row__meta', `${fmt(c.count)} connections · ${fmt(c.talked)} talked`)),
            icon('chevronRight', 20),
          )),
        ),
        h('a.card__footer', { href: '#/companies' }, 'Search all companies', icon('arrowRight', 16)),
      ));
    }
  }
  blocks.push(shareCard(actions.share));
  blocks.push(siteFooter(actions));
  return h('aside.rail.rail--right', h('div.rail--sticky.rail__stack', blocks));
}

export function sampleBanner(actions) {
  if (!app.report?.isSample) return null;
  return h(
    'section.card.banner',
    icon('info', 24),
    h(
      'div.banner__text',
      h('p.banner__title', 'You are viewing fictional sample data'),
      h('p.t-low', 'Alex Morgan and these contacts are fictional examples. Open your own LinkedIn archive locally to see your real action lists.'),
      h(
        'div.banner__actions',
        h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: actions.getArchive }, 'Get my archive'),
        h('button.btn.btn--secondary.btn--sm', { type: 'button', onclick: actions.openArchive }, 'I already have my .zip'),
      ),
    ),
  );
}

export function quotesNoticeBanner(actions) {
  if (!app.report || app.report.isSample || hasSessionQuotes()) return null;
  return h(
    'section.card.banner',
    icon('shield', 24),
    h(
      'div.banner__text',
      h('p.banner__title', 'Saved action list (message text omitted for privacy)'),
      h('p.t-low', 'Reply Debt never writes message bodies, InMail subjects, or invitation notes to browser storage. Reopen your .zip anytime to view message quotes in memory.'),
      h(
        'div.banner__actions',
        h('button.btn.btn--secondary.btn--sm', { type: 'button', onclick: actions.openArchive }, 'Reopen .zip to view quotes'),
      ),
    ),
  );
}
