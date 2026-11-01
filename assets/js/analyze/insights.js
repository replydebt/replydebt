// Builds minimized Archive & Algorithm Mirror insights from Basic and Complete LinkedIn exports.
// Contains zero raw message text, zero raw search queries, zero post/comment prose, and zero IPs/emails/phones.
import { nameKey, profileSlug } from '../core/text.js';
import { DAY } from '../core/time.js';

const round2 = (n) => Math.round(n * 100) / 100;

const PILLAR_KEYS = [
  ['Role and scope', 'role', 'Role & scope'],
  ['Tenure and experience', 'tenure', 'Tenure & experience'],
  ['Content and output', 'content', 'Content & output'],
  ['Education and credentials', 'education', 'Education & credentials'],
  ['Validation and influence', 'validation', 'Validation & influence'],
];

function buildCredibility(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let notabilityScore = null;
  let notabilityDelta = 0;
  let notabilityTier = null;
  let snapshotDate = '';

  const pillarMap = new Map();
  const normalizedTopics = [];

  for (const r of rows) {
    if (r.latestDate && r.latestDate > snapshotDate) snapshotDate = r.latestDate;
    const cat = r.category;
    if (r.scoreType === 'Notability') {
      if (/aggregated notability score/i.test(cat)) {
        notabilityScore = round2(r.latest);
        notabilityDelta = round2(r.latest - r.earliest);
      } else if (/discrete notability tier/i.test(cat)) {
        notabilityTier = Math.round(r.latest);
      }
      continue;
    }

    if (!r.topic) continue;
    if (/^topic normalized score$/i.test(cat)) {
      normalizedTopics.push({
        topic: r.topic.slice(0, 140),
        score: round2(r.latest),
        delta: round2(r.latest - r.earliest),
      });
      continue;
    }

    const pillarHit = PILLAR_KEYS.find(([rawCat]) => rawCat.toLowerCase() === cat.toLowerCase());
    if (pillarHit) {
      let entry = pillarMap.get(r.topic);
      if (!entry) {
        entry = { topic: r.topic.slice(0, 140), role: 0, tenure: 0, content: 0, education: 0, validation: 0, count: 0 };
        pillarMap.set(r.topic, entry);
      }
      entry[pillarHit[1]] = Math.max(0, Math.min(4, Math.round(r.latest)));
      entry.count++;
    }
  }

  const pillars = [...pillarMap.values()]
    .filter((p) => p.count >= 3)
    .map((p) => {
      const total = p.role + p.tenure + p.content + p.education + p.validation;
      let weakestLabel = '';
      let weakestVal = 5;
      for (const [, prop, label] of PILLAR_KEYS) {
        const v = p[prop];
        if (v > 0 && v < weakestVal) {
          weakestVal = v;
          weakestLabel = label;
        }
      }
      return {
        topic: p.topic,
        total,
        max: 20,
        weakest: weakestVal < 4 ? weakestLabel : '',
        role: p.role,
        tenure: p.tenure,
        content: p.content,
        education: p.education,
        validation: p.validation,
      };
    })
    .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic))
    .slice(0, 12);

  normalizedTopics.sort((a, b) => b.score - a.score || b.delta - a.delta);
  const topTopics = normalizedTopics.slice(0, 12);
  const risingTopics = [...normalizedTopics]
    .filter((t) => t.delta >= 0.15)
    .sort((a, b) => b.delta - a.delta || b.score - a.score)
    .slice(0, 6);

  if (notabilityScore === null && notabilityTier === null && !pillars.length && !topTopics.length) {
    return null;
  }

  return {
    notabilityScore,
    notabilityDelta,
    notabilityTier,
    snapshotDate,
    totalTopics: normalizedTopics.length,
    pillars,
    topTopics,
    risingTopics,
  };
}

function buildPersona(data) {
  const infs = (data.inferences || []).map((x) => ({
    category: x.category,
    label: x.type,
    value: /^(true|yes)$/i.test(x.inference) ? 'Yes' : /^(false|no)$/i.test(x.inference) ? 'No' : x.inference,
  }));
  const ad = data.adTargeting;
  const jp = data.jobPrefs;
  const listedSkills = data.skills || [];

  if (!infs.length && !ad && !jp && !listedSkills.length) return null;

  return {
    inferences: infs.slice(0, 24),
    yearsOfExperience: ad?.yearsOfExperience || '',
    seniorities: ad?.seniorities || [],
    jobFunctions: ad?.jobFunctions || [],
    jobTitles: ad?.jobTitles?.length ? ad.jobTitles : (jp?.jobTitles || []),
    memberTraits: ad?.memberTraits || [],
    highValueSegments: ad?.highValueSegments || [],
    standardSegments: ad?.standardSegments || [],
    industries: ad?.industries || [],
    companySize: ad?.companySize || '',
    inferredSkillCount: ad?.inferredSkillCount || 0,
    listedSkillCount: listedSkills.length,
    topSkills: (listedSkills.length ? listedSkills : (ad?.sampleInferredSkills || [])).slice(0, 14),
    openToRecruiters: jp ? jp.openToRecruiters : null,
  };
}

