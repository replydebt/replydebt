// Home: the week at a glance + compact Archive & Algorithm Signals preview.
import { h, plural, fmt } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { card, cardHeader, cardFooterLink, emptyState } from '../ui/parts.js';
import { app, replies, recruiters, weekly } from '../app/state.js';
import { leftRail, rightRail, sampleBanner, quotesNoticeBanner } from './rails.js';
import { replyRow, recruiterRow, reconnectCard } from './rows.js';

function renderHomeSignalsCard() {
  const ins = app.report.insights;
  if (!ins) return null;
  const cred = ins.credibility;
  const soc = ins.social;
  const act = ins.activity;
  const bullets = [];

  if (cred && cred.topTopics.length) {
    const top = cred.topTopics[0];
    bullets.push(h(
      'li.insight',
      h('span.insight__dot'),
      h('span', 'Top LinkedIn authority topic: ', h('b', `${top.topic} (${top.score.toFixed(2)} / 4)`), cred.pillars.length ? ` · ${plural(cred.pillars.length, '5-pillar specialty', '5-pillar specialties')}` : ''),
    ));
  } else if (ins.persona && ins.persona.inferredSkillCount > 0) {
    bullets.push(h(
      'li.insight',
      h('span.insight__dot'),
      h('span', 'LinkedIn ad-targeting graph associates ', h('b', `${fmt(ins.persona.inferredSkillCount)} inferred skills`), ' with your profile'),
    ));
  }

  if (soc && (soc.followedInNetwork > 0 || soc.alumniConnections > 0 || soc.endorsementsReceived > 0)) {
    const parts = [];
    if (soc.followedInNetwork > 0) parts.push(`${plural(soc.followedInNetwork, 'followed company', 'followed companies')} in your network`);
    if (soc.alumniConnections > 0) parts.push(`${plural(soc.alumniConnections, 'shared-company colleague')}`);
    if (soc.endorsementsReceived > 0) parts.push(`${plural(soc.endorsementsReceived, 'skill endorsement')} received`);
    bullets.push(h('li.insight', h('span.insight__dot'), h('span', parts.join(' · '))));
  }

  if (act && (act.reactionsTotal > 0 || act.sharesTotal > 0 || act.commentsTotal > 0)) {
    bullets.push(h(
      'li.insight',
      h('span.insight__dot'),
      h('span', h('b', fmt(act.sharesTotal)), ' posts, ', h('b', fmt(act.commentsTotal)), ' comments, and ', h('b', fmt(act.reactionsTotal)), ' reactions summarized locally'),
    ));
  } else if (soc && soc.outboundStale90d > 0) {
    bullets.push(h(
      'li.insight',
      h('span.insight__dot'),
      h('span', h('b', plural(soc.outboundStale90d, 'sent invitation')), ' pending for over 90 days'),
    ));
  }

  if (!bullets.length) return null;

  return card(
    cardHeader(
      ins.coverage.isComplete ? 'Algorithm & archive signals' : 'Archive & social capital signals',
      ins.coverage.isComplete
        ? 'Decoded locally from your Complete LinkedIn archive'
        : 'Decoded locally from your archive metadata',
      h(`span.tag${ins.coverage.isComplete ? '' : '.tag--accent'}`, icon('chart', 12), ins.coverage.isComplete ? 'Complete' : 'Insights'),
    ),
    h('ul.insights', bullets),
    cardFooterLink('Explore all archive & algorithm insights', '#/insights'),
  );
}

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

    renderHomeSignalsCard(),
  );

  return h('div.layout', leftRail('home', actions), main, rightRail(actions));
}
