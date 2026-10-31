// Date parsing across localized LinkedIn export formats + compact relative time helpers.
import { fold } from './text.js';

export const DAY = 86400000;

const MONTH_GROUPS = [
  ['jan', 'january', 'oca', 'ocak', 'januar', 'janv', 'janvier', 'ene', 'enero', 'janeiro', 'gen', 'gennaio', 'januari', 'tammi', 'tammikuu', 'sty', 'styczen', 'stycznia', 'led', 'leden', 'ledna', 'ian', 'ianuarie', 'янв', 'январь', 'января', 'січ', 'січень', 'січня', 'يناير'],
  ['feb', 'february', 'sub', 'subat', 'februar', 'fevr', 'fevrier', 'febrero', 'fev', 'fevereiro', 'febbraio', 'februari', 'helmi', 'helmikuu', 'lut', 'luty', 'lutego', 'uno', 'unor', 'unora', 'februarie', 'febr', 'февр', 'февраль', 'февраля', 'лют', 'лютии', 'лютого', 'فبراير'],
  ['mar', 'march', 'mart', 'marz', 'mars', 'marzo', 'marco', 'mrt', 'maart', 'marts', 'maalis', 'maaliskuu', 'marzec', 'marca', 'bre', 'brezen', 'brezna', 'martie', 'marc', 'marcius', 'maret', 'mac', 'март', 'марта', 'бер', 'березень', 'березня', 'مارس'],
  ['apr', 'april', 'nis', 'nisan', 'avr', 'avril', 'abr', 'abril', 'aprile', 'huhti', 'huhtikuu', 'kwi', 'kwiecien', 'kwietnia', 'dub', 'duben', 'dubna', 'aprilie', 'aprilis', 'апр', 'апрель', 'апреля', 'квіт', 'квітень', 'квітня', 'ابريل'],
  ['may', 'mayis', 'mai', 'mayo', 'maio', 'mag', 'maggio', 'mei', 'maj', 'maja', 'touko', 'toukokuu', 'kve', 'kveten', 'kvetna', 'majus', 'маи', 'мая', 'трав', 'травень', 'травня', 'مايو'],
  ['jun', 'june', 'haz', 'haziran', 'juni', 'juin', 'junio', 'junho', 'giu', 'giugno', 'kesa', 'kesakuu', 'cze', 'czerwiec', 'czerwca', 'cvn', 'cerven', 'cervna', 'iun', 'iunie', 'junius', 'июнь', 'июня', 'черв', 'червень', 'червня', 'يونيو'],
  ['jul', 'july', 'tem', 'temmuz', 'juli', 'juil', 'juillet', 'julio', 'julho', 'lug', 'luglio', 'heina', 'heinakuu', 'lip', 'lipiec', 'lipca', 'cvc', 'cervenec', 'cervence', 'iul', 'iulie', 'julius', 'julai', 'июль', 'июля', 'лип', 'липень', 'липня', 'يوليو'],
  ['aug', 'august', 'agu', 'agustos', 'aout', 'ago', 'agosto', 'augustus', 'augusti', 'elo', 'elokuu', 'sie', 'sierpien', 'sierpnia', 'srp', 'srpen', 'srpna', 'augusztus', 'agustus', 'ogo', 'ogos', 'авг', 'август', 'августа', 'серп', 'серпень', 'серпня', 'اغسطس'],
  ['sep', 'september', 'eyl', 'eylul', 'sept', 'septembre', 'septiembre', 'set', 'setembro', 'settembre', 'syys', 'syyskuu', 'wrz', 'wrzesien', 'wrzesnia', 'zar', 'zari', 'septembrie', 'szept', 'szeptember', 'сент', 'сентябрь', 'сентября', 'вер', 'вересень', 'вересня', 'سبتمبر'],
  ['oct', 'october', 'eki', 'ekim', 'okt', 'oktober', 'octobre', 'octubre', 'out', 'outubro', 'ott', 'ottobre', 'loka', 'lokakuu', 'paz', 'pazdziernik', 'pazdziernika', 'rij', 'rijen', 'rijna', 'octombrie', 'окт', 'октябрь', 'октября', 'жовт', 'жовтень', 'жовтня', 'اكتوبر'],
  ['nov', 'november', 'kas', 'kasim', 'novembre', 'noviembre', 'novembro', 'marras', 'marraskuu', 'lis', 'listopad', 'listopada', 'noiembrie', 'нояб', 'ноябрь', 'ноября', 'лист', 'листопад', 'листопада', 'نوفمبر'],
  ['dec', 'december', 'ara', 'aralik', 'dez', 'dezember', 'decembre', 'dic', 'diciembre', 'dezembro', 'dicembre', 'des', 'desember', 'joulu', 'joulukuu', 'gru', 'grudzien', 'grudnia', 'pro', 'prosinec', 'prosince', 'decembrie', 'dis', 'disember', 'дек', 'декабрь', 'декабря', 'груд', 'грудень', 'грудня', 'ديسمبر'],
];

const MONTHS = Object.create(null);
MONTH_GROUPS.forEach((tokens, idx) => {
  for (const t of tokens) MONTHS[fold(t)] = idx;
});

