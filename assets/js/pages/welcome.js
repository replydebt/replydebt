// First-run and returning-visitor screen with local archive handoff stepper.
import { AFFILIATION_NOTICE, PRODUCT_NAME, PUBLISHER_NAME, REPO_URL, SITE_ORIGIN, STORAGE_PREFIX } from '../config.js';
import { sanitizeFileName } from '../core/text.js';
import { h, isMobile, isInAppBrowser, copyText, localGet, localSet } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/parts.js';
import { guestNav } from '../ui/nav.js';
import { toast } from '../ui/toast.js';
import { relPhrase } from '../core/time.js';
import {
  LINKEDIN_DOWNLOAD_URL, handoff, canWatchFolder, canPickFile, pickDownloadsFolder,
  findArchives, watchFolder, pickArchiveFile, canNotify, notifyPermission,
  requestNotifications, notify, setTab, publicAppUrl,
  googleReminderUrl, outlookReminderUrl, downloadReminderIcs,
} from '../app/handoff.js';

const TEN_MIN = 10 * 60000;
const NOTIFY_KEY = `${STORAGE_PREFIX}notify`;
let stopWatching = null;
let tickTimer = null;

export function teardownWelcome() {
  stopWatching?.();
  stopWatching = null;
  clearInterval(tickTimer);
  tickTimer = null;
}

/**
 * @param {HTMLElement} root
 * @param {{ onFile:(file:File|File[])=>void, onSample:()=>void, openGuide:()=>void, openHow:()=>void, footerActions:object }} api
 */
