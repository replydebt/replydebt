// Keyword signals used by the classifiers (EN, TR, DE, FR). All patterns run on folded lowercase text.

export const RECRUITER_TITLE = /recruit|recrut(ement|eur|euse)|talent|sourc(er|ing)|head ?hunt|chasseur de tetes|\b(hr|ik|rh)\b|human resources|ressources humaines|insan kaynaklari|ise alim|people partner|people (and|&) culture|staffing|hiring manager|executive search|yetenek|personal(berater|beratung|referent|wesen|beschaffung|leitung)|talentgewinnung/;

export const RECRUITER_CONTENT = [
  /\bopportunit|\bopportunite|\bkarrieremoglichkeit/,
  /\bopen (?:\w+\s+){0,4}(roles?|positions?|stelle|poste)\b|\b(senior|staff|principal|lead|manager|director|head|engineering|design|product|software|frontend|backend|fullstack|data|remote|hybrid)\s+(roles?|positions?|stelle|poste)\b|\b(roles?|positions?)\s+(at|on|in|for|with)\b|\bexploring (the |a |new )?roles?\b|\brole is still open\b|\bpozisyon|\bposte (de|a pourvoir)\b/,
  /\bhiring\b|\b(we are|we're|they are|they're) looking for\b|\bwir suchen\b|\bnous recrutons\b|\bnous recherchons\b/,
  /\bare you open\b|\bopen to (a |new )?(opportunit|role|position|conversation|chat|exploring)|\bwechselbereit|\bneue herausforderung|\ba l'?ecoute du marche/,
  /\binterview|\bmulakat|\bvorstellungsgesprach|\bentretien\b/,
  /\b(share|send)( over)? (your |my )?(cv|resume|ozgecmis)\b|\byour (profile|background|portfolio|experience) stood out\b|\bgreat fit\b|\bgut(er)? fit\b/,
  /\bsalary|\bcompensation|\bmaas\b|\bgehalt|\bremuneration/,
  /\b(is|kariyer|calisma) firsat|\bis ilani|\bacik pozisyon/,
  /\brecruit|\brecrutement|\btalent acquisition|\bpersonalberatung|\bvakanz|\bstellenangebot|\boffene stelle/,
  /\bjob description\b|\bjd\b/,
  /\bour client|\bclient of ours|\bon behalf of\b|\bunser(em|en|es)? kunden?\b|\bnotre client\b|\bpour le compte de\b/,
  /\bise alim|\baday(imiz|lar|larimiz)?\b|\bekibimize (katil|dahil)|\bekip arkadasi ari|\barayisimiz/,
  /\bgorusme (ayarla|planla|yapabilir)|\bteknik gorusme/,
];

// Social congratulations on starting a new job (not recruiter outreach).
export const CONGRATS_ROLE = /\b(congrats?|congratulations|tebrik(ler| ederim)?|hayirli olsun|basarilar dilerim|(herzlichen )?gluckwunsch|alles gute zur|felicitations|bravo pour)\b[\s\S]{0,80}\b(new|your|yeni|neue[nr]?|nouveau|nouvelle)\s+((role|position|job|chapter|title|stelle|poste)\b|(is|gorev|pozisyon)(in|un|iniz|unuz|da|de|ta|te|unda|inde)?\b)/;

// Inbound job seekers pitching their own CV or asking the archive owner for a job/referral.
export const JOB_SEEKER_CONTENT = [
  /\b(i applied|i've applied|i have applied|i am applying|i'm applying|my application|attached (is )?my (cv|resume)|please find my (cv|resume)|here is my (cv|resume)|sharing my (cv|resume)|i am looking for (a |an )?(new )?(job|role|position|internship)|i'm looking for (a |an )?(new )?(job|role|position|internship)|seeking (a |an )?(job|role|position|internship)|could you refer me|can you refer me|would you refer me)\b/,
  /\b(basvurdum|basvurum|basvuru yaptim|ozgecmisimi (ek|paylas|ilet|gonder)|cv'?mi (ek|paylas|ilet|gonder)|is ariyorum|staj ariyorum|referans olabilir misin)\b/,
  /\b(ich bewerbe mich|meine bewerbung|mein(en)? lebenslauf|ich suche eine (neue )?(stelle|position|praktikum))\b/,
  /\b(je postule|ma candidature|ci[- ]joint mon cv|voici mon cv|je recherche un (poste|stage|emploi)|je cherche un (poste|stage|emploi))\b/,
];

export const SALES_CONTENT = [
  /\bdemo\b/,
  /\bdiscount|\bindirim/,
  /\bour (services|solutions?|agency)\b|\bour (platform|product|tool|team) (can|helps?|will help|enables)\b/,
  /\bfree (trial|audit|consultation)/,
  /\bbook a (call|meeting|demo)\b|\b15[- ]minute call\b/,
  /\blead generation|\bseo\b|\bgrowth hacking|\bappointment setting/,
  /\boutsourc|\bwhite[- ]label/,
  /\bpricing\b|\bquote\b/,
  /\bhizmet(imiz|lerimiz|lerimizi)\b|\bteklif sun/,
  /\bcozum(umuz|lerimiz|ortag)|\bis ?birligi (teklif|firsat)|\bkampanya\b/,
  /\bucretsiz (deneme|demo|analiz|danismanlik|gorusme)/,
];

export const QUESTION = /\?/;

// Short sign-off messages that do not require a reply (supports skin-tone modifiers and ZWJ emojis).
export const CLOSING = /^(ok(ay)?|k|thanks?( (a lot|so much|again|you( so much| too)?))?|thank you( (so much|very much|again))?|thx|ty|tysm|great|perfect|cool|nice|awesome|sure|sounds good|will do|got it|noted|you too|same to you|likewise|cheers|np|no problem|no worries|welcome|you'?re welcome|congrats?|congratulations|happy (birthday|new year)|tesekkur(ler| ederim)?|sagol(un)?|eyvallah|rica ederim|tamam(dir)?|super|harika|guzel|iyi calismalar|kolay gelsin|danke( schon| sehr)?|vielen dank|alles klar|gerne|merci( beaucoup| bien)?|de rien|parfait|avec plaisir)[\s.,!?\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]*$/u;

export const EMOJI_ONLY = /^[\s.,!?\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]+$/u;
