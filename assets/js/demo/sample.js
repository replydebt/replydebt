// Synthetic LinkedIn export used by "Try sample data" and automated tests.
// Produces CSV text in the exact shape of official LinkedIn exports so the full pipeline runs end-to-end.
import { DAY } from '../core/time.js';
import { mulberry32 } from '../core/text.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, rows) => [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n') + '\r\n';

const pad = (n) => String(n).padStart(2, '0');
const msgDate = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
};
const slashUtcDate = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
};
const javaDate = (t) => {
  const d = new Date(t);
  return `${DAYS[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT ${d.getUTCFullYear()}`;
};
const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const connDate = (t) => {
  const d = new Date(t);
  return `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const invDate = (t) => {
  const d = new Date(t);
  let h = d.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}, ${h}:${pad(d.getUTCMinutes())} ${ap}`;
};

const FIRST = ['James', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Mia', 'Lucas', 'Isla', 'Mateo', 'Chloe', 'Leo', 'Zara', 'Arjun', 'Hana', 'Omar', 'Elif', 'Can', 'Mei', 'Tomas', 'Nina', 'Ravi', 'Lena', 'Diego', 'Sara', 'Felix', 'Amara', 'Yusuf', 'Ines', 'Kenji', 'Maya', 'Oscar', 'Leila', 'Hugo', 'Aisha', 'Erik', 'Julia', 'Kai', 'Rosa', 'Ali', 'Freya'];
const LAST = ['Smith', 'Johnson', 'Patel', 'Garcia', 'Nguyen', 'Müller', 'Yilmaz', 'Kaya', 'Rossi', 'Silva', 'Kim', 'Chen', 'Novak', 'Haddad', 'Khan', 'Dubois', 'Larsen', 'Costa', 'Okafor', 'Sato', 'Andersen', 'Moreau', 'Demir', 'Fischer', 'Ahmed', 'Lopez', 'Ivanova', 'Brown', 'Wilson', 'Taylor'];
const COMPANIES = ['Lumen Labs', 'Kestrel Bank', 'Orbital Health', 'Vela Payments', 'Cobalt Cloud', 'Northwind Traders', 'Fieldstone Studio', 'Atlas Mobility', 'Harbor & Co', 'Quanta Retail', 'Pinecrest Media', 'Brightwave', 'Tidal Energy', 'Summit Analytics', 'Nimbus Games', 'Lumen Labs Inc.'];
const TITLES = ['Product Designer', 'Senior Software Engineer', 'Product Manager', 'Engineering Manager', 'UX Researcher', 'Data Scientist', 'Marketing Lead', 'Frontend Developer', 'Head of Design', 'Content Strategist', 'Founder', 'Design Director', 'Brand Designer', 'Customer Success Manager', 'iOS Engineer'];

const CHAT_THEIRS = [
  'How did the launch go?',
  'Saw your talk recording, really well done.',
  'Are you going to Config this year?',
  'Here is the deck I mentioned.',
  'Let me know what you think about the prototype.',
  'We should grab lunch soon!',
  'Thanks for the intro to Mia, super helpful.',
  'Do you have a good resource on design tokens?',
];
const CHAT_MINE = [
  'It went well, thanks for asking!',
  'Appreciate it! It was fun to put together.',
  'Probably, will let you know.',
  'Got it, will take a look tonight.',
  'Looks great. Left a few comments.',
  'Absolutely, next week works.',
  'Glad it worked out!',
  'Sending you a couple of links now.',
];

export const SAMPLE_ME = { first: 'Alex', last: 'Morgan', headline: 'Senior Product Designer at Brightwave' };

/** Build the sample export as a Map of file path -> CSV text. */
export function buildSampleExport(now = Date.now()) {
  const rand = mulberry32(20261030);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const me = `${SAMPLE_ME.first} ${SAMPLE_ME.last}`;
  const meUrl = 'https://www.linkedin.com/in/alex-morgan-design';
  let convSeq = 1000;
  const convId = () => `2-${btoa(`sample-conversation-${convSeq++}`).replace(/=+$/, '')}==`;
  const slugify = (name, i) => `${name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '-')}-${(1000 + i).toString(36)}`;

  const connections = [];
  const messages = [];
  const invitations = [];
  const people = new Map();

  const person = (name, company, position, { connected = true, connectedAgo = 900, i } = {}) => {
    if (people.has(name)) return people.get(name);
    const idx = i ?? people.size;
    const url = `https://www.linkedin.com/in/${slugify(name, idx)}`;
    const p = { name, url, company, position };
    people.set(name, p);
    if (connected) {
      const [first, ...rest] = name.split(' ');
      connections.push([first, rest.join(' '), url, '', company, position, connDate(now - connectedAgo * DAY)]);
    }
    return p;
  };

  const convo = (p, turns, { folder = 'INBOX' } = {}) => {
    const id = convId();
    for (const t of turns) {
      const at = now - t.daysAgo * DAY - Math.floor(rand() * 6 * 3600000);
      messages.push(t.me
        ? [id, '', me, meUrl, p.name, p.url, msgDate(at), t.subject || '', t.text, folder, 'No']
        : [id, '', p.name, p.url, me, meUrl, msgDate(at), t.subject || '', t.text, folder, 'No']);
    }
    return id;
  };

  const history = (p, count, endDaysAgo, spanDays) => {
    const turns = [];
    for (let k = 0; k < count; k++) {
      const daysAgo = endDaysAgo + Math.round(spanDays * (1 - k / Math.max(1, count - 1)));
      const mine = k % 2 === 1;
      turns.push({ me: mine, daysAgo, text: mine ? pick(CHAT_MINE) : pick(CHAT_THEIRS) });
    }
    return turns;
  };

  const selin = person('Selin Aydin', 'Vela Payments', 'Senior Talent Partner', { connectedAgo: 260 });
  convo(selin, [{ me: false, daysAgo: 240, text: "Hi Alex, I'm a Talent Partner at Vela Payments. We're hiring a Lead Product Designer to own our merchant dashboard, fully remote within Europe. Would you be open to a quick chat? Happy to share the job description and salary range." }]);

  const marcus = person('Marcus Reed', '', '', { connected: false });
  convo(marcus, [
    { me: false, daysAgo: 95, subject: 'Principal Designer role, remote', text: "Hi Alex, I'm recruiting for a Series B fintech client of ours. They're looking for a Principal Product Designer and your portfolio stood out. Are you open to new opportunities? I can share details on compensation and the interview process." },
    { me: false, daysAgo: 81, subject: 'Re: Principal Designer role, remote', text: 'Just following up on my note below. The role is still open, let me know if you would like to hear more.' },
  ]);

  const priya = person('Priya Nair', 'Cobalt Cloud', 'Senior Technical Recruiter', { connectedAgo: 600 });
  convo(priya, [
    { me: false, daysAgo: 420, text: "Hi Alex! I'm hiring for a Staff Designer position on our platform team at Cobalt Cloud. Would love to tell you more if you're open to it." },
    { me: true, daysAgo: 418, text: "Thanks Priya, I'm not looking right now but let's keep in touch." },
  ]);

  const hana = person('Hana Sato', 'Nimbus Games', 'Talent Acquisition Lead', { connectedAgo: 150 });
  convo(hana, [{ me: false, daysAgo: 33, text: 'Hello Alex, I lead talent acquisition at Nimbus Games. We have a Senior UX Designer role on our new mobile title and I think your background in design systems is a great fit. Would you be interested in an interview with our Head of Design?' }]);

  const jonas = person('Jonas Weber', 'Orbital Health', 'Design Recruiter', { connected: false });
  invitations.push([jonas.name, me, invDate(now - 37 * DAY), 'Hi Alex, I lead design hiring at Orbital Health and would love to connect about an open Staff Product Designer position. Would you be open to a conversation?', 'INCOMING', jonas.url, meUrl]);

  const rachel = person('Rachel Green', 'Harbor & Co', 'People Partner', { connectedAgo: 700 });
  convo(rachel, [{ me: false, daysAgo: 520, text: "Hi Alex, we're hiring a Design Manager at Harbor & Co. Would you be open to exploring the role? I can send over the job description." }]);

  const kevin = person('Kevin Brooks', 'LeadRocket', 'Growth Consultant', { connectedAgo: 40 });
  convo(kevin, [
    { me: false, daysAgo: 38, text: 'Hi Alex, thanks for connecting! Our agency helps design studios with lead generation and SEO. Can I book a 15-minute call to show you a free demo?' },
    { me: false, daysAgo: 30, text: 'Following up: we are offering a 20% discount on our services this month. Would Tuesday work for a quick call?' },
  ]);
  const tara = person('Tara Hughes', 'OutsourceHub', 'Business Development', { connected: false });
  convo(tara, [{ me: false, daysAgo: 12, subject: 'Partnership', text: 'Hello! We provide white-label development and outsourcing for agencies. Our pricing starts at $25/hour. Do you have time for a demo?' }]);

  const emma = person('Emma Collins', 'Lumen Labs', 'Product Manager', { connectedAgo: 1500 });
  convo(emma, [
    ...history(emma, 18, 60, 700),
    { me: false, daysAgo: 21, text: "Hey Alex! Are you still planning to speak at the design meetup in December? I need to confirm the lineup by Friday, and I'd love to have you." },
  ]);

  const daniel = person('Daniel Kim', 'Fieldstone Studio', 'Frontend Developer', { connectedAgo: 1100 });
  convo(daniel, [
    ...history(daniel, 8, 90, 400),
    { me: false, daysAgo: 58, text: 'Can you send me the Figma file for the onboarding flow when you get a chance? Want to start building it next sprint.' },
  ]);

  const liam = person('Liam Turner', 'Summit Analytics', 'Head of Design', { connectedAgo: 800 });
  convo(liam, [
    { me: false, daysAgo: 300, text: 'Great meeting you at the conference!' },
    { me: true, daysAgo: 299, text: 'Likewise Liam, let us stay in touch.' },
    { me: false, daysAgo: 14, text: 'Loved your post on design systems governance. Would love to swap notes sometime, we are going through the same thing.' },
  ]);

  const nora = person('Nora Lindqvist', 'Atlas Mobility', 'Engineering Manager', { connectedAgo: 1300 });
  convo(nora, [
    ...history(nora, 6, 200, 300),
    { me: false, daysAgo: 120, text: 'Would you be willing to be a reference for me? I am interviewing for a design lead role and they asked for someone I have worked closely with.' },
  ]);

  const sofia = person('Sofia Rossi', 'Quanta Retail', 'UX Researcher', { connectedAgo: 900 });
  convo(sofia, [
    { me: false, daysAgo: 40, text: 'Do you have the research template we used last year?' },
    { me: true, daysAgo: 39, text: 'Yes! Sending it now.' },
    { me: false, daysAgo: 39, text: 'Thanks!' },
  ]);
  const ben = person('Ben Carter', 'Kestrel Bank', 'Design Director', { connectedAgo: 1000 });
  convo(ben, [
    { me: false, daysAgo: 70, text: 'Congrats on the new role!' },
    { me: true, daysAgo: 69, text: 'Thank you Ben!' },
  ]);
  const old = person('Victor Hale', 'Tidal Energy', 'Product Manager', { connectedAgo: 1400 });
  convo(old, [
    { me: true, daysAgo: 600, text: 'Hi Victor, nice to meet you.' },
    { me: false, daysAgo: 560, text: 'Are you still at Brightwave?' },
  ]);

  const olivia = person('Olivia Bennett', 'Pinecrest Media', 'Design Director', { connectedAgo: 2200 });
  convo(olivia, history(olivia, 40, 420, 900));
  const reconnectPeople = [
    ['Marco Bianchi', 'Kestrel Bank', 'Senior Product Designer', 14, 260],
    ['Aisha Okafor', 'Orbital Health', 'Product Manager', 10, 380],
    ['Kenji Watanabe', 'Nimbus Games', 'Art Director', 8, 520],
    ['Laura Schmidt', 'Lumen Labs', 'UX Writer', 12, 300],
    ['Mehmet Demir', 'Atlas Mobility', 'Engineering Manager', 16, 640],
    ['Chloe Martin', 'Harbor & Co', 'Brand Designer', 6, 210],
    ['Ravi Sharma', 'Cobalt Cloud', 'Staff Engineer', 22, 700],
    ['Ines Costa', 'Fieldstone Studio', 'Founder', 9, 450],
    ['Tom Becker', 'Summit Analytics', 'Data Scientist', 7, 330],
    ['Yara Haddad', 'Vela Payments', 'Product Designer', 11, 560],
    ['Owen Price', 'Northwind Traders', 'Marketing Lead', 5, 240],
    ['Lina Novak', 'Lumen Labs Inc.', 'Design Manager', 13, 410],
  ];
  reconnectPeople.forEach(([name, company, title, count, endAgo], k) => {
    const p = person(name, company, title, { connectedAgo: endAgo + 300 + k * 40 });
    convo(p, history(p, count, endAgo, 500));
  });

  ['Grace Liu', 'Samuel Ortiz', 'Elif Kaya'].forEach((name, k) => {
    const p = person(name, pick(COMPANIES), pick(TITLES), { connectedAgo: 500 + k * 100 });
    convo(p, history(p, 10, 5 + k * 10, 200));
  });

  const gid = convId();
  messages.push([gid, 'Design meetup organizers', 'Emma Collins', emma.url, `${me}, Liam Turner`, `${meUrl}, ${liam.url}`, msgDate(now - 25 * DAY), '', 'Can everyone confirm the venue?', 'INBOX', 'No']);

  const sid = convId();
  messages.push([sid, '', 'Brightpath Careers', '', me, meUrl, msgDate(now - 9 * DAY), 'New opportunity for you', 'Hi Alex, we are hiring! Explore open positions and apply for a role today. Are you open to new opportunities?', 'INBOX', 'No']);

  for (let i = 0; i < 320; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (people.has(name)) continue;
    const company = rand() < 0.08 ? 'Lumen Labs' : pick(COMPANIES);
    person(name, company, pick(TITLES), { connectedAgo: 30 + Math.floor(rand() * 2500), i: 5000 + i });
  }

  const notes = 'Notes:\r\n"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more here https://www.linkedin.com/help/linkedin/answer/261"\r\n\r\n';

  // Two unaccepted outgoing invitations older than 90 days for invitation-hygiene insights
  invitations.push(
    [me, 'Claire Laurent', invDate(now - 142 * DAY), 'Hi Claire, enjoyed your panel on design tokens at Config!', 'OUTGOING', meUrl, 'https://www.linkedin.com/in/claire-laurent-ux'],
    [me, 'Darius Patel', invDate(now - 196 * DAY), '', 'OUTGOING', meUrl, 'https://www.linkedin.com/in/darius-patel-pm'],
  );

  const bareUrl = (u) => String(u || '').replace(/^https?:\/\//i, '');
  const marco = people.get('Marco Bianchi');
  const ravi = people.get('Ravi Sharma');

  const d0 = isoDay(now - 2 * DAY);
  const d1 = isoDay(now - 16 * DAY);
  const d2 = isoDay(now - 45 * DAY);
  const d3 = isoDay(now - 90 * DAY);

  const credibilityRows = [
    ['Notability', '', 'Discrete Notability Tier', '0-4 integer', '2', '2', '2', '2'],
    ['Notability', '', 'Aggregated Notability Score', '0-5 float', '', '2.38', '2.26', '2.14'],
    ['Topic Credibility', 'Design Systems', 'Role and scope', '1-4 integer', '4', '4', '4', '3'],
    ['Topic Credibility', 'Design Systems', 'Tenure and experience', '1-4 integer', '4', '4', '4', '4'],
    ['Topic Credibility', 'Design Systems', 'Content and output', '1-4 integer', '2', '2', '2', '1'],
    ['Topic Credibility', 'Design Systems', 'Education and credentials', '1-4 integer', '3', '3', '3', '3'],
    ['Topic Credibility', 'Design Systems', 'Validation and influence', '1-4 integer', '4', '4', '3', '3'],
    ['Topic Credibility', 'Product Design', 'Role and scope', '1-4 integer', '4', '4', '4', '4'],
    ['Topic Credibility', 'Product Design', 'Tenure and experience', '1-4 integer', '4', '4', '4', '4'],
    ['Topic Credibility', 'Product Design', 'Content and output', '1-4 integer', '3', '3', '2', '2'],
    ['Topic Credibility', 'Product Design', 'Education and credentials', '1-4 integer', '3', '3', '3', '3'],
    ['Topic Credibility', 'Product Design', 'Validation and influence', '1-4 integer', '3', '3', '3', '3'],
    ['Topic Credibility', 'Design Systems', 'Topic Normalized Score', '1-4 float', '3.82', '3.74', '3.62', '3.54'],
    ['Topic Credibility', 'User Experience Design (UX)', 'Topic Normalized Score', '1-4 float', '3.68', '3.64', '3.59', '3.55'],
    ['Topic Credibility', 'Product Design', 'Topic Normalized Score', '1-4 float', '3.61', '3.58', '3.52', '3.49'],
    ['Topic Credibility', 'Design Tokens', 'Topic Normalized Score', '1-4 float', '3.45', '3.31', '3.12', '2.98'],
    ['Topic Credibility', 'Interaction Design', 'Topic Normalized Score', '1-4 float', '3.42', '3.34', '3.25', '3.18'],
    ['Topic Credibility', 'Web Accessibility', 'Topic Normalized Score', '1-4 float', '3.24', '3.18', '3.09', '3.02'],
    ['Topic Credibility', 'Prototyping', 'Topic Normalized Score', '1-4 float', '3.12', '3.11', '3.10', '3.09'],
    ['Topic Credibility', 'User Research', 'Topic Normalized Score', '1-4 float', '2.94', '2.92', '2.91', '2.90'],
    ['Topic Credibility', 'Frontend Architecture', 'Topic Normalized Score', '1-4 float', '2.66', '2.58', '2.50', '2.44'],
    ['Topic Credibility', 'Product Management', 'Topic Normalized Score', '1-4 float', '2.48', '2.47', '2.46', '2.45'],
  ];

  const shareRows = Array.from({ length: 14 }, (_, idx) => [
    msgDate(now - (idx * 34 + 6) * DAY),
    `https://www.linkedin.com/feed/update/urn:li:share:710000${idx}`,
    'Synthetic sample post commentary omitted during insights aggregation.',
    '',
    '',
    'MEMBER_NETWORK',
  ]);
  const commentRows = Array.from({ length: 38 }, (_, idx) => [
    msgDate(now - (idx * 14 + 2) * DAY),
    `https://www.linkedin.com/feed/update/urn:li:activity:720000${idx}`,
    'Synthetic sample comment prose omitted during insights aggregation.',
  ]);
  const reactionPalette = ['LIKE', 'LIKE', 'LIKE', 'PRAISE', 'INTEREST', 'INTEREST', 'EMPATHY', 'APPRECIATION', 'ENTERTAINMENT'];
  const reactionRows = Array.from({ length: 72 }, (_, idx) => [
    msgDate(now - (idx * 7 + 1) * DAY),
    reactionPalette[idx % reactionPalette.length],
    `https://www.linkedin.com/feed/update/urn:li:activity:730000${idx}`,
  ]);
  const searchRows = Array.from({ length: 24 }, (_, idx) => [
    slashUtcDate(now - (idx * 11 + 3) * DAY),
    'synthetic query excluded',
  ]);

  const files = new Map();
  files.set('Profile.csv', csv(
    ['First Name', 'Last Name', 'Maiden Name', 'Address', 'Birth Date', 'Headline', 'Summary', 'Industry', 'Zip Code', 'Geo Location', 'Twitter Handles', 'Websites', 'Instant Messengers'],
    [[SAMPLE_ME.first, SAMPLE_ME.last, '', '', '', SAMPLE_ME.headline, 'I design calm, useful products.', 'Design', '', 'London, England, United Kingdom', '', '', '']],
  ));
  files.set('Connections.csv', notes + csv(['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'], connections));
  files.set('messages.csv', csv(['CONVERSATION ID', 'CONVERSATION TITLE', 'FROM', 'SENDER PROFILE URL', 'TO', 'RECIPIENT PROFILE URLS', 'DATE', 'SUBJECT', 'CONTENT', 'FOLDER', 'IS MESSAGE DRAFT'], messages));
  files.set('Invitations.csv', csv(['From', 'To', 'Sent At', 'Message', 'Direction', 'inviterProfileUrl', 'inviteeProfileUrl'], invitations));

  // Career, target companies & social capital enrichment CSVs
  files.set('Positions.csv', csv(
    ['Company Name', 'Title', 'Description', 'Location', 'Started On', 'Finished On'],
    [
      ['Brightwave', 'Senior Product Designer', 'Design systems and core workflows.', 'London, United Kingdom', 'Aug 2022', ''],
      ['Kestrel Bank', 'Product Designer', 'Consumer mobile banking experience.', 'London, United Kingdom', 'Mar 2019', 'Jul 2022'],
    ],
  ));
  files.set('Company Follows.csv', csv(
    ['Organization', 'Followed On'],
    [
      ['Lumen Labs', javaDate(now - 420 * DAY)],
      ['Vela Payments', javaDate(now - 310 * DAY)],
      ['Orbital Health', javaDate(now - 280 * DAY)],
      ['Cobalt Cloud', javaDate(now - 190 * DAY)],
      ['Summit Analytics', javaDate(now - 120 * DAY)],
      ['Linear', javaDate(now - 95 * DAY)],
      ['Figma', javaDate(now - 600 * DAY)],
    ],
  ));
  files.set('Jobs/Job Seeker Preferences.csv', csv(
    ['Locations', 'Industries', 'Company Employee Count', 'Preferred Job Types', 'Job Titles', 'Open To Recruiters', 'Dream Companies'],
    [['London; Remote Europe', 'Design Services; Software Development', '51-200; 201-500', 'Full-time', 'Staff Product Designer; Design Systems Lead', 'Yes', 'Lumen Labs; Vela Payments']],
  ));
  files.set('Endorsement_Received_Info.csv', csv(
    ['Endorsement Date', 'Skill Name', 'Endorser First Name', 'Endorser Last Name', 'Endorser Public Url', 'Endorsement Status'],
    [
      [slashUtcDate(now - 400 * DAY), 'Design Systems', 'Emma', 'Collins', bareUrl(emma.url), 'Accepted'],
      [slashUtcDate(now - 400 * DAY), 'Product Design', 'Emma', 'Collins', bareUrl(emma.url), 'Accepted'],
      [slashUtcDate(now - 395 * DAY), 'Prototyping', 'Emma', 'Collins', bareUrl(emma.url), 'Accepted'],
      [slashUtcDate(now - 520 * DAY), 'Design Systems', 'Olivia', 'Bennett', bareUrl(olivia.url), 'Accepted'],
      [slashUtcDate(now - 520 * DAY), 'Design Leadership', 'Olivia', 'Bennett', bareUrl(olivia.url), 'Accepted'],
      [slashUtcDate(now - 610 * DAY), 'Design Systems', 'Marco', 'Bianchi', bareUrl(marco.url), 'Accepted'],
      [slashUtcDate(now - 610 * DAY), 'Interaction Design', 'Marco', 'Bianchi', bareUrl(marco.url), 'Accepted'],
      [slashUtcDate(now - 290 * DAY), 'Design Systems', 'Liam', 'Turner', bareUrl(liam.url), 'Accepted'],
      [slashUtcDate(now - 310 * DAY), 'Figma', 'Daniel', 'Kim', bareUrl(daniel.url), 'Accepted'],
      [slashUtcDate(now - 480 * DAY), 'Product Design', 'Nora', 'Lindqvist', bareUrl(nora.url), 'Accepted'],
    ],
  ));
  files.set('Endorsement_Given_Info.csv', csv(
    ['Endorsement Date', 'Skill Name', 'Endorsee First Name', 'Endorsee Last Name', 'Endorsee Public Url', 'Endorsement Status'],
    [
      [slashUtcDate(now - 390 * DAY), 'Product Strategy', 'Emma', 'Collins', bareUrl(emma.url), 'Accepted'],
      [slashUtcDate(now - 515 * DAY), 'Design Direction', 'Olivia', 'Bennett', bareUrl(olivia.url), 'Accepted'],
      [slashUtcDate(now - 690 * DAY), 'Distributed Systems', 'Ravi', 'Sharma', bareUrl(ravi.url), 'Accepted'],
    ],
  ));
  files.set('Recommendations_Received.csv', csv(
    ['First Name', 'Last Name', 'Company', 'Job Title', 'Text', 'Creation Date', 'Status'],
    [
      ['Emma', 'Collins', 'Lumen Labs', 'Product Manager', 'Working with Alex made every product review sharper and calmer.', invDate(now - 360 * DAY), 'VISIBLE'],
      ['Olivia', 'Bennett', 'Pinecrest Media', 'Design Director', 'Alex led our design system overhaul with clarity and craft.', invDate(now - 740 * DAY), 'VISIBLE'],
    ],
  ));
  files.set('Recommendations_Given.csv', csv(
    ['First Name', 'Last Name', 'Company', 'Job Title', 'Text', 'Creation Date', 'Status'],
    [['Marco', 'Bianchi', 'Kestrel Bank', 'Senior Product Designer', 'Marco brings rigor and empathy to complex financial workflows.', invDate(now - 900 * DAY), 'VISIBLE']],
  ));
  files.set('Skills.csv', csv(
    ['Name'],
    [
      ['Design Systems'], ['Product Design'], ['Interaction Design'], ['Design Tokens'], ['Prototyping'],
      ['Figma'], ['User Research'], ['Web Accessibility'], ['Information Architecture'], ['Design Leadership'],
    ],
  ));

  // Complete-export Credibility, Inferences, Ad Targeting & Activity CSVs
  files.set('Inferred Credibility Scores.csv', csv(
    ['ScoreType', 'Topic', 'Category', 'Range', d0, d1, d2, d3],
    credibilityRows,
  ));
  files.set('Inferences_about_you.csv', csv(
    ['Category', 'Type of inference', 'Description', 'Inference'],
    [
      ['Usage and activity', 'Active weekly contributor', 'Inferred from posting and commenting cadence', 'True'],
      ['Career', 'Design systems decision-maker', 'Inferred from role scope and network graph', 'True'],
      ['Job seeking', 'Receptive to senior IC outreach', 'Inferred from career preferences', 'True'],
      ['Inferred personal characteristics', 'Inferred demographic', 'Structurally excluded personal category', 'Excluded'],
    ],
  ));
  files.set('Ad_Targeting.csv', csv(
    ['Member Age', 'Member Gender', 'Years of Experience', 'Company Size', 'Job Seniorities', 'Job Functions', 'Job Titles', 'Job Titles', 'Company Industries', 'High Value Audience Segments', 'Standard Audience Segments', 'Member Traits', 'Member Skills'],
    [[
      '25 to 34',
      'Excluded',
      '8 to 12 years',
      '51-200 employees',
      'Senior; Staff',
      'Design; Product Management; Engineering',
      'Senior Product Designer; Product Designer',
      'Design Systems Lead; Staff Product Designer',
      'Design Services; Software Development; Financial Technology',
      'B2B Software Evaluators; Design Tool Decision Makers; Senior Product IC',
      'SaaS Early Adopters; Tech Conference Attendees; Remote Europe Tech',
      'Desktop App User; Frequent Commenter; Creator Mode',
      'Design Systems; Product Design; Interaction Design; Figma; Prototyping; Design Tokens; Accessibility; UX Research; CSS; HTML; React; Design Leadership; Wireframing; Usability Testing; Component Libraries; Visual Design',
    ]],
  ));
  files.set('Shares_1049201.csv', csv(['Date', 'ShareLink', 'ShareCommentary', 'SharedUrl', 'MediaUrl', 'Visibility'], shareRows));
  files.set('Comments_1049201.csv', csv(['Date', 'Link', 'Message'], commentRows));
  files.set('Reactions_1049201.csv', csv(['Date', 'Type', 'Link'], reactionRows));
  files.set('InstantReposts_1049201.csv', csv(['Date', 'Link'], Array.from({ length: 6 }, (_, idx) => [msgDate(now - (idx * 45 + 10) * DAY), `https://www.linkedin.com/feed/update/urn:li:activity:7400${idx}`])));
  files.set('Votes_1049201.csv', csv(['Date', 'Link', 'OptionText'], Array.from({ length: 5 }, (_, idx) => [msgDate(now - (idx * 50 + 12) * DAY), `https://www.linkedin.com/feed/update/urn:li:activity:7500${idx}`, 'Option A'])));
  files.set('Saved_Items_1049201.csv', csv(['CreatedTime', 'SavedItem'], Array.from({ length: 11 }, (_, idx) => [slashUtcDate(now - (idx * 25 + 4) * DAY), `https://www.linkedin.com/feed/update/urn:li:activity:7600${idx}`])));
  files.set('Member_Follows_1049201.csv', csv(['Date', 'Status', 'FullName'], [
    ...Array.from({ length: 16 }, (_, idx) => [javaDate(now - (idx * 30 + 5) * DAY), 'Active', `Creator ${idx + 1}`]),
    ...Array.from({ length: 3 }, (_, idx) => [javaDate(now - (idx * 90 + 40) * DAY), 'Unfollowed', `Past Creator ${idx + 1}`]),
  ]));
  files.set('Hashtag_Follows_1049201.csv', csv(['HashTag', 'State', 'LastModifiedTime'], [
    ['designsystems', 'FOLLOW', slashUtcDate(now - 300 * DAY)],
    ['productdesign', 'FOLLOW', slashUtcDate(now - 280 * DAY)],
    ['accessibility', 'FOLLOW', slashUtcDate(now - 260 * DAY)],
    ['uxresearch', 'FOLLOW', slashUtcDate(now - 240 * DAY)],
    ['designtokens', 'FOLLOW', slashUtcDate(now - 200 * DAY)],
    ['frontend', 'FOLLOW', slashUtcDate(now - 180 * DAY)],
  ]));
  files.set('SearchQueries.csv', csv(['Time', 'Search Query'], searchRows));

  // Synthetic quarantined files present in Complete exports (counted in coverage, never decompressed or read)
  files.set('Email Addresses.csv', csv(['Email Address', 'Confirmed', 'Primary', 'Updated On'], [['alex.fictional@example.invalid', 'Yes', 'Yes', '10/14/22, 9:00 AM']]));
  files.set('Logins.csv', csv(['Login Date', 'IP Address', 'User Agent', 'Login Type'], [[slashUtcDate(now - DAY), '198.51.100.42', 'Mozilla/5.0', 'WEB']]));

  return files;
}

export function sampleFiles(now = Date.now()) {
  const files = buildSampleExport(now);
  return new Map([...files.entries()].map(([k, v]) => [k, async () => v]));
}
