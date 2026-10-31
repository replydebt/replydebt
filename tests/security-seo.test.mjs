import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { readZip, readZipBlob, listZip } from '../assets/js/core/zip.js';
import { parseCsv } from '../assets/js/core/csv.js';
import { detectFiles, loadExport } from '../assets/js/core/loader.js';
import {
  cleanInline, cleanText, sanitizeFileName, decodeTextBytes, companyKey, stripUnsafeChars,
} from '../assets/js/core/text.js';
import { buildModel } from '../assets/js/core/model.js';
import { runPipeline } from '../assets/js/app/pipeline.js';
import { isLinkedInArchiveName } from '../assets/js/app/archive-name.js';
import { safeLinkedInUrl, threadUrl } from '../assets/js/ui/h.js';
import { store } from '../assets/js/core/store.js';
import { app, hiddenCount, isValidSavedReport, loadSaved } from '../assets/js/app/state.js';
import { DIST_ALLOWLIST } from '../tools/dist.mjs';
import { writeZip, toArrayBuffer } from '../tools/zipwriter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const runZipFile = (file) => runPipeline({ kind: 'zip', file });
const runCsvFiles = (files) => runPipeline({ kind: 'csv', files });

const VALID_CONNECTIONS_CSV = [
  'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
  'Alice,Walker,https://www.linkedin.com/in/alice-walker,alice@example.invalid,Northstar Labs,Principal Engineer,15 Mar 2024',
  'Bob,Chen,https://www.linkedin.com/in/bob-chen,bob@example.invalid,Northstar Labs Inc.,Product Lead,10 Jan 2023',
].join('\n');

function encodeUtf16(str, bigEndian = false) {
  const bom = Buffer.from(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]);
  const body = Buffer.alloc(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (bigEndian) body.writeUInt16BE(code, i * 2);
    else body.writeUInt16LE(code, i * 2);
  }
  return Buffer.concat([bom, body]);
}

// ============================================================================
// 1. ADVERSARIAL ZIP EXPLOIT FORTRESS
// ============================================================================

test('security/zip: CRC-32 bit-flip tampering is rejected for both deflate and stored entries', async () => {
  for (const storeEntry of [false, true]) {
    const zipBuf = Buffer.from(writeZip(
      [['Connections.csv', VALID_CONNECTIONS_CSV]],
      storeEntry ? { storeNames: ['Connections.csv'] } : {},
    ));
    // Flip bits in the middle of the entry payload (avoiding DEFLATE byte-0 BFINAL bit 0, which
    // leaves block payload & CRC intact on non-Z_FINISH stream implementations like Node 22).
    const compSize = zipBuf.readUInt32LE(18);
    const dataOffset = 30 + 'Connections.csv'.length + Math.floor(compSize / 2);
    zipBuf[dataOffset] ^= 0xff;

    const mapFromBuf = readZip(toArrayBuffer(zipBuf));
    await assert.rejects(
      () => mapFromBuf.get('Connections.csv')(),
      (err) => err.code === 'ZIP_DAMAGED',
    );

    const mapFromBlob = await readZipBlob(new Blob([zipBuf]));
    await assert.rejects(
      () => mapFromBlob.get('Connections.csv')(),
      (err) => err.code === 'ZIP_DAMAGED',
    );
  }
});

test('security/zip: header size-lie bomb, method chameleon, and local-vs-central size/CRC spoofing are rejected', async () => {
  // 1. Header claims uncompressed size = 12 bytes, actual deflate payload expands to ~180 bytes
  const lieBuf = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]]));
  const cdPos = lieBuf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  lieBuf.writeUInt32LE(12, 22);         // local uncompressed size
  lieBuf.writeUInt32LE(12, cdPos + 24); // central uncompressed size
  await assert.rejects(
    () => readZip(toArrayBuffer(lieBuf)).get('Connections.csv')(),
    (err) => err.code === 'ZIP_DAMAGED',
  );

  // 2. Chameleon ZIP: Central Directory claims deflate (8), Local File Header claims stored (0)
  const chameleon = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]]));
  chameleon.writeUInt16LE(0, 8);
  await assert.rejects(
    () => readZip(toArrayBuffer(chameleon)).get('Connections.csv')(),
    (err) => err.code === 'ZIP_DAMAGED',
  );

  // 3. Local-vs-Central CRC mismatch when bit 3 (data descriptor) is NOT set
  const crcMismatch = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]]));
  crcMismatch.writeUInt32LE((crcMismatch.readUInt32LE(14) ^ 0xdeadbeef) >>> 0, 14);
  await assert.rejects(
    () => readZip(toArrayBuffer(crcMismatch)).get('Connections.csv')(),
    (err) => err.code === 'ZIP_DAMAGED',
  );

  // 4. Legitimate Java-style streaming ZIP (bit 3 set, local CRC/compSize/size = 0) MUST still succeed
  const javaZip = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]], { flags: 0x0808 }));
  javaZip.writeUInt32LE(0, 14);
  javaZip.writeUInt32LE(0, 18);
  javaZip.writeUInt32LE(0, 22);
  const text = await readZip(toArrayBuffer(javaZip)).get('Connections.csv')();
  assert.equal(text, VALID_CONNECTIONS_CSV);
});

