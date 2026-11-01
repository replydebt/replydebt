// Company lookup, "warmest path" ranking (messages + recommendations + endorsements + shared employer),
// and followed-company matching against Company Follows.csv & Job Seeker Preferences.
import { companyKey, companyMatches } from '../core/text.js';
import { DAY } from '../core/time.js';

export function warmth(p, now = Date.now()) {
  const sent = p.sent || 0;
  const received = p.received || 0;
  const twoWay = sent > 0 && received > 0 ? sent + received : 0.5 * (sent + received);
  let recency = 0;
  if (p.lastAt) {
    const days = (now - p.lastAt) / DAY;
    recency = days < 90 ? 3 : days < 365 ? 2 : days < 730 ? 1 : 0;
  }
  const tenure = p.connectedOn && now - p.connectedOn > 730 * DAY ? 1 : 0;
  const recBoost = (p.recReceived ? 3.5 : 0) + (p.recGiven ? 2.5 : 0);
  const endorseTotal = (p.endorsedMe || 0) + (p.endorsedThem || 0);
  const endorseBoost = endorseTotal > 0 ? Math.min(2.5, 1 + 0.5 * Math.log2(1 + endorseTotal)) : 0;
  const alumniBoost = p.sharedCompany ? 2.0 : 0;
  return 3 * Math.log2(1 + twoWay) + recency + tenure + recBoost + endorseBoost + alumniBoost;
}

export function extractFollowedCompanyKeys(data) {
  const keys = new Set();
  for (const c of data?.companyFollows || []) {
    const k = companyKey(c.name);
    if (k) keys.add(k);
  }
  for (const name of data?.jobPrefs?.dreamCompanies || []) {
    const k = companyKey(name);
    if (k) keys.add(k);
  }
  return keys;
}

function groupNetworkCompanies(people, followedKeys = new Set()) {
  const groups = new Map();
  for (const p of people) {
    if (!p.isConnection || !p.company) continue;
    const key = p.companyKey || companyKey(p.company);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { key, names: new Map(), count: 0, talked: 0, vouched: 0, followed: followedKeys.has(key) };
      groups.set(key, g);
    }
    g.count++;
    if ((p.sent || 0) + (p.received || 0) > 0) g.talked++;
    if (p.recReceived || p.recGiven || (p.endorsedMe || 0) + (p.endorsedThem || 0) > 0 || p.sharedCompany) g.vouched++;
    g.names.set(p.company, (g.names.get(p.company) || 0) + 1);
  }
  return [...groups.values()].map((g) => ({
    key: g.key,
    name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
    count: g.count,
    talked: g.talked,
    ...(g.vouched ? { vouched: g.vouched } : {}),
    ...(g.followed ? { followed: true } : {}),
  }));
}

export function topCompanies(people, limitOrOpts = 15) {
  const opts = typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : (limitOrOpts || {});
  const limit = opts.limit ?? 15;
  const followedKeys = opts.followedKeys || new Set();
  return groupNetworkCompanies(people, followedKeys)
    .sort((a, b) => b.count - a.count || b.talked - a.talked || (b.vouched || 0) - (a.vouched || 0))
    .slice(0, limit);
}

export function followedCompaniesInNetwork(people, followedKeys = new Set(), limit = 40) {
  if (!followedKeys || followedKeys.size === 0) return [];
  return groupNetworkCompanies(people, followedKeys)
    .filter((g) => g.followed)
    .sort((a, b) => b.talked - a.talked || (b.vouched || 0) - (a.vouched || 0) || b.count - a.count)
    .slice(0, limit);
}

/** Search people by company. Returns { companies: [{name, count}], people: [...sorted by warmth] } */
export function searchCompany(people, query, now = Date.now()) {
  const q = String(query || '').trim().slice(0, 120);
  if (q.length < 2) return { companies: [], people: [] };
  const qKey = companyKey(q);
  if (!qKey) return { companies: [], people: [] };
  const matched = [];
  const names = new Map();
  for (const p of people) {
    if (!p.company) continue;
    const hasKey = Boolean(p.companyKey);
    const key = hasKey ? p.companyKey : companyKey(p.company);
    if (!companyMatches(key, q, qKey, hasKey)) continue;
    matched.push({ ...p, warmth: warmth(p, now) });
    names.set(p.company, (names.get(p.company) || 0) + 1);
  }
  matched.sort((a, b) => b.warmth - a.warmth || (b.lastAt || 0) - (a.lastAt || 0));
  const companies = [...names.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { companies, people: matched };
}
