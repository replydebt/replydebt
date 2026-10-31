import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip, readZipBlob } from '../assets/js/core/zip.js';
import { parseRows, parseCsv } from '../assets/js/core/csv.js';
import { cleanText, nameKey, companyKey, companyMatches, profileSlug } from '../assets/js/core/text.js';
import { parseDate } from '../assets/js/core/time.js';
import { loadExport } from '../assets/js/core/loader.js';
import { detectMe } from '../assets/js/core/identity.js';
import { buildModel } from '../assets/js/core/model.js';
import { analyzeSession } from '../assets/js/analyze/index.js';
import { writeZip, toArrayBuffer } from '../tools/zipwriter.mjs';

test('zip: streaming decompression aborts zip-bomb payloads exceeding byte caps', async () => {
  const hugeCsv = `First Name,Last Name\n${'A,B\n'.repeat(400000)}`; // ~1.6 MB uncompressed, tiny deflated
  const zipBuf = writeZip(new Map([['Connections.csv', hugeCsv]]));
  assert.ok(zipBuf.length < 30000, 'compressed payload should be small');

  const blob = new Blob([zipBuf]);
  const entries = await readZipBlob(blob, { maxEntryBytes: 256 * 1024, maxTotalBytes: 512 * 1024 });
  await assert.rejects(
    () => entries.get('Connections.csv')(),
    /safety size limit/i,
  );
});

test('zip: enforces total archive uncompressed byte cap across multiple files', async () => {
  const chunk = `First Name,Last Name\n${'Alex,Morgan\n'.repeat(15000)}`; // ~180 KB each
  const zipBuf = writeZip(new Map([
    ['Connections.csv', chunk],
    ['Profile.csv', chunk],
  ]));
  const entries = await readZipBlob(new Blob([zipBuf]), { maxEntryBytes: 300 * 1024, maxTotalBytes: 250 * 1024 });
  const first = await entries.get('Connections.csv')();
  assert.ok(first.length > 100000);
  await assert.rejects(
    () => entries.get('Profile.csv')(),
    /safety size limit/i,
  );
});

test('zip: enforces maxEntries cap, rejects encrypted archives, and handles local-vs-central extraLen mismatch', async () => {
  const many = new Map(Array.from({ length: 8 }, (_, i) => [`f${i}.txt`, 'ok']));
  await assert.rejects(
    () => readZipBlob(new Blob([writeZip(many)]), { maxEntries: 5 }),
    /too many entries/i,
  );

  const encrypted = writeZip(new Map([['Connections.csv', 'a,b']]), { flags: 0x0801 });
  await assert.rejects(
    () => readZipBlob(new Blob([encrypted])),
    /Password-protected/i,
  );

  // Simulate macOS/Info-ZIP where local extra field (9 bytes) differs from central extra field (5 bytes).
  const mismatchZip = writeZip(
    new Map([
      ['export\\Connections.csv', 'First Name,Last Name\nAda,Lovelace'],
      ['export\\Profile.csv', 'First Name,Last Name\nGrace,Hopper'],
    ]),
    {
      localExtras: { 'export\\Connections.csv': Buffer.alloc(9, 0x55) },
      centralExtras: { 'export\\Connections.csv': Buffer.alloc(5, 0x55) },
    },
  );
  const blobEntries = await readZipBlob(new Blob([mismatchZip]));
  assert.equal(await blobEntries.get('export/Connections.csv')(), 'First Name,Last Name\nAda,Lovelace');
  assert.equal(await blobEntries.get('export/Profile.csv')(), 'First Name,Last Name\nGrace,Hopper');

  const bufEntries = await readZip(toArrayBuffer(mismatchZip));
  assert.equal(await bufEntries.get('export/Connections.csv')(), 'First Name,Last Name\nAda,Lovelace');
});

test('zip: empty and corrupted deflate streams fail with clean messages', async () => {
  await assert.rejects(() => readZipBlob(new Blob([])), /not a valid \.zip archive/i);
  assert.throws(() => readZip(new ArrayBuffer(0)), /not a valid \.zip archive/i);

  const valid = Buffer.from(writeZip(new Map([['Connections.csv', 'First Name,Last Name\nAlex,Morgan'.repeat(20)]])));
  // Corrupt compressed deflate payload right after 30-byte local header + filename.
  const dataStart = 30 + Buffer.byteLength('Connections.csv');
  valid[dataStart] ^= 0xff;
  valid[dataStart + 1] ^= 0xff;
  valid[dataStart + 2] ^= 0xff;
  const entries = await readZipBlob(new Blob([valid]));
  await assert.rejects(
    () => entries.get('Connections.csv')(),
    (err) => !/Failed to fetch/i.test(err.message),
  );
});