test('security/zip: Fifield overlapping Central Directory polyglots, 42.zip overlapping local entries, local nameLen spoofing, path traversal, symlinks, duplicates, and fake EOCD comments are defeated', async () => {
  // 1. Overlapping Central Directory (entry payload crosses into cdOffset — rejected immediately at CD parse time)
  const overlap = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]], { storeNames: ['Connections.csv'] }));
  const cdPos = overlap.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const inflatedCompSize = overlap.readUInt32LE(18) + 16;
  overlap.writeUInt32LE(inflatedCompSize, 18);
  overlap.writeUInt32LE(inflatedCompSize, 22);
  overlap.writeUInt32LE(inflatedCompSize, cdPos + 20);
  overlap.writeUInt32LE(inflatedCompSize, cdPos + 24);
  assert.throws(() => listZip(toArrayBuffer(overlap)), (err) => err.code === 'ZIP_DAMAGED');
  await assert.rejects(
    async () => readZip(toArrayBuffer(overlap)).get('Connections.csv')(),
    (err) => err.code === 'ZIP_DAMAGED',
  );

  // 1b. Classic 42.zip overlapping local entry bomb (two CD entries pointing to offset 0)
  const sharedOffsetBomb = Buffer.from(writeZip([
    ['Connections.csv', VALID_CONNECTIONS_CSV],
    ['messages.csv', VALID_CONNECTIONS_CSV],
  ]));
  const cd1 = sharedOffsetBomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const cd2 = sharedOffsetBomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), cd1 + 4);
  sharedOffsetBomb.writeUInt32LE(0, cd2 + 42); // second CD entry aliases offset 0
  assert.throws(() => listZip(toArrayBuffer(sharedOffsetBomb)), (err) => err.code === 'ZIP_DAMAGED');
  await assert.rejects(
    () => readZipBlob(new Blob([sharedOffsetBomb])),
    (err) => err.code === 'ZIP_DAMAGED',
  );

  // 1c. Local File Header nameLen mismatch vs Central Directory rawNameLen
  const nameLenMismatch = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]]));
  nameLenMismatch.writeUInt16LE(1, 26); // local nameLen tampered to 1 while CD has 15
  await assert.rejects(
    async () => readZip(toArrayBuffer(nameLenMismatch)).get('Connections.csv')(),
    (err) => err.code === 'ZIP_DAMAGED',
  );

  // 2. Path traversal ("../") and NUL/control bytes in entry paths
  for (const badName of ['../Connections.csv', 'dir/../../Connections.csv', 'Connections.csv\x00.txt', 'Connections\x07.csv']) {
    const badZip = writeZip([[badName, VALID_CONNECTIONS_CSV]]);
    assert.throws(() => listZip(toArrayBuffer(badZip)), (err) => err.code === 'ZIP_DAMAGED');
  }

  // 3. Oversized >1024-byte path
  const longPathZip = writeZip([[`${'a/'.repeat(520)}Connections.csv`, VALID_CONNECTIONS_CSV]]);
  assert.throws(() => listZip(toArrayBuffer(longPathZip)), (err) => err.code === 'ZIP_DAMAGED');

  // 4. Unix symlink (hostOs = 3, mode = 0o120777) and FIFO (0o010644) rejected; regular Unix file (0o100644) allowed
  for (const [mode, shouldPass] of [[0o120777, false], [0o010644, false], [0o100644, true]]) {
    const unixZip = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]]));
    const cd = unixZip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    unixZip.writeUInt16LE((3 << 8) | 20, cd + 4);      // versionMadeBy: UNIX
    unixZip.writeUInt32LE((mode << 16) >>> 0, cd + 38); // externalAttr
    if (shouldPass) {
      assert.equal(listZip(toArrayBuffer(unixZip)).length, 1);
    } else {
      assert.throws(() => listZip(toArrayBuffer(unixZip)), (err) => err.code === 'ZIP_DAMAGED');
    }
  }

  // 5. Duplicate normalized entry names ("Connections.csv" and "/Connections.csv")
  const dupZip = writeZip([
    ['Connections.csv', VALID_CONNECTIONS_CSV],
    ['/Connections.csv', VALID_CONNECTIONS_CSV],
  ]);
  assert.throws(() => listZip(toArrayBuffer(dupZip)), (err) => err.code === 'ZIP_DAMAGED');

  // 6. Multi-disk EOCD & strong encryption bit 6
  const multiDisk = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]]));
  multiDisk.writeUInt16LE(1, multiDisk.length - 22 + 4); // diskNum = 1
  assert.throws(() => listZip(toArrayBuffer(multiDisk)), (err) => err.code === 'ZIP_LIMIT');

  const strongEnc = writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]], { flags: 0x0040 });
  assert.throws(() => listZip(toArrayBuffer(strongEnc)), (err) => err.code === 'ZIP_ENCRYPTED');

  // 7. Fake EOCD signature stuffed inside trailing ZIP archive comment cannot hijack Central Directory parsing
  const baseZip = Buffer.from(writeZip([['Connections.csv', VALID_CONNECTIONS_CSV]]));
  const fakeComment = Buffer.alloc(30);
  fakeComment.writeUInt32LE(0x06054b50, 4); // fake EOCD inside comment pointing at garbage
  fakeComment.writeUInt16LE(999, 4 + 10);
  baseZip.writeUInt16LE(fakeComment.length, baseZip.length - 2);
  const commentedZip = Buffer.concat([baseZip, fakeComment]);
  assert.equal(listZip(toArrayBuffer(commentedZip)).length, 1);
});

