---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 03
subsystem: infra
tags: [steam, depot, resume, reconciliation, sha1, stateflags, vdf]

# Dependency graph
requires:
  - phase: 23-01
    provides: applyDepotFileFlags (EDepotFileFlag ReadOnly/Hidden application) — reused by the shared applyEDepotFileModes helper this plan extracts for the reconciled-file mode-heal loop
  - phase: 23-02
    provides: canWriteFullOwnership fail-closed completeness gate, extended DepotDownloadResult/FinalizeToSteamOpts gate-input fields — this plan is the first to feed real (non-empty) gate inputs into finalizeToSteam from BOTH the download path (Task 2) and the startup-resume path (Task 3)
provides:
  - "reconcilePartialState(plan, installRoot) — sha1-gated partial-state reconciliation, exported from depot/reconcile.ts, returning a reduced job list + allFilesVerified record"
  - "sha1File and resolveContainedPath exported from depot.ts (were module-private) for reuse by reconcile.ts — no duplication"
  - "downloadDepotFiles reconciles on-disk state BEFORE building its download job list — a resume/retry no longer re-downloads 100%; reconciled (skipped) files get EDepotFileFlag modes re-applied idempotently via the new shared applyEDepotFileModes helper"
  - "SteamLibraryManager.init()'s startup resume rebuilds a real DepotPlan (buildDepotPlan) and reconciles it (reconcilePartialState) instead of finalizing an empty depots:[] — a fully-reconciled-verified resume can now earn StateFlags=4; a resume with genuinely missing/mismatched files fails CLOSED to 1026 (T-23-09); any plan-rebuild failure (offline) falls back to the pre-23-03 honest-empty shape without crashing init()"
