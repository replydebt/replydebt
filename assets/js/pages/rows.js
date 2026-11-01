// Row and card builders for Replies, Recruiters, Reconnect, and Companies.
import { h, plural } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { avatar, personName, headlineOf, quote, coverFor } from '../ui/parts.js';
import { toggleMenu, menuItem } from '../ui/menu.js';
import { openComposer } from '../ui/overlay.js';
import { toast } from '../ui/toast.js';
import { relTime, relPhrase, monthName } from '../core/time.js';
import { app, person, setMark, hidePerson, recId, repId, reconId, recruiterDone, getQuote } from '../app/state.js';

const meName = () => app.report?.me?.name || '';
const sentToastText = () => (app.report?.isSample
  ? 'Draft copied and marked as replied.'
  : 'Message copied. Paste it in LinkedIn and press Send.');

/** Fade the element out, then apply the state change. */
function leave(el, cls, apply) {
  el.classList.add(cls);
  setTimeout(apply, 180);
}

function moreMenu(items) {
  const btn = h(
    'button.btn.btn--circle.btn--small',
    { type: 'button', 'aria-label': 'More actions', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    icon('more', 20),
  );
  btn.addEventListener('click', () => toggleMenu(btn, () => items.map(([label, fn, ic]) => menuItem(label, fn, ic ? icon(ic, 20) : null))));
  return h('div.menu-anchor', btn);
}

function hideAction(p, el) {
  return ['Hide this person everywhere', () => leave(el, 'row--leaving', () => {
    const undo = hidePerson(p.key);
    toast(`${p.name} won't appear in your lists.`, { action: { label: 'Undo', onClick: undo } });
  }), 'eyeOff'];
}

function trustBadges(p, { limit = 2 } = {}) {
  const tags = [];
  if (p.recReceived && p.recGiven) tags.push(h('span.tag', 'Mutual recommendation'));
  else if (p.recReceived) tags.push(h('span.tag', 'Recommended you'));
  else if (p.recGiven) tags.push(h('span.tag.tag--accent', 'You recommended'));
  if (p.endorsedMe > 0) {
    tags.push(h('span.tag.tag--accent', p.endorsedMe > 1 ? `Endorsed you (${p.endorsedMe})` : 'Endorsed you'));
  } else if (p.endorsedThem > 0) {
    tags.push(h('span.tag.tag--subtle', 'You endorsed'));
  }
  if (p.sharedCompany) tags.push(h('span.tag.tag--subtle', 'Shared company'));
  return tags.slice(0, limit);
}

function trustContextNotes(p) {
  const parts = [];
  if (p.recReceived) parts.push('recommended you');
  else if (p.recGiven) parts.push('you recommended them');
  if (p.endorsedMe > 0) parts.push(`endorsed ${plural(p.endorsedMe, 'skill')}`);
  if (p.sharedCompany) parts.push(`shared employer (${p.sharedCompany})`);
  return parts.join(', ');
}

// ---------- Replies ----------
export function replyRow(item) {
  const p = person(item.personKey);
  const q = getQuote(repId(item));
  const text = q?.text || '';
  const el = h('article.row');
  const done = () => {
    const undo = setMark(repId(item), 'done');
    toast(sentToastText(), { action: { label: 'Undo', onClick: undo } });
  };
  const reply = () => openComposer({
    person: p,
    kind: 'reply',
    ctx: { me: meName(), date: item.date },
    context: text,
    convId: item.convId,
    onSent: () => leave(el, 'row--leaving', done),
  });
  const dismiss = () => leave(el, 'row--leaving', () => {
    const undo = setMark(repId(item), 'dismissed');
    toast('Removed from your replies.', { action: { label: 'Undo', onClick: undo } });
  });
  el.append(
    avatar(56, 'row__avatar'),
    h(
      'div.row__main',
      personName(p),
      h('div.row__headline.clamp-1', headlineOf(p)),
      h('div.row__meta', item.question ? 'Asked you a question' : 'Wrote to you', ` · ${relTime(item.date)}`),
      quote(text),
    ),
    h(
      'div.row__actions',
      h('button.btn.btn--tertiary', { type: 'button', onclick: dismiss }, 'Dismiss'),
      h('button.btn.btn--secondary', { type: 'button', onclick: reply }, 'Reply'),
      moreMenu([
        ['Mark as replied', () => leave(el, 'row--leaving', () => {
          const undo = setMark(repId(item), 'done');
          toast('Marked as replied.', { action: { label: 'Undo', onClick: undo } });
        }), 'check'],
        hideAction(p, el),
      ]),
    ),
  );
  return el;
}

// ---------- Recruiters ----------
export function recruiterRow(item) {
  const p = person(item.personKey);
  const q = getQuote(recId(item));
  const text = q?.text || '';
  const subject = q?.subject || '';
  const el = h('article.row');
  const isDone = recruiterDone(item);
  const company = item.company || p.company;
  const reply = () => openComposer({
    person: { ...p, company },
    kind: 'recruiter',
    ctx: { me: meName(), date: item.date, company },
    context: text,
    convId: item.convId,
    contextLabel: item.source === 'invitation' ? 'Invitation note' : 'They wrote',
    onSent: () => {
      const undo = setMark(recId(item), 'done');
      toast(sentToastText(), { action: { label: 'Undo', onClick: undo } });
    },
  });
  const dismiss = () => leave(el, 'row--leaving', () => {
    const undo = setMark(recId(item), 'dismissed');
    toast('Recruiter dismissed.', { action: { label: 'Undo', onClick: undo } });
  });
  const headline = p.position ? headlineOf({ ...p, company }) : company ? `Recruiting for ${company}` : 'Recruiter';
  const sourceLabel = item.source === 'invitation'
    ? 'Sent you an invitation with a note'
    : subject
      ? `InMail: ${subject}`
      : item.inmail
        ? 'InMail'
        : 'Messaged you';

  el.append(
    avatar(56, 'row__avatar'),
    h(
      'div.row__main',
      personName(p),
      h('div.row__headline.clamp-1', headline),
      h(
        'div.row__meta',
        sourceLabel,
        ` · ${relTime(item.date)}`,
        isDone ? h('span.row__flag', ' · ', icon('checkCircle', 16), 'Replied') : null,
      ),
      quote(text),
    ),
    h(
      'div.row__actions',
      isDone ? null : h('button.btn.btn--tertiary', { type: 'button', onclick: dismiss }, 'Dismiss'),
      h(`button.btn.${isDone ? 'btn--muted' : 'btn--secondary'}`, { type: 'button', onclick: reply }, isDone ? 'Follow up' : 'Reply'),
      moreMenu([
        ...(isDone ? [] : [['Mark as replied', () => leave(el, 'row--leaving', () => {
          const undo = setMark(recId(item), 'done');
          toast('Marked as replied.', { action: { label: 'Undo', onClick: undo } });
        }), 'check']]),
        ['Not a recruiter', () => leave(el, 'row--leaving', () => {
          const undo = setMark(recId(item), 'notRecruiter');
          toast('Removed from Recruiters.', { action: { label: 'Undo', onClick: undo } });
        }), 'close'],
        hideAction(p, el),
      ]),
    ),
  );
  return el;
}

// ---------- Reconnect ----------
function sayHi(item, el, cls) {
  const p = person(item.personKey);
  const trust = trustContextNotes(p);
  openComposer({
    person: p,
    kind: 'reconnect',
    ctx: { me: meName(), since: `last time was ${monthName(item.lastAt)}` },
    context: `${plural(item.total, 'message')} together, last one ${relPhrase(item.lastAt)}${trust ? ` · ${trust}` : ''}`,
    contextLabel: 'History',
    onSent: () => leave(el, cls, () => {
      const undo = setMark(reconId(item), 'done', { days: 90 });
      toast(`We'll keep ${p.name.split(' ')[0]} off your list for 90 days.`, { action: { label: 'Undo', onClick: undo } });
    }),
  });
}

export function reconnectCard(item) {
  const p = person(item.personKey);
  const el = h('article.pcard');
  const badges = trustBadges(p, { limit: 1 });
  const skip = () => leave(el, 'pcard--leaving', () => {
    const undo = setMark(reconId(item), 'skipped', { days: 7 });
    toast(`Skipped ${p.name.split(' ')[0]} for this week.`, { action: { label: 'Undo', onClick: undo } });
  });
  el.append(
    h('div.pcard__cover', { style: { background: coverFor(p.key) } }),
    h('button.pcard__dismiss', { type: 'button', 'aria-label': `Skip ${p.name} this week`, onclick: skip }, icon('close', 20)),
    avatar(96, 'pcard__avatar'),
    h(
      'div.pcard__body',
      personName(p, 'pcard__name'),
      h('p.pcard__headline.clamp-2', headlineOf(p)),
      badges.length ? h('div.row__tags', badges) : null,
      h('p.pcard__meta', icon('message', 16), `${plural(item.total, 'message')} · ${relTime(item.lastAt)} ago`),
    ),
    h(
      'div.pcard__footer',
      h('button.btn.btn--secondary.btn--block', { type: 'button', onclick: () => sayHi(item, el, 'pcard--leaving') }, icon('send', 16), 'Say hi'),
    ),
  );
  return el;
}

export function reconnectRow(item) {
  const p = person(item.personKey);
  const el = h('article.row');
  const badges = trustBadges(p, { limit: 2 });
  el.append(
    avatar(56, 'row__avatar'),
    h(
      'div.row__main',
      h('div.row__title-line', personName(p), badges),
      h('div.row__headline.clamp-1', headlineOf(p)),
      h('div.row__meta', `${plural(item.total, 'message')} together · last ${relTime(item.lastAt)} ago`),
    ),
    h(
      'div.row__actions',
      h('button.btn.btn--secondary', { type: 'button', onclick: () => sayHi(item, el, 'row--leaving') }, 'Say hi'),
      moreMenu([
        ['Not interested', () => leave(el, 'row--leaving', () => {
          const undo = setMark(reconId(item), 'dismissed');
          toast('Removed from Reconnect.', { action: { label: 'Undo', onClick: undo } });
        }), 'close'],
        hideAction(p, el),
      ]),
    ),
  );
  return el;
}

// ---------- Companies ----------
export function companyPersonRow(p, { target, warmest }) {
  const el = h('article.row');
  const talked = p.sent + p.received;
  const trust = trustContextNotes(p);
  const badges = [
    warmest ? h('span.tag', icon('check', 12), 'Warmest path') : null,
    ...trustBadges(p, { limit: 2 }),
  ].filter(Boolean);
  let meta;
  if (talked > 0) meta = `${plural(talked, 'message')} together · last ${relTime(p.lastAt)} ago`;
  else if (p.connectedOn) meta = `Connected ${relTime(p.connectedOn)} ago · never messaged`;
  else meta = 'Never messaged';
  el.append(
    avatar(56, 'row__avatar'),
    h(
      'div.row__main',
      h('div.row__title-line', personName(p), badges),
      h('div.row__headline.clamp-1', headlineOf(p)),
      h('div.row__meta', meta),
    ),
    h(
      'div.row__actions',
      h(`button.btn.${warmest ? 'btn--primary' : 'btn--secondary'}`, {
        type: 'button',
        onclick: () => openComposer({
          person: p,
          kind: 'intro',
          ctx: { me: meName(), target: p.company || target },
          context: [
            talked ? `${plural(talked, 'message')} together, last one ${relPhrase(p.lastAt)}` : 'You have not messaged each other yet',
            trust,
          ].filter(Boolean).join(' · '),
          contextLabel: 'History',
        }),
      }, 'Ask for intro'),
    ),
  );
  return el;
}
