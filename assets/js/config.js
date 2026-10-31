// Central product, origin, privacy, and optional cookieless analytics configuration.

export const PRODUCT_NAME = 'Reply Debt';
export const SITE_ORIGIN = 'https://replydebt.github.io';
export const REPO_URL = 'https://github.com/replydebt/replydebt.github.io';
export const SECURITY_ADVISORY_URL = 'https://github.com/replydebt/replydebt.github.io/security/advisories/new';
export const PUBLISHER_NAME = 'Nayri Akbuğa';
export const AFFILIATION_NOTICE = 'Independent open-source tool · Not affiliated with LinkedIn';

// Distinct dark slate-indigo brand mark (deliberately different from LinkedIn blue #0a66c2).
export const BRAND_COLOR = '#2c365d';

// Disabled by default at launch so CSP has zero external hosts and ad/tracker blockers show 0 blocked requests.
// Optional cookieless zero-JS pixel support: set to an exact HTTPS endpoint (e.g. 'https://count.example.com/count')
// and run `node tools/build.mjs` to update CSP img-src and static privacy disclosures in lockstep.
export const ANALYTICS_ENDPOINT = '';

export const RETENTION_DAYS = 90;
export const DB_NAME = 'reply-debt';
export const STORAGE_PREFIX = 'rd.';

export function analyticsOrigin(endpoint = ANALYTICS_ENDPOINT) {
  if (!endpoint) return '';
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildNoscriptPixelHtml(endpoint = ANALYTICS_ENDPOINT) {
  if (!analyticsOrigin(endpoint)) return '';
  return `<img src="${escapeHtml(endpoint)}" alt="" width="1" height="1" referrerpolicy="no-referrer">`;
}

export function buildPrivacyAnalyticsHtml(endpoint = ANALYTICS_ENDPOINT) {
  const origin = analyticsOrigin(endpoint);
  if (!origin) {
    return '<li id="visit-analytics-disclosure"><strong>Visit Analytics:</strong> Disabled at launch (<code>ANALYTICS_ENDPOINT = \'\'</code>). Reply Debt sets zero cookies, loads zero third-party scripts, and sends zero analytics beacons.</li>';
  }
  return `<li id="visit-analytics-disclosure"><strong>Visit Analytics:</strong> Minimal cookieless 1x1 page-load pixel via <code>${escapeHtml(origin)}</code> (<code>referrerpolicy="no-referrer"</code>, zero cookies, zero localStorage, zero archive or contact metadata, skipped when Do Not Track or Global Privacy Control is enabled).</li>`;
}

export function buildCsp({ worker = true, analyticsEndpoint = ANALYTICS_ENDPOINT } = {}) {
  const extraImg = analyticsOrigin(analyticsEndpoint);
  const imgSrc = extraImg ? `'self' data: ${extraImg}` : "'self' data:";
  const directives = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src ${imgSrc}`,
  ];
  if (worker) directives.push("worker-src 'self'");
  directives.push(
    "connect-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "require-trusted-types-for 'script'",
    worker ? 'trusted-types app-worker' : "trusted-types 'none'",
  );
  return directives.join('; ');
}