test('csv: preserves unquoted mid-field quotes, blocks prototype pollution, and enforces row cap', () => {
  const raw = 'First Name,Position,Company\nAlex,Senior "Staff" Designer,Acme\nSam,"Lead ""Platform"" Eng",Lumen';
  const rows = parseRows(raw);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'Senior "Staff" Designer');
  assert.equal(rows[2][1], 'Lead "Platform" Eng');

  const { records: mapped } = parseCsv('__proto__,constructor,First Name\npolluted,bad,Taylor', {
    first: ['first name'],
    proto: ['__proto__'],
  });
  assert.equal(Object.getPrototypeOf(mapped[0]), null);
  assert.equal(({}).polluted, undefined);
  assert.equal(mapped[0].first, 'Taylor');

  assert.throws(() => parseRows('a\n1\n2\n3\n4', 3), /maximum row limit/i);
});

test('text: preserves non-Latin scripts, Georgia Tech, short-query boundaries, and survives malformed entities/URLs', () => {
  assert.ok(nameKey('Алексей Иванов').length > 4);
  assert.ok(nameKey('محمد علي').length > 3);
  assert.ok(nameKey('田中 太郎').length >= 3);
  assert.notEqual(nameKey('Алексей Иванов'), nameKey('Сергей Петров'));

  assert.ok(companyKey('株式会社メルカリ').length > 0);
  assert.equal(companyKey('Georgia Tech'), 'georgia tech');
  assert.notEqual(companyKey('Georgia Tech'), companyKey('Georgia'));

  assert.equal(companyMatches('Disney', 'EY'), false);
  assert.equal(companyMatches('EY', 'EY'), true);
  assert.equal(companyMatches('EY-Parthenon', 'EY'), true);
  assert.equal(companyMatches('Booking.com', 'ING'), false);
  assert.equal(companyMatches('ING Bank', 'ING'), true);

  // Out-of-range numeric HTML entities and lone surrogates must never throw RangeError.
  assert.doesNotThrow(() => cleanText('Hello &#999999999; &#xD800; &constructor; &amp; world'));
  assert.ok(cleanText('A &amp; B &#999999999;').includes('A & B'));

  // Malformed percent-encoding in profile URLs must never throw URIError.
  assert.doesNotThrow(() => profileSlug('https://www.linkedin.com/in/bad-%E0%A4%A-slug/'));
  assert.equal(profileSlug('https://www.linkedin.com/in/bad-%E0%A4%A-slug/'), 'bad-%e0%a4%a-slug');
});

test('time: parses localized dates across 21 languages plus CJK and dotted formats, rejecting out-of-range years', () => {
  const samples = [
    '14 Oct 2025',          // EN
    '14 Eki 2025',          // TR
    '14. Okt. 2025',        // DE
    '14 oct. 2025',         // FR
    '14 oct 2025',          // ES
    '14 out 2025',          // PT
    '14 ott 2025',          // IT
    '14 okt 2025',          // NL / SV / DA / NO
    '14 paź 2025',          // PL
    '14 loka 2025',         // FI
    '14 říj 2025',          // CS
    '14 okt. 2025',         // HU
    '14 окт. 2025 г.',      // RU
    '14 жовт. 2025 р.',     // UK
    '2025年10月14日',        // ZH / JA
    '2025년 10월 14일',       // KO
    '14.10.2025 09:30',     // Dotted EU/TR
    '25/10/2025',           // DD/MM/YYYY (day > 12)
  ];
  for (const s of samples) {
    assert.ok(parseDate(s) > Date.UTC(2025, 9, 1), `failed to parse "${s}"`);
  }
  assert.equal(parseDate('14 Oct 1899'), null);
  assert.equal(parseDate('14 Oct 2250'), null);
});

