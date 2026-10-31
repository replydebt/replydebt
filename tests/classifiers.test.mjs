import test from 'node:test';
import assert from 'node:assert/strict';
import { fold } from '../assets/js/core/text.js';
import { loadExport } from '../assets/js/core/loader.js';
import { analyzeSession } from '../assets/js/analyze/index.js';
import { recruiterScore, guessCompany } from '../assets/js/analyze/recruiters.js';
import { isClosingMessage } from '../assets/js/analyze/replies.js';

test('classifiers: multilingual (EN/TR/DE/FR) recruiter outreach positives vs HR/congrats/job-seeker/sales negatives', () => {
  const positives = [
    {
      label: 'EN recruiter title + role outreach',
      position: 'Senior Technical Recruiter',
      text: 'Hi Alex, we have an open Staff Engineer role on our platform team. Would you be open to a quick chat?',
      inmail: false,
      invite: false,
    },
    {
      label: 'EN invitation note without title',
      position: '',
      text: 'Hi Alex, I lead engineering hiring at NordCloud and would love to connect about an open Principal Backend Engineer position. Open to a conversation?',
      inmail: false,
      invite: true,
    },
    {
      label: 'TR recruiter outreach',
      position: 'İnsan Kaynakları ve Yetenek Kazanımı Uzmanı',
      text: 'Merhaba, ekibimize katılacak Senior Frontend Engineer açık pozisyon arayışımız için mülakat planlamak isteriz.',
      inmail: false,
      invite: false,
    },
    {
      label: 'DE recruiter outreach',
      position: 'Talent Acquisition Partner',
      text: 'Hallo, wir suchen aktuell für eine offene Stelle als Senior Product Designer. Sind Sie wechselbereit für ein kurzes Gespräch?',
      inmail: false,
      invite: false,
    },
    {
      label: 'FR recruiter outreach',
      position: 'Chargée de recrutement tech',
      text: 'Bonjour, nous recrutons pour un poste à pourvoir de Staff Engineer. Seriez-vous à l\'écoute du marché pour un entretien ?',
      inmail: false,
      invite: false,
    },
  ];

  for (const p of positives) {
    const s = recruiterScore({ position: p.position, folded: fold(p.text), inmail: p.inmail, invite: p.invite });
    assert.ok(s >= 4, `expected positive >= 4 for "${p.label}", got ${s}`);
  }

  const negatives = [
    {
      label: 'HR title sending casual social greeting',
      position: 'HR Manager',
      text: 'Great meeting you at the design conference yesterday! Let us keep in touch.',
      inmail: false,
      invite: true,
    },
    {
      label: 'EN new-role congratulations from Talent Partner',
      position: 'Talent Partner',
      text: 'Congratulations on your new role at Lumen Labs! Wishing you all the best.',
      inmail: false,
      invite: false,
    },
    {
      label: 'TR new-role congratulations',
      position: 'İşe Alım Uzmanı',
      text: 'Tebrikler, yeni pozisyonun hayırlı olsun! Başarılar dilerim.',
      inmail: false,
      invite: false,
    },
    {
      label: 'DE new-role congratulations',
      position: 'Personalberater',
      text: 'Herzlichen Glückwunsch zur neuen Stelle bei Acme!',
      inmail: false,
      invite: false,
    },
    {
      label: 'FR new-role congratulations',
      position: 'Recruteur',
      text: 'Félicitations pour ton nouveau poste chez Vela !',
      inmail: false,
      invite: false,
    },
    {
      label: 'EN inbound job seeker asking for referral',
      position: 'Software Engineer',
      text: 'Hi Alex, I saw your team is hiring for an open Senior Designer role. Attached is my CV, could you refer me?',
      inmail: false,
      invite: true,
    },
    {
      label: 'TR inbound job seeker sharing CV',
      position: 'Frontend Developer',
      text: 'Merhaba, aktif olarak iş arıyorum. Özgeçmişimi paylaşıyorum, açık pozisyon için referans olabilir misin?',
      inmail: false,
      invite: true,
    },
    {
      label: 'B2B SaaS sales pitch',
      position: 'Account Executive',
      text: 'Book a 15-minute call for a free demo of our lead generation platform! Special pricing quote and free trial available.',
      inmail: true,
      invite: false,
    },
  ];

  for (const n of negatives) {
    const s = recruiterScore({ position: n.position, folded: fold(n.text), inmail: n.inmail, invite: n.invite });
    assert.ok(s < 4, `expected negative < 4 for "${n.label}", got ${s}`);
  }
});

