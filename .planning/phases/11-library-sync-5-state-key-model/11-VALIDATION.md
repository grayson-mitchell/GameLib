---
phase: 11
slug: library-sync-5-state-key-model
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-05
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7.0 (`ts-jest` 29.3.2) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest src/backend/humble/__tests__ --no-coverage` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds (full suite, 28 suites / 396 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/backend/humble/__tests__ --no-coverage`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | HSYNC-01 | T-11-05 | `classifyTpk`/`classifyOrder` produce exactly one of the 5 states for representative fixture tpks (one per state); a malformed tpk entry is skipped without throwing, other tpks in the same order still classify | unit | `npx jest src/backend/humble/__tests__/classify.test.ts --no-coverage` | ✅ | ✅ green |
| 11-01-02 | 01 | 1 | HSYNC-01 | T-11-01 | `redeemedKeyValuePresent` boolean derived from field presence; no raw `redeemed_key_value` stored on `HumbleKey` | unit | `npx jest src/backend/humble/__tests__/classify.test.ts --no-coverage` | ✅ | ✅ green |
| 11-01-03 | 01 | 1 | HSYNC-01 | T-11-04 | classify.ts performs no logging of raw tpk/order objects | unit | `npx jest src/backend/humble/__tests__/classify.test.ts --no-coverage` | ✅ | ✅ green |
| 11-02-01 | 02 | 2 | HSYNC-02 | — | A tpk with the local REVEALED flag set and no `redeemed_key_value` classifies REVEALED, and this survives a simulated restart (new store instance reading the same file) | unit | `npx jest src/backend/humble/__tests__/classify.test.ts --no-coverage` | ✅ | ✅ green |
| 11-02-02 | 02 | 2 | HSYNC-02 | T-11-06 | `humbleRevealedStore` is untouched by `HumbleUser.disconnect()` while `humbleLibraryStore`/`humbleSyncStore` are cleared | unit | `npx jest src/backend/humble/__tests__/user.test.ts --no-coverage` | ✅ (extended) | ✅ green |
| 11-02-03 | 02 | 2 | HSYNC-01 | T-11-03 | Sync partitions gamekeys into new/non-terminal/frozen correctly (Pitfall 3) — a never-cached gamekey is always fetched, an all-terminal cached gamekey is skipped, a non-terminal cached gamekey IS re-fetched | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ✅ | ✅ green |
| 11-02-04 | 02 | 2 | HSYNC-01 | T-11-03 | Concurrency pool never exceeds `HUMBLE_SYNC_CONCURRENCY` in-flight order-detail fetches | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ✅ | ✅ green |
| 11-02-05 | 02 | 2 | HSYNC-03 | — | A tpk cached without an expiration, then re-synced with a newly-added expiration field, reclassifies UNREDEEMABLE on the next sync (not the cached run); an all-terminal order is frozen and skipped on subsequent syncs | unit | `npx jest src/backend/humble/__tests__/classify.test.ts`, `.../library.test.ts --no-coverage` | ✅ | ✅ green |
| 11-02-06 | 02 | 2 | HSYNC-04 | T-11-05, T-11-08 | `access_denied`/`schema_error` on `getGamekeys` leaves the existing cache untouched and sets a `syncError`/cooldown state; a thrown network/timeout/5xx error is caught (never an unhandled rejection) | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ✅ | ✅ green |
| 11-02-07 | 02 | 2 | HSYNC-04 | T-11-06 | Mid-sync abort (403/429 on order N of M) commits orders 1..N-1's fresh results and leaves N+1..M at their prior cached state (D-34); one order's rejection/schema_error keeps its cached entry, the pool finishes the others | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ✅ | ✅ green |
| 11-03-01 | 03 | 3 | HSYNC-01, HSYNC-02 | T-11-02 | `humbleSync`/`humbleGetKeys`/`humbleGetSyncState` IPC handlers delegate straight to `HumbleLibrary`; no generic `storeGet` exposure of `humbleLibraryStore`/`humbleRevealedStore` | static/grep | verified in 11-03-SUMMARY.md (grep-checked, no dedicated test file — IPC wiring, not business logic) | ✅ | ✅ green |
| 11-04-01 | 04 | 4 | HSYNC-01, HSYNC-02, HSYNC-03 | T-11-09 | Humble Keys screen renders the 5-state inventory, fixed group order, empty groups hidden, expiring-soonest-first sort; rows are structurally read-only (`<div>`/`<li>`, no reveal/copy/link-out) | manual | — (visual UAT, see Manual-Only Verifications below) | — | 📋 manual — see Task 2 |
| 11-04-02 | 04 | 4 | HSYNC-04 | — | Fail-soft banner ("Couldn't refresh — showing data from [last-synced timestamp]") and "Last synced X ago" freshness indicator render from context state; progressive-fill "Syncing... N of M orders" indicator during manual refresh | manual | — (visual UAT, no headless DOM test infra exists for this screen) | — | 📋 manual — see Task 2 |
| 11-05-01 | 05 | 5 | HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04 | T-11-10 | Full jest suite green; live-account 5-state rendering + fail-soft + [ASSUMED] resolution (A1 UNPICKED, A3 redeemed_key_value) | unit + manual | `pnpm test` | ✅ | ✅ green (unit) / 📋 manual — see Task 2 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 📋 manual*