test('identity & model: comma credentials, display-name changes, same-name distinct profiles, and zero-message persistence', async () => {
  const secretEmail = 'canary.secret.email@example.org';
  const secretBody = 'CANARY_BODY_99182_CONFIDENTIAL_QUESTION?';
  const secretSubject = 'CANARY_INMAIL_SUBJECT_77412';
  const secretInvite = 'CANARY_INVITE_NOTE_55319 hiring for an open Staff Engineer position, open to a conversation?';

  const rawEntries = [
    ['Connections.csv', [
      'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
      `Sarah,"Lin, PhD, MBA",https://www.linkedin.com/in/sarah-lin-phd,${secretEmail},Lumen Labs,VP Engineering,10 Jan 2024`,
      `Michael,Chen,https://www.linkedin.com/in/michael-chen-1,${secretEmail},Acme,Staff Engineer,12 Feb 2024`,
      `Michael,Chen,https://www.linkedin.com/in/michael-chen-2,${secretEmail},Orbital,Product Manager,15 Mar 2024`,
    ].join('\n')],
    ['messages.csv', [
      'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER',
      // 1) Comma credentials in recipient name with 1 recipient URL -> must NOT become a group chat!
      `2-cred,,Owner User,https://www.linkedin.com/in/owner-user,"Sarah Lin, PhD, MBA",https://www.linkedin.com/in/sarah-lin-phd,2026-10-01 10:00:00 UTC,,Hello Sarah,INBOX`,
      `2-cred,,"Sarah Lin, PhD, MBA",https://www.linkedin.com/in/sarah-lin-phd,Owner User,https://www.linkedin.com/in/owner-user,2026-10-02 10:00:00 UTC,,${secretBody},INBOX`,
      // 2) Contact changed display name over time but kept the same profile URL -> must stay 1:1!
      `2-rename,,Jane Smith,https://www.linkedin.com/in/jane-smith-1,Owner User,https://www.linkedin.com/in/owner-user,2025-05-01 09:00:00 UTC,,Hi there,INBOX`,
      `2-rename,,Owner User,https://www.linkedin.com/in/owner-user,Jane Smith-Doe,https://www.linkedin.com/in/jane-smith-1,2025-05-01 09:10:00 UTC,,Hi Jane,INBOX`,
      `2-rename,,Jane Smith-Doe,https://www.linkedin.com/in/jane-smith-1,Owner User,https://www.linkedin.com/in/owner-user,2026-10-03 09:15:00 UTC,,Are we meeting Thursday?,INBOX`,
      // 3) Recruiter InMail with secret subject
      `2-inmail,Sponsored,Recruiter Pat,https://www.linkedin.com/in/recruiter-pat,Owner User,https://www.linkedin.com/in/owner-user,2026-10-04 11:00:00 UTC,${secretSubject},Hi Owner we are hiring for an open Principal Engineer role at Stripe and would love to interview you,INBOX`,
    ].join('\n')],
    ['Invitations.csv', [
      'From,To,Sent At,Message,Direction,inviterProfileUrl,inviteeProfileUrl',
      `Jonas Recruiter,Owner User,10/05/26, 09:00 AM,"${secretInvite}",INCOMING,https://www.linkedin.com/in/jonas-rec,https://www.linkedin.com/in/owner-user`,
    ].join('\n')],
  ];
  const files = new Map(rawEntries.map(([k, v]) => [k, () => v]));

  const data = await loadExport(files);
  assert.equal('email' in data.connections[0], false, 'Connections.csv email must be dropped at load time');

  // Owner detected accurately even WITHOUT Profile.csv
  const me = detectMe(data);
  assert.equal(me.name, 'Owner User');

  const model = buildModel(data, me);
  // Two distinct Michael Chen profiles must remain separate people
  const michaels = [...model.people.values()].filter((p) => p.name === 'Michael Chen');
  assert.equal(michaels.length, 2);

  // Neither comma credentials nor display-name changes may trigger false group conversations
  const falseGroups = model.conversations.filter((c) => c.isGroup);
  assert.equal(falseGroups.length, 0);

  const { report, quotes } = analyzeSession(data, { now: Date.parse('2026-10-20T00:00:00Z') });
  const serializedReport = JSON.stringify(report);
  assert.equal(serializedReport.includes(secretEmail), false, 'canary email leaked into report');
  assert.equal(serializedReport.includes(secretBody), false, 'canary message body leaked into report');
  assert.equal(serializedReport.includes(secretSubject), false, 'canary InMail subject leaked into report');
  assert.equal(serializedReport.includes(secretInvite), false, 'canary invite note leaked into report');
  assert.equal('candidates' in report.me, false, 'owner candidates must not be stored in persisted report');

  // Session RAM quotes still hold the active quotes for rendering before tab close
  assert.ok(JSON.stringify(quotes).includes(secretBody));
  assert.ok(JSON.stringify(quotes).includes(secretSubject));
});

