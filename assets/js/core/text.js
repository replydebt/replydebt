// Text helpers: Unicode normalization, Bidi/control sanitization, binary sniffing, linear-time company keys, and fuzzy matching.

const FOLD_MAP = {
  '\u0131': 'i', '\u0130': 'i', '\u015f': 's', '\u015e': 's', '\u011f': 'g', '\u011e': 'g',
  '\u00fc': 'u', '\u00dc': 'u', '\u00f6': 'o', '\u00d6': 'o', '\u00e7': 'c', '\u00c7': 'c',
  '\u00df': 'ss', '\u00f8': 'o', '\u00d8': 'o', '\u00e6': 'ae', '\u00c6': 'ae',
  '\u00e5': 'a', '\u00c5': 'a', '\u0142': 'l', '\u0141': 'l',
};

const FOLD_CHARS_RE = /[\u0131\u0130\u015f\u015e\u011f\u011e\u00fc\u00dc\u00f6\u00d6\u00e7\u00c7\u00df\u00f8\u00d8\u00e6\u00c6\u00e5\u00c5\u0142\u0141]/g;

// Dangerous C0/C1 control chars (preserving \t, \n, \r) and Unicode Bidi override/isolate chars (Trojan Source / UI spoofing).
const UNSAFE_CHARS_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function isUnsafeCodePoint(cp) {
  return cp < 0x20
    || cp > 0x10ffff
    || (cp >= 0x7f && cp <= 0x9f)
    || (cp >= 0xd800 && cp <= 0xdfff)
    || cp === 0x061c
    || cp === 0x200e
    || cp === 0x200f
    || (cp >= 0x202a && cp <= 0x202e)
    || (cp >= 0x2066 && cp <= 0x2069);
}

/** Strip dangerous invisible control characters and Unicode Bidi overrides. */
export function stripUnsafeChars(input) {
  if (!input) return '';
  return String(input).replace(UNSAFE_CHARS_RE, '');
}

