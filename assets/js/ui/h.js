// Minimal, XSS-safe DOM builder. User data is only ever inserted as text nodes.

const BLOCKED_PROPS = new Set(['html', 'innerhtml', 'outerhtml', 'srcdoc']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

function assertSafeAttrUrl(value) {
  const compact = String(value).replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');
  if (/^(?:javascript|vbscript):/i.test(compact)) {
    throw new TypeError('Unsafe URL scheme is disabled.');
  }
  if (/^data:/i.test(compact) && !/^data:image\/svg\+xml,/i.test(compact)) {
    throw new TypeError('Unsafe data: URL attribute is disabled.');
  }
}

/**
 * h('div.card.card--x', { onclick, attrs }, child, [children], 'text')
 * Raw HTML injection (`html`, `innerHTML`, `srcdoc`), inline event strings, and inline style strings are strictly disallowed.
 */
export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      const lower = k.toLowerCase();
      if (BLOCKED_PROPS.has(lower)) throw new TypeError('Raw HTML injection is disabled.');
      if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') {
        if (typeof v !== 'object') throw new TypeError('Inline style strings are disabled.');
        Object.assign(el.style, v);
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (lower.startsWith('on')) {
        if (typeof v !== 'function') throw new TypeError('Inline event handler strings are disabled.');
        el.addEventListener(lower.slice(2), v);
      } else {
        if (URL_ATTRS.has(lower)) assertSafeAttrUrl(v);
        if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === '') continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0);
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const pasteKey = isMac ? 'Cmd+V' : 'Ctrl+V';

export function isTouchDevice() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

export function isMobileViewport() {
  return typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches;
}

export function isInAppBrowser() {
  return typeof navigator !== 'undefined' && /LinkedInApp|FBAN|FBAV|Instagram/i.test(navigator.userAgent || '');
}

export function isMobile() {
  return isMobileViewport()
    || isInAppBrowser()
    || (isTouchDevice() && typeof matchMedia !== 'undefined' && matchMedia('(max-width: 1024px)').matches);
}

export function pasteHint() {
  return isTouchDevice() ? 'tap and paste into the message box' : `paste with ${pasteKey}`;
}

export function localGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function localSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Only allow clean https:// LinkedIn member profile URLs (/in/... or /pub/...) from archive data. */
export function safeLinkedInUrl(url) {
  if (!url || typeof url !== 'string' || url.length > 500) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (host !== 'linkedin.com' && !/^(?:www|[a-z]{2})\.linkedin\.com$/.test(host)) return null;
    if (!/^\/(?:in|pub)\/[A-Za-z0-9%._~-]+(?:\/[A-Za-z0-9%._~-]+){0,4}\/?$/.test(u.pathname)) return null;
    if (/(?:^|\/)\.\.?(?:\/|$)/.test(u.pathname)) return null;
    if (/%(?:0[0-9a-f]|1[0-9a-f]|7f|2[027f]|3[ce]|5c)/i.test(u.pathname)) return null;
    u.search = '';
    u.hash = '';
    return u.href;
  } catch { /* invalid */ }
  return null;
}

export function threadUrl(convId) {
  if (!convId || typeof convId !== 'string' || convId.length > 160 || !/^2-[A-Za-z0-9+/=_-]+$/.test(convId)) return null;
  return `https://www.linkedin.com/messaging/thread/${encodeURIComponent(convId)}/`;
}
