import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, parseCsv } from '../assets/js/core/csv.js';
import { parseDate, relTime, isoWeekKey } from '../assets/js/core/time.js';
import { fold, companyKey, companyMatches, cleanText, profileSlug, snippet } from '../assets/js/core/text.js';

test('csv: quoted multi-line fields, escaped quotes, BOM, CRLF', () => {
  const text = '\ufeffA,B,C\r\n1,"hello, ""world""","line1\nline2"\r\n2,,x\r\n';
  const rows = parseRows(text);
  assert.deepEqual(rows[0], ['A', 'B', 'C']);
  assert.deepEqual(rows[1], ['1', 'hello, "world"', 'line1\nline2']);
  assert.deepEqual(rows[2], ['2', '', 'x']);
  assert.equal(rows.length, 3);
});

test('csv: skips "Notes:" preamble and maps header aliases case-insensitively', () => {
  const text = 'Notes:\n"Some long note, with commas"\n\nFirst Name,Last Name,URL,Company,Connected On\nAda,Lovelace,https://www.linkedin.com/in/ada,Analytical Engines,10 Dec 2020\n';
  const { records, missing } = parseCsv(text, {
    firstName: ['first name'], lastName: ['Last Name'], url: ['URL'], company: ['Company'], connectedOn: ['Connected On'], position: ['Position'],
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].firstName, 'Ada');
  assert.equal(records[0].company, 'Analytical Engines');
  assert.deepEqual(missing, ['position']);
});

test('time: parses all LinkedIn date formats', () => {
  assert.equal(parseDate('2024-05-12 14:33:10 UTC'), Date.UTC(2024, 4, 12, 14, 33, 10));
  assert.equal(parseDate('2024-05-12T14:33:10Z'), Date.UTC(2024, 4, 12, 14, 33, 10));
  assert.equal(parseDate('15 Mar 2023'), Date.UTC(2023, 2, 15));
  assert.equal(parseDate('15 Mart 2023'), Date.UTC(2023, 2, 15));
  assert.equal(parseDate('Mar 15, 2023'), Date.UTC(2023, 2, 15));
  assert.equal(parseDate('10/12/24, 3:04 PM'), Date.UTC(2024, 9, 12, 15, 4));
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('garbage'), null);
});

test('time: LinkedIn-style relative time + ISO week', () => {
  const now = Date.UTC(2026, 9, 30);
  assert.equal(relTime(now - 3 * 86400000, now), '3d');
  assert.equal(relTime(now - 21 * 86400000, now), '3w');
  assert.equal(relTime(now - 150 * 86400000, now), '4mo');
  assert.equal(relTime(now - 800 * 86400000, now), '2yr');
  assert.equal(isoWeekKey(Date.UTC(2026, 9, 30)), '2026-W44');
});

test('text: folding, company keys, fuzzy match, slugs', () => {
  assert.equal(fold('İstanbul Şişli ÇAĞ'), 'istanbul sisli cag');
  assert.equal(companyKey('ACME Technologies, Inc.'), 'acme');
  assert.equal(companyKey('Lumen Labs Inc.'), companyKey('Lumen Labs'));
  assert.equal(companyKey('Trendyol Group'), 'trendyol');
  assert.ok(companyMatches(companyKey('Kestrel Bank'), 'kestrel'));
  assert.ok(companyMatches(companyKey('Northwind Traders'), 'nortwind'));
  assert.ok(!companyMatches(companyKey('Kestrel Bank'), 'orbital'));
  assert.equal(cleanText('<p>Hi &amp; welcome</p>'), 'Hi & welcome');
  assert.equal(profileSlug('https://www.linkedin.com/in/Jane-Doe-123/?x=1'), 'jane-doe-123');
  assert.ok(snippet('word '.repeat(100), 40).endsWith('…'));
});