test('guessCompany: extracts explicit recruiter employer while rejecting tech stack words, weekdays, multi-line bleed, candidate employer, and owner employer', () => {
  assert.equal(guessCompany('We loved your experience with React and TypeScript. Are you free on Monday?'), '');
  assert.equal(guessCompany('Hi Alex, I am a Technical Recruiter at Stripe reaching out about a role.'), 'Stripe');
  assert.equal(guessCompany('Reaching out on behalf of Linear regarding a Staff Engineer role.'), 'Linear');
  assert.equal(
    guessCompany('Hi Alex, I\'m a Technical Recruiter at Linear\nWould you be open to a quick chat this week?'),
    'Linear',
  );
  assert.equal(
    guessCompany('Impressed by your role at PreviousCo! We\'re hiring at TargetCo for a Staff Engineer.'),
    'TargetCo',
  );
  assert.equal(
    guessCompany('Hi Alex, we are hiring at NordCloud Remote for our platform engineering team.'),
    'NordCloud',
  );
  assert.equal(
    guessCompany('I\'m a Technical Recruiter at Acme Global. Would love to connect.'),
    'Acme Global',
  );
  assert.equal(
    guessCompany('Hi Alex, your work as a Staff Designer at Acme stood out!', {
      meName: 'Alex Morgan',
      meHeadline: 'Staff Designer at Acme',
    }),
    '',
  );
});

test('deduplication & cross-thread reply suppression: one row per person and answered newer threads suppress old ones', async () => {
  const rawFiles = [
    ['Profile.csv', 'First Name,Last Name,Headline\nAlex,Morgan,Product Designer'],
    ['Connections.csv', [
      'First Name,Last Name,URL,Company,Position,Connected On',
      'Sam,Recruiter,https://www.linkedin.com/in/sam-rec,Vela,Talent Partner,10 Jan 2024',
      'Dana,Colleague,https://www.linkedin.com/in/dana-col,Lumen,Engineer,12 Feb 2023',
    ].join('\n')],
    ['messages.csv', [
      'CONVERSATION ID,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT',
      // Recruiter Sam sends TWO separate threads -> must deduplicate to 1 recruiter row
      '2-rec1,Sam Recruiter,https://www.linkedin.com/in/sam-rec,Alex Morgan,https://www.linkedin.com/in/alex-morgan,2026-08-01 10:00:00 UTC,,Hi Alex we are hiring for an open Senior Designer role at Vela',
      '2-rec2,Sam Recruiter,https://www.linkedin.com/in/sam-rec,Alex Morgan,https://www.linkedin.com/in/alex-morgan,2026-09-15 10:00:00 UTC,,Following up on the open Senior Designer role and interview',
      // Dana has an older unanswered question in thread 1, BUT Alex messaged Dana more recently in thread 2!
      '2-old,Alex Morgan,https://www.linkedin.com/in/alex-morgan,Dana Colleague,https://www.linkedin.com/in/dana-col,2026-07-01 09:00:00 UTC,,Hey Dana',
      '2-old,Dana Colleague,https://www.linkedin.com/in/dana-col,Alex Morgan,https://www.linkedin.com/in/alex-morgan,2026-07-02 09:00:00 UTC,,Did you see the roadmap?',
      '2-new,Alex Morgan,https://www.linkedin.com/in/alex-morgan,Dana Colleague,https://www.linkedin.com/in/dana-col,2026-09-20 12:00:00 UTC,,Great catching up today Dana!',
    ].join('\n')],
    ['Invitations.csv', [
      'From,To,Sent At,Message,Direction,inviterProfileUrl,inviteeProfileUrl',
      'Sam Recruiter,Alex Morgan,07/20/26, 09:00 AM,"Hi Alex, hiring for an open Designer role at Vela, open to a chat?",INCOMING,https://www.linkedin.com/in/sam-rec,https://www.linkedin.com/in/alex-morgan',
    ].join('\n')],
  ];
  const files = new Map(rawFiles.map(([k, v]) => [k, () => v]));

  const data = await loadExport(files);
  const { report } = analyzeSession(data, { now: Date.parse('2026-10-20T00:00:00Z') });

  assert.equal(report.recruiters.length, 1, 'Sam Recruiter must appear only once across 2 threads + 1 invite');
  assert.equal(report.recruiters[0].convId, '2-rec2', 'most recent unreplied thread should be selected');
  assert.equal(report.replies.length, 0, 'Dana older thread must be suppressed because Alex wrote in a newer thread');
});

test('replies: closing sign-off detector handles skin-tone modifiers, ZWJ sequences, and TR/DE/FR sign-offs', () => {
  for (const msg of ['Thanks! 👍🏽', 'Thank you so much 🙏', 'Teşekkür ederim!', 'Vielen Dank!', 'Merci beaucoup !', '👍🏿']) {
    assert.equal(isClosingMessage(msg), true, `expected closing for "${msg}"`);
  }
  for (const msg of ['Thanks! Can you share the deck?', 'Merhaba, yarın uygun musun?']) {
    assert.equal(isClosingMessage(msg), false, `expected non-closing for "${msg}"`);
  }
});
