// Replies, Recruiters, and Reconnect list pages.
import { h, plural, fmt } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { card, cardHeader, pills, emptyState } from '../ui/parts.js';
import { DAY } from '../core/time.js';
import { app, replies, recruiters, weekly, reconnectPool, recruiterDone } from '../app/state.js';
import { leftRail, rightRail, sampleBanner, quotesNoticeBanner } from './rails.js';
import { replyRow, recruiterRow, reconnectCard, reconnectRow } from './rows.js';

const filters = { replies: 'all', recruiters: 'open' };

function howCard(title, lines) {
  return card(
    cardHeader(title, null, null, { small: true }),
    h('div.how', lines.map((l) => h('p', l))),
  );
}

// ---------- Replies ----------
export function renderReplies(actions, rerender) {
  const all = replies();
  const now = Date.now();
  const sets = {
    all,
    questions: all.filter((r) => r.question),
    old: all.filter((r) => now - r.date > 90 * DAY),
  };
  const f = filters.replies;
  const list = sets[f] || all;

  const body = all.length === 0
    ? emptyState({ art: 'done', title: 'You are all caught up', text: 'Nobody is waiting for a reply from you. New items appear whenever you open a newer archive.' })
    : list.length === 0
      ? emptyState({ art: 'done', compact: true, title: 'Nothing here', text: 'Try another filter.' })
      : h('div.list.list--bordered', list.map(replyRow));

  const main = h(
    'main.main',
    { id: 'main' },
    sampleBanner(actions),
    quotesNoticeBanner(actions),
    card(
      cardHeader('Replies waiting on you', all.length ? `${plural(all.length, 'conversation')} where the other person wrote last` : null, null, { level: 'h1' }),
      all.length ? pills([
        { value: 'all', label: 'All', count: sets.all.length },
        { value: 'questions', label: 'Asked you a question', count: sets.questions.length },
        { value: 'old', label: 'Older than 3 months', count: sets.old.length },
      ], f, (v) => { filters.replies = v; rerender(); }) : null,
      body,
    ),
  );
  const extra = howCard('How we pick these', [
    h('span', 'Someone ', h('b', 'you have talked to before'), ' (or a direct connection asking a question) sent the last message within the past 12 months.'),
    h('span', 'Short sign-offs like "Thanks!" are skipped, along with threads where you already replied in a newer conversation.'),
  ]);
  return h('div.layout', leftRail('replies', actions), main, rightRail(actions, { insights: false, extra }));
}

// ---------- Recruiters ----------
export function renderRecruiters(actions, rerender) {
  const open = recruiters();
  const everything = recruiters({ includeDone: true });
  const done = everything.filter(recruiterDone);
  const recent = everything.filter((r) => Date.now() - r.date < 183 * DAY);
  const f = filters.recruiters;
  const list = f === 'open' ? open : f === 'done' ? done : f === 'recent' ? recent : everything;

  let body;
  if (everything.length === 0) {
    body = emptyState({
      art: 'briefcase',
      title: 'No recruiter outreach detected',
      text: app.report.recruiters.length
        ? 'You have hidden or dismissed all detected recruiters. Restore them anytime from the Me menu.'
        : 'We checked every 1:1 conversation and invitation note and did not detect hiring outreach. Casual messages without hiring keywords appear under Replies.',
    });
  } else if (list.length === 0) {
    body = emptyState({
      art: 'briefcase',
      compact: true,
      title: f === 'open' ? 'You have answered every recruiter' : 'Nothing here',
      text: f === 'open' ? 'Switch to "All" to follow up with any of them.' : 'Try another filter.',
    });
  } else {
    body = h('div.list.list--bordered', list.map(recruiterRow));
  }

  const main = h(
    'main.main',
    { id: 'main' },
    sampleBanner(actions),
    quotesNoticeBanner(actions),
    card(
      cardHeader('Recruiters who reached out', everything.length ? `${plural(everything.length, 'recruiter')} · ${fmt(open.length)} never heard back` : null, null, { level: 'h1' }),
      everything.length ? pills([
        { value: 'open', label: 'Not replied', count: open.length },
        { value: 'recent', label: 'Last 6 months', count: recent.length },
        { value: 'done', label: 'Replied', count: done.length },
        { value: 'all', label: 'All', count: everything.length },
      ], f, (v) => { filters.recruiters = v; rerender(); }) : null,
      body,
    ),
  );
  const extra = howCard('Tip', [
    h('span', h('b', 'Not looking right now?'), ' A brief "not now, let\'s stay in touch" keeps the relationship warm.'),
    h('span', 'Misclassified contact? Use ', icon('more', 14), ' then ', h('b', 'Not a recruiter'), '.'),
  ]);
  return h('div.layout', leftRail('recruiters', actions), main, rightRail(actions, { insights: false, extra }));
}

// ---------- Reconnect ----------
export function renderReconnect(actions) {
  const week = weekly();
  const weekKeys = new Set(week.map((w) => w.personKey));
  const rest = reconnectPool().filter((r) => !weekKeys.has(r.personKey));

  const main = h(
    'main.main',
    { id: 'main' },
    sampleBanner(actions),
    card(
      cardHeader('Say hi this week', 'Connections you used to talk to and have not heard from in a while', h('span.week-label', icon('clock', 14), 'New picks every Monday'), { level: 'h1' }),
      week.length
        ? h('div.pgrid', week.map(reconnectCard))
        : emptyState({ art: 'people', title: 'You are done for this week', text: 'Come back on Monday for five new picks.' }),
    ),
    rest.length ? card(
      cardHeader('More people you have lost touch with', `${plural(rest.length, 'person', 'people')}, strongest prior conversations first`),
      h('div.list.list--bordered', rest.slice(0, 50).map(reconnectRow)),
    ) : null,
  );
  const extra = howCard('Why five a week?', [
    'Reaching out to everyone at once feels overwhelming. Five personal check-ins a week takes under ten minutes.',
    h('span', 'We pick connections with ', h('b', 'at least four exchanged messages'), ' and ', h('b', 'over six months'), ' since your last chat.'),
  ]);
  return h('div.layout', leftRail('reconnect', actions), main, rightRail(actions, { insights: false, extra }));
}
