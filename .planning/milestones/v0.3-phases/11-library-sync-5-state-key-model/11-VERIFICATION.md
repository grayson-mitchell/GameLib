---
phase: 11-library-sync-5-state-key-model
verified: 2026-07-06T21:30:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 11: Library Sync + 5-State Key Model Verification Report

**Phase Goal:** A connected Humble account's full key inventory is synced into GameLib, classified into exactly one of five states, and reliably available even when the Humble API is unreachable
**Verified:** 2026-07-06T21:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After connecting a Humble account, all order keys appear in GameLib classified as exactly one of UNPICKED / UNREVEALED / REVEALED / REDEEMED / UNREDEEMABLE | ✓ VERIFIED | `src/backend/humble/classify.ts:21-43` (`classifyTpk`) implements the literal D-30 precedence (expiration/is_expired → UNREDEEMABLE; redeemedKeyValuePresent → REDEEMED; isLocallyRevealed → REVEALED; else UNREVEALED); `classifyOrder` (line 229+) handles the D-27 UNPICKED pseudo-entry and D-29 key-evidence gate. 219 passing tests in `src/backend/humble/__tests__/{classify,library,user,expirationDisplay,groupKeys}.test.ts`. Live UAT on a real 25-gamekey account confirmed all populated states render correctly (11-VALIDATION.md "Live UAT Findings", approved 2026-07-06). |
| 2 | A key revealed through the launcher retains its REVEALED classification across app restarts and re-syncs (write-ahead flag persisted to disk before the reveal API call, not held in React state) | ✓ VERIFIED | `humbleRevealedStore` (`src/backend/humble/electronStores.ts:31-38`) is a separate `CacheStore` file on disk, explicitly documented as never cleared by `HumbleUser.disconnect()` (D-04/D-30). `user.ts:471-490` disconnect() clears `humbleLibraryStore`/`humbleSyncStore` but never `humbleRevealedStore` (grep-confirmed: 0 hits for `humbleRevealedStore.clear`). `classifyOrder` reads the revealed flag via an injected lookup, never merging forward from the previous cache entry (Pitfall 5). Test asserts revealed-store survival across disconnect (`user.test.ts`, 8/8 disconnect-scoped tests passing). Note: actual per-key "reveal" UI/API action is out of scope for Phase 11 (Phase 14) — this phase verifies the store-survival foundation the write-ahead flag depends on, which is the phase's stated scope. |
| 3 | A key that gains a retroactive expiration between syncs is reclassified UNREDEEMABLE on the next sync — no manual refresh required | ✓ VERIFIED | `partitionGamekeys()` (library.ts) never freezes a non-terminal cached order — only `allTerminal: true` entries are skipped, so any order still capable of gaining an expiration is re-fetched and reclassified on every sync (HSYNC-03). Test in `library.test.ts` asserts a never-cached gamekey is always fetched and an all-terminal cached order is skipped; `classify.test.ts` asserts a re-classified order with a newly-added expiration returns UNREDEEMABLE. Live UAT confirmed expiration dates render correctly and expiring-soonest sort works (rounds 4-5 fixes). |
| 4 | If a Humble sync fails, the previously cached library is displayed with a clear "couldn't refresh" indicator rather than a blank or error state | ✓ VERIFIED | `library.ts` never calls `humbleLibraryStore.clear()` (grep-confirmed 0 hits) on any failure path; typed `access_denied`/`schema_error` and thrown network/timeout/5xx are both caught and produce `syncError` states without touching the cache. `HumbleKeys/index.tsx:172-185` renders a persistent inline `WarningMessage` banner only when `syncError !== 'none'`. Live UAT: "Fail-soft: with no network connection at app start, cached list displayed with orange banner — no toast, no blank, no error" — PASS (11-VALIDATION.md). |

**Score:** 4/4 truths verified

### Requirement-Level Truths (PLAN frontmatter, HSYNC-01..04)