export function renderWelcome(root, api) {
  teardownWelcome();
  const ui = {
    requestedAt: handoff.get()?.requestedAt || null,
    watching: false,
    watchError: '',
    folderName: '',
    lastCheck: 0,
    found: null,
    notifyOn: notifyPermission() === 'granted' && localGet(NOTIFY_KEY) === '1',
    remindedReady: false,
  };

  const stepsHost = h('div.steps');
  const heroTitle = h('h1.hero__title', { itemprop: 'headline' });
  const heroSub = h('p.hero__sub', { itemprop: 'description' });
  const mobileNoteHost = h('div');

  const fileInput = h('input', {
    type: 'file',
    accept: '.zip,application/zip,.csv,text/csv',
    multiple: true,
    class: 'sr-only',
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []).slice(0, 130);
    fileInput.value = '';
    if (files.length) api.onFile(files.length === 1 ? files[0] : files);
  });

  const browse = async () => {
    if (canPickFile) {
      const f = await pickArchiveFile();
      if (f) api.onFile(f);
      return;
    }
    fileInput.click();
  };

  // ---------- Actions ----------
  const requestArchive = () => {
    window.open(LINKEDIN_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
    if (!ui.requestedAt) ui.requestedAt = handoff.markRequested().requestedAt;
    render();
  };

  const startWatch = (handle) => {
    stopWatching?.();
    ui.watching = true;
    ui.watchError = '';
    ui.folderName = handle.name;
    const since = Date.now();
    stopWatching = watchFolder(handle, {
      since,
      onTick: (t) => { ui.lastCheck = t; updateWatchStatus(); },
      onFound: (file) => {
        ui.watching = false;
        if (document.hidden) notify('Your LinkedIn archive arrived', `Open ${PRODUCT_NAME} to review and open it locally.`, 'rd-ready');
        api.onFile(file);
      },
      onError: () => {
        ui.watching = false;
        ui.watchError = 'Folder access ended. Click "Watch Downloads folder automatically" to reconnect, or pick the file directly.';
        render();
      },
    });
    setTab(`Waiting for your archive | ${PRODUCT_NAME}`);
    render();
  };

  const chooseFolder = async () => {
    let handle;
    try {
      handle = await pickDownloadsFolder();
    } catch {
      return;
    }
    if (!ui.requestedAt) ui.requestedAt = handoff.markRequested().requestedAt;
    const existing = await findArchives(handle).catch(() => []);
    ui.found = existing[0] || null;
    startWatch(handle);
  };

  const toggleNotify = async (on) => {
    if (on) {
      const ok = await requestNotifications();
      ui.notifyOn = ok;
      localSet(NOTIFY_KEY, ok ? '1' : '0');
      if (!ok) toast('Notifications are blocked for this site. You can allow them in your browser settings.', { icon: 'info', tone: 'info' });
    } else {
      ui.notifyOn = false;
      localSet(NOTIFY_KEY, '0');
    }
    render();
  };

  // ---------- Pieces ----------
  const stepShell = (n, state, title, content) => h(
    `li.step.step--${state}`,
    h('div.step__marker', { 'aria-hidden': 'true' }, state === 'done' ? icon('check', 16) : String(n)),
    h(
      'div.step__content',
      h('h2.step__title', title, state === 'done' ? h('span.sr-only', ' (done)') : null),
      content,
    ),
  );

  const watchStatus = h('p.watch-status', { 'aria-live': 'polite' });
  function updateWatchStatus() {
    if (!ui.watching) return;
    const ago = ui.lastCheck ? Math.max(0, Math.round((Date.now() - ui.lastCheck) / 1000)) : 0;
    watchStatus.replaceChildren(
      h('span.live-dot', { 'aria-hidden': 'true' }),
      h('span', 'Watching ', h('b', ui.folderName || 'Downloads'), ` for LinkedIn archive filename · checked ${ago < 3 ? 'just now' : `${ago}s ago`}`),
    );
  }

  const reminderRow = () => h(
    'div.reminder',
    h('p.reminder__label', icon('calendar', 16), isMobile() ? 'Finish on your computer later? Add a reminder:' : 'Closing this tab? Add a 15-minute reminder:'),
    h(
      'div.reminder__links',
      h('button.btn.btn--muted.btn--sm', {
        type: 'button',
        onclick: () => window.open(googleReminderUrl(publicAppUrl(), 15), '_blank', 'noopener,noreferrer'),
      }, 'Google Calendar'),
      h('button.btn.btn--muted.btn--sm', {
        type: 'button',
        onclick: () => window.open(outlookReminderUrl(publicAppUrl(), 15), '_blank', 'noopener,noreferrer'),
      }, 'Outlook'),
      h('button.btn.btn--muted.btn--sm', {
        type: 'button',
        onclick: () => downloadReminderIcs(publicAppUrl(), 15),
      }, 'Apple / .ics'),
      h('button.btn.btn--tertiary.btn--sm', {
        type: 'button',
        onclick: async () => { if (await copyText(publicAppUrl())) toast('Link copied. Open it on your computer when the email arrives.'); },
      }, icon('link', 16), 'Copy link'),
    ),
  );

  function mobileCallout() {
    if (!isMobile()) return null;
    const inApp = isInAppBrowser();
    const heading = inApp
      ? 'In an in-app browser? Open in Safari/Chrome or on your computer'
      : 'On your phone? Open right here or save for your computer';
    const detail = inApp
      ? 'In-app browsers often block .zip downloads. Request your archive below, then open this page in Safari, Chrome, or on your laptop.'
      : 'You can open your LinkedIn .zip directly from Files or Downloads on this phone, or request the export now and copy the link for your computer.';
    return h(
      'div.mobile-callout',
      icon('laptop', 20),
      h(
        'div.mobile-callout__body',
        h('p.t-14.t-bold', heading),
        h('p.t-12.t-low', detail),
        h('button.inline-link.t-12', {
          type: 'button',
          onclick: async () => { if (await copyText(publicAppUrl())) toast('Link copied for your computer.'); },
        }, 'Copy link for my computer'),
      ),
    );
  }

  function step1() {
    if (ui.requestedAt) {
      return stepShell(1, 'done', 'Request your archive from LinkedIn', h(
        'p.step__text',
        `Requested ${relPhrase(ui.requestedAt)}. `,
        h('button.inline-link', { type: 'button', onclick: requestArchive }, 'Open LinkedIn download page again'),
      ));
    }
    return stepShell(1, 'active', 'Request your archive from LinkedIn', [
      h(
        'p.step__text',
        'Opens LinkedIn\'s official "Download your data" page in a new tab. Select ',
        h('b', 'Connections, Messages, Invitations'),
        ', and ',
        h('b', 'Profile'),
        ', then click ',
        h('b', 'Request archive'),
        '.',
      ),
      h(
        'div.step__actions',
        h('button.btn.btn--primary.btn--lg', { type: 'button', onclick: requestArchive }, 'Open LinkedIn data download', icon('external', 20)),
      ),
      h('button.inline-link.t-14', { type: 'button', onclick: api.openGuide }, 'Show me exactly what to click'),
    ]);
  }

  function step2() {
    const state = ui.requestedAt ? 'active' : 'todo';
    const elapsed = ui.requestedAt ? Date.now() - ui.requestedAt : 0;
    const ready = elapsed > TEN_MIN;
    const old = elapsed > 3 * 86400000;
    const title = ready ? 'Your archive should be ready' : 'Wait about 10 minutes';

    if (state === 'todo') {
      return stepShell(2, 'todo', title, h('p.step__text', 'LinkedIn prepares the fast export in about 10 minutes and emails you a download link.'));
    }

    const parts = [];
    parts.push(h(
      'p.step__text',
      ready
        ? ['Check your email from LinkedIn and download the .zip file. ', h('b', 'You only need the first email.'), ' You do not need to wait for the second 24-hour part.']
        : ['LinkedIn will email you a download link. ', h('b', 'You only need the first email.'), ' The second email can take 24 hours and is not needed.'],
    ));
    if (old) {
      parts.push(h('p.step__note', icon('info', 16), 'LinkedIn download links expire after a few days. If yours expired, request a fresh archive in step 1.'));
    }

    parts.push(h(
      'div.step__actions',
      h('button.btn.btn--primary', { type: 'button', onclick: browse }, icon('download', 16), 'Pick archive from Downloads'),
      ready ? h('a.btn.btn--secondary', { href: LINKEDIN_DOWNLOAD_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Open LinkedIn downloads page', icon('external', 16)) : null,
    ));
    parts.push(h('p.t-12.t-low', 'Tip: once downloaded, you can also drag the .zip straight from your browser\'s downloads bar onto this page.'));

    if (ui.watchError) {
      parts.push(h('p.step__note', icon('info', 16), ui.watchError));
    }

    if (canWatchFolder) {
      if (ui.watching) {
        updateWatchStatus();
        parts.push(h(
          'div.watch-box',
          watchStatus,
          h('p.t-12.t-low', 'Keep this tab open. Only LinkedIn export filenames are checked in memory, and you will still see a confirmation prompt before anything is opened.'),
          ui.found ? h(
            'div.found',
            icon('folder', 20),
            h('div.found__text', h('b.clamp-1', sanitizeFileName(ui.found.name, 80)), h('span.t-12.t-low', `Already in folder · ${relPhrase(ui.found.lastModified)}`)),
            h('button.btn.btn--secondary.btn--sm', { type: 'button', onclick: () => api.onFile(ui.found) }, 'Open this file'),
          ) : null,
          h('button.btn.btn--tertiary.btn--sm', { type: 'button', onclick: () => { stopWatching?.(); ui.watching = false; render(); } }, 'Stop watching'),
        ));
      } else {
        parts.push(h(
          'div.catch',
          h('button.btn.btn--secondary.btn--sm', { type: 'button', onclick: chooseFolder }, icon('folderEye', 16), 'Watch Downloads folder automatically'),
          h('p.t-12.t-low', 'Optional (Chromium): checks only for LinkedIn archive filenames during this tab session.'),
        ));
      }
    }

    if (canNotify && !isMobile()) {
      const sw = h('input', { type: 'checkbox', checked: ui.notifyOn || null, onchange: (e) => toggleNotify(e.target.checked) });
      parts.push(h('label.switch', sw, h('span.switch__track'), icon('bell', 16), 'Notify me on this computer'));
    }
    parts.push(reminderRow());
    return stepShell(2, 'active', title, parts);
  }

  function step3() {
    const dz = h(
      'div.dropzone',
      {
        role: 'button',
        tabindex: '0',
        'aria-label': 'Open your LinkedIn archive locally',
        onclick: browse,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); } },
      },
      icon('upload', 32),
      h('span.dropzone__title', 'Drop your archive here to open locally'),
      h('span', 'or ', h('span.inline-link', 'choose your .zip file'), ' · parsed 100% inside this browser tab'),
    );
    return stepShell(3, ui.requestedAt ? 'active' : 'todo', ui.requestedAt ? 'Open it locally' : 'Already have your .zip? Open it locally', dz);
  }

  function render() {
    const back = Boolean(ui.requestedAt);
    heroTitle.textContent = back ? 'Welcome back. Your archive should be on its way.' : 'Find the recruiters and colleagues you forgot to answer';
    if (back && Date.now() - ui.requestedAt > TEN_MIN) heroTitle.textContent = 'Welcome back. Your archive should be ready.';
    heroSub.textContent = back
      ? 'Download the .zip file from LinkedIn\'s email and open it locally below. Results appear in seconds.'
      : `Your official LinkedIn data archive knows who is still waiting on your reply, which recruiters reached out, and who can introduce you at a target company. ${PRODUCT_NAME} turns it into a local action list.`;
    mobileNoteHost.replaceChildren(...[mobileCallout()].filter(Boolean));
    stepsHost.replaceChildren(h('ol.steps__list', step1(), step2(), step3()));
    if (ui.watching) updateWatchStatus();
    if (!ui.watching) setTab(back ? `Waiting for your archive | ${PRODUCT_NAME}` : `${PRODUCT_NAME}: Local LinkedIn Archive & Signal Analyzer`);
  }

  // ---------- Page ----------
  const hero = h(
    'section.hero',
    h(
      'div.hero__left',
      heroTitle,
      heroSub,
      mobileNoteHost,
      stepsHost,
      h(
        'p.hero__privacy',
        icon('lock', 16),
        h(
          'span',
          h('b', 'Local-only & memory-only by default.'),
          ' Your archive is parsed inside this browser tab with zero network uploads. Nothing is saved to disk unless you explicitly opt in. ',
          h('a', { href: 'privacy.html' }, 'Read Privacy Policy'),
          '.',
        ),
      ),
      h('p.hero__sample', 'Want to preview the interface first? ', h('button.inline-link', { type: 'button', onclick: api.onSample }, 'Try sample data'), '.'),
    ),
    h('div.hero__right', { 'aria-hidden': 'true' }, preview()),
  );

  const features = h(
    'section.band',
    h(
      'div.band__inner',
      h('h2.band__title', 'One LinkedIn archive, four focused action lists'),
      h(
        'div.features',
        { itemprop: 'featureList' },
        feature('message', 'Replies you owe', '1:1 conversations where someone asked a question or wrote last and never heard back.'),
        feature('briefcase', 'Recruiters you missed', 'Recruiter outreach from messages and invitation notes, with ready-to-edit reply drafts.'),
        feature('people', 'People to reconnect with', 'Five connections each week with real conversation history who drifted quiet.'),
        feature('building', 'Warm company paths', 'Search any company in your network, ranked by two-way conversation warmth.'),
      ),
    ),
  );

  const faq = h(
    'section.faq',
    { itemscope: true, itemtype: 'https://schema.org/FAQPage' },
    h(
      'div.faq__inner',
      h('h2.band__title', 'Privacy and frequently asked questions'),
      faqItem('Is my LinkedIn archive uploaded to any server?', `No. ${PRODUCT_NAME} parses your official LinkedIn .zip or .csv export 100% locally inside your browser tab using Web Workers and browser-native DecompressionStream. Strict Content Security Policy (connect-src 'none') blocks outbound data transfers, and you can turn off Wi-Fi before opening your archive.`),
      faqItem('Is anything stored in my browser by default?', 'No. Memory-only (RAM) mode is the default, so everything disappears when you close or refresh the tab. Before opening a file, you can optionally choose to save your minimized action lists locally for 90 days. Even when opted in, raw message bodies, InMail subjects, invitation notes, and email addresses are never written to IndexedDB or localStorage.'),
      faqItem('How do I export the fast LinkedIn data archive without waiting 24 hours?', `Open LinkedIn's Download your data settings page, choose "Want something in particular?", select Connections, Messages, Invitations, and Profile, and request your archive. LinkedIn emails the fast export in roughly 10 minutes — you do not need to wait for the second 24-hour email. If you also download LinkedIn's Complete 24-48 hour archive, ${PRODUCT_NAME} automatically unlocks your hidden Topic Credibility scores, algorithmic inferences, social capital signals, and activity insights while quarantining sensitive email, phone, billing, and login-IP files.`),
      faqItem(`Is ${PRODUCT_NAME} affiliated with LinkedIn?`, `No. ${PRODUCT_NAME} is an independent, MIT-licensed open-source tool published by ${PUBLISHER_NAME} and is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation.`),
    ),
  );

  const schemaMeta = [
    h('meta', { itemprop: 'name', content: PRODUCT_NAME }),
    h('meta', { itemprop: 'applicationCategory', content: 'BusinessApplication' }),
    h('meta', { itemprop: 'operatingSystem', content: 'Any (Web Browser)' }),
    h('meta', { itemprop: 'url', content: `${SITE_ORIGIN}/` }),
    h('meta', { itemprop: 'image', content: `${SITE_ORIGIN}/assets/img/og-image.png` }),
    h('meta', { itemprop: 'license', content: 'https://opensource.org/licenses/MIT' }),
    h('meta', { itemprop: 'isAccessibleForFree', content: 'true' }),
    h('span', { itemprop: 'author', itemscope: true, itemtype: 'https://schema.org/Person' }, h('meta', { itemprop: 'name', content: PUBLISHER_NAME })),
    h('span', { itemprop: 'offers', itemscope: true, itemtype: 'https://schema.org/Offer' }, h('meta', { itemprop: 'price', content: '0' }), h('meta', { itemprop: 'priceCurrency', content: 'USD' })),
  ];

  const footer = h(
    'footer.guest-footer',
    h(
      'div.guest-footer__inner',
      h('span.guest-footer__brand', h('b', PRODUCT_NAME), ' · ', AFFILIATION_NOTICE),
      h('button', { type: 'button', onclick: api.footerActions.about }, 'About'),
      h('a', { href: 'privacy.html' }, 'Privacy Policy'),
      h('button', { type: 'button', onclick: api.footerActions.help }, 'Help'),
      h('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
      h('button', { type: 'button', onclick: api.footerActions.share }, 'Share'),
    ),
  );

  root.replaceChildren(
    h('a.skip-link', { href: '#main' }, 'Skip to main content'),
    guestNav({ onSample: api.onSample, onHow: api.openHow }),
    h('main.welcome', { id: 'main', itemscope: true, itemtype: 'https://schema.org/SoftwareApplication' }, schemaMeta, hero, features, faq),
    footer,
    fileInput,
  );
  render();

  tickTimer = setInterval(() => {
    if (!ui.requestedAt) return;
    const elapsed = Date.now() - ui.requestedAt;
    if (elapsed > TEN_MIN && !ui.remindedReady) {
      ui.remindedReady = true;
      if (ui.notifyOn && document.hidden) {
        notify('Your LinkedIn archive should be ready', `Check your email from LinkedIn, download the .zip, and open it locally in ${PRODUCT_NAME}.`, 'rd-check');
      }
      if (document.hidden) setTab(`(1) Your archive should be ready | ${PRODUCT_NAME}`, { dot: true });
      render();
    } else if (!ui.watching) {
      const t = stepsHost.querySelector('.step--done .step__text');
      if (t?.firstChild) t.firstChild.textContent = `Requested ${relPhrase(ui.requestedAt)}. `;
    }
  }, 30000);
}

