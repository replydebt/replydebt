// Editable starter message templates for replies, recruiter follow-ups, reconnections, and intros.
import { firstName } from '../core/text.js';
import { monthName } from '../core/time.js';

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

const SETS = {
  recruiter: [
    {
      id: 'late',
      label: 'Late reply',
      text: "Hi {first}, apologies for the very late reply to your message from {month}. I wasn't looking at the time, but I'm now open to new opportunities. Is the role you mentioned{atCompany} still open, or is there anything similar you're working on? Happy to share my CV.\n\nBest,\n{me}",
    },
    {
      id: 'open',
      label: 'Open to talk',
      text: "Hi {first}, thanks for reaching out back in {month}. I'm exploring new roles now and would be glad to have a quick chat. What does your availability look like this week?\n\nBest,\n{me}",
    },
    {
      id: 'later',
      label: 'Not right now',
      text: "Hi {first}, sorry I never got back to you. I'm not looking right now, but I'd love to stay in touch for the future. Feel free to reach out again in a few months.\n\nBest,\n{me}",
    },
  ],
  reply: [
    {
      id: 'sorry',
      label: 'Sorry for the delay',
      text: 'Hi {first}, so sorry for the slow reply. Your message got buried. ',
    },
    {
      id: 'catchup',
      label: "Let's catch up",
      text: "Hi {first}, apologies for leaving this hanging. Would you be up for a quick call next week to catch up properly?\n\n{me}",
    },
    {
      id: 'thanks',
      label: 'Thanks + close',
      text: "Hi {first}, I realized I never replied. Thank you for your message, I really appreciate it. Let me know if there's anything I can help with.\n\n{me}",
    },
  ],
  reconnect: [
    {
      id: 'hi',
      label: 'Say hi',
      text: "Hi {first}, it's been a while since we last talked ({since}). I was thinking of you today. How are things going{atCompany}?",
    },
    {
      id: 'coffee',
      label: 'Coffee chat',
      text: "Hi {first}, long time no talk! Would you be up for a virtual coffee in the next couple of weeks? I'd love to hear what you're working on these days.\n\n{me}",
    },
    {
      id: 'help',
      label: 'Offer help',
      text: "Hi {first}, hope you're doing well. Just checking in. If there's anything I can help with{atCompany}, an intro, a review or a second opinion, I'm happy to.\n\n{me}",
    },
  ],
  intro: [
    {
      id: 'intro',
      label: 'Ask for an intro',
      text: "Hi {first}, hope all is well! I'm interested in {target} and noticed you're there. Would you be open to a quick chat about what it's like, or to pointing me to the right person on the team? Totally fine if not.\n\nThanks,\n{me}",
    },
    {
      id: 'referral',
      label: 'Ask for a referral',
      text: "Hi {first}, I'm applying for a role at {target} and would really value your perspective. Would you be comfortable referring me, or sharing any tips about the process? I can send my CV and the job link.\n\nThanks a lot,\n{me}",
    },
    {
      id: 'advice',
      label: 'Ask for advice',
      text: "Hi {first}, I'm considering {target} for my next move. Could I ask you two or three quick questions about the team and culture? 15 minutes would be more than enough.\n\nThanks,\n{me}",
    },
  ],
};

/**
 * @param {'recruiter'|'reply'|'reconnect'|'intro'} kind
 * @param {{ name:string, company?:string }} person
 * @param {{ me?:string, date?:number, target?:string, since?:string, company?:string }} ctx
 */
export function templatesFor(kind, person, ctx = {}) {
  const company = ctx.company ?? person.company ?? '';
  const vars = {
    first: firstName(person.name) || 'there',
    me: firstName(ctx.me) || '',
    month: ctx.date ? monthName(ctx.date) : 'a while ago',
    company,
    atCompany: company ? ` at ${company}` : '',
    target: ctx.target || company || 'your company',
    since: ctx.since || 'a while',
  };
  return (SETS[kind] || []).map((t) => ({ id: t.id, label: t.label, text: fill(t.text, vars).replace(/\n\n$/, '').trimEnd() }));
}
