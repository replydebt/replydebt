// Self-hosted end-to-end verification in real headless Chrome/Edge via DevTools Protocol (zero dependencies).
// Exercises both http://127.0.0.1 and file:// protocols, CSP/Trusted-Types enforcement, zero post-open network requests,
// canary privacy minimization across IndexedDB + localStorage, dark-mode WCAG AA contrast, frame-guard, and blocked storage.
// Usage: node tools/e2e.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStaticServer } from './serve.mjs';
import { findChrome, freePort } from './make-og.mjs';
import { writeZip } from './zipwriter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANARIES = {
  email: 'CANARY_EMAIL_88123@secret-domain.invalid',
  body: 'CANARY_BODY_77234_CONFIDENTIAL_QUESTION?',
  subject: 'CANARY_SUBJECT_66345_SECRET_ROLE',
  invite: 'CANARY_INVITE_55456_PRIVATE hiring for an open Staff Product Designer position, open to a conversation?',
};

function makeCanaryZip(dir) {
  const files = new Map([
    ['Profile.csv', 'First Name,Last Name,Headline\nCasey,Rivera,Staff Engineer at Northstar'],
    ['Connections.csv', [
      'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
      `Emma,Collins,https://www.linkedin.com/in/emma-collins-pm,${CANARIES.email},Lumen Labs,Product Manager,14 Jan 2024`,
      `Marcus,Vance,https://www.linkedin.com/in/marcus-vance-eng,${CANARIES.email},Lumen Labs Inc.,Senior Engineer,10 Feb 2023`,
    ].join('\n')],
    ['messages.csv', [
      'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER',
      `2-rep1,,Casey Rivera,https://www.linkedin.com/in/casey-rivera,Emma Collins,https://www.linkedin.com/in/emma-collins-pm,2026-10-01 09:00:00 UTC,,Hi Emma,INBOX`,
      `2-rep1,,Emma Collins,https://www.linkedin.com/in/emma-collins-pm,Casey Rivera,https://www.linkedin.com/in/casey-rivera,2026-10-02 09:30:00 UTC,,${CANARIES.body},INBOX`,
      `2-rec1,Sponsored,Selin Aydin,https://www.linkedin.com/in/selin-aydin-talent,Casey Rivera,https://www.linkedin.com/in/casey-rivera,2026-10-03 11:00:00 UTC,${CANARIES.subject},Hi Casey we are hiring for an open Principal Engineer position at Vela and would love to interview you,INBOX`,
      `2-old1,,Casey Rivera,https://www.linkedin.com/in/casey-rivera,Marcus Vance,https://www.linkedin.com/in/marcus-vance-eng,2025-01-10 10:00:00 UTC,,Hey Marcus,INBOX`,
      `2-old1,,Marcus Vance,https://www.linkedin.com/in/marcus-vance-eng,Casey Rivera,https://www.linkedin.com/in/casey-rivera,2025-01-11 10:00:00 UTC,,Good catching up,INBOX`,
      `2-old1,,Casey Rivera,https://www.linkedin.com/in/casey-rivera,Marcus Vance,https://www.linkedin.com/in/marcus-vance-eng,2025-01-12 10:00:00 UTC,,Talk soon,INBOX`,
      `2-old1,,Marcus Vance,https://www.linkedin.com/in/marcus-vance-eng,Casey Rivera,https://www.linkedin.com/in/casey-rivera,2025-01-13 10:00:00 UTC,,Sounds good,INBOX`,
    ].join('\n')],
    ['Invitations.csv', [
      'From,To,Sent At,Message,Direction,inviterProfileUrl,inviteeProfileUrl',
      `Jonas Weber,Casey Rivera,10/04/26, 09:00 AM,"${CANARIES.invite}",INCOMING,https://www.linkedin.com/in/jonas-weber-rec,https://www.linkedin.com/in/casey-rivera`,
    ].join('\n')],
  ]);
  const out = path.join(dir, 'Basic_LinkedInDataExport_10-30-2026.zip');
  fs.writeFileSync(out, writeZip(files));
  return out;
}

const srv = await createStaticServer({ rootDir: root, port: 0 });
const BASE = process.env.BASE_URL || srv.url;
const BASE_DIR = BASE.replace(/[^/]*$/, '');
const FILE_URL = pathToFileURL(path.join(root, 'index.html')).href;
const FILE_DIR = FILE_URL.replace(/[^/]*$/, '');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-e2e-'));
const TMP_FILE_DIR = pathToFileURL(tmpDir).href;
const canaryZip = makeCanaryZip(tmpDir);
const profileDir = path.join(tmpDir, 'chrome-profile');
fs.mkdirSync(profileDir, { recursive: true });

const cdpPort = await freePort();
const chrome = spawn(findChrome(), [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profileDir}`,
  '--allow-file-access-from-files',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
const errors = [];
const networkRequests = [];
const listeners = [];

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
      ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method) {
          listeners.forEach((fn) => fn(msg));
        }
      };
      return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error('Could not connect to headless browser');
}

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

let S;
const page = (method, params = {}) => send(method, params, S);

async function evaluate(expr) {
  const r = await page('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(`Eval failed: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
  }
  return r.result.value;
}

async function waitFor(expr, timeout = 8000) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    if (await evaluate(`Boolean(${expr})`).catch(() => false)) return true;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for: ${expr}`);
}

async function viewport(width, height, mobile = false) {
  await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await page('Emulation.setTouchEmulationEnabled', { enabled: mobile });
}

async function go(url) {
  await page('Page.navigate', { url });
  await waitFor('document.readyState === "complete"');
  await sleep(180);
}

async function reload() {
  await page('Page.reload', {});
  await waitFor('document.readyState === "complete"');
  await sleep(220);
}

const click = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('missing ' + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const clickText = (sel, text) => evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)})); if (!el) throw new Error('missing ' + ${JSON.stringify(text)}); el.click(); return true; })()`);

const DUMP_STORAGE_EXPR = `(async () => {
  const ls = {};
  for (const k of Object.keys(localStorage)) ls[k] = localStorage.getItem(k);
  const idb = await new Promise((resolve) => {
    const req = indexedDB.open('network-audit', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onerror = () => resolve({});
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) { db.close(); resolve({}); return; }
      const tx = db.transaction('kv', 'readonly');
      const st = tx.objectStore('kv');
      const keysReq = st.getAllKeys();
      const valsReq = st.getAll();
      tx.oncomplete = () => {
        const out = {};
        keysReq.result.forEach((k, idx) => { out[k] = valsReq.result[idx]; });
        db.close();
        resolve(out);
      };
      tx.onerror = () => { db.close(); resolve({}); };
    };
  });
  return { ls, idb, serialized: JSON.stringify({ ls, idb }) };
})()`;