// ============================================================================
// 2. BINARY / POLYGLOT DISGUISES & UTF-16LE/BE SUPPORT
// ============================================================================

test('security/binary: executables, Office/OLE2, Mach-O, WASM, SQLite, media, archives, fake UTF-16 BOMs, and high-byte binary streams disguised as Connections.csv are rejected while valid UTF-16LE/BE and Windows-1252 CSVs succeed', async () => {
  // Construct fake UTF-16LE BOM followed by 140 bytes of non-delimited CJK code units (even length, zero NULs/surrogates)
  const fakeUtf16NoDelims = Buffer.alloc(142);
  fakeUtf16NoDelims[0] = 0xff;
  fakeUtf16NoDelims[1] = 0xfe;
  for (let i = 2; i < fakeUtf16NoDelims.length; i += 2) {
    fakeUtf16NoDelims[i] = 0x45;
    fakeUtf16NoDelims[i + 1] = 0x4e; // U+4E45 repeated 70 times without any CSV delimiter or newline
  }
  // High-byte invalid UTF-8 stream (>20% bytes >= 0x80 with zero NUL/C0 control bytes)
  const highByteBinary = Buffer.alloc(128);
  for (let i = 0; i < highByteBinary.length; i++) highByteBinary[i] = 0xa0 + (i % 80);

  const disguises = [
    ['Windows PE EXE', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])],
    ['Linux ELF', Buffer.from('\x7fELF\x02\x01\x01\x00First Name,Last Name\n', 'binary')],
    ['Mach-O 64-bit', Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01])],
    ['Java .class / fat Mach-O', Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x37])],
    ['WebAssembly binary', Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])],
    ['OLE2 .xls/.doc container', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['SQLite 3 database', Buffer.from('SQLite format 3\x00First Name,Last Name\n', 'binary')],
    ['PDF polyglot', Buffer.from('%PDF-1.7\nFirst Name,Last Name\nAlice,Walker\n', 'utf8')],
    ['PNG image', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['GIF89a polyglot', Buffer.from('GIF89a,First Name,Last Name\nAlice,Walker\n', 'utf8')],
    ['JPEG image', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x41, 0x42, 0x43, 0x44])],
    ['RIFF WebP container', Buffer.from('RIFF\x24\x00\x00\x00WEBPFirst Name,Last Name\n', 'binary')],
    ['Ogg media stream', Buffer.from('OggS\x00\x02\x00\x00First Name,Last Name\n', 'binary')],
    ['FLAC audio', Buffer.from('fLaC\x00\x00\x00\x22First Name,Last Name\n', 'binary')],
    ['ISO BMFF MP4/HEIC (ftyp)', Buffer.from('\x00\x00\x00\x18ftypmp42First Name\n', 'binary')],
    ['GZIP stream', zlib.gzipSync(Buffer.from(VALID_CONNECTIONS_CSV))],
    ['BZip2 archive', Buffer.from('BZh91AY&SYFirst Name,Last Name\n', 'utf8')],
    ['XZ archive', Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 0x00, 0x01])],
    ['Zstandard archive', Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 0x41, 0x42, 0x43])],
    ['LZ4 frame', Buffer.from([0x04, 0x22, 0x4d, 0x18, 0x60, 0x40, 0x82, 0x00])],
    ['Microsoft CAB', Buffer.from('MSCF\x00\x00\x00\x00First Name,Last Name\n', 'binary')],
    ['7z archive', Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x01, 0x04])],
    ['RAR archive', Buffer.from('Rar!\x1a\x07\x01\x01First Name', 'binary')],
    ['Nested ZIP', writeZip([['inner.txt', 'hello']])],
    ['UTF-32LE BOM', Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00])],
    ['UTF-32BE BOM', Buffer.from([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x41])],
    ['Odd-length fake UTF-16 BOM', Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x42])],
    ['UTF-16 BOM + NUL code units', Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x00, 0x00, 0x42, 0x00])],
    ['Fake UTF-16LE BOM + unpaired surrogate / MPEG sync', Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00, 0x2c, 0x00])],
    ['Fake UTF-16BE BOM + C1 control code unit', Buffer.from([0xfe, 0xff, 0x00, 0x85, 0x00, 0x41, 0x00, 0x2c])],
    ['Fake UTF-16LE BOM without CSV delimiters', fakeUtf16NoDelims],
    ['High-byte invalid UTF-8 binary stream', highByteBinary],
    ['Control-byte flood', Buffer.alloc(64, 0x03)],
  ];

  for (const [label, payload] of disguises) {
    assert.throws(
      () => decodeTextBytes(payload),
      (err) => err.code === 'BINARY_FILE',
      `decodeTextBytes should reject ${label}`,
    );

    // Disguised inside a .zip as Connections.csv
    const z = writeZip([['Connections.csv', payload]]);
    const zipFile = new File([z], 'Export.zip', { type: 'application/zip' });
    await assert.rejects(
      () => runZipFile(zipFile),
      (err) => err.code === 'BINARY_FILE',
      `runZipFile(.zip) should reject ${label}`,
    );

    // Dropped directly as raw Connections.csv
    const csvFile = new File([payload], 'Connections.csv', { type: 'text/csv' });
    await assert.rejects(
      () => runCsvFiles([csvFile]),
      (err) => err.code === 'BINARY_FILE',
      `runCsvFiles([.csv]) should reject ${label}`,
    );
  }

  // Valid UTF-16LE and UTF-16BE LinkedIn CSVs with BOM succeed cleanly through both ZIP and raw CSV pipelines
  for (const bigEndian of [false, true]) {
    const u16 = encodeUtf16(VALID_CONNECTIONS_CSV, bigEndian);
    const z = writeZip([['Connections.csv', u16]]);
    const fromZip = await runZipFile(new File([z], 'Export.zip'));
    assert.equal(fromZip.report.stats.connections, 2);

    const fromRaw = await runCsvFiles([new File([u16], 'Connections.csv')]);
    assert.equal(fromRaw.report.stats.connections, 2);
  }

  // Legacy Windows-1252 / ISO-8859-1 accented CSV (sparse high bytes) continues to decode cleanly
  const win1252Csv = Buffer.from(
    'First Name,Last Name,URL,Company,Position,Connected On\nJos\xe9,Garc\xeda,https://www.linkedin.com/in/jose-garcia,Caf\xe9 Labs,Lead Engineer,15 Mar 2024\n',
    'latin1',
  );
  const fromWin1252 = await runCsvFiles([new File([win1252Csv], 'Connections.csv')]);
  assert.equal(fromWin1252.report.stats.connections, 1);
  assert.equal(fromWin1252.report.people[0].name, 'José García');
});

