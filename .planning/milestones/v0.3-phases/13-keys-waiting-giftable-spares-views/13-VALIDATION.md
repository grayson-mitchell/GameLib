---
phase: 13
slug: keys-waiting-giftable-spares-views
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-07
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 + ts-jest |
| **Config file** | `jest.config.js` (`projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend']`) |
| **Quick run command** | `pnpm test -- src/backend/humble/__tests__/viewFilters.test.ts src/backend/humble/__tests__/urgencyBadge.test.ts` |
| **Full suite command** | `pnpm test` (CI-parity: `pnpm test:ci`) |
| **Estimated runtime** | ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run targeted `pnpm test -- <touched test file>` for the touched pure helper
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Filled during planning (Plans 13-01..13-05). Requirement→test mapping from RESEARCH.md Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01 T1 | 13-01 | 1 | HVIEW-01 | T-13-01 | `selectKeysWaiting` membership (D-53) | unit | `pnpm test -- src/backend/humble/__tests__/viewFilters.test.ts -t "selectKeysWaiting"` | ❌ created in 13-01 T1 (TDD) | ⬜ pending |
| 13-01 T1 | 13-01 | 1 | HVIEW-01 | — | `selectKeysWaiting` sort (D-56: dated soonest-first, then undated alphabetical) | unit | `pnpm test -- src/backend/humble/__tests__/viewFilters.test.ts -t "sort"` | ❌ created in 13-01 T1 (TDD) | ⬜ pending |
| 13-01 T1 | 13-01 | 1 | HVIEW-02 | T-13-01 | `selectGiftableSpares` membership (D-54/D-55: ownedElsewhere + UNREVEALED only) | unit | `pnpm test -- src/backend/humble/__tests__/viewFilters.test.ts -t "selectGiftableSpares"` | ❌ created in 13-01 T1 (TDD) | ⬜ pending |
| 13-01 T2 | 13-01 | 1 | HVIEW-01/02 | — | `getUrgencyTier` tiering (D-61/62/63: ≤7d danger, ≤30d warning, never on REDEEMED/UNREDEEMABLE) | unit | `pnpm test -- src/backend/humble/__tests__/urgencyBadge.test.ts` | ❌ created in 13-01 T2 (TDD) | ⬜ pending |
| 13-02 T1 | 13-02 | 1 | HVIEW-02 | T-13-04 | `humbleGiftedAtStore` persists and survives a simulated disconnect (D-04 carve-out) | unit (store) | `pnpm test -- src/backend/humble/__tests__/electronStores.test.ts` | ❌ created in 13-02 T1 | ⬜ pending |
| 13-02 T2 | 13-02 | 1 | HVIEW-02 | T-13-02 | `humbleRecordGiftLinkOpened` re-validates ownedElsewhere+UNREVEALED server-side | typecheck + code review (handler mirrors humbleSetOwnershipOverride precedent) | `pnpm codecheck` | n/a | ⬜ pending |
| 13-03 T1/T2 | 13-03 | 2 | HVIEW-01 | T-13-05/06 | Tab routes render correct child; default redirects to `waiting` (D-50/D-51); D-63 badges in all 3 tabs | manual (frontend jest has no jsdom/DOM render — confirmed: the sole frontend test invokes components as plain functions) | covered by 13-05 T2 human-verify steps 2–4, 6–7 | n/a (manual) | ⬜ pending |
| 13-04 T1 | 13-04 | 3 | HVIEW-02 | T-13-07/08 | Gift confirmation dialog gates external-open; gifted-at annotation renders | manual (renderer dialog interaction) + unit coverage of the underlying store/IPC in 13-02 | covered by 13-05 T2 human-verify step 5 | n/a (manual) | ⬜ pending |
| 13-05 T1 | 13-05 | 4 | HVIEW-01/02 | — | Full-suite pre-checkpoint gate | unit (full suite) | `pnpm codecheck && pnpm test` | ✅ (suite exists) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Resolution: this phase uses TDD-typed Plan 13-01 (Wave 1) to create the pure-helper test files
> RED-first, and Plan 13-02 Task 1 to create the store test alongside the store — the Wave 0 scaffolds
> below are satisfied by those tasks rather than a separate Wave 0 plan.

- [x] `src/backend/humble/__tests__/viewFilters.test.ts` — created RED-first in Plan 13-01 Task 1 (mirrors `groupKeys.test.ts` structure/fixtures)
- [x] `src/backend/humble/__tests__/urgencyBadge.test.ts` — created RED-first in Plan 13-01 Task 2 (mirrors `expirationDisplay.test.ts`)
- [x] Gifted-at store disconnect-survival test — created in Plan 13-02 Task 1 following `electronStores.test.ts` pattern
- [x] Frontend test convention confirmed during planning: the frontend jest project has NO jsdom/RTL render capability (the one existing test, `HumbleOriginInfo.test.tsx`, invokes components as plain functions and its header documents that adding a DOM renderer is a new npm dependency, excluded). Tab-routing verification is therefore manual, owned by Plan 13-05's human-verify checkpoint.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gift confirmation dialog interaction (irreversibility warning shown, cancel aborts) | HVIEW-02 | Renderer dialog interaction; frontend jest project has no jsdom/DOM render | 13-05 T2 step 5: open Giftable Spares → click gift action → verify warning copy renders and Cancel performs no external open |
| Deep-link opens Humble keys page in default browser | HVIEW-02 | Requires live browser/`shell.openExternal` | 13-05 T2 step 5: confirm gift action opens `https://www.humblebundle.com/home/keys` externally |
| Tab navigation + default-tab redirect | HVIEW-01/02 | No automated route/component render available (no jsdom) | 13-05 T2 steps 2 + 7: open Humble Keys → lands on Keys waiting; switch tabs; back-button and deep links work |
| D-63 urgency badges in All-keys grouped rows (incl. owned-elsewhere + REVEALED keys that appear only there per D-55) | HVIEW-01/02 | Visual badge rendering in a grouped list; no DOM render available | 13-05 T2 step 6: confirm additive badges without layout regression |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every code task carries an `<automated>` command; manual-only behaviors are explicitly owned by 13-05's blocking checkpoint
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (13-01 T1/T2 unit, 13-02 T1 unit / T2 codecheck, 13-03 T1/T2 codecheck+unit, 13-04 T1 codecheck+unit, 13-05 T1 full suite)
- [x] Wave 0 covers all MISSING references (satisfied via TDD Plan 13-01 + 13-02 T1, see Wave 0 Requirements)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (planning revision, 2026-07-07)
