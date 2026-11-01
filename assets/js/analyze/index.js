// Orchestrates analysis and returns a compact report structurally free of raw messages,
// InMail subjects, raw search/comment/post prose, email addresses, IPs, and candidate lists.
import { RETENTION_DAYS } from '../config.js';
import { detectMe } from '../core/identity.js';
import { buildModel } from '../core/model.js';
import { companyKey } from '../core/text.js';
import { DAY } from '../core/time.js';
import { findRecruitersWithQuotes } from './recruiters.js';
import { findRepliesWithQuotes } from './replies.js';
import { findReconnect } from './reconnect.js';
import { topCompanies, followedCompaniesInNetwork, extractFollowedCompanyKeys } from './companies.js';
import { buildInsights } from './insights.js';

export const REPORT_VERSION = 3;

export function analyzeSession(data, { override, now = Date.now() } = {}) {
  const me = detectMe(data, override);
  const model = buildModel(data, me);

  const recRes = findRecruitersWithQuotes(model);
  const recruiters = recRes.items;
  const repRes = findRepliesWithQuotes(model, recRes.convIds, now);
  const replies = repRes.items;

  const busy = new Set([...replies.map((r) => r.personKey), ...recruiters.map((r) => r.personKey)]);
  const reconnect = findReconnect(model, busy, now);

  const referenced = new Set([...busy, ...reconnect.map((r) => r.personKey)]);
  const people = [];
  for (const p of model.people.values()) {
    if (!p.isConnection && !referenced.has(p.key)) continue;
    people.push({
      key: p.key,
      name: p.name,
      url: p.url,
      company: p.company,
      companyKey: p.company ? companyKey(p.company) : '',
      position: p.position,
      isConnection: p.isConnection,
      connectedOn: p.connectedOn,
      sent: p.sent,
      received: p.received,
      firstAt: p.firstAt,
      lastAt: p.lastAt,
      lastConvId: p.lastConvId,
      ...(p.endorsedMe ? { endorsedMe: p.endorsedMe } : {}),
      ...(p.endorsedThem ? { endorsedThem: p.endorsedThem } : {}),
      ...(p.recReceived ? { recReceived: true } : {}),
      ...(p.recGiven ? { recGiven: true } : {}),
      ...(p.sharedCompany ? { sharedCompany: p.sharedCompany } : {}),
    });
  }

  const connections = people.filter((p) => p.isConnection);
  const never = connections.filter((p) => p.sent + p.received === 0).length;
  const activeYear = people.filter((p) => p.lastAt && now - p.lastAt < 365 * DAY && p.sent > 0 && p.received > 0).length;
  const lastMessageAt = data.messages.reduce((mx, m) => Math.max(mx, m.date), 0) || null;

  const followedKeys = extractFollowedCompanyKeys(data);
  const topList = topCompanies(people, { limit: 15, followedKeys });
  const followedList = followedCompaniesInNetwork(people, followedKeys, 40);
  const insights = buildInsights(data, { people, followedCompanies: followedList, now });

  const quotes = Object.assign(Object.create(null), recRes.quotes, repRes.quotes);

  const report = {
    version: REPORT_VERSION,
    createdAt: now,
    expiresAt: now + RETENTION_DAYS * DAY,
    archiveDate: lastMessageAt,
    me: { name: me.name, headline: me.headline, ambiguous: me.ambiguous },
    found: data.found,
    warnings: data.warnings,
    stats: {
      connections: connections.length,
      neverMessaged: never,
      neverMessagedPct: connections.length ? Math.round((never / connections.length) * 100) : 0,
      activeThisYear: activeYear,
      conversations: model.conversations.length,
      messages: data.messages.length,
      recruitersUnreplied: recruiters.filter((r) => !r.replied).length,
    },
    people,
    recruiters,
    replies,
    reconnect,
    topCompanies: topList,
    followedCompanies: followedList,
    insights,
  };

  return { report, quotes, candidates: me.candidates };
}

export function analyze(data, opts) {
  return analyzeSession(data, opts).report;
}