/** Sanitize a single-line metadata field (name, company, title, headline) and enforce a strict character cap. */
export function cleanInline(input, maxLen = 300) {
  if (!input) return '';
  return stripUnsafeChars(input).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/** Sanitize an untrusted filename for UI display (blocks RLO extension spoofing, control chars, and length floods). */
export function sanitizeFileName(name, maxLen = 120) {
  const clean = stripUnsafeChars(name)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || 'archive';
  const flat = clean.replace(/\s+/g, ' ').trim() || 'archive';
  if (flat.length <= maxLen) return flat;
  const dot = flat.lastIndexOf('.');
  if (dot > 0 && flat.length - dot <= 12) {
    const ext = flat.slice(dot);
    return `${flat.slice(0, Math.max(16, maxLen - ext.length - 1))}…${ext}`;
  }
  return `${flat.slice(0, maxLen - 1)}…`;
}

const BINARY_ERROR_MSG = 'This file contains binary or non-text data rather than a LinkedIn CSV export.';

function binaryError() {
  return Object.assign(new Error(BINARY_ERROR_MSG), { code: 'BINARY_FILE' });
}

function hasMagicAt(b, offset, ascii) {
  if (b.byteLength < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (b[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

function hasMagicPrefix(b, ascii) {
  return hasMagicAt(b, 0, ascii);
}

function hasBytesPrefix(b, seq) {
  if (b.byteLength < seq.length) return false;
  for (let i = 0; i < seq.length; i++) {
    if (b[i] !== seq[i]) return false;
  }
  return true;
}

function isBinaryMagicHeader(b) {
  if (
    hasMagicPrefix(b, '%PDF-')
    || hasMagicPrefix(b, 'GIF87a')
    || hasMagicPrefix(b, 'GIF89a')
    || hasMagicPrefix(b, 'PK\x03\x04')
    || hasMagicPrefix(b, 'PK\x05\x06')
    || hasMagicPrefix(b, 'PK\x07\x08')
    || hasMagicPrefix(b, '\x7fELF')
    || hasMagicPrefix(b, '\x89PNG')
    || hasMagicPrefix(b, 'Rar!\x1a')
    || hasMagicPrefix(b, 'SQLite format 3')
    || hasMagicPrefix(b, 'MSCF\x00\x00\x00\x00')
    || hasMagicPrefix(b, '\x00asm')
    || hasBytesPrefix(b, [0xff, 0xd8, 0xff])
    || hasBytesPrefix(b, [0x1f, 0x8b])
    || hasBytesPrefix(b, [0x37, 0x7a, 0xbc, 0xaf])
    || hasBytesPrefix(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    || hasBytesPrefix(b, [0xfe, 0xed, 0xfa, 0xce])
    || hasBytesPrefix(b, [0xfe, 0xed, 0xfa, 0xcf])
    || hasBytesPrefix(b, [0xce, 0xfa, 0xed, 0xfe])
    || hasBytesPrefix(b, [0xcf, 0xfa, 0xed, 0xfe])
    || hasBytesPrefix(b, [0xca, 0xfe, 0xba, 0xbe])
    || hasBytesPrefix(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a])
    || hasBytesPrefix(b, [0x28, 0xb5, 0x2f, 0xfd])
    || hasBytesPrefix(b, [0x04, 0x22, 0x4d, 0x18])
  ) {
    return true;
  }
  // BZip2 stream ("BZh[1-9]1AY&SY")
  if (b.byteLength >= 10 && hasMagicPrefix(b, 'BZh') && b[3] >= 0x31 && b[3] <= 0x39 && hasMagicAt(b, 4, '1AY&SY')) {
    return true;
  }
  // RIFF container (WebP / WAV / AVI)
  if (b.byteLength >= 12 && hasMagicPrefix(b, 'RIFF') && (hasMagicAt(b, 8, 'WEBP') || hasMagicAt(b, 8, 'WAVE') || hasMagicAt(b, 8, 'AVI '))) {
    return true;
  }
  // Ogg container (RFC 3533 version byte 0x00) and FLAC stream
  if (b.byteLength >= 5 && hasMagicPrefix(b, 'OggS') && b[4] <= 0x04) {
    return true;
  }
  if (b.byteLength >= 8 && hasMagicPrefix(b, 'fLaC') && (b[4] & 0x7f) <= 6) {
    return true;
  }
  // ISO Base Media (MP4 / M4A / MOV / HEIC / AVIF)
  if (b.byteLength >= 12 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x00 && hasMagicAt(b, 4, 'ftyp')) {
    return true;
  }
  // Windows PE / DOS MZ executable (reject when header contains non-ASCII or control bytes)
  if (b.byteLength >= 4 && b[0] === 0x4d && b[1] === 0x5a) {
    const scanEnd = Math.min(b.byteLength, 64);
    for (let i = 2; i < scanEnd; i++) {
      const c = b[i];
      if (c < 0x09 || (c > 0x0d && c < 0x20) || c >= 0x7f) return true;
    }
  }
  return false;
}

/**
 * Inspect raw bytes of a CSV stream chunk for binary file signatures or NUL/control-byte floods.
 * When `allowUtf16Bom` is true on the first chunk, UTF-16LE/BE BOM streams are permitted and checked via decodeTextBytes.
 */
export function assertTextChunk(bytes, { isFirstChunk = false, allowUtf16Bom = false } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return;
  if (isFirstChunk) {
    if (bytes.byteLength >= 4) {
      const isUtf32Le = bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0x00 && bytes[3] === 0x00;
      const isUtf32Be = bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff;
      if (isUtf32Le || isUtf32Be) throw binaryError();
    }
    if (allowUtf16Bom && bytes.byteLength >= 2) {
      if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return;
    }
    if (isBinaryMagicHeader(bytes)) {
      throw binaryError();
    }
  }

  let ctrl = 0;
  for (let i = 0; i < bytes.byteLength; i++) {
    const c = bytes[i];
    if (c === 0x00) throw binaryError();
    if (c < 0x09 || (c > 0x0d && c < 0x20)) ctrl++;
  }
  if ((bytes.byteLength >= 32 && ctrl / bytes.byteLength > 0.05) || (bytes.byteLength < 32 && ctrl >= 4)) {
    throw binaryError();
  }
}

const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true });
const utf16LeFatalDecoder = new TextDecoder('utf-16le', { fatal: true });
const utf16BeFatalDecoder = new TextDecoder('utf-16be', { fatal: true });
const legacyWin1252Decoder = new TextDecoder('windows-1252');

function isControlOrNonChar(code) {
  return code < 0x09
    || (code > 0x0d && code < 0x20)
    || (code >= 0x7f && code <= 0x9f)
    || (code >= 0xfdd0 && code <= 0xfdef)
    || code === 0xfffe
    || code === 0xffff;
}

function validateDecodedUtf16(decoded) {
  let ctrl = 0;
  let hasCsvSep = false;
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    if (code === 0x0000) throw binaryError();
    if (isControlOrNonChar(code)) ctrl++;
    if (!hasCsvSep && (code === 0x09 || code === 0x0a || code === 0x0d || code === 0x20 || code === 0x2c || code === 0x3b)) {
      hasCsvSep = true;
    }
  }
  if ((decoded.length >= 8 && ctrl / decoded.length > 0.05) || (decoded.length < 8 && ctrl > 0)) {
    throw binaryError();
  }
  // Defeat fake 0xFF 0xFE / 0xFE 0xFF BOM binary streams (e.g. MPEG sync frames or high-byte binary blobs).
  if (decoded.length >= 64 && !hasCsvSep) {
    throw binaryError();
  }
  return decoded;
}

function validateDecodedUtf8(decoded) {
  let ctrl = 0;
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    if (code === 0x0000) throw binaryError();
    if (isControlOrNonChar(code)) ctrl++;
  }
  if ((decoded.length >= 16 && ctrl / decoded.length > 0.05) || (decoded.length < 16 && ctrl >= 2)) {
    throw binaryError();
  }
  return decoded;
}

/** Safely decode raw CSV bytes (UTF-8, UTF-16LE/BE with BOM, or low-density legacy 8-bit CSV), rejecting binary payloads. */
export function decodeTextBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.byteLength === 0) return '';
  if (u8.byteLength >= 2) {
    const isUtf32Le = u8.byteLength >= 4 && u8[0] === 0xff && u8[1] === 0xfe && u8[2] === 0x00 && u8[3] === 0x00;
    const isUtf32Be = u8.byteLength >= 4 && u8[0] === 0x00 && u8[1] === 0x00 && u8[2] === 0xfe && u8[3] === 0xff;
    if (isUtf32Le || isUtf32Be) throw binaryError();
    if (u8[0] === 0xff && u8[1] === 0xfe) {
      if (u8.byteLength % 2 !== 0) throw binaryError();
      try {
        return validateDecodedUtf16(utf16LeFatalDecoder.decode(u8.subarray(2)));
      } catch {
        throw binaryError();
      }
    }
    if (u8[0] === 0xfe && u8[1] === 0xff) {
      if (u8.byteLength % 2 !== 0) throw binaryError();
      try {
        return validateDecodedUtf16(utf16BeFatalDecoder.decode(u8.subarray(2)));
      } catch {
        throw binaryError();
      }
    }
  }
  assertTextChunk(u8, { isFirstChunk: true, allowUtf16Bom: false });
  try {
    return validateDecodedUtf8(utf8FatalDecoder.decode(u8));
  } catch (err) {
    if (err && err.code === 'BINARY_FILE') throw err;
    // Allow legacy Windows-1252 / ISO-8859 CSV exports only when mostly printable ASCII with sparse accented letters.
    let highBytes = 0;
    let rawC1 = 0;
    for (let i = 0; i < u8.byteLength; i++) {
      const b = u8[i];
      if (b >= 0x80) highBytes++;
      if (b === 0x7f || b === 0x81 || b === 0x8d || b === 0x8f || b === 0x90 || b === 0x9d) rawC1++;
    }
    if (u8.byteLength < 16 || highBytes / u8.byteLength > 0.20 || rawC1 / u8.byteLength > 0.01) {
      throw binaryError();
    }
    return validateDecodedUtf8(legacyWin1252Decoder.decode(u8));
  }
}