test('identity: receive-only account without Profile.csv still detects the owner accurately (including 1-conversation archives)', async () => {
  const rawEntries = [
    ['Connections.csv', 'First Name,Last Name,URL,Company,Position,Connected On\nPeer,One,https://www.linkedin.com/in/peer-1,Acme,Dev,10 Jan 2025'],
    ['messages.csv', [
      'CONVERSATION ID,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT',
      '2-a,Peer One,https://www.linkedin.com/in/peer-1,Quiet Owner,https://www.linkedin.com/in/quiet-owner,2026-09-01 10:00:00 UTC,,Hi Quiet!',
      '2-b,Peer Two,https://www.linkedin.com/in/peer-2,Quiet Owner,https://www.linkedin.com/in/quiet-owner,2026-09-02 10:00:00 UTC,,Hello Quiet!',
      '2-c,Peer Three,https://www.linkedin.com/in/peer-3,Quiet Owner,https://www.linkedin.com/in/quiet-owner,2026-09-03 10:00:00 UTC,,Hey Quiet!',
    ].join('\n')],
  ];
  const files = new Map(rawEntries.map(([k, v]) => [k, () => v]));
  const data = await loadExport(files);
  const me = detectMe(data);
  assert.equal(me.name, 'Quiet Owner');
  assert.deepEqual(me.slugs, ['quiet-owner']);

  // Single-conversation receive-only archive without Profile.csv where sender is a 1st-degree connection:
  // sender must NEVER hijack owner detection.
  const singleConvFiles = new Map([
    ['Connections.csv', () => 'First Name,Last Name,URL,Company,Position,Connected On\nAlice,Wong,https://www.linkedin.com/in/alice-wong,Lumen,PM,10 Jan 2025'],
    ['messages.csv', () => [
      'CONVERSATION ID,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT',
      '2-only,Alice Wong,https://www.linkedin.com/in/alice-wong,Quiet User,https://www.linkedin.com/in/quiet-user,2026-10-10 10:00:00 UTC,,Are you joining the meetup tomorrow?',
    ].join('\n')],
  ]);
  const singleData = await loadExport(singleConvFiles);
  const singleMe = detectMe(singleData);
  assert.equal(singleMe.name, 'Quiet User');
  assert.equal(singleMe.ambiguous, false);
  const singleSession = analyzeSession(singleData, { now: Date.parse('2026-10-20T00:00:00Z') });
  assert.equal(singleSession.report.replies.length, 1, 'Alice Wong question must appear in owed replies');

  // Single incoming message with blank TO when Profile.csv IS present: must keep Profile.csv owner name.
  const blankToFiles = new Map([
    ['Profile.csv', () => 'First Name,Last Name,Headline\nJane,Smith,Staff Engineer'],
    ['messages.csv', () => [
      'CONVERSATION ID,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT',
      '2-inmail,Bob Recruiter,https://www.linkedin.com/in/bob-rec,,,2026-10-12 09:00:00 UTC,Staff Role,Hi Jane we are hiring for an open Staff Engineer position at Stripe',
    ].join('\n')],
  ]);
  const blankToData = await loadExport(blankToFiles);
  const blankToMe = detectMe(blankToData);
  assert.equal(blankToMe.name, 'Jane Smith');
});

test('state: stale setMark undo closure is neutralized across resetAll and new sessions', async () => {
  const { app, setSession, setMark, mark, resetAll } = await import('../assets/js/app/state.js');
  const dummyReport = {
    version: 2,
    isSample: true,
    me: { name: 'Alex Morgan', headline: '', slugs: [], ambiguous: false },
    people: [],
    recruiters: [],
    replies: [],
    reconnect: [],
    topCompanies: [],
    stats: {},
  };

  await setSession({ report: dummyReport });
  const undoSameSession = setMark('rep:2-same', 'done');
  assert.equal(mark('rep:2-same')?.state, 'done');
  undoSameSession();
  assert.equal(mark('rep:2-same'), null, 'undo within the active session must revert mark');

  const staleUndo = setMark('rep:2-stale', 'done');
  assert.equal(mark('rep:2-stale')?.state, 'done');
  await resetAll();
  assert.equal(mark('rep:2-stale'), null);

  // Triggering the stale undo closure after resetAll must NOT resurrect the mark.
  staleUndo();
  assert.equal(mark('rep:2-stale'), null);
  assert.deepEqual(Object.keys(app.marks), []);
});

test('pipeline & zip: raw CSV byte caps and Central Directory pre-slice byte cap reject oversized inputs cleanly', async () => {
  const { runPipeline } = await import('../assets/js/app/pipeline.js');
  let textCalled = false;
  const fakeHugeCsv = {
    name: 'Connections.csv',
    size: 5 * 1024 * 1024,
    text: async () => {
      textCalled = true;
      return 'First Name,Last Name\nA,B';
    },
  };
  await assert.rejects(
    () => runPipeline({ kind: 'csv', files: [fakeHugeCsv], maxEntryBytes: 1024 }),
    /safety size limit/i,
  );
  assert.equal(textCalled, false, 'oversized raw CSV must be rejected before reading text() into memory');

  const smallZip = writeZip(new Map([['Connections.csv', 'First Name,Last Name\nAda,Lovelace']]));
  await assert.rejects(
    () => readZipBlob(new Blob([smallZip]), { maxCdBytes: 10 }),
    /safety size limit/i,
  );
});
