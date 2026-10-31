import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip, listZip } from '../assets/js/core/zip.js';
import { loadExport, looksLikeLinkedInExport } from '../assets/js/core/loader.js';
import { analyze } from '../assets/js/analyze/index.js';
import { weeklyPick } from '../assets/js/analyze/reconnect.js';
import { searchCompany } from '../assets/js/analyze/companies.js';
import { isClosingMessage } from '../assets/js/analyze/replies.js';
import { templatesFor } from '../assets/js/analyze/templates.js';
import { buildSampleExport, sampleFiles } from '../assets/js/demo/sample.js';
import { writeZip, toArrayBuffer } from '../tools/zipwriter.mjs';

const NOW = Date.UTC(2026, 9, 30, 12);
const DAY = 86400000;

async function sampleReport(now = NOW) {
  const data = await loadExport(sampleFiles(now));
  return analyze(data, { now });
}
const byName = (report) => new Map(report.people.map((p) => [p.key, p.name]));

test('zip: reads deflate and stored entries with UTF-8 content', async () => {
  const buf = writeZip(new Map([['a/messages.csv', 'x,y\nÇağrı,ünlü 👋\n'], ['b.txt', 'stored!']]), { storeNames: ['b.txt'] });
  const files = readZip(toArrayBuffer(buf));
  assert.deepEqual([...files.keys()], ['a/messages.csv', 'b.txt']);
  assert.equal(await files.get('a/messages.csv')(), 'x,y\nÇağrı,ünlü 👋\n');
  assert.equal(await files.get('b.txt')(), 'stored!');
  assert.ok(looksLikeLinkedInExport(listZip(toArrayBuffer(buf)).map((e) => e.name)));
});

test('zip: rejects non-zip input with a friendly message', () => {
  assert.throws(() => listZip(new TextEncoder().encode('not a zip at all').buffer), /not a valid \.zip/);
});

test('loader: full sample archive round-trips through a real zip', async () => {
  const zip = writeZip(buildSampleExport(NOW));
  const data = await loadExport(readZip(toArrayBuffer(zip)));
  assert.equal(data.profile.name, 'Alex Morgan');
  assert.ok(data.connections.length > 300);
  assert.ok(data.messages.length > 100);
  assert.equal(data.invitations.length, 1);
  assert.deepEqual(data.found.sort(), ['connections', 'invitations', 'messages', 'profile']);
});

test('loader: rejects an archive without LinkedIn files', async () => {
  const files = new Map([['readme.txt', async () => 'hi']]);
  await assert.rejects(loadExport(files), (e) => e.code === 'NOT_LINKEDIN');
});

test('loader: real-world file names (.zip.zip) and messages.csv variants are recognized', async () => {
  const { detectFiles } = await import('../assets/js/core/loader.js');
  const found = detectFiles(['guide_messages.csv', 'learning_coach_messages.csv', 'messages.csv', 'Connections.csv', 'Jobs/Job Seeker Preferences.csv']);
  assert.equal(found.messages, 'messages.csv');
  assert.equal(found.connections, 'Connections.csv');
  const { isLinkedInArchiveName } = await import('../assets/js/app/archive-name.js');
  assert.ok(isLinkedInArchiveName('Basic_LinkedInDataExport_10-30-2026.zip.zip'));
  assert.ok(isLinkedInArchiveName('Complete_LinkedInDataExport_10-31-2026.zip'));
  assert.ok(!isLinkedInArchiveName('Basic_LinkedInDataExport_10-30-2026.zip.crdownload'));
  assert.ok(!isLinkedInArchiveName('holiday-photos.zip'));
});

test('identity: archive owner is detected', async () => {
  const report = await sampleReport();
  assert.equal(report.me.name, 'Alex Morgan');
  assert.equal(report.me.ambiguous, false);
});