// ============================================================================
// 3. CSV BOMBS, DECOY FILES & LINEAR-TIME REDOS / O(N) MODEL PROOF
// ============================================================================

test('security/csv & loader: column/cell/total-cell bombs, headerless decoys, nested decoy shadowing, and file floods are blocked', async () => {
  // 1. Wide single-row comma bomb (> 256 columns)
  assert.throws(
    () => parseCsv('a,'.repeat(300) + 'b\n'),
    (err) => err.code === 'CSV_LIMIT',
  );

  // 2. Single-cell memory bomb (> 131,072 chars)
  assert.throws(
    () => parseCsv(`First Name,Last Name\n"${'A'.repeat(140000)}",Walker\n`),
    (err) => err.code === 'CSV_LIMIT',
  );

  // 3. Total-cells cap
  assert.throws(
    () => parseCsv('c1,c2,c3,c4,c5\n' + '1,2,3,4,5\n'.repeat(40), {}, { maxTotalCells: 100 }),
    (err) => err.code === 'CSV_LIMIT',
  );

  // 4. Random HTML or text file renamed to Connections.csv (0 LinkedIn columns) -> NOT_LINKEDIN
  for (const bogus of ['<!DOCTYPE html><html><body>Hello</body></html>', 'just some plain text notes\nline two']) {
    const f = new File([bogus], 'Connections.csv', { type: 'text/csv' });
    await assert.rejects(
      () => runCsvFiles([f]),
      (err) => err.code === 'NOT_LINKEDIN',
    );
  }

  // 5. Shallowest-first detectFiles: nested decoy never shadows root LinkedIn CSV
  const detected = detectFiles(['zzz/nested/Connections.csv', 'Connections.csv', 'sub/a/b/messages.csv', 'sub/messages.csv']);
  assert.equal(detected.connections, 'Connections.csv');
  assert.equal(detected.messages, 'sub/messages.csv');

  // 6. >64 raw CSV files flood rejected immediately
  const flood = Array.from({ length: 65 }, (_, i) => new File([VALID_CONNECTIONS_CSV], `Connections_${i}.csv`));
  await assert.rejects(
    () => runCsvFiles(flood),
    (err) => err.code === 'ZIP_LIMIT',
  );
});

