---
phase: quick-260816-qcn
plan: 01
subsystem: steam
tags: [steam, precedence, platform-signal, pics, appdetails, concurrency, cache]

# Dependency graph
requires:
  - phase: 34.15-steam-platform-signal-and-sync-integrity
    provides: the bulk PICS oslist platform-capture writer (platformCapture.ts) that this task
      gives an explicit precedence rule against the pre-existing per-game appdetails writer
provides:
  - "resolvePlatformWrite() -- a shared, dependency-free freshest-write-wins decision function
    used by both Steam platform-signal writers"
  - "platformsSource / platformsCapturedAt provenance fields on SteamMetadataCacheEntry"
  - "withPlatformCaptureLock() -- a promise-chain mutex serialising captureOwnedAppPlatforms's
    scope-then-write critical section"
affects: [steam-platform-row, steam-install-form, steam-library-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Freshest-write-wins precedence via a shared, dependency-free decision function consumed
      by two independent writers, rather than a source-ranked or call-order-based rule"
    - "Promise-chain mutex (module-local `let chain = Promise.resolve()`, re-pointed at a
      swallowed-outcome continuation before returning) for serialising an async critical
      section without an external lock library"

key-files:
  created:
    - src/backend/storeManagers/steam/platformPrecedence.ts
    - src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts
  modified:
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/platformCapture.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/platformCapture.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "Freshest write wins by strict timestamp comparison; neither appdetails nor PICS oslist is
    declared authoritative (D-A, locked by CONTEXT.md, not re-litigated)"
  - "Ties (equal timestamps) go to the incoming write, stated once in resolvePlatformWrite and
    applied identically by both callers"
  - "A legacy entry with no platformsCapturedAt is treated as indefinitely old and writable by
    either source, handled at the read boundary inside the comparison -- no Migration added
    (MigrationSystem is dead code under Tauri)"
  - "A strictly-newer existing entry that cannot supply a COMPLETE platform triple (any boolean
    undefined) still loses the precedence decision -- an incomplete capture cannot win, per the
    three-valued contract"
  - "mergePlatformCapture declines silently (no .set() call) rather than rewriting identical
    values, when precedence declines its write"
  - "The serialisation lock in platformCapture.ts covers ONLY concurrent bulk-capture calls
    against each other, not the appdetails writer -- that writer's read-modify-write is already
    synchronous/atomic, and cross-writer ordering is resolvePlatformWrite's job, not the lock's"

requirements-completed: [WR-02]

# Metrics
duration: 8min
completed: 2026-08-16
---

# Quick Task 260816-qcn: Steam platform-signal precedence rule and serialised merge Summary

**Shared freshest-write-wins decision function (`resolvePlatformWrite`) now arbitrates both Steam platform-signal writers by strict timestamp, plus a promise-chain mutex serialising the bulk PICS capture's read-modify-write.**

## Performance

- **Duration:** ~8 min (commit-to-commit)
- **Started:** 2026-08-16T07:13:17Z (UTC, first task commit)
- **Completed:** 2026-08-16T07:20:57Z (UTC, final code commit)
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- Added `platformPrecedence.ts`, a dependency-free module exporting `resolvePlatformWrite()` —
  the single decision function `games.ts` (appdetails) and `platformCapture.ts` (bulk PICS
  `oslist`) both call. Whichever capture is strictly newer wins; a tie goes to the incoming
  write; a legacy entry with no timestamp is writable by either source.
- Added `platformsSource` / `platformsCapturedAt` provenance fields to
  `SteamMetadataCacheEntry`, stamped by both writers on every accepted write.
- `mergePlatformCapture` (PICS writer) now declines — makes no `.set()` call — when the cache
  already holds a strictly newer, complete capture.
- Added `withPlatformCaptureLock`, a promise-chain mutex serialising
  `captureOwnedAppPlatforms`'s entire scope-then-write critical section, closing the 34.15
  D-16 UAT finding F-2 shape (a second concurrent bulk run re-scoping everything because it
  couldn't see the first run's writes). A rejected locked section cannot poison the chain for
  later callers, and `captureOwnedAppPlatforms` still never rejects.
