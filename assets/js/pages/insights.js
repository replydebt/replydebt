// Insights (#/insights): LinkedIn's hidden Credibility & Topic Authority scores, Algorithmic Inferences,
// Ad-Targeting Persona, Social Capital & Outbound Invitation Hygiene, and Activity Footprint.
import { h, fmt, plural } from '../ui/h.js';
import { icon, svgEl } from '../ui/icons.js';
import { card, cardHeader } from '../ui/parts.js';
import { app } from '../app/state.js';
import { leftRail, rightRail, sampleBanner } from './rails.js';

const SENT_INVITES_URL = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';

const REACTION_LABELS = {
  LIKE: 'Like',
  PRAISE: 'Celebrate (Praise)',
  APPRECIATION: 'Support (Appreciation)',
  EMPATHY: 'Love (Empathy)',
  INTEREST: 'Insightful (Interest)',
  ENTERTAINMENT: 'Funny (Entertainment)',
  MAYBE: 'Curious (Maybe)',
};

function meterSvg(value, max = 4, fillVar = 'var(--action)') {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fillW = Math.round(ratio * 200);
  return svgEl(
    'svg',
    { viewBox: '0 0 200 8', class: 'ins-bar', 'aria-hidden': 'true', preserveAspectRatio: 'none' },
    svgEl('rect', { x: 0, y: 0, width: 200, height: 8, rx: 4, fill: 'var(--surface-2)' }),
    fillW > 0 ? svgEl('rect', { x: 0, y: 0, width: fillW, height: 8, rx: 4, fill: fillVar }) : null,
  );
}

function pillarDotsSvg(score) {
  const clamped = Math.max(0, Math.min(4, Math.round(score || 0)));
  const segs = [];
  for (let i = 0; i < 4; i++) {
    segs.push(svgEl('rect', {
      x: i * 26,
      y: 0,
      width: 22,
      height: 8,
      rx: 3,
      fill: i < clamped ? (clamped >= 3 ? 'var(--action)' : 'var(--success)') : 'var(--surface-2)',
    }));
  }
  return svgEl('svg', { viewBox: '0 0 100 8', class: 'ins-segs', 'aria-hidden': 'true' }, ...segs);
}

function deltaTag(delta) {
  if (!delta || Math.abs(delta) < 0.01) return null;
  const up = delta > 0;
  const sign = up ? '+' : '';
  return h(`span.tag${up ? '' : '.tag--subtle'}`, `${sign}${delta.toFixed(2)}`);
}

function kpiTile(label, value, sub = '', href = '') {
  const inner = [
    h('div.ins-kpi__val', value),
    h('div.ins-kpi__label', label),
    sub ? h('div.ins-kpi__sub', sub) : null,
  ];
  return href
    ? h('a.ins-kpi.ins-kpi--link', { href }, ...inner)
    : h('div.ins-kpi', ...inner);
}

function chipGroup(title, items, cls = 'tag--subtle') {
  if (!items || !items.length) return null;
  return h(
    'div.ins-group',
    h('h3.ins-sub', title),
    h('div.ins-tags', items.map((item) => h(`span.tag.${cls}`, item))),
  );
}

