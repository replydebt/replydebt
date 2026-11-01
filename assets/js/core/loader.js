// Recognize LinkedIn export files (both 10-minute Basic and 24-48h Complete exports)
// and turn them into minimized typed records.
// Sensitive PII/IP/billing files (Email Addresses, PhoneNumbers, Receipts, Verifications, Logins,
// Security Challenges, Registration, Notes) and raw search/comment/post prose columns are structurally excluded.
import { parseCsv, parseDuplicateHeaderCsv, parseCredibilityCsv } from './csv.js';
import { parseDate } from './time.js';
import { cleanInline, cleanText, sanitizeFileName } from './text.js';

export const MAX_RECIPIENTS_PER_MSG = 64;

const QUARANTINED_RE = /(^|\/)(?:email\s*addresses|phonenumbers|phone\s*numbers|whatsapp\s*phone\s*numbers|receipts(?:_v\d+)?|verifications|logins|security\s*challenges|registration|notes)\.csv$/i;

export const FILES = {
  connections: {
    match: /(^|\/)connections\.csv$/i,
    fields: {
      firstName: ['First Name'],
      lastName: ['Last Name'],
      url: ['URL', 'Profile URL'],
      company: ['Company'],
      position: ['Position', 'Title'],
      connectedOn: ['Connected On'],
    },
  },
  messages: {
    match: /(^|\/)messages\.csv$/i,
    fields: {
      conversationId: ['CONVERSATION ID'],
      title: ['CONVERSATION TITLE'],
      from: ['FROM'],
      senderUrl: ['SENDER PROFILE URL'],
      to: ['TO'],
      recipientUrls: ['RECIPIENT PROFILE URLS'],
      date: ['DATE'],
      subject: ['SUBJECT'],
      content: ['CONTENT'],
      folder: ['FOLDER'],
      draft: ['IS MESSAGE DRAFT'],
    },
  },
  invitations: {
    match: /(^|\/)invitations\.csv$/i,
    fields: {
      from: ['From'],
      to: ['To'],
      sentAt: ['Sent At'],
      message: ['Message'],
      direction: ['Direction'],
      inviterUrl: ['inviterProfileUrl', 'Inviter Profile URL'],
      inviteeUrl: ['inviteeProfileUrl', 'Invitee Profile URL'],
    },
  },
  profile: {
    match: /(^|\/)profile\.csv$/i,
    fields: {
      firstName: ['First Name'],
      lastName: ['Last Name'],
      headline: ['Headline'],
      industry: ['Industry'],
    },
  },
  positions: {
    match: /(^|\/)positions\.csv$/i,
    fields: {
      company: ['Company Name', 'Company'],
      title: ['Title', 'Position'],
      startedOn: ['Started On'],
      finishedOn: ['Finished On'],
    },
  },
  companyFollows: {
    match: /(^|\/)company\s*follows\.csv$/i,
    fields: {
      organization: ['Organization', 'Company Name', 'Company'],
      followedOn: ['Followed On'],
    },
  },
  jobPrefs: {
    match: /(^|\/)job\s*seeker\s*preferences\.csv$/i,
    fields: {
      openToRecruiters: ['Open To Recruiters'],
      dreamCompanies: ['Dream Companies'],
      jobTitles: ['Job Titles'],
      jobTypes: ['Preferred Job Types'],
    },
  },
  endorsementsReceived: {
    match: /(^|\/)endorsement_received_info\.csv$/i,
    fields: {
      date: ['Endorsement Date'],
      skill: ['Skill Name'],
      firstName: ['Endorser First Name'],
      lastName: ['Endorser Last Name'],
      url: ['Endorser Public Url'],
      status: ['Endorsement Status'],
    },
  },
  endorsementsGiven: {
    match: /(^|\/)endorsement_given_info\.csv$/i,
    fields: {
      date: ['Endorsement Date'],
      skill: ['Skill Name'],
      firstName: ['Endorsee First Name'],
      lastName: ['Endorsee Last Name'],
      url: ['Endorsee Public Url'],
      status: ['Endorsement Status'],
    },
  },
  recommendationsReceived: {
    match: /(^|\/)recommendations_received\.csv$/i,
    fields: {
      firstName: ['First Name'],
      lastName: ['Last Name'],
      company: ['Company'],
      title: ['Job Title'],
      date: ['Creation Date'],
      status: ['Status'],
    },
  },
  recommendationsGiven: {
    match: /(^|\/)recommendations_given\.csv$/i,
    fields: {
      firstName: ['First Name'],
      lastName: ['Last Name'],
      company: ['Company'],
      title: ['Job Title'],
      date: ['Creation Date'],
      status: ['Status'],
    },
  },
  skills: {
    match: /(^|\/)skills\.csv$/i,
    fields: {
      name: ['Name', 'Skill Name'],
    },
  },
  credibility: {
    match: /(^|\/)inferred\s*credibility\s*scores\.csv$/i,
  },
  inferences: {
    match: /(^|\/)inferences_about_you\.csv$/i,
    fields: {
      category: ['Category'],
      type: ['Type of inference'],
      inference: ['Inference'],
    },
  },
  adTargeting: {
    match: /(^|\/)ad_targeting\.csv$/i,
    fields: {
      yearsOfExperience: ['Years of Experience'],
      seniorities: ['Job Seniorities'],
      jobFunctions: ['Job Functions'],
      jobTitles: ['Job Titles'],
      memberTraits: ['Member Traits'],
      highValueSegments: ['High Value Audience Segments'],
      standardSegments: ['Standard Audience Segments'],
      companySize: ['Company Size'],
      companyIndustries: ['Company Industries'],
      memberSkills: ['Member Skills'],
    },
  },
  shares: {
    match: /(^|\/)shares(?:_\d+)?\.csv$/i,
    fields: {
      date: ['Date'],
      visibility: ['Visibility'],
    },
  },
  comments: {
    match: /(^|\/)comments(?:_\d+)?\.csv$/i,
    fields: {
      date: ['Date'],
    },
  },
  reactions: {
    match: /(^|\/)reactions(?:_\d+)?\.csv$/i,
    fields: {
      date: ['Date'],
      type: ['Type'],
    },
  },
  reposts: {
    match: /(^|\/)instant_?reposts(?:_\d+)?\.csv$/i,
    fields: {
      date: ['Date'],
    },
  },
  votes: {
    match: /(^|\/)votes(?:_\d+)?\.csv$/i,
    fields: {
      date: ['Date'],
    },
  },
  savedItems: {
    match: /(^|\/)saved_?items(?:_\d+)?\.csv$/i,
    fields: {
      date: ['CreatedTime', 'Date'],
    },
  },
  memberFollows: {
    match: /(^|\/)member_?follows(?:_\d+)?\.csv$/i,
    fields: {
      date: ['Date'],
      status: ['Status'],
    },
  },
  hashtagFollows: {
    match: /(^|\/)hashtag_?follows(?:_\d+)?\.csv$/i,
    fields: {
      tag: ['HashTag', 'Hashtag'],
      state: ['State', 'Status'],
    },
  },
  searchQueries: {
    match: /(^|\/)search_?queries\.csv$/i,
    fields: {
      time: ['Time', 'Date'],
    },
  },
  adsClicked: {
    match: /(^|\/)ads\s*clicked\.csv$/i,
    fields: {
      date: ['Ad clicked Date', 'Date'],
    },
  },
};

