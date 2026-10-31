// App state: minimized report, RAM-only session quotes, user marks, and derived action lists.
import { RETENTION_DAYS, STORAGE_PREFIX } from '../config.js';
import { store } from '../core/store.js';
import { DAY } from '../core/time.js';
import { MAX_CSV_ROWS } from '../core/csv.js';
import { REPORT_VERSION } from '../analyze/index.js';
import { weeklyPick } from '../analyze/reconnect.js';

const listeners = new Set();
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function sanitizeQuotes(src, maxEntries = 50000) {
  const out = Object.create(null);
  if (src && typeof src === 'object') {
    let count = 0;
    for (const [k, v] of Object.entries(src)) {
      if (UNSAFE_KEYS.has(k) || typeof k !== 'string' || k.length === 0 || k.length > 240) continue;
      if (++count > maxEntries) break;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (typeof v.text !== 'string' && typeof v.subject !== 'string') continue;
      out[k] = {
        text: typeof v.text === 'string' ? v.text : '',
        ...(typeof v.subject === 'string' ? { subject: v.subject } : {}),
      };
    }
  }
  return out;
}

const VALID_MARK_STATES = new Set(['done', 'dismissed', 'notRecruiter', 'skipped', 'hidden']);

export function sanitizeMarks(src, maxEntries = 50000) {
  const out = Object.create(null);
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    let count = 0;
    for (const [k, v] of Object.entries(src)) {
      if (UNSAFE_KEYS.has(k) || typeof k !== 'string' || k.length === 0 || k.length > 240) continue;
      if (++count > maxEntries) break;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (typeof v.state !== 'string' || !VALID_MARK_STATES.has(v.state)) continue;
      if (v.until !== undefined && !Number.isFinite(v.until)) continue;
      out[k] = {
        state: v.state,
        at: Number.isFinite(v.at) ? v.at : 0,
        ...(v.until !== undefined ? { until: v.until } : {}),
      };
    }
  }
  return out;
}

export function isValidSavedReport(report, now = Date.now()) {
  if (!report || typeof report !== 'object' || Array.isArray(report) || report.isSample) return false;
  if (report.version !== REPORT_VERSION) return false;
  if (!Number.isFinite(report.createdAt) || !Number.isFinite(report.expiresAt)) return false;
  if (report.expiresAt < now || report.expiresAt > now + (RETENTION_DAYS + 2) * DAY) return false;
  if (!report.me || typeof report.me !== 'object' || typeof report.me.name !== 'string') return false;
  if (report.me.headline !== undefined && typeof report.me.headline !== 'string') return false;
  if (!report.stats || typeof report.stats !== 'object' || Array.isArray(report.stats)) return false;
  for (const val of Object.values(report.stats)) {
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return false;
  }
  for (const optArr of [report.found, report.warnings]) {
    if (optArr !== undefined && (!Array.isArray(optArr) || !optArr.every((x) => typeof x === 'string'))) return false;
  }
  const lists = [report.people, report.recruiters, report.replies, report.reconnect, report.topCompanies];
  if (!lists.every((arr) => Array.isArray(arr) && arr.length <= MAX_CSV_ROWS)) return false;
  for (const p of report.people) {
    if (!p || typeof p !== 'object' || typeof p.key !== 'string' || typeof p.name !== 'string') return false;
    if (p.company !== undefined && typeof p.company !== 'string') return false;
    if (p.position !== undefined && typeof p.position !== 'string') return false;
    if (p.url !== undefined && typeof p.url !== 'string') return false;
    if (p.companyKey !== undefined && typeof p.companyKey !== 'string') return false;
  }
  for (const list of [report.recruiters, report.replies, report.reconnect]) {
    for (const r of list) {
      if (!r || typeof r !== 'object' || typeof r.personKey !== 'string') return false;
    }
  }
  for (const r of report.replies) {
    if (r.convId !== undefined && typeof r.convId !== 'string') return false;
  }
  for (const c of report.topCompanies) {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !Number.isFinite(c.count) || c.count < 0) return false;
    if (c.talked !== undefined && (!Number.isFinite(c.talked) || c.talked < 0)) return false;
  }
  return true;
}

export const app = {
  report: null,
  quotes: Object.create(null), // RAM-only: id -> { text, subject? }
  candidates: [],              // RAM-only: owner identity candidates from current session
  lastInput: null,             // RAM-only: File / File[] handle from current session (0 copied bytes)
  persist: false,              // Default OFF (RAM-only); user opts in via pre-open notice
  companyQuery: '',            // In-memory company search query (never written to URL/history)
  marks: Object.create(null),  // id -> { state, at, until? }
  peopleByKey: new Map(),
};

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit() { listeners.forEach((fn) => fn()); }

export async function loadSaved() {
  try {
    const [report, marks] = await Promise.all([store.get('report'), store.get('marks')]);
    if (!report) return false;
    const now = Date.now();
    if (!isValidSavedReport(report, now)) {
      await store.clearAll();
      return false;
    }
    app.report = report;
    app.quotes = Object.create(null);
    app.candidates = [];
    app.lastInput = null;
    app.persist = true;
    app.marks = sanitizeMarks(marks);
    app.peopleByKey = new Map(report.people.map((p) => [p.key, p]));
    emit();
    return true;
  } catch {
    await store.clearAll().catch(() => {});
    return false;
  }
}