function feature(iconName, title, text) {
  return h('div.feature', h('div.feature__icon', icon(iconName, 24)), h('h3.feature__title', title), h('p.feature__text', text));
}

function faqItem(q, a) {
  return h(
    'details.faq__item',
    { itemscope: true, itemprop: 'mainEntity', itemtype: 'https://schema.org/Question' },
    h('summary', h('span', { itemprop: 'name' }, q), icon('chevronDown', 24)),
    h('div', { itemscope: true, itemprop: 'acceptedAnswer', itemtype: 'https://schema.org/Answer' }, h('p', { itemprop: 'text' }, a)),
  );
}

/** Static product preview (fictional example data) shown next to the hero. */
function preview() {
  const row = (name, headline, meta, text) => h(
    'div.row',
    avatar(48),
    h(
      'div.row__main',
      h('div.row__name', name),
      h('div.row__headline.clamp-1', headline),
      h('div.row__meta', meta),
      text ? h('div.row__quote.clamp-2', text) : null,
    ),
    h('div.row__actions', h('span.btn.btn--secondary.btn--sm', 'Reply')),
  );
  return h(
    'div.preview',
    h(
      'div.card.preview__card',
      h('header.card__header', h('div.card__titles', h('p.card__title', '3 people are waiting for your reply'), h('p.card__subtitle', 'Newest questions first'))),
      h(
        'div.list',
        row('Emma Collins', 'Product Manager at Lumen Labs', 'Asked you a question · 3w', 'Are you still planning to speak at the design meetup in December?'),
        row('Daniel Kim', 'Frontend Developer at Fieldstone', 'Asked you a question · 2mo', 'Can you send me the Figma file for the onboarding flow?'),
        row('Liam Turner', 'Head of Design at Summit Analytics', 'Wrote to you · 2w', null),
      ),
    ),
    h(
      'div.card.preview__float',
      h(
        'div.row',
        avatar(40),
        h(
          'div.row__main',
          h('div.row__name.t-14', 'Selin Aydin'),
          h('div.row__headline.t-12.clamp-1', 'Talent Partner at Vela Payments'),
          h('div.row__meta', h('span.tag', 'Recruiter'), ' Never answered · 8mo'),
        ),
      ),
    ),
    h('p.preview__caption', 'Example preview'),
  );
}
