// Builds a clean, allowlisted static production artifact in dist/ for GitHub Pages deployment.
// Hard-fails if any .zip, .csv, or non-allowlisted file ends up in dist/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

export const DIST_ALLOWLIST = Object.freeze([
  'index.html',
  'privacy.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  '.nojekyll',
  'LICENSE',
  '.well-known/security.txt',
  'assets/app.bundle.js',
  'assets/js/theme-init.js',
  'assets/css/tokens.css',
  'assets/css/base.css',
  'assets/css/components.css',
  'assets/css/pages.css',
  'assets/img/favicon.svg',
  'assets/img/apple-touch-icon.png',
  'assets/img/og-image.png',
]);

export function buildDist() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  for (const relFile of DIST_ALLOWLIST) {
    const src = path.join(root, relFile);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing required production file: ${relFile}`);
    }
    const dest = path.join(dist, relFile);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  const actual = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else actual.push(path.relative(dist, full).split(path.sep).join('/'));
    }
  };
  walk(dist);

  const allowedSet = new Set(DIST_ALLOWLIST);
  for (const f of actual) {
    if (/\.(zip|csv|map)$/i.test(f) || !allowedSet.has(f)) {
      throw new Error(`Forbidden or non-allowlisted file in dist/: ${f}`);
    }
  }
  if (actual.length !== DIST_ALLOWLIST.length) {
    throw new Error(`Expected ${DIST_ALLOWLIST.length} files in dist/, found ${actual.length}`);
  }
  return actual;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const files = buildDist();
  console.log(`Built dist/ (${files.length} allowlisted files, 0 archives/CSVs).`);
}
