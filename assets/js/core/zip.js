// Dependency-free hardened streaming ZIP reader. Supports "stored" (0) and "deflate" (8) entries
// via DecompressionStream('deflate-raw') (modern browsers + Node 20+), random-access Blob slicing,
// incremental CRC-32 integrity verification, header-differential/overlap guards, and streaming ZIP-bomb & binary caps.
import { assertTextChunk, decodeTextBytes } from './text.js';

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;
const ZIP64_SENTINEL_32 = 0xffffffff;
const ZIP64_SENTINEL_16 = 0xffff;
const MAX_PATH_BYTES = 1024;
const DEFLATE_OVERHEAD_SLACK = 1024 * 1024;

export const MAX_ENTRIES = 10000;
export const MAX_CD_BYTES = 64 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 150 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

const utf8Fatal = new TextDecoder('utf-8', { fatal: false });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32Update(crc, chunk) {
  let c = crc >>> 0;
  for (let i = 0; i < chunk.byteLength; i++) {
    c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  }
  return c >>> 0;
}

function crc32Bytes(bytes) {
  return (crc32Update(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}

const damagedError = () => Object.assign(new Error('The .zip archive appears damaged or incomplete. Try downloading it from LinkedIn again.'), { code: 'ZIP_DAMAGED' });
const limitError = (msg) => Object.assign(new Error(msg), { code: 'ZIP_LIMIT' });
const encryptedError = () => Object.assign(new Error('Password-protected .zip archives are not supported. Please open the unencrypted archive from LinkedIn.'), { code: 'ZIP_ENCRYPTED' });

function resolveLimits(limits = {}) {
  return {
    maxEntries: limits.maxEntries ?? MAX_ENTRIES,
    maxCdBytes: limits.maxCdBytes ?? MAX_CD_BYTES,
    maxEntryBytes: limits.maxEntryBytes ?? MAX_ENTRY_BYTES,
    maxTotalBytes: limits.maxTotalBytes ?? MAX_TOTAL_BYTES,
  };
}

function validateCentralDirectoryBounds(eocdView, eocdOffset, totalSize, lim) {
  const diskNum = eocdView.getUint16(eocdOffset + 4, true);
  const cdDisk = eocdView.getUint16(eocdOffset + 6, true);
  const diskCount = eocdView.getUint16(eocdOffset + 8, true);
  const count = eocdView.getUint16(eocdOffset + 10, true);
  const cdSize = eocdView.getUint32(eocdOffset + 12, true);
  const cdOffset = eocdView.getUint32(eocdOffset + 16, true);

  if (diskNum !== 0 || cdDisk !== 0 || diskCount !== count) {
    throw limitError('Multi-part split .zip archives are not supported. Please open a single .zip archive from LinkedIn.');
  }
  if (count === ZIP64_SENTINEL_16) {
    throw limitError('ZIP64 archives with more than 65,535 files are not supported. Unzip the archive and select the 4 CSV files directly.');
  }
  if (cdSize === ZIP64_SENTINEL_32 || cdOffset === ZIP64_SENTINEL_32) {
    throw limitError('ZIP64 archives over 4 GB are not supported. Unzip the archive and select the 4 CSV files directly.');
  }
  if (count > lim.maxEntries) {
    throw limitError(`This .zip archive contains too many entries (${count.toLocaleString('en-US')}).`);
  }
  if (cdSize > lim.maxCdBytes) {
    throw limitError('This archive exceeds the safety size limit for in-browser reading.');
  }
  if (cdOffset > totalSize || cdSize > totalSize - cdOffset) {
    throw damagedError();
  }
  return { count, cdSize, cdOffset };
}

function findEocd(view) {
  if (view.byteLength < 22) return -1;
  const min = Math.max(0, view.byteLength - 65557);
  // First pass: prefer exact-EOF match so a fake PK\x05\x06 signature inside a comment or stored entry never wins.
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      const commentLen = view.getUint16(i + 20, true);
      if (i + 22 + commentLen === view.byteLength) return i;
    }
  }
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      const commentLen = view.getUint16(i + 20, true);
      if (i + 22 + commentLen <= view.byteLength) return i;
    }
  }
  return -1;
}