affects: [23-04, 23-UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composable reconciliation: reconcile.ts imports sha1File/resolveContainedPath/PathTraversalError FROM depot.ts, and depot.ts imports reconcilePartialState FROM depot/reconcile.ts — a deliberate circular import, safe under this project's CommonJS/ts-jest interop because every cross-reference is a function-body call site, never top-level module-evaluation state (verified empirically: reconcile.test.ts, depot.test.ts, and library.test.ts all pass)"
    - "Reconciliation-failure fallback: any error while reconciling (a path-traversal filename, a plan-rebuild failure) degrades to the PRE-23-03 behavior (full re-download in downloadDepotFiles; honest-empty depots:[] finalize at startup) rather than throwing/crashing — reconciliation is purely additive, never a new failure mode"

key-files:
  created:
    - src/backend/storeManagers/steam/depot/reconcile.ts
    - src/backend/storeManagers/steam/__tests__/reconcile.test.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "Directory(64)/Symlink(512) manifest entries are reconciled by existence/target-match (lstat/readlink), never sha1 — an already-complete install with empty directories or symlinks still correctly reduces to zero jobs; zero-size regular files mirror downloadSingleFile's own no-sha1 fast path (a manifest sha_content for an empty file is not guaranteed to represent a meaningful empty-content digest)"
  - "A reconciliation-time error inside downloadDepotFiles (e.g. a path-traversal filename) falls back to the FULL pre-23-03 job list rather than aborting the whole run — preserves the pre-existing per-file T-21-01 traversal test (each file still goes through downloadSingleFile's own per-job try/catch) instead of requiring reconcile.ts to track per-file error provenance"
  - "applyEDepotFileModes extracted as a shared helper (was inline in downloadSingleFile) so Task 2's reconciled-file mode-heal loop and downloadSingleFile's own post-sha1-verify step share one implementation — not duplicated"
  - "Startup resume's allModesApplied mirrors allFilesVerified rather than re-running a mode-reapplication pass at startup: every file reconcile trusts as content-verified was ALREADY sha1-verified during a prior download session, and downloadSingleFile applies EDepotFileFlag modes immediately after each file's own sha1 check (before moving to the next file) — so a file reconcile proves complete also already had correct modes applied in that same prior pass. This avoided threading a second exported mode-application surface into library.ts for a case that's already covered by the original download session's own ordering guarantee."
  - "hostSteamDepotOsForResume() is a small local duplicate of games.ts's private hostSteamDepotOs(), not a newly-exported cross-file symbol — kept games.ts outside this plan's files_modified scope for a 4-line OS-vocabulary mapping"
  - "Startup resume's outcome/failures are derived directly from reconcile's job list (empty jobs -> 'completed'/[]; any job -> 'cancelled' + one failure entry per unresolved file) rather than introducing a third outcome vocabulary — composes cleanly with the existing canWriteFullOwnership gate with no new gate-side logic"

requirements-completed: [REQ-23-04, REQ-23-05]

# Metrics
duration: ~40min
completed: 2026-07-17
---

# Phase 23 Plan 03: Resume/Reconciliation (D-04) + Update-Ownership Boundary (D-05) Summary

**New sha1-gated `reconcilePartialState` composes depot.ts's existing `sha1File`/`resolveContainedPath` to detect what's already correctly on disk — wired into both `downloadDepotFiles` (a retry/resume no longer re-downloads 100%) and `SteamLibraryManager.init()`'s startup resume (which now rebuilds a real `DepotPlan` and can earn a trustworthy `StateFlags=4` on a proven-complete resume, failing closed to `1026` otherwise).**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- New `depot/reconcile.ts` exporting `reconcilePartialState(plan, installRoot)` — walks every file in a `DepotPlan`, resolves its destination via the shared `resolveContainedPath` (containment-checked, never `path.join`), and decides missing/wrong-size/content-mismatched (job) vs. present-and-sha1-verified (skipped) per file; Directory/Symlink entries reconcile by existence/target-match, zero-size files skip the sha1 step (mirrors `downloadSingleFile`'s own fast path)
- `sha1File` and `resolveContainedPath` exported from `depot.ts` (were module-private) — reused, not duplicated, by `reconcile.ts`, closing a genuine circular-import loop that is empirically safe under this project's CJS/ts-jest interop (verified by 3 passing test suites)
- `downloadDepotFiles` now calls `reconcilePartialState` before building its job list — a pre-existing, sha1-verified file's chunks are never re-fetched; a new shared `applyEDepotFileModes` helper (extracted from `downloadSingleFile`'s existing exec/readonly/hidden block) re-applies modes to every reconciled (skipped) file, healing an older partial download's missing modes even though the bytes are untouched
- `SteamLibraryManager.init()`'s startup resume block replaced its empty `depots: []` finalize with `buildResumeFinalizeOpts` — rebuilds a real `DepotPlan` via `buildDepotPlan`, reconciles it, and threads real `depots`/`buildid`/`outcome`/`failures`/`allFilesVerified`/`allModesApplied` into `finalizeToSteam`; a fully-reconciled-verified resume earns `StateFlags=4`, a resume with genuinely missing/mismatched files fails CLOSED to `1026` (never `4`, never crashes `init()`), and any plan-rebuild failure (offline, dropped CM connection) degrades to the pre-23-03 honest-empty fallback
- Preserved the confirmed-safe invariant (RESEARCH Pitfall 5): the startup resume path never calls `getBottleSteamappsDir()`/`tellBottledSteamToInstall` — `buildDepotPlan` only reads PICS + fetches manifests over the already-authenticated CM connection, the same network calls a fresh install already performs; regression-tested
- 9 new `reconcile.test.ts` tests (sha1-match skip, missing/wrong-size/mismatched-content include, path-traversal throw, Directory/Symlink reconciliation, zero-size fast path) + 3 new `downloadDepotFiles` integration tests (fetchChunk never called for a reconciled file, zero-jobs-and-StateFlags=4 on an already-complete install, mode-heal on a reconciled file) + 3 new `library.test.ts` tests (earns-4 on full reconciliation, fails-closed-to-1026 on missing files, offline `buildDepotPlan` failure never throws) + 1 extended regression assertion (`getBottleSteamappsDir` never called from resume)

## Task Commits

Each task was committed atomically:

1. **Task 1: reconcile.ts — sha1-gated partial-state reconciliation** - `4c21ec43` (feat)
2. **Task 2: Wire reconcile into downloadDepotFiles + set allFilesVerified** - `5778dcec` (feat)
3. **Task 3: Startup resume rebuilds a real plan + reconciles; bottle-root-never-scanned regression** - `2b6f7942` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified

- `src/backend/storeManagers/steam/depot/reconcile.ts` - New: `reconcilePartialState(plan, installRoot)` — sha1-gated reduced job list + verification record
- `src/backend/storeManagers/steam/__tests__/reconcile.test.ts` - New: 9 tests (real tmpdir, no fs mocking)
- `src/backend/storeManagers/steam/depot.ts` - Exported `sha1File`/`resolveContainedPath`; wired `reconcilePartialState` into `downloadDepotFiles`'s job builder (with a full-list fallback on reconciliation error); extracted `applyEDepotFileModes` shared helper; added the reconciled-file mode-heal loop
- `src/backend/storeManagers/steam/library.ts` - Added `hostSteamDepotOsForResume()` + `buildResumeFinalizeOpts()`; `init()`'s resume block now calls `buildResumeFinalizeOpts` instead of finalizing `depots: []` directly
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - Added `chmodSync` import + a `reconciliation wiring (D-04/D-05)` describe block (3 tests)
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - Added `buildDepotPlan`/`reconcilePartialState` mocks, extended the bottle-non-dispatch regression test with a `getBottleSteamappsDir` assertion, added a `startup resume reconciliation (D-04)` describe block (3 tests)

