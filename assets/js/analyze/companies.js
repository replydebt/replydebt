// Company lookup and "warmest path" ranking.
import { companyKey, companyMatches } from '../core/text.js';
import { DAY } from '../core/time.js';

export function warmth(p, now = Date.now()) {
  const twoWay = p.sent > 0 && p.received > 0 ? p.sent + p.received : 0.5 * (p.sent + p.received);
  let recency = 0;
  if (p.lastAt) {
    const days = (now - p.lastAt) / DAY;
    recency = days < 90 ? 3 : days < 365 ? 2 : days < 730 ? 1 : 0;
  }
  const tenure = p.connectedOn && now - p.connectedOn > 730 * DAY ? 1 : 0;
  return 3 * Math.log2(1 + twoWay) + recency + tenure;
}

export function topCompanies(people, limit = 15) {
  const groups = new Map();
  for (const p of people) {
    if (!p.isConnection || !p.company) continue;
    const key = companyKey(p.company);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, names: new Map(), count: 0, talked: 0 }));
    g.count++;
    if (p.sent + p.received > 0) g.talked++;
    g.names.set(p.company, (g.names.get(p.company) || 0) + 1);
  }
  return [...groups.values()]
    .map((g) => ({ key: g.key, name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0], count: g.count, talked: g.talked }))
    .sort((a, b) => b.count - a.count || b.talked - a.talked)
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
