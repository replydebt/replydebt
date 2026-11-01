// Build a people + conversations graph from the raw export.
// Matches people by LinkedIn profile slug first so same-named people never merge and
// display-name changes over time never split a 1:1 thread into a false group chat.
import { nameKey, profileSlug, companyKey, fold } from './text.js';

const IGNORED_NAMES = new Set(['', 'linkedin member', 'linkedin', 'linkedin premium', 'sponsored']);

export function buildModel(data, me) {
  const meNames = new Set([nameKey(me.name)].filter(Boolean));
  const meSlugs = new Set(me.slugs || []);
  const isMe = (name, url) => {
    const slug = profileSlug(url);
    if (slug && meSlugs.has(slug)) return true;
    if (slug && meSlugs.size > 0) return false;
    return meNames.has(nameKey(name));
  };

  const people = new Map(); // key -> person
  const bySlug = new Map(); // slug -> person
  const byName = new Map(); // nameKey -> first person with that name
  const allByName = new Map(); // nameKey -> person[]
  let anonSeq = 0;

  const trackByName = (nk, p) => {
    if (!nk) return;
    if (!byName.has(nk)) byName.set(nk, p);
    let arr = allByName.get(nk);
    if (!arr) allByName.set(nk, (arr = []));
    if (!arr.includes(p)) arr.push(p);
  };

  const makePerson = (key, name, slug, url) => ({
    key,
    name: String(name || '').trim(),
    slug,
    url: slug ? url : '',
    company: '',
    position: '',
    connectedOn: null,
    isConnection: false,
    sent: 0,
    received: 0,
    firstAt: null,
    lastAt: null,
    lastFromMeAt: null,
    lastFromThemAt: null,
    conversations: 0,
    lastConvId: null,
    endorsedMe: 0,
    endorsedThem: 0,
    recReceived: false,
    recGiven: false,
    sharedCompany: '',
  });

  // 1. Register every 1st-degree connection without merging distinct people who share a name.
  for (const c of data.connections) {
    const slug = profileSlug(c.url);
    const nk = nameKey(c.name);
    let p = slug ? bySlug.get(slug) : null;
    if (!p) {
      let key;
      if (slug) {
        key = `in:${slug}`;
      } else if (nk && !people.has(`n:${nk}`)) {
        key = `n:${nk}`;
      } else {
        key = `n:${nk || 'member'}#${++anonSeq}`;
      }
      p = makePerson(key, c.name, slug, c.url);
      people.set(key, p);
      if (slug) bySlug.set(slug, p);
      trackByName(nk, p);
    }
    p.isConnection = true;
    p.company = c.company || p.company;
    p.position = c.position || p.position;
    p.connectedOn = c.connectedOn ?? p.connectedOn;
    if (!p.url && slug && c.url) p.url = c.url;
    if (!p.name && c.name) p.name = c.name;
  }

  // 2. Resolve message/invitation participants by slug first, falling back to nameKey only when slug is absent.
  const getPerson = (name, url) => {
    const slug = profileSlug(url);
    const nk = nameKey(name);
    if (slug) {
      const hit = bySlug.get(slug);
      if (hit) {
        if (!hit.name && name) hit.name = String(name).trim();
        return hit;
      }
      const slugless = nk ? byName.get(nk) : null;
      if (slugless && !slugless.slug && !slugless.isConnection) {
        people.delete(slugless.key);
        slugless.key = `in:${slug}`;
        slugless.slug = slug;
        slugless.url = url;
        people.set(slugless.key, slugless);
        bySlug.set(slug, slugless);
        return slugless;
      }
      const p = makePerson(`in:${slug}`, name, slug, url);
      people.set(p.key, p);
      bySlug.set(slug, p);
      trackByName(nk, p);
      return p;
    }
    if (nk && byName.has(nk)) return byName.get(nk);
    const key = nk ? `n:${nk}` : `n:member#${++anonSeq}`;
    const p = makePerson(key, name, '', '');
    people.set(key, p);
    trackByName(nk, p);
    return p;
  };

  // 3. Group messages by conversation.
  const grouped = new Map();
  for (const m of data.messages) {
    if (m.folder === 'SPAM' || m.folder.includes('SPONSORED')) continue;
    let list = grouped.get(m.conversationId);
    if (!list) grouped.set(m.conversationId, (list = []));
    list.push(m);
  }

  const conversations = [];
  let skipped = 0;
  for (const [id, msgs] of grouped) {
    msgs.sort((a, b) => a.date - b.date);

    // Key participants by LinkedIn profile slug when available so name changes stay 1:1.
    // Track normalized names in a Set for O(1) lookup and stop collecting once >= 2 distinct others confirm a group thread.
    const others = new Map(); // participantKey -> { name, url, slug, nk }
    const otherNks = new Set();
    const addOther = (rawName, rawUrl) => {
      const name = String(rawName || '').trim();
      if (!name || isMe(name, rawUrl)) return;
      const nk = nameKey(name);
      if (IGNORED_NAMES.has(nk)) return;
      const slug = profileSlug(rawUrl);
      if (slug) {
        const key = `in:${slug}`;
        // Upgrade any earlier URL-less mention of the same name within this thread.
        if (nk && others.has(`n:${nk}`)) {
          const prev = others.get(`n:${nk}`);
          others.delete(`n:${nk}`);
          others.set(key, { name: name || prev.name, url: rawUrl, slug, nk: nk || prev.nk });
          if (nk) otherNks.add(nk);
          return;
        }
        const existing = others.get(key);
        if (!existing) {
          if (others.size >= 3) return;
          others.set(key, { name, url: rawUrl, slug, nk });
          if (nk) otherNks.add(nk);
        } else {
          if (name) existing.name = name;
          if (!existing.url && rawUrl) existing.url = rawUrl;
          if (nk) otherNks.add(nk);
        }
        return;
      }
      // No URL on this mention: attach to an existing slugged participant in this thread in O(1) if names match.
      if (nk && otherNks.has(nk)) return;
      if (others.size >= 3) return;
      const key = `n:${nk}`;
      if (!others.has(key)) {
        others.set(key, { name, url: '', slug: '', nk });
        if (nk) otherNks.add(nk);
      }
    };

    for (const m of msgs) {
      const urlFor = (i) => (
        m.to.length === m.recipientUrls.length
          ? m.recipientUrls[i]
          : (m.to.length === 1 ? m.recipientUrls[0] : '')
      );
      if (!isMe(m.from, m.senderUrl)) addOther(m.from, m.senderUrl);
      for (let i = 0; i < m.to.length; i++) {
        addOther(m.to[i], urlFor(i));
      }
    }

    const otherList = [...others.values()];
    if (otherList.length === 0) continue;
    const isGroup = otherList.length > 1;

    const conv = {
      id,
      personKey: null,
      isGroup,
      title: msgs[0].title || '',
      subject: (msgs.find((m) => m.subject) || {}).subject || '',
      inmail: msgs.some((m) => m.subject && m.subject.trim().length > 0),
      startedByMe: isMe(msgs[0].from, msgs[0].senderUrl),
      count: msgs.length,
      mine: 0,
      theirs: 0,
      firstAt: msgs[0].date,
      lastAt: msgs[msgs.length - 1].date,
      lastFromMe: isMe(msgs[msgs.length - 1].from, msgs[msgs.length - 1].senderUrl),
      lastText: msgs[msgs.length - 1].content,
      firstTheirText: '',
      firstTheirAt: null,
      lastTheirText: '',
      lastTheirAt: null,
      lastMineAt: null,
      theirFolded: '',
    };
    const theirTexts = [];
    for (const m of msgs) {
      if (isMe(m.from, m.senderUrl)) {
        conv.mine++;
        conv.lastMineAt = m.date;
      } else {
        conv.theirs++;
        if (!conv.firstTheirAt) {
          conv.firstTheirAt = m.date;
          conv.firstTheirText = m.content;
        }
        conv.lastTheirAt = m.date;
        conv.lastTheirText = m.content;
        if (theirTexts.length < 4) theirTexts.push(m.content);
      }
    }
    conv.theirFolded = fold([conv.subject, ...theirTexts].join(' \n '));

    if (!isGroup) {
      const o = otherList[0];
      const p = getPerson(o.name, o.url);
      // Real members have a profile URL. Senders without one (sponsored messages, company pages,
      // LinkedIn system senders) are skipped unless you are connected or replied to them.
      if (!p.url && !p.isConnection && conv.mine === 0) {
        skipped++;
        continue;
      }
      conv.personKey = p.key;
      p.conversations++;
      p.sent += conv.mine;
      p.received += conv.theirs;
      p.firstAt = p.firstAt ? Math.min(p.firstAt, conv.firstAt) : conv.firstAt;
      if (!p.lastAt || conv.lastAt >= p.lastAt) p.lastConvId = conv.id;
      p.lastAt = p.lastAt ? Math.max(p.lastAt, conv.lastAt) : conv.lastAt;
      if (conv.lastMineAt) p.lastFromMeAt = Math.max(p.lastFromMeAt || 0, conv.lastMineAt);
      if (conv.lastTheirAt) p.lastFromThemAt = Math.max(p.lastFromThemAt || 0, conv.lastTheirAt);
    }
    conversations.push(conv);
  }

  // 4. Incoming invitations with a personal note (often recruiters).
  const invites = [];
  for (const v of data.invitations) {
    if (v.direction !== 'INCOMING' || !v.message) continue;
    if (isMe(v.from, v.inviterUrl)) continue;
    const p = getPerson(v.from, v.inviterUrl);
    invites.push({ personKey: p.key, date: v.sentAt, text: v.message, folded: fold(v.message) });
  }

  // 5. Enrich people with social-capital signals (Endorsements, Recommendations, and Positions alumni overlap).
  const matchExistingPerson = (name, url, companyHint = '') => {
    const slug = profileSlug(url);
    if (slug && bySlug.has(slug)) return bySlug.get(slug);
    const nk = nameKey(name);
    if (!nk || isMe(name, url)) return null;
    const candidates = allByName.get(nk);
    if (!candidates || !candidates.length) return null;
    if (candidates.length > 1 && companyHint) {
      const ck = companyKey(companyHint);
      if (ck) {
        const exact = candidates.find((c) => companyKey(c.company) === ck);
        if (exact) return exact;
      }
    }
    return candidates[0];
  };

  for (const e of data.endorsementsReceived || []) {
    const p = matchExistingPerson(e.name, e.url);
    if (p) {
      p.endorsedMe++;
      if (!p.url && e.url && profileSlug(e.url)) p.url = e.url;
    }
  }
  for (const e of data.endorsementsGiven || []) {
    const p = matchExistingPerson(e.name, e.url);
    if (p) {
      p.endorsedThem++;
      if (!p.url && e.url && profileSlug(e.url)) p.url = e.url;
    }
  }
  for (const r of data.recommendationsReceived || []) {
    const p = matchExistingPerson(r.name, '', r.company);
    if (p) p.recReceived = true;
  }
  for (const r of data.recommendationsGiven || []) {
    const p = matchExistingPerson(r.name, '', r.company);
    if (p) p.recGiven = true;
  }

  const myEmployers = new Map();
  for (const pos of data.positions || []) {
    const ck = companyKey(pos.company);
    if (ck && ck.length >= 2 && !myEmployers.has(ck)) {
      myEmployers.set(ck, pos.company);
    }
  }
  if (myEmployers.size > 0) {
    for (const p of people.values()) {
      if (!p.company) continue;
      const ck = companyKey(p.company);
      if (ck && myEmployers.has(ck)) p.sharedCompany = myEmployers.get(ck);
    }
  }

  return { people, conversations, invites, skipped, me };
}
