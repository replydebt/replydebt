// RFC 4180 CSV parser tuned for LinkedIn exports
// (quoted multi-line fields, doubled quotes, mid-field literal quotes, BOM, "Notes:" preamble, row/column/cell caps).

export const MAX_CSV_ROWS = 250000;
export const MAX_CSV_COLS = 256;
export const MAX_CSV_CELL_CHARS = 131072;
export const MAX_CSV_TOTAL_CELLS = 4000000;

function csvLimitError(msg) {
  return Object.assign(new Error(msg), { code: 'CSV_LIMIT' });
}

/** Parse CSV text into an array of rows (arrays of strings). */
export function parseRows(text, maxRows = MAX_CSV_ROWS, opts = {}) {
  const rows = [];
  if (!text) return rows;
  const maxCols = opts.maxCols ?? MAX_CSV_COLS;
  const maxCellChars = opts.maxCellChars ?? MAX_CSV_CELL_CHARS;
  const maxTotalCells = opts.maxTotalCells ?? MAX_CSV_TOTAL_CELLS;

  let i = 0;
  const len = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  let row = [];
  let field = '';
  let inQuotes = false;
  let atFieldStart = true;
  let totalCells = 0;

  const appendChar = (ch) => {
    if (field.length >= maxCellChars) {
      throw csvLimitError(`A cell in this CSV file exceeds the maximum safe length (${maxCellChars.toLocaleString('en-US')} characters).`);
    }
    field += ch;
  };

  const pushField = () => {
    if (row.length >= maxCols) {
      throw csvLimitError(`A row in this CSV file exceeds the maximum column limit (${maxCols} columns).`);
    }
    totalCells++;
    if (totalCells > maxTotalCells) {
      throw csvLimitError('This CSV file contains too many cells for safe in-browser parsing.');
    }
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    rows.push(row);
    if (rows.length > maxRows) {
      throw csvLimitError(`A CSV file in this archive exceeds the maximum row limit (${maxRows.toLocaleString('en-US')} rows).`);
    }
  };

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          appendChar('"');
          i += 2;
          continue;
        }
        inQuotes = false;
        atFieldStart = false;
        i++;
        continue;
      }
      appendChar(ch);
      i++;
      continue;
    }
    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      atFieldStart = true;
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      pushField();
      pushRow();
      row = [];
      atFieldStart = true;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    appendChar(ch);
    atFieldStart = false;
    i++;
  }
  if (field !== '' || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Find the header row: the first row containing at least `minHits` of the expected header names.
 * LinkedIn's Connections.csv starts with a "Notes:" paragraph before the real header.
 */
export function findHeaderRow(rows, expected, minHits = 2) {
  const wanted = expected.map(norm);
  const limit = Math.min(rows.length, 25);
  for (let r = 0; r < limit; r++) {
    const cells = rows[r].map(norm);
    let hits = 0;
    for (const w of wanted) if (cells.includes(w)) hits++;
    if (hits >= Math.min(minHits, wanted.length)) return r;
  }
  return -1;
}

/**
 * Parse CSV into objects using a field map: { fieldName: ['Header alias 1', 'alias 2', ...] }.
 * Returns { records, header, missing } where missing lists fields not found in the header.
 */
export function parseCsv(text, fieldMap, { maxRows = MAX_CSV_ROWS, maxCols = MAX_CSV_COLS, maxCellChars = MAX_CSV_CELL_CHARS, maxTotalCells = MAX_CSV_TOTAL_CELLS } = {}) {
  const rows = parseRows(text, maxRows, { maxCols, maxCellChars, maxTotalCells });
  const fieldCount = Object.keys(fieldMap || {}).length;
  const allAliases = Object.values(fieldMap || {}).flat();
  const headerIdx = fieldCount > 0 ? findHeaderRow(rows, allAliases, Math.min(2, fieldCount)) : -1;
  if (headerIdx < 0) return { records: [], header: [], missing: Object.keys(fieldMap || {}) };

  const header = rows[headerIdx].map(norm);
  const index = Object.create(null);
  const missing = [];
  for (const [field, aliases] of Object.entries(fieldMap)) {
    const pos = aliases.map(norm).map((a) => header.indexOf(a)).find((p) => p >= 0);
    if (pos === undefined) missing.push(field);
    else index[field] = pos;
  }

  const fields = Object.keys(fieldMap);
  const records = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === '') continue;
    const rec = Object.create(null);
    for (const field of fields) {
      const pos = index[field];
      rec[field] = pos === undefined ? '' : (row[pos] ?? '').trim();
    }
    records.push(rec);
  }
  return { records, header: rows[headerIdx], missing };
}

