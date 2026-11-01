# Security Policy

## Architecture & Scope

Network Audit is a zero-dependency, client-side static web application. It has no application server, database, authentication system, or backend API. User archives are parsed locally inside the user's browser tab (`Web Worker` + `DecompressionStream`).

Key browser-enforced controls in scope for security review:

- Strict Content-Security-Policy (`default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`).
- Chromium Trusted Types enforcement (`require-trusted-types-for 'script'`, single `app-worker` policy restricted exclusively to `createScriptURL` for `assets/app.bundle.js`, with `createHTML` and `createScript` omitted).
- Zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or `new Function` across the repository (enforced in CI via `tests/hygiene.test.mjs`), plus DOM sink guards blocking inline event strings, `srcdoc`, and `javascript:`/`vbscript:`/`data:` URLs.
- Hardened streaming ZIP reader (`assets/js/core/zip.js`) enforcing incremental IEEE 802.3 CRC-32 verification, uncompressed and compressed byte caps, central-vs-local compression method/filename-length/bounds checks, sorted non-overlapping local entry spans (`42.zip` and Fifield central-directory overlap defense), path traversal / NUL / Unix symlink / duplicate entry rejection, and single-disk EOCD validation.
- Byte-level binary signature and NUL/control/C1-byte sniffing (`assets/js/core/text.js`) on both `.zip` entries and raw `.csv` uploads, rejecting disguised executables (PE, ELF, Mach-O, WASM, Java `.class`), Office/OLE2 containers, SQLite, PDFs, images/media, nested archives, fake UTF-16 BOMs, and high-byte binary streams via fatal UTF-8/UTF-16 decoding and bounded legacy 8-bit CSV fallback.
- Bounded linear-time RFC 4180 CSV, text, and conversation parsers (`assets/js/core/csv.js`, `assets/js/core/loader.js`, `assets/js/core/model.js`) enforcing row (`250,000`), column (`256`), cell (`131,072` chars), and total-cell (`4,000,000`) caps, mandatory primary LinkedIn CSV header verification, Unicode Bidi override stripping (`U+202A–U+202E`, `U+2066–U+2069`, `U+061C`), and $O(N)$ non-backtracking filename/company/HTML normalization and participant indexing.
- Isolated Web Worker crash bulkhead (`assets/js/app/client.js`) that terminates and respawns a worker if an input crashes mid-parse rather than re-executing the crashing payload on the main UI thread.
- Strict LinkedIn profile URL allowlisting (`https://` `(www.|<cc>.)linkedin.com` `/in/...` or `/pub/...` with credentials, custom ports, open-redirect paths, and query/hash stripped) and IndexedDB report schema/retention validation.
- Structural exclusion of connection email addresses at CSV parse time and zero disk persistence of raw message text or InMail subjects.

## Reporting a Vulnerability

Please report security vulnerabilities privately through GitHub's Private Vulnerability Reporting:

- **Report URL:** https://github.com/networkaudit/networkaudit.github.io/security/advisories/new

Please do not open a public GitHub issue for undisclosed security vulnerabilities. Include a minimal proof-of-concept (for example, a synthetic `.zip` or `.csv` fixture containing no real personal data) and browser version details so the issue can be reproduced quickly.

We aim to acknowledge reports within 72 hours and publish a fix and advisory once verified.