test('security/redos & complexity: linear O(N) companyKey, cleanText, isLinkedInArchiveName, and buildModel defeat pathological inputs in milliseconds', () => {
  const t0 = performance.now();
  const tortureCompany = `Northstar ${'ltd sti inc llc gmbh corp '.repeat(60)}X`;
  for (let i = 0; i < 200; i++) {
    const key = companyKey(tortureCompany);
    assert.ok(key.startsWith('northstar'));
  }
  const companyElapsed = performance.now() - t0;
  assert.ok(companyElapsed < 1500, `companyKey took ${companyElapsed.toFixed(1)}ms (expected < 1500ms)`);

  const t1 = performance.now();
  const unclosedTags = '<'.repeat(40000) + 'div attr="unclosed" ' + '<p>Safe text</p>';
  const cleaned = cleanText(unclosedTags);
  const cleanElapsed = performance.now() - t1;
  assert.ok(cleaned.includes('Safe text'));
  assert.ok(cleanElapsed < 1500, `cleanText took ${cleanElapsed.toFixed(1)}ms (expected < 1500ms)`);

  // Pathological archive filename (previously triple-.* regex)
  const t2 = performance.now();
  const longBadName = `${'linkedin_data_export_'.repeat(1000)}.txt`;
  assert.equal(isLinkedInArchiveName(longBadName), false);
  assert.equal(isLinkedInArchiveName('Basic_LinkedInDataExport_10-30-2026.zip'), true);
  assert.equal(isLinkedInArchiveName('Complete_LinkedInDataExport_10-30-2026 (1).ZIP'), true);
  const nameElapsed = performance.now() - t2;
  assert.ok(nameElapsed < 300, `isLinkedInArchiveName took ${nameElapsed.toFixed(1)}ms (expected < 300ms)`);

  // Pathological 60,000 URL-less unique senders in a single conversation thread (previously O(N^2) >10s freeze)
  const t3 = performance.now();
  const msgs = new Array(60000);
  for (let i = 0; i < 60000; i++) {
    msgs[i] = {
      conversationId: '2-megathread',
      title: 'Megathread',
      from: `Participant ${i}`,
      senderUrl: '',
      to: ['Casey Rivera'],
      recipientUrls: [],
      date: 1700000000000 + i * 1000,
      subject: '',
      content: 'hi',
      folder: 'INBOX',
    };
  }
  const model = buildModel({
    profile: { name: 'Casey Rivera', headline: '' },
    connections: [],
    messages: msgs,
    invitations: [],
  }, { name: 'Casey Rivera', slugs: [] });
  const modelElapsed = performance.now() - t3;
  assert.equal(model.conversations[0].isGroup, true);
  assert.ok(modelElapsed < 3000, `buildModel(60k URL-less rows) took ${modelElapsed.toFixed(1)}ms (expected < 3000ms)`);
});

// ============================================================================
// 4. BIDI SPOOFING, URL OPEN-REDIRECTS & STORAGE SCHEMA POISONING
// ============================================================================

