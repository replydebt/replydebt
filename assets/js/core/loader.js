// Recognize LinkedIn export files and turn them into typed records.
// Connection email addresses ("Email Address") are intentionally omitted and never parsed into memory.
import { parseCsv } from './csv.js';
import { parseDate } from './time.js';
import { cleanInline, cleanText, sanitizeFileName } from './text.js';

export const MAX_RECIPIENTS_PER_MSG = 64;

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
    },
  },
};

function pathDepth(p) {
  let depth = 0;
  for (let i = 0; i < p.length; i++) if (p[i] === '/') depth++;
  return depth;
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
  .map((x) => cleanInline(x, 500))
  .filter(Boolean)
  .slice(0, MAX_RECIPIENTS_PER_MSG);

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

  const data = { profile: null, connections: [], messages: [], invitations: [], found: Object.keys(found), warnings: [] };
  let validPrimaryHeaders = 0;

  const read = async (kind, pct) => {
    if (!found[kind]) return null;
    const displayName = sanitizeFileName(found[kind], 60);
    onProgress(`Reading ${displayName}`, pct);
    const text = await files.get(found[kind])();
    const parsed = parseCsv(text, FILES[kind].fields);
    if (parsed.header.length > 0) {
      if (kind === 'connections' || kind === 'messages') validPrimaryHeaders++;
    } else if (text.trim().length > 0) {
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
    };
  }

  let connections = await read('connections', 15);
  if (connections) {
    data.connections = connections
      .filter((c) => c.firstName || c.lastName)
      .map((c) => ({
        name: cleanInline(`${c.firstName} ${c.lastName}`, 200),
        url: cleanInline(c.url, 500),
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
    onProgress('Reading your conversations', 60);
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
        senderUrl: cleanInline(m.senderUrl, 500),
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

  let invitations = await read('invitations', 75);
  if (invitations) {
    data.invitations = invitations.map((v) => ({
      from: cleanInline(v.from, 200),
      to: cleanInline(v.to, 200),
      sentAt: parseDate(v.sentAt),
      message: cleanText(v.message).slice(0, 1000),
      direction: cleanInline(v.direction || '', 40).toUpperCase(),
      inviterUrl: cleanInline(v.inviterUrl, 500),
      inviteeUrl: cleanInline(v.inviteeUrl, 500),
    }));
    invitations = null;
  }

  return data;
}
