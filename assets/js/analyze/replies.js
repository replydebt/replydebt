// Conversations where the other person wrote last and is waiting for an answer.
import { CLOSING, EMOJI_ONLY, QUESTION, SALES_CONTENT } from './signals.js';
import { fold, countMatches } from '../core/text.js';
import { DAY } from '../core/time.js';

export function isClosingMessage(text) {
  const raw = String(text || '').trim();
  const f = fold(raw).replace(/\s+/g, ' ').trim();
  if (!f) return true;
  if (EMOJI_ONLY.test(raw)) return true;
  return f.length <= 60 && CLOSING.test(f);
}

/**
 * Find unanswered 1:1 conversations, deduplicated per person, suppressing stale threads
 * when the owner already messaged that person more recently in another thread.
 */
export function findRepliesWithQuotes(model, recruiterConvIds, now = Date.now()) {
  const byPerson = new Map();
  for (const c of model.conversations) {
    if (c.isGroup || c.lastFromMe || !c.lastTheirAt) continue;
    if (recruiterConvIds.has(c.id)) continue;
    const age = now - c.lastTheirAt;
    if (age > 365 * DAY) continue;
    if (isClosingMessage(c.lastTheirText)) continue;

    const p = model.people.get(c.personKey);
    // If you already wrote to this person in a newer thread, do not surface an older thread as owed.
    if (p.lastFromMeAt && p.lastFromMeAt >= c.lastTheirAt) continue;

    const question = QUESTION.test(c.lastTheirText);
    const sales = countMatches(c.theirFolded, SALES_CONTENT);
    const knownRelationship = c.mine > 0 || (p.isConnection && question && sales === 0 && c.theirs <= 3);
    if (!knownRelationship) continue;
    if (sales >= 2 && c.mine === 0) continue;

    const days = age / DAY;
    const depth = Math.log2(1 + Math.min(p.sent, p.received));
    const recency = days < 30 ? 2 : days < 90 ? 1 : 0;
    const priority = (question ? 2 : 0) + depth + recency;
    const entry = {
      item: {
        personKey: p.key,
        convId: c.id,
        date: c.lastTheirAt,
        question,
        priority,
      },
      text: c.lastTheirText,
    };

    const prev = byPerson.get(p.key);
    if (!prev || entry.item.date > prev.item.date || (entry.item.date === prev.item.date && entry.item.priority > prev.item.priority)) {
      byPerson.set(p.key, entry);
    }
  }

  const entries = [...byPerson.values()];
  entries.sort((a, b) => b.item.priority - a.item.priority || b.item.date - a.item.date);
  const items = [];
  const quotes = Object.create(null);
  for (const { item, text } of entries) {
    items.push(item);
    quotes[`rep:${item.convId}`] = { text };
  }
  return { items, quotes };
}

export function findReplies(model, recruiterConvIds, now = Date.now()) {
  return findRepliesWithQuotes(model, recruiterConvIds, now).items;
}
