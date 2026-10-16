---
phase: 21-steam-native-install
plan: 07
subsystem: steam-install-stop-opt-in-branch
tags: [steam, install, stop, abort-controller, opt-in, error-surface-reuse, tdd]

# Dependency graph
requires:
  - phase: 21-06
    provides: depot.ts downloadSteamDepots(appId, opts) — the never-throwing
      { status, error? } orchestrator this plan calls directly, and its
      classifyDepotError-derived error message contract
  - phase: 21-03
    provides: nativeInstallSetting.ts isSteamNativeInstallEnabled() — the D-13
      opt-in read seam this plan's install() branch consults
provides:
  - "games.ts install() opt-in branch: isSteamNativeInstallEnabled() ON
    (non-bottle-eligible) routes through depot.ts's downloadSteamDepots via
    two new typed seam files; OFF preserves the legacy steam://install path
    byte-for-byte"
  - "games.ts installNative(args) — outcome->InstallResult mapping using the
    SAME conventions gog/legendary's own install() functions use ('done'->
    success, 'error'->classified message, 'cancelled'->{status:'abort'}),
    so the DownloadManager queue's EXISTING generic error+Retry surface
    renders a failed native install with zero downloadqueue.ts changes"
  - "games.ts stop() — real D-02 abort for an in-flight native depot download
    via callAbortController(appId) + a new nativeInstallsInFlight bookkeeping
    Set; safe no-op preserved for the legacy steam:// and bottle paths"
  - "clientSetup.ts ensureSteamClientReady(appId) — Plan 10's typed seam,
    minimal always-ready stub"
  - "installLocation.ts resolveSteamInstallTarget(appId, args) — Plan 09's
    typed seam, minimal first-Steam-library stub"
