// Generates tests/fixtures/Basic_LinkedInDataExport_sample.zip from synthetic sample data.
// Usage: node tools/make-fixture.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSampleExport } from '../assets/js/demo/sample.js';
import { writeZip } from './zipwriter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = buildSampleExport();
const zip = writeZip(new Map([...files].map(([name, text]) => [name, text])));
const out = path.join(root, 'tests', 'fixtures', 'Basic_LinkedInDataExport_sample.zip');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zip);
console.log(`Wrote ${path.relative(root, out)} (${(zip.length / 1024).toFixed(1)} KB, ${files.size} files)`);