- `games.ts`'s `fetchMetadataIfNeeded` now resolves the EFFECTIVE platform triple via
  `resolvePlatformWrite` and uses it everywhere downstream — the `mac_arch` derivation gate,
  the pushed `GameInfo`, and the persisted cache entry all agree, closing the CR-01 split-brain
  shape (a stale/wrong triple reaching the install dialog) with the polarity flipped.
- Closed todo `2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md` (WR-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the two cache fields and the shared freshest-write-wins decision function** - `a518d7b9d` (feat)
2. **Task 2: Wire the PICS writer to the precedence rule and serialise the bulk critical section** - `b4f49e2fa` (feat)
3. **Task 3: Wire the appdetails writer, run the full gates, and close the todo** - `0a9346f3a` (feat)

_No separate TDD test/feat split — each task's tests and implementation landed together per the
plan's task-level granularity._

## Files Created/Modified

- `src/backend/storeManagers/steam/platformPrecedence.ts` (new) — `resolvePlatformWrite()`, the
  shared freshest-write-wins decision function; exports `PlatformSignalSource`,
  `PlatformTriple`, `PlatformWriteResolution`, `ExistingPlatformEntry`.
- `src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts` (new) — 15 tests: both
  precedence directions, ties, legacy/corrupted-timestamp handling, the partial-triple safety
  case, and a `lastWriteAlwaysWins` non-vacuity saboteur.
- `src/backend/storeManagers/steam/electronStores.ts` — added `platformsSource?` /
  `platformsCapturedAt?` to `SteamMetadataCacheEntry`, documented with the D-B honesty limit and
  the existing carry-forward warning pattern.
- `src/backend/storeManagers/steam/platformCapture.ts` — `mergePlatformCapture` now calls
  `resolvePlatformWrite` and declines on `accepted: false`; added `withPlatformCaptureLock` and
  wired it around `captureOwnedAppPlatforms`'s critical section, inside the existing `try`.
- `src/backend/storeManagers/steam/__tests__/platformCapture.test.ts` — extended (25 pre-existing
  tests untouched + 7 new: precedence stamp/decline/accept/legacy on `mergePlatformCapture`,
  concurrent-capture serialisation, lock-does-not-wedge, fail-soft-with-lock-in-place).
- `src/backend/storeManagers/steam/games.ts` — `fetchMetadataIfNeeded` resolves the effective
  triple via `resolvePlatformWrite` before it's used anywhere downstream (mac_arch gate,
  `GameInfo` literal, `steamMetadataStore.set()` literal).
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — added a `260816-qcn` describe block
  with 5 tests: declined-write split-brain check (cache + pushed GameInfo agree), accepted-write
  precedence flip, legacy-entry writability, carry-forward on the declined path, and the plan
  checker's additional gap (mac_arch derived from the EFFECTIVE, not raw, `is_mac_native`).
- `.planning/todos/completed/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md`
  — moved from `pending/`, WR-03/WR-04 "Related, also open" section left byte-identical.

## Decisions Made

- Freshest-write-wins, timestamp-based, symmetric — no source is authoritative (D-A, locked
  by CONTEXT.md; "appdetails always wins" and "PICS always wins" were both considered and
  rejected upstream of this execution).
- Comments throughout state the D-B honesty limit plainly: this makes ordering explicit and
  auditable and makes a silently-lost write impossible, but does NOT reconcile a genuine
  appdetails-vs-PICS disagreement — the surviving answer still depends on which sync ran most
  recently. No comment describes WR-02 or the two-writer conflict as closed/resolved.
- Legacy entries (no `platformsCapturedAt`) handled at the read boundary inside
  `resolvePlatformWrite`, not via a `Migration` (D-D — `MigrationSystem` is dead code under
  Tauri).