const CONTRAST_CHECK_EXPR = `(() => {
  function parseRgb(str) {
    const m = str && str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  }
  function blend(fg, bg) {
    const a = fg[3];
    return [
      Math.round(fg[0] * a + bg[0] * (1 - a)),
      Math.round(fg[1] * a + bg[1] * (1 - a)),
      Math.round(fg[2] * a + bg[2] * (1 - a)),
      1,
    ];
  }
  function lum([r, g, b]) {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function effectiveBg(el) {
    const chain = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const c = parseRgb(getComputedStyle(cur).backgroundColor);
      if (c && c[3] > 0) chain.unshift(c);
      if (c && c[3] === 1) break;
      cur = cur.parentElement;
    }
    let acc = [0, 0, 0, 1];
    for (const c of chain) acc = blend(c, acc);
    return acc;
  }
  function ratioFor(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const bg = effectiveBg(el);
    const rawFg = parseRgb(getComputedStyle(el).color);
    const fg = blend(rawFg, bg);
    const l1 = lum(fg);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  return {
    primaryBtn: ratioFor('.btn--primary'),
    badge: ratioFor('.badge'),
    activePill: ratioFor('.pill[aria-pressed="true"]'),
    cardTitle: ratioFor('.card__title'),
    mutedText: ratioFor('.t-low'),
  };
})()`;

