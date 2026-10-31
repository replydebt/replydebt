// Local archive handoff between requesting a LinkedIn data export and opening the downloaded .zip.
// No email, no server, and no persisted directory handles.
import { BRAND_COLOR, PRODUCT_NAME, SITE_ORIGIN, STORAGE_PREFIX } from '../config.js';
import { isLinkedInArchiveName } from './archive-name.js';

export const LINKEDIN_DOWNLOAD_URL = 'https://www.linkedin.com/mypreferences/d/download-my-data';
const HANDOFF_KEY = `${STORAGE_PREFIX}handoff`;
const MAX_FOLDER_SCAN_ENTRIES = 5000;

// ---------- Return memory ----------
export const handoff = {
  get() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HANDOFF_KEY));
      if (!parsed || typeof parsed !== 'object') return null;
      if (!Number.isFinite(parsed.requestedAt) || parsed.requestedAt <= 0 || parsed.requestedAt > Date.now() + 86400000) {
        return null;
      }
      return { requestedAt: parsed.requestedAt };
    } catch {
      return null;
    }
  },
  markRequested() {
    const state = { requestedAt: Date.now() };
    try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
    return state;
  },
  clear() {
    try { localStorage.removeItem(HANDOFF_KEY); } catch { /* storage blocked */ }
  },
};

// ---------- Downloads folder watcher (tab RAM only) ----------
export const canWatchFolder = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
export const canPickFile = typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function' && window.isSecureContext;

export async function pickDownloadsFolder() {
  return window.showDirectoryPicker({ id: 'rd-downloads', startIn: 'downloads', mode: 'read' });
}

/** LinkedIn archives already present in the selected folder, newest first. */
export async function findArchives(handle) {
  const out = [];
  let scanned = 0;
  for await (const entry of handle.values()) {
    if (++scanned > MAX_FOLDER_SCAN_ENTRIES) break;
    if (entry.kind !== 'file' || !isLinkedInArchiveName(entry.name)) continue;
    try {
      const file = await entry.getFile();
      out.push(file);
    } catch { /* file vanished or locked */ }
  }
  return out.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * Poll the selected folder for a newly arrived LinkedIn archive.
 * Checks strictly by LinkedIn archive filename pattern and never reads unrelated .zip files.
 */
export function watchFolder(handle, { since = Date.now(), onFound, onTick = () => {}, onError = () => {}, interval = 2500 }) {
  const seen = new Map(); // name -> lastModified
  let stopped = false;
  let timer = null;

  const scan = async () => {
    if (stopped) return;
    try {
      let scanned = 0;
      for await (const entry of handle.values()) {
        if (stopped || ++scanned > MAX_FOLDER_SCAN_ENTRIES) break;
        if (entry.kind !== 'file' || !isLinkedInArchiveName(entry.name)) continue;
        const file = await entry.getFile().catch(() => null);
        if (!file || file.size === 0) continue;
        const prev = seen.get(entry.name);
        seen.set(entry.name, file.lastModified);
        if (prev === file.lastModified) continue;
        if (file.lastModified < since - 5000) continue;
        stopped = true;
        onFound(file);
        return;
      }
      onTick(Date.now());
    } catch (err) {
      onError(err);
    }
    if (!stopped) timer = setTimeout(scan, interval);
  };
  scan();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Open a file picker starting in Downloads (Chromium), filtered to .zip. */
export async function pickArchiveFile() {
  if (!canPickFile) return null;
  try {
    const [h] = await window.showOpenFilePicker({
      id: 'rd-archive',
      startIn: 'downloads',
      types: [{ description: 'LinkedIn data archive', accept: { 'application/zip': ['.zip'] } }],
      excludeAcceptAllOption: false,
    });
    return await h.getFile();
  } catch {
    return null;
  }
}

// ---------- Notifications ----------
export const canNotify = typeof window !== 'undefined' && 'Notification' in window;
export const notifyPermission = () => (canNotify ? Notification.permission : 'unsupported');

export async function requestNotifications() {
  if (!canNotify) return false;
  if (Notification.permission === 'granted') return true;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}

export function notify(title, body, tag = 'rd') {
  if (!canNotify || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag, icon: faviconHref(false), badge: faviconHref(false) });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch { /* some platforms only allow notifications from a service worker */ }
}

// ---------- Tab title + favicon ----------
const LOGO = (dot) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><rect width="34" height="34" rx="5" fill="${BRAND_COLOR}"/><path d="M11 22.5L17 11.5L23 22.5Z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><g fill="#fff"><circle cx="17" cy="11.5" r="3.6"/><circle cx="11" cy="22.5" r="3.6"/><circle cx="23" cy="22.5" r="3.6"/></g>${dot ? '<circle cx="27" cy="7" r="7" fill="#cb112d" stroke="#fff" stroke-width="2"/>' : ''}</svg>`;

export function faviconHref(dot) {
  return `data:image/svg+xml,${encodeURIComponent(LOGO(dot))}`;
}

export function setTab(title, { dot = false } = {}) {
  document.title = title;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = faviconHref(dot);
}

// ---------- Public URL + Calendar reminders ----------
export function publicAppUrl() {
  if (typeof location !== 'undefined' && (location.protocol === 'https:' || location.protocol === 'http:')) {
    return `${location.origin}${location.pathname}`;
  }
  return `${SITE_ORIGIN}/`;
}

const icsDate = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function reminderPayload(url = publicAppUrl(), minutes = 15) {
  const start = Date.now() + minutes * 60000;
  const end = start + 15 * 60000;
  const title = `Open my LinkedIn archive in ${PRODUCT_NAME}`;
  const details = `LinkedIn should have emailed your data archive by now (look for the first email; you do not need to wait for the second one).\n\n1. Download the .zip from LinkedIn's email\n2. Open ${url}\n3. Open the file locally in ${PRODUCT_NAME}`;
  return { start, end, title, details, url };
}

export function googleReminderUrl(url = publicAppUrl(), minutes = 15) {
  const { start, end, title, details } = reminderPayload(url, minutes);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${icsDate(start)}/${icsDate(end)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(url)}`;
}

export function outlookReminderUrl(url = publicAppUrl(), minutes = 15) {
  const { start, end, title, details } = reminderPayload(url, minutes);
  return `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(new Date(start).toISOString())}&enddt=${encodeURIComponent(new Date(end).toISOString())}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(url)}`;
}

export function downloadReminderIcs(url = publicAppUrl(), minutes = 15) {
  const { start, end, title, details } = reminderPayload(url, minutes);
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${PRODUCT_NAME}//EN`, 'BEGIN:VEVENT',
    `UID:${start}-rd@replydebt.github.io`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(details)}`, `URL:${url}`, `LOCATION:${esc(url)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blobUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'reply-debt-reminder.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
