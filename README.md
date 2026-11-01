# Reply Debt

**Reply Debt** (<https://replydebt.github.io>) is a client-side, zero-dependency browser utility that reads an official LinkedIn data export (`.zip` or `.csv`) locally on your device and organizes it into four actionable lists:

1. **Replies** — 1:1 conversations where the other person wrote last or asked an unanswered question (filtering out short sign-offs, group chats, sales pitches, and threads answered in a newer conversation).
2. **Recruiters** — Inbound recruiter outreach across messages, InMails, and invitation notes, deduplicated per person with editable reply templates.
3. **Reconnect** — Five connections per week with real two-way message history and social-capital trust signals who have gone quiet for over six months.
4. **Companies** — Connections grouped by normalized employer (plus a **Following** filter for followed/dream target companies) and ranked by two-way conversation warmth, recommendations, endorsements, and shared-employer alumni history.

When you open LinkedIn's full 24–48h **Complete Data Archive** (or full Basic archive), Reply Debt also unlocks **`#/insights` (Archive & Algorithm Insights)**:
- **Topic Credibility & 5-Pillar Authority (`Inferred Credibility Scores.csv`):** Decodes your discrete Notability Tier (`0–4`), continuous Notability Score (`0–5`), 5-pillar specialty grades (`Role & scope`, `Tenure`, `Content output`, `Credentials`, `Validation`), and `100+` normalized feed topic scores (`1.00–4.00`) with historical trend deltas.
- **Algorithmic Inferences & Ad Persona (`Inferences_about_you.csv`, `Ad_Targeting.csv`, `Skills.csv`):** Reveals how LinkedIn's ad and ranking engines classify your seniority, job functions, and high-value buyer segments while structurally excluding personal demographic categories (`Member Age`, `Member Gender`, `Inferred personal characteristics`).
- **Social Capital & Outbound Invitation Hygiene:** Surfaces endorsement/recommendation depth, shared-company alumni counts, followed companies already inside your 1st-degree network, and stale unaccepted outgoing invitations (`> 90 days`).
- **Aggregate Activity Footprint:** Summarizes post, comment, poll-vote, repost, search, hashtag, and 7-type reaction counts (`LIKE`, `PRAISE`, `APPRECIATION`, `EMPATHY`, `INTEREST`, `ENTERTAINMENT`, `MAYBE`) while dropping raw post commentary, comment prose, and search query strings.
- **Quarantined Sensitive Files (Never Decompressed or Read):** `Email Addresses.csv`, `PhoneNumbers.csv`, `Whatsapp Phone Numbers.csv`, `Receipts_v2.csv`, `Verifications.csv`, `Logins.csv`, `Security Challenges.csv`, `Registration.csv`, and `Notes.csv` are automatically quarantined and never read into memory.

> **Independent open-source tool · Not affiliated with LinkedIn.**
> Reply Debt is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation.

---

## Privacy & Security Architecture

- **100% local execution, zero runtime dependencies:** Built entirely on browser-native Web APIs (`DecompressionStream`, Web Workers, `IndexedDB`). Zero npm packages in production or development.
- **Strict Content Security Policy & Trusted Types:**
  - `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'`
  - Zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or inline `<script>` / `style="..."` attributes anywhere in the codebase.
- **Memory-only (RAM) by default:** Before any real archive is opened, a pre-open transparency prompt defaults browser persistence to **OFF**. Closing or refreshing the tab erases everything.
- **Structural storage minimization:** Even if a user opts in to 90-day local saving, raw message bodies, InMail subjects, invitation notes, email addresses (`Email Address` in `Connections.csv` is dropped during CSV mapping), and the raw `.zip` file are structurally excluded from the persisted report object.
- **Random-access streaming ZIP & CSV fortress:** Reads only the End of Central Directory and Central Directory headers via `Blob.slice()`, verifies per-entry CRC-32 checksums and non-overlapping header bounds, rejects binary executables/polyglots/symlinks/traversal entries, enforces strict uncompressed byte (`150 MB` per entry, `250 MB` total) and CSV cell/column/row caps, strips Unicode Bidi spoofing characters, and isolates mid-parse crashes inside the Web Worker.
- **Offline & `file://` compatible:** Works over `https://`, local `http://127.0.0.1`, or opened directly from disk (`file://`) with air-gapped Wi-Fi turned off.

Full legal disclosures (GDPR Articles 13 & 15–22 and Turkish KVKK Articles 10 & 11) are available in [`privacy.html`](privacy.html).

---

## Development & Verification

Requires **Node.js 20+** (uses Node's built-in `node:test`, `node:http`, and `node:zlib` modules; zero `npm install` packages required).

```bash
# Bundle assets/js/** into assets/app.bundle.js
npm run build

# Verify bundle and static HTML CSP/metadata are in sync
npm run build:check

# Start a local static server on http://127.0.0.1:8080
npm run serve

# Run the unit, classifier, resilience, and repository hygiene test suite
npm test

# Build a clean production artifact directory in dist/ (enforces strict file allowlist)
npm run dist

# Run headless Chromium end-to-end verification across both http:// and file://
npm run e2e
```

---

## Repository Structure

```text
index.html                  Single-page application shell with pre-rendered semantic landing content
privacy.html                Standalone GDPR & KVKK Privacy & Data Protection Notice
404.html                    Standalone 404 page for GitHub Pages
robots.txt                  Search crawler directives and XML sitemap pointer
sitemap.xml                 Canonical XML sitemap for indexable pages
.well-known/security.txt    RFC 9116 security contact metadata
assets/
  app.bundle.js             Generated universal bundle (Window + Web Worker + file://)
  css/                      Design tokens, layout, components, and page styles
  img/                      Brand mark (favicon.svg), iOS home-screen icon (apple-touch-icon.png), and OpenGraph preview (og-image.png)
  js/
    config.js               Product constants, CSP builder, and optional pixel config
    theme-init.js           Pre-paint theme and frame-embed guard
    main.js                 Boot, pre-open transparency gate, routing, modals, drag-drop
    core/                   Streaming ZIP reader, RFC 4180 CSV parser, 21-locale dates, identity, model, IndexedDB store
    analyze/                Recruiter, reply-debt, reconnect, company warmth, archive insights, and template engines
    app/                    Worker client, pipeline, session/storage state, and archive handoff
    ui/                     DOM builder (h), createElementNS SVG icons, portaled menus, modals, composer
    pages/                  Welcome, Home, Replies, Recruiters, Reconnect, Companies, Insights, Rails
    worker/                 Web Worker entry point
tools/                      Zero-dependency bundler, static server, dist builder, fixture/OG generators, E2E runner
tests/                      Node test suite and synthetic sample fixture
```

---

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Nayri Akbuğa.