## Decisions Made

See `key-decisions` in frontmatter — summarized: Directory/Symlink/zero-size files get non-sha1 reconciliation paths; a reconciliation-time error degrades to full re-download rather than aborting; mode-application logic is shared (not duplicated) via `applyEDepotFileModes`; startup resume trusts the original download session's own mode-application ordering rather than re-running a second mode-heal pass; `hostSteamDepotOsForResume` is a small intentional local duplicate to keep `games.ts` out of this plan's file scope; startup-resume outcome/failures are derived directly from the reconcile job list.

## Deviations from Plan

None — plan executed exactly as written. The circular import between `depot.ts` and `depot/reconcile.ts` (each imports symbols from the other) was anticipated by 23-PATTERNS.md ("either export it from depot.ts for reuse in reconcile.ts, or move it to a shared location... planner's call") and resolved in favor of the direct-export approach the plan's own `<action>` text specifies; empirically verified safe (all three affected test suites pass) rather than treated as a blocking architectural concern.

## Issues Encountered

- `writeAppManifest`'s real implementation does not `mkdir` its target directory — the two new `library.test.ts` gate tests that delegate to the REAL `finalizeToSteam` (via `jest.requireActual`) needed an explicit `mkdirSync(join(tmp, 'steamapps'), { recursive: true })` in their fixture setup before the first `init()` call, or the write silently failed with ENOENT (caught by `init()`'s outer try/catch, producing a confusing "no manifest file was ever written" failure rather than a crash). Not a code bug — pre-existing, intentional behavior (the caller's `targetSteamappsDir` always already exists in production, since it's derived from a real Steam library path) — just a test-fixture gap, fixed inline before the first commit.
- `pnpm test:ci` (full suite) reports all suites passing (Backend + Frontend), then the process crashes ~1s after completion with the SAME stray-timer `TypeError: Cannot read properties of undefined (reading 'map')` in `library.ts`'s `pollInstallOnce`/`readAcfState` documented in `deferred-items.md` from 23-02. Confirmed unrelated: the crash trace involves `getSteamLibraries` returning `undefined` after some other test's mocks were torn down, not any of this plan's own logic (`buildResumeFinalizeOpts`/`reconcilePartialState`/`applyEDepotFileModes` are absent from the trace). No new deferred item filed — already tracked.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `reconcilePartialState`, the exported `sha1File`/`resolveContainedPath` primitives, and `applyEDepotFileModes` are all available for Plan 04's real-hardware D-07 interrupt-resume UAT gate (Assumption A3 — large-title sha1 resume cost — is explicitly deferred to that gate, not measured here).
- The `canWriteFullOwnership` completeness gate (23-02) now has two independent, real call paths feeding it non-empty gate inputs (fresh install via `downloadDepotFiles`, resume via `buildResumeFinalizeOpts`) — both converge on the exact same single predicate, so the fresh-install and resume paths cannot silently diverge on what counts as "complete" (RESEARCH.md Pitfall 2, preserved).
- No blockers for 23-04. The pre-existing `pnpm test:ci` exit-1-after-all-pass issue (see Issues Encountered) remains open, tracked in `deferred-items.md` since 23-02 — not a blocker for this plan.

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: new-startup-network-call | `src/backend/storeManagers/steam/library.ts` | `SteamLibraryManager.init()` now calls `buildDepotPlan` (PICS appinfo + per-depot manifest fetch over the authenticated CM connection) automatically on every app startup for each in-progress download, where previously startup resume made zero network calls. This is the SAME network surface `install()` already exercises (no new endpoint, no new data exposure) — flagged because it changes WHEN that surface is exercised (unconditionally at startup vs. only on explicit user install), which a security reviewer should be aware of even though the threat model's T-23-10 boundary already covers the resume path and the call site is gated by the pre-existing `scanDownloadingAppIds()` native-only, in-library-Map-only filter. |

---

*Phase: 23-steam-full-ownership-install-stateflags-4*
*Completed: 2026-07-17*

## Self-Check: PASSED

All created/modified files verified present on disk; all three task commit hashes (4c21ec43, 5778dcec, 2b6f7942) verified present in git log.