function pathDepth(p) {
  let depth = 0;
  for (let i = 0; i < p.length; i++) if (p[i] === '/') depth++;
  return depth;
}

/** Normalize schemeless LinkedIn URLs (e.g. "www.linkedin.com/in/slug" in Endorsements CSVs). */
export function normalizeProfileUrl(raw) {
  const s = cleanInline(raw, 500);
  if (!s) return '';
  if (/^(?:www\.|[a-z]{2}\.)?linkedin\.com\/(?:in|pub)\//i.test(s)) return `https://${s}`;
  return s;
}

/** Count sensitive PII/IP/billing CSV paths present in an archive without reading them. */
export function countQuarantinedFiles(paths) {
  let n = 0;
  for (const raw of paths) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024) continue;
    const norm = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    if (QUARANTINED_RE.test(norm)) n++;
  }
  return n;
}

/** Which known files are present in a list of paths? Prefers shallowest paths so nested decoys never shadow root CSVs. */
export function detectFiles(paths) {
  const candidates = paths
    .filter((p) => typeof p === 'string' && p.length > 0 && p.length <= 1024)
    .map((raw, idx) => {
      const norm = raw.replace(/\\/g, '/').replace(/^\/+/, '');
      return { raw, norm, depth: pathDepth(norm), idx };
    })
    .sort((a, b) => a.depth - b.depth || a.norm.length - b.norm.length || a.idx - b.idx);

  const found = Object.create(null);
  for (const [kind, spec] of Object.entries(FILES)) {
    const hit = candidates.find((c) => spec.match.test(c.norm));
    if (hit) found[kind] = hit.raw;
  }
  return found;
}

