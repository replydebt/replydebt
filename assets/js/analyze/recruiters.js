// Detect recruiter outreach (conversations + invitation notes), deduplicated per person.
import { RECRUITER_TITLE, RECRUITER_CONTENT, CONGRATS_ROLE, JOB_SEEKER_CONTENT, SALES_CONTENT } from './signals.js';
import { fold, countMatches, companyKey, nameKey, firstName } from '../core/text.js';

const THRESHOLD = 4;

const GUESS_STOP = new Set([
  'i', 'the', 'a', 'an', 'our', 'my', 'this', 'that', 'your', 'we', 'you', 'us', 'them', 'their',
  'they', 'he', 'she', 'it', 'would', 'are', 'is', 'was', 'were', 'have', 'has', 'had', 'can', 'could',
  'will', 'let', 'hope', 'just', 'saw', 'if', 'please',
  'hi', 'hello', 'hey', 'dear', 'linkedin', 'github', 'inmail', 'remote', 'hybrid', 'onsite',
  'europe', 'emea', 'apac', 'latam', 'americas', 'usa', 'uk', 'london', 'berlin', 'paris', 'istanbul',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'series', 'seed', 'stealth', 'fortune', 'global',
  'react', 'angular', 'vue', 'svelte', 'nextjs', 'node', 'nodejs', 'typescript', 'javascript', 'python', 'java',
  'golang', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'flutter', 'kubernetes', 'docker', 'terraform',
  'aws', 'azure', 'gcp', 'postgres', 'postgresql', 'mongodb', 'redis', 'kafka', 'graphql', 'figma', 'sketch',
]);