---

## Wave 0 Requirements

`src/backend/humble/classify.ts` + `src/backend/humble/__tests__/classify.test.ts` and
`src/backend/humble/library.ts` + `src/backend/humble/__tests__/library.test.ts` were created in
Plan 01/02 exactly per the Wave 0 gap list in 11-RESEARCH.md. `src/backend/humble/__tests__/user.test.ts`
was extended (not created) to cover the disconnect-does-not-clear-`humbleRevealedStore` behavior.
All Wave 0 gaps identified in 11-RESEARCH.md are closed — existing infrastructure now covers all
automatable Phase 11 requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 5-state inventory renders grouped/ordered correctly on a real account, empty groups hidden, expiring-soonest-first | HSYNC-01, HSYNC-02, HSYNC-03 | No headless DOM test infra exists for this screen; requires a real Humble account with populated keys across multiple states | See Task 2 `<how-to-verify>` steps 1-2 |
| Rows are strictly read-only (no reveal/copy/expand/link-out affordance) | T-11-09 | Visual/interaction check — clickability and hover behavior are not exercised by unit tests | See Task 2 `<how-to-verify>` step 3 |
| Manual refresh spinner + progressive-fill "Syncing… N/M orders" indicator | HSYNC-01 | Requires a real multi-order account and observing UI state transitions live | See Task 2 `<how-to-verify>` step 4 |
| Fail-soft banner on unreachable API (cached list stays visible, orange banner, no toast/blank/error) | HSYNC-04 | Requires simulating a real network failure against the live Humble API from a running dev build | See Task 2 `<how-to-verify>` step 5 |
| Live [ASSUMED] resolution: A1 (UNPICKED pseudo-entry), A3 (redeemed_key_value / REDEEMED, UNREVEALED presence) | HSYNC-01, HSYNC-02 | RESEARCH-flagged `[ASSUMED]` API-shape items that Phase 10's live gate could not cover; requires real account data | See Task 2 `<how-to-verify>` step 6 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every backend task in Plans 01/02/03 has a unit test; Plan 04's UI-rendering task and Plan 05's UAT checkpoint are the only manual-only items, each following an automated-verified task)
- [x] Wave 0 covers all MISSING references (classify.ts/library.test.ts gaps from 11-RESEARCH.md closed in Plans 01/02)
- [x] No watch-mode flags
- [x] Feedback latency < 5s (full suite: ~5.173s for 28 suites / 396 tests)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (Task 1 — automated suite). Task 2 (live UAT) is `autonomous: false` and pending human sign-off — see checkpoint return.

---

## Full Suite Result (Task 1)

**Date:** 2026-07-05
**Command:** `pnpm test`
**Result:** PASS — 28 test suites, 396 tests, 0 failures, 5.173s.

Relevant Humble suites in the run:
- `src/backend/humble/__tests__/classify.test.ts` — PASS
- `src/backend/humble/__tests__/library.test.ts` — PASS
- `src/backend/humble/__tests__/user.test.ts` — PASS
- `src/backend/humble/__tests__/adapter.test.ts` — PASS (Phase 10, unaffected)

No regressions in any other suite (Steam, wine, wiki, filesystem, protocol, etc.).

---

## Live UAT Findings (Task 2 — pending)

To be appended by the human-verify checkpoint per `11-05-PLAN.md` Task 2's `<how-to-verify>`.
Findings will record (redacted — counts/states/pass-fail only, never a cookie or raw key value):

- 5-state inventory rendering (grouping, ordering, empty-group hiding, expiring-soonest-first)
- Read-only row confirmation (no reveal/copy/expand/link-out)
- Progressive-fill sync indicator behavior on a multi-order account
- Fail-soft banner behavior on an unreachable API
- A1 (UNPICKED pseudo-entry) resolution — present/absent on the tested account, deadline rendering if present
- A3 (`redeemed_key_value` presence) resolution — REDEEMED and UNREVEALED classification confirmed on real data