function renderCredibilityCard(cred, isComplete) {
  if (!cred) {
    return card(
      cardHeader(
        'Topic credibility & authority scores',
        'Available when you open LinkedIn\'s Complete data archive (24-48h export)',
      ),
      h(
        'div.card__body.ins-stack',
        h(
          'p.t-14.t-low',
          isComplete
            ? 'LinkedIn did not include Inferred Credibility Scores.csv in this archive.'
            : 'Your fast 10-minute archive covers all four action lists plus social capital. If you later request LinkedIn\'s Complete archive ("Download larger data archive"), Reply Debt also decodes Inferred Credibility Scores.csv — showing your hidden Notability tier, 5-pillar specialty grades, and 100+ topic authority trends.',
        ),
      ),
    );
  }

  const kpis = [];
  if (cred.notabilityTier !== null) {
    kpis.push(kpiTile('Notability tier', `Tier ${cred.notabilityTier} / 4`, 'LinkedIn discrete tier'));
  }
  if (cred.notabilityScore !== null) {
    const d = cred.notabilityDelta ? `${cred.notabilityDelta > 0 ? '+' : ''}${cred.notabilityDelta.toFixed(2)} trend` : '0-5 continuous scale';
    kpis.push(kpiTile('Notability score', `${cred.notabilityScore.toFixed(2)} / 5`, d));
  }
  if (cred.totalTopics > 0) {
    kpis.push(kpiTile('Scored feed topics', fmt(cred.totalTopics), cred.snapshotDate ? `Latest: ${cred.snapshotDate}` : 'Tracked over time'));
  }
  if (cred.pillars.length > 0) {
    kpis.push(kpiTile('5-pillar specialties', fmt(cred.pillars.length), 'Deep domain breakdown'));
  }

  return card(
    cardHeader(
      'LinkedIn credibility & topic authority',
      'Decoded locally from Inferred Credibility Scores.csv — how LinkedIn\'s ranking engine grades your expertise',
    ),
    h(
      'div.card__body.ins-stack',
      kpis.length ? h('div.ins-kpis', kpis) : null,

      cred.pillars.length ? h(
        'div.ins-group',
        h('h3.ins-sub', '5-pillar specialty breakdown (1-4 per pillar)'),
        h(
          'div.ins-pillars',
          cred.pillars.map((p) => h(
            'div.ins-pillar',
            h(
              'div.ins-pillar__head',
              h('span.ins-pillar__title', p.topic),
              h('span.tag.tag--accent', `${p.total} / ${p.max}`),
            ),
            p.weakest ? h('p.ins-pillar__hint', `Growth bottleneck: ${p.weakest}`) : null,
            h(
              'div.ins-pillar__grid',
              [
                ['Role & scope', p.role],
                ['Tenure & exp.', p.tenure],
                ['Content output', p.content],
                ['Credentials', p.education],
                ['Validation', p.validation],
              ].map(([label, val]) => h(
                'div.ins-pillar__cell',
                h('div.ins-pillar__row', h('span', label), h('b', `${val}/4`)),
                pillarDotsSvg(val),
              )),
            ),
          )),
        ),
      ) : null,

      cred.topTopics.length ? h(
        'div.ins-group',
        h('h3.ins-sub', 'Highest-ranked feed authority topics (1.00 - 4.00 scale)'),
        h(
          'div.ins-topics',
          cred.topTopics.map((t) => h(
            'div.ins-topic',
            h(
              'div.ins-topic__top',
              h('span.ins-topic__name', t.topic),
              h('span.ins-topic__score', deltaTag(t.delta), h('b', t.score.toFixed(2)), h('span.t-low', ' / 4')),
            ),
            meterSvg(t.score, 4, 'var(--action)'),
          )),
        ),
      ) : null,

      cred.risingTopics.length ? chipGroup(
        'Fastest-rising topics across recent snapshots',
        cred.risingTopics.map((t) => `${t.topic} (+${t.delta.toFixed(2)})`),
        'tag--accent',
      ) : null,
    ),
  );
}

