// Shared analysis pipeline: input (zip / csv files / sample / raw data) -> { report, quotes, candidates }.
// Runs inside the Web Worker on http(s), or on the main thread on file://.
import { readZip, readZipBlob, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES } from '../core/zip.js';
import { loadExport } from '../core/loader.js';
import { decodeTextBytes } from '../core/text.js';
import { analyzeSession } from '../analyze/index.js';
import { sampleFiles } from '../demo/sample.js';

export const MAX_CSV_FILES = 128;

async function filesFromInput(input) {
  if (input.kind === 'sample') return sampleFiles();
  if (input.kind === 'zip') {
    if (input.buffer) return readZip(input.buffer);
    if (input.file) return readZipBlob(input.file);
    throw new Error('No archive file was provided.');
  }
  if (input.kind === 'csv') {
    if (!Array.isArray(input.files) || input.files.length === 0) {
      throw new Error('No CSV files were provided.');
    }
    if (input.files.length > MAX_CSV_FILES) {
      throw Object.assign(new Error(`Too many files selected (${input.files.length}). Select only the 4 LinkedIn CSV files or the .zip archive.`), { code: 'ZIP_LIMIT' });
    }
    const maxEntry = input.maxEntryBytes ?? MAX_ENTRY_BYTES;
    const maxTotal = input.maxTotalBytes ?? MAX_TOTAL_BYTES;
    let totalBytes = 0;
    return new Map(input.files.map((f) => [
      String(f.webkitRelativePath || f.name || ''),
      async () => {
        const size = typeof f.size === 'number' && Number.isFinite(f.size) ? f.size : 0;
        if (size < 0 || size > maxEntry || totalBytes + size > maxTotal) {
          throw Object.assign(new Error('This archive exceeds the safety size limit for in-browser reading.'), { code: 'ZIP_LIMIT' });
        }
        if (typeof f.arrayBuffer === 'function') {
          const buf = await f.arrayBuffer();
          totalBytes += buf.byteLength;
          if (buf.byteLength > maxEntry || totalBytes > maxTotal) {
            throw Object.assign(new Error('This archive exceeds the safety size limit for in-browser reading.'), { code: 'ZIP_LIMIT' });
          }
          return decodeTextBytes(buf);
        }
        const text = await f.text();
        totalBytes += Math.max(size, text.length);
        if (text.length > maxEntry || totalBytes > maxTotal) {
          throw Object.assign(new Error('This archive exceeds the safety size limit for in-browser reading.'), { code: 'ZIP_LIMIT' });
        }
        if (text.includes('\u0000')) {
          throw Object.assign(new Error('This file contains binary or non-text data rather than a LinkedIn CSV export.'), { code: 'BINARY_FILE' });
        }
        return text;
      },
    ]));
  }
  throw new Error('Unsupported input.');
}

export async function runPipeline(input, onProgress = () => {}) {
  let data = input.data;
  if (!data) {
    onProgress('Opening your archive', 3);
    const files = await filesFromInput(input);
    data = await loadExport(files, onProgress);
  }
  onProgress('Finding people who are waiting on you', 88);
  const { report, quotes, candidates } = analyzeSession(data, { override: input.override });
  if (input.kind === 'sample') report.isSample = true;
  onProgress('Done', 100);
  return { report, quotes, candidates };
}
