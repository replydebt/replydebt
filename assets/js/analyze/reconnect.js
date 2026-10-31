// People you used to talk to and have lost touch with + deterministic weekly pick.
import { DAY, isoWeekKey } from '../core/time.js';
import { mulberry32 } from '../core/text.js';

export function findReconnect(model, excludeKeys = new Set(), now = Date.now()) {
  const out = [];
  for (const p of model.people.values()) {
    if (excludeKeys.has(p.key)) continue;
    const total = p.sent + p.received;
    if (p.sent < 2 || p.received < 2 || total < 4 || !p.lastAt) continue;
    const silence = (now - p.lastAt) / DAY;
    if (silence < 180) continue;
    const score = Math.log2(1 + total) * Math.min(silence / 365, 3) + (p.isConnection ? 0.5 : 0);
    out.push({ personKey: p.key, lastAt: p.lastAt, total, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic weekly selection: the same ISO week shows the same five people until handled. */
export function weeklyPick(ranked, count = 5, now = Date.now(), pool = 30) {
  const top = ranked.slice(0, pool);
  if (!top.length) return [];
  const rand = mulberry32(hashString(isoWeekKey(now)));
  const keyed = top.map((item, i) => ({ item, k: rand() * (1 + i / top.length) }));
  keyed.sort((a, b) => a.k - b.k);
  return keyed.slice(0, count).map((x) => x.item);
}