/**
 * Apply an analyzed session.
 * - Sample sessions never touch IndexedDB and always use isolated RAM marks.
 * - Real sessions with persist=false clear any prior saved IndexedDB report/marks and stay in RAM.
 * - Real sessions with persist=true store ONLY the minimized report and marks (never quotes or files).
 */
export async function setSession(
  { report, quotes = null, candidates = [], input = null },
  { persist = false, keepMarks = false } = {},
) {
  const wasSample = Boolean(app.report?.isSample);
  app.report = report;
  app.quotes = sanitizeQuotes(quotes);
  app.candidates = Array.isArray(candidates) ? candidates : [];
  app.lastInput = report.isSample ? null : input;
  app.peopleByKey = new Map(report.people.map((p) => [p.key, p]));

  if (report.isSample) {
    app.persist = false;
    app.marks = Object.create(null);
    emit();
    return;
  }

  if (!keepMarks || wasSample) {
    let carryMarks = null;
    if (persist) {
      const [savedReport, savedMarks] = await Promise.all([store.get('report'), store.get('marks')]);
      const sameOwner = savedReport?.me?.name && report?.me?.name && savedReport.me.name === report.me.name;
      if (sameOwner) carryMarks = savedMarks;
    }
    app.marks = sanitizeMarks(carryMarks);
  }

  app.persist = Boolean(persist);
  if (app.persist) {
    await Promise.all([store.set('report', report), store.set('marks', app.marks)]);
  } else {
    await Promise.all([store.del('report'), store.del('marks')]);
  }
  emit();
}

export async function resetAll() {
  app.report = null;
  app.quotes = Object.create(null);
  app.candidates = [];
  app.lastInput = null;
  app.persist = false;
  app.companyQuery = '';
  app.marks = Object.create(null);
  app.peopleByKey = new Map();
  await store.clearAll();
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(STORAGE_PREFIX) || k.startsWith('nx.')) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
  emit();
}

export const getQuote = (id) => app.quotes[id] || null;
export const hasSessionQuotes = () => Object.keys(app.quotes).length > 0;

export function setCompanyQuery(q) {
  app.companyQuery = String(q || '');
  emit();
}

// ---------- Marks ----------
function persistMarks() {
  if (app.persist && app.report && !app.report.isSample) {
    store.set('marks', app.marks);
  }
}

export function mark(id) {
  const m = app.marks[id];
  if (!m) return null;
  if (m.until && m.until < Date.now()) return null;
  return m;
}

export function setMark(id, state, { days } = {}) {
  const targetMarks = app.marks;
  const prev = targetMarks[id] || null;
  targetMarks[id] = { state, at: Date.now(), ...(days ? { until: Date.now() + days * DAY } : {}) };
  persistMarks();
  emit();
  return () => {
    if (app.marks !== targetMarks) return;
    if (prev) targetMarks[id] = prev;
    else delete targetMarks[id];
    persistMarks();
    emit();
  };
}

export function hidePerson(key) { return setMark(`hide:${key}`, 'hidden'); }
export const isHidden = (key) => Boolean(mark(`hide:${key}`));
export function hiddenCount() {
  return Object.keys(app.marks).filter((k) => k.startsWith('hide:') || app.marks[k].state === 'dismissed' || app.marks[k].state === 'notRecruiter').length;
}
export function restoreHidden() {
  for (const k of Object.keys(app.marks)) {
    const s = app.marks[k].state;
    if (k.startsWith('hide:') || s === 'dismissed' || s === 'notRecruiter') delete app.marks[k];
  }
  persistMarks();
  emit();
}

export const person = (key) => app.peopleByKey.get(key) || { key, name: 'LinkedIn member', company: '', position: '', url: '' };

// ---------- Derived lists ----------
export const recId = (r) => `rec:${r.personKey}`;
export const repId = (r) => `rep:${r.convId}`;
export const reconId = (r) => `recon:${r.personKey}`;

export function recruiters({ includeDone = false } = {}) {
  if (!app.report) return [];
  return app.report.recruiters.filter((r) => {
    if (isHidden(r.personKey)) return false;
    const m = mark(recId(r));
    if (m && (m.state === 'dismissed' || m.state === 'notRecruiter')) return false;
    if (!includeDone && (r.replied || m?.state === 'done')) return false;
    return true;
  });
}
export const recruiterDone = (r) => r.replied || mark(recId(r))?.state === 'done';

export function replies() {
  if (!app.report) return [];
  return app.report.replies.filter((r) => !isHidden(r.personKey) && !mark(repId(r)));
}

export function reconnectPool() {
  if (!app.report) return [];
  return app.report.reconnect.filter((r) => !isHidden(r.personKey) && !mark(reconId(r)));
}

/** This week's five. Handled people drop out and are not replaced until next week (keeps it finite). */
export function weekly() {
  if (!app.report) return [];
  const all = app.report.reconnect.filter((r) => !isHidden(r.personKey) && mark(reconId(r))?.state !== 'dismissed');
  const picks = weeklyPick(all, 5);
  return picks.filter((r) => !mark(reconId(r)));
}

export function counts() {
  return {
    recruiters: recruiters().length,
    replies: replies().length,
    reconnect: weekly().length,
  };
}