function lookupMonth(rawToken) {
  const tok = fold(rawToken).replace(/\./g, '');
  if (!tok) return undefined;
  if (MONTHS[tok] !== undefined) return MONTHS[tok];
  if (tok.length >= 4 && MONTHS[tok.slice(0, 4)] !== undefined) return MONTHS[tok.slice(0, 4)];
  if (tok.length >= 3 && MONTHS[tok.slice(0, 3)] !== undefined) return MONTHS[tok.slice(0, 3)];
  return undefined;
}

function validUtc(year, month0, day, hour = 0, min = 0, sec = 0) {
  if (!Number.isInteger(year) || year < 1995 || year > 2100) return null;
  if (!Number.isInteger(month0) || month0 < 0 || month0 > 11) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return null;
  const ts = Date.UTC(year, month0, day, hour, min, sec);
  const d = new Date(ts);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month0 || d.getUTCDate() !== day) return null;
  return ts;
}

/**
 * Parse a date string from a LinkedIn export. Returns epoch ms or null.
 * Supports ISO/UTC, localized month names across 21 locales, CJK dates, DD.MM.YYYY, MM/DD/YY, and DD/MM/YYYY.
 */
export function parseDate(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // 2024-05-12 14:33:10 UTC  /  2024-05-12T14:33:10Z  /  2024-05-12
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(UTC|Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', tz] = m;
    let t = validUtc(+y, +mo - 1, +d, +h, +mi, +se);
    if (t === null) return null;
    if (tz && /^[+-]/.test(tz)) {
      const sign = tz[0] === '-' ? -1 : 1;
      const digits = tz.replace(/[^0-9]/g, '');
      const tzH = parseInt(digits.slice(0, 2), 10);
      const tzM = parseInt(digits.slice(2), 10);
      if (tzH > 14 || tzM > 59) return null;
      t -= sign * (tzH * 60 + tzM) * 60000;
    }
    return t;
  }

  // CJK: 2023年3月15日 / 2023년 3월 15일
  m = s.match(/^(\d{4})\s*[\u5e74\ub144]\s*(\d{1,2})\s*[\u6708\uc6d4]\s*(\d{1,2})\s*[\u65e5\uc77c]?\s*$/u);
  if (m) return validUtc(+m[1], +m[2] - 1, +m[3]);

  // Dotted numeric: 15.03.2023, 15.03.23, or 15.03.2023 09:30(:00)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return validUtc(year, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  // 15 Mar 2023 / 15. März 2023 / 15 févr. 2023 / 15 de ene. de 2023 / 15 мая 2023 г. / 14 жовт. 2025 р.
  m = s.match(/^(\d{1,2})\.?(?:\s+de)?[\s-]+([\p{L}]{2,})\.?(?:\s+de)?[\s-]+(\d{4})(?:\s*(?:г\.?|р\.?|r\.?))?$/iu);
  if (m) {
    const mon = lookupMonth(m[2]);
    if (mon !== undefined) return validUtc(+m[3], mon, +m[1]);
  }

  // Mar 15, 2023 / févr. 15, 2023
  m = s.match(/^([\p{L}]{2,})\.?\s+(\d{1,2}),?\s+(\d{4})$/iu);
  if (m) {
    const mon = lookupMonth(m[1]);
    if (mon !== undefined) return validUtc(+m[3], mon, +m[2]);
  }

  // Slashed numeric: 10/12/24, 3:04 PM (US MM/DD/YY) or 25/10/2024 (DD/MM/YYYY when first > 12)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?$/i);
  if (m) {
    const [, a, b, y, h = '0', mi = '0', se = '0', ap] = m;
    let year = +y;
    if (year < 100) year += 2000;
    let hour = +h;
    if (ap) {
      if (hour < 1 || hour > 12) return null;
      if (/pm/i.test(ap) && hour < 12) hour += 12;
      if (/am/i.test(ap) && hour === 12) hour = 0;
    }
    const n1 = +a;
    const n2 = +b;
    const [month, day] = n1 > 12 ? [n2, n1] : [n1, n2];
    return validUtc(year, month - 1, day, hour, +mi, +se);
  }

  return null;
}

/** LinkedIn-style compact relative time: "now", "5m", "3h", "2d", "3w", "5mo", "2yr". */
export function relTime(ts, now = Date.now()) {
  if (!ts) return '';
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(diff / DAY);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30.4))}mo`;
  return `${Math.floor(days / 365)}yr`;
}

/** Long relative phrase: "3 weeks ago", "over a year ago". */
export function relPhrase(ts, now = Date.now()) {
  if (!ts) return '';
  const days = Math.floor(Math.max(0, now - ts) / DAY);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'a week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'a month ago';
  if (days < 365) return `${Math.floor(days / 30.4)} months ago`;
  if (days < 730) return 'over a year ago';
  return `${Math.floor(days / 365)} years ago`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export function monthName(ts, now = Date.now()) {
  if (!ts) return '';
  const d = new Date(ts);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return sameYear ? MONTH_NAMES[d.getUTCMonth()] : `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function shortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** ISO-8601 week key, e.g. "2026-W44". */
export function isoWeekKey(ts = Date.now()) {
  const d = new Date(ts);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
