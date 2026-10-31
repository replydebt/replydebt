// App entry: frame guard, worker pre-warming, pre-open transparency gate, routing, modals, and drag & drop.
import {
  AFFILIATION_NOTICE, ANALYTICS_ENDPOINT, PRODUCT_NAME, PUBLISHER_NAME,
  REPO_URL, RETENTION_DAYS, STORAGE_PREFIX, analyticsOrigin,
} from './config.js';
import { sanitizeFileName } from './core/text.js';
import { h, clear, copyText, plural, localGet, localSet } from './ui/h.js';
import { icon } from './ui/icons.js';
import { openModal, confirmModal, closeAllModals } from './ui/modal.js';
import { toast, clearToasts } from './ui/toast.js';
import { closeComposer } from './ui/overlay.js';
import { closeMenu } from './ui/menu.js';
import { appNav } from './ui/nav.js';
import {
  app, loadSaved, setSession, resetAll, counts, onChange,
  hiddenCount, restoreHidden, setCompanyQuery,
} from './app/state.js';
import { process as runAnalysis, warmWorker } from './app/client.js';
import { handoff, setTab, notify, publicAppUrl, LINKEDIN_DOWNLOAD_URL } from './app/handoff.js';
import { renderWelcome, teardownWelcome } from './pages/welcome.js';
import { renderLoading } from './pages/loading.js';
import { renderHome } from './pages/home.js';
import { renderReplies, renderRecruiters, renderReconnect } from './pages/lists.js';
import { renderCompanies } from './pages/companies.js';

const root = document.getElementById('app');
const THEME_KEY = `${STORAGE_PREFIX}theme`;
const ROUTES = { home: 'Home', replies: 'Replies', recruiters: 'Recruiters', reconnect: 'Reconnect', companies: 'Companies' };