test('security/sanitization: Unicode Bidi overrides, HTML-entity Bidi escapes, LinkedIn open-redirects, and poisoned IndexedDB reports are neutralized', async () => {
  // 1. Bidi RLO (U+202E) extension spoofing & HTML entity Bidi escapes
  const spoofedFilename = 'LinkedIn_Export_\u202epiz.exe';
  assert.equal(sanitizeFileName(spoofedFilename).includes('\u202e'), false);
  assert.equal(sanitizeFileName('../../evil/\u202e\x07Export.zip'), 'Export.zip');
  assert.equal(cleanInline('Alice\u202e \u2066Walker\u2069\x00'), 'Alice Walker');
  assert.equal(cleanText('Hello &#x202e;world&#8238; &#0;test').includes('\u202e'), false);
  assert.equal(stripUnsafeChars('\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069'), '');

  // 2. safeLinkedInUrl blocks open-redirects, non-profile paths, credentials, ports, HTTP, and lookalikes
  const blockedUrls = [
    'https://www.linkedin.com/redir/redirect?url=https://evil.example',
    'https://www.linkedin.com/safety/go?url=https://evil.example',
    'https://www.linkedin.com/in/../../uas/logout',
    'https://www.linkedin.com/company/northstar',
    'https://attacker:secret@www.linkedin.com/in/alice-walker',
    'https://www.linkedin.com:8443/in/alice-walker',
    'http://www.linkedin.com/in/alice-walker',
    'https://evil-linkedin.com/in/alice-walker',
    'https://www.linkedin.com.evil.example/in/alice-walker',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ];
  for (const bad of blockedUrls) {
    assert.equal(safeLinkedInUrl(bad), null, `safeLinkedInUrl must block ${bad}`);
  }
  assert.equal(
    safeLinkedInUrl('https://www.linkedin.com/in/alice-walker/?trk=public_profile#evil'),
    'https://www.linkedin.com/in/alice-walker/',
  );
  assert.equal(
    safeLinkedInUrl('https://tr.linkedin.com/in/nayri-akbuga'),
    'https://tr.linkedin.com/in/nayri-akbuga',
  );

  // 3. threadUrl bounds conversation IDs and returns null on malformed/oversized IDs
  assert.equal(threadUrl('2-abc_123'), 'https://www.linkedin.com/messaging/thread/2-abc_123/');
  assert.equal(threadUrl('a'.repeat(200)), null);
  assert.equal(threadUrl('../escape'), null);

  // 4. loadExport drops Bidi chars and caps metadata length
  const longCompany = 'N'.repeat(600);
  const archive = await loadExport(new Map([
    ['Connections.csv', async () => `First Name,Last Name,URL,Company,Position,Connected On\nAlice\u202e,Walker,https://www.linkedin.com/in/alice,${longCompany},Engineer,15 Mar 2024`],
  ]));
  assert.equal(archive.connections[0].name, 'Alice Walker');
  assert.equal(archive.connections[0].company.length, 240);

  // 5. Poisoned IndexedDB reports are rejected and purged on loadSaved()
  const now = Date.now();
  const validReport = {
    version: 2,
    isSample: false,
    createdAt: now - 1000,
    expiresAt: now + 86400000,
    me: { name: 'Alice Walker', headline: '' },
    stats: { connections: 1 },
    people: [{ key: 'alice', name: 'Alice Walker' }],
    recruiters: [],
    replies: [],
    reconnect: [],
    topCompanies: [],
  };
  assert.equal(isValidSavedReport(validReport, now), true);
  assert.equal(isValidSavedReport({ ...validReport, isSample: true }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, version: 1 }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, expiresAt: now + 365 * 86400000 }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, people: [null] }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, replies: [{ convId: '1' }] }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, topCompanies: [null] }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, topCompanies: [{ name: 'Northstar', count: -1 }] }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, stats: { connections: 'corrupted' } }, now), false);
  assert.equal(isValidSavedReport({ ...validReport, warnings: [123] }, now), false);

  const mem = new Map();
  const origGet = store.get;
  const origSet = store.set;
  const origClear = store.clearAll;
  store.get = async (k) => mem.get(k);
  store.set = async (k, v) => { mem.set(k, v); return true; };
  store.clearAll = async () => { mem.clear(); };
  try {
    await store.set('report', { version: 2, people: 'corrupted-not-an-array' });
    assert.equal(await loadSaved(), false);
    assert.equal(await store.get('report'), undefined);

    await store.set('report', validReport);
    await store.set('marks', JSON.parse('{"__proto__":{"polluted":true},"rep:1":{"state":"done","at":1},"badNull":null,"badArr":[1],"badState":{"state":"evil","at":1}}'));
    assert.equal(await loadSaved(), true);
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.getPrototypeOf(app.marks), null);
    assert.equal(app.marks['rep:1'].state, 'done');
    assert.equal(app.marks.badNull, undefined);
    assert.equal(app.marks.badArr, undefined);
    assert.equal(app.marks.badState, undefined);
    assert.equal(hiddenCount('rep'), 0);
  } finally {
    store.get = origGet;
    store.set = origSet;
    store.clearAll = origClear;
  }
});

