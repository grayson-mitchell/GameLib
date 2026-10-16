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
| 11-04-01 | 04 | 4 | HSYNC-01, HSYNC-02, HSYNC-03 | T-11-09 | Humble Keys screen renders the 5-state inventory, fixed group order, empty groups hidden, expiring-soonest-first sort; rows are structurally read-only (`<div>`/`<li>`, no reveal/copy/link-out) | manual | — (visual UAT, see Manual-Only Verifications below) | — | ✅ live UAT PASS (2026-07-06) |
| 11-04-02 | 04 | 4 | HSYNC-04 | — | Fail-soft banner ("Couldn't refresh — showing data from [last-synced timestamp]") and "Last synced X ago" freshness indicator render from context state; progressive-fill "Syncing... N of M orders" indicator during manual refresh | manual | — (visual UAT, no headless DOM test infra exists for this screen) | — | ✅ live UAT PASS (2026-07-06) |
| 11-05-01 | 05 | 5 | HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04 | T-11-10 | Full jest suite green; live-account 5-state rendering + fail-soft + [ASSUMED] resolution (A1 UNPICKED, A3 redeemed_key_value) | unit + manual | `pnpm test` | ✅ | ✅ green (unit) / ✅ live UAT APPROVED (2026-07-06) — A1 UNPICKED live check deferred (see findings) |

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

**Approval:** approved 2026-07-05 (Task 1 — automated suite). Task 2 (live UAT) **APPROVED by tester 2026-07-06** after 7 live fix rounds — see Live UAT Findings below. Full suite at approval: 31 suites / 514 tests, exit 0; codecheck clean.

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

## Live UAT Findings (Task 2)

**Final verdict: APPROVED by tester (2026-07-06) after 7 live fix rounds.**
All findings redacted per T-11-10 / D-15 — counts/states/pass-fail only, never a cookie or raw key value.

Tested against a real Humble account with **25 gamekeys** (dev build, `pnpm dev`).

### Verified PASS on live data

| Check | Requirement | Result |
|-------|-------------|--------|
| Sidebar gating: "Humble Keys" visible only while connected, hidden after Disconnect | HSYNC-01 | ✅ PASS |
| Empty state message correct when no keys | HSYNC-01 | ✅ PASS |
| 5-state inventory renders grouped and ordered (UNPICKED / UNREVEALED / REVEALED / REDEEMED / Expired), state badges correct — tester's purchased Steam-key game + several gift keys appear UNREVEALED; redeemed keys in REDEEMED | HSYNC-01, HSYNC-02 | ✅ PASS |
| Rows strictly read-only — no reveal/copy/expand/link-out affordance | T-11-09 | ✅ PASS (confirmed across rounds; no affordances present) |
| Progressive fill "Syncing… N/M orders" indicator observed during sync | HSYNC-01 | ✅ PASS (after round-2 fix removed indicator flicker) |
| "Last synced X ago" renders steadily and advances on manual refresh | HSYNC-04 | ✅ PASS (after round-2 fixes) |
| Fail-soft: with no network connection at app start, cached list displayed with orange "Couldn't refresh" banner — no toast, no blank, no error | HSYNC-04 | ✅ PASS — HSYNC-04 confirmed live |
| Expiration dates render (e.g. a key expiring 2026-08-03) and expiring-soonest sort works; one key legitimately has no expiry window (correct); REDEEMED rows show blank expiration slot | HSYNC-03 | ✅ PASS (after rounds 4-5) |

### [ASSUMED] Resolutions

- **A3 (redeemed-key field presence semantics): RESOLVED-CONFIRMED.** Redeemed keys classify REDEEMED via the live `redeemed_key_val` field; unrevealed keys classify UNREVEALED. Note the live field name is `redeemed_key_val`, **not** the spec's `redeemed_key_value` — see spec-inaccuracy note below.
- **A1 (un-picked Humble Choice month / UNPICKED pseudo-entry): DEFERRED.** The tested account has no un-picked month — the UNPICKED path is **unverified on live data, defensive code path only** (same precedent as Phase 10's identity-advisory). Deferred to a future live check when an account with an un-picked Choice month is available.

### Live defects found by UAT and fixed during the checkpoint

All fixes merged to main; 514/514 tests green at approval.

1. **Round 1** — `CacheStore.entries()` leaked electron-store's nested `__timestamp` bookkeeping group → sync rejected mid-flight, spinner stuck, keys unreadable. Fix `cfd5cafe`. Debug: `.planning/debug/humble-sync-spinner-never-ends.md`.
2. **Round 2** — per-order keys push wrongly cleared `syncing` (indicator flicker); sync end-state never propagated to renderer (stale syncedAt, banner impossible). Added terminal `humbleSyncStateChanged` event, single-flight + cooldown guards, per-sync redacted summary log. Fix `366e7ef9`. Debug: `.planning/debug/humble-keys-empty-list-flashing-sync.md`.
3. **Round 3** — adapter never sent `?all_tpkds=true` so orders returned key-less; spec field names wrong: live fields are `redeemed_key_val` (not `redeemed_key_value`) and `is_expired` bool. Fix `379b8f42`. Debug: `.planning/debug/humble-zero-keys-from-valid-orders.md`. **NOTE:** `.planning/research/HUMBLE-SPEC-SOURCE.md` §2.1/Appendix A is inaccurate on these field names.
4. **Round 4** — expiration extraction: live payloads use `expiry_date` (absolute) / `num_days_until_expired` (relative, 0 = no window), not `expiration`. Fixes `a1f36fd1`, `581be6d4`, `1c869532` — also relabeled UNREDEEMABLE as "Expired" in UI and added collapsible groups with Expired collapsed by default (both user-requested).
5. **Round 5** — D-29: entries without `key_type` excluded; REDEEMED/Expired rows show blank instead of "No expiration". Fixes `34c763a9`, `3199f2ee`.
6. **Round 6** — entitlement filter v2 (`direct_redeem: true` + non-game key_type excluded, grounded in Playnite/Galaxy real captures) + classifier-version cache re-classification so classifier fixes reach frozen orders. Fixes `f34fc0d2`, `11a0c515`.
7. **Round 7** — **user product decision at checkpoint:** `key_type: "generic"` entries (e.g. PDF/ebook bundles) stay in inventory but display in a separate collapsed "Other" group rendered last — never lose a key, but out of the game-key groups. Fix `2964fcf9`. This refines D-28's display semantics by explicit user choice.

### Full-suite status at approval

31 suites / 514 tests, exit 0 (`pnpm test`); codecheck clean.
