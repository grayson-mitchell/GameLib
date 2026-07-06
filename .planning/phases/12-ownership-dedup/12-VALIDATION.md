---
phase: 12
slug: ownership-dedup
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-06
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (project-wide `jest.config.js`; `package.json` `"test": "jest"`) — the vitest reference in the draft was incorrect; this project has no vitest config |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npx jest <path> --silent` |
| **Full suite command** | `pnpm test:ci` (`jest --runInBand --silent`) |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** `npx jest src/backend/humble --silent` (or the specific changed test file)
- **After every plan wave:** `pnpm test:ci`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01 T1 | 12-01 | 1 | HDEDUP-01, HDEDUP-02 | T-12-01b | HumbleKeyState union unchanged (overlay ≠ 6th state) | unit/tsc | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 12-01 T2 | 12-01 | 1 | HDEDUP-01, HDEDUP-02 | T-12-01a | steam_app_id read inside per-tpk try/catch, String-coerced only | unit | `npx jest src/backend/humble/__tests__/classify.test.ts` | ✅ extend | ⬜ pending |
| 12-02 T1 | 12-02 | 2 | HDEDUP-01 | T-12-SC | fastest-levenshtein legitimacy gate before install | human | blocking-human checkpoint (not auto-approvable) | n/a | ⬜ pending |
| 12-02 T2 | 12-02 | 2 | HDEDUP-01 | T-12-01, T-12-05 | fixed hardcoded suffix/keyword lists (no ReDoS surface) | unit | `npx jest src/backend/humble/__tests__/dedup.test.ts` | ❌ W0 | ⬜ pending |
| 12-03 T1 | 12-03 | 3 | HDEDUP-01 | T-12-04 | override store survives disconnect wipe | unit | `npx jest src/backend/humble/__tests__/electronStores.test.ts` | ❌ W0 | ⬜ pending |
| 12-03 T2 | 12-03 | 3 | HDEDUP-01, HDEDUP-02 | T-12-02 | recompute no-op when Steam disconnected/empty (keep-last-known) | unit/integration | `npx jest src/backend/humble/__tests__/library.test.ts` | ✅ extend | ⬜ pending |
| 12-04 T1 | 12-04 | 4 | HDEDUP-01 | T-12-03 | override IPC validates matchConfidence==='fuzzy' server-side | unit/tsc | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 12-04 T2 | 12-04 | 4 | HDEDUP-01 | T-12-07 | steam/library.ts stays Humble-unaware; recompute self-gates | tsc/grep | `npx tsc --noEmit` + grep no-humble-in-steam | ✅ | ⬜ pending |
| 12-05 T1 | 12-05 | 5 | HDEDUP-01 | T-12-03f | fuzzy-only override render gate (UX defense-in-depth) | tsc | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 12-05 T2 | 12-05 | 5 | HDEDUP-02 | T-12-08 | redeemed-only, confirmed-match-only, display-safe annotation | unit (component) | `npx jest src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx` | ❌ W0 | ⬜ pending |
| 12-05 T3 | 12-05 | 5 | HDEDUP-01, HDEDUP-02 | — | visual + persistence sign-off | human-verify | blocking checkpoint | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Created within the plan that first needs them (tests-before-implementation via `tdd="true"` tasks):

- [ ] `src/backend/humble/__tests__/dedup.test.ts` — HDEDUP-01: AppID-exact-final, fuzzy-85%, DLC-guard, UNPICKED-exclusion, cross-platform, keep-last-known (Plan 12-02 T2)
- [ ] `src/backend/humble/__tests__/fixtures/steamGames.ts` — `GameInfo[]` incl. the documented DLC/edition-variant titles from RESEARCH.md fixture block (Plan 12-02 T2)
- [ ] `src/backend/humble/__tests__/electronStores.test.ts` — override store disconnect-survival (Plan 12-03 T1; create if absent)
- [ ] `src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx` — HDEDUP-02: redeemed-match / non-steam / non-redeemed / no-match (Plan 12-05 T2)

Extended (already exist):
- [ ] `src/backend/humble/__tests__/classify.test.ts` — steam_app_id capture cases (Plan 12-01 T2)
- [ ] `src/backend/humble/__tests__/library.test.ts` — classifier-version backfill + recompute + keep-last-known + override (Plan 12-03 T2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owned badge (exact/fuzzy) renders on matching Keys-page rows; layout ordering untouched | HDEDUP-01 | Visual UI verification in running Electron app | Launch app, open Humble Keys page, confirm "Owned on Steam" / "Likely owned on Steam" on overlapping rows; confirm no re-sort/dim (Plan 12-05 T3) |
| Fuzzy override persists + survives reconnect | HDEDUP-01 | Requires app restart + Humble reconnect cycle | Click "Not the same game" on a fuzzy row; restart app; reconnect Humble; confirm correction held (D-43) |
| Annotation renders on Steam GamePage entry (redeemed-only) | HDEDUP-02 | Visual UI verification | Open a Steam game with a redeemed Humble key; confirm origin annotation; open one without; confirm none |
| Keep-last-known on Steam logout | HDEDUP-01 | Requires toggling Steam session state | Log out Steam, trigger refresh; confirm owned badges do NOT flip to unowned (D-48) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoints excepted, human-verify)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (dedup.test.ts, steamGames.ts, electronStores.test.ts, HumbleOriginInfo.test.tsx)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
