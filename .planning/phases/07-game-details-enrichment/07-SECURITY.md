---
phase: 7
slug: game-details-enrichment
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-04
---

# Phase 7 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Covers DETAIL-01 (platform-support icons + install-platform derivation) and
DETAIL-02 (AppleGamingWiki compatibility overlay). The plan-time register
(07-02-PLAN.md) covered DETAIL-01; T-07-03/T-07-04 were added retroactively for
the DETAIL-02 code exercised and fixed during UAT (see 07-UAT.md).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Steam appdetails API → backend | Public JSON already consumed by `fetchMetadataIfNeeded`; `data.platforms` are booleans coerced via `!!`. | Platform-support booleans (low sensitivity) |
| AppleGamingWiki MediaWiki API → backend | Public JSON/wikitext fetched over HTTPS with a browser User-Agent (Cloudflare requires it). Host is hardcoded. | Community-editable wiki text → parsed rating strings + `crossoverLink` (untrusted) |
| Wiki/game-derived URL → in-app BrowserWindow | `createNewWindow` (main.ts:749) loads a URL into a new Electron `BrowserWindow`. DETAIL-02 builds that URL from `crossoverLink`/`gameInfo.title`. | URL string (semi-trusted) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | Tampering | appdetails `platforms` object | accept | Values coerced with `!!` to boolean (`library.ts:211,326`); no injection path. Existing behavior, unchanged. | closed |
| T-07-02 | Denial of Service | `getGameInfo` re-fetch guard | mitigate | `platformsCaptured` sentinel (`games.ts:165`) + `pendingFetches` dedup added before the await (`games.ts:186-187`) ⇒ at most one in-flight fetch per game; delisted-branch exclusion prevents re-fetch loops. | closed |
| T-07-03 | Tampering / Injection | External URL → `BrowserWindow.loadURL` (`AppleRatingOverlay.tsx:35,39`) | mitigate | URL scheme+host are a fixed literal prefix (`https://www.codeweavers.com/...`); wiki `crossoverLink` / `gameInfo.title` are appended only to path/query/fragment and **cannot change the origin**. Target BrowserWindow uses Electron secure defaults (nodeIntegration off, contextIsolation on). | closed |
| T-07-04 | Information Disclosure / SSRF | AppleGamingWiki fetch with browser UA (`applegamingwiki/utils.ts`) | accept | Request host is hardcoded (`www.applegamingwiki.com`); no user-controlled host ⇒ no SSRF. No credentials/cookies/secrets sent; the static browser UA solely satisfies Cloudflare. `title` in the search query is pre-sanitized by `removeSpecialcharacters` (strips `& ? % / \ < > { } " '` etc.). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-07-01 | T-07-03 | The DETAIL-02 click-through URL appends `crossoverLink`/`gameInfo.title` without `encodeURIComponent`. Blast radius is bounded to the fixed `codeweavers.com` origin (cannot escape to another host) and the window runs with secure Electron defaults, so worst case is a malformed/benign same-origin URL. Hardening recommendation: wrap both interpolations in `encodeURIComponent`. Low residual risk accepted for this phase. | grayson.mitchell | 2026-07-04 |
| R-07-02 | T-07-04 | AppleGamingWiki `getPageID` builds its search URL with a manual `%20` replace rather than `encodeURIComponent`. Pre-existing (phase 7 only added the User-Agent header); inputs are pre-stripped by `removeSpecialcharacters`. Low residual risk accepted. | grayson.mitchell | 2026-07-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-04 | 4 | 4 | 0 | secure-phase (inline, full-context) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-04