function renderPersonaCard(persona) {
  if (!persona) return null;
  const metaPills = [];
  if (persona.yearsOfExperience) metaPills.push(`Experience: ${persona.yearsOfExperience}`);
  if (persona.companySize) metaPills.push(`Employer size: ${persona.companySize}`);
  if (persona.openToRecruiters !== null) {
    metaPills.push(`Open to recruiters: ${persona.openToRecruiters ? 'Yes' : 'No'}`);
  }
  if (persona.listedSkillCount || persona.inferredSkillCount) {
    metaPills.push(`Skills: ${fmt(persona.listedSkillCount)} listed · ${fmt(persona.inferredSkillCount)} inferred by ad engine`);
  }

  return card(
    cardHeader(
      'How LinkedIn\'s ad & inference engine classifies you',
      'Minimized professional segments from Ad_Targeting.csv, Inferences_about_you.csv, and Skills.csv (age & gender excluded)',
    ),
    h(
      'div.card__body.ins-stack',
      metaPills.length ? h('div.ins-tags', metaPills.map((m) => h('span.tag.tag--accent', m))) : null,

      persona.inferences.length ? h(
        'div.ins-group',
        h('h3.ins-sub', 'Algorithmic inferences about your account'),
        h(
          'div.ins-kv-list',
          persona.inferences.map((inf) => h(
            'div.ins-kv',
            h('div', h('span.ins-kv__label', inf.label), h('span.ins-kv__cat', ` · ${inf.category}`)),
            h(`span.tag${inf.value === 'Yes' ? '' : '.tag--subtle'}`, inf.value),
          )),
        ),
      ) : null,

      chipGroup('High-value audience segments', persona.highValueSegments, 'tag--accent'),
      chipGroup('Standard audience & buyer segments', persona.standardSegments),
      chipGroup('Inferred seniority & job functions', [...persona.seniorities, ...persona.jobFunctions]),
      chipGroup('Member traits & industries', [...persona.memberTraits, ...persona.industries]),
      chipGroup('Profile & inferred skills sample', persona.topSkills),
    ),
  );
}

function renderSocialCard(social, actions) {
  if (!social) return null;
  return card(
    cardHeader(
      'Social capital & invitation hygiene',
      'Relationship depth signals that boost warm company paths and weekly reconnect picks',
    ),
    h(
      'div.card__body.ins-stack',
      h(
        'div.ins-kpis',
        kpiTile('Endorsements received', fmt(social.endorsementsReceived), `${fmt(social.endorsementsGiven)} given`),
        kpiTile('Recommendations', fmt(social.recommendationsReceived), `${fmt(social.recommendationsGiven)} written for others`),
        kpiTile('Shared-company alumni', fmt(social.alumniConnections), 'Matched via Positions.csv'),
        kpiTile(
          'Followed companies in network',
          fmt(social.followedInNetwork),
          social.followedCompaniesTotal ? `of ${fmt(social.followedCompaniesTotal)} followed` : 'Target companies',
          social.followedInNetwork > 0 ? '#/companies' : '',
        ),
      ),

      social.topEndorsedSkills.length ? chipGroup(
        'Most endorsed skills from connections',
        social.topEndorsedSkills.map((s) => `${s.skill} (${fmt(s.count)})`),
        'tag--accent',
      ) : null,

      social.followedInNetwork > 0 ? h(
        'div.ins-callout',
        h(
          'div.ins-callout__text',
          h('b', `${plural(social.followedInNetwork, 'company', 'companies')} you follow already ${social.followedInNetwork === 1 ? 'has' : 'have'} 1st-degree connections in your network.`),
          h('p.t-12.t-low', 'Filter your Companies directory by "Following" to see your warmest introduction path into each one.'),
        ),
        h('button.btn.btn--secondary.btn--sm', {
          type: 'button',
          onclick: () => actions.openFollowedCompanies(),
        }, 'View followed companies'),
      ) : null,

      social.outboundPending > 0 ? h(
        'div.ins-callout',
        h(
          'div.ins-callout__text',
          h('b', `${plural(social.outboundPending, 'sent invitation')} still unaccepted`),
          h(
            'p.t-12.t-low',
            social.outboundStale90d > 0
              ? `${plural(social.outboundStale90d, 'invitation')} sent over 90 days ago ${social.outboundStale90d === 1 ? 'is' : 'are'} still pending. Withdrawing stale invites keeps your account standing healthy.`
              : `Out of ${fmt(social.outboundInvitesTotal)} outgoing invitations in your archive.`,
          ),
        ),
        h(
          'a.btn.btn--secondary.btn--sm',
          { href: SENT_INVITES_URL, target: '_blank', rel: 'noopener noreferrer' },
          'Manage on LinkedIn',
          icon('external', 14),
        ),
      ) : null,
    ),
  );
}