function normalizeSafeEntryPath(rawName) {
  for (let i = 0; i < rawName.length; i++) {
    const code = rawName.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) throw damagedError();
  }
  const normalized = rawName.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  for (const part of parts) {
    if (part === '..') throw damagedError();
  }
  return normalized;
}

function isSpecialUnixEntry(versionMadeBy, externalAttr) {
  const hostOs = (versionMadeBy >>> 8) & 0xff;
  if (hostOs !== 3) return false; // 3 = UNIX
  const fileType = ((externalAttr >>> 16) & 0o170000);
  if (fileType === 0) return false;
  // Allow only regular files (0o100000) and directories (0o040000); reject symlinks, FIFOs, sockets, and device nodes.
  return fileType !== 0o100000 && fileType !== 0o040000;
}

function parseCentralDirectory(cdBuffer, count, cdOffset) {
  const view = new DataView(cdBuffer);
  const bytes = new Uint8Array(cdBuffer);
  const entries = [];
  const spans = [];
  const seenPaths = new Set();
  let ptr = 0;
  for (let n = 0; n < count; n++) {
    if (ptr + 46 > view.byteLength || view.getUint32(ptr, true) !== SIG_CEN) {
      throw damagedError();
    }
    const versionMadeBy = view.getUint16(ptr + 4, true);
    const flags = view.getUint16(ptr + 8, true);
    if ((flags & 1) !== 0 || (flags & 0x40) !== 0) {
      throw encryptedError();
    }
    const method = view.getUint16(ptr + 10, true);
    const crc = view.getUint32(ptr + 16, true);
    const compSize = view.getUint32(ptr + 20, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const externalAttr = view.getUint32(ptr + 38, true);
    const offset = view.getUint32(ptr + 42, true);

    if (nameLen === 0 || nameLen > MAX_PATH_BYTES) {
      throw damagedError();
    }
    if (compSize === ZIP64_SENTINEL_32 || size === ZIP64_SENTINEL_32 || offset === ZIP64_SENTINEL_32) {
      throw limitError('ZIP64 archives over 4 GB are not supported. Unzip the archive and select the 4 CSV files directly.');
    }
    if (isSpecialUnixEntry(versionMadeBy, externalAttr)) {
      throw damagedError();
    }
    const nextPtr = ptr + 46 + nameLen + extraLen + commentLen;
    const minEnd = offset + 30 + nameLen + compSize;
    if (nextPtr > view.byteLength || offset + 30 > cdOffset || minEnd > cdOffset) {
      throw damagedError();
    }
    const rawName = utf8Fatal.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const name = normalizeSafeEntryPath(rawName);
    let entry = null;
    if (name && !name.endsWith('/')) {
      if (seenPaths.has(name)) throw damagedError();
      seenPaths.add(name);
      entry = { name, method, crc, compSize, size, offset, cdOffset, rawNameLen: nameLen, maxEndOffset: cdOffset };
      entries.push(entry);
    }
    spans.push({ offset, minEnd, entry });
    ptr = nextPtr;
  }

  // Defeat 42.zip / overlapping-entry bombs where multiple Central Directory headers share or overlap physical local entries.
  spans.sort((a, b) => a.offset - b.offset || a.minEnd - b.minEnd);
  for (let i = 0; i < spans.length; i++) {
    const nextOffset = i + 1 < spans.length ? spans[i + 1].offset : cdOffset;
    if (spans[i].minEnd > nextOffset) {
      throw damagedError();
    }
    if (spans[i].entry) {
      spans[i].entry.maxEndOffset = nextOffset;
    }
  }
  return entries;
}

/**
 * List entries in an in-memory ZIP ArrayBuffer.
 * @param {ArrayBuffer} buffer
 * @param {{maxEntries?:number, maxCdBytes?:number, maxEntryBytes?:number, maxTotalBytes?:number}} [limits]
 */
export function listZip(buffer, limits) {
  if (!buffer || typeof buffer.byteLength !== 'number') {
    throw new Error('This file is not a valid .zip archive.');
  }
  const lim = resolveLimits(limits);
  const view = new DataView(buffer);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('This file is not a valid .zip archive.');
  const { count, cdSize, cdOffset } = validateCentralDirectoryBounds(view, eocd, buffer.byteLength, lim);
  return parseCentralDirectory(buffer.slice(cdOffset, cdOffset + cdSize), count, cdOffset);
}

function precheckEntryCaps(entry, lim) {
  if (entry.size > lim.maxEntryBytes) {
    throw limitError('This archive exceeds the safety size limit for in-browser reading.');
  }
  if (entry.method === 0 && entry.compSize !== entry.size) {
    throw damagedError();
  }
  if (entry.method === 8 && entry.compSize > lim.maxEntryBytes + DEFLATE_OVERHEAD_SLACK) {
    throw limitError('This archive exceeds the safety size limit for in-browser reading.');
  }
}

const HEADER_SNIFF_BYTES = 16;

function classifyUtf16Header(hdr) {
  if (hdr.byteLength < 2) return false;
  const utf32 = hdr.byteLength >= 4 && (
    (hdr[0] === 0xff && hdr[1] === 0xfe && hdr[2] === 0x00 && hdr[3] === 0x00)
    || (hdr[0] === 0x00 && hdr[1] === 0x00 && hdr[2] === 0xfe && hdr[3] === 0xff)
  );
  return !utf32 && ((hdr[0] === 0xff && hdr[1] === 0xfe) || (hdr[0] === 0xfe && hdr[1] === 0xff));
}

function scanUtf16ZeroCodeUnits(chunk, carry) {
  let startIdx = 0;
  let nextCarry = carry;
  if (nextCarry >= 0) {
    if (nextCarry === 0 && chunk[0] === 0) {
      throw Object.assign(new Error('This file contains binary or non-text data rather than a LinkedIn CSV export.'), { code: 'BINARY_FILE' });
    }
    nextCarry = -1;
    startIdx = 1;
  }
  const endPairs = chunk.byteLength - ((chunk.byteLength - startIdx) & 1);
  for (let i = startIdx; i < endPairs; i += 2) {
    if (chunk[i] === 0 && chunk[i + 1] === 0) {
      throw Object.assign(new Error('This file contains binary or non-text data rather than a LinkedIn CSV export.'), { code: 'BINARY_FILE' });
    }
  }
  if (endPairs < chunk.byteLength) nextCarry = chunk[endPairs];
  return nextCarry;
}

async function inflateStream(sourceBlob, entry, lim, tracker, { checkText = false } = {}) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Your browser cannot open .zip files directly. Please update your browser or unzip the archive and select the CSV files.');
  }
  precheckEntryCaps(entry, lim);
  const stream = sourceBlob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let entryTotal = 0;
  let runningCrc = 0xffffffff;
  const headerBuf = new Uint8Array(HEADER_SNIFF_BYTES);
  let headerLen = 0;
  let headerChecked = false;
  let isUtf16 = false;
  let utf16Carry = -1;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      entryTotal += value.byteLength;
      tracker.total += value.byteLength;
      if (entryTotal > lim.maxEntryBytes || tracker.total > lim.maxTotalBytes) {
        await reader.cancel().catch(() => {});
        throw limitError('This archive exceeds the safety size limit for in-browser reading.');
      }
      if (checkText) {
        if (!headerChecked) {
          if (headerLen === 0 && value.byteLength >= HEADER_SNIFF_BYTES) {
            headerChecked = true;
            isUtf16 = classifyUtf16Header(value);
            assertTextChunk(value, { isFirstChunk: true, allowUtf16Bom: true });
            if (isUtf16) utf16Carry = scanUtf16ZeroCodeUnits(value, utf16Carry);
          } else {
            const take = Math.min(HEADER_SNIFF_BYTES - headerLen, value.byteLength);
            headerBuf.set(value.subarray(0, take), headerLen);
            headerLen += take;
            if (headerLen >= HEADER_SNIFF_BYTES) {
              headerChecked = true;
              const hdr = headerBuf.subarray(0, headerLen);
              isUtf16 = classifyUtf16Header(hdr);
              assertTextChunk(hdr, { isFirstChunk: true, allowUtf16Bom: true });
              if (isUtf16) utf16Carry = scanUtf16ZeroCodeUnits(hdr, utf16Carry);
              if (take < value.byteLength) {
                const rem = value.subarray(take);
                if (isUtf16) utf16Carry = scanUtf16ZeroCodeUnits(rem, utf16Carry);
                else assertTextChunk(rem, { isFirstChunk: false, allowUtf16Bom: false });
              }
            }
          }
        } else if (isUtf16) {
          utf16Carry = scanUtf16ZeroCodeUnits(value, utf16Carry);
        } else {
          assertTextChunk(value, { isFirstChunk: false, allowUtf16Bom: false });
        }
      }
      runningCrc = crc32Update(runningCrc, value);
      chunks.push(value);
    }
    if (checkText && !headerChecked && headerLen > 0) {
      const hdr = headerBuf.subarray(0, headerLen);
      isUtf16 = classifyUtf16Header(hdr);
      assertTextChunk(hdr, { isFirstChunk: true, allowUtf16Bom: true });
      if (isUtf16) {
        if ((entryTotal & 1) !== 0) {
          throw Object.assign(new Error('This file contains binary or non-text data rather than a LinkedIn CSV export.'), { code: 'BINARY_FILE' });
        }
        utf16Carry = scanUtf16ZeroCodeUnits(hdr, utf16Carry);
      }
    }
  } catch (err) {
    if (err && (err.code === 'ZIP_LIMIT' || err.code === 'BINARY_FILE')) {
      await reader.cancel().catch(() => {});
      throw err;
    }
    await reader.cancel().catch(() => {});
    throw damagedError();
  }

  const actualCrc = (runningCrc ^ 0xffffffff) >>> 0;
  if (entryTotal !== entry.size || (entry.crc !== undefined && actualCrc !== entry.crc)) {
    throw damagedError();
  }

  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(entryTotal);
  let pos = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    chunks[i] = null;
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

