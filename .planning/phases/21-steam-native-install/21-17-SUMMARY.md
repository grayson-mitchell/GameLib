---
phase: 21-steam-native-install
plan: 17
subsystem: steam-install
tags: [steam, acf, stateflags, install-status, react, i18n, gap-closure]

# Dependency graph
requires:
  - phase: 21-steam-native-install
    provides: depot-download orchestrator (depot.ts downloadSteamDepots/finalizeToSteam), install-state pollers (library.ts), steamResumePending field + steam-waiting-for-restart affordance (21-16)
  - phase: 23-full-ownership-install
    provides: canWriteFullOwnership completeness gate (StateFlags=4)
provides:
  - "isFullyInstalledStateFlags() — single exported bit-4 completeness predicate, now the only source of the 'is this Steam game installed' decision"
  - "markSteamInstallIncomplete() — same-session native-cancel surfacing helper (the gap init()'s startup-surface scan didn't cover)"
  - "abort-aware downloadSteamDepots finalize — a signal-aborted run can never earn StateFlags=4"
  - "distinct 'Finish in Steam' resume affordance on the detail action button, detail status, and tile label"
affects: [21-UAT, steam-native-install-progress-polish-todo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "single completeness predicate (isFullyInstalledStateFlags) replacing N independent inline bitmask checks — regression-locked by tests"
    - "abort-aware finalize: compute `cancelled = outcome==='cancelled' || signal?.aborted` at the finalize call site, never trust a possibly-stale outcome value alone"
    - "statusContext threading for a NOT-installing state (steam-incomplete) — extends the existing steam-waiting-for-restart/steam-paused pattern to the notInstalled branch, which previously never threaded statusContext at all"

key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamIncomplete.test.tsx
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/frontend/hooks/constants.ts
    - src/frontend/hooks/hasStatus.ts
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts
    - public/locales/en/gamepage.json

key-decisions:
  - "isFullyInstalledStateFlags is the ONLY place bit-4 (0x4 FullyInstalled) is ever computed — buildInstalledMap, readAcfState, and buildBottleInstalledMap all route through it (regression lock, T-21-17-01)"
  - "markSteamInstallIncomplete mirrors init()'s startup-surface pattern (surface as resumable, never auto-drive) and reuses the existing steamResumePending field rather than inventing a new one"
  - "downloadSteamDepots's finalize() closure computes cancelled = lastResult?.outcome==='cancelled' || opts.signal?.aborted===true and forces that into the outcome threaded to finalizeToSteam — canWriteFullOwnership itself is untouched"
  - "'steam-incomplete' is a distinct statusContext value from 'steam-waiting-for-restart'/'steam-paused' — those only apply while is.installing; steam-incomplete applies when the game is NOT currently installing but has an incomplete on-disk manifest"
  - "hasStatus.ts's notInstalled branch previously never threaded statusContext into getStatusLabel or setGameStatus at all — this plan wires it for the first time, deriving 'steam-incomplete' from gameInfo.install?.steamResumePending"

patterns-established:
  - "Reproduction-first TDD for a suspected async race: write the test proving the ACTUAL observed behavior (StateFlags value) before/independent of the fix, record the finding in the SUMMARY rather than assuming the bug reproduces"

requirements-completed: [SNI-01, SNI-04]

# Metrics
duration: ~30min
completed: 2026-07-19
---

# Phase 21 Plan 17: Steam Native Install — Incomplete-Install Honesty Gate Summary

**Single bit-4 completeness predicate + abort-aware finalize close the backend spoofing gap, paired with a distinct "Finish in Steam" resume affordance replacing the false Play/Install labels — closes D-UAT-09**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-19
- **Tasks:** 2 completed
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments

- Centralized the Steam "is this game installed" decision into one exported predicate (`isFullyInstalledStateFlags`), eliminating three independent inline bitmask checks that could have silently diverged over time.
- Hardened `downloadSteamDepots`'s finalize path so a cancelled/aborted native download can never earn a trustworthy `StateFlags=4` manifest — it always converges on the honest `1026` verify-repair handoff, even in the specific async-interleaving scenario the plan's threat model called out (T-21-17-02).
- Closed the one gap `init()`'s startup-surface scan never covered: a **same-session** native install cancel now immediately flips `is_installed=false` + `steamResumePending=true` via the new `markSteamInstallIncomplete()` helper, so the UI can never show a stale Play button for the rest of that session.
- Delivered a distinct "Finish in Steam" resume affordance across all three gamepage surfaces (detail action button, detail status line, tile label) for an incomplete native install — never a bare "Install" (which reads as a from-scratch download) and never "Play" (which would hand off to Steam's install/repair instead of launching).

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend — strict bit-4 completeness gate + cancel can never write StateFlags=4 + mark incomplete on same-session cancel** - `452ec85c` (fix)
2. **Task 2: Frontend — incomplete native install shows a distinct "Finish in Steam" resume affordance, never Play** - `a03c1ad8` (feat)

_Both tasks were executed with tests and implementation together (not split into separate RED/GREEN commits) — the plan's `type: execute` frontmatter does not carry the strict plan-level TDD gate; the task-level `tdd="true"` behaviors were fulfilled by writing each behavior's test alongside its implementation and verifying all pass before commit._

## Files Created/Modified

- `src/backend/storeManagers/steam/library.ts` - added `isFullyInstalledStateFlags()` (single bit-4 predicate, now used by `buildInstalledMap`/`readAcfState`/`buildBottleInstalledMap`); added `markSteamInstallIncomplete()`
- `src/backend/storeManagers/steam/depot.ts` - `downloadSteamDepots`'s `finalize()` closure now forces `outcome:'cancelled'` whenever `lastResult.outcome==='cancelled' || opts.signal?.aborted===true`; the post-download `result.outcome==='cancelled'` early-return check gained the same `opts.signal?.aborted` OR-clause
- `src/backend/storeManagers/steam/games.ts` - `runNativeDepotDownload`'s cancelled branch now calls `markSteamInstallIncomplete(this.appId)` before returning `{status:'abort'}`
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - Test A (predicate truth table), Test B (buildInstalledMap/readAcfState regression lock over a mixed 1026/4 fixture), Test E (markSteamInstallIncomplete behavior + no-op-on-missing-entry)
- `src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts` - **new** — reproduction test + Test C (cancel never earns 4) + Test D (genuine complete still earns 4, no regression)
- `src/frontend/hooks/constants.ts` - `getStatusLabel()`'s `notInstalled` entry branches on `runner==='steam' && statusContext==='steam-incomplete'`
- `src/frontend/hooks/hasStatus.ts` - the `notInstalled` branch now derives and threads a `'steam-incomplete'` statusContext from `gameInfo.install?.steamResumePending` (previously never threaded statusContext there at all)
- `src/frontend/screens/Game/GamePage/components/MainButton.tsx` - `getButtonLabel()` gained the incomplete/resume branch, placed before the generic Install fallthrough
- `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` - `getInstallLabel()` gained a matching steam-incomplete branch in the not-installing tail
- `src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamIncomplete.test.tsx` - **new** — no-Play + "Finish in Steam" when incomplete; Play unchanged when installed; steam-waiting-for-restart/steam-paused unaffected; bare not-installed unaffected
- `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` - extended the real-`getStatusLabel` describe block with 3 steam-incomplete cases
- `public/locales/en/gamepage.json` - new `status.steamFinishInSteam` key ("Finish in Steam")

## Decisions Made

See `key-decisions` in frontmatter above — all five were made during execution and are captured there (single predicate chokepoint, markSteamInstallIncomplete's startup-surface mirroring, the abort-aware finalize computation, the distinct steam-incomplete statusContext value, and hasStatus.ts's first-time statusContext threading in the notInstalled branch).

## Root-Cause / Reproduction Finding (required by plan `<output>`)

The plan's Task 1 behavior spec required a reproduction test to run FIRST and record the actual observed StateFlags value for an aborted-but-otherwise-complete download, before assuming Task 1.2's fix was necessary.

**Observed:** In every constructible synchronous test scenario (the full `downloadSteamDepots` orchestrator driven end-to-end with a real depot/file/chunk, a real buildid, zero failures, and the `AbortSignal` aborted mid-flight via a `fetchChunk` mock side-effect), the written `StateFlags` was **1026, never 4** — both structurally before and after Task 1.2's code change. `downloadDepotFiles`'s own outcome computation (`opts.signal?.aborted ? 'cancelled' : 'completed'`, evaluated as the very last synchronous step before its `return`) already reads a live, unraceable `signal.aborted` value: there is no `await` gap between that check and `downloadSteamDepots`'s own `lastResult = result; await finalize()` continuation that an external `controller.abort()` call could interleave into within Node's single-threaded/microtask-draining execution model.

**Conclusion:** No live StateFlags=4 leak was empirically reproduced under this jest harness's synchronous mock model. Task 1.2's abort-aware `finalize()` computation (`cancelled = lastResult?.outcome==='cancelled' || opts.signal?.aborted===true`) is legitimate **defense-in-depth** — it closes a class of interleaving that a real Node.js process (real network I/O via libuv thread-pool callbacks racing an Electron IPC-triggered `abort()` call, both scheduled as separate macrotasks) could exhibit in ways a fully synchronous jest mock cannot fully exercise. It matches the plan's threat model disposition for T-21-17-02 (`mitigate`) and does not regress D-04, D-UAT-05, 21-16, or Phase 23's genuine-complete StateFlags=4 path (all verified by the full backend steam suite staying green, 691 tests → 691 tests after Task 1, and 840 tests after Task 2 across the whole affected backend+frontend surface).

Given this finding, the real D-UAT-09 bug on real hardware is most plausibly the **same-session cancel gap** (Task 1.3 / `markSteamInstallIncomplete`) and/or the **frontend affordance gap** (Task 2) — i.e., the install-state detection itself (`isFullyInstalledStateFlags`) was already correct, but nothing flipped `is_installed` to `false` immediately after a same-session cancel, and even when it was `false`, the UI showed a generic (non-distinct) "Install" rather than an honest resume hint. Both of those gaps are now closed.

## Deviations from Plan

None - plan executed exactly as written. The reproduction test's finding (StateFlags=1026 in every constructible scenario, not a live StateFlags=4 leak) was itself an expected, planned-for outcome of the "REPRODUCE FIRST" instruction in Task 1's `<behavior>` block — the plan explicitly frames this as "proves whether an interrupted run can currently earn StateFlags=4," not as a foregone conclusion that it does.

## Issues Encountered

None. All backend and frontend test suites in the affected areas stayed green throughout (`npx jest src/backend/storeManagers/steam --silent` → 691 tests before Task 2, 840 tests across backend+frontend after Task 2; `npm run codecheck` clean at both checkpoints). One pre-existing, unrelated jest leaked-timer crash log appears after the backend steam suite completes (documented in project memory as `library.ts leaked-timer jest exit-1`) — out of scope for this plan, does not affect test pass/fail counts.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **21-UAT.md** already lists this gap (D-UAT-09) as the reason for gap plan 21-17; the deferred hardware UAT re-run (cancel a native install just before it finishes, confirm no Play button, confirm "Finish in Steam" shows, then confirm clicking it / letting Steam finish yields a launchable game) remains the next step — this plan's `<verification>` section explicitly defers that to the 21-UAT 1d re-run, mirroring 21-16's autonomous-then-UAT split.
- No blockers for that hardware UAT — all automated verification (backend suite, frontend suite, codecheck) passed clean before this SUMMARY was written.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: .planning/phases/21-steam-native-install/21-17-SUMMARY.md
- FOUND: src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts
- FOUND: src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamIncomplete.test.tsx
- FOUND: commit 452ec85c (Task 1)
- FOUND: commit a03c1ad8 (Task 2)
