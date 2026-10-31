// Identify which participant in the export is the archive owner ("me"),
// counting participation across both senders and recipients so receive-only accounts still work.
import { nameKey, profileSlug } from './text.js';

const IGNORED = new Set(['', 'linkedin member', 'linkedin', 'linkedin premium', 'sponsored']);

/**
 * @returns {{ name: string, headline: string, slugs: string[], ambiguous: boolean, candidates: {name:string, conversations:number}[] }}
 */
export function detectMe(data, override) {
  const connSlugs = new Set();
  for (const c of data.connections || []) {
    const s = profileSlug(c.url);
    if (s) connSlugs.add(s);
  }

  const bySlug = new Map();
  const byName = new Map();
  const entries = [];

  const record = (rawName, rawUrl, convId, onOwnerSide = false) => {
    const name = String(rawName || '').trim();
    const nk = nameKey(name);
    const slug = profileSlug(rawUrl);
    if (!nk && !slug) return;
    if (IGNORED.has(nk)) return;

    let e = (slug && bySlug.get(slug)) || (nk && byName.get(nk)) || null;
    if (e && slug && e.slugs.size > 0 && !e.slugs.has(slug)) {
      // Different LinkedIn profile slug sharing the same display name: keep separate.
      e = null;
    }
    if (!e) {
      e = { name, nk, convs: new Set(), ownerSideConvs: new Set(), slugs: new Set() };
      entries.push(e);
    } else if (!e.name && name) {
      e.name = name;
      e.nk = nk;
    }
    if (convId) {
      e.convs.add(convId);
      if (onOwnerSide) e.ownerSideConvs.add(convId);
    }
    if (slug) {
      e.slugs.add(slug);
      bySlug.set(slug, e);
    }
    if (nk && !byName.has(nk)) byName.set(nk, e);
  };

  for (const m of data.messages) {
    if (m.folder === 'SPAM' || m.folder.includes('SPONSORED')) continue;
    record(m.from, m.senderUrl, m.conversationId, false);
    const urlFor = (i) => (
      m.to.length === m.recipientUrls.length
        ? m.recipientUrls[i]
        : (m.to.length === 1 ? m.recipientUrls[0] : '')
    );
    m.to.forEach((recipient, i) => record(recipient, urlFor(i), m.conversationId, true));
  }

  for (const v of data.invitations || []) {
    if (v.direction === 'INCOMING' && v.to) record(v.to, v.inviteeUrl, `inv:${v.sentAt || 0}`, true);
    else if (v.direction === 'OUTGOING' && v.from) record(v.from, v.inviterUrl, `inv:${v.sentAt || 0}`, true);
  }

  // The archive owner never appears in their own 1st-degree Connections.csv.
  const isKnownConnection = (e) => e.slugs.size > 0 && [...e.slugs].every((s) => connSlugs.has(s));
  const compareEntries = (a, b) => (
    b.convs.size - a.convs.size
    || b.ownerSideConvs.size - a.ownerSideConvs.size
  );

  const nonConn = entries.filter((e) => !isKnownConnection(e)).sort(compareEntries);
  const connOnly = entries.filter((e) => isKnownConnection(e)).sort(compareEntries);
  const ranked = [...nonConn, ...connOnly];
  const candidates = ranked.slice(0, 6).map((e) => ({ name: e.name, conversations: e.convs.size }));
  const headline = data.profile?.headline || '';

  const pick = (entry, ambiguous = false) => ({
    name: entry.name,
    headline,
    slugs: [...(entry.slugs || [])],
    ambiguous,
    candidates,
  });

  if (override) {
    const ovSlug = profileSlug(override);
    const hit = (ovSlug && bySlug.get(ovSlug)) || nonConn.find((e) => e.nk === nameKey(override)) || byName.get(nameKey(override));
    return pick(hit || { name: override, slugs: new Set() });
  }

  if (data.profile?.name) {
    const pnk = nameKey(data.profile.name);
    const hit = nonConn.find((e) => e.nk === pnk) || ranked.find((e) => e.nk === pnk);
    if (hit) return pick(hit);
    const pk = pnk.split(' ').filter(Boolean);
    if (pk.length >= 2) {
      const loose = nonConn.find((e) => {
        const ek = e.nk.split(' ').filter(Boolean);
        return ek.length >= 2 && ek[0] === pk[0] && ek[ek.length - 1] === pk[pk.length - 1];
      });
      if (loose) return pick(loose);
    }
    const pkTokens = new Set(pk.filter((t) => t.length >= 2));
    if (pkTokens.size > 0) {
      const shared = nonConn.find((e) => e.nk.split(' ').some((t) => pkTokens.has(t)));
      if (shared) return pick(shared);
    }
    // Only override Profile.csv when a non-connection participant is clearly the multi-thread inbox hub.
    if (nonConn.length > 0 && nonConn[0].convs.size >= 2 && nonConn[0].convs.size > (nonConn[1]?.convs.size || 0)) {
      return pick(nonConn[0], true);
    }
    return pick({ name: data.profile.name, slugs: new Set() });
  }

  if (nonConn.length === 0) return pick({ name: '', slugs: new Set() });
  const top = nonConn[0];
  const second = nonConn[1];
  const ambiguous = Boolean(second && second.convs.size > top.convs.size * 0.6);
  return pick(top, ambiguous);
}