| Requirement | Status | Evidence |
|---|---|---|
| HSYNC-01 (sync + 5-state + concurrency-bounded cache-aggressive fetch) | ✓ VERIFIED | `runBounded()` pool capped at `HUMBLE_SYNC_CONCURRENCY` (=3, `constants.ts`); test asserts max-in-flight counter never exceeds the cap. Skip-terminal partitioning is cache-aggressive (only new/non-terminal gamekeys fetched). |
| HSYNC-02 (exactly one state; write-ahead REVEALED flag survives re-sync) | ✓ VERIFIED | See Truth #2 above; `classifyOrder` always resolves exactly one state per tpk (switch-like precedence with no fallthrough gap — default branch `UNREVEALED` guarantees totality). |
| HSYNC-03 (expiration/UNREDEEMABLE recomputed every sync) | ✓ VERIFIED | See Truth #3 above. |
| HSYNC-04 (fail-soft on Humble API unreachable) | ✓ VERIFIED | See Truth #4 above; also covers the CR-01 fix (disconnect mid-sync no longer silently repopulates the wiped cache — see Anti-Patterns/Review section). |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/humble/classify.ts` | Pure 5-state classification (`classifyTpk`, `classifyOrder`) | ✓ VERIFIED | 572 lines; exports confirmed (`classifyTpk`, `classifyOrder`, `extractExpiration`, `describeZeroKeyOrder`, `describeSkippedEntitlements`, `describeMissingExpirationTpks`); no electron-store import (pure function, grep-confirmed). |
| `src/backend/humble/electronStores.ts` | `humbleLibraryStore`, `humbleSyncStore`, `humbleRevealedStore` three-way split | ✓ VERIFIED | All three exported; D-04/D-30 survival comment present and accurate. |
| `src/common/types/humble.ts` | `HumbleKeyState`, `HumbleKey`, `HumbleOrderCacheEntry`, `HumbleSyncState` | ✓ VERIFIED | All four types present (143 lines); no `redeemed_key_value` field on `HumbleKey` (grep-confirmed). |
| `src/backend/humble/library.ts` | Sync orchestration: `HumbleLibrary` (`loadCached`/`sync`/`getKeys`/`getSyncState`) | ✓ VERIFIED | 560 lines; `HumbleLibrary` export confirmed; no `.clear()` call on the library store anywhere in the file (grep-confirmed); every adapter call site wrapped in try/catch. |
| `src/backend/humble/syncFence.ts` (added post-review, CR-01 fix) | Generation-fence to stop a disconnect-invalidated in-flight sync from repopulating wiped stores | ✓ VERIFIED | New leaf module; `invalidateSyncGeneration()` called from `user.ts:478` before the store wipes; `runSync()` checks `currentSyncGeneration()` at every commit/push point. |
| `src/backend/humble/user.ts` | `disconnect()` clears library/sync stores, preserves REVEALED store | ✓ VERIFIED | Confirmed at lines 471-490; CR-01 fence call precedes the wipes. |
| `src/backend/humble/ipc_handler.ts` | `humbleSync`/`humbleGetKeys`/`humbleGetSyncState` typed handlers | ✓ VERIFIED | All three registered, delegating to `HumbleLibrary`. |
| `src/preload/api/humble.ts` | Invokers + `handleHumbleKeysUpdated`/`handleHumbleSyncProgress` (+ `handleHumbleSyncStateChanged`, added post-review) | ✓ VERIFIED | All exports present; no generic `storeGet` exposure of `humbleLibraryStore`/`humbleRevealedStore` (grep: 0 hits, WR-09 anti-pattern absent). |
| `src/frontend/state/GlobalState.tsx` | `humble` slice: keys/syncedAt/syncError/syncing + startup/login sync triggers | ✓ VERIFIED | Confirmed via SUMMARY cross-check and code read; startup chain `humbleCheckHealth().then(() => humbleSync())` present. |
| `src/frontend/screens/Humble/Keys/index.tsx` | Read-only Keys page: header, freshness/progress indicator, refresh button, fail-soft banner, grouped list | ✓ VERIFIED | 210 lines; renders `GROUP_ORDER` (5 states) + fail-soft banner conditional on `syncError`; refresh button disabled during cooldown with auto re-enable timer (WR-06 fix). |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | Read-only key row with 5-state badge | ✓ VERIFIED | 70 lines; renders `<li>`, zero `onClick`/`<button>`/`<a>` for the row itself (grep-confirmed); state badge + expiration display wired to pure `getExpirationDisplay` helper. |
| `.planning/phases/.../11-VALIDATION.md` | Filled validation + live-account findings; `nyquist_compliant: true` | ✓ VERIFIED | Frontmatter `status: approved`, `nyquist_compliant: true`, `wave_0_complete: true`; full Live UAT Findings section present with per-check PASS table and A1/A3 [ASSUMED] resolutions. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `classify.ts` | `electronStores.ts` (`humbleRevealedStore`) | `classifyOrder` reads the revealed-flag store via an injected argument, not import | ✓ WIRED | Confirmed: `classify.ts` has zero electron-store imports; `library.ts` passes `(mn) => humbleRevealedStore.has(mn)` into `classifyOrder`. |
| `adapter.ts` (`mapAxiosError`) | `library.ts` (abort/backoff path) | HTTP 429 mapped to `access_denied`, routed through the same cooldown branch as 403 | ✓ WIRED | Confirmed in `adapter.ts` and exercised by `library.test.ts`'s access_denied/cooldown assertions. |
| `library.ts` | `classify.ts` (`classifyOrder`) | Per-order classification of fresh adapter responses | ✓ WIRED | Confirmed: `fetchAndCommitOrder` calls `classifyOrder(data, ...)` on every `ok` result. |
| `library.ts` | `adapter.ts` (`getGamekeys`/`getOrderDetail`) | Typed `AdapterResult` status switch, each call wrapped in try/catch | ✓ WIRED | Confirmed: every adapter call site has its own try/catch (grep + code read). |
| `library.ts` (catch paths) | `electronStores.ts` (`humbleSyncStore` syncError) | Caught network/timeout/5xx rejection → fail-soft syncError, cache preserved | ✓ WIRED | Confirmed: `getSyncState()`/`setSyncState()` read-merge-write pair over the widened `HumbleSyncState` record. |
| `ipc_handler.ts` | `library.ts` (`HumbleLibrary`) | `addHandler` delegation | ✓ WIRED | Confirmed: all three handlers delegate directly. |
| `GlobalState.tsx` | `window.api.humbleCheckHealth().then(humbleSync)` | Chained startup trigger after health check | ✓ WIRED | Confirmed present (also flagged as IN-06 info-level nuance: sync still fires once after an expired-session health check, a harmless extra round-trip, deferred). |
| `App.tsx` | `screens/Humble/Keys` | Lazy route registration for `/humble-keys`, guarded on `humble.isLoggedIn` | ✓ WIRED | Confirmed: route present; guard implemented inside the screen component (`Navigate` to login path) rather than the router table — functionally equivalent, documented deviation in 11-04-SUMMARY. |
| `user.ts` (`disconnect`) | `library.ts` (`syncFence`) | Generation-fence invalidation before store wipes | ✓ WIRED | Post-review CR-01 fix; confirmed present and regression-tested (8 disconnect-scoped tests green). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `HumbleKeys/index.tsx` | `humble.keys` (context slice) | `HumbleLibrary.getKeys()` → IPC `humbleGetKeys`/`humbleKeysUpdated` → `humbleLibraryStore.entries()` flattened | Yes — confirmed by live UAT rendering 25 real gamekeys across multiple states | ✓ FLOWING |
| `HumbleKeys/index.tsx` | `humble.syncError`/`syncedAt` | `HumbleLibrary.getSyncState()` → `humbleSyncStore` (real record, not static) | Yes — confirmed live (banner appeared on real network-down test) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Humble backend test suite passes | `npx jest src/backend/humble --no-coverage` | 7 suites, 219 tests passed | ✓ PASS |
| Full project suite passes | `pnpm test` | 31 suites, 528 tests passed, exit 0 | ✓ PASS |
| TypeScript compiles clean | `npm run codecheck` | exit 0 | ✓ PASS |
| ESLint clean on all Phase 11 files | `npx eslint src/backend/humble src/frontend/screens/Humble src/common/humble ...` | 0 errors, 117 pre-existing `any`-related warnings (unrelated to this phase's logic, consistent with SUMMARY claims) | ✓ PASS |
| Disconnect-survival regression (CR-01 fence + REVEALED-store preservation) | `npx jest ... -t "disconnect"` | 8 tests passed | ✓ PASS |
| All 11 code-review fix commits present in git history | `git show --stat <hash>` for CR-01/WR-01..10 | All 11 commits found with expected diffs | ✓ PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` convention or declared probes for this phase (backend/frontend TypeScript project, not a migration/CLI-tooling phase). Skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| HSYNC-01 | 11-01, 11-02, 11-03, 11-04, 11-05 | 5-state sync + concurrency-bounded cache-aggressive fetch | ✓ SATISFIED | See Truth #1 / requirement table above. |
| HSYNC-02 | 11-01, 11-02, 11-05 | Exactly one state; write-ahead REVEALED flag survives re-sync | ✓ SATISFIED | See Truth #2. |
| HSYNC-03 | 11-01, 11-02, 11-05 | Expiration/UNREDEEMABLE recomputed every sync | ✓ SATISFIED | See Truth #3. |
| HSYNC-04 | 11-01, 11-02, 11-03, 11-04, 11-05 | Fail-soft on unreachable Humble API | ✓ SATISFIED | See Truth #4. |

No orphaned requirements: all four HSYNC-0x IDs assigned to Phase 11 in REQUIREMENTS.md appear in at least one plan's `requirements:` frontmatter (cross-referenced above). REQUIREMENTS.md's traceability table and checkboxes for HSYNC-01..04 still show `Pending`/unchecked as of this verification — this is a documentation bookkeeping item (normally updated during phase-close), not a code gap; flagged here for the orchestrator to update alongside this report.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any Phase 11-touched file | — | None — clean scan across all 19 core Phase 11 files. |
| `src/common/types/humble.ts:13`, `adapter.ts` (schema_error paths) | multiple | `IN-05` (post-execution review, deferred): `schema_error` results carry the full raw untrusted body including `redeemed_key_val` in the discriminated union's `raw` field; no in-scope consumer currently logs it, but it is a standing hazard if a future caller does | ℹ️ Info (documented, deferred by design — reviewed and consciously deferred in 11-REVIEW.md, not blocking) | Latent risk only; C4/T-11-01 invariant not currently violated. |
| `src/backend/cache.ts:82` | 82 | `IN-07` (pre-existing, unrelated to this phase's logic): `Date()` locale-dependent timestamp string | ℹ️ Info (deferred, pre-existing) | Harmless for Phase 11's stores (indefinite lifespan, timestamps unused). |
| `src/frontend/screens/Humble/Keys/index.tsx:19-33` | — | `IN-02` (deferred): `formatRelativeTime` hardcoded English, freshness line doesn't tick on its own | ℹ️ Info (deferred, cosmetic) | Mirrors an existing LibraryHeader pattern; not a functional gap for HSYNC-04. |

**Critical/Warning findings from the post-execution code review (11-REVIEW.md) — all resolved:** 1 Critical (CR-01: disconnect did not fence an in-flight sync, allowing cross-account key bleed) + 10 Warnings (WR-01..10) were found and **all fixed with regression tests** (commits `14badb78`, `d20de0fd`, `9612448e`, `a06ae493`, `6eeffd43`, `be99e51e`, `9bf1a218`, `1d36fc9c`, `e81a3624`, `e5139cdc`, `85c2c184` — all 11 verified present in git history with matching diffs). 7 Info findings were consciously deferred (documented above, none block the phase goal).

### Human Verification Required

None outstanding. The phase's designated human-verify checkpoint (Plan 11-05, Task 2) was already executed during phase completion: a real Humble account (25 gamekeys) was used to drive sidebar gating, 5-state grouped rendering, read-only row confirmation, progressive-fill sync indicator, and fail-soft banner-on-network-failure — all confirmed PASS and recorded in `11-VALIDATION.md` "Live UAT Findings," approved by the tester 2026-07-06 after seven iterative fix rounds. This verifier treats that completed, dated, tester-approved checkpoint as satisfying the observable-behavior success criteria per this phase's verification instructions, and found no additional gaps requiring a further human check.

One item remains an explicitly-flagged deferral rather than a gap: **A1 (UNPICKED pseudo-entry)** was not exercisable on the tested account (no un-picked Humble Choice month present) and is recorded as "unverified on live data — defensive code path only," matching the same precedent Phase 10 used for its own unverifiable identity-advisory path. This is a documented, intentional deferral (not a phase-blocking gap) since the code path is unit-tested and the underlying account condition simply wasn't available during UAT.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all four HSYNC-0x requirements are backed by real, substantive, wired code — not stubs. The pure classification function (`classify.ts`) implements the exact 5-state precedence with full unit coverage; the sync orchestration (`library.ts`) is concurrency-bounded, skip-terminal, per-order-committed, and fail-soft against both typed and thrown failure classes; the three-store split correctly isolates the disconnect-surviving REVEALED flag; the IPC/preload/context-slice wiring reaches the renderer through a dedicated typed boundary (never the generic store bridge); and the Humble Keys screen renders the classification as a genuinely read-only, state-grouped list with a working fail-soft banner and freshness/progress indicators.

The phase went through an unusually rigorous closing sequence: 7 live-UAT fix rounds surfaced and fixed real API-shape mismatches (the spec's `redeemed_key_value`/`expiration` field names turned out to be wrong — live fields are `redeemed_key_val`/`is_expired`/`expiry_date`/`num_days_until_expired`), and a subsequent code review found and fixed 1 critical cross-account data-bleed bug (CR-01) plus 10 warnings, all confirmed present in the codebase with regression tests. The full suite (31 suites / 528 tests) passes, `npm run codecheck` is clean, and ESLint shows 0 errors (117 pre-existing `any`-related warnings unrelated to this phase's logic).

---

*Verified: 2026-07-06T21:30:00Z*
*Verifier: Claude (gsd-verifier)*
