import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCsp, buildNoscriptPixelHtml, buildPrivacyAnalyticsHtml } from '../assets/js/config.js';
import { ICON_NAMES } from '../assets/js/ui/icons.js';
import { buildDist, DIST_ALLOWLIST } from '../tools/dist.mjs';
import { syncHtmlContent } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walkFiles(dir, { excludeDirs = new Set(['.git', 'dist', 'node_modules']) } = {}) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!excludeDirs.has(ent.name)) out.push(...walkFiles(path.join(dir, ent.name), { excludeDirs }));
    } else {
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

test('hygiene: zero personal .zip or .csv files exist anywhere in workspace outside the single synthetic sample fixture', () => {
  const allowedFixture = 'tests/fixtures/Basic_LinkedInDataExport_sample.zip';
  const all = walkFiles(root);
  const archivesOrCsvs = all
    .map((f) => path.relative(root, f).split(path.sep).join('/'))
    .filter((rel) => /\.(zip|csv)$/i.test(rel));

  assert.deepEqual(
    archivesOrCsvs,
    [allowedFixture],
    `Forbidden .zip or .csv file(s) found in workspace: ${archivesOrCsvs.join(', ')}`,
  );
});

test('hygiene: zero innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, or new Function in source/HTML', () => {
  const files = [
    ...walkFiles(path.join(root, 'assets')),
    path.join(root, 'index.html'),
    path.join(root, 'privacy.html'),
    path.join(root, '404.html'),
    path.join(root, 'tools', 'og.html'),
  ].filter((f) => /\.(js|mjs|html)$/i.test(f));

  const forbidden = /\.(innerHTML|outerHTML|insertAdjacentHTML)\b|\bdocument\.write\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/;
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const content = fs.readFileSync(f, 'utf8');
    assert.equal(forbidden.test(content), false, `Forbidden DOM/script sink found in ${rel}`);
  }
});

test('hygiene: HTML pages enforce exact CSP, Trusted Types, zero inline style attributes, and zero inline scripts', () => {
  const pages = [
    { file: 'index.html', expectedCsp: buildCsp({ worker: true }) },
    { file: 'privacy.html', expectedCsp: buildCsp({ worker: false }) },
    { file: '404.html', expectedCsp: buildCsp({ worker: false }) },
  ];

  for (const { file, expectedCsp } of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
    assert.ok(cspMatch, `${file} missing CSP meta tag`);
    assert.equal(cspMatch[1], expectedCsp, `${file} CSP mismatch`);
    assert.equal(/\sstyle\s*=/i.test(html), false, `${file} contains an inline style="..." attribute`);
    assert.equal(/<style[\s>]/i.test(html), false, `${file} contains an inline <style> element`);

    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length >= 1, `${file} should load theme-init.js`);
    for (const [, attrs, body] of scripts) {
      assert.ok(/\bsrc\s*=/i.test(attrs), `${file} contains an inline <script> without src`);
      assert.equal(body.trim(), '', `${file} script tag must have empty inline body`);
    }
  }
});

test('hygiene: zero literal emoji characters across UI, docs, legal pages, CSS, and tools', () => {
  const checkPaths = [
    path.join(root, 'index.html'),
    path.join(root, 'privacy.html'),
    path.join(root, '404.html'),
    path.join(root, 'README.md'),
    path.join(root, 'SECURITY.md'),
    path.join(root, 'LICENSE'),
    path.join(root, '.well-known', 'security.txt'),
    ...walkFiles(path.join(root, 'assets', 'js')),
    ...walkFiles(path.join(root, 'assets', 'css')),
    ...walkFiles(path.join(root, 'tools')),
  ];
  const emojiRe = /\p{Extended_Pictographic}/u;
  for (const f of checkPaths) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const text = fs.readFileSync(f, 'utf8');
    const m = text.match(emojiRe);
    assert.equal(m, null, `Literal emoji "${m?.[0] || ''}" found in ${rel}`);
  }
});