// ============================================================================
// 5. COMPREHENSIVE TECHNICAL, SEMANTIC, SOCIAL & STRUCTURED-DATA SEO AUDIT
// ============================================================================

function extractVisibleText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeadings(html) {
  const body = html.replace(/<head[\s\S]*?<\/head>/i, '');
  return [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: m[2].replace(/<[^>]+>/g, '').trim(),
  }));
}

test('seo: robots.txt and sitemap.xml pass crawler directives, canonical URLs, and dist allowlist checks', () => {
  assert.ok(DIST_ALLOWLIST.includes('robots.txt'), 'robots.txt must be in DIST_ALLOWLIST');
  assert.ok(DIST_ALLOWLIST.includes('sitemap.xml'), 'sitemap.xml must be in DIST_ALLOWLIST');
  assert.ok(DIST_ALLOWLIST.includes('assets/img/apple-touch-icon.png'), 'apple-touch-icon.png must be in DIST_ALLOWLIST');

  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent:\s*\*$/m);
  assert.match(robots, /^Allow:\s*\/$/m);
  assert.match(robots, /^Sitemap:\s*https:\/\/replydebt\.github\.io\/sitemap\.xml$/m);

  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [
    'https://replydebt.github.io/',
    'https://replydebt.github.io/privacy.html',
  ]);
  assert.equal(sitemap.includes('404.html'), false, 'noindex 404.html must never appear in sitemap.xml');
  const lastmods = [...sitemap.matchAll(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)];
  assert.equal(lastmods.length, locs.length);
});