function buildSocial(data, people, followedCompanies, now) {
  const connectedSlugs = new Set();
  const connectedNames = new Set();
  let alumniConnections = 0;
  let newConnections12m = 0;

  for (const p of people) {
    if (!p.isConnection) continue;
    const slug = profileSlug(p.url);
    if (slug) connectedSlugs.add(slug);
    const nk = nameKey(p.name);
    if (nk) connectedNames.add(nk);
    if (p.sharedCompany) alumniConnections++;
    if (p.connectedOn && now - p.connectedOn <= 365 * DAY) newConnections12m++;
  }

  let outboundInvitesTotal = 0;
  let outboundPending = 0;
  let outboundStale90d = 0;
  for (const inv of data.invitations || []) {
    if (inv.direction !== 'OUTGOING') continue;
    outboundInvitesTotal++;
    const slug = profileSlug(inv.inviteeUrl);
    const nk = nameKey(inv.to);
    const accepted = (slug && connectedSlugs.has(slug)) || (!slug && nk && connectedNames.has(nk));
    if (!accepted) {
      outboundPending++;
      if (inv.sentAt && now - inv.sentAt > 90 * DAY) outboundStale90d++;
    }
  }

  const skillCounts = new Map();
  for (const e of data.endorsementsReceived || []) {
    if (!e.skill) continue;
    skillCounts.set(e.skill, (skillCounts.get(e.skill) || 0) + 1);
  }
  const topEndorsedSkills = [...skillCounts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, 6);

  return {
    endorsementsReceived: (data.endorsementsReceived || []).length,
    endorsementsGiven: (data.endorsementsGiven || []).length,
    topEndorsedSkills,
    recommendationsReceived: (data.recommendationsReceived || []).length,
    recommendationsGiven: (data.recommendationsGiven || []).length,
    alumniConnections,
    followedCompaniesTotal: (data.companyFollows || []).length,
    followedInNetwork: followedCompanies.length,
    outboundInvitesTotal,
    outboundPending,
    outboundStale90d,
    newConnections12m,
  };
}

function buildActivity(act, now) {
  if (!act) return null;
  const countWithin = (dates, days) => (dates || []).filter((ts) => now - ts <= days * DAY).length;
  const reactionTypes = act.reactions
    ? Object.entries(act.reactions.byType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    : [];

  return {
    sharesTotal: act.shares ? act.shares.total : 0,
    shares12m: act.shares ? countWithin(act.shares.dates, 365) : 0,
    commentsTotal: act.comments ? act.comments.total : 0,
    comments12m: act.comments ? countWithin(act.comments.dates, 365) : 0,
    reactionsTotal: act.reactions ? act.reactions.total : 0,
    reactions12m: act.reactions ? countWithin(act.reactions.dates, 365) : 0,
    reactionTypes,
    repostsTotal: act.reposts ? act.reposts.total : 0,
    votesTotal: act.votes ? act.votes.total : 0,
    savedItems: act.savedItems ?? 0,
    followingActive: act.memberFollows ? act.memberFollows.active : 0,
    hashtags: (act.hashtags || []).slice(0, 16),
    searchesTotal: act.searches ? act.searches.total : 0,
    searches90d: act.searches ? countWithin(act.searches.dates, 90) : 0,
    adsClicked: act.adsClicked ?? 0,
  };
}

export function buildInsights(data, { people = [], followedCompanies = [], now = Date.now() } = {}) {
  const foundSet = new Set(data.found || []);
  const credibility = buildCredibility(data.credibility);
  const persona = buildPersona(data);
  const social = buildSocial(data, people, followedCompanies, now);
  const activity = buildActivity(data.activity, now);
  const isComplete = Boolean(
    credibility
    || foundSet.has('inferences')
    || foundSet.has('shares')
    || foundSet.has('comments')
    || foundSet.has('reactions')
    || foundSet.has('searchQueries'),
  );

  return {
    coverage: {
      isComplete,
      totalFiles: data.totalArchiveFiles || foundSet.size,
      readFiles: foundSet.size,
      quarantinedFiles: data.quarantinedCount || 0,
    },
    credibility,
    persona,
    social,
    activity,
  };
}
