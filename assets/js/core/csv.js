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
  const allAliases = Object.values(fieldMap).flat();
  const headerIdx = findHeaderRow(rows, allAliases);
  if (headerIdx < 0) return { records: [], header: [], missing: Object.keys(fieldMap) };

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
