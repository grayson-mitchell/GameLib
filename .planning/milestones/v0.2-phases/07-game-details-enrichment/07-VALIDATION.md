---
phase: 7
slug: game-details-enrichment
status: approved
nyquist_compliant: false
wave_0_complete: true
created: 2026-07-04
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed retroactively from 07-02-PLAN.md, 07-02-SUMMARY.md, 07-UAT.md, and
> 07-SECURITY.md (State B). Covers DETAIL-01 (platform-support icons + install-platform
> derivation) and DETAIL-02 (AppleGamingWiki compatibility overlay).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `jest.config.js` (`resetMocks: true`) |
| **Quick run command** | `npx jest src/backend/storeManagers/steam src/backend/wiki_game_info/applegamingwiki --no-coverage` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~2 seconds (touched suites); full suite longer |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched area
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds (targeted suites)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-02-01 | 02 | 1 | DETAIL-01 (GAP1 self-heal re-fetch) | T-07-02 | Re-fetch fires at most once per game; `pendingFetches` dedup + `!is_delisted` guard prevent fetch loops | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ green |
| 07-02-02 | 02 | 1 | DETAIL-01 (GAP2 host-derived install platform) | — | N/A | unit | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts` | ✅ | ✅ green |
| 07-02-03 | 02 | 1 | DETAIL-01 (GAP3 icon spacing) | — | N/A | manual | — | — | 📋 manual |
| 07-02-D02a | 02 | 1 | DETAIL-02 (AppleGamingWiki fetch + "none found" marker) | T-07-01 | Wiki text parsed to rating strings; no-page returns cacheable empty marker (not null) | unit | `npx jest src/backend/wiki_game_info/applegamingwiki/__tests__/utils.test.ts` | ✅ | ✅ green |
| 07-02-D02b | 02 | 1 | DETAIL-02 (browser User-Agent — Cloudflare 403 fix) | T-07-04 | Both AppleGamingWiki requests carry a `Mozilla`-like User-Agent; search `title` is `encodeURIComponent`-encoded (no host/SSRF surface) | unit | `npx jest src/backend/wiki_game_info/applegamingwiki/__tests__/utils.test.ts` | ✅ | ✅ green |
| 07-02-D02c | 02 | 1 | DETAIL-02 (gate inversion + Unrated pill + click-through + rating-source toggle) | T-07-03 | Overlay gated on `darwin && !is_mac_native`; `crossoverLink`/`title` `encodeURIComponent`-wrapped in click-through URL | manual | — | — | 📋 manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 📋 manual*

---

## Wave 0 Requirements

Existing infrastructure covers all automatable phase requirements. Two coverage gaps were
filled retroactively during this validation audit (2026-07-04):

- [x] `src/backend/storeManagers/steam/__tests__/library.test.ts` — new describe `hostInstallPlatform() via refreshInstallState() — install.platform reflects host OS (DETAIL-01 GAP2)`: asserts `install.platform` resolves to `'Mac'` (macOS), `'linux'` (Linux), `'Windows'` (Windows) through the observable `refreshInstallState()` seam.
- [x] `src/backend/wiki_game_info/applegamingwiki/__tests__/utils.test.ts` — 2 new tests asserting both `getPageID` and `getWikiText` requests carry a browser-like User-Agent header (guards the Cloudflare-403 fix / T-07-04) and the search URL is `encodeURIComponent`-encoded.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Platform-support icons have ≥5px visible spacing | DETAIL-01 (GAP3) | Rendered CSS spacing between inline SVG glyphs — visual, not unit-assertable | On a game details page → Install-info panel, confirm adjacent platform glyphs are clearly separated (UAT test 2 — PASS) |
| Compatibility overlay gate (`darwin && !is_mac_native`), Unrated pill, pill color tiers, click-through, CrossOver↔Wine toggle | DETAIL-02 | React UI + macOS-only runtime + live AppleGamingWiki network; requires a real Steam account on macOS | Re-UAT on macOS per 07-UAT.md tests 3–7 (all PASS, 2026-07-04) |
| Cache self-heal (null AppleGamingWiki entry re-fetches on macOS) | DETAIL-02 | Lives in `wiki_game_info.ts` cross-store TTL logic exercised end-to-end at runtime | Open a previously-null-cached Windows game on macOS; confirm the rating self-heals on next visit (UAT test 5 — PASS) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented manual-only justification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (both filled 2026-07-04)
- [x] No watch-mode flags
- [x] Feedback latency < 5s (targeted suites)
- [ ] `nyquist_compliant: true` — PARTIAL: 4/6 tasks automated; 2 are inherently manual (CSS spacing, macOS-only React overlay/toggle)

**Approval:** approved 2026-07-04 (partial — manual-only items justified above)

---

## Validation Audit 2026-07-04

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated (→ manual-only) | 0 |

Gap A (DETAIL-01 GAP2 host-derived install platform) and Gap B (DETAIL-02 browser
User-Agent) were both filled with unit tests and run green (library 60/60 incl. 3 new;
applegamingwiki 7/7 incl. 2 new). Remaining manual-only behaviors (icon spacing, macOS
overlay/toggle, cache self-heal) were verified via UAT (07-UAT.md — 7/7 pass).
