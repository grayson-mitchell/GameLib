---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 05
subsystem: backend/download-manager
tags: [abort-controller, logging, steam, install-error, observability]

# Dependency graph
requires:
  - phase: 37-02
    provides: cause-based depot error classification and structured InstallErrorAction threaded through installQueueElement's terminal-error dialog
provides:
  - "hasAbortController(id) — a read-only registration-state query on the shared abortControllers Map, exported from aborthandler.ts"
  - "installQueueElement's terminal-error branch now asks before it calls callAbortController, replacing a guaranteed-false ERROR with an honest WARNING"
affects: [downloadmanager, steam-install-error-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ask-before-tell registration gate: a caller that fires unconditionally on every failure queries has*() before calling the action that logs ERROR on a miss, instead of softening the shared log for every caller"

key-files:
  created: []
  modified:
    - src/backend/utils/aborthandler/aborthandler.ts
    - src/backend/utils/aborthandler/__tests__/aborthandler.test.ts
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts

key-decisions:
  - "37-RESEARCH.md's single-mechanism claim (never-registered) does NOT hold for the observed cases — measured at HEAD, the dominant/exclusive mechanism for a native Steam depot install is mechanism 2 (deleted-before-the-caller-asks); mechanism 1 (never-registered) is real but only for gogdl/legendary installs and pre-native-delegate Steam failures, neither of which the todo's live evidence was drawn from."
  - "callAbortController's own body and ERROR log are left byte-identical for every other caller — only the terminal-error branch in downloadmanager/utils.ts gates on the new hasAbortController(appName) query."
  - "The steam-gated .stop(false) call stays unconditional, outside the new gate — it flips nativeInstallsInFlight's separate 'aborted' flag, unrelated to the AbortController's own lifetime."

requirements-completed: [REQ-37-04]

duration: ~55min
completed: 2026-08-22
---

# Phase 37 Plan 05: Abort-controller lookup miss on terminal Steam install failure Summary

**Gated `installQueueElement`'s unconditional `callAbortController` call behind a new read-only `hasAbortController` query, after measuring that the misleading ERROR fires because `runNativeDepotDownload`'s own `finally` deletes the controller before the InstallResult ever reaches the caller — not because of a registration race, as `37-RESEARCH.md` had guessed.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (collapsed into 2 commits — Task 3 was verification/mutation-proof only, no production diff)
- **Files modified:** 4

## Mechanism measurement (Task 1) — read at HEAD, not from RESEARCH.md

`37-RESEARCH.md` named ONE mechanism: `createAbortController` is only called inside
`runNativeDepotDownload`, so a pre-download throw in `SteamGame.install()` would reach
`utils.ts`'s unconditional `callAbortController` with nothing ever registered. The plan's own
`<competing_hypotheses>` block flagged a second, competing mechanism surfaced while reading
`games.ts` at plan time. Both were checked empirically against the code at HEAD:

**(a) On the observed 1ms plan-build failure (no CM connection) — is `createAbortController`
reached before the failure propagates?**
Yes, always. `runNativeDepotDownload` (`src/backend/storeManagers/steam/games.ts:1576`,
pre-edit numbering) calls `createAbortController(this.appId)` as the function's very first
statement, before any `await` — including before `ensureSteamClientReady` (the CM-connection
check whose immediate failure is the observed "1ms" case). So for every failure that
originates inside `runNativeDepotDownload`, the controller WAS registered.

**(b) Does `runNativeDepotDownload`'s `finally` delete the controller before the InstallResult
reaches `installQueueElement`'s own `finally`?**
Yes, unconditionally. The function's `finally` block (`games.ts:1781-1784`, pre-edit numbering)
runs `nativeInstallsInFlight.delete(this.appId)` and `deleteAbortController(this.appId)` on
every exit path — success, `'error'`, `'cancelled'`, or an uncaught throw/rejection (a `finally`
block runs on rejection exactly as it does on resolution). Because `installDepotDownload`
returns `runNativeDepotDownload`'s own promise directly, and `installNative`/`install` return
that promise up the chain unchanged, `installQueueElement`'s `await this.install(args)` cannot
observe the settled value until `runNativeDepotDownload`'s `finally` has already run. By the
time `installQueueElement`'s own `finally` checks `status === 'error'` and calls
`callAbortController(appName)`, the controller is gone — by construction, not by race.

**(c) Which mechanism produces the observed ERROR?**
**Mechanism 2 (deleted-before-the-caller-asks) is what actually fires for every native Steam
depot install failure** — both the 1ms plan-build failure and any depot-download error, because
(a) proves the controller is always registered first and (b) proves it is always gone before
the caller checks. `37-RESEARCH.md`'s single mechanism (never-registered) does **not** hold for
the todo's live evidence. Mechanism 1 is real but narrower than research assumed: it fires
(i) for **gogdl/legendary installs**, which — confirmed by grepping the whole tree —
**never call `createAbortController` for install at all** (only `storeManagerCommon/games.ts`'s
sideload/browser-game launch path and Steam's native install path register one), so every
single non-Steam terminal install failure has always hit a guaranteed genuine miss; and
(ii) for a handful of pre-`installNative` Steam failure returns (`tellBottledSteamToInstall`
dispatch rejection at `games.ts:1080`, invalid-appId at `:1116`) that never reach
`runNativeDepotDownload` at all. **Correction recorded:** the research's root cause is amended
in this SUMMARY, not silently inherited — both mechanisms are real, but the dominant one for the
reported symptom is mechanism 2, and mechanism 1's true scope is wider than research described
(non-Steam runners), not narrower.

## Accomplishments

- Added `hasAbortController(id): boolean` to `aborthandler.ts` — a pure `.has()` read on the
  shared Map, exported alongside the existing four functions. `callAbortController`'s body is
  byte-identical (confirmed by reading the diff, not by running tests): `git diff` shows only
  the new function, its doc comment, and its addition to the export list.
- `installQueueElement`'s terminal-error branch (`downloadmanager/utils.ts`) now asks
  `hasAbortController(appName)` before calling `callAbortController(appName)`: a genuine
  registration keeps today's exact behaviour (the existing `logInfo` + `callAbortController`);
  no registration now logs `logWarning` naming the appName and explaining the install failed
  outside its abort controller's lifetime — never the retired
  `"Could not find a matching abort controller"` phrasing, and never silence.
- The steam-gated `.stop(false)` call is untouched and stays outside the new gate — it flips
  `nativeInstallsInFlight`'s separate `aborted` flag, which is what actually prevents an
  immediate retry from joining a still-tearing-down run; that mechanism has nothing to do with
  the AbortController's own lifetime.
- Wrote a RED-then-GREEN seam test suite in `downloadmanager/__tests__/utils.test.ts`
  (`REQ-37-04` describe block): case 1 (RED against unmodified `utils.ts`, now green), case 2
  (the recorded user-cancel pin — a registered controller still aborts, both before and after
  the fix), case 2b (an ordering pin on `downloadqueue.ts`'s `stopCurrentDownload`, proving via
  source-text assertion that `callAbortController(appName)` is followed synchronously by
  `.stop(false)` with no `await` between them — the reason a user Cancel is unaffected), and
  case 3 (the blindness guard — a genuine miss from any other caller still logs, unchanged).
- Corrected four pre-existing specs in the same file (`orphaned-depot abort` describe's specs
  2, 3, 6, and the `260817-dib` stall-watchdog describe's "stall trip still aborts" spec) that
  had encoded the now-disproven assumption that `callAbortController` fires unconditionally on
  every terminal error regardless of registration state. Spec 1 and the stall-watchdog spec
  (both model a depot download that is genuinely STILL RUNNING when a watchdog trips) now
  explicitly register a fake controller to model that real, live state; specs 2, 3, and 6 (all
  model an already-settled/rejected/never-registered install) now assert `callAbortController`
  was **not** called, with `.stop(false)` still firing unconditionally where the runner is steam.
- Added `hasAbortController` unit coverage to `aborthandler.test.ts` (true-when-created,
  false-after-delete, false-when-never-created, read-only/no-side-effects) and extended the
  existing genuine-miss test's title to record that its exact message text is the byte-identical
  pin for every caller other than the one this plan changes.

## Mutation testing (Task 3) — all four checks recorded

1. **Inverted the `hasAbortController` gate** (`if (hasAbortController(...))` →
   `if (!hasAbortController(...))`). Result: **7 tests failed**, including case 1 (the RED
   case) and case 2 (the user-cancel pin) — confirms the gate is load-bearing in both
   directions, not vacuously true.
2. **Changed the new `logWarning` call to `logError`.** Result: **2 tests failed** — case 1's
   level assertion (`expect(logWarning).toHaveBeenCalledWith(...)`) and spec 2's equivalent —
   confirms the level assertions are non-vacuous, not merely checking absence of the old string.
3. **Deleted the WARNING branch entirely** (the "nothing to abort" case now logs nothing at
   all). Result: **the same 2 tests failed** as check 2 — proves the suite guards against
   trading the observability defect for a blindness defect; a silent branch does not pass.
4. **Confirmed case 3 (the blindness guard) still passes** with the gate in place and
   unmutated — a direct `callAbortController` call for a genuinely-unregistered id (simulating
   any caller other than the terminal-error branch) still reaches `logError`, unchanged.

All four mutations were restored; `git diff` on `src/backend/downloadmanager/utils.ts` after
restoration matches the Task 2 commit exactly (verified via `git diff --stat`, zero output).

## The residual — what this fix does NOT close

Per Task 1's measurement (b): on the native Steam depot path, the controller is **deleted by
`runNativeDepotDownload`'s own `finally` before the caller ever asks**. The terminal-error
branch genuinely has nothing left to abort by construction on that path — this fix makes that
honest (a WARNING instead of a false ERROR), it does not give the terminal-error branch a way to
abort something that has already, correctly, torn itself down. If a REAL need ever arose to abort
a depot download from `installQueueElement`'s terminal-error branch specifically (as opposed to
`runNativeDepotDownload`'s own internal `controller.signal.aborted` checks, which already run
inside its own try block), that would be a separate defect — not covered here, and not implied
by this fix's green tests. The only path where the terminal-error branch's `callAbortController`
call is genuinely load-bearing is the "still actively running when the outer watchdog trips" case
(pinned by spec 1 and the stall-watchdog spec), which is unaffected by this change.

## Task Commits

1. **Task 1: reproduce the miss and measure the mechanism** - `8417bfecb` (test) — RED seam test
   added, no production file touched.
2. **Task 2 + Task 3: gate the terminal-error caller on hasAbortController** - `7024bc1ad`
   (fix) — production gate added; Task 3 was mutation-testing verification only (all mutations
   restored, no additional diff to commit).

## Verification run

- `npx jest src/backend/utils/aborthandler/ src/backend/downloadmanager/ --silent`: all green
  (aborthandler.test.ts 13/13, utils.test.ts 34/34, downloadqueue.test.ts 15/15 — confirmed
  untouched).
- `npx tsc --noEmit -p tsconfig.json`: no errors.
- `npx eslint src/backend/utils/aborthandler/aborthandler.ts src/backend/downloadmanager/utils.ts -f json`:
  zero entries with `severity === 2`.
- `grep -c "Could not find a matching abort controller" src/backend/utils/aborthandler/aborthandler.ts`
  returns **2**, not the plan's predicted baseline of 1 — this is a **pre-existing fact of the
  file at HEAD** (a 2026-07-19 double-abort-fix comment at line 23 also contains the phrase),
  unrelated to this plan's diff. Confirmed via `git diff src/backend/utils/aborthandler/aborthandler.ts`:
  the only lines added are the new `hasAbortController` function, its doc comment, and its
  export — `callAbortController`'s body (including its own single occurrence of the phrase at
  line 38) is byte-identical. The stronger, diff-based criterion is satisfied; the plan's grep
  literal was stale against the file's actual pre-existing content.
- `grep -c "Could not find a matching abort controller" src/backend/downloadmanager/utils.ts`
  returns 0.
- `grep -n "hasAbortController" src/backend/downloadmanager/utils.ts` shows exactly one call
  site, inside the `status === 'error'` branch.
- `npx jest --runInBand --silent` (full suite): **315/316 test suites passed, 6514/6518 tests
  passed, 3 skipped, 1 pre-existing failure** — `meta/__tests__/genI18nGateScope.test.ts`
  ("A-17 ANTI-ROT"), the documented pre-existing known-red, unrelated to this plan.

## Files Created/Modified

- `src/backend/utils/aborthandler/aborthandler.ts` — added `hasAbortController(id): boolean`
  read-only export; `callAbortController` byte-identical.
- `src/backend/utils/aborthandler/__tests__/aborthandler.test.ts` — added 4 unit cases for
  `hasAbortController`; extended the existing genuine-miss test's title to record the
  byte-identical pin.
- `src/backend/downloadmanager/utils.ts` — gated the terminal-error branch's
  `callAbortController(appName)` call behind `hasAbortController(appName)`; added the WARNING
  branch and the measured-mechanism comment.
- `src/backend/downloadmanager/__tests__/utils.test.ts` — added the `REQ-37-04` describe block
  (4 new cases), a test-local abort-controller registry backing the `callAbortController`/
  `hasAbortController` mock implementations, and corrected 4 pre-existing specs whose assertions
  encoded the disproven "fires unconditionally" assumption.

## Decisions Made

- Kept `callAbortController`'s body completely untouched — the fix is entirely in the caller
  (`downloadmanager/utils.ts`), matching the plan's non-negotiable constraint that every other
  caller's ERROR log stays byte-identical.
- Modeled the test-local abort-controller registry as a plain `Map<string, boolean>` (id →
  aborted-flag) at file scope in `utils.test.ts`, re-seeded via the existing `resetMocks: true`-
  aware `beforeEach` pattern already established for `mockT` in the same file, rather than
  importing the real `aborthandler.ts` module (which would reintroduce its own shared,
  cross-test Map and defeat the wholesale-mock convention this file already uses).
- Used a source-text regex assertion (matching the repo's own established convention, e.g.
  `launcher_callRunner.test.ts`'s credential-redaction census gate) for the `downloadqueue.ts`
  ordering pin (case 2b), rather than importing and exercising the real `downloadqueue.ts`
  module, which would require pulling in its own large mock harness for a property this plan
  does not change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/incorrect test] Four pre-existing specs asserted a disproven behaviour**
- **Found during:** Task 2, after gating the terminal-error branch on `hasAbortController`
- **Issue:** `orphaned-depot abort` describe's specs 2, 3, and 6, and the `260817-dib` describe's
  "stall trip still aborts" spec all asserted `callAbortController` was called unconditionally
  on a terminal error, encoding the exact assumption this plan's measurement (Task 1) disproved.
- **Fix:** Spec 1 and the stall-watchdog spec (both model a genuinely still-running download)
  now register a fake controller to match that real, live scenario. Specs 2, 3, and 6 (all
  model an already-settled, rejected, or never-registered install) now assert
  `callAbortController` was NOT called, with `.stop(false)` still firing unconditionally where
  applicable. The describe block's own doc comment was corrected in the same commit — it had
  asserted "callAbortController(appName) for every runner", which was the very misleading claim
  this plan's measurement disproves.
- **Files modified:** `src/backend/downloadmanager/__tests__/utils.test.ts`
- **Verification:** All 34 tests in the file pass; full mutation-testing pass (Task 3) confirms
  the corrected assertions are non-vacuous in both directions.
- **Committed in:** `7024bc1ad` (part of Task 2's commit)

None of Rules 2/3/4 applied — no missing critical functionality, no blocking issue requiring a
workaround, and no architectural change was needed.

## Known Stubs

None.

## Threat Flags

None. This plan changes zero network endpoints, auth paths, file access patterns, or schema —
it adds a read-only Map query and gates an existing log call on it. Per the plan's own threat
model (T-37-11, T-37-12), both risks (controller-lifetime change enabling unbounded disk writes;
log suppression hiding a real teardown race) were mitigated by construction: no
create/deleteAbortController call site was touched, and the new WARNING branch is proven
non-vacuous by Task 3's mutation checks 2 and 3.

## Self-Check: PASSED

- `src/backend/utils/aborthandler/aborthandler.ts` — FOUND, contains `hasAbortController`
- `src/backend/downloadmanager/utils.ts` — FOUND, contains `hasAbortController` gate at the
  `status === 'error'` branch
- `src/backend/downloadmanager/__tests__/utils.test.ts` — FOUND, contains the `REQ-37-04`
  describe block
- `src/backend/utils/aborthandler/__tests__/aborthandler.test.ts` — FOUND, contains
  `hasAbortController (37-05, REQ-37-04)` describe block
- Commit `8417bfecb` — FOUND in `git log --oneline --all`
- Commit `7024bc1ad` — FOUND in `git log --oneline --all`