test('seo: index.html, privacy.html, and 404.html pass Semrush, Ahrefs, and Lighthouse technical & social SEO audits', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const privacyHtml = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  const notFoundHtml = fs.readFileSync(path.join(root, '404.html'), 'utf8');

  // Verify physical og-image.png dimensions match og:image:width (1200) and og:image:height (627)
  const ogPng = fs.readFileSync(path.join(root, 'assets', 'img', 'og-image.png'));
  assert.deepEqual([...ogPng.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ogWidth = ogPng.readUInt32BE(16);
  const ogHeight = ogPng.readUInt32BE(20);
  assert.equal(ogWidth, 1200);
  assert.equal(ogHeight, 627);
  assert.ok(ogPng.byteLength < 250 * 1024, 'og-image.png should stay lightweight (<250 KB)');

  // Verify physical apple-touch-icon.png is a valid 180x180 PNG (iOS Safari rejects SVG apple-touch-icon)
  const touchPng = fs.readFileSync(path.join(root, 'assets', 'img', 'apple-touch-icon.png'));
  assert.deepEqual([...touchPng.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(touchPng.readUInt32BE(16), 180);
  assert.equal(touchPng.readUInt32BE(20), 180);
  assert.ok(touchPng.byteLength < 32 * 1024, 'apple-touch-icon.png should stay lightweight (<32 KB)');

  const indexablePages = [
    { file: 'index.html', html: indexHtml, canonical: 'https://replydebt.github.io/', minWords: 250 },
    { file: 'privacy.html', html: privacyHtml, canonical: 'https://replydebt.github.io/privacy.html', minWords: 400 },
  ];

  const titles = new Set();
  const descriptions = new Set();

  for (const { file, html, canonical, minWords } of indexablePages) {
    assert.match(html, /^<!DOCTYPE html>/i);
    assert.match(html, /<html\s+lang="en"/i);
    assert.match(html, /<meta\s+charset="utf-8">/i);
    assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1,\s*viewport-fit=cover">/i);

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    assert.ok(titleMatch, `${file} missing <title>`);
    const decodedTitle = titleMatch[1].replace(/&amp;/g, '&').trim();
    assert.ok(decodedTitle.length >= 30 && decodedTitle.length <= 60, `${file} title length ${decodedTitle.length} outside [30, 60]`);
    titles.add(decodedTitle);

    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    assert.ok(descMatch, `${file} missing meta description`);
    const decodedDesc = descMatch[1].replace(/&amp;/g, '&').trim();
    assert.ok(decodedDesc.length >= 120 && decodedDesc.length <= 160, `${file} meta description length ${decodedDesc.length} outside [120, 160]`);
    descriptions.add(decodedDesc);

    assert.match(html, /<meta\s+name="robots"\s+content="index,\s*follow/i);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `${file} canonical mismatch`);
    assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${canonical}">`), `${file} missing hreflang="en"`);
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${canonical}">`), `${file} missing hreflang="x-default"`);

    // Keyboard skip-link present in static HTML
    assert.match(html, /<a\s+class="skip-link"\s+href="#main">/i, `${file} missing .skip-link`);

    // Complete Open Graph + Twitter Card metadata (including og:image:secure_url)
    for (const prop of ['og:type', 'og:locale', 'og:site_name', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:secure_url', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt']) {
      assert.ok(html.includes(`property="${prop}"`), `${file} missing ${prop}`);
    }
    for (const tw of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
      assert.ok(html.includes(`name="${tw}"`), `${file} missing ${tw}`);
    }

    // Sequential heading tree starting at single <h1>
    const headings = extractHeadings(html);
    assert.ok(headings.length >= 3, `${file} should have semantic section headings`);
    assert.equal(headings[0].level, 1, `${file} first heading must be <h1>`);
    assert.equal(headings.filter((h) => h.level === 1).length, 1, `${file} must have exactly one <h1>`);
    for (let i = 1; i < headings.length; i++) {
      assert.ok(
        headings[i].level <= headings[i - 1].level + 1,
        `${file} skips heading level from h${headings[i - 1].level} to h${headings[i].level}`,
      );
    }

    // Semrush word count & text-to-HTML ratio thresholds
    const text = extractVisibleText(html);
    const words = text.split(/\s+/).filter(Boolean);
    assert.ok(words.length >= minWords, `${file} crawlable word count ${words.length} < ${minWords}`);
    const ratio = Buffer.byteLength(text, 'utf8') / Buffer.byteLength(html, 'utf8');
    assert.ok(ratio >= 0.15, `${file} text-to-HTML ratio ${(ratio * 100).toFixed(1)}% < 15%`);
  }

  // Unique titles & descriptions across pages
  assert.equal(titles.size, indexablePages.length, 'each indexable page must have a unique <title>');
  assert.equal(descriptions.size, indexablePages.length, 'each indexable page must have a unique meta description');

  // Schema.org Microdata entities
  assert.ok(indexHtml.includes('itemtype="https://schema.org/SoftwareApplication"'));
  assert.ok(indexHtml.includes('itemtype="https://schema.org/FAQPage"'));
  assert.equal([...indexHtml.matchAll(/itemtype="https:\/\/schema\.org\/Question"/g)].length, 4);
  assert.equal([...indexHtml.matchAll(/itemtype="https:\/\/schema\.org\/Answer"/g)].length, 4);
  assert.ok(privacyHtml.includes('itemtype="https://schema.org/WebPage"'));

  // Non-render-blocking app bundle script
  assert.match(indexHtml, /<script\s+src="assets\/app\.bundle\.js"\s+defer><\/script>/);

  // 404.html must be noindex, follow with single h1
  assert.match(notFoundHtml, /<meta\s+name="robots"\s+content="noindex,\s*follow">/i);
  assert.equal(extractHeadings(notFoundHtml).length, 1);
  assert.equal(extractHeadings(notFoundHtml)[0].level, 1);

  // Image CLS & alt audit + PNG apple-touch-icon + canonical root trailing slash + internal asset existence + external rel="noopener noreferrer" across all HTML pages
  for (const [file, html] of [['index.html', indexHtml], ['privacy.html', privacyHtml], ['404.html', notFoundHtml]]) {
    assert.match(html, /<link\s+rel="apple-touch-icon"\s+sizes="180x180"\s+href="\/?assets\/img\/apple-touch-icon\.png">/i, `${file} must point apple-touch-icon to 180x180 PNG`);
    assert.equal(html.includes('href="https://replydebt.github.io"'), false, `${file} must use canonical trailing-slash https://replydebt.github.io/`);
    for (const imgMatch of html.matchAll(/<img\b([^>]*)>/gi)) {
      const attrs = imgMatch[1];
      assert.match(attrs, /\balt="[^"]+"/i, `${file} <img> must have non-empty alt text`);
      assert.match(attrs, /\bwidth="\d+"/i, `${file} <img> must have explicit width`);
      assert.match(attrs, /\bheight="\d+"/i, `${file} <img> must have explicit height`);
    }
    for (const extMatch of html.matchAll(/<a\b([^>]*\btarget="_blank"[^>]*)>/gi)) {
      assert.match(extMatch[1], /\brel="noopener noreferrer"/i, `${file} target="_blank" link missing rel="noopener noreferrer"`);
    }
    for (const refMatch of html.matchAll(/\b(?:href|src)="([^"#?]+)"/gi)) {
      const ref = refMatch[1];
      if (/^https?:\/\//i.test(ref) || ref === './' || ref === '/') continue;
      const diskPath = path.join(root, ref.replace(/^\//, ''));
      assert.ok(fs.existsSync(diskPath), `${file} references missing local asset/page "${ref}"`);
    }
  }
});