/** True if a list of zip entry names looks like a LinkedIn data export. */
export function looksLikeLinkedInExport(paths) {
  const found = detectFiles(paths);
  return Boolean(found.messages || found.connections);
}

const splitUrls = (s) => String(s || '')
  .split(',')
  .map((x) => normalizeProfileUrl(x))
  .filter(Boolean)
  .slice(0, MAX_RECIPIENTS_PER_MSG);

const splitSemiList = (s, maxItems = 24, maxLen = 120) => {
  if (!s) return [];
  const seen = new Set();
  const out = [];
  for (const raw of String(s).split(/[;|]/)) {
    const item = cleanInline(raw, maxLen);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
};

const CREDENTIAL_RE = /^(?:ph\.?\s*d\.?|m\.?\s*b\.?\s*a\.?|m\.?\s*d\.?|d\.?\s*d\.?\s*s\.?|d\.?\s*v\.?\s*m\.?|j\.?\s*d\.?|ll\.?\s*m\.?|esq\.?|jr\.?|sr\.?|ii|iii|iv|v|c\.?\s*p\.?\s*a\.?|c\.?\s*f\.?\s*a\.?|p\.?\s*m\.?\s*p\.?|c\.?\s*i\.?\s*s\.?\s*s\.?\s*p\.?|c\.?\s*i\.?\s*s\.?\s*m\.?|c\.?\s*i\.?\s*s\.?\s*a\.?|p\.?\s*e\.?|r\.?\s*n\.?|m\.?\s*s\.?c?\.?|m\.?\s*a\.?|b\.?\s*s\.?c?\.?|b\.?\s*a\.?|shrm[-\s]?(?:cp|scp)|acca|prince2|itil|psm\s*i*|csm|cspo|sphr|phr|frcs|facs|facc|obe|mbe|cbe)$/i;

/**
 * Split LinkedIn's comma-separated TO field in linear time without breaking credential suffixes ("Jane Doe, PhD").
 * When RECIPIENT PROFILE URLS contains a single URL, TO always names a single recipient.
 */
export function splitRecipients(toRaw, urls) {
  const raw = cleanInline(toRaw, 8000);
  if (!raw) return [];
  if (urls.length === 1) return [cleanInline(raw, 240)];
  const parts = raw.split(',').map((x) => cleanInline(x, 240)).filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (out.length > 0 && part.length <= 24 && CREDENTIAL_RE.test(part)) {
      out[out.length - 1] = cleanInline(`${out[out.length - 1]}, ${part}`, 240);
    } else {
      if (out.length >= MAX_RECIPIENTS_PER_MSG) break;
      out.push(part);
    }
  }
  return out;
}

/**
 * Load a LinkedIn export.
 * @param {Map<string, () => Promise<string>>} files path -> lazy text loader
 * @param {(step:string, pct:number) => void} [onProgress]
 */