- The serialisation lock scopes to concurrent bulk-capture calls only; it deliberately does not
  exclude the appdetails writer, whose own read-modify-write is already synchronous.

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan-checker-directed addition, folded into Task 3] Closed a silent-regression gap: `mac_arch` derivation must use the EFFECTIVE `is_mac_native`, not the raw appdetails value**
- **Found during:** Task 3 (plan checker gap flagged before execution, per the orchestrator's `<additional_requirement>`)
- **Issue:** No test asserted that `games.ts`'s `mac_arch` derivation reads the effective
  (post-precedence) `is_mac_native` rather than the raw appdetails value when the two disagree.
  Without this, a future refactor could silently regress `mac_arch` derivation to key off the
  raw, possibly-losing appdetails triple.
- **Fix:** Added a dedicated test asserting that when precedence declines the appdetails
  platform write (existing PICS capture is strictly newer, complete, and `is_mac_native: false`),
  `mac_arch` is NOT derived via `macArchFromMinOS` and stays `undefined` — matching the existing
  (absent) `existingMeta.mac_arch`, on both the cache write and the pushed `GameInfo`.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`
- **Verification:** New test passes; full `mac_arch` derivation code in `games.ts` already used
  the effective triple by construction (Task 3's `<action>` explicitly required this), so this
  was a coverage gap, not an implementation gap.
- **Committed in:** `0a9346f3a` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (test-coverage addition per plan checker, no source-code deviation)
**Impact on plan:** No scope creep — the underlying implementation already satisfied the
requirement; only test coverage was added, exactly as the orchestrator instructed.

## Issues Encountered

- Prettier flagged pre-existing formatting drift in `platformCapture.test.ts` and
  `games.test.ts` unrelated to this task's edits (both files predate this task and had
  accumulated minor formatting inconsistencies). Ran `prettier --write` on both; `git diff
  --stat` confirmed only additive/reformatting changes with no logic altered, and the full test
  suite stayed green after the reformat.
- The full `npx jest` run intermittently failed 1-2 unrelated tests in
  `src/backend/sidecar/__tests__/` (`bootstrapWirings.test.ts`, `devSecretVault.test.ts`,
  `enrichmentFlows.test.ts` — a different one each run) — confirmed as the pre-existing
  documented "cross-test frame-leak flake class" (referenced in prior plans' summaries, e.g.
  34.4.1-07) by re-running each failing suite in isolation (always green) and by running the
  full suite with `--runInBand`, which produced a clean 284/284 suites, 5925/5926 tests, 1
  pre-existing skip. None of the flaking files are touched by this task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-02 (Phase 34.15 review finding) is closed. WR-03 (`library.ts:757-766`) and WR-04
  (`librarySyncIndicator.ts:70-77`) remain open by explicit user decision — untouched by this
  task, `git diff --stat` confirmed empty against both files.
- `depotSignalCaptured` and `hasSteamWindowsDepot` (and its three saboteurs) remain
  byte-unchanged — confirmed via empty `git diff --stat` against `metadataCapture.ts` and
  `steamPlatformRow.ts`.
- No new stub surfaces or hardcoded empty values were introduced.

## Threat Flags

None — all five register entries (T-qcn-01 through T-qcn-05) were mitigated as planned:
`Number.isFinite` guard on the timestamp read (T-qcn-01), the swallowed-outcome lock
continuation (T-qcn-02), the lock acquisition living inside the existing `try` (T-qcn-03), no
new logging surface (T-qcn-04, accepted), and both new fields explicitly enumerated in the
`games.ts` `set()` literal with a dedicated carry-forward test (T-qcn-05). No new
network/auth/file-access surface was introduced beyond the register's scope.

---
*Phase: quick-260816-qcn*
*Completed: 2026-08-16*

## Self-Check: PASSED

All 8 files created/modified by this task verified present on disk (7 source/test files + the
moved todo). Confirmed the pending-copy of the todo no longer exists. All 3 task commit hashes
(`a518d7b9d`, `b4f49e2fa`, `0a9346f3a`) verified present in git history.