function checkStoredBytes(bytes, entry, lim, tracker) {
  precheckEntryCaps(entry, lim);
  tracker.total += bytes.byteLength;
  if (bytes.byteLength > lim.maxEntryBytes || tracker.total > lim.maxTotalBytes) {
    throw limitError('This archive exceeds the safety size limit for in-browser reading.');
  }
  if (entry.crc !== undefined && crc32Bytes(bytes) !== entry.crc) {
    throw damagedError();
  }
}

function parseLocalHeaderOffset(headerView, entry, maxEndOffset) {
  if (headerView.byteLength < 30 || headerView.getUint32(0, true) !== SIG_LOC) {
    throw damagedError();
  }
  const flags = headerView.getUint16(6, true);
  if ((flags & 1) !== 0 || (flags & 0x40) !== 0) {
    throw encryptedError();
  }
  const localMethod = headerView.getUint16(8, true);
  if (localMethod !== entry.method) {
    throw damagedError();
  }
  const localCrc = headerView.getUint32(14, true);
  const localCompSize = headerView.getUint32(18, true);
  const localSize = headerView.getUint32(22, true);
  const hasDataDescriptor = (flags & 0x08) !== 0;
  if (!hasDataDescriptor) {
    if ((entry.crc !== undefined && localCrc !== entry.crc) || localCompSize !== entry.compSize || localSize !== entry.size) {
      throw damagedError();
    }
  } else if ((localCompSize !== 0 && localCompSize !== entry.compSize) || (localSize !== 0 && localSize !== entry.size)) {
    throw damagedError();
  }
  const nameLen = headerView.getUint16(26, true);
  const extraLen = headerView.getUint16(28, true);
  if (nameLen === 0 || nameLen > MAX_PATH_BYTES || (entry.rawNameLen !== undefined && nameLen !== entry.rawNameLen)) {
    throw damagedError();
  }
  const ceiling = Math.min(maxEndOffset, entry.maxEndOffset ?? maxEndOffset);
  const start = entry.offset + 30 + nameLen + extraLen;
  if (start > ceiling || entry.compSize > ceiling - start) {
    throw damagedError();
  }
  return start;
}