export async function loadExport(files, onProgress = () => {}) {
  const paths = [...files.keys()];
  const found = detectFiles(paths);
  if (!found.messages && !found.connections) {
    const err = new Error('Could not find Connections.csv or messages.csv in this file. Make sure you open the archive LinkedIn emailed you.');
    err.code = 'NOT_LINKEDIN';
    throw err;
  }

  const data = {
    profile: null,
    connections: [],
    messages: [],
    invitations: [],
    positions: [],
    companyFollows: [],
    jobPrefs: null,
    endorsementsReceived: [],
    endorsementsGiven: [],
    recommendationsReceived: [],
    recommendationsGiven: [],
    skills: [],
    credibility: [],
    inferences: [],
    adTargeting: null,
    activity: null,
    totalArchiveFiles: paths.length,
    quarantinedCount: countQuarantinedFiles(paths),
    found: Object.keys(found),
    warnings: [],
  };
  let validPrimaryHeaders = 0;

  const read = async (kind, pct, { optional = false } = {}) => {
    if (!found[kind]) return null;
    const displayName = sanitizeFileName(found[kind], 60);
    if (pct !== null) onProgress(`Reading ${displayName}`, pct);
    const text = await files.get(found[kind])();
    const parsed = parseCsv(text, FILES[kind].fields);
    if (parsed.header.length > 0) {
      if (kind === 'connections' || kind === 'messages') validPrimaryHeaders++;
    } else if (!optional && text.trim().length > 0) {
      data.warnings.push(`${displayName} has an unexpected format.`);
    }
    return parsed.records;
  };

  const profile = await read('profile', 5);
  if (profile && profile[0]) {
    const p = profile[0];
    data.profile = {
      name: cleanInline(`${p.firstName} ${p.lastName}`, 200),
      headline: cleanInline(p.headline || '', 300),
      industry: cleanInline(p.industry || '', 160),
    };
  }

  let connections = await read('connections', 15);
  if (connections) {
    data.connections = connections
      .filter((c) => c.firstName || c.lastName)
      .map((c) => ({
        name: cleanInline(`${c.firstName} ${c.lastName}`, 200),
        url: normalizeProfileUrl(c.url),
        company: cleanInline(c.company, 240),
        position: cleanInline(c.position, 240),
        connectedOn: parseDate(c.connectedOn),
      }))
      .filter((c) => c.name);
    connections = null;
  }

  let messages = await read('messages', 35);
  if (validPrimaryHeaders === 0) {
    const err = new Error('This file does not contain valid LinkedIn Connections.csv or messages.csv headers. Choose the original archive LinkedIn emailed you.');
    err.code = 'NOT_LINKEDIN';
    throw err;
  }

  if (messages) {
    onProgress('Reading your conversations', 55);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      messages[i] = null;
      if (/^(yes|true)$/i.test(m.draft)) continue;
      const date = parseDate(m.date);
      const convId = cleanInline(m.conversationId, 160);
      if (!date || !convId) continue;
      const recipientUrls = splitUrls(m.recipientUrls);
      data.messages.push({
        conversationId: convId,
        title: cleanInline(m.title, 240),
        from: cleanInline(m.from, 200),
        senderUrl: normalizeProfileUrl(m.senderUrl),
        to: splitRecipients(m.to, recipientUrls),
        recipientUrls,
        date,
        subject: cleanInline(m.subject, 300),
        content: cleanText(m.content).slice(0, 2000),
        folder: cleanInline(m.folder || '', 40).toUpperCase(),
      });
    }
    messages = null;
  }

  let invitations = await read('invitations', 70);
  if (invitations) {
    data.invitations = invitations.map((v) => ({
      from: cleanInline(v.from, 200),
      to: cleanInline(v.to, 200),
      sentAt: parseDate(v.sentAt),
      message: cleanText(v.message).slice(0, 1000),
      direction: cleanInline(v.direction || '', 40).toUpperCase(),
      inviterUrl: normalizeProfileUrl(v.inviterUrl),
      inviteeUrl: normalizeProfileUrl(v.inviteeUrl),
    }));
    invitations = null;
  }

  // ---------- Optional Basic + Complete Enrichment Signals ----------
  onProgress('Reading network & archive signals', 82);

  const positions = await read('positions', null, { optional: true });
  if (positions) {
    data.positions = positions
      .map((p) => ({
        company: cleanInline(p.company, 240),
        title: cleanInline(p.title, 240),
        startedOn: parseDate(p.startedOn),
        finishedOn: parseDate(p.finishedOn),
        isCurrent: !cleanInline(p.finishedOn, 40),
      }))
      .filter((p) => p.company)
      .slice(0, 60);
  }

  const companyFollows = await read('companyFollows', null, { optional: true });
  if (companyFollows) {
    data.companyFollows = companyFollows
      .map((c) => ({
        name: cleanInline(c.organization, 240),
        followedOn: parseDate(c.followedOn),
      }))
      .filter((c) => c.name)
      .slice(0, 1000);
  }

  const jobPrefs = await read('jobPrefs', null, { optional: true });
  if (jobPrefs && jobPrefs[0]) {
    const jp = jobPrefs[0];
    const openRaw = cleanInline(jp.openToRecruiters, 20).toLowerCase();
    data.jobPrefs = {
      openToRecruiters: /^(yes|true)$/i.test(openRaw) ? true : /^(no|false)$/i.test(openRaw) ? false : null,
      dreamCompanies: splitSemiList(jp.dreamCompanies, 40, 160),
      jobTitles: splitSemiList(jp.jobTitles, 20, 120),
      jobTypes: splitSemiList(jp.jobTypes, 12, 80),
    };
  }

  const mapEndorsements = (rows) => (rows || [])
    .filter((r) => !/^(rejected|declined)$/i.test(cleanInline(r.status, 30)))
    .map((r) => ({
      name: cleanInline(`${r.firstName} ${r.lastName}`, 200),
      url: normalizeProfileUrl(r.url),
      skill: cleanInline(r.skill, 120),
      date: parseDate(r.date),
    }))
    .filter((r) => r.name || r.url);

  data.endorsementsReceived = mapEndorsements(await read('endorsementsReceived', null, { optional: true }));
  data.endorsementsGiven = mapEndorsements(await read('endorsementsGiven', null, { optional: true }));

  const mapRecommendations = (rows) => (rows || [])
    .filter((r) => !/^(hidden|withdrawn|declined)$/i.test(cleanInline(r.status, 30)))
    .map((r) => ({
      name: cleanInline(`${r.firstName} ${r.lastName}`, 200),
      company: cleanInline(r.company, 240),
      title: cleanInline(r.title, 240),
      date: parseDate(r.date),
    }))
    .filter((r) => r.name);

  data.recommendationsReceived = mapRecommendations(await read('recommendationsReceived', null, { optional: true }));
  data.recommendationsGiven = mapRecommendations(await read('recommendationsGiven', null, { optional: true }));

  const skills = await read('skills', null, { optional: true });
  if (skills) {
    const seen = new Set();
    for (const s of skills) {
      const name = cleanInline(s.name, 120);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      data.skills.push(name);
      if (data.skills.length >= 100) break;
    }
  }

  if (found.credibility) {
    onProgress('Reading credibility & topic scores', 88);
    const credText = await files.get(found.credibility)();
    data.credibility = parseCredibilityCsv(credText);
  }

  const inferences = await read('inferences', null, { optional: true });
  if (inferences) {
    data.inferences = inferences
      .map((inf) => ({
        category: cleanInline(inf.category, 120),
        type: cleanInline(inf.type, 160),
        inference: cleanInline(inf.inference, 80),
      }))
      .filter((inf) => inf.category && inf.type && !/personal\s*characteristics/i.test(inf.category))
      .slice(0, 60);
  }

  if (found.adTargeting) {
    const adText = await files.get(found.adTargeting)();
    const adParsed = parseDuplicateHeaderCsv(adText, FILES.adTargeting.fields);
    if (adParsed.records[0]) {
      const a = adParsed.records[0];
      const allSkills = splitSemiList(a.memberSkills, 2000, 120);
      data.adTargeting = {
        yearsOfExperience: cleanInline(a.yearsOfExperience, 60),
        seniorities: splitSemiList(a.seniorities, 8, 80),
        jobFunctions: splitSemiList(a.jobFunctions, 10, 80),
        jobTitles: splitSemiList(a.jobTitles, 12, 100),
        memberTraits: splitSemiList(a.memberTraits, 12, 100),
        highValueSegments: splitSemiList(a.highValueSegments, 16, 120),
        standardSegments: splitSemiList(a.standardSegments, 16, 120),
        companySize: cleanInline(a.companySize, 80),
        industries: splitSemiList(a.companyIndustries, 10, 100),
        inferredSkillCount: allSkills.length,
        sampleInferredSkills: allSkills.slice(0, 14),
      };
    }
  }

  // ---------- Aggregate-Only Activity Footprint (Complete Export) ----------
  const hasActivityFiles = ['shares', 'comments', 'reactions', 'reposts', 'votes', 'savedItems', 'memberFollows', 'hashtagFollows', 'searchQueries', 'adsClicked']
    .some((k) => Boolean(found[k]));

  if (hasActivityFiles) {
    onProgress('Summarizing activity footprint', 93);
    const collectDates = (rows, field = 'date') => {
      if (!rows) return null;
      const dates = [];
      for (const r of rows) {
        const ts = parseDate(r[field]);
        if (ts) dates.push(ts);
      }
      return { total: rows.length, dates };
    };

    const shares = collectDates(await read('shares', null, { optional: true }));
    const comments = collectDates(await read('comments', null, { optional: true }));
    const reactionsRows = await read('reactions', null, { optional: true });
    let reactions = null;
    if (reactionsRows) {
      const byType = Object.create(null);
      const dates = [];
      for (const r of reactionsRows) {
        const t = cleanInline(r.type || 'LIKE', 32).toUpperCase() || 'LIKE';
        byType[t] = (byType[t] || 0) + 1;
        const ts = parseDate(r.date);
        if (ts) dates.push(ts);
      }
      reactions = { total: reactionsRows.length, dates, byType };
    }
    const reposts = collectDates(await read('reposts', null, { optional: true }));
    const votes = collectDates(await read('votes', null, { optional: true }));
    const savedRows = await read('savedItems', null, { optional: true });
    const memberFollowRows = await read('memberFollows', null, { optional: true });
    let memberFollows = null;
    if (memberFollowRows) {
      let active = 0;
      let unfollowed = 0;
      for (const r of memberFollowRows) {
        if (/^unfollow/i.test(r.status)) unfollowed++;
        else active++;
      }
      memberFollows = { active, unfollowed };
    }
    const hashtagRows = await read('hashtagFollows', null, { optional: true });
    const hashtags = [];
    if (hashtagRows) {
      const seen = new Set();
      for (const r of hashtagRows) {
        if (/^unfollow/i.test(r.state)) continue;
        const tag = cleanInline(r.tag, 60).replace(/^#+/, '');
        const key = tag.toLowerCase();
        if (!tag || seen.has(key)) continue;
        seen.add(key);
        hashtags.push(tag);
        if (hashtags.length >= 20) break;
      }
    }
    const searches = collectDates(await read('searchQueries', null, { optional: true }), 'time');
    const adsRows = await read('adsClicked', null, { optional: true });

    data.activity = {
      shares,
      comments,
      reactions,
      reposts,
      votes,
      savedItems: savedRows ? savedRows.length : null,
      memberFollows,
      hashtags,
      searches,
      adsClicked: adsRows ? adsRows.length : null,
    };
  }

  return data;
}