test('hygiene: 100% of defined icons in icons.js are used and zero undefined icons are referenced', () => {
  const jsFiles = walkFiles(path.join(root, 'assets', 'js')).filter((f) => !f.endsWith('icons.js'));
  const combined = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  const defined = new Set(ICON_NAMES);
  const used = new Set();

  // Direct icon('name') calls
  for (const m of combined.matchAll(/\bicon\(\s*['"]([A-Za-z0-9_]+)['"]/g)) used.add(m[1]);
  // Conditional icon(cond ? 'a' : 'b') calls
  for (const m of combined.matchAll(/\bicon\([^)]*\?\s*['"]([A-Za-z0-9_]+)['"]\s*:\s*['"]([A-Za-z0-9_]+)['"]/g)) {
    used.add(m[1]);
    used.add(m[2]);
  }
  // Declarative icon names in TABS, feature('name', ...), toast({ icon: 'name' }), and moreMenu tuples
  for (const m of combined.matchAll(/\bicon:\s*['"]([A-Za-z0-9_]+)['"]/g)) used.add(m[1]);
  for (const m of combined.matchAll(/\bfeature\(\s*['"]([A-Za-z0-9_]+)['"]/g)) used.add(m[1]);
  for (const m of combined.matchAll(/\bitem\(\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]\s*,\s*['"]([A-Za-z0-9_]+)['"]/g)) used.add(m[1]);
  for (const m of combined.matchAll(/,\s*['"](eyeOff|check|close)['"]\s*\]/g)) used.add(m[1]);
  // Fallback icon inside icons.js itself
  used.add('info');

  for (const u of used) {
    assert.ok(defined.has(u), `Referenced icon "${u}" is not defined in icons.js`);
  }
  for (const d of defined) {
    assert.ok(used.has(d), `Defined icon "${d}" in icons.js is unused`);
  }
});

test('hygiene: 100% of CSS classes in assets/css/*.css are referenced in HTML or JS', () => {
  const cssFiles = walkFiles(path.join(root, 'assets', 'css')).filter((f) => f.endsWith('.css'));
  const definedClasses = new Set();
  for (const f of cssFiles) {
    const css = fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"[^"]*"|'[^']*'/g, '');
    // Strip declaration blocks `{ ... }` (non-nested rules) or match selectors before `{`
    for (const ruleMatch of css.matchAll(/([^{}]+)\{/g)) {
      const selector = ruleMatch[1].trim();
      if (selector.startsWith('@') || /^(from|to|\d+%)$/.test(selector)) continue;
      for (const cm of selector.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g)) {
        definedClasses.add(cm[1]);
      }
    }
  }

  const consumers = [
    fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    fs.readFileSync(path.join(root, 'privacy.html'), 'utf8'),
    fs.readFileSync(path.join(root, '404.html'), 'utf8'),
    ...walkFiles(path.join(root, 'assets', 'js')).map((f) => fs.readFileSync(f, 'utf8')),
  ].join('\n');

  // Dynamic template classes like `step--${state}` where state is 'active' | 'done' | 'todo'
  const dynamicKnown = new Set(['step--active', 'step--done', 'step--todo']);

  for (const cls of definedClasses) {
    if (dynamicKnown.has(cls)) continue;
    assert.ok(consumers.includes(cls), `Unused CSS class ".${cls}" in assets/css/`);
  }
});

test('hygiene: .well-known/security.txt complies with RFC 9116 and dist/ strictly matches allowlist', () => {
  const secTxt = fs.readFileSync(path.join(root, '.well-known', 'security.txt'), 'utf8');
  assert.match(secTxt, /^Contact:\s*https:\/\//m);
  assert.match(secTxt, /^Policy:\s*https:\/\//m);
  assert.match(secTxt, /^Canonical:\s*https:\/\/networkaudit\.github\.io\/\.well-known\/security\.txt$/m);
  const expMatch = secTxt.match(/^Expires:\s*(\S+)$/m);
  assert.ok(expMatch, 'security.txt missing Expires field');
  const expiresAt = Date.parse(expMatch[1]);
  const now = Date.now();
  assert.ok(Number.isFinite(expiresAt) && expiresAt > now, 'security.txt Expires must be in the future');
  assert.ok(expiresAt - now <= 366 * 86400000, 'security.txt Expires must be <= 1 year ahead per RFC 9116');

  const built = buildDist();
  assert.equal(built.length, DIST_ALLOWLIST.length);
});

test('hygiene: 404.html uses root-relative asset and navigation paths so nested GitHub Pages 404 routes render styled', () => {
  const html404 = fs.readFileSync(path.join(root, '404.html'), 'utf8');
  const refs = [...html404.matchAll(/\b(?:href|src)="([^"]+)"/gi)].map((m) => m[1]);
  assert.ok(refs.length >= 8, 'expected asset and navigation refs in 404.html');
  for (const ref of refs) {
    assert.ok(ref.startsWith('/'), `404.html path "${ref}" must be root-relative (start with "/") for nested 404 routes`);
  }
});

test('hygiene: analytics configuration syncs CSP img-src, zero-JS noscript pixel, and privacy.html disclosure in lockstep', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const privacyHtml = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');

  // Default launch state: zero noscript pixel, zero external CSP hosts, disabled disclosure
  assert.equal(/<noscript>[\s\S]*?<img\b/i.test(indexHtml), false, 'default launch state must have zero noscript pixel');
  assert.match(privacyHtml, /id="visit-analytics-disclosure"[\s\S]*?Disabled at launch/);

  // Simulated opt-in cookieless endpoint
  const endpoint = 'https://count.example.com/count.gif';
  const syncedIndex = syncHtmlContent(
    indexHtml,
    { file: 'index.html', csp: buildCsp({ worker: true, analyticsEndpoint: endpoint }), noscriptPixel: true },
    { pixelHtml: buildNoscriptPixelHtml(endpoint) },
  );
  assert.match(syncedIndex, /img-src 'self' data: https:\/\/count\.example\.com;/);
  assert.match(syncedIndex, /<noscript>[\s\S]*?<img src="https:\/\/count\.example\.com\/count\.gif" alt="" width="1" height="1" referrerpolicy="no-referrer">[\s\S]*?<\/noscript>/);

  const syncedPrivacy = syncHtmlContent(
    privacyHtml,
    { file: 'privacy.html', csp: buildCsp({ worker: false, analyticsEndpoint: endpoint }), privacyDisclosure: true },
    { disclosureHtml: buildPrivacyAnalyticsHtml(endpoint) },
  );
  assert.match(syncedPrivacy, /img-src 'self' data: https:\/\/count\.example\.com;/);
  assert.match(syncedPrivacy, /id="visit-analytics-disclosure"[\s\S]*?https:\/\/count\.example\.com/);

  // Round-trip back to disabled launch default
  const revertedIndex = syncHtmlContent(
    syncedIndex,
    { file: 'index.html', csp: buildCsp({ worker: true, analyticsEndpoint: '' }), noscriptPixel: true },
    { pixelHtml: buildNoscriptPixelHtml('') },
  );
  const revertedPrivacy = syncHtmlContent(
    syncedPrivacy,
    { file: 'privacy.html', csp: buildCsp({ worker: false, analyticsEndpoint: '' }), privacyDisclosure: true },
    { disclosureHtml: buildPrivacyAnalyticsHtml('') },
  );
  assert.equal(revertedIndex, indexHtml);
  assert.equal(revertedPrivacy, privacyHtml);
});