/** Lowercase, fold diacritics (incl. Turkish and European letters), collapse whitespace. */
export function fold(input) {
  if (!input) return '';
  return stripUnsafeChars(input)
    .replace(FOLD_CHARS_RE, (ch) => FOLD_MAP[ch])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES = Object.assign(Object.create(null), {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
});

/** Remove HTML tags in linear O(N) time and safely decode entities while blocking Bidi/control escapes. */
export function cleanText(input) {
  if (!input) return '';
  return stripUnsafeChars(
    stripUnsafeChars(input)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^<>]{1,500}>/g, '')
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (m, code) => {
        const key = code.toLowerCase();
        if (Object.hasOwn(ENTITIES, key)) return ENTITIES[key];
        if (key.startsWith('#')) {
          const cp = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
          if (!Number.isFinite(cp) || isUnsafeCodePoint(cp)) return ' ';
          return String.fromCodePoint(cp);
        }
        return m;
      }),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Single-line snippet of at most `max` characters, cut on a word boundary. */
export function snippet(input, max = 180) {
  const text = cleanText(input).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:!?-]+$/, '') + '…';
}

// Only corporate/legal entity wrappers are stripped; meaningful name words (Tech, Labs, Global, Software) stay intact.
// Evaluated via linear O(N) token popping so malicious repeated suffixes can never trigger regex backtracking.
const COMPANY_SUFFIX_SET = new Set([
  'incorporated', 'inc', 'llc', 'ltd', 'limited', 'plc', 'gmbh', 'ag', 'sa', 'bv', 'nv',
  'co', 'corp', 'corporation', 'company', 'group', 'grubu', 'grup', 'holding', 'holdings',
  'technologies', 'technology', 'teknoloji', 'teknolojileri',
  'as', 'sti', 'san', 'tic', 've', 'and', 'hizmetleri', '&',
]);

