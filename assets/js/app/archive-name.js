// LinkedIn archive file names look like "Basic_LinkedInDataExport_10-30-2026.zip"
// (sometimes ".zip.zip" on Windows) or "Complete_LinkedInDataExport_10-31-2026.zip".
// Browsers append temporary suffixes (.crdownload, .part, .download) while downloading.

const IN_PROGRESS = /\.(crdownload|part|download|tmp|partial)$/i;

export function isLinkedInArchiveName(name) {
  const s = String(name || '');
  if (!s || s.length > 512 || IN_PROGRESS.test(s)) return false;
  const low = s.toLowerCase();
  if (!low.endsWith('.zip')) return false;
  const i1 = low.indexOf('linkedin');
  if (i1 < 0) return false;
  const i2 = low.indexOf('data', i1 + 8);
  if (i2 < 0) return false;
  return low.indexOf('export', i2 + 4) >= 0;
}
