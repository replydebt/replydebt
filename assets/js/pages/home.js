// Home: the week at a glance.
import { h, plural } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { card, cardHeader, cardFooterLink, emptyState } from '../ui/parts.js';
import { app, replies, recruiters, weekly } from '../app/state.js';
import { leftRail, rightRail, sampleBanner, quotesNoticeBanner } from './rails.js';
import { replyRow, recruiterRow, reconnectCard } from './rows.js';

export function renderHome(actions) {
  const rep = replies();
  const rec = recruiters();
  const week = weekly();
  const first = (app.report.me.name || '').split(' ')[0];

  const main = h(
    'main.main',
    { id: 'main' },
    sampleBanner(actions),
    quotesNoticeBanner(actions),
    h('h1.sr-only', 'Home'),

    card(
      cardHeader(
        rep.length ? `${plural(rep.length, 'person is', 'people are')} waiting for your reply` : 'Replies',
        rep.length ? 'Questions and recent messages first' : null,
      ),
      rep.length
        ? h('div.list.list--bordered', rep.slice(0, 3).map(replyRow))
        : emptyState({ art: 'done', compact: true, level: 'h3', title: 'You are all caught up', text: first ? `Nobody is waiting on you, ${first}.` : 'Nobody is waiting on you.' }),
      rep.length > 3 ? cardFooterLink(`Show all ${rep.length}`, '#/replies') : null,
    ),

    card(
      cardHeader(
        rec.length ? `${plural(rec.length, 'recruiter')} reached out and never heard back` : 'Recruiters',
        rec.length ? 'Reply now, or keep the connection warm for later' : null,
      ),
      rec.length
        ? h('div.list.list--bordered', rec.slice(0, 2).map(recruiterRow))
        : emptyState({ art: 'briefcase', compact: true, level: 'h3', title: 'No unanswered recruiters', text: app.report.recruiters.length ? 'You have replied to every detected recruiter.' : 'No recruiter outreach was detected in your archive.' }),
      rec.length > 2 ? cardFooterLink(`Show all ${rec.length}`, '#/recruiters') : app.report.recruiters.length ? cardFooterLink('See all recruiters', '#/recruiters') : null,
    ),

    card(
      cardHeader('Say hi this week', null, h('span.week-label', icon('clock', 14), 'New picks every Monday')),
      week.length
        ? h('div.pgrid', week.slice(0, 3).map(reconnectCard))
        : emptyState({ art: 'people', compact: true, level: 'h3', title: 'Done for this week', text: app.report.reconnect.length ? 'Come back on Monday for five new people.' : 'No quiet connections with prior message history were found.' }),
      week.length > 3 ? cardFooterLink(`See all ${week.length} for this week`, '#/reconnect') : null,
    ),
  );

  return h('div.layout', leftRail('home', actions), main, rightRail(actions));
}