const TRAILING_STOP = new Set([
  'i', 'we', 'you', 'they', 'he', 'she', 'it', 'our', 'my', 'your', 'this', 'that',
  'would', 'are', 'is', 'was', 'were', 'have', 'has', 'had', 'can', 'could', 'will',
  'let', 'hope', 'just', 'saw', 'if', 'please', 'and', 'or', 'but', 'so', 'as', 'for', 'with', 'about', 'regarding',
  'remote', 'hybrid', 'onsite', 'hi', 'hello', 'hey',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

// Horizontal whitespace ([ \t]+) prevents company names from bleeding across line breaks into the next sentence.
const CO_NAME = "[A-Z\\u00C0-\\u024F][\\w\\u00C0-\\u024F&.'-]*(?:[ \\t]+[A-Z\\u00C0-\\u024F][\\w\\u00C0-\\u024F&.'-]*){0,2}";
const HEADLINE_CO_RE = new RegExp(`\\b(?:at|@|chez|bei)[ \\t]+(${CO_NAME})`);

function extractHeadlineCompany(headline) {
  if (!headline) return '';
  const m = String(headline).slice(0, 300).match(HEADLINE_CO_RE);
  return m ? m[1].trim() : '';
}

const AFFILIATION_PATTERNS = [
  new RegExp(`\\b(?:recruiter|recruiting|talent(?:[ \\t]+partner|[ \\t]+acquisition(?:[ \\t]+lead)?|[ \\t]+lead)?|sourcer|headhunter|people[ \\t]+partner|hr|hiring(?:[ \\t]+manager)?|lead(?:ing)?[ \\t]+[a-z]+[ \\t]+hiring)[ \\t]+(?:at|@)[ \\t]+(${CO_NAME})`, 'g'),
  new RegExp(`\\b(?:our[ \\t]+(?:[A-Za-z-]+[ \\t]+){0,2}?team|(?:a|an|the|open|new)[ \\t]+(?:[A-Za-z-]+[ \\t]+){0,4}?(?:role|position|opportunity|opening))[ \\t]+(?:at|@)[ \\t]+(${CO_NAME})`, 'g'),
  new RegExp(`\\b(?:I'm|I am|We're|we're|We are|we are)[ \\t]+(?:a[ \\t]+[A-Za-z ]{2,32}?[ \\t]+(?:at|@)[ \\t]+|hiring[ \\t]+(?:[A-Za-z ]{2,32}?[ \\t]+)?at[ \\t]+|at[ \\t]+)(${CO_NAME})`, 'g'),
  new RegExp(`\\b(?:on[ \\t]+behalf[ \\t]+of|join(?:[ \\t]+our[ \\t]+team[ \\t]+at|[ \\t]+us[ \\t]+at)?|chez|bei)[ \\t]+(${CO_NAME})`, 'g'),
];

/** Best-effort employer extraction from explicit recruiter affiliation phrases (never "experience with React"). */
export function guessCompany(text, { meName = '', meHeadline = '' } = {}) {
  if (!text) return '';
  const sample = String(text).slice(0, 500);
  const meFull = nameKey(meName);
  const meFirst = fold(firstName(meName));
  const ownCo = companyKey(extractHeadlineCompany(meHeadline));

  for (const baseRe of AFFILIATION_PATTERNS) {
    const re = new RegExp(baseRe.source, baseRe.flags);
    let m;
    while ((m = re.exec(sample))) {
      const rawWords = m[1].replace(/[.,;:!?'-]+$/, '').trim().split(/[ \t]+/).filter(Boolean);
      while (rawWords.length > 0 && TRAILING_STOP.has(fold(rawWords[rawWords.length - 1]))) {
        rawWords.pop();
      }
      if (!rawWords.length) continue;
      const firstFolded = fold(rawWords[0]);
      if (!firstFolded || GUESS_STOP.has(firstFolded)) continue;
      if (rawWords.every((w) => GUESS_STOP.has(fold(w)))) continue;
      const candidate = rawWords.join(' ').replace(/[.,;:!?'-]+$/, '').trim();
      if (candidate.length < 2) continue;
      const candNameKey = nameKey(candidate);
      if (meFull && candNameKey === meFull) continue;
      if (meFirst && candNameKey === meFirst) continue;
      if (ownCo && companyKey(candidate) === ownCo) continue;
      return candidate;
    }
  }
  return '';
}

export function recruiterScore({ position, folded, inmail, invite = false }) {
  if (!folded) return 0;
  const contentHits = countMatches(folded, RECRUITER_CONTENT);
  // Every recruiter classification requires at least one hiring content signal so an HR contact's
  // "Nice to meet you!" never triggers a false job-offer row.
  if (contentHits === 0) return 0;
  if (CONGRATS_ROLE.test(folded) && contentHits <= 1) return 0;
  if (countMatches(folded, JOB_SEEKER_CONTENT) > 0) return 0;

  let score = Math.min(4, contentHits);
  if (position && RECRUITER_TITLE.test(fold(position))) score += 3;
  if (inmail) score += 1;
  if (invite) score += 2;
  const sales = countMatches(folded, SALES_CONTENT);
  if (sales) score -= 2 * Math.min(2, sales);
  return score;
}

/**
 * Find recruiters and separate session-only text/subjects from the persistence-safe list.
 * Returns { items, convIds, quotes }.
 */
export function findRecruitersWithQuotes(model) {
  const byPerson = new Map();
  const convIds = new Set();
  const quotes = Object.create(null);
  const meCtx = { meName: model.me?.name || '', meHeadline: model.me?.headline || '' };

  for (const c of model.conversations) {
    if (c.isGroup || c.startedByMe || !c.firstTheirAt) continue;
    const p = model.people.get(c.personKey);
    const score = recruiterScore({ position: p.position, folded: c.theirFolded, inmail: c.inmail });
    if (score < THRESHOLD) continue;
    convIds.add(c.id);
    const replied = Boolean(
      (c.lastMineAt && c.lastMineAt >= c.lastTheirAt)
      || (p.lastFromMeAt && p.lastFromMeAt >= c.lastTheirAt),
    );
    const quoteText = (!replied && c.lastTheirText) ? c.lastTheirText : c.firstTheirText;
    const candidate = {
      item: {
        personKey: p.key,
        convId: c.id,
        date: c.lastTheirAt || c.firstTheirAt,
        lastAt: c.lastAt,
        company: p.company || guessCompany(c.firstTheirText, meCtx) || guessCompany(c.subject, meCtx),
        replied,
        score,
        source: 'message',
        inmail: Boolean(c.inmail),
      },
      quote: { text: quoteText, subject: c.subject || '' },
    };

    const prev = byPerson.get(p.key);
    if (!prev || (!candidate.item.replied && prev.item.replied) || (candidate.item.replied === prev.item.replied && candidate.item.date > prev.item.date)) {
      byPerson.set(p.key, candidate);
    }
  }

  for (const v of model.invites) {
    if (byPerson.has(v.personKey)) continue;
    const p = model.people.get(v.personKey);
    const score = recruiterScore({ position: p.position, folded: v.folded, inmail: false, invite: true });
    if (score < THRESHOLD) continue;
    byPerson.set(p.key, {
      item: {
        personKey: p.key,
        convId: null,
        date: v.date,
        lastAt: v.date,
        company: p.company || guessCompany(v.text, meCtx),
        replied: Boolean(p.lastFromMeAt && (!v.date || p.lastFromMeAt >= v.date)),
        score,
        source: 'invitation',
        inmail: false,
      },
      quote: { text: v.text, subject: '' },
    });
  }

  const entries = [...byPerson.values()];
  entries.sort((a, b) => (a.item.replied === b.item.replied ? b.item.date - a.item.date : a.item.replied ? 1 : -1));
  const items = [];
  for (const { item, quote } of entries) {
    items.push(item);
    quotes[`rec:${item.personKey}`] = quote;
  }
  return { items, convIds, quotes };
}

export function findRecruiters(model) {
  return findRecruitersWithQuotes(model).items;
}