/** Read one entry's uncompressed bytes from an ArrayBuffer. */
export async function readEntry(buffer, entry, limits, tracker = { total: 0 }, opts = {}) {
  const lim = resolveLimits(limits);
  const bound = Math.min(buffer.byteLength, entry.cdOffset ?? buffer.byteLength, entry.maxEndOffset ?? buffer.byteLength);
  if (entry.offset + 30 > bound) throw damagedError();
  const headerView = new DataView(buffer, entry.offset, 30);
  const start = parseLocalHeaderOffset(headerView, entry, bound);
  if (entry.method === 0) {
    const out = new Uint8Array(buffer, start, entry.compSize);
    checkStoredBytes(out, entry, lim, tracker);
    return out;
  }
  if (entry.method === 8) {
    precheckEntryCaps(entry, lim);
    const compBytes = new Uint8Array(buffer, start, entry.compSize);
    return inflateStream(new Blob([compBytes]), entry, lim, tracker, opts);
  }
  throw Object.assign(new Error(`Unsupported compression method in ${entry.name}.`), { code: 'ZIP_METHOD' });
}

/** Read an in-memory ArrayBuffer ZIP into a Map of path -> lazy text loader. */
export function readZip(buffer, limits) {
  const lim = resolveLimits(limits);
  const tracker = { total: 0 };
  const files = new Map();
  for (const entry of listZip(buffer, lim)) {
    files.set(entry.name, async () => decodeTextBytes(await readEntry(buffer, entry, lim, tracker, { checkText: true })));
  }
  return files;
}