/**
 * Parse a CSV that may contain duplicate column headers (such as LinkedIn's Ad_Targeting.csv),
 * coalescing all non-empty values across every matching column for each field.
 */
export function parseDuplicateHeaderCsv(text, fieldMap, opts = {}) {
  const rows = parseRows(text, opts.maxRows ?? MAX_CSV_ROWS, opts);
  const fieldCount = Object.keys(fieldMap || {}).length;
  const allAliases = Object.values(fieldMap || {}).flat();
  const headerIdx = fieldCount > 0 ? findHeaderRow(rows, allAliases, Math.min(2, fieldCount)) : -1;
  if (headerIdx < 0) return { records: [], header: [], missing: Object.keys(fieldMap || {}) };

  const header = rows[headerIdx].map(norm);
  const positions = Object.create(null);
  const missing = [];
  for (const [field, aliases] of Object.entries(fieldMap)) {
    const wanted = new Set(aliases.map(norm));
    const cols = [];
    for (let c = 0; c < header.length; c++) {
      if (wanted.has(header[c])) cols.push(c);
    }
    if (!cols.length) missing.push(field);
    else positions[field] = cols;
  }

  const fields = Object.keys(fieldMap);
  const records = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === '') continue;
    const rec = Object.create(null);
    for (const field of fields) {
      const cols = positions[field];
      if (!cols) {
        rec[field] = '';
        continue;
      }
      const seen = new Set();
      const parts = [];
      for (const c of cols) {
        const val = (row[c] ?? '').trim();
        if (val && !seen.has(val)) {
          seen.add(val);
          parts.push(val);
        }
      }
      rec[field] = parts.join('; ');
    }
    records.push(rec);
  }
  return { records, header: rows[headerIdx], missing };
}

/**
 * Parse LinkedIn's wide time-series Inferred Credibility Scores.csv
 * (ScoreType, Topic, Category, Range, followed by YYYY-MM-DD snapshot columns).
 */
export function parseCredibilityCsv(text, opts = {}) {
  const rows = parseRows(text, opts.maxRows ?? MAX_CSV_ROWS, opts);
  const headerIdx = findHeaderRow(rows, ['ScoreType', 'Topic', 'Category', 'Range'], 3);
  if (headerIdx < 0) return [];
  const rawHeader = rows[headerIdx];
  const header = rawHeader.map(norm);
  const iType = header.indexOf('scoretype');
  const iTopic = header.indexOf('topic');
  const iCat = header.indexOf('category');
  const iRange = header.indexOf('range');
  if (iType < 0 || iCat < 0) return [];

  const dateCols = [];
  for (let c = 0; c < rawHeader.length; c++) {
    const label = String(rawHeader[c] || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) dateCols.push({ col: c, date: label });
  }
  dateCols.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!dateCols.length) return [];

  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const scoreType = (row[iType] ?? '').trim();
    const category = (row[iCat] ?? '').trim();
    if (!scoreType || !category) continue;
    let latest = null;
    let latestDate = '';
    let earliest = null;
    let earliestDate = '';
    let snapshots = 0;
    for (const { col, date } of dateCols) {
      const raw = (row[col] ?? '').trim();
      if (!raw) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      if (snapshots === 0) {
        latest = num;
        latestDate = date;
      }
      earliest = num;
      earliestDate = date;
      snapshots++;
    }
    if (snapshots === 0) continue;
    out.push({
      scoreType,
      topic: iTopic >= 0 ? (row[iTopic] ?? '').trim() : '',
      category,
      range: iRange >= 0 ? (row[iRange] ?? '').trim() : '',
      latest,
      latestDate,
      earliest,
      earliestDate,
      snapshots,
    });
  }
  return out;
}
