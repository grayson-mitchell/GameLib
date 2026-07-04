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
| T-07-03 | Tampering / Injection | External URL → `BrowserWindow.loadURL` (`AppleRatingOverlay.tsx`) | mitigate | URL scheme+host are a fixed literal prefix (`https://www.codeweavers.com/...`); wiki `crossoverLink` / `gameInfo.title` are now wrapped in `encodeURIComponent` so they cannot inject path/query/fragment structure — and cannot change the origin regardless. Target BrowserWindow uses Electron secure defaults (nodeIntegration off, contextIsolation on). | closed |
| T-07-04 | Information Disclosure / SSRF | AppleGamingWiki fetch with browser UA (`applegamingwiki/utils.ts`) | mitigate | Request host is hardcoded (`www.applegamingwiki.com`); no user-controlled host ⇒ no SSRF. No credentials/cookies/secrets sent; the static browser UA solely satisfies Cloudflare. Search `title` is now `encodeURIComponent`-encoded (and additionally pre-sanitized by `removeSpecialcharacters`). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| ~~R-07-01~~ | T-07-03 | RESOLVED — hardened: `crossoverLink` and `gameInfo.title` now wrapped in `encodeURIComponent`. No longer an accepted risk. | grayson.mitchell | 2026-07-04 |
| ~~R-07-02~~ | T-07-04 | RESOLVED — hardened: AppleGamingWiki search `title` now `encodeURIComponent`-encoded (replaced manual `%20`). No longer an accepted risk. | grayson.mitchell | 2026-07-04 |

*No open accepted risks — both prior residuals were hardened. Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-04 | 4 | 4 | 0 | secure-phase (inline, full-context) |
| 2026-07-04 | 4 | 4 | 0 | hardening pass — R-07-01/R-07-02 resolved via encodeURIComponent |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-04