test('recruiters: finds unanswered recruiters, ignores sales pitches', async () => {
  const report = await sampleReport();
  const names = byName(report);
  const list = report.recruiters.map((r) => ({ ...r, name: names.get(r.personKey) }));
  const get = (n) => list.find((r) => r.name === n);

  assert.ok(get('Selin Aydin'), 'Selin should be detected');
  assert.equal(get('Selin Aydin').replied, false);
  assert.equal(get('Selin Aydin').company, 'Vela Payments');
  assert.ok(get('Marcus Reed'), 'InMail recruiter without connection should be detected');
  assert.ok(get('Hana Sato'));
  assert.ok(get('Jonas Weber'), 'Invitation note recruiter should be detected');
  assert.equal(get('Jonas Weber').source, 'invitation');
  assert.equal(get('Jonas Weber').company, 'Orbital Health');
  assert.equal(get('Priya Nair').replied, true);
  assert.equal(get('Kevin Brooks'), undefined, 'Sales pitch is not a recruiter');
  assert.equal(get('Tara Hughes'), undefined, 'Outsourcing pitch is not a recruiter');
  assert.equal(get('Brightpath Careers'), undefined, 'Sponsored sender without profile URL is ignored');
  // Unreplied first
  const firstReplied = list.findIndex((r) => r.replied);
  assert.ok(list.slice(firstReplied).every((r) => r.replied));
});

test('replies: owed replies are found and prioritized; closings and sales are ignored', async () => {
  const report = await sampleReport();
  const names = byName(report);
  const order = report.replies.map((r) => names.get(r.personKey));
  assert.equal(order[0], 'Emma Collins', `Emma should be first, got ${order.join(', ')}`);
  assert.equal(order.filter((n) => n === 'Emma Collins').length, 1, 'group conversations must not appear as 1:1 replies');
  for (const n of ['Daniel Kim', 'Liam Turner', 'Nora Lindqvist']) assert.ok(order.includes(n), `${n} should be in replies`);
  for (const n of ['Sofia Rossi', 'Ben Carter', 'Kevin Brooks', 'Tara Hughes', 'Victor Hale', 'Selin Aydin']) {
    assert.ok(!order.includes(n), `${n} should NOT be in replies`);
  }
});

test('replies: closing message detection', () => {
  for (const t of ['Thanks!', 'thank you so much', 'Ok 👍', '👍', 'Teşekkürler', 'Congrats!', 'Sounds good.']) assert.ok(isClosingMessage(t), t);
  for (const t of ['Thanks! Can you send the file?', 'Are you free tomorrow?']) assert.ok(!isClosingMessage(t), t);
});

test('reconnect: lost-touch people ranked, weekly pick is stable within a week', async () => {
  const report = await sampleReport();
  const names = byName(report);
  const list = report.reconnect.map((r) => names.get(r.personKey));
  assert.ok(list.includes('Olivia Bennett'));
  assert.ok(list.includes('Ravi Sharma'));
  assert.ok(!list.includes('Grace Liu'), 'recently active people are excluded');
  assert.ok(!list.includes('Emma Collins'), 'people in Replies are excluded');
  const a = weeklyPick(report.reconnect, 5, NOW);
  const b = weeklyPick(report.reconnect, 5, NOW + 2 * DAY - 3600000); // same ISO week (Fri -> Sun)
  assert.equal(a.length, 5);
  assert.deepEqual(a.map((x) => x.personKey), b.map((x) => x.personKey));
});

test('companies: search merges variants and ranks the warmest path first', async () => {
  const report = await sampleReport();
  const res = searchCompany(report.people, 'lumen', NOW);
  const companyNames = res.companies.map((c) => c.name);
  assert.ok(companyNames.includes('Lumen Labs') && companyNames.includes('Lumen Labs Inc.'));
  assert.equal(res.people[0].name, 'Emma Collins');
  assert.ok(report.topCompanies[0].count >= report.topCompanies[1].count);
  assert.equal(searchCompany(report.people, 'x', NOW).people.length, 0);
});

test('insights: stats are consistent', async () => {
  const report = await sampleReport();
  const s = report.stats;
  assert.ok(s.connections > 300);
  assert.ok(s.neverMessagedPct > 50 && s.neverMessagedPct < 100);
  assert.equal(s.recruitersUnreplied, report.recruiters.filter((r) => !r.replied).length);
});

test('templates: variables are filled', () => {
  const [t] = templatesFor('recruiter', { name: 'Selin Aydin', company: 'Vela Payments' }, { me: 'Alex Morgan', date: Date.UTC(2026, 2, 1) });
  assert.match(t.text, /^Hi Selin,/);
  assert.match(t.text, /at Vela Payments/);
  assert.match(t.text, /Alex$/);
  assert.doesNotMatch(t.text, /\{\w+\}/);
});