/**
 * Random-access Blob/File ZIP reader: reads ONLY the Central Directory and slices ONLY
 * requested entries, allowing 1 GB+ Complete LinkedIn exports with Rich Media to open in <10 MB RAM.
 */
export async function readZipBlob(blob, limits) {
  if (!blob || typeof blob.size !== 'number' || !Number.isFinite(blob.size) || typeof blob.slice !== 'function') {
    throw new Error('This file is not a valid .zip archive.');
  }
  const lim = resolveLimits(limits);
  if (blob.size < 22) throw new Error('This file is not a valid .zip archive.');
  const tailSize = Math.min(blob.size, 65557);
  const tailOffset = blob.size - tailSize;
  const tail = await blob.slice(tailOffset, blob.size).arrayBuffer();
  const tv = new DataView(tail);
  const eocd = findEocd(tv);
  if (eocd < 0) throw new Error('This file is not a valid .zip archive.');

  const { count, cdSize, cdOffset } = validateCentralDirectoryBounds(tv, eocd, blob.size, lim);
  const cd = await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
  const entries = parseCentralDirectory(cd, count, cdOffset);
  const tracker = { total: 0 };
  const files = new Map();

  for (const entry of entries) {
    files.set(entry.name, async () => {
      precheckEntryCaps(entry, lim);
      if (entry.offset + 30 > cdOffset) throw damagedError();
      const locBuf = await blob.slice(entry.offset, entry.offset + 30).arrayBuffer();
      const start = parseLocalHeaderOffset(new DataView(locBuf), entry, cdOffset);
      const slice = blob.slice(start, start + entry.compSize);
      if (entry.method === 0) {
        const bytes = new Uint8Array(await slice.arrayBuffer());
        checkStoredBytes(bytes, entry, lim, tracker);
        return decodeTextBytes(bytes);
      }
      if (entry.method === 8) {
        return decodeTextBytes(await inflateStream(slice, entry, lim, tracker, { checkText: true }));
      }
      throw Object.assign(new Error(`Unsupported compression method in ${entry.name}.`), { code: 'ZIP_METHOD' });
    });
  }
  return files;
}