/** Canonical company key: "ACME Technologies, Inc." -> "acme", "Georgia Tech" -> "georgia tech". */
export function companyKey(name) {
  if (!name) return '';
  const base = fold(String(name).slice(0, 300))
    .replace(/\([^()]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}& ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  const words = base.split(' ');
  while (words.length > 0) {
    const last = words[words.length - 1];
    const prev = words.length >= 2 ? words[words.length - 2] : '';
    if ((prev === 's' && last === 'a') || (prev === 'a' && last === 's')) {
      words.pop();
      words.pop();
      continue;
    }
    if (COMPANY_SUFFIX_SET.has(last)) {
      words.pop();
      continue;
    }
    break;
  }
  return words.join(' ').trim() || base;
}

/** Levenshtein distance with early exit once it exceeds `limit`. */
export function editDistance(a, b, limit = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Does a company key match a user query? Word-bounded for 2-3 char queries; substring/fuzzy for longer queries. */
export function companyMatches(key, query, precomputedQueryKey = '', keyIsNormalized = false) {
  const k = keyIsNormalized ? String(key || '') : companyKey(key);
  const q = precomputedQueryKey || companyKey(String(query || '').slice(0, 120));
  if (!q || !k) return false;
  if (k === q) return true;
  if (CJK_RE.test(q)) return k.includes(q);
  const words = k.split(' ');
  if (q.length <= 3) return words.includes(q);
  if (k.includes(q)) return true;
  if (q.includes(k) && k.length >= 4) return true;
  const tolerance = q.length >= 8 ? 2 : 1;
  for (const word of words) {
    if (editDistance(word, q, tolerance) <= tolerance) return true;
  }
  return editDistance(k, q, tolerance) <= tolerance;
}

/** Normalized Unicode-preserving key for a person name. */
export function nameKey(name) {
  return fold(String(name || '').slice(0, 240)).replace(/[^\p{L}\p{N} ]+/gu, '').replace(/\s+/g, ' ').trim();
}

/** Extract the public slug from a LinkedIn profile URL without throwing on malformed percent escapes. */
export function profileSlug(url) {
  if (!url) return '';
  const m = stripUnsafeChars(String(url).slice(0, 500)).match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return '';
  try {
    return stripUnsafeChars(decodeURIComponent(m[1])).toLowerCase().slice(0, 160);
  } catch {
    return m[1].toLowerCase().slice(0, 160);
  }
}

export function firstName(name) {
  const parts = cleanInline(name, 200).split(/\s+/);
  return parts[0] || '';
}

/** Count how many of the given patterns occur in folded text. */
export function countMatches(foldedText, patterns) {
  let n = 0;
  for (const p of patterns) if (p.test(foldedText)) n++;
  return n;
}

/** Deterministic 32-bit PRNG (Mulberry32) shared by weekly picks and synthetic sample fixtures. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

