// Companies: "Who do you know at..." ranked by conversation warmth & social capital, kept strictly in memory.
import { h, plural, fmt, isMobileViewport } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { card, cardHeader, emptyState, companyLogo, pills } from '../ui/parts.js';
import { companyKey } from '../core/text.js';
import { app, isHidden } from '../app/state.js';
import { searchCompany } from '../analyze/companies.js';
import { leftRail, rightRail, sampleBanner } from './rails.js';
import { companyPersonRow } from './rows.js';

export function renderCompanies(actions, query = '') {
  const people = app.report.people.filter((p) => !isHidden(p.key));
  const followedList = app.report.followedCompanies || [];
  const followedKeySet = new Set(followedList.map((c) => c.key));
  const filter = followedList.length > 0 && app.companyFilter === 'followed' ? 'followed' : 'top';

  const input = h('input.input', {
    type: 'search',
    value: query,
    placeholder: 'Company name, e.g. Lumen Labs',
    'aria-label': 'Company name',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const search = h(
    'form.company-search',
    {
      role: 'search',
      onsubmit: (e) => {
        e.preventDefault();
        actions.searchCompany(input.value.trim());
        if (isMobileViewport()) input.blur();
      },
    },
    input,
    h('button.btn.btn--primary', { type: 'submit' }, 'Search'),
    query ? h('button.btn.btn--tertiary', { type: 'button', onclick: () => actions.searchCompany('') }, 'Clear') : null,
  );

  const blocks = [sampleBanner(actions)];
  blocks.push(card(
    cardHeader('Who do you know at...', 'Find the warmest introduction path into any company', null, { lg: true, level: 'h1' }),
    search,
  ));

  if (query) {
    const res = searchCompany(people, query);
    if (!res.people.length) {
      blocks.push(card(emptyState({
        art: 'search',
        title: `No connections at "${query}"`,
        text: 'Try a shorter name or a different spelling. Company names match how they appear on your connections\' profiles.',
      })));
    } else {
      const main = res.companies[0].name;
      const isFollowed = followedKeySet.has(companyKey(main));
      const talked = res.people.filter((p) => p.sent + p.received > 0).length;
      const vouched = res.people.filter((p) => p.recReceived || p.recGiven || (p.endorsedMe || 0) + (p.endorsedThem || 0) > 0 || p.sharedCompany).length;
      const warmestIsWarm = res.people[0].warmth > 1.5;
      const metaParts = [plural(res.people.length, 'connection'), `${fmt(talked)} you have talked to`];
      if (vouched > 0) metaParts.push(`${fmt(vouched)} with shared trust signals`);
      blocks.push(card(
        h(
          'div.company-head',
          companyLogo(72),
          h(
            'div',
            h(
              'div.row__title-line',
              h('h2.company-head__name', main),
              isFollowed ? h('span.tag.tag--accent', 'Following') : null,
            ),
            h('p.company-head__meta', metaParts.join(' · ')),
          ),
        ),
        res.companies.length > 1 ? h('p.variants', `Also matched: ${res.companies.slice(1, 6).map((c) => c.name).join(', ')}`) : null,
        h('div.list.list--bordered', res.people.slice(0, 100).map((p, i) => companyPersonRow(p, { target: main, warmest: i === 0 && warmestIsWarm }))),
      ));
    }
  } else if (app.report.topCompanies.length || followedList.length) {
    const activeList = filter === 'followed' ? followedList : app.report.topCompanies;
    blocks.push(card(
      cardHeader(
        filter === 'followed' ? 'Followed companies in your network' : 'Top companies in your network',
        filter === 'followed'
          ? 'Companies you follow on LinkedIn where you already have 1st-degree connections inside'
          : 'Where most of your connections currently work',
      ),
      followedList.length > 0 ? pills(
        [
          { value: 'top', label: 'Top in network', count: app.report.topCompanies.length },
          { value: 'followed', label: 'Following', count: followedList.length },
        ],
        filter,
        (next) => actions.setCompanyFilter(next),
        'Company directory filter',
      ) : null,
      h(
        'div.company-rows',
        activeList.map((c) => h(
          'button.company-row',
          { type: 'button', onclick: () => actions.searchCompany(c.name) },
          companyLogo(48),
          h(
            'span.company-row__name',
            h('span.row__title-line', c.name, c.followed ? h('span.tag.tag--accent', 'Following') : null),
            h(
              'span.company-row__meta',
              `${plural(c.count, 'connection')} · ${fmt(c.talked)} you have talked to${c.vouched ? ` · ${fmt(c.vouched)} vouched/alumni` : ''}`,
            ),
          ),
          icon('chevronRight', 24),
        )),
      ),
    ));
  }

  const extra = card(
    cardHeader('What is a "warm path"?', null, null, { small: true }),
    h(
      'div.how',
      h('p', 'An introduction from someone who actually knows your work is far more effective than a cold application.'),
      h('p', 'Connections are ranked by ', h('b', 'two-way message history'), ', ', h('b', 'recommendations & endorsements'), ', ', h('b', 'shared employer history'), ', ', h('b', 'recency'), ', and ', h('b', 'tenure'), '.'),
    ),
  );
  return h('div.layout', leftRail('companies', actions), h('main.main', { id: 'main' }, blocks), rightRail(actions, { insights: false, extra }));
}