affects: [21-09 (installLocation.ts's real target-resolution body — same
  exported signature, no games.ts changes needed), 21-10 (clientSetup.ts's
  real Steam-client-readiness body — same exported signature, no games.ts
  changes needed), 21-11 (D-15 bottle branch — install()'s existing
  isBottleEligible() branch is untouched by this plan and stays Plan 11's
  scope)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Task-level TDD (RED test commit -> GREEN implementation commit per
      task), with a single combined RED commit for Tasks 1+2 (shared mocks/
      fixtures, and Task 2's in-flight-abort test structurally depends on
      Task 1's controller-registration code existing) — documented as a
      deliberate deviation from strict one-RED-commit-per-task, not an
      accidental merge"
    - "Outcome mapping mirrors gog/legendary's own install() InstallResult
      conventions exactly (status: 'done'|'error'|'abort') rather than
      inventing a steam-specific status value — this is what lets the
      classified depot error render through downloadqueue.ts's EXISTING
      generic error+Retry surface with zero changes to that file"
    - "In-flight bookkeeping via a private module-level Set
      (nativeInstallsInFlight), NOT a query added to aborthandler.ts —
      aborthandler.ts intentionally exposes no 'is this id registered' read,
      only create/call/delete, so games.ts owns its own has-abort-controller
      bookkeeping on top of that lifecycle"
    - "Seam files (clientSetup.ts, installLocation.ts) export ONLY the typed
      async function signature Plans 09/10 will implement — the stub body
      is a single-line always-succeed/first-library return, so those plans
      replace the body without touching the signature or any games.ts call
      site"

key-files:
  created:
    - src/backend/storeManagers/steam/clientSetup.ts
    - src/backend/storeManagers/steam/installLocation.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "clientSetup.ts and installLocation.ts are NEW files despite not being
    listed in the plan's own files_modified — the plan's action text and
    acceptance criteria both explicitly require them to exist with typed
    stub signatures ('The two new seam files ... exist with typed stub
    signatures matching what Plans 09/10 will implement'), and games.ts
    cannot import ensureSteamClientReady/resolveSteamInstallTarget from
    files that don't exist. Rule 3 (blocking) — files_modified omission,
    not a scope change; both bodies are single-purpose stubs Plans 09/10
    replace without touching the exported signature."
  - "hostSteamDepotOs() is a NEW private helper distinct from library.ts's
    existing hostInstallPlatform() — depot/select.ts's DepotSelectOpts.os
    matches Steam's PICS oslist vocabulary ('windows'|'macos'|'linux'
    lowercase), NOT the InstallPlatform vocabulary hostInstallPlatform()
    returns ('Windows'|'Mac'|'linux', mixed case, Mac not macos). Conflating
    the two would silently break depot os-filtering on macOS/Windows."
  - "In-flight tracking is a private Set in games.ts, not a new
    aborthandler.ts export — aborthandler.ts's callAbortController already
    no-ops safely (logs an error, does not throw) when no controller is
    registered for an id, so games.ts's own Set is purely to decide WHETHER
    to call it at all (satisfying the 'no abort call' acceptance criterion
    for the no-op case), not to prevent a crash."
  - "installNative()'s cancel outcome maps to InstallResult{status:'abort'}
    (no error field) rather than {status:'error'} — this is the SAME
    abort-shaped result gog/games.ts's own install() returns on a genuine
    user cancel (res.abort -> {status:'abort'}), matching the plan's own
    explicit requirement that a cancel must not produce a Retry-error UI."

requirements-completed: [SNI-07]

# Metrics
duration: ~40min
completed: 2026-07-15
---

# Phase 21 Plan 07: Steam Install/Stop Opt-in Branch Summary

Wired the D-13 opt-in setting into `SteamGame.install()`/`stop()`: ON (non-bottle-eligible) routes a native install through two new typed Plan 09/10 seams (`clientSetup.ts`/`installLocation.ts`) and `depot.ts`'s `downloadSteamDepots` orchestrator (Plan 06), mapping its never-throwing `{status, error?}` outcome onto `InstallResult` using the exact same conventions `gog`/`legendary`'s own `install()` functions already use — so a classified depot error renders through the DownloadManager queue's **existing** generic error+Retry surface with **zero changes to `downloadqueue.ts`**. OFF preserves today's `steam://install` handoff byte-for-byte. `stop()` converted from an unconditional no-op into a real `callAbortController`-driven cancel (D-02) for an in-flight native depot download, tracked via a new private `nativeInstallsInFlight` Set, while staying the historic safe no-op for the legacy `steam://`/bottle paths.

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-15
- **Tasks:** 2
- **Files modified:** 4 (games.ts, games.test.ts, clientSetup.ts (new), installLocation.ts (new))

## Accomplishments

- `install()` gained a single new branch condition — `isSteamNativeInstallEnabled()` — placed AFTER the existing `isBottleEligible()` branch (D-15 bottle scope untouched, Plan 11's job) and BEFORE the legacy `buildSteamProtocolUrl`/`shell.openExternal` path, which remains completely unmodified when the opt-in is OFF (proven by a dedicated test asserting `downloadSteamDepots`/`ensureSteamClientReady`/`resolveSteamInstallTarget` are never called)
- `installNative(args)` calls the seams in the exact order the plan specifies — `ensureSteamClientReady` → `resolveSteamInstallTarget` → `createAbortController` → `downloadSteamDepots` — proven via `jest.fn().mock.invocationCallOrder` assertions, not just "was called" checks
- Outcome mapping proven for all three `DepotDownloadOutcome.status` values: `'done'` → `{status:'done'}` + `startInstallPolling` fires; `'error'` → `{status:'error', error: <exact classified message>}` with `startInstallPolling` NOT called; `'cancelled'` → `{status:'abort'}` with no `error` field (the same abort shape `gog/games.ts`'s own install() returns on a user cancel, not a Retry-triggering error)
- `stop()` real-abort proven with a genuinely-pending `downloadSteamDepots` mock: `game.install()` is left in flight (its promise unresolved), `game.stop()` is called mid-flight and asserted to call `callAbortController(appId)`, then the download is resolved and the install promise is drained — proving the abort call happens WHILE the download is actually in progress, not just that the function was called at some point
- `stop()`'s no-op path (no depot download in flight) proven unchanged: no throw, `callAbortController` never called
- Two new seam files (`clientSetup.ts`, `installLocation.ts`) export ONLY the typed signature — `ensureSteamClientReady(appId): Promise<{ready, error?}>` and `resolveSteamInstallTarget(appId, args): Promise<{targetSteamappsDir, installdir}>` — with a single-purpose stub body, so Plans 09/10 replace the body without touching games.ts's import or call sites
- `downloadqueue.ts` confirmed untouched via `git diff --name-only` — the D-06/D-07 reuse requirement (classified error flows into the SAME generic queue surface every other runner uses) is structural, not asserted only by a unit test

## Task Commits

RED confirmed with fail-fast discipline — genuine failures verified by running the new tests against the UNMODIFIED `games.ts` (before any implementation edit, not merely inferred from writing the code first):

| Task | RED commit | GREEN commit |
|------|-----------|---------------|
| 1: opt-in branch + outcome→InstallResult mapping + seams | `2fa86fe8` (combined, see below) | `0a45b193` |
| 2: stop() real abort (D-02) | `2fa86fe8` (combined, see below) | `9af86dc0` |

- **RED (`2fa86fe8`):** 5 of the 130 tests in the suite fail — the opt-in-ON call-order test, the D-06/D-07 error-surface test, the cancel-outcome test, the createAbortController-registration test (all Task 1), and the in-flight stop()-abort test (Task 2, which structurally requires Task 1's `nativeInstallsInFlight`/`createAbortController` registration to exist before it can pass). Combined into a single RED commit rather than one-per-task because the two tasks share the same describe-block fixtures and Task 2's own test cannot even reach a meaningful RED/GREEN distinction without Task 1's code existing — documented as a deliberate TDD-process deviation, not an accidental merge. 125/130 pre-existing + opt-in-OFF + non-numeric-guard + no-op-stop tests continued passing unchanged, proving no accidental coupling.
- **Task 1 GREEN (`0a45b193`):** `install()`'s opt-in branch + `installNative()` implemented; 129/130 pass (only Task 2's in-flight-abort test remains red, as expected — `stop()` itself untouched in this commit); `tsc --noEmit` clean.
- **Task 2 GREEN (`9af86dc0`):** `stop()` real-abort implemented; found + fixed a test-timing bug during verification (see Deviations); full steam games suite 130/130, full backend suite 1149/1149, `tsc --noEmit` clean, `eslint` 0 errors (212 pre-existing-pattern warnings, incl. `clientSetup.ts`'s `require-await` on its Plan-10 stub — same convention as every other not-yet-implemented `SteamGame` stub method in this file).

**Plan metadata:** (this commit) — `docs(21-07): complete steam-install-stop-opt-in-branch plan`

## Files Modified

- `src/backend/storeManagers/steam/games.ts` — added `hostSteamDepotOs()` helper, `nativeInstallsInFlight` Set, `installNative(args)` private method, wired the `isSteamNativeInstallEnabled()` branch into `install()`, converted `stop()` from an unconditional no-op into a real `callAbortController`-driven abort for an in-flight native download
- `src/backend/storeManagers/steam/clientSetup.ts` (new) — `ensureSteamClientReady(appId)` Plan 10 seam, always-ready stub
- `src/backend/storeManagers/steam/installLocation.ts` (new) — `resolveSteamInstallTarget(appId, args)` Plan 09 seam, first-Steam-library stub
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — 4 new `jest.mock()` blocks (`nativeInstallSetting`, `depot`, `clientSetup`, `installLocation`, `aborthandler`), 2 new describe blocks (`SteamGame.install() — SNI-07 native depot-download opt-in (D-13)`, `SteamGame.stop() — D-02 native depot-download abort`) totaling 9 new tests

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on: the two new seam files being a Rule 3 (blocking) files_modified omission rather than scope creep, `hostSteamDepotOs()`'s distinct vocabulary from `library.ts`'s existing `hostInstallPlatform()`, the private-Set (not a new aborthandler export) in-flight-tracking design, and the cancel-outcome's abort-shaped (not error-shaped) `InstallResult`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created `clientSetup.ts` and `installLocation.ts` — not listed in `files_modified`**
- **Found during:** Task 1 planning (before any edit), cross-referencing the plan's own `<action>` text ("import from a new steam/clientSetup.ts — add a minimal stub") and acceptance criteria ("The two new seam files ... exist with typed stub signatures")
- **Issue:** `games.ts` cannot import `ensureSteamClientReady`/`resolveSteamInstallTarget` from files that don't exist; the plan's `files_modified` frontmatter omitted both new files despite the plan body requiring them.
- **Fix:** Created both files with ONLY the typed async function signature + a single-purpose stub body, matching the plan's own "minimal stub ... Plan 09/10 replaces" instruction verbatim.
- **Files created:** `src/backend/storeManagers/steam/clientSetup.ts`, `src/backend/storeManagers/steam/installLocation.ts`
- **Commit:** `2fa86fe8` (RED, alongside the mock declarations that reference them)

**2. [Rule 1 - Bug] Fixed a test-timing race in the stop()-in-flight test**
- **Found during:** Task 2 GREEN verification (`npx jest`)
- **Issue:** The in-flight `stop()` test used a fixed `2x await Promise.resolve()` to let `install()` run up to `nativeInstallsInFlight.add()` before calling `stop()`, but `installNative()` actually has 3 microtask hops before that point (`ensurePlatformsCaptured()`, `ensureSteamClientReady()`, `resolveSteamInstallTarget()`) — the fixed count under-counted by one hop, so `stop()` ran before the appId was registered, `callAbortController` was never invoked, and the assertion failed. Because the assertion threw BEFORE the test's own cleanup (`resolveDownload(...)`; `await installPromise`), the pending `installPromise` leaked across into the NEXT test, polluting `nativeInstallsInFlight` and causing a second, unrelated test to fail too.
- **Fix:** Replaced the fixed `Promise.resolve()` count with the test file's own pre-existing `flushAsync()` helper (a `setImmediate`-based macrotask flush), which is robust to the exact microtask hop count by construction.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`
- **Commit:** `9af86dc0` (part of Task 2 GREEN)

---

**Total deviations:** 2 auto-fixed (1 blocking file-creation, 1 test-timing bug). Both resolved inline during the plan's own TDD/verification cycle, well within the 3-attempt auto-fix budget.

## TDD Gate Compliance

Both tasks are covered by RED → GREEN commits, with a single combined RED commit for both tasks (documented above and in `key-decisions`) rather than one RED per task:
- RED (`2fa86fe8`) confirmed 5 genuine failures against the unmodified `games.ts` — the opt-in-ON, error-surface, cancel-outcome, and abort-controller-registration tests (Task 1), plus the in-flight `stop()`-abort test (Task 2, structurally dependent on Task 1's code) — while 125 pre-existing/opt-in-OFF/no-op tests continued passing, proving no accidental coupling.
- Task 1 GREEN (`0a45b193`) brought the suite to 129/130 (only Task 2's own test remained red, as expected since `stop()` was untouched in that commit).
- Task 2 GREEN (`9af86dc0`) brought the suite to 130/130.

No REFACTOR commit was needed — the Task 2 GREEN commit's test-timing fix was itself part of genuine GREEN verification (a broken test assertion, not a code cleanup pass), documented as Deviation 2 above rather than a separate REFACTOR commit.

## Issues Encountered

None beyond the two deviations documented above (both resolved inline, well within the 3-attempt auto-fix budget per issue).

## User Setup Required

None — no external service configuration required. This plan is pure backend engine code; no new UI surface is introduced (the D-06/D-07 requirement is that a failed native install renders through the EXISTING DownloadManager error+Retry UI, unchanged).

## Known Stubs

`clientSetup.ts`'s `ensureSteamClientReady()` and `installLocation.ts`'s `resolveSteamInstallTarget()` are INTENTIONAL stubs, explicitly scoped to Plans 10 and 09 respectively per this plan's own `<action>` text ("Plan 10 replaces", "Plan 09 replaces") — not a gap in this plan's own goal. `installNative()`'s success/error/cancel paths are fully implemented and tested against these stubs; only the STUBS' internal bodies (always-ready / first-library) are placeholders, and both are called out inline with `// Plan 09` / `// Plan 10` comments per the plan's own instruction.

## Threat Flags

None — every new surface this plan introduces is exactly the surface enumerated in the plan's own `<threat_model>`, and each `mitigate` disposition is implemented and tested as designed:
- T-21-05 (appId injection into the handoff): the legacy `steam://` path's `/^\d+$/` `buildSteamProtocolUrl` guard is retained unmodified; the native path's appId validation lives in `depot.ts`'s own guard (Plan 06), confirmed by a dedicated test asserting a non-numeric appId with the opt-in ON never calls `shell.openExternal` and resolves to an error outcome via `downloadSteamDepots`'s own never-throwing contract.
- T-21-08 (opt-in-OFF regression): a dedicated test asserts the legacy `steam://install` path is taken byte-for-byte and `downloadSteamDepots`/`ensureSteamClientReady`/`resolveSteamInstallTarget` are never called when the opt-in is OFF.
- T-21-14 (error mapping information disclosure): `installNative()` forwards ONLY the depot outcome's already-classified `error` string (Plan 06's `classifyDepotError` output) into `InstallResult.error` — no raw error, stack trace, or file path is ever placed there; verified by an exact-string-equality assertion, not a substring/contains check.
- T-21-15 (uncancellable download / DoS): `stop()` is wired to `callAbortController(appId)` exactly mirroring `downloadqueue.ts`'s own proven `stopCurrentDownload` call site; proven with a genuinely-in-flight (unresolved) `downloadSteamDepots` mock, not just a "was called" assertion.

No new network endpoints, auth paths, or schema changes beyond what the threat model already covers.

## Next Phase Readiness

- `ensureSteamClientReady(appId)` (`clientSetup.ts`) is ready for Plan 10 to replace the stub body with the real Steam-client-readiness flow — the exported signature (`Promise<{ready, error?}>`) is exactly what `installNative()` already consumes; no `games.ts` changes needed.
- `resolveSteamInstallTarget(appId, args)` (`installLocation.ts`) is ready for Plan 09 to replace the stub body with the real Steam-library-selection flow — the exported signature (`Promise<{targetSteamappsDir, installdir}>`) is exactly what `installNative()` already consumes; no `games.ts` changes needed.
- `install()`'s `isBottleEligible()` branch is completely untouched by this plan (native opt-in branch is placed strictly AFTER it) — Plan 11's D-15 bottle-branch work has a clean, unmodified starting point.
- `nativeInstallsInFlight` + the `createAbortController`/`callAbortController`/`deleteAbortController` lifecycle are proven end-to-end (registration, real mid-flight abort, cleanup) and available for any future plan that needs to know whether a native depot download is currently running for a given appId.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/games.ts`
- FOUND: `src/backend/storeManagers/steam/clientSetup.ts`
- FOUND: `src/backend/storeManagers/steam/installLocation.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/games.test.ts`
- FOUND: `.planning/phases/21-steam-native-install/21-07-SUMMARY.md`
- FOUND commit `2fa86fe8` (test: Tasks 1+2 RED)
- FOUND commit `0a45b193` (feat: Task 1 GREEN)
- FOUND commit `9af86dc0` (feat: Task 2 GREEN)
