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
  assert.equal(data.invitations.length, 3);
  assert.equal(data.quarantinedCount, 2);
  for (const k of ['connections', 'invitations', 'messages', 'profile', 'positions', 'companyFollows', 'credibility', 'inferences', 'adTargeting', 'reactions', 'shares', 'comments', 'searchQueries']) {
    assert.ok(data.found.includes(k), `expected sample export to detect ${k}`);
  }
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

test('complete export: decodes credibility scores, persona, social capital warmth, followed companies, and strictly quarantines sensitive PII/IP/prose', async () => {
  const report = await sampleReport();
  assert.equal(report.version, 3);
  assert.equal(report.insights.coverage.isComplete, true);
  assert.equal(report.insights.coverage.quarantinedFiles, 2);

  // Credibility & 5-pillar specialty decoding
  const cred = report.insights.credibility;
  assert.ok(cred);
  assert.equal(cred.notabilityTier, 2);
  assert.equal(cred.notabilityScore, 2.38);
  assert.equal(cred.notabilityDelta, 0.24);
  assert.equal(cred.pillars.length, 2);
  assert.equal(cred.pillars[0].topic, 'Design Systems');
  assert.equal(cred.pillars[0].weakest, 'Content & output');
  assert.equal(cred.topTopics[0].topic, 'Design Systems');
  assert.ok(cred.risingTopics.some((t) => t.topic === 'Design Tokens'));

  // Persona & Ad Targeting minimization
  const persona = report.insights.persona;
  assert.ok(persona);
  assert.equal(persona.inferences.length, 3, 'Inferred personal characteristics must be excluded');
  assert.ok(persona.jobTitles.includes('Design Systems Lead'), 'duplicate Job Titles column must coalesce');
  assert.equal(persona.openToRecruiters, true);
  assert.equal(persona.listedSkillCount, 10);

  // Social capital enrichment & Followed target companies
  const emma = report.people.find((p) => p.name === 'Emma Collins');
  assert.equal(emma.recReceived, true);
  assert.equal(emma.endorsedMe, 3);
  assert.equal(emma.endorsedThem, 1);
  const marco = report.people.find((p) => p.name === 'Marco Bianchi');
  assert.equal(marco.sharedCompany, 'Kestrel Bank');
  assert.equal(marco.recGiven, true);

  assert.equal(report.followedCompanies.length, 5);
  assert.ok(report.followedCompanies.some((c) => c.name === 'Lumen Labs' && c.followed));
  assert.equal(report.insights.social.outboundPending, 2);
  assert.equal(report.insights.social.outboundStale90d, 2);

  // Activity footprint
  const act = report.insights.activity;
  assert.equal(act.sharesTotal, 14);
  assert.equal(act.commentsTotal, 38);
  assert.equal(act.reactionsTotal, 72);
  assert.equal(act.searchesTotal, 24);
  assert.ok(act.hashtags.includes('designsystems'));

  // Strict quarantine & prose-exclusion proof on member-ID-suffixed Complete export files
  const { analyzeSession } = await import('../assets/js/analyze/index.js');
  const CANARY_SEARCH = 'CANARY_RAW_SEARCH_QUERY_9012';
  const CANARY_POST = 'CANARY_RAW_POST_COMMENTARY_8123';
  const CANARY_COMMENT = 'CANARY_RAW_COMMENT_PROSE_7234';
  const CANARY_REC = 'CANARY_RAW_RECOMMENDATION_TEXT_6345';
  const CANARY_AGE = 'CANARY_AGE_35_TO_54';
  const CANARY_GENDER = 'CANARY_GENDER_VALUE';
  const CANARY_PERSONAL = 'CANARY_PERSONAL_DEMOGRAPHIC';

  const lazyFiles = new Map([
    ['Connections.csv', async () => 'First Name,Last Name,URL,Company,Position,Connected On\nEmma,Collins,https://www.linkedin.com/in/emma-c,Lumen Labs,Product Manager,14 Jan 2024\n'],
    ['Recommendations_Received.csv', async () => `First Name,Last Name,Company,Job Title,Text,Creation Date,Status\nEmma,Collins,Lumen Labs,Product Manager,${CANARY_REC},"10/14/24, 9:00 AM",VISIBLE\n`],
    ['Ad_Targeting.csv', async () => `Member Age,Member Gender,Years of Experience,Job Seniorities\n${CANARY_AGE},${CANARY_GENDER},8 to 12 years,Senior\n`],
    ['Inferences_about_you.csv', async () => `Category,Type of inference,Description,Inference\nInferred personal characteristics,${CANARY_PERSONAL},desc,${CANARY_PERSONAL}\nCareer,Senior IC,desc,True\n`],
    ['Shares_714042524.csv', async () => `Date,ShareLink,ShareCommentary,Visibility\n2026-10-10 10:00:00 UTC,https://www.linkedin.com/feed/1,${CANARY_POST},PUBLIC\n`],
    ['Comments_714042524.csv', async () => `Date,Link,Message\n2026-10-11 10:00:00 UTC,https://www.linkedin.com/feed/2,${CANARY_COMMENT}\n`],
    ['Reactions_714042524.csv', async () => 'Date,Type,Link\n2026-10-12 10:00:00 UTC,PRAISE,https://www.linkedin.com/feed/3\n'],
    ['SearchQueries.csv', async () => `Time,Search Query\n2026/10/13 10:00:00 UTC,${CANARY_SEARCH}\n`],
  ]);

  const quarantinedPaths = [
    'Email Addresses.csv',
    'PhoneNumbers.csv',
    'Whatsapp Phone Numbers.csv',
    'Receipts_v2.csv',
    'Verifications/Verifications.csv',
    'Logins.csv',
    'Security Challenges.csv',
    'Registration.csv',
    'Notes.csv',
  ];
  for (const qp of quarantinedPaths) {
    lazyFiles.set(qp, async () => assert.fail(`Quarantined sensitive file "${qp}" must never be decompressed or read`));
  }

  const loaded = await loadExport(lazyFiles);
  assert.equal(loaded.quarantinedCount, quarantinedPaths.length);
  const session = analyzeSession(loaded, { now: NOW });
  const dump = JSON.stringify(session);
  for (const secret of [CANARY_SEARCH, CANARY_POST, CANARY_COMMENT, CANARY_REC, CANARY_AGE, CANARY_GENDER, CANARY_PERSONAL]) {
    assert.equal(dump.includes(secret), false, `Excluded secret "${secret}" leaked into session/report`);
  }
  assert.equal(session.report.insights.activity.reactionsTypes?.[0]?.type || session.report.insights.activity.reactionTypes[0].type, 'PRAISE');
});