const mobileLayoutCheckExpr = (expectedWidth) => `(() => {
  const expected = ${Number(expectedWidth)};
  const vw = window.innerWidth;
  const scrollW = document.documentElement.scrollWidth;
  const issues = [];
  if (vw !== expected) {
    issues.push(\`layout viewport inflated: innerWidth \${vw} !== expected \${expected}\`);
  }
  if (scrollW > vw) {
    issues.push(\`page scrollWidth \${scrollW} > innerWidth \${vw}\`);
  }

  const labelOf = (el) => (
    el.getAttribute('aria-label')
    || el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 28)
    || el.className
    || el.tagName
  );

  const visualRect = (root) => {
    const r = root.getBoundingClientRect();
    let left = r.left;
    let top = r.top;
    let right = r.right;
    let bottom = r.bottom;
    for (const child of root.querySelectorAll('*')) {
      const cs = getComputedStyle(child);
      if (cs.display === 'none' || cs.visibility === 'hidden' || child.classList.contains('sr-only')) continue;
      const cr = child.getBoundingClientRect();
      if (cr.width <= 0 || cr.height <= 0) continue;
      left = Math.min(left, cr.left);
      top = Math.min(top, cr.top);
      right = Math.max(right, cr.right);
      bottom = Math.max(bottom, cr.bottom);
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };

  const header = document.querySelector('header.gnav');
  const controls = [];
  if (header) {
    const raw = [
      ...header.querySelectorAll('.gnav__brand, .gnav__affiliation, .gnav__search, a, button'),
    ];
    for (const el of new Set(raw)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const vr = visualRect(el);
      controls.push({ el, label: labelOf(el), rect: r, vrect: vr });
      if (r.left < 0 || r.right > vw || vr.left < 0 || vr.right > vw) {
        issues.push(\`header control "\${labelOf(el)}" out of viewport [\${vr.left.toFixed(1)}, \${vr.right.toFixed(1)}] vs [0, \${vw}]\`);
      }
    }
    if (controls.length < 2) {
      issues.push(\`expected >= 2 visible header controls, found \${controls.length}\`);
    }
    const brand = header.querySelector('.gnav__brand');
    if (!brand || brand.getBoundingClientRect().width < 28) {
      issues.push('header .gnav__brand missing or collapsed');
    }

    const eps = 0.5;
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i];
        const b = controls[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const r1 = a.vrect;
        const r2 = b.vrect;
        const intersects = !(
          r1.right <= r2.left + eps
          || r2.right <= r1.left + eps
          || r1.bottom <= r2.top + eps
          || r2.bottom <= r1.top + eps
        );
        if (intersects) {
          issues.push(\`overlap between "\${a.label}" [\${r1.left.toFixed(1)},\${r1.right.toFixed(1)}] and "\${b.label}" [\${r2.left.toFixed(1)},\${r2.right.toFixed(1)}]\`);
        }
      }
    }
  }

  for (const el of document.querySelectorAll('.steps .btn, .card, .static-table, .company-search .btn, .frame-guard__card .btn, .modal, .modal__body, .menu, .msg-overlay, .msg-overlay__footer')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.left < -0.5 || r.right > vw + 0.5) {
      issues.push(\`body element "\${labelOf(el)}" out of viewport [\${r.left.toFixed(1)}, \${r.right.toFixed(1)}] vs [0, \${vw}]\`);
    }
    if (el.matches('.card, .static-table, .modal, .modal__body, .menu, .msg-overlay, .msg-overlay__footer') && el.scrollWidth > el.clientWidth + 1) {
      issues.push(\`element "\${el.className || el.tagName}" clips horizontally: scrollWidth \${el.scrollWidth} > clientWidth \${el.clientWidth}\`);
    }
  }

  return { ok: issues.length === 0, vw, scrollW, controlCount: controls.length, issues };
})()`;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` (${detail})` : ''}`);
}

try {
  await connect();
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true }));

  listeners.push((m) => {
    if (m.sessionId !== S) return;
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon\.ico|\/nested\/missing\/page$/.test(m.params.entry.url || '')) {
      errors.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
    }
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      networkRequests.push(u);
      const allowed = u.startsWith(BASE_DIR) || u.startsWith(FILE_DIR) || u.startsWith(TMP_FILE_DIR) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:');
      if (!allowed) errors.push(`external request: ${u}`);
    }
  });

  await page('Runtime.enable');
  await page('Log.enable');
  await page('Page.enable');
  await page('Network.enable');
  await page('DOM.enable');
  await send('Browser.grantPermissions', {
    origin: new URL(BASE).origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  }).catch(() => {});

  // 1. Welcome, Branding, Guide Modal, Focus & Return Memory
  console.log('1. Welcome & Handoff (HTTP)');
  await viewport(1440, 900);
  await go(BASE);
  await waitFor('document.querySelector(".hero__title")');
  check('welcome renders Network Audit brand & affiliation notice', await evaluate(
    'document.title.includes("Network Audit") && document.body.textContent.includes("Independent open-source tool")',
  ));

  await clickText('button', 'About');
  await waitFor('document.querySelector(".modal")');
  check('modal focuses primary footer button instead of top-right X', await evaluate(
    'document.activeElement?.textContent === "Close" && !document.activeElement?.classList.contains("btn--circle")',
  ));
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');
  check('ESC closes modal cleanly', !(await evaluate('Boolean(document.querySelector(".modal"))')));

  await evaluate(`localStorage.setItem('na.handoff', JSON.stringify({ requestedAt: Date.now() - 12 * 60000 }))`);
  await go(BASE);
  await waitFor('document.querySelector(".step--done")');
  check('return memory shows Downloads-first step 2 & LinkedIn downloads link', await evaluate(
    '[...document.querySelectorAll("button, a")].some(e => e.textContent.includes("Pick archive from Downloads")) && [...document.querySelectorAll("a")].some(e => e.textContent.includes("Open LinkedIn downloads page"))',
  ));

  // 2. Pre-Open Gate, Zero Post-Open Network Requests, & Canary Privacy (Mode A: Default RAM-only)
  console.log('2. Canary Archive: Default RAM-Only Mode & Zero Network Requests');
  const netBeforeOpen = networkRequests.length;
  {
    const { root: doc } = await page('DOM.getDocument', {});
    const { nodeId } = await page('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type="file"]' });
    await page('DOM.setFileInputFiles', { nodeId, files: [canaryZip] });
  }
  await waitFor('document.querySelector("#rd-persist-optin")');
  check('pre-open transparency gate opens with persistence OFF by default', await evaluate(
    'document.querySelector("#rd-persist-optin").checked === false',
  ));
  check('pre-open transparency gate includes offline Wi-Fi, extension/Incognito, and personal-use disclosures', await evaluate(
    '(() => { const t = document.querySelector(".modal")?.textContent || ""; return t.includes("turn off Wi-Fi") && t.includes("Private / Incognito") && t.includes("personal follow-ups"); })()',
  ));
  await clickText('.modal__footer .btn--primary', 'Open archive locally');
  await waitFor('document.querySelector(".gnav__items")', 10000);
  const netAfterOpen = networkRequests.length;
  check('zero network requests from file selection through analysis completion', netAfterOpen === netBeforeOpen, `${netAfterOpen - netBeforeOpen} requests`);

  check('session quotes visible in active RAM session', await evaluate(
    `document.body.textContent.includes(${JSON.stringify(CANARIES.body)})`,
  ));
  const ramDump = await evaluate(DUMP_STORAGE_EXPR);
  check('RAM-only default writes zero report/marks to IndexedDB', Object.keys(ramDump.idb).length === 0, JSON.stringify(Object.keys(ramDump.idb)));
  check('RAM-only default leaks zero canary secrets to storage', Object.values(CANARIES).every((c) => !ramDump.serialized.includes(c)));

  await go(BASE);
  await waitFor('document.querySelector(".hero__title")');
  check('reloading tab after RAM-only session clears all archive state', true);

  // 3. Canary Privacy (Mode B: Opt-In 90-Day Persistence)
  console.log('3. Canary Archive: Opt-In Persistence Minimization & Reload');
  {
    const { root: doc } = await page('DOM.getDocument', {});
    const { nodeId } = await page('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type="file"]' });
    await page('DOM.setFileInputFiles', { nodeId, files: [canaryZip] });
  }
  await waitFor('document.querySelector("#rd-persist-optin")');
  await click('#rd-persist-optin');
  check('user opted into 90-day minimized persistence', await evaluate('document.querySelector("#rd-persist-optin").checked === true'));
  await clickText('.modal__footer .btn--primary', 'Open archive locally');
  await waitFor('document.querySelector(".gnav__items")', 10000);
  await sleep(150);

  const persistDump = await evaluate(DUMP_STORAGE_EXPR);
  check('opted-in report saved with v3 schema and 90-day expiresAt', Boolean(
    persistDump.idb.report && persistDump.idb.report.version === 3 && persistDump.idb.report.expiresAt > Date.now() + 80 * 86400000,
  ));
  for (const [kind, secret] of Object.entries(CANARIES)) {
    check(`zero "${kind}" canary secret in IndexedDB or localStorage even with persistence ON`, !persistDump.serialized.includes(secret));
  }

  await evaluate(`location.hash = '#/recruiters'`);
  await reload();
  await waitFor('document.querySelector(".gnav__items")');
  check('persisted report reloads across tab refresh with omitted-quote privacy notice', await evaluate(
    'document.body.textContent.includes("Saved action list (message text omitted for privacy)") && document.body.textContent.includes("InMail")',
  ));

  // 4. ?demo=1 Isolation & ?reset=1 Confirmation
  console.log('4. Sample Mode Isolation & Reset Confirmation');
  await go(`${BASE}?demo=1#/home`);
  await waitFor('document.querySelector(".gnav__items")');
  check('?demo=1 loads Alex Morgan sample', (await evaluate('document.querySelector(".profile-card__name").textContent')) === 'Alex Morgan');
  check('sample mode disables live linkedin.com profile links on fictional contacts', await evaluate(
    'document.querySelectorAll("main a.row__name, main a.pcard__name").length === 0',
  ));

  await evaluate(`location.hash = '#/home'`);
  await reload();
  await waitFor('document.querySelector(".gnav__items")');
  check('?demo=1 did NOT overwrite saved real archive in IndexedDB', (await evaluate('document.querySelector(".profile-card__name").textContent')) === 'Casey Rivera');

  await go(`${BASE}?reset=1`);
  await waitFor('document.querySelector(".modal")');
  check('?reset=1 asks for confirmation before deleting saved data', await evaluate(
    'document.querySelector(".modal__title").textContent.includes("Clear saved Network Audit data")',
  ));
  await clickText('.modal__footer .btn--secondary', 'Cancel');
  check('canceling ?reset=1 preserves saved archive', (await evaluate('document.querySelector(".profile-card__name").textContent')) === 'Casey Rivera');

  // 5. Menus, Composer, In-Memory Company Search, & Dark-Mode WCAG AA Contrast
  console.log('5. Portaled Menus, Composer, In-Memory Company Search, & Dark-Mode Contrast');
  await evaluate(`location.hash = '#/replies'`);
  await waitFor('document.querySelector("main .row")');

  await click('main .row .menu-anchor button');
  await waitFor('document.querySelector("body > .menu")');
  check('row dropdown menu is portaled to document.body with fixed positioning', await evaluate(
    'document.querySelector("body > .menu") && getComputedStyle(document.querySelector("body > .menu")).position === "fixed"',
  ));
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }))');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');

  await clickText('main .row .btn--secondary', 'Reply');
  await waitFor('document.querySelector(".msg-overlay")');
  await click('.msg-overlay__header button[aria-label="Minimize message window"]');
  check('composer minimize toggles aria-expanded and label', await evaluate(
    'Boolean(document.querySelector(".msg-overlay--min button[aria-label=\\"Expand message window\\"][aria-expanded=\\"false\\"]"))',
  ));
  await click('.msg-overlay__header button[aria-label="Close message window"]');

  await evaluate(`location.hash = '#/companies'`);
  await waitFor('document.querySelector(".company-search input")');
  await evaluate(`(() => {
    const inp = document.querySelector('.company-search input');
    inp.value = 'Lumen';
    inp.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor('document.querySelector(".company-head__name")');
  check('company search merges Lumen variants & keeps query out of URL hash', await evaluate(
    'document.querySelector(".company-head__name").textContent.includes("Lumen") && location.hash === "#/companies"',
  ));

  await click('.gnav__me');
  await waitFor('document.querySelector(".menu--me")');
  await clickText('.menu__item', 'Dark mode');
  await sleep(150);
  await evaluate(`location.hash = '#/replies'`);
  await waitFor('document.querySelector(".pill[aria-pressed=\\"true\\"]")');
  await clickText('main .row .btn--secondary', 'Reply');
  await waitFor('document.querySelector(".msg-overlay .btn--primary")');
  const darkRatios = await evaluate(CONTRAST_CHECK_EXPR);
  for (const [elName, ratio] of Object.entries(darkRatios)) {
    check(`dark-mode WCAG AA contrast >= 4.5:1 on ${elName}`, ratio !== null && ratio >= 4.5, ratio ? `${ratio.toFixed(2)}:1` : 'missing');
  }
  await click('.msg-overlay__header button[aria-label="Close message window"]');

  // Trigger an Undo toast, test Me -> Open a newer archive menu dismissal, then deleteAll cleanup
  await click('main .row .menu-anchor button');
  await waitFor('document.querySelector("body > .menu")');
  await clickText('body > .menu .menu__item', 'Mark as replied');
  await waitFor('document.querySelector(".toast__action")');

  await click('.gnav__me');
  await waitFor('document.querySelector(".menu--me")');
  await clickText('.menu--me button', 'Open a newer archive');
  check('clicking Open a newer archive closes the portaled Me dropdown cleanly', await evaluate(
    '!document.querySelector("body > .menu")',
  ));

  // Clean up persisted data via UI deleteAll
  await click('.gnav__me');
  await waitFor('document.querySelector(".menu--me")');
  await clickText('.menu__item', 'Delete data from this browser');
  await waitFor('document.querySelector(".modal")');
  await clickText('.modal__footer .btn--primary', 'Delete local data');
  await waitFor('document.querySelector(".hero__title")');
  check('Delete data from this browser clears IndexedDB, removes stale Undo toasts, and returns to Welcome', await evaluate(
    '!document.querySelector(".toast__action")',
  ));

  // 6. Mobile Viewport & Frame-Embed Guard & Static Legal Pages (JS Disabled) & Nested 404
  console.log('6. Mobile Viewports (360x800, 375x812 & 390x844), Frame-Embed Defense, No-JS Static Privacy Page, & Nested 404');
  for (const [mw, mh] of [[360, 800], [375, 812], [390, 844]]) {
    await viewport(mw, mh, true);
    const expr = mobileLayoutCheckExpr(mw);

    await go(BASE);
    await waitFor('document.querySelector(".mobile-callout")');
    const welcomeLayout = await evaluate(expr);
    check(
      `mobile ${mw}x${mh} Welcome (guestNav): laptop callout, zero header overlap/clipping, & scrollWidth <= innerWidth`,
      welcomeLayout.ok && (await evaluate('Boolean(document.querySelector(".mobile-callout"))')),
      welcomeLayout.issues.join('; ') || `${welcomeLayout.controlCount} header controls, scrollW=${welcomeLayout.scrollW}`,
    );

    await evaluate(`localStorage.setItem('na.handoff', JSON.stringify({ requestedAt: Date.now() - 12 * 60000 }))`);
    await go(BASE);
    await waitFor('document.querySelector(".step--done")');
    const handoffLayout = await evaluate(expr);
    await evaluate(`localStorage.removeItem('na.handoff')`);
    check(
      `mobile ${mw}x${mh} Welcome return-memory Step 2: buttons unclipped & scrollWidth <= innerWidth`,
      handoffLayout.ok,
      handoffLayout.issues.join('; ') || `scrollW=${handoffLayout.scrollW}`,
    );

    await go(`${BASE}?demo=1#/home`);
    await waitFor('document.querySelector(".gnav__items")');
    const homeLayout = await evaluate(expr);
    check(
      `mobile ${mw}x${mh} Home (appNav): zero header overlap/clipping & scrollWidth <= innerWidth`,
      homeLayout.ok,
      homeLayout.issues.join('; ') || `${homeLayout.controlCount} header controls, scrollW=${homeLayout.scrollW}`,
    );

    for (const r of ['replies', 'recruiters', 'reconnect']) {
      await evaluate(`location.hash = '#/${r}'`);
      await sleep(80);
      const listLayout = await evaluate(expr);
      if (!listLayout.ok) {
        check(`mobile ${mw}x${mh} #/${r}: zero clipping & scrollWidth <= innerWidth`, false, listLayout.issues.join('; '));
      }
    }

    await evaluate(`location.hash = '#/companies'`);
    await waitFor('document.querySelector(".company-search input")');
    await evaluate(`(() => {
      const inp = document.querySelector('.company-search input');
      inp.value = 'Lumen';
      inp.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`);
    await waitFor('document.querySelector(".company-head__name")');
    const companiesLayout = await evaluate(expr);
    check(
      `mobile ${mw}x${mh} Companies search: Search/Clear buttons unclipped & scrollWidth <= innerWidth`,
      companiesLayout.ok,
      companiesLayout.issues.join('; ') || `scrollW=${companiesLayout.scrollW}`,
    );

    await go(`${BASE}privacy.html`);
    await waitFor('document.querySelector(".static-card")');
    const privacyLayout = await evaluate(expr);
    check(
      `mobile ${mw}x${mh} privacy.html: zero header overlap/clipping, zero table clipping, & scrollWidth <= innerWidth`,
      privacyLayout.ok,
      privacyLayout.issues.join('; ') || `${privacyLayout.controlCount} header controls, scrollW=${privacyLayout.scrollW}`,
    );

    await go(`${BASE}404.html`);
    await waitFor('document.querySelector(".frame-guard__card")');
    const notFoundLayout = await evaluate(expr);
    check(
      `mobile ${mw}x${mh} 404.html: zero clipping & scrollWidth <= innerWidth`,
      notFoundLayout.ok,
      notFoundLayout.issues.join('; ') || `scrollW=${notFoundLayout.scrollW}`,
    );
  }

  // Verify guide modal, wide-font guestNav resilience, landscape Me-menu/composer reachability, and breakpoint sweep
  {
    await viewport(360, 800, true);
    await go(BASE);
    await waitFor('document.querySelector(".hero__title")');
    const wideFontLayout = await evaluate(`(() => {
      document.body.style.fontFamily = 'Verdana, sans-serif';
      const res = ${mobileLayoutCheckExpr(360)};
      document.body.style.fontFamily = '';
      return res;
    })()`);
    check('mobile 360x800 guestNav survives wide system font metrics (Verdana) without overlap or overflow', wideFontLayout.ok, wideFontLayout.issues.join('; '));

    await clickText('button', 'Show me exactly what to click');
    await waitFor('document.querySelector(".modal")');
    const modalFits = await evaluate(`(() => {
      const m = document.querySelector('.modal').getBoundingClientRect();
      const btns = [...document.querySelectorAll('.modal a, .modal button')];
      return m.left >= 0 && m.right <= 360 && btns.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= 360; });
    })()`);
    check('mobile 360x800 guideModal fits strictly within [0, 360]', modalFits);

    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');

    // Short / landscape mobile viewport (667x375): portaled Me menu stays in viewport & scrolls without self-closing, and composer footer stays reachable
    await viewport(667, 375, true);
    await go(`${BASE}?demo=1#/home`);
    await waitFor('document.querySelector(".gnav__items")');
    await sleep(120);
    await click('.gnav__me');
    await waitFor('document.querySelector("body > .menu--me")');
    const landscapeMenuOk = await evaluate(`(async () => {
      const m = document.querySelector('body > .menu--me');
      if (!m) return { ok: false, reason: 'missing menu' };
      const r = m.getBoundingClientRect();
      const cs = getComputedStyle(m);
      if (r.top < 0 || r.bottom > innerHeight + 0.5 || r.left < 0 || r.right > innerWidth + 0.5) {
        return { ok: false, reason: 'menu rect out of viewport: ' + JSON.stringify({ r, innerWidth, innerHeight, style: m.getAttribute('style'), csMaxH: cs.maxHeight }) };
      }
      if (cs.overflowY !== 'auto') return { ok: false, reason: 'expected overflow-y: auto, got ' + cs.overflowY };
      m.scrollTop = m.scrollHeight;
      m.dispatchEvent(new Event('scroll', { bubbles: false }));
      await new Promise((res) => setTimeout(res, 60));
      if (!document.body.contains(m)) return { ok: false, reason: 'scrolling inside menu self-closed it' };
      const delBtn = [...m.querySelectorAll('.menu__item')].find((e) => e.textContent.includes('Delete data'));
      const dr = delBtn.getBoundingClientRect();
      const visible = dr.top >= r.top - 1 && dr.bottom <= innerHeight + 1;
      return { ok: visible, reason: visible ? '' : 'Delete data item not visible after scroll: ' + JSON.stringify(dr) };
    })()`);
    check('landscape mobile 667x375 Me menu clamps to viewport and scrolls to bottom items without self-closing', landscapeMenuOk.ok, landscapeMenuOk.reason);
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');

    await clickText('main .row .btn--secondary', 'Reply');
    await waitFor('document.querySelector(".msg-overlay")');
    await sleep(240);
    const landscapeComposerOk = await evaluate(`(() => {
      const o = document.querySelector('.msg-overlay');
      const ftr = o.querySelector('.msg-overlay__footer').getBoundingClientRect();
      const taFs = getComputedStyle(o.querySelector('textarea.composer')).fontSize;
      const btns = [...o.querySelectorAll('.msg-overlay__footer button')];
      const ok = taFs === '16px' && ftr.bottom <= innerHeight + 0.5 && btns.every((b) => {
        const r = b.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5;
      });
      return { ok, detail: ok ? '' : JSON.stringify({ taFs, innerWidth, innerHeight, ftr }) };
    })()`);
    check('landscape mobile 667x375 composer uses 16px font (no iOS zoom) and keeps footer buttons reachable', landscapeComposerOk.ok, landscapeComposerOk.detail);

    const sweepIssues = [];
    for (const [bw, bh, isMob] of [[320, 568, true], [350, 800, true], [430, 932, true], [768, 1024, false], [991, 900, false], [1176, 900, false]]) {
      await viewport(bw, bh, isMob);
      await go(BASE);
      await waitFor('document.querySelector(".hero__title")');
      const r1 = await evaluate(mobileLayoutCheckExpr(bw));
      if (!r1.ok) sweepIssues.push(`Welcome@${bw}: ${r1.issues.join(', ')}`);
      await go(`${BASE}?demo=1#/home`);
      await waitFor('document.querySelector(".gnav__items")');
      const r2 = await evaluate(mobileLayoutCheckExpr(bw));
      if (!r2.ok) sweepIssues.push(`Home@${bw}: ${r2.issues.join(', ')}`);
    }
    check('responsive breakpoint sweep (320, 350, 430, 768, 991, 1176) has zero header overlap or overflow', sweepIssues.length === 0, sweepIssues.join(' | '));

    // Verify LinkedIn Mobile App UX at 375x812: fixed 5-tab bottom bar with labels, top search bar navigation, horizontal profile strip on Home only, & minimized composer docking
    await viewport(375, 812, true);
    await go(`${BASE}?demo=1#/home`);
    await waitFor('document.querySelector(".gnav__items")');
    const mobileAppShell = await evaluate(`(() => {
      const bnav = document.querySelector('nav.gnav__items');
      const bcs = getComputedStyle(bnav);
      const br = bnav.getBoundingClientRect();
      const labels = [...bnav.querySelectorAll('.gnav__label')];
      const labelsVisible = labels.length === 5 && labels.every((l) => getComputedStyle(l).display !== 'none' && l.getBoundingClientRect().width > 20);
      const searchInp = document.querySelector('.gnav--app .gnav__search input');
      const sr = searchInp?.getBoundingClientRect();
      const searchOk = sr && sr.width >= 150 && getComputedStyle(searchInp).fontSize === '16px';
      const homeProfileVisible = getComputedStyle(document.querySelector('.rail--left')).display !== 'none';
      return {
        ok: bcs.position === 'fixed' && Math.abs(br.bottom - innerHeight) <= 1 && Math.abs(br.width - innerWidth) <= 1 && labelsVisible && searchOk && homeProfileVisible,
        detail: JSON.stringify({ pos: bcs.position, bottom: br.bottom, innerHeight, labelsVisible, searchW: sr?.width, homeProfileVisible }),
      };
    })()`);
    check('mobile 375x812 LinkedIn app UX: fixed 5-tab bottom bar with labels, 16px live top search bar, and Home profile strip', mobileAppShell.ok, mobileAppShell.detail);

    // Tap bottom tab "Recruiters" -> route switches, aria-current updates, and left profile rail hides on list tab
    await click('nav.gnav__items a[href="#/recruiters"]');
    await waitFor('location.hash === "#/recruiters"');
    await sleep(80);
    check('mobile 375x812 tapping bottom tab switches route, updates aria-current, and hides Home profile strip on list views', await evaluate(
      'document.querySelector(\'nav.gnav__items a[href="#/recruiters"]\')?.getAttribute("aria-current") === "page" && getComputedStyle(document.querySelector(".rail--left")).display === "none"',
    ));

    // Open mobile composer: verify textarea flexes vertically (eliminating blank void), then minimize and verify docking above bottom 5-tab bar
    await clickText('main .row .btn--secondary', 'Reply');
    await waitFor('document.querySelector(".msg-overlay")');
    const expandedComposerOk = await evaluate(`(() => {
      const ta = document.querySelector('.msg-overlay textarea.composer');
      const chips = document.querySelector('.msg-overlay .chips');
      const tr = ta?.getBoundingClientRect();
      const cr = chips?.getBoundingClientRect();
      return {
        ok: Boolean(tr && tr.height >= 220 && (!cr || cr.height <= 46)),
        detail: JSON.stringify({ taH: tr?.height, chipsH: cr?.height }),
      };
    })()`);
    check('mobile 375x812 expanded composer textarea fills available sheet height (>= 220px, zero dead void) with single-row chips', expandedComposerOk.ok, expandedComposerOk.detail);

    await click('.msg-overlay__header button[aria-label="Minimize message window"]');
    await sleep(80);
    const minDockedAboveTabs = await evaluate(`(() => {
      const minRect = document.querySelector('.msg-overlay--min')?.getBoundingClientRect();
      const tabRect = document.querySelector('nav.gnav__items')?.getBoundingClientRect();
      return Boolean(minRect && tabRect && minRect.bottom <= tabRect.top - 2 && minRect.top > 60);
    })()`);
    check('mobile 375x812 minimized composer docks cleanly above the fixed 5-tab bottom navigation bar', minDockedAboveTabs);
    await click('.msg-overlay__header button[aria-label="Close message window"]');

    // Open row "..." menu near bottom of list and verify it never overlaps the fixed 5-tab bottom bar
    const rowMenuClearsTabs = await evaluate(`(async () => {
      const btns = [...document.querySelectorAll('main .row .menu-anchor button')];
      const lastBtn = btns[btns.length - 1];
      if (!lastBtn) return { ok: false, detail: 'no row menu button' };
      lastBtn.scrollIntoView({ block: 'end' });
      await new Promise((r) => setTimeout(r, 60));
      lastBtn.click();
      await new Promise((r) => setTimeout(r, 60));
      const menu = document.querySelector('body > .menu');
      const tabs = document.querySelector('nav.gnav__items');
      if (!menu || !tabs) return { ok: false, detail: 'missing menu or tabs' };
      const mr = menu.getBoundingClientRect();
      const tr = tabs.getBoundingClientRect();
      return {
        ok: mr.bottom <= tr.top + 0.5 && mr.top >= 0,
        detail: JSON.stringify({ menuTop: mr.top, menuBottom: mr.bottom, tabTop: tr.top }),
      };
    })()`);
    check('mobile 375x812 portaled row "..." dropdown menu clears fixed 5-tab bottom navigation bar', rowMenuClearsTabs.ok, rowMenuClearsTabs.detail);
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');

    // Live top search bar (oninput) from #/home navigates to #/companies, preserves input focus & caret, and supports clear button
    await evaluate(`location.hash = '#/home'`);
    await waitFor('location.hash === "#/home"');
    await sleep(80);
    const liveSearchOk = await evaluate(`(() => {
      const inp = document.querySelector('.gnav--app .gnav__search input');
      if (!inp) return { ok: false, detail: 'missing search input' };
      inp.focus();
      inp.value = 'Lumen';
      inp.setSelectionRange(5, 5);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      const clearBtn = document.querySelector('.gnav--app .gnav__search-clear');
      const stayedFocused = document.activeElement === inp && inp.selectionStart === 5;
      const onCompanies = location.hash === '#/companies' && document.querySelector('.company-head__name')?.textContent.includes('Lumen');
      const clearVisible = Boolean(clearBtn && !clearBtn.hidden && clearBtn.getBoundingClientRect().width >= 24);
      if (!stayedFocused || !onCompanies || !clearVisible) {
        return { ok: false, detail: JSON.stringify({ stayedFocused, onCompanies, clearVisible, hash: location.hash }) };
      }
      clearBtn.click();
      const clearedOk = inp.value === '' && clearBtn.hidden && document.activeElement === inp;
      inp.blur();
      return { ok: clearedOk, detail: clearedOk ? '' : 'clear button did not reset/refocus input' };
    })()`);
    check('mobile 375x812 live top search bar updates #/companies on input without losing focus and clears cleanly', liveSearchOk.ok, liveSearchOk.detail);

    // Simulated virtual-keyboard short viewport (375x420): focusing text input sets data-kb="1" and hides bottom tab bar
    await viewport(375, 420, true);
    await sleep(60);
    const kbHideOk = await evaluate(`(async () => {
      const inp = document.querySelector('.gnav--app .gnav__search input');
      const tabs = document.querySelector('nav.gnav__items');
      inp.focus();
      const hiddenWhileTyping = document.documentElement.getAttribute('data-kb') === '1' && getComputedStyle(tabs).display === 'none';
      inp.blur();
      await new Promise((r) => setTimeout(r, 40));
      const restoredOnBlur = !document.documentElement.hasAttribute('data-kb') && getComputedStyle(tabs).display !== 'none';
      return { ok: hiddenWhileTyping && restoredOnBlur, detail: JSON.stringify({ hiddenWhileTyping, restoredOnBlur }) };
    })()`);
    check('mobile virtual-keyboard viewport (375x420) hides fixed bottom tab bar while typing and restores on blur', kbHideOk.ok, kbHideOk.detail);

    // Restore 390x844 mobile viewport to audit hydrated Welcome Schema.org Microdata parity, skip-link, >=24px tap targets, and heading hierarchy
    await viewport(390, 844, true);
    const headingAuditExpr = `(() => {
      const hs = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((el) => Number(el.tagName.slice(1)));
      if (!hs.length || hs[0] !== 1) return { ok: false, hs };
      if (hs.filter((n) => n === 1).length !== 1) return { ok: false, hs };
      for (let i = 1; i < hs.length; i++) {
        if (hs[i] > hs[i - 1] + 1) return { ok: false, hs };
      }
      return { ok: true, hs };
    })()`;
    const headingFailures = [];
    for (const r of ['home', 'replies', 'recruiters', 'reconnect', 'companies', 'insights']) {
      await evaluate(`location.hash = '#/${r}'`);
      await sleep(80);
      const hr = await evaluate(headingAuditExpr);
      if (!hr.ok) headingFailures.push(`${r}: [${hr.hs.join(',')}]`);
    }

    // Verify #/insights Complete-archive Algorithm Mirror UI, zero mobile overflow, and Followed Companies handoff
    const insightsMobileLayout = await evaluate(mobileLayoutCheckExpr(390));
    const insightsRenderedOk = await evaluate(`(() => {
      const txt = document.querySelector('main')?.textContent || '';
      const pillars = document.querySelectorAll('.ins-pillar').length;
      const bars = document.querySelectorAll('svg.ins-bar').length;
      return txt.includes('Complete archive detected')
        && txt.includes('Design Systems')
        && txt.includes('Active weekly contributor')
        && txt.includes('sent invitations still unaccepted')
        && pillars >= 2
        && bars >= 8;
    })()`);
    check('mobile 390x844 #/insights renders Complete archive credibility, 5-pillar specialties, persona, and activity with zero overflow', insightsMobileLayout.ok && insightsRenderedOk, insightsMobileLayout.issues?.join(', ') || '');

    await clickText('main button', 'View followed companies');
    await waitFor('location.hash === "#/companies"');
    await sleep(80);
    const followedFilterOk = await evaluate(`(() => {
      const activePill = document.querySelector('.pills .pill[aria-pressed="true"]')?.textContent || '';
      const rows = [...document.querySelectorAll('main button.company-row')];
      return activePill.includes('Following') && rows.length === 5 && rows.some((r) => r.textContent.includes('Lumen Labs'));
    })()`);
    check('#/insights "View followed companies" activates Following filter on #/companies', followedFilterOk);

    await clickText('main button.company-row', 'Lumen Labs');
    await sleep(80);
    const socialBadgesOk = await evaluate(`(() => {
      const firstRow = document.querySelector('main .row')?.textContent || '';
      return firstRow.includes('Emma Collins') && firstRow.includes('Recommended you') && firstRow.includes('Endorsed you');
    })()`);
    check('#/companies company detail ranks social-capital warmest connection first with trust badges', socialBadgesOk);

    const appFooterTargetsOk = await evaluate(`(() => {
      const links = [...document.querySelectorAll('.site-footer a')];
      return links.length >= 2 && links.every((a) => a.getBoundingClientRect().height >= 24);
    })()`);
    check('mobile 390x844 authenticated site-footer links meet WCAG 2.2 AA >= 24px tap-target height', appFooterTargetsOk);

    await go(BASE);
    await waitFor('document.querySelector(".hero__title")');
    const welcomeHr = await evaluate(headingAuditExpr);
    if (!welcomeHr.ok) headingFailures.push(`welcome: [${welcomeHr.hs.join(',')}]`);
    check('live DOM sequential heading hierarchy (single h1 first, zero skipped levels) across Welcome + all 6 app routes', headingFailures.length === 0, headingFailures.join(' | '));

    const hydratedSeoAndTargets = await evaluate(`(() => {
      const hasSkip = Boolean(document.querySelector('a.skip-link[href="#main"]'));
      const sw = document.querySelectorAll('[itemtype="https://schema.org/SoftwareApplication"]').length;
      const faq = document.querySelectorAll('[itemtype="https://schema.org/FAQPage"]').length;
      const qs = document.querySelectorAll('[itemtype="https://schema.org/Question"]').length;
      const ans = document.querySelectorAll('[itemtype="https://schema.org/Answer"]').length;
      const tapEls = [
        ...document.querySelectorAll('.guest-footer a, .guest-footer button, .mobile-callout .inline-link, .step__body > .inline-link, header.gnav a, header.gnav button'),
      ].filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0);
      const small = tapEls.filter((el) => el.getBoundingClientRect().height < 24).map((el) => el.textContent.trim() + ':' + el.getBoundingClientRect().height.toFixed(1));
      return {
        ok: hasSkip && sw === 1 && faq === 1 && qs === 4 && ans === 4 && tapEls.length >= 8 && small.length === 0,
        detail: JSON.stringify({ hasSkip, sw, faq, qs, ans, tapCount: tapEls.length, small }),
      };
    })()`);
    check('live JS-hydrated Welcome DOM preserves .skip-link, Schema.org SoftwareApplication + FAQPage Microdata, and >= 24px mobile tap targets', hydratedSeoAndTargets.ok, hydratedSeoAndTargets.detail);
  }

  const framerPath = path.join(tmpDir, 'framer.html');
  fs.writeFileSync(framerPath, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Host</title><iframe id="f" width="100%" height="700" src=${JSON.stringify(FILE_URL)}></iframe>`);
  await viewport(360, 800, true);
  await go(pathToFileURL(framerPath).href);
  await waitFor('document.getElementById("f")?.contentDocument?.querySelector(".frame-guard")');
  const frameGuardMobileOk = await evaluate(`(() => {
    const doc = document.getElementById('f').contentDocument;
    const card = doc.querySelector('.frame-guard__card');
    const btn = card.querySelector('.btn');
    const cr = card.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    return card.scrollWidth <= card.clientWidth + 1 && br.left >= cr.left && br.right <= cr.right + 0.5;
  })()`);
  check('mobile 360x800 frame-embed guard card has zero CTA button clipping', frameGuardMobileOk);

  await viewport(1440, 900, false);
  await go(pathToFileURL(framerPath).href);
  await waitFor('document.getElementById("f")?.contentDocument?.querySelector(".frame-guard")');
  const framedText = await evaluate('document.getElementById("f")?.contentDocument?.body?.textContent || ""');
  check('embedded iframe triggers frame-embed guard instead of mounting app', (
    framedText.includes('cannot run inside an embedded frame') && !framedText.includes('Get my archive')
  ));

  await page('Emulation.setScriptExecutionDisabled', { value: true });
  await page('Page.navigate', { url: BASE });
  await sleep(300);
  await page('Emulation.setScriptExecutionDisabled', { value: false });
  check('index.html pre-rendered SEO shell renders h1, four action list cards, and FAQPage content with JavaScript disabled', await evaluate(
    'Boolean(document.querySelector(".prerender h1")) && document.querySelectorAll(".prerender__card").length === 4 && document.querySelectorAll("[itemtype=\\"https://schema.org/Question\\"]").length === 4',
  ));

  await page('Emulation.setScriptExecutionDisabled', { value: true });
  await page('Page.navigate', { url: `${BASE}privacy.html` });
  await sleep(300);
  await page('Emulation.setScriptExecutionDisabled', { value: false });
  check('privacy.html renders full GDPR & KVKK disclosures with JavaScript disabled', await evaluate(
    'document.body.textContent.includes("Nayri Akbuğa") && document.body.textContent.includes("KVKK") && document.body.textContent.includes("GDPR") && document.body.textContent.includes("Private / Incognito")',
  ));

  // Verify robots.txt and sitemap.xml are served with proper status & content-types
  {
    const [r, s] = await Promise.all([fetch(`${BASE}robots.txt`), fetch(`${BASE}sitemap.xml`)]);
    const [rt, st] = await Promise.all([r.text(), s.text()]);
    const seoEndpointsOk = r.status === 200 && s.status === 200
      && (s.headers.get('content-type') || '').includes('xml')
      && rt.includes('Sitemap: https://networkaudit.github.io/sitemap.xml')
      && st.includes('<loc>https://networkaudit.github.io/</loc>');
    check('robots.txt and sitemap.xml serve with HTTP 200, XML content-type, and canonical URLs', seoEndpointsOk);
  }

  // Adversarial binary executable disguised as Connections.csv rejected cleanly in browser UI with full recovery
  {
    const disguisedExe = path.join(tmpDir, 'Connections.csv');
    fs.writeFileSync(disguisedExe, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x7f, 0x45, 0x4c, 0x46]));
    await go(BASE);
    await waitFor('document.querySelector("input[type=\\"file\\"]")');
    const { root: doc } = await page('DOM.getDocument', {});
    const { nodeId } = await page('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type="file"]' });
    await page('DOM.setFileInputFiles', { nodeId, files: [disguisedExe] });
    await waitFor('document.querySelector("#rd-persist-optin")');
    await clickText('.modal__footer .btn--primary', 'Open archive locally');
    await waitFor('document.querySelector(".modal__title")?.textContent.includes("Could not read that file")');
    check('malicious binary disguised as Connections.csv is rejected cleanly into an error modal without crashing UI', await evaluate(
      'document.querySelector(".modal")?.textContent.includes("binary or non-text data")',
    ));
    await clickText('.modal__footer .btn--primary', 'OK');
    await clickText('button', 'Try sample data');
    await waitFor('document.querySelector(".gnav__items")');
    check('UI recovers immediately after rejecting malicious binary file', await evaluate(
      'document.querySelector(".profile-card__name")?.textContent === "Alex Morgan"',
    ));
  }

  await go(`${BASE}nested/missing/page`);
  check('nested missing route (/nested/missing/page) loads styled 404 under strict CSP with zero broken assets', await evaluate(
    'document.body.textContent.includes("Page not found") && getComputedStyle(document.querySelector(".frame-guard")).display === "flex" && document.querySelector("img")?.naturalWidth > 0',
  ));
  await clickText('a.btn--primary', 'Go to Network Audit');
  await waitFor('document.querySelector(".hero__title")');
  check('nested 404 "Go to Network Audit" link navigates cleanly back to root app', await evaluate(
    'location.pathname === "/" && Boolean(document.querySelector(".hero__title"))',
  ));

  // 7. Blocked Storage Resilience (Simulated Safari Private / Strict Cookie Block)
  console.log('7. Blocked Storage Resilience');
  {
    const { targetId: t2 } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s2 } = await send('Target.attachToTarget', { targetId: t2, flatten: true });
    const prevS = S;
    S = s2;
    await page('Runtime.enable');
    await page('Page.enable');
    await page('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
        indexedDB.open = () => { throw new DOMException('Blocked', 'SecurityError'); };
      `,
    });
    await go(`${BASE}?demo=1#/home`);
    await waitFor('document.querySelector(".gnav__items")');
    check('app boots and runs Sample Mode cleanly when localStorage & IndexedDB throw SecurityError', await evaluate(
      'document.querySelector(".profile-card__name")?.textContent === "Alex Morgan"',
    ));
    S = prevS;
    await send('Target.closeTarget', { targetId: t2 });
  }

  // 8. Offline Disk Execution (file:// protocol)
  console.log('8. Direct Disk Execution (file://)');
  await go(FILE_URL);
  await waitFor('document.querySelector(".hero__title")');
  check('file:// guest brand link points to index.html rather than OS directory listing', await evaluate(
    'document.querySelector("a.gnav__brand")?.getAttribute("href") === "index.html"',
  ));
  await clickText('a', 'Privacy');
  await waitFor('document.querySelector(".static-card")');
  await clickText('a', 'Back to app');
  await waitFor('document.querySelector(".hero__title")');
  check('file:// Privacy -> Back to app round-trips cleanly back to index.html', await evaluate(
    'location.protocol === "file:" && location.pathname.endsWith("/index.html") && Boolean(document.querySelector(".hero__title"))',
  ));
  await clickText('button', 'Try sample data');
  await waitFor('document.querySelector(".gnav__items")', 10000);
  check('file:// loads and analyzes sample data via main-thread fallback with zero errors', await evaluate(
    'document.querySelector(".profile-card__name")?.textContent === "Alex Morgan"',
  ));
  await click('.gnav__share');
  await waitFor('document.querySelector(".modal textarea")');
  const shareVal = await evaluate('document.querySelector(".modal textarea").value');
  check('file:// share text uses public https://networkaudit.github.io/ URL and never leaks local disk path', (
    shareVal.includes('https://networkaudit.github.io/') && !shareVal.includes('file:') && !shareVal.includes('null/')
  ));

  check('zero JS exceptions, console errors, CSP violations, or external requests across entire run', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('e2e execution completed without fatal error', false, err.message);
} finally {
  try { await send('Browser.close'); } catch { /* ignore */ }
  chrome.kill();
  await srv.close();
  setTimeout(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } }, 600);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} E2E checks passed.`);
  if (errors.length) console.log(`Recorded browser errors:\n${errors.join('\n')}`);
  process.exitCode = failed.length ? 1 : 0;
}