function applyTheme(theme) {
  const safe = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = safe;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', safe === 'dark' ? '#1b1f23' : '#ffffff');
}
const rawTheme = localGet(THEME_KEY) || localGet('nx.theme');
const savedTheme = (rawTheme === 'dark' || rawTheme === 'light') ? rawTheme : '';
applyTheme(savedTheme || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

// ---------- Frame-embed defense (static hosting fallback for frame-ancestors 'none') ----------
if (document.documentElement.dataset.framed === '1') {
  const topHref = location.protocol === 'file:' ? 'index.html' : './';
  clear(root).append(
    h(
      'main.frame-guard',
      h(
        'section.card.frame-guard__card',
        icon('shield', 32),
        h('h1.card__title', `${PRODUCT_NAME} cannot run inside an embedded frame`),
        h('p.t-14.t-low', 'To protect your LinkedIn archive from clickjacking or surrounding page overlays, open Reply Debt directly in its own browser tab.'),
        h('a.btn.btn--primary', { href: topHref, target: '_top', rel: 'noopener noreferrer' }, `Open ${PRODUCT_NAME} in a new tab`, icon('external', 16)),
      ),
    ),
  );
} else {
  startApp();
}

function startApp() {
  let busy = false;
  let lastRoute = null;
  let navEl = null;
  let pageEl = null;

  // Track active text-input focus so fixed mobile bottom tabs yield screen space when the virtual keyboard shrinks the viewport.
  const isTextEntry = (el) => Boolean(
    el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|hidden)$/i.test(el.type))),
  );
  document.addEventListener('focusin', (e) => {
    if (isTextEntry(e.target)) document.documentElement.dataset.kb = '1';
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isTextEntry(document.activeElement)) delete document.documentElement.dataset.kb;
    }, 0);
  });

  // Pre-warm the Web Worker at boot so zero network requests occur after archive selection.
  warmWorker();
  pingAnalytics();

  function pingAnalytics() {
    if (!ANALYTICS_ENDPOINT) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)) return;
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    if (!analyticsOrigin(ANALYTICS_ENDPOINT)) return;
    const img = new Image(1, 1);
    img.referrerPolicy = 'no-referrer';
    img.src = ANALYTICS_ENDPOINT;
  }

  // ---------- Routing ----------
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    if (qs) {
      const params = new URLSearchParams(qs);
      const legacyQ = params.get('q');
      if (legacyQ) {
        app.companyQuery = legacyQ;
        history.replaceState(null, '', `${location.pathname}#/${ROUTES[path] ? path : 'companies'}`);
      }
    }
    return ROUTES[path] ? path : 'home';
  }

  function render({ keepScroll = false } = {}) {
    if (busy) return;
    closeMenu();
    if (!app.report) {
      navEl = null;
      pageEl = null;
      if (lastRoute !== 'welcome') window.scrollTo(0, 0);
      lastRoute = 'welcome';
      renderWelcome(root, welcomeApi);
      return;
    }
    teardownWelcome();
    const route = parseHash();
    const y = window.scrollY;
    const c = counts();
    const rerender = () => render({ keepScroll: true });
    let page;
    if (route === 'replies') page = renderReplies(actions, rerender);
    else if (route === 'recruiters') page = renderRecruiters(actions, rerender);
    else if (route === 'reconnect') page = renderReconnect(actions);
    else if (route === 'companies') page = renderCompanies(actions, app.companyQuery);
    else page = renderHome(actions);

    const navQuery = route === 'companies' ? app.companyQuery : '';
    if (!navEl || !pageEl || !navEl.isConnected || !pageEl.isConnected) {
      navEl = appNav({ route, counts: c, me: app.report.me, query: navQuery, actions });
      pageEl = h('div.page', page);
      clear(root).append(
        h('a.skip-link', { href: '#main' }, 'Skip to main content'),
        navEl,
        pageEl,
      );
    } else {
      navEl.sync({ route, counts: c, me: app.report.me, query: navQuery });
      pageEl.replaceChildren(page);
    }
    const pending = c.replies + c.recruiters;
    setTab(`${pending ? `(${pending}) ` : ''}${ROUTES[route]} | ${PRODUCT_NAME}`, { dot: false });
    const routeKey = `${route}:${navQuery}`;
    if (keepScroll && routeKey === lastRoute) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    lastRoute = routeKey;
  }

  const onRouteNav = () => {
    closeComposer();
    render();
  };
  window.addEventListener('hashchange', onRouteNav);
  window.addEventListener('popstate', onRouteNav);
  onChange(() => render({ keepScroll: true }));

  // ---------- Pre-Open Transparency & Storage Choice Gate ----------
  function confirmArchiveOpen(fileSummary) {
    const safeSummary = sanitizeFileName(fileSummary, 100);
    return new Promise((resolve) => {
      let decision = null;
      const persistBox = h('input', { type: 'checkbox', id: 'rd-persist-optin' });
      const m = openModal({
        title: 'Before opening your LinkedIn archive',
        body: [
          h('p.t-14.t-low', `Selected: ${safeSummary}`),
          h(
            'ul.gate-list',
            h('li', icon('shield', 18), h('span', h('b', '100% local processing: '), 'Parsed inside this browser tab\'s memory (RAM) on your device. Zero bytes are uploaded to any server — you can turn off Wi-Fi before opening to verify.')),
            h('li', icon('check', 18), h('span', h('b', 'Minimized scope: '), 'Only Connections.csv, messages.csv, Invitations.csv, and Profile.csv are read. Email addresses in Connections.csv and all other archive files are ignored.')),
            h('li', icon('lock', 18), h('span', h('b', 'Memory-only & zero stored messages: '), `Results vanish when you close or refresh this tab unless you opt in below. Even when opted in, raw message bodies, InMail subjects, invitation notes, and emails are never written to browser storage, and saved lists auto-expire after ${RETENTION_DAYS} days.`)),
            h('li', icon('eyeOff', 18), h('span', h('b', 'Shared devices & browser extensions: '), 'Do not open archives on a public or shared computer. If you have browser extensions with "read all websites" access, use a Private / Incognito window.')),
            h('li', icon('people', 18), h('span', h('b', 'Personal communication only: '), 'Your archive contains names and messages of third-party contacts. Use these lists solely for your own personal follow-ups.')),
          ),
          h(
            'label.gate-check',
            persistBox,
            h(
              'span',
              h('b', `Save my action lists in this browser for ${RETENTION_DAYS} days`),
              h('span.gate-check__sub', 'Optional. Stores only contact names, companies, dates, and done/dismissed marks — never message text. Do not check on a shared computer.'),
            ),
          ),
          h(
            'p.t-12.t-low',
            'Full details under GDPR & KVKK: ',
            h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener noreferrer' }, 'Privacy & Data Protection Notice'),
            '.',
          ),
        ],
        footer: [
          h('button.btn.btn--secondary', { type: 'button', onclick: () => m.close() }, 'Cancel'),
          h('button.btn.btn--primary', {
            type: 'button',
            'data-autofocus': true,
            onclick: () => {
              decision = { persist: Boolean(persistBox.checked) };
              m.close();
            },
          }, 'Open archive locally'),
        ],
        onClose: () => resolve(decision),
      });
    });
  }

  // ---------- Processing ----------
  function inputFrom(fileOrFiles) {
    const files = (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]).filter(Boolean);
    const zip = files.find((f) => typeof f.name === 'string' && /\.zip$/i.test(f.name));
    if (zip) return { kind: 'zip', file: zip, label: sanitizeFileName(zip.name, 100) };
    const csvs = files.filter((f) => typeof f.name === 'string' && /\.csv$/i.test(f.name));
    if (csvs.length) return { kind: 'csv', files: csvs, label: `${plural(csvs.length, 'CSV file')}` };
    return null;
  }

  async function handleFiles(fileOrFiles) {
    if (busy) return;
    const input = inputFrom(fileOrFiles);
    if (!input) {
      toast('That does not look like a LinkedIn archive. Choose the .zip file LinkedIn emailed you (or its CSV files).', { icon: 'info', tone: 'info' });
      return;
    }
    closeAllModals();
    const gate = await confirmArchiveOpen(input.label);
    if (!gate) return;
    await analyze(input, { persist: gate.persist });
  }

  async function analyze(input, { persist = false, keepMarks = false } = {}) {
    if (busy) return;
    busy = true;
    closeComposer({ restoreFocus: false });
    teardownWelcome();

    const loading = renderLoading();
    let loadingShown = false;
    const loadingTimer = setTimeout(() => {
      if (!busy) return;
      loadingShown = true;
      clear(root).append(loading.el);
      setTab(`Reading your archive... | ${PRODUCT_NAME}`);
    }, 120);

    try {
      const { report, quotes, candidates } = await runAnalysis(input, (step, pct) => {
        if (loadingShown) loading.progress(step, pct);
      });
      clearTimeout(loadingTimer);
      const rawInput = input.kind === 'sample' ? null : { kind: input.kind, file: input.file, files: input.files };
      await applySessionAndGo({ report, quotes, candidates, input: rawInput }, { persist, keepMarks });
      if (!report.isSample) handoff.clear();
      if (report.me.ambiguous) chooseMe();
    } catch (err) {
      clearTimeout(loadingTimer);
      busy = false;
      render();
      const m = openModal({
        title: 'Could not read that file',
        body: [
          h('p', err.message || 'Something went wrong while reading the archive.'),
          h('p.t-14.t-low', 'Tip: choose the original .zip file LinkedIn emailed you (the fast Basic export has everything needed).'),
        ],
        footer: [h('button.btn.btn--primary', { type: 'button', 'data-autofocus': true, onclick: () => m.close() }, 'OK')],
      });
    }
  }

  async function applySessionAndGo(session, opts) {
    clearToasts();
    location.hash = '#/home';
    await setSession(session, opts);
    busy = false;
    render();
    const { report } = session;
    const c = counts();
    const pending = c.replies + c.recruiters;
    if (!report.isSample) {
      toast(pending ? `Results ready. ${plural(pending, 'person is', 'people are')} waiting on you.` : 'Results ready.');
    }
    if (document.hidden) {
      setTab(`(${pending || 1}) Your results are ready | ${PRODUCT_NAME}`, { dot: true });
      notify(`Your ${PRODUCT_NAME} results are ready`, pending ? `${plural(pending, 'person is', 'people are')} waiting to hear from you.` : 'Open the tab to view your lists.', 'rd-done');
      const restore = () => {
        if (!document.hidden) {
          render({ keepScroll: true });
          document.removeEventListener('visibilitychange', restore);
        }
      };
      document.addEventListener('visibilitychange', restore);
    }
  }

  // ---------- Hidden file input for "Open a newer archive" ----------
  const fileInput = h('input', {
    type: 'file',
    accept: '.zip,application/zip,.csv,text/csv',
    multiple: true,
    class: 'sr-only',
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []).slice(0, 65);
    fileInput.value = '';
    if (files.length) handleFiles(files.length === 1 ? files[0] : files);
  });
  document.body.appendChild(fileInput);

  // ---------- Modals ----------
  function guideModal() {
    const box = (label, on) => h(`span.mock__box${on ? '.mock__box--on' : ''}`, h('i', on ? icon('check', 12) : null), label);
    const m = openModal({
      title: 'How to get your LinkedIn archive',
      wide: true,
      body: h(
        'ol.guide-steps',
        h('li', h('span.guide-num', '1'), h(
          'div',
          h('p', 'Open LinkedIn\'s ', h('b', 'Download your data'), ' page (Settings & Privacy -> Data privacy -> Get a copy of your data).'),
        )),
        h('li', h('span.guide-num', '2'), h(
          'div',
          h('p', 'Select ', h('b', '"Want something in particular?"'), ' and check these four boxes:'),
          h(
            'div.mock',
            { 'aria-hidden': 'true' },
            h('p.mock__title', 'Download your data'),
            h('div.mock__radio', h('i'), h('span', 'Download larger data archive, including connections, verifications, contacts, account history...')),
            h('div.mock__radio.mock__radio--on', h('i'), h('span', 'Want something in particular? Select the data files you are most interested in.')),
            h(
              'div.mock__boxes',
              box('Articles'), box('Connections', true), box('Imported Contacts'),
              box('Messages', true), box('Invitations', true), box('Profile', true),
              box('Recommendations'), box('Registration'), box('Rich Media'),
            ),
            h('span.mock__btn', 'Request archive'),
          ),
          h('p.t-14.t-low.guide-note', 'Either archive option works; selecting those four boxes produces the fast ~10-minute export.'),
        )),
        h('li', h('span.guide-num', '3'), h(
          'div',
          h('p', 'When LinkedIn emails your download link (~10 minutes), download the .zip and open it locally on this page.'),
          h('p.t-14.t-low.guide-note', 'You do not need to wait for LinkedIn\'s second 24-hour email.'),
        )),
      ),
      footer: [
        h('button.btn.btn--secondary', { type: 'button', onclick: () => m.close() }, 'Close'),
        h('a.btn.btn--primary', {
          href: LINKEDIN_DOWNLOAD_URL,
          target: '_blank',
          rel: 'noopener noreferrer',
          'data-autofocus': true,
          onclick: () => {
            if (!handoff.get()) handoff.markRequested();
            m.close();
            if (!app.report) render();
          },
        }, 'Open LinkedIn data download', icon('external', 16)),
      ],
    });
  }

  function howModal() {
    const m = openModal({
      title: `How ${PRODUCT_NAME} works`,
      body: [
        h('p', 'LinkedIn lets every member download an official copy of their data containing connections, invitations, and conversation history.'),
        h('p', `${PRODUCT_NAME} parses that .zip `, h('b', 'locally inside your browser'), ' and builds four lists: replies you owe, recruiters you missed, people to reconnect with, and warm company introduction paths.'),
        h('p', 'Zero bytes leave your device. By default, everything stays in tab memory (RAM) and disappears when you close the tab.'),
      ],
      footer: [h('button.btn.btn--primary', { type: 'button', 'data-autofocus': true, onclick: () => m.close() }, 'Got it')],
    });
  }

  function aboutModal() {
    const m = openModal({
      title: `About ${PRODUCT_NAME}`,
      body: [
        h('p', h('b', PRODUCT_NAME), ' is a local-only, open-source browser utility that helps you follow up on unanswered LinkedIn messages, recruiter outreach, and quiet connections.'),
        h('p.t-14.t-low', `${AFFILIATION_NOTICE}. LinkedIn is a trademark of LinkedIn Corporation.`),
        h('p.t-14.t-low', `Published under the MIT License by ${PUBLISHER_NAME}. Source code: `, h('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, REPO_URL)),
      ],
      footer: [h('button.btn.btn--primary', { type: 'button', 'data-autofocus': true, onclick: () => m.close() }, 'Close')],
    });
  }

  function privacyModal() {
    const modeText = !app.report || app.report.isSample
      ? 'No personal archive is currently stored in this browser.'
      : app.persist
        ? `Current session: Opted in to local browser saving (minimized action lists only, auto-expires after ${RETENTION_DAYS} days, zero message text stored).`
        : 'Current session: Memory-only (RAM). Nothing from your archive is written to browser storage.';

    const m = openModal({
      title: 'Privacy & local storage',
      body: [
        h('p', h('b', 'Your archive never leaves your device.'), ' Parsing and classification run locally in your browser with Content Security Policy blocking outbound data connections.'),
        h('p', modeText),
        h('p', 'Even when local saving is enabled, raw message bodies, InMail subjects, invitation notes, and email addresses are structurally excluded from IndexedDB and localStorage.'),
        h('p.t-14.t-low', 'Full GDPR & KVKK legal disclosures: ', h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener noreferrer' }, 'Open Privacy & Data Protection Notice')),
      ],
      footer: [
        ...(app.report && !app.report.isSample
          ? [h('button.btn.btn--secondary', { type: 'button', onclick: deleteAll }, icon('trash', 16), 'Delete data from this browser')]
          : []),
        h('button.btn.btn--primary', { type: 'button', 'data-autofocus': true, onclick: () => m.close() }, 'Close'),
      ],
    });
  }

  function shareModal() {
    const c = app.report && !app.report.isSample ? counts() : null;
    const total = app.report && !app.report.isSample ? app.report.recruiters.length : 0;
    const hook = c && (c.replies || total)
      ? `I checked my LinkedIn archive and found ${[total ? plural(total, 'recruiter') : null, c.replies ? `${plural(c.replies, 'person', 'people')} waiting on a reply` : null].filter(Boolean).join(' and ')}.`
      : 'Most of us have a recruiter or former colleague we forgot to answer on LinkedIn.';
    const url = publicAppUrl();
    const text = `${hook}\n\n${PRODUCT_NAME} is an open-source tool that reads your official LinkedIn data export locally in your browser (nothing uploaded) and turns it into four lists:\n\n- Replies you owe\n- Recruiters you never answered\n- People to reconnect with\n- Warm paths into any company\n\nFree, MIT-licensed, no sign-up: ${url}`;
    const ta = h('textarea.composer.composer--tall', { 'aria-label': 'Post text' });
    ta.value = text;
    const m = openModal({
      title: 'Share with your network',
      body: [
        h('p.t-14.t-low.modal-lead', 'You can edit this post before copying. Only aggregate counts appear here, never contact names.'),
        ta,
      ],
      footer: [
        h('button.btn.btn--secondary', { type: 'button', onclick: async () => { if (await copyText(ta.value)) toast('Post copied.'); } }, icon('copy', 16), 'Copy text'),
        h('button.btn.btn--primary', {
          type: 'button',
          onclick: async () => {
            await copyText(ta.value);
            window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(ta.value)}`, '_blank', 'noopener,noreferrer');
            m.close();
            toast('Post copied. Paste it into LinkedIn if it is not pre-filled.');
          },
        }, 'Post on LinkedIn', icon('external', 16)),
      ],
    });
  }

  async function deleteAll() {
    closeAllModals();
    const ok = await confirmModal({
      title: 'Delete all local data from this browser?',
      text: `This clears your ${PRODUCT_NAME} action lists, done/hidden marks, and preferences from this browser. Your LinkedIn account and downloaded .zip file are not affected.`,
      confirmLabel: 'Delete local data',
    });
    if (!ok) return;
    closeComposer({ restoreFocus: false });
    clearToasts();
    await resetAll();
    location.hash = '';
    render();
    toast('All local data was deleted from this browser.');
  }

  function hiddenModal() {
    const n = hiddenCount();
    const m = openModal({
      title: 'Hidden people & dismissed items',
      body: h('p', n ? `You have hidden or dismissed ${plural(n, 'item')}. Restore them to show them in your lists again.` : 'You have not hidden or dismissed anything.'),
      footer: n
        ? [
          h('button.btn.btn--secondary', { type: 'button', onclick: () => m.close() }, 'Cancel'),
          h('button.btn.btn--primary', { type: 'button', 'data-autofocus': true, onclick: () => { restoreHidden(); m.close(); toast('Restored hidden and dismissed items.'); } }, 'Restore all'),
        ]
        : [h('button.btn.btn--primary', { type: 'button', 'data-autofocus': true, onclick: () => m.close() }, 'Close')],
    });
  }

  function chooseMe() {
    const r = app.report;
    if (!r) return;
    const candidates = (app.candidates || []).slice(0, 5);
    const canReanalyze = Boolean(r.isSample || app.lastInput);

    if (!canReanalyze || !candidates.length) {
      const m = openModal({
        title: 'Change who I am',
        body: [
          h('p', `Currently viewing archive as: ${r.me.name || 'You'}.`),
          h('p.t-14.t-low', `Because ${PRODUCT_NAME} never stores a copy of your raw archive on disk, reopen your LinkedIn .zip file to re-run analysis as a different participant.`),
        ],
        footer: [
          h('button.btn.btn--secondary', { type: 'button', onclick: () => m.close() }, 'Cancel'),
          h('button.btn.btn--primary', {
            type: 'button',
            'data-autofocus': true,
            onclick: () => { m.close(); fileInput.click(); },
          }, 'Open archive .zip'),
        ],
      });
      return;
    }

    let choice = r.me.name;
    const list = h('div.radio-list', candidates.map((c) => h(
      'label.radio-row',
      h('input', {
        type: 'radio',
        name: 'me',
        value: c.name,
        checked: c.name === choice || null,
        onchange: () => { choice = c.name; },
      }),
      h('span', h('span.t-16.t-bold', c.name), h('div.t-12.t-low', `In ${plural(c.conversations, 'conversation')}`)),
    )));
    const m = openModal({
      title: 'Which participant is you?',
      body: [
        h('p.t-14.t-low.modal-lead', 'Select your name in this archive so Reply Debt knows who sent the last message in each thread.'),
        list,
      ],
      footer: [
        h('button.btn.btn--secondary', { type: 'button', onclick: () => m.close() }, 'Cancel'),
        h('button.btn.btn--primary', {
          type: 'button',
          onclick: async () => {
            m.close();
            if (choice === r.me.name && !r.me.ambiguous) return;
            const nextInput = r.isSample
              ? { kind: 'sample', override: choice }
              : { ...app.lastInput, override: choice };
            await analyze(nextInput, { persist: app.persist, keepMarks: true });
          },
        }, 'Save'),
      ],
    });
  }

  // ---------- Shared actions ----------
  const footerActions = { about: aboutModal, privacy: privacyModal, help: guideModal, share: shareModal };

  const actions = {
    ...footerActions,
    deleteAll,
    openArchive: () => fileInput.click(),
    searchCompany: (q, { live = false } = {}) => {
      const nextQ = String(q || '');
      if (live && !nextQ && parseHash() !== 'companies' && !app.companyQuery) return;
      if (parseHash() !== 'companies') {
        if (live) {
          history.pushState(null, '', `${location.pathname}#/companies`);
          closeComposer({ restoreFocus: false });
          setCompanyQuery(nextQ);
          return;
        }
        app.companyQuery = nextQ;
        location.hash = '#/companies';
        return;
      }
      setCompanyQuery(nextQ);
    },
    getArchive: async () => {
      window.open(LINKEDIN_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
      closeComposer({ restoreFocus: false });
      handoff.markRequested();
      if (app.report?.isSample) {
        const hadSaved = await loadSaved();
        if (!hadSaved) {
          app.report = null;
          app.quotes = Object.create(null);
          app.marks = Object.create(null);
        }
      }
      location.hash = '';
      render();
    },
    changeMe: chooseMe,
    hidden: hiddenModal,
    toggleTheme: () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localSet(THEME_KEY, next);
      applyTheme(next);
    },
  };

  const welcomeApi = {
    onFile: handleFiles,
    onSample: () => analyze({ kind: 'sample' }, { persist: false }),
    openGuide: guideModal,
    openHow: howModal,
    footerActions,
  };

  // ---------- Drag & drop anywhere (supports .zip, .csv files, and unzipped folder drops) ----------
  async function extractDroppedFiles(dataTransfer) {
    const MAX_SCANNED_ENTRIES = 600;
    const MAX_COLLECTED_FILES = 32;
    const items = Array.from(dataTransfer?.items || []).slice(0, 65);
    const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.some((e) => e.isDirectory)) {
      const collected = [];
      let scanned = 0;
      const readAllEntries = async (reader) => {
        const all = [];
        while (scanned < MAX_SCANNED_ENTRIES) {
          const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
          if (!batch.length) break;
          scanned += batch.length;
          all.push(...batch.slice(0, Math.max(0, MAX_SCANNED_ENTRIES - all.length)));
        }
        return all;
      };
      const walk = async (entry, depth) => {
        if (depth > 2 || scanned > MAX_SCANNED_ENTRIES || collected.length >= MAX_COLLECTED_FILES) return;
        if (entry.isFile) {
          if (!/\.(zip|csv)$/i.test(entry.name)) return;
          const file = await new Promise((res) => entry.file(res, () => res(null)));
          if (file) collected.push({ file, depth });
        } else if (entry.isDirectory) {
          const children = await readAllEntries(entry.createReader());
          for (const child of children) {
            if (collected.length >= MAX_COLLECTED_FILES || scanned > MAX_SCANNED_ENTRIES) break;
            await walk(child, depth + 1);
          }
        }
      };
      for (const e of entries) await walk(e, 0);
      if (collected.length) {
        collected.sort((a, b) => a.depth - b.depth);
        return collected.map((x) => x.file);
      }
    }
    return Array.from(dataTransfer?.files || []).slice(0, 65);
  }

  const dropOverlay = h('div.drop-overlay', { 'aria-hidden': 'true' }, h('div.drop-overlay__card', icon('upload', 32), 'Drop your LinkedIn archive to open locally'));
  document.body.appendChild(dropOverlay);
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropOverlay.classList.add('is-on');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.classList.remove('is-on');
  });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.remove('is-on');
    const files = await extractDroppedFiles(e.dataTransfer);
    if (files.length) handleFiles(files.length === 1 ? files[0] : files);
  });

  // ---------- Boot ----------
  (async function boot() {
    const params = new URLSearchParams(location.search);
    const wantsReset = params.has('reset');
    const wantsDemo = params.has('demo');
    if (wantsReset || wantsDemo) {
      history.replaceState(null, '', location.pathname + location.hash);
    }

    await loadSaved();

    if (wantsReset) {
      render();
      const ok = await confirmModal({
        title: 'Clear saved Reply Debt data?',
        text: 'You opened a reset link. Confirm if you want to remove all saved Reply Debt lists and preferences from this browser.',
        confirmLabel: 'Delete local data',
      });
      if (ok) {
        clearToasts();
        await resetAll();
        render();
        toast('All local data was deleted from this browser.');
      }
      return;
    }

    if (wantsDemo) {
      await analyze({ kind: 'sample' }, { persist: false });
      return;
    }

    render();
  })();
}