function renderActivityCard(act) {
  if (!act) return null;
  return card(
    cardHeader(
      'Content & engagement footprint',
      'Aggregate counts only — raw post commentary, comment prose, and search query strings are never stored',
    ),
    h(
      'div.card__body.ins-stack',
      h(
        'div.ins-kpis',
        kpiTile('Posts shared', fmt(act.sharesTotal), `${fmt(act.shares12m)} in last 12 mo`),
        kpiTile('Comments written', fmt(act.commentsTotal), `${fmt(act.comments12m)} in last 12 mo`),
        kpiTile('Reactions given', fmt(act.reactionsTotal), `${fmt(act.reactions12m)} in last 12 mo`),
        kpiTile('Reposts & poll votes', fmt(act.repostsTotal + act.votesTotal), `${fmt(act.repostsTotal)} reposts · ${fmt(act.votesTotal)} votes`),
        kpiTile('Active member follows', fmt(act.followingActive), `${fmt(act.savedItems)} saved items`),
        kpiTile('Searches logged', fmt(act.searchesTotal), `${fmt(act.searches90d)} in last 90 days`),
      ),

      act.reactionTypes.length ? h(
        'div.ins-group',
        h('h3.ins-sub', 'Reaction palette breakdown'),
        h(
          'div.ins-topics',
          act.reactionTypes.map((rt) => {
            const pct = act.reactionsTotal ? Math.round((rt.count / act.reactionsTotal) * 100) : 0;
            return h(
              'div.ins-topic',
              h(
                'div.ins-topic__top',
                h('span.ins-topic__name', REACTION_LABELS[rt.type] || rt.type),
                h('span.ins-topic__score', h('b', fmt(rt.count)), h('span.t-low', ` (${pct}%)`)),
              ),
              meterSvg(rt.count, act.reactionsTotal || 1, 'var(--success)'),
            );
          }),
        ),
      ) : null,

      act.hashtags.length ? chipGroup(
        'Followed hashtags',
        act.hashtags.map((tag) => `#${tag}`),
      ) : null,
    ),
  );
}

export function renderInsights(actions) {
  const ins = app.report.insights || {
    coverage: { isComplete: false, totalFiles: (app.report.found || []).length, readFiles: (app.report.found || []).length, quarantinedFiles: 0 },
    credibility: null,
    persona: null,
    social: null,
    activity: null,
  };
  const cov = ins.coverage;
  const badgeText = cov.isComplete ? 'Complete archive detected' : 'Basic archive detected';

  const main = h(
    'main.main',
    { id: 'main' },
    sampleBanner(actions),

    card(
      cardHeader(
        'Archive & algorithm insights',
        'Local X-ray of your LinkedIn authority scores, ad-targeting persona, social capital, and activity footprint',
        h(`span.tag${cov.isComplete ? '' : '.tag--accent'}`, icon('shield', 12), badgeText),
        { lg: true, level: 'h1' },
      ),
      h(
        'div.card__body',
        h(
          'p.t-14.t-low',
          `Analyzed ${plural(cov.readFiles, 'signal file')} out of ${plural(cov.totalFiles, 'archive entry', 'archive entries')} locally in your browser.`,
          cov.quarantinedFiles > 0
            ? ` ${plural(cov.quarantinedFiles, 'sensitive PII / IP / billing file')} (emails, phone numbers, receipts, verifications, login IPs, private notes) ${cov.quarantinedFiles === 1 ? 'was' : 'were'} automatically quarantined and left unread.`
            : ' Sensitive columns (connection email addresses, phone numbers, billing data, and raw search queries) are structurally excluded.',
        ),
      ),
    ),

    renderCredibilityCard(ins.credibility, cov.isComplete),
    renderPersonaCard(ins.persona),
    renderSocialCard(ins.social, actions),
    renderActivityCard(ins.activity),
  );

  return h('div.layout', leftRail('insights', actions), main, rightRail(actions, { insights: false }));
}
