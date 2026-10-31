// Synthetic LinkedIn export used by "Try sample data" and automated tests.
// Produces CSV text in the exact shape of official LinkedIn exports so the full pipeline runs end-to-end.
import { DAY } from '../core/time.js';
import { mulberry32 } from '../core/text.js';

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

  const files = new Map();
  files.set('Profile.csv', csv(
    ['First Name', 'Last Name', 'Maiden Name', 'Address', 'Birth Date', 'Headline', 'Summary', 'Industry', 'Zip Code', 'Geo Location', 'Twitter Handles', 'Websites', 'Instant Messengers'],
    [[SAMPLE_ME.first, SAMPLE_ME.last, '', '', '', SAMPLE_ME.headline, 'I design calm, useful products.', 'Design', '', 'London, England, United Kingdom', '', '', '']],
  ));
  files.set('Connections.csv', notes + csv(['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'], connections));
  files.set('messages.csv', csv(['CONVERSATION ID', 'CONVERSATION TITLE', 'FROM', 'SENDER PROFILE URL', 'TO', 'RECIPIENT PROFILE URLS', 'DATE', 'SUBJECT', 'CONTENT', 'FOLDER', 'IS MESSAGE DRAFT'], messages));
  files.set('Invitations.csv', csv(['From', 'To', 'Sent At', 'Message', 'Direction', 'inviterProfileUrl', 'inviteeProfileUrl'], invitations));
  return files;
}

export function sampleFiles(now = Date.now()) {
  const files = buildSampleExport(now);
  return new Map([...files.entries()].map(([k, v]) => [k, async () => v]));
}
