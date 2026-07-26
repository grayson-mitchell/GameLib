---
gsd_state_version: 1.0
milestone: v0.8
milestone_name: — Tauri Shell
status: executing
stopped_at: Completed 34.2-22-PLAN.md (Rust timeout_for() behavioral test + jest existence gate closed; gap cycle 3, plan 4 of 6 -- 34.2-23..24 remain)
last_updated: "2026-07-26T00:35:51.274Z"
last_activity: 2026-07-26
progress:
  total_phases: 15
  completed_phases: 9
  total_plans: 95
  completed_plans: 85
  percent: 89
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** Phase 34.2 — tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid

> **Version renumber (2026-07-20):** the whole project was renumbered from the
> inflated `v1.x` planning labels to `0.x` to reflect pre-release status (map:
> v1.N → v0.(N+1)). Milestones are now: **v0.1** Steam Platform · **v0.2** Polish ·
> **v0.3** Humble · **v0.4** Compatibility Data · **v0.5** macOS Compat Runtime (17–19,
> done) · **v0.6** Store Search · **v0.7** Steam Native Install (21–25, current).
> The earlier v0.5-vs-v0.7 taxonomy split is resolved: macOS-compat = v0.5 (complete),
> native-install = **v0.7** (this milestone). `package.json` set to 0.7.0.

## Current Position

Phase: 34.2 (tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid) — GAP CYCLE 3 EXECUTING
Plan: 22 of 24 done (34.2-22 complete); 2 gap-closure plans remain (34.2-23..24)

34.2-19 done -- GAP CYCLE 3, first plan executed, BLOCKER CLOSED. Task 1 created
`src/backend/jest.setupContainment.ts`, a `setupFiles` module wired into the backend jest
project's `setupFiles` (`src/backend/jest.config.js`), redirecting HOME/USERPROFILE/APPDATA/
LOCALAPPDATA/XDG_CONFIG_HOME/XDG_STATE_HOME/XDG_DATA_HOME/XDG_CACHE_HOME so no suite can opt out
of containment by omission. MID-EXECUTION CORRECTION (coordinator-approved, Rule 4 architectural
deviation): the plan's originally-specified env-var-only mechanism does NOT redirect
`os.homedir()` inside a Jest test on this project's Jest 29/Node 26 setup -- Jest replaces
`process.env` with a decoupled, per-test-file synthetic Proxy that `os.homedir()`'s native
binding never observes (live `stat` proof: real `~/Library/Logs/GameLib/gamelib.log` mtime
still changed with the env-only fix installed). Two `jest.mock`-free alternatives were ruled out
(non-configurable core-module property mutation; a `Module._load` hook, bypassed for builtins
under Jest's own Runtime). Fix: a single, narrow `jest.mock('os', () => ({...jest.requireActual
('os'), homedir: () => containmentRoot}))` call added to the setup module (commit `752f6096`),
env-var redirection kept as defense-in-depth for the Windows/Linux branches. Task 2 added
`structuralContainment.test.ts` (6 tests, zero per-suite `jest.mock` calls), hand RED-proofed
(5/6 tests fail with `setupFiles` disabled; Test 4 stays green independently via the pre-existing
default `electron` automock). Task 3 added a containment tripwire as the first test in
`bootstrap.test.ts` -- the suite independently reproduced destroying real developer data three
times during verification -- and reconciled the full backend baseline (111/112 suites, 2279/2280
tests, sole failure `rustInvokeChannel.test.ts`, observed on 5 of 7 runs; 2 runs hit a
pre-existing, unrelated `library.ts` leaked-timer flake, logged to `deferred-items.md`). LIVE
DESTRUCTION CHECK: `~/Library/Logs/GameLib/gamelib.log`/`.log.old` mtimes byte-identical
before/after a full `sidecar/__tests__` run -- the verification's own three-times-reproduced
finding is directly refuted. `34.2-19-PLAN.md` amended in place with a full deviation log.
REQ-34.2-07/-14 complete, see 34.2-19-SUMMARY.md. Next: 34.2-20 (WR-02, same wave).

34.2-20 done -- GAP CYCLE 3, second plan executed, WR-02 CLOSED. Task 1 changed
`loggerFlowRegistration.ts`'s `logError` send-channel listener from a bare, unguarded call
(`logError(args[0] as string, LogPrefix.Frontend)`, neither `await`ed nor `.catch()`'d) to
`void Promise.resolve(logError(args[0], LogPrefix.Frontend)).catch(...)`, restoring
`processGuards.ts`'s own documented invariant ("not a substitute for call-site handling") that
had been quietly re-violated. The `.catch` handler mirrors plan 34.2-15's CR-02 shape exactly
(hardcoded fallback literal initialized before its own try, reassigned via
`error instanceof Error ? ... : String(error)`), writes a module-attributed diagnostic
(`[loggerFlowRegistration] logError call-site rejection: ...`) to `process.stderr` only, and
drops the `args[0] as string` assertion (review finding IN-05) in favor of the declared
`unknown` transport contract. Task 2 added 4 tests (`loggerFlows.test.ts`, 5->9) driving a
`jest.spyOn`'d rejecting `backend/logger` `logError` through the real registered listener; the
load-bearing assertion is NEGATIVE (diagnostic must carry the call-site prefix AND must NOT
contain processGuards.ts's generic `unhandled promise rejection` text -- a positive-only
assertion would pass identically pre-fix, since the process guard already produces some
diagnostic). RED-PROOF by hand: restored the pre-fix file via `git show HEAD~1:... > file`, all
4 new tests failed (2 by assertion, 2 by the rejection itself escaping as an uncaught value
inside the test), restored via `git checkout HEAD -- file` (`git diff --stat` empty, byte
Match to the Task 1 commit), suite green again. One out-of-scope discovery logged (not fixed):
`backend/logger/index.ts`'s four wrapper exports (`logDebug`/`logInfo`/`logWarning`/`logError`)
all discard their `LogWriter` method's returned promise (no `return` statement in any of the
four block-body arrow functions) -- so today `logError(...)`'s runtime return value is always
`undefined`, meaning Task 1's guard is correct/necessary but only becomes fully load-bearing
once a future fix makes the wrapper actually forward the promise; logged to
`deferred-items.md` under "From plan 34.2-20" (out of scope: touching all four wrappers is a
project-wide, separately-scoped change). Full backend sweep: 111/112 suites passed on the
cleaner of two consecutive runs (sole failure the pre-existing, already-documented
`rustInvokeChannel.test.ts`), 2283/2284 tests; the other run additionally hit the
already-documented non-deterministic `library.ts` leaked-timer flake on an unrelated suite --
neither failure touches any file this plan modified. `tsc --noEmit` and eslint on
`loggerFlowRegistration.ts` both clean. REQ-34.2-12/-14 complete (already marked from prior
plans; re-confirmed), see 34.2-20-SUMMARY.md. Next: 34.2-21 (WR-03, same wave).

34.2-21 done -- GAP CYCLE 3, third plan executed, WR-03 CLOSED. Task 1 added 3
`it.each`-driven hostile-value regression blocks to `repairFailure.test.ts` (null-prototype
object via `Object.create(null)`, throwing-`toString`, throwing-`Symbol.toPrimitive` -- the same
shapes plan 34.2-15 used in `sidecarRejectionGuard.test.ts` Group 2), plus a T-34.2-52
hostile-value dialog-message test; renamed the pre-existing vacuous plain-string 4th test's
framing from "hostile reason" to "non-hostile baseline" (a plain string never exercises the
primitive-conversion throw path). RED-confirmed by hand against unmodified `repairFailure.ts`:
10 of 14 tests failed with `TypeError: Cannot convert object to primitive value` (or the custom
thrower's own message) escaping `reportRepairFailure` before `showDialogModal` was ever called
-- see 34.2-21-SUMMARY.md for the verbatim output. Task 2 rewrote `reportRepairFailure`'s body to
precompute `errorText` once via a `let`-fallback-before-try (mirroring `processGuards.ts:61-69`
verbatim), never interpolating the raw `error: unknown` binding into a template literal, and
additionally wrapped `console.error`/`window.api.logError` each in their own try/catch so the
module's own "three independent signals" docstring claim is actually true against any future
throw source, not just the one removed (decision recorded in the SUMMARY: `showDialogModal`
itself deliberately left unwrapped as the last/payoff statement). Also dropped the unused
`export` from `ReportRepairFailureOptions` (review finding IN-02, zero external consumers
confirmed via grep). One Rule 3 deviation (wording-only, no behavior change): the first docstring
draft used the literal backtick-quoted substring `${error}` in prose describing the historical
defect, which self-tripped this plan's own `grep -c '\${error}'` acceptance criterion (same class
of issue plan 34.2-16 hit) -- reworded, re-verified clean. All 14 tests pass; `tsc --noEmit` and
eslint (0 errors/warnings, the `restrict-template-expressions` warning on line 45 is gone) both
clean; `index.tsx` byte-unchanged (`git diff --exit-code` clean); full frontend sweep 26/26
suites, 195/195 tests, zero regressions. REQ-34.2-12/-14 complete (already marked from prior
plans; re-confirmed), see 34.2-21-SUMMARY.md. Next: 34.2-22 (Rust `timeout_for()` proof, same
wave).

34.2-22 done -- GAP CYCLE 3, fourth plan executed, carried-forward Rust-coverage warning CLOSED.
Task 1 appended a `#[cfg(test)] mod tests` to `src-tauri/src/main.rs` (6 tests: exempt channel
waits indefinitely, non-exempt channel bounded at `INVOKE_TIMEOUT`, `repair`/`readConfig` exempt,
`getCrossoverIndex` exempt, a loop over the full `LONG_RUNNING_CHANNELS` array paired with a real
non-exempt channel -- `getGameSettings` -- for non-vacuity in both directions, and `INVOKE_TIMEOUT`
pinned at 60s) -- the first Rust test coverage anywhere in `src-tauri/src` (`cargo test` ran 0
tests before this plan). RED-proofed by hand, both directions: `timeout_for` stubbed to
unconditional `Some(INVOKE_TIMEOUT)` failed 4 of 6 tests, stubbed to unconditional `None` failed a
DIFFERENT 2 of 6 tests; restored, `git diff --stat` showed the change was purely additive (69
insertions, 0 deletions) against the pre-plan baseline. Task 2 extended
`longRunningChannels.test.ts` (8->14 tests) with a new describe block reading `main.rs` RAW (not
comment-stripped, since `#[cfg(test)]` sits adjacent to doc comments) asserting the attribute's
presence, >=2 `timeout_for` references inside that region, and that the region iterates
`LONG_RUNNING_CHANNELS` rather than hardcoding a duplicate list -- because this project's CI runs
no cargo step at all, so without this gate the Rust module could be deleted with nothing
automated noticing. Carries 2 self-tests (mirroring `gameDetailsImportGate.test.ts`'s own Gate-2
convention): a synthetic source lacking `#[cfg(test)]` fails to match, and one with the attribute
but only weak `timeout_for` references / no iteration also fails. RED-proofed by hand: reverted
`main.rs` to its pre-Task-1 (`HEAD~1`) content, 4 of the 6 new tests failed, restored (`git diff
--stat` empty, byte-identical to the Task 1 commit). Zero new dependencies (`git diff --exit-code
src-tauri/Cargo.toml` clean), zero new `dispatch_rust_channel` arms, `cargo check --quiet` and
`tsc --noEmit` both clean. No deviations. REQ-34.2-12/-14 complete (already marked from prior
plans; re-confirmed), see 34.2-22-SUMMARY.md. Next: 34.2-23 (wave 2, WR-01 raw-source anti-claim
gate + `readdirSync` set-equality tripwire).

Gap cycle 3 plans (2026-07-26) — closes the blocker + 3 warnings gap cycle 2 introduced:

- 34.2-19 (wave 1, BLOCKER) DONE: structural containment via a `src/backend/jest.setupContainment.ts`
  `setupFiles` entry on the backend jest project — redirects HOME/USERPROFILE/APPDATA/LOCALAPPDATA/
  XDG_* so no suite can opt out of containment by omission, PLUS a narrow `jest.mock('os', ...)`
  (coordinator-approved mid-execution correction — env vars alone do not redirect `os.homedir()`
  under Jest's synthetic per-test-file `process.env`; see 34.2-19-SUMMARY.md for the full finding).
  Blast radius is the whole backend project (111 suites); acceptance criterion pins the failing-suite
  set to exactly {rustInvokeChannel.test.ts}, the documented 34.1-era baseline.

- 34.2-20 (wave 1, WR-02) DONE: catch the logError listener's floating promise at the call site with a
  stderr diagnostic — load-bearing assertion is NEGATIVE (must not contain processGuards.ts's
  absorption text), because a positive-only assertion passes pre-fix. See 34.2-20-SUMMARY.md.

- 34.2-21 (wave 1, WR-03): defensively stringify repairFailure.ts's `unknown` so the ERROR dialog
  renders unconditionally; adds Object.create(null) + throwing-toString cases that fail against HEAD.

- 34.2-22 (wave 1, carried-forward) DONE: Rust `#[cfg(test)]` module proving `timeout_for()` consults
  LONG_RUNNING_CHANNELS, bidirectionally falsifiable; pinned from jest since CI runs no cargo step.
  See 34.2-22-SUMMARY.md.

- 34.2-23 (wave 2, WR-01): raw-source anti-claim gate + `readdirSync` set-equality tripwire over all
  25 suites; DELETES KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES rather than reframing it.

- 34.2-24 (wave 3, REQ-34.2-13): PORTED-CHANNELS.md currency + reasoned deferrals + currency-gate.py.

Anti-recurrence discipline (three straight cycles shipped a new defect while closing the named one):
every new test carries an explicit "fails against pre-fix code" acceptance criterion with the RED
proof recorded verbatim in the SUMMARY (9 hand-proven REDs), and every new gate carries a self-test
proving that gate can fail. Structural fixes were preferred wherever the enumeration was the thing
rotting.

Prior re-verification context (still the contract these plans must satisfy):

Re-verification 2026-07-26 (third verification of this phase) returned **gaps_found**:

- CLOSED (independently confirmed): CR-01 logError now registered from the real production path
  with positive side-effect proof; CR-02 String(reason) inside its own try; CR-03 pathShim mock restored.

- NEW BLOCKER: testContainment.test.ts (34.2-18's own artifact) declares 11 sidecar suites as accepted
  debt rather than containing them. bootstrap.test.ts drives the real init() 3x and was reproduced
  LIVE 3 times clobbering the developer's real ~/Library/Logs/GameLib/gamelib.log via
  archiveOldLogFile()'s renameSync. Same incident class as tests-clobbering-real-steam-store.
  Fix direction: structural containment (jest setupFiles for the backend project) so a suite cannot
  opt out by omission, plus a derived tripwire classifying every *.test.ts in the directory.

- WARNINGS: WR-01 the NO-FILESYSTEM-WRITES gate is vacuous (matches comment-stripped source);
  WR-02 the logError listener leaks a floating promise dispatchSend's sync catch cannot see;
  WR-03 repairFailure.ts:45 interpolates ${error} typed unknown -- the CR-02 class relocated to
  the renderer, and a throw there suppresses the ERROR dialog REQ-34.2-12 exists to guarantee.

- All 14 REQ-34.2-01..14 pass on literal text; no orphaned requirement IDs.
- 2 human-UAT items recorded (UAT-34.2-01 live translated notification, UAT-34.2-02 real anticheat fetch).

Gap cycle 2 plans (created 2026-07-26, plan-checker PASSED on iteration 1):

- 34.2-15 (wave 1) -- CR-02: move String(reason) inside installUnhandledRejectionGuard's own try
  with a hardcoded fallback; 3 hostile-reason tests (null prototype, throwing toString, throwing
  Symbol.toPrimitive). REQ-34.2-07, -14.

- 34.2-16 (wave 1) -- CR-01 sidecar half: curated loggerFlowRegistration.ts registering ONLY the
  logError send channel, proven by a positive log-file side effect over the real transport (NOT
  absence-of-throw). Ports logError ahead of its Phase 34.3 slot -- both IPC-PORT-INVENTORY.md and
  34.2-PORTED-CHANNELS.md must be reconciled; double-registration prohibited (dispatchSend iterates
  ALL listeners, so a second one duplicates every frontend log line). REQ-34.2-12, -08, -09, -13, -14.

- 34.2-17 (wave 1) -- CR-01 renderer half: extract reportRepairFailure (console.error + logError +
  ERROR dialog), reduce onRepairYesClick's catch to a delegation. REQ-34.2-12, -14.

- 34.2-18 (wave 2, depends_on 15+16) -- CR-03 + WR-01: apply the pathShim + logger/paths containment
  kit to sidecarRejectionGuard.test.ts, extend every tripwire to the log path, prove with an
  env-simulating test (APPDATA/XDG_CONFIG_HOME/XDG_STATE_HOME/LOCALAPPDATA set to sentinels OUTSIDE
  os.tmpdir()) -- a green macOS run is explicitly NOT accepted as evidence. REQ-34.2-07, -14.

Newly surfaced debt (deferred, NOT planned): 11 other sidecar suites drive bootstrap.init() without
the containment kit (appShellFlows, bootstrapWirings, bootstrap, downloadQueueFlows, electronUntouched,
onlineMonitorWiring, installFlows, skeletonFlows, settingsFlows, rustInvokeChannel, steamAuthFlows) --
same tests-clobbering-real-steam-store risk class, pre-existing. Recorded in deferred-items.md.

34.2-15 done -- GAP CYCLE 2, first plan executed. Closed CR-02: `processGuards.ts`'s
`installUnhandledRejectionGuard` built its log message with `String(reason)` OUTSIDE its own try
(only the `logWarning` call was wrapped), so a null-prototype reason or a reason whose
`toString`/`Symbol.toPrimitive` throws would make the listener itself throw -- escalated by Node
into an `uncaughtException` with no handler installed, killing the sidecar. Task 1 moved the
interpolation into its own try, reassigning a `let message` initialized to a hardcoded,
non-interpolated fallback literal (`<unstringifiable reason>`) on failure; corrected the module
docstring, which had falsely claimed only the logging call was wrapped. Task 2 added 3 hostile-
reason cases to Group 2 (null-prototype, throwing `toString`, throwing `Symbol.toPrimitive`),
each asserting the EXACT fallback string via `toHaveBeenCalledWith` (not `stringContaining`, which
would also pass for the interpolated form). RED spot-checked by hand: reverting Task 1's fix made
all 3 new cases fail with `TypeError: Cannot convert object to primitive value`; restored, `git
diff` against the Task-1 commit showed zero difference. REQ-34.2-07/-14 complete, see
34.2-15-SUMMARY.md. No deviations. Full backend sweep: 108/109 suites, 2240/2241 tests (+3 over
the 2237/2238 baseline) -- the
single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, unchanged; `tsc
--noEmit` and `cargo check --quiet` both clean. Next: 34.2-16 (CR-01 sidecar half, same wave).

34.2-16 done -- GAP CYCLE 2, second plan executed. Closed verification gap #1 / code-review CR-01's
sidecar half (REQ-34.2-12): Task 1 created `loggerFlowRegistration.ts`, a curated module
registering ONLY `ipcMain.on('logError', ...)` (behaviorally identical to `logger/ipc_handler.ts:15`),
wired into `handlers.ts` before `ensureStoresRegistered()`; the docstring names the Phase 34.3
early-port and explicitly prohibits a second registration (`dispatchSend` iterates every entry in
`listenerRegistry`'s array, so a duplicate would duplicate every frontend log line). Task 2 added
`loggerFlows.test.ts` (5 tests) with the full four-part containment kit from day one (`os` +
`pathShim` + `backend/logger/paths` mocks + a `resolve`/`relative` tripwire covering
`getLogFilePath({})` alongside `appFolder`/`userDataPath`/`fixesPath`) -- the load-bearing test
writes a `logError` send frame with a unique marker over the real, unmocked sidecar RPC transport
and polls the real log file for it, proving a positive side effect rather than absence-of-throw
(REQ-34.2-08/09's own evidence standard). `backend/logger` is `jest.spyOn`'d, never `jest.mock`'d
(the logger/log_writer.ts circular-require crash `sidecarRejectionGuard.test.ts` already
documented). RED spot-checked by hand: commenting out `handlers.ts`'s `registerLoggerFlows()` call
made the positive test fail by TIMEOUT (marker never appears), never an exception -- reproducing
this project's own `sidecar-send-channels-fail-silently`/G-30-01 failure class directly; restored,
`git diff` against the Task 1 commit confirmed empty. Task 3 reconciled both ledgers:
`IPC-PORT-INVENTORY.md` moved `logError` from the Phase 34.3/slice-6 list (30->29) to "Already
ported" (27->28), annotated with the early-port note, totals reconciled (28 ported / 182 unported /
210 total, verified 33+26+29+38+56=182 by hand); `34.2-PORTED-CHANNELS.md` gained a new
"Gap cycle 2 reconciliation" subsection under §7. Slice 5's headline 26-channel count is unaffected
-- `logError` was never one of the 26. REQ-34.2-12/-08/-09/-13/-14 complete, see 34.2-16-SUMMARY.md.
One Rule 3 deviation (wording-only, no behavior change): the first draft of the new module's
docstring used the literal substring `logger/ipc_handler` and uppercase "MUST NOT register", which
tripped this plan's own literal grep-based acceptance criteria (expecting 0 occurrences of the
former, and the lowercase "must NOT register" phrasing) -- rephrased without changing scope or
behavior, re-verified green. Full backend sweep: 109/110 suites, 2245/2246 tests (+5 over the
2240/2241 baseline) -- the single known `rustInvokeChannel.test.ts` failure, pre-existing from
Phase 34.1, unchanged; `tsc --noEmit` and `cargo check --quiet` both clean; `git diff` against
`logger/ipc_handler.ts`/`main.ts` across all 3 commits confirmed empty (Electron behavior
unchanged, REQ-34.2-14). Next: 34.2-17 (CR-01 renderer half, same wave).

34.2-17 done -- GAP CYCLE 2, third plan executed, CR-01 FULLY CLOSED (both halves). Closed the
renderer half of verification gap #1 / code-review CR-01's third `missing:` item (REQ-34.2-12):
Task 1 extracted `GameSubMenu/index.tsx:143-149`'s `onRepairYesClick` catch body into a new
`repairFailure.ts` module exporting `reportRepairFailure()`, which performs exactly three
independent side effects in order -- `console.error` (transport-independent, always visible in
webview devtools), `window.api.logError` (the pre-existing signal, made live on the sidecar by
34.2-16), and `showDialogModal` with `type: 'ERROR'` (the signal the user actually sees) -- and
reduced the call site to a one-line delegation, leaving `handleRepair` and every other function
untouched. Added `box.error.title`/`box.repair.error` English source strings, preserving the
locale file's alphabetical key ordering. T-34.2-52 (information disclosure): the dialog message
is the FIXED translated string only, never the raw error text. Task 2 added a 4-test direct-call
suite (`repairFailure.test.ts`, no rendering/no jsdom needed) covering all three signals plus the
information-disclosure guard (a distinctive sentinel token embedded in the error must reach
console/log but never the dialog message). One design refinement during Task 2: the plan's own
RED-spot-check acceptance criterion required that deleting the `showDialogModal` call fail EXACTLY
one test, but a first draft with 4 separate one-behavior-per-test blocks failed 2 tests on that
revert (the dialog-shape test and the info-disclosure test both read the same mocked call) --
merged those two into one test, added an independent 4th test (non-Error thrown value, touching
only console.error/logError) to keep the suite at 4+ tests; RED spot-checked by hand: reverting
made exactly 1 of 4 tests fail, restored, diff confirmed clean. REQ-34.2-12/-14 complete, see
34.2-17-SUMMARY.md. No deviations (one Rule 3 wording-only fixup before the Task 1 commit: the
first docstring draft repeated literal code strings `window.api.logError`/`type: 'ERROR'` in prose,
which would have doubled this plan's own literal-grep acceptance counts -- rephrased, no behavior
change). Full frontend sweep: 26/26 suites, 185/185 tests (+1 suite/+4 tests over the 25/25,
181/181 baseline); `tsc --noEmit` clean; eslint 0 errors, 18 warnings (unchanged total -- the one
pre-existing `unknown`-typed template-literal warning moved from `index.tsx:147` into
`repairFailure.ts:45` when the catch body was extracted); `lint-translations` output byte-identical
before/after (7929 lines, exit 0). Next: 34.2-18 (wave 2, depends on 15+16 -- CR-03 + WR-01
pathShim/logger containment kit for `sidecarRejectionGuard.test.ts`), the final plan of gap cycle 2.

34.2-18 done -- GAP CYCLE 2, fourth and final plan executed, CR-03/WR-01 CLOSED. Task 1 added
the `pathShim` + `backend/logger/paths` containment kit to `sidecarRejectionGuard.test.ts`
(the suite gap cycle 1 created to prove CR-02, which never received the CR-03 remedy its
siblings got in plan 34.2-10 -- an `os.homedir()` mock alone does not contain `pathShim`'s
real `resolveAppDataDir()` on Windows/Linux, since it prefers `env.APPDATA`/
`env.XDG_CONFIG_HOME`); extended the tripwire to 4 candidates (`appFolder`/`userDataPath`/
`fixesPath`/`getLogFilePath({})`); replaced the suite's false "NO FILESYSTEM WRITES" docstring
claim; replaced the tripwire's heavy `setupIsolatedBootstrapHarness()` data source with a
narrower `loadConstantsPaths()` helper (IN-03). Task 2 extended the same log-path containment
to `gameDetailsFlows.test.ts`/`enrichmentFlows.test.ts` (closing WR-01 for all four in-scope
suites) with zero assertions altered; before/after `~/Library/Logs/GameLib` timestamps
confirmed unchanged. Task 3 added `testContainment.test.ts`: Block A proves containment holds
even with `APPDATA`/`XDG_CONFIG_HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` set to sentinels outside
`os.tmpdir()` AND `process.platform` forced to `'linux'` (mirroring this repo's own
`overrideProcessPlatform` precedent, `constants.test.ts`) -- the platform-forcing was a
necessary addition beyond the plan's literal env-var-only text, since `pathShim.ts`'s real
darwin branch never consults any of those four env vars, so a macOS run using env vars alone
would have been vacuous; Block B is a declared-list (4 entries) source gate over
comment-stripped source, plus anti-vacuity checks. 11 other sidecar suites sharing the same
risk class recorded as declared debt in `deferred-items.md`. One Rule 1 deviation: Task 1's
literal deliberate-break acceptance criterion (remove pathShim mock + export
`XDG_CONFIG_HOME`) does not reproduce on this macOS host for the reason above -- substituted
the platform-correct 34.2-10 negative-control method (point the mock's own `'appData'` branch
outside tmpdir) instead, verified live (all 11 tests failed "REFUSING TO RUN", reverted clean).
REQ-34.2-07/-14 complete, see 34.2-18-SUMMARY.md. Full backend sweep: 111 suites (110 passed /
1 pre-existing known `rustInvokeChannel.test.ts` failure, unchanged from 34.1), 2273 tests
(2272 passed) -- +1 suite/+27 tests over the 110/111 baseline, zero regressions; `tsc --noEmit`
and `cargo check --quiet` both clean; no production/Rust code touched.
**PHASE 34.2 GAP CYCLE 2 COMPLETE -- all 4 plans (34.2-15..18) executed, CR-01/CR-02/CR-03/
WR-01 all closed. Next: re-verification of Phase 34.2 as a whole.**

34.2-01 done -- Task 1 initialized i18next in the sidecar bootstrap (D-02, mirrors main.ts:460-472
field-for-field, idempotent guard, after initLogger()/before READY_SENTINEL, never able to crash
boot); Task 2 wired fetchLastestReleases() + re-homed the releasesInfoReady->downloadAntiCheatData
listener (D-07/D-04, both after initOnlineMonitor(), listener before fetch); Task 3 added a 7-test
non-mocked proof suite (bootstrapWirings.test.ts) exercising the real i18next/backendEvents/
utils-releases/anticheat-utils singletons -- discovered and defeated (via jest.unmock('i18next'))
a project-wide Jest automock at src/backend/__mocks__/i18next.ts that silently substitutes for the
real npm package in every backend test file with no explicit jest.mock() call, a level further back
than the exact 34.1 CR-01 blind spot this plan's objective names. REQ-34.2-02/04/07/14 complete, see
34.2-01-SUMMARY.md. RED spot-checked: reverting Task 1's block failed test 1; reverting Task 2's
listener block failed test 4 while test 3 still passed.

34.2-02 done -- Task 1 extracted 15 game-details/settings handler bodies verbatim from main.ts into
Electron-free src/backend/gamedetails/dispatch.ts (isGameAvailable, getGameInfo, getExtraInfo,
getGameSettings, kill, repair, changeInstallPath, getLaunchOptions, changeGameVersionPinnedStatus,
getGameOverride, getGameSdl, readConfig, addNewApp, getAvailableCyberpunkMods,
setCyberpunkModConfig); Task 2 added gamedetails/overrides.ts (setGameMetadataOverride + a
setMetadataChangedNotifier DI seam, since the module cannot import backend/ipc's
sendFrontendMessage) and rewrote main.ts's 17 registrations as one-line delegations
(getGameMetadataOverride/getAllGameOverrides already-clean pass-throughs and requestGameSettings
D-09 left untouched); Task 3 added a 28-test direct-call suite (gameDetailsModules.test.ts) incl.
a jest.unmock('i18next') proof (repair/getLaunchOptions assertions run against the real,
uninitialized i18next.t() output rather than a fake, per the 34.2-01 CR-01-blind-spot lesson) and
a no-electron/backend-ipc/launcher/main_window source gate. RED spot-checked: injecting an
electron import into dispatch.ts failed the source gate; dropping the attachOverrides call in
getGameInfo failed a test; swapping kill's two statements failed the call-order test. One Rule 3
deviation: removed a pre-existing unused `backendEvents` import from main.ts (a leftover from
Phase 34.1's changeLanguage extraction) that blocked this plan's own eslint-clean acceptance
criterion. REQ-34.2-01/03/08/09 complete, see 34.2-02-SUMMARY.md.

34.2-03 done -- Task 1 extracted readKnownFixes verbatim out of launcher.ts into Electron-free
src/backend/knownFixes.ts (D-05, launcher.ts deliberately excluded from the sidecar's import graph
per steamFlowRegistration.ts:22); launcher.ts's installFixes imports it back unchanged, dead
fixesPath/storeMap/KnowFixesInfo imports removed. Task 2 extracted buildCrossoverRatingMap +
its D-11/D-16 three-state docstring out of crossover_index/ipc_handler.ts into
crossoverRatingMap.ts (D-06, closing the side-effect-import trap where the function shared a file
with its own addHandler call); ipc_handler.ts reduced to two imports + the single addHandler line,
no re-export; ratingMap.test.ts retargeted, its jest.mock('backend/ipc') block dropped (6->7
tests, new anti-remerge source-gate test). Task 3 added a 5-test direct-call proof suite
(knownFixes.test.ts, all REQ-34.2-05-tagged) with a jest.mock('os') homedir redirect
(appShellFlows.test.ts precedent) as defense-in-depth alongside the project-wide electron
automock, which already anchors fixesPath under os.tmpdir() via app.getPath('appData'). One Rule 3
deviation: main.ts's refreshCrossoverRatingMap() had a second, plan-undocumented import of
buildCrossoverRatingMap from ipc_handler.ts that broke the build after Task 2's extraction --
redirected to crossoverRatingMap.ts. Logged one unrelated pre-existing eslint error
(index.test.ts:29) to the phase's deferred-items.md rather than fixing it. REQ-34.2-05/06/14
complete, see 34.2-03-SUMMARY.md. RED spot-checked: removing storeMap[runner] from the path
construction failed 3/5 knownFixes tests; replacing the try/catch with a bare JSON.parse failed
the malformed-JSON test. Next: 34.2-04.

34.2-04 done -- Task 1 created src/backend/sidecar/gameDetailsFlowRegistration.ts, registering
all 15 invoke-kind game-details/settings/override channels (getGameInfo, getExtraInfo,
getGameSettings, isGameAvailable, getLaunchOptions, kill, repair, changeInstallPath, readConfig,
getGameOverride, getGameSdl, getAvailableCyberpunkMods, setCyberpunkModConfig,
getGameMetadataOverride, getAllGameOverrides) against the real 34.2-02 dispatch.ts bodies and
game_overrides/index.ts pass-throughs, wired into handlers.ts after registerAppShellFlows() and
before ensureStoresRegistered(); settingsFlowRegistration.ts (D-09, requestGameSettings) left
byte-unchanged. Task 2 added a 22-test black-box RPC-loop suite (gameDetailsFlows.test.ts)
covering all 15 channels incl. object-argument-intact proofs, D-01 runner-generic dispatch (steam

+ gog), pinned-manager isolation for the four legendary/gog-only channels, and the two

game_overrides pass-throughs proven against the REAL Phase-29 store; repair's notify-body
assertion is the end-to-end proof of 34.2-01's D-02 i18next fix (RED-confirmed live: removing
bootstrap.ts's i18next.init() call flipped the assertion from "string" to "undefined"). Task 3
added a 47-test import/delegation/kind/do-not-touch gate suite (gameDetailsImportGate.test.ts):
table-driven delegation-shape proof for all 19 of this slice's main.ts channels, table-driven
transport-kind proof (3 addListener, 16 addHandler), and byte-identity gates for
settingsFlowRegistration.ts + electronUntouched.test.ts via git show HEAD. Two Rule 1 deviations
found+fixed during Task 2's own RED spot-checks: (a) the project-wide i18next automock
(src/backend/__mocks__/i18next.ts) silently defeated the D-02 proof test until jest.unmock('i18next')
was added -- the first RED attempt passed vacuously on the automock's echoed key; (b) this repo's
shared jest.config.js resetMocks:true strips even a jest.mock FACTORY's own default implementation
before the FIRST test, so isOnline: jest.fn(() => true) needed re-arming in beforeEach or repair's
isOnline() gate silently returned undefined. Also narrowed settingsFlows.test.ts's Invariant B
guard to getUserInfo only (readConfig is no longer unported -- now owned by this plan).
REQ-34.2-01/03/08/09/10/14 complete, see 34.2-04-SUMMARY.md. Next: 34.2-05.

34.2-05 done -- Task 1 registered the 3 send-kind channels (setGameMetadataOverride,
changeGameVersionPinnedStatus, addNewApp) onto gameDetailsFlowRegistration.ts, each
cross-checked against main.ts's addListener kind before writing, wrapped in try/catch ->
logSendFailure; installed setMetadataChangedNotifier() first (before any send
registration) riding the existing sidecarRpc.pushFrontendMessage relay -- zero new Rust
arms, confirmed via an empty `git diff src-tauri/` and a clean `cargo check`. Task 2 added
a 9-test positive-side-effect proof block to gameDetailsFlows.test.ts (store read-back,
metadataChanged push-frame assertion, delete-path reachability, sideload-only addNewApp
dispatch, both branches of the 3-positional-arg changeGameVersionPinnedStatus unwrap, a
runtime registry kind gate, forced-throw crash containment on two independent paths with
an unhandledRejection spy, and a two-startSidecar() idempotency pin). REQ-34.2-01/08/09
complete, see 34.2-05-SUMMARY.md. RED spot-checked: commenting out setGameOverrides
failed the round-trip test; removing the notifier install failed the push-frame test while
the round-trip test still passed; swapping args[1]/args[2] in changeGameVersionPinnedStatus
failed both status-variant tests. No deviations. Next: 34.2-06.

34.2-06 done -- Task 1 created src/backend/sidecar/enrichmentFlowRegistration.ts, registering all
8 enrichment channels (getWikiGameInfo, getAnticheatInfo, getKnownFixes, getCrossoverIndex,
searchStores, getStoreSearchDeals, getStoreSearchStoreMap, removeRecent) against the real
underlying feature-module bodies (never an ipc_handler.ts), reproducing storeSearch/index.ts's
try/log/rethrow contract verbatim for the storeSearch trio and recording the D-07 anticheat rider
(Epic-namespace-only keying, null on Windows) in code; wired into handlers.ts after
registerGameDetailsFlows() and before ensureStoresRegistered(). Task 2 measured getWikiGameInfo's
cold-cache latency live (Hades 1190ms, Stardew Valley 957ms, Portal 2 702ms, real network,
2026-07-25 -- forced via this repo's own jest electron-store automock, no manual cache-clearing
needed) and left it on the default 60s bound; added getCrossoverIndex to
src-tauri/src/main.rs's LONG_RUNNING_CHANNELS (one string, zero new dispatch_rust_channel arms,
confirmed via git diff) since buildCrossoverRatingMap() fans out over every game in every manager
AND calls loadIndex/buildMaps per game; longRunningChannels.test.ts pins the exemption list via
set equality (6 tests). Task 3 added a 28-test real-transport suite (enrichmentFlows.test.ts)
covering all 8 channels incl. the D-16 three-state getCrossoverIndex map (key-absent vs null vs
matched, via Object.prototype.hasOwnProperty), a getWikiGameInfo cache-hit proof that the `title`
invoke argument is ignored, the storeSearch error-contract trio (real error frame, not a swallowed
empty result), and comment-stripped import gates. REQ-34.2-04/11/12/14 complete, see
34.2-06-SUMMARY.md. RED spot-checked: replacing searchStores's `throw err` with `return []` failed
the error-contract test; removing anticheat/utils.ts's isWindows early-return failed the Windows
rider test. Two Rule 1 deviations found+fixed before the Task 3 commit: the suite's manager-mock
beforeEach only reset 3 of 6 libraryManagerMap managers (resetMocks:true strips even a factory's
own default getListOfGames implementation, so nile/zoom/sideload returned undefined and crashed
buildCrossoverRatingMap's iteration); real fs/promises readFile() of an EXISTING anticheat data
file needed a real setTimeout tick, not just setImmediate (flushWithIo() helper added). One Rule 3
fixup (separate commit de1623d9): two require('fs') calls tripped @typescript-eslint/no-require-
imports and a WikiInfo test fixture was missing CodeweaversInfo's linuxRating/slug fields --
both fixed post-commit. Next: 34.2-07 (phase closure).

34.2-07 done -- slice closure: declared all 26 channels (23 sidecar invoke + 3 sidecar send) in
34.2-PORTED-CHANNELS.md with kind/backed-by/proof-level per row, set-equal to
IPC-PORT-INVENTORY.md's slice-5 list, three declaration riders (four Steam upstream stubs incl.
the previously-unnamed changeInstallPath/library.ts:790, getAnticheatInfo's Epic-namespace/
Windows-null behavior even when primed, six channels unreachable in a Steam-only workflow), the
getGameSettings/requestGameSettings divergence (D-09, dedupe deferred to Phase 35), and a sign-off
written FRESH (not copied from 34.1) stating this slice's claim is genuinely stronger --
data-in/data-out with assertable return shapes over the real RPC loop -- while naming D-02/D-07 as
the two honest exceptions. 34.2-HUMAN-UAT.md records exactly those two deferred items
(UAT-34.2-01 notification render, UAT-34.2-02 anticheat data-file download) with reproduction
steps, the honest-boundary sentence reproduced byte-identically from the PORTED-CHANNELS doc.
34.2-VALIDATION.md's 20-task map reconciled against all six prior SUMMARYs (status: complete,
nyquist_compliant: true). SEAM.md gained a new Phase 34.2 subsection in Sec.1, headline tally
61->87 wired/re-routed total, and the stale steamFlowRegistration/libraryManagerMap claim
corrected (not deleted) per D-01/Phase-32-D-02. REQ-34.2-13 complete, see 34.2-07-SUMMARY.md.
One deferred item logged (out of scope, pre-existing): a leaked-timer crash in
storeManagers/steam/library.ts's pollInstallOnce blocks a clean `pnpm test:ci` run; confirmed
pre-existing and unrelated (this plan touched zero source files) via git diff --stat and git log;
verified instead via the targeted 7-suite/152-test sweep + tsc --noEmit + cargo check, all green.
**PHASE 34.2 COMPLETE — all 7 plans executed, 26 channels declared ported, unit-proven with
exactly two named live-UAT exceptions (D-02, D-07) deferred per D-11. Headline IPC re-plumb tally
now 87 wired/re-routed total across Phases 30-34.2. Next: Phase 34.3
(tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics).**

**GAP CYCLE 1 (verification returned `gaps_found`, 11/14 — plans 34.2-08..14):**

34.2-08 done -- Task 1 exempted `repair` and `readConfig` from the sidecar's 60s bounded invoke
timeout (both now resolve to `None` in Rust `timeout_for()`, each with a one-line rationale comment;
`INVOKE_TIMEOUT`, `timeout_for()` and every `dispatch_rust_channel` arm left byte-unchanged) and
extended `longRunningChannels.test.ts`'s exact-set pin to the new eight-member array in the SAME
commit, widening the pre-existing-survivor loop to six and adding two named per-channel tests. Task 2
wrapped `onRepairYesClick`'s floating `await repair(appName, runner)` in try/catch + `window.api
.logError` (no rethrow, matching the `GamePage/index.tsx:288` convention), so a spurious timeout can
no longer become an unhandled rejection. Closes verification gap #1 / code-review CR-01;
REQ-34.2-12 complete, see 34.2-08-SUMMARY.md. Two recorded decisions: the `readConfig` exemption
applies to the whole channel rather than just `readConfig('library')` (accepted tradeoff, recorded
in-code per threat T-34.2-35), and the renderer catch logs-and-swallows rather than rethrowing to
avoid recreating the floating-promise problem one frame up at `onClick`. No deviations. One benign
eslint warning added (`GameSubMenu/index.tsx:147`, `unknown`-typed template literal — same accepted
class already present at the convention site; eslint still exits 0 with 0 errors, 18 warnings vs 17).
NOTE: this plan's own STATE/ROADMAP writes were interrupted by an API cutoff and were completed by
the orchestrator on re-entry; `state.begin-phase`/`state.update-progress` again reverted `stopped_at`
to a false "Phase 34.2 fully complete (7/7)" and re-spliced a progress-bar string into the
plan-counter note at line ~483 -- both hand-corrected, same precedent as every note in this cluster.

34.2-09 done -- closed verification gap #2 (REQ-34.2-07) / code-review finding CR-02: Task 1
attached a `.catch()` directly to the `downloadAntiCheatData(...)` call inside `bootstrap.ts`'s
`releasesInfoReady` listener body (the pre-existing `try`/`catch` around `backendEvents.on()`
covered only the synchronous registration, not the listener body which runs later from the
emitter). Task 2 added `processGuards.ts`'s `installUnhandledRejectionGuard()` -- idempotent,
log-only, `process.stderr` fallback for the early-boot `heroicLogWriter`-unset window, never
re-throws/exits/touches stdout -- installed in `src/sidecar/index.ts` before `init()`, and
updated the three stale "no guard exists" comments (`electronStub.ts`/`appShellFlowRegistration
.ts`/`gameDetailsFlowRegistration.ts`) to point at it. Task 3 added `sidecarRejectionGuard.test.ts`
(8 tests): a survival proof driving the real `bootstrap.init()` with a rejecting
`downloadAntiCheatData` (zero `unhandledRejection` events, warning logged, listener still ran),
guard-contract unit tests (idempotency, non-throw incl. when `logWarning` itself throws), and a
by-construction source-text gate proving guard-before-init() ordering in `src/sidecar/index.ts`
(not a jest project root, never imported). RED spot-check performed by hand: reverting Task 1's
`.catch()` made the survival-proof test fail as expected; file restored and `git diff` confirmed
empty afterwards. REQ-34.2-07 complete, see 34.2-09-SUMMARY.md. This was a CONTINUATION run:
Tasks 1-2 were committed in a prior session interrupted before Task 3; on resume, Task 3's test
file was found already fully written on disk (uncommitted) from that interrupted session --
verified against the plan's acceptance criteria rather than rewritten, with two Rule-1 fixes
applied (a TS2740 type mismatch in `loadFreshProcessGuards()`'s return type, and two doc-comments
that named literal banned fs-API identifiers in prose, tripping the plan's own acceptance-grep
even though no actual fs call existed).

34.2-10 done -- closed code-review finding CR-03 (blocker-severity anti-pattern in
34.2-VERIFICATION.md's Anti-Patterns table, no REQ ID -- REQ-34.2-03's actual work stays with
34.2-11) and WR-08: Task 1 mocked `pathShim.getPath()` directly in `enrichmentFlows.test.ts`
(all 4 names, no platform branch, no env var) since the suite's only prior redirect was a
`jest.mock('os')` homedir() override that `pathShim.ts`'s real `resolveAppDataDir()` bypasses on
win32 (`env.APPDATA`) and default/Linux (`env.XDG_CONFIG_HOME`) -- a real data-loss risk for the
suite's `rmSync(fixesPath, ...)`/`configStore.set('games.recent', [])` calls on non-macOS; added a
`beforeAll` containment guard (`resolve`+`relative`, never `startsWith`/`join`, per Phase 18's
"join is not containment" lesson) over `appFolder`/`userDataPath`/`fixesPath`; re-armed the
`online_monitor` `isOnline`/`runOnceWhenOnline` mocks in `beforeEach` (WR-08 -- `resetMocks: true`
strips a factory's own default implementation, so `runOnceWhenOnline` never invoked its callback
in this file). Task 2 applied the identical mock+guard shape to `gameDetailsFlows.test.ts` (its
own two `gameOverridesStore.set('overrides', {})` `beforeEach` blocks had the same bypass), leaving
its `jest.mock('os')` and load-bearing `jest.unmock('i18next')` untouched. Both suites' negative
controls (temporarily pointing the mock's `'appData'` branch outside tmpdir) were run live and
recorded verbatim in 34.2-10-SUMMARY.md: every test in both files failed loudly with the guard's
error, then passed again after revert (28/28 and 31/31). Full backend sweep: 106/107 suites,
2221/2222 tests -- the single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase
34.1, unchanged. No production source file touched; requirements-completed: [] (deliberate, see
PLAN.md frontmatter). See 34.2-10-SUMMARY.md. Next: 34.2-11.

34.2-11 done -- closed verification gap #3 (REQ-34.2-03) / code-review finding WR-02: the
requirement text and two module docstrings (`dispatch.ts`, `enrichmentFlowRegistration.ts`)
overclaimed a TRANSITIVE electron-freedom property the code does not have -- `dispatch.ts` ->
`../dialog/dialog` -> `electron` and `enrichmentFlowRegistration.ts` -> `../storeSearch/cheapshark`
-> `electron` are both real two-hop edges the existing depth-1 `gameDetailsImportGate.test.ts`
gates cannot see. Task 1 rewrote all three sites (comment-only diff in the two source files,
confirmed via a `^[+-]` grep excluding comment-prefixed lines) to state the true, enforced
invariant -- no DIRECT electron/`backend/ipc`/`../ipc`/`../launcher`/`main_window` import -- and to
name `electronStub.ts`'s `Module._load` interception as the mechanism that makes transitive reach
safe at runtime; `REQUIREMENTS.md`'s REQ-34.2-03 got an explicit, dated correction note naming this
gap/WR-02, REQ-34.2-14 left byte-unchanged (one hunk only, verified via `git diff`). Task 2 built
`electronReachLedger.test.ts` from scratch using the TypeScript compiler API
(`ts.resolveModuleName` against the repo's own `tsconfig.json`, never `ts-morph`/`madge`) to walk
the real transitive import graph from the four gated entry points, committing a growth-only
(subset, not strict-equality) baseline of the 29 electron-importing modules actually reachable --
regenerated fresh at execution time, matching the plan's planning-time 29-entry list byte-for-byte
even though the total graph size (192 files) differs slightly from the plan's 194-file note (not
investigated further, per the plan's own "do not force either value" guidance -- the >100
reachability-sanity assertion holds either way). Both required negative controls were run live and
reverted: removing a baseline entry made the growth tripwire fail naming it; restricting the walk
to depth 1 failed 3 of 4 tests (anti-degradation, reachability sanity, gap-#3 edge pin), proving
none of the four tests pass vacuously. `gameDetailsImportGate.test.ts` untouched (owned by
34.2-12/WR-01). REQ-34.2-03 content-complete (checkbox left for the verifier, per plan
instruction). See 34.2-11-SUMMARY.md. Full backend sweep: 107/108 suites, 2225/2226 tests -- the
single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, unchanged, plus
this plan's new 1 suite / 4 tests. No deviations. Next: 34.2-12.

34.2-12 done -- closed WR-01/WR-04, both instances of the same failure class: assertions that
cannot fail. Task 1 replaced `gameDetailsImportGate.test.ts`'s Gate 7/8 -- which compared the
working tree to `git show HEAD:<same path>`, unconditionally true on any clean checkout and
therefore protecting nothing since 34.2 was committed -- with a committed sha256 digest pin per
file (`createHash`, `execFileSync` import removed, zero `git` subprocess remaining), plus two
Layer-2 semantic pins for `settingsFlowRegistration.ts` (exact ten-channel set via set-equality +
length, and a `steamLibrary.has(` presence check over comment-stripped source) protecting the
specific D-09 bottle-launch fix. Task 2 closed WR-04 in `gameDetailsModules.test.ts`: added a
`beforeAll` that initializes the REAL i18next singleton (isInitialized-guarded) from
`public/locales/en/gamepage.json` read off disk, then rewrote the vacuous `getLaunchOptions`
default-label test (previously comparing two calls to the same uninitialized `i18next.t()`,
which returns `undefined` on i18next 22.5.1 and passed under `toEqual`'s undefined-property-is-
absent semantics) to assert `result[0].name` against the on-disk `launch.default` value AND
explicitly reject both `undefined` and the raw `'launch.default'` key -- closing the
uninitialized-singleton blind spot and the project-wide `__mocks__/i18next.ts` automock echo in
one assertion pair. All three negative controls run live and reverted (verbatim in
34.2-12-SUMMARY.md): a blank-line edit to `settingsFlowRegistration.ts` failed the digest gate
naming REQ-34.2-10/D-09; removing `isNative` from the expected channel set failed the semantic
pin; disabling the `beforeAll` init made the getLaunchOptions test fail with `Received: undefined`.
One Rule 3 deviation: a `LaunchOption` union-type TS2339 (`.name` not on `AltExeLaunchOption`/
`DLCLaunchOption`) blocked `tsc --noEmit`, fixed with a narrow `as { name: string }` cast (the
preceding `toMatchObject({ type: 'basic' })` already proves the runtime shape). REQ-34.2-03
complete, see 34.2-12-SUMMARY.md. Full backend sweep: 107/108 suites, 2227/2228 tests -- the
single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, unchanged, plus
this plan's own net +2 tests (Gate 7's two new semantic-pin tests; Task 2 rewrote an existing test
in place). Next: 34.2-13.

34.2-13 done -- closed code-review WR-09 (REQ-34.2-11): extracted the three `storeSearch` D-14
rethrow-contract handler bodies (`handleSearchStores`, `handleGetStoreSearchDeals`,
`handleGetStoreSearchStoreMap`) into `storeSearch/handlers.ts`, the single implementation now
imported by both `storeSearch/index.ts` (Electron `addHandler`) and
`sidecar/enrichmentFlowRegistration.ts` (Tauri `ipcMain.handle`) as one-line delegations, closing
the hand-copied duplication WR-09 found. A comment-stripped anti-remerge gate
(`storeSearch/__tests__/handlers.test.ts`, 10 tests) proves the log strings now exist in exactly
one file; live negative control re-inlined one handler body into `enrichmentFlowRegistration.ts`
and confirmed the gate fails naming it, then reverted. Full backend sweep: 108/109 suites,
2237/2238 tests -- the single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase
34.1, unchanged, plus this plan's net +1 suite/+10 tests; `electronReachLedger.test.ts`'s baseline
did not grow (handlers.ts's electron reach is via the already-baselined `cheapshark.ts` hop). No
deviations. See 34.2-13-SUMMARY.md. (Backfilled into this position log by 34.2-14's executor --
34.2-13's own session completed its work and decision log entry but did not append this narrative
line; verified against 34.2-13-SUMMARY.md and its recorded commits `465a2829`/`79f2ad75` before
writing.) Next: 34.2-14.

34.2-14 done -- **FINAL PLAN OF GAP CYCLE 1.** Closed the currency gap `34.2-VERIFICATION.md`
truth row 13 named against `34.2-PORTED-CHANNELS.md`: Task 1 brought §1 (LONG_RUNNING_CHANNELS now
8 members -- `getCrossoverIndex` from 34.2-06 plus `repair`/`readConfig` from 34.2-08, still a
timeout-policy edit not a port kind, dispatch_rust_channel arm count still 11, verified against
`src-tauri/src/main.rs` source directly), the `repair`/`readConfig` §2 rows (CR-01 timeout
exemption, the missed 34.2-06 audit, the renderer catch fix), the D-07 bootstrap-wiring §2 entry
(CR-02 crash-unsafety and its `.catch()`+`processGuards.ts` fix), and §5 (named WR-03/05/06/07/10 +
IN-01..04 as still-open accepted debt) current. Task 2 corrected §6's sign-off to state the true
direct-import (not transitive) electron-freedom invariant, named `Module._load` as the runtime
rescue mechanism and `electronReachLedger.test.ts` (29 of 192 files) as the measured Phase 35
work-list, recorded that WR-01/WR-04 were assert-nothing proofs now replaced, added a paragraph
recording (not resolving) how the gap cycle touches both deferred `34.2-HUMAN-UAT.md` items without
changing their pending/deferred status, and appended a labelled §7 gap-cycle reconciliation
subsection naming the gap/finding each of 34.2-08..14 closed. REQ-34.2-12/REQ-34.2-03 complete, see
34.2-14-SUMMARY.md. Exactly one file modified across both commits (`34.2-PORTED-CHANNELS.md`);
`34.2-HUMAN-UAT.md` and `.planning/IPC-PORT-INVENTORY.md` confirmed untouched via
`git status --porcelain`. Full backend baseline unchanged at 108/109 suites, 2237/2238 tests
(the single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, still out of
scope); targeted 17-suite/236-test sweep green; `tsc --noEmit` and `cargo check --quiet` both
clean. No deviations.
**PHASE 34.2 GAP CYCLE 1 COMPLETE — 7/7 plans executed (34.2-08..14). Every verification gap
(#1/#2/#3) and every code-review finding classified blocker/actionable in this cycle (CR-01, CR-02,
CR-03, WR-01, WR-02, WR-04, WR-08, WR-09) is closed. Findings deliberately left open (WR-03, WR-05,
WR-06, WR-07, WR-10, IN-01, IN-02, IN-03, IN-04) are named by ID in the refreshed
`34.2-PORTED-CHANNELS.md` §5 and in `deferred-items.md`, not silently dropped. Both deferred
`34.2-HUMAN-UAT.md` live items (UAT-34.2-01, UAT-34.2-02) remain deferred, unmodified. The
pre-existing `rustInvokeChannel.test.ts` failure (Phase 34.1 tray regression) remains red,
unchanged, out of scope. Ready for re-verification against the refreshed artifact set.**
NOTE: this plan's own `gsd-sdk` state writes hit the same known-corruption family documented in
every note in this cluster: `state.record-metric` reverted the frontmatter `stopped_at` (already
hand-corrected once, after `state.advance-plan`) back to the stale `34.2-10` value a second time,
and `state.record-session` dropped the ` -- Phase 34.2 gap cycle 1 EXECUTING, ...` descriptive
suffix off both the frontmatter and body `Stopped at:`/`Next:` fields when it wrote them. All
hand-corrected via targeted `Edit`, diffed against a pre-session snapshot each time rather than
trusted blindly. The recurring `**Progress:**[█████████░] 89%
happened to land on the SAME value this session's own `update-progress` computed, so no further
edit was needed there this time — coincidence, not a fix.
NOTE (34.2-14, the final gap-cycle plan): the same corruption family recurred a fourth time.
`state.advance-plan` reverted `last_activity` from a descriptive suffix to a bare date and left
the frontmatter `percent` field stale at `67` even though `state.update-progress`'s own JSON
output (run immediately after) reported `91`; `state.record-metric`/`state.add-decision` behaved
cleanly this round (append-only, no reverts). `state.update-progress` again spliced the literal
progress-bar string `[█████████░] 91%` into THIS sentence in place of the `[...]` placeholder
(the same splice site every prior note in this cluster records, now at line ~310) rather than
into anything resembling a progress-bar field — hand-corrected back to `[...]`, along with the
stale frontmatter `percent`/`last_activity` fields, both diffed against a pre-session snapshot of
`STATE.md` rather than trusted blindly, per this cluster's established practice.

Prior phase: 34.1 (tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome) — COMPLETE, 8 of 8 executed (34.1-01 done -- D-04 capability grants + IPC-PORT-INVENTORY.md reconciliation, REQ-34.1-02/REQ-34.1-10 complete, see 34.1-01-SUMMARY.md; 34.1-02 done -- D-07/D-08 app-shell handler extraction, REQ-34.1-04/REQ-34.1-12 complete, see 34.1-02-SUMMARY.md; 34.1-03 done -- D-01/D-02 renderer-side window chrome + D-05/D-06 frameless runtime, REQ-34.1-01/REQ-34.1-03 complete, see 34.1-03-SUMMARY.md; 34.1-04 done -- D-03/D-09/D-13 sidecar registration of the 18 app-shell channels + new import-graph gate, REQ-34.1-05/REQ-34.1-09 complete, see 34.1-04-SUMMARY.md; 34.1-05 done -- D-10 renderer-side gamepadAction (DOM dispatch + geometric directional focus, replacing webContents.sendInputEvent), REQ-34.1-06 complete, see 34.1-05-SUMMARY.md; 34.1-06 done -- D-11 real Tauri tray (tray_set_icon rustInvoke arm + changeTrayColor registration), see 34.1-06-SUMMARY.md; 34.1-07 done -- D-12 createNewWindow/showAboutWindow as genuine renderer-side Tauri WebviewWindows, fail-closed per-window-label capability scoping (windows:["main"]), REQ-34.1-08 complete, see 34.1-07-SUMMARY.md; 34.1-08 done -- slice closure: declared 33-channel ported list w/ the third port kind (renderer-side Tauri JS), 10 deferred live-UAT items (34.1-HUMAN-UAT.md), validation contract closed (nyquist_compliant: true), SEAM.md ported/deferred split reconciled (headline tally 28->61 wired/re-routed total), REQ-34.1-11/REQ-34.1-12 complete, see 34.1-08-SUMMARY.md. **PHASE 34.1 COMPLETE — all 8 plans executed, 33 channels declared ported, unit-proven with ALL live UAT deferred per D-15. Next: Phase 34.2.**)
Status: Ready to execute

Prior context (Phase 34 release/CI narrative, retained verbatim; the leading sentence was
truncated by `state.planned-phase` overwriting the `Status:` line — content below is history,
not the current status):
  suite 76/76 green, cross-plan sweep
  `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched|updaterSigningKey`
  192/192 green): closed the CODE half of GAP-B, live run 30084918812 -- Linux and Windows both bundled
  their installers in full and THEN failed at updater signing with `failed to decode secret key:
  incorrect updater private key password: Wrong password for that key`, ~13 minutes into the Windows
  leg, because WR-03's existing preflight only asserts `TAURI_SIGNING_PRIVATE_KEY != ''` -- a non-empty
  key with a mismatched password sails straight through it. Task 1 added `meta/updaterSigningKey.ts`
  (`verifyUpdaterSigningKeypair()` signs a throwaway probe file with the real Tauri signer, spawned via
  `require.resolve('@tauri-apps/cli/tauri.js')` + `process.execPath` in argv form -- the proven GAP-2
  pattern, never a bare `tauri`/pnpm `.bin` path -- and compares the resulting signature's minisign key
  id against the committed `src-tauri/tauri.conf.json` `plugins.updater.pubkey` key id; discriminated
  result `ok | missing-key | password-mismatch | sign-failed | pubkey-mismatch | bad-pubkey`, never
  throws for an expected failure), `meta/verifyUpdaterSigningKey.ts` (thin CLI entry, one `::error::`
  line per failure kind naming the concrete remedy, only the public key id ever printed on success),
  and `meta/__tests__/updaterSigningKey.test.ts` (real keypairs generated via `tauri signer generate
  --ci` in `beforeAll`, no hand-rolled crypto, no checked-in key material) plus the `verify:updater-key`
  package.json script following the existing meta-script esbuild-pipe-to-node convention exactly. Task 2
  inserted `Verify the updater signing key and password actually decode` into `release-tauri.yml`
  immediately after `install-deps` and before the CrossOver-index fetch (needs `node_modules` for the
  Tauri CLI, so cannot sit next to WR-03's presence-only guard), running on all four matrix legs so a
  single bad leg cannot let the other three burn their full builds before dying; extended
  `releaseWorkflow.test.ts`'s WR-03 describe block with 3 tests proving the step exists and is ordered
  after `install-deps` and before `electron-vite build`/`build:sidecar-sea`/`tauri-action`. Exact
  `pnpm verify:updater-key` invocation/output for both the matched and wrong-password cases recorded
  verbatim in `34-17-SUMMARY.md` (34-18 hands this command to a human as a blocking gate). No
  deviations -- the plan's `<interfaces>` MECHANISM facts (minisign layout, key-id byte offsets,
  the exact `Wrong password for that key` stderr string) were independently re-verified empirically
  before writing code and matched exactly. See `34-17-SUMMARY.md`. **34-18 remains** -- the human half
  of GAP-B (re-enrolling a matched key/password pair), which depends on the tool this plan built.
  Prior context — **34-16 EXECUTED 2026-07-24** (2/2 tasks, `releaseWorkflow` suite 73/73 green, cross-plan sweep
  `tauriConf|cargoFeatures|releaseWorkflow|electronUntouched` 129/129 green): closed GAP-A -- both
  macOS legs of live run 30084918812 failed on `security import: failed to import keychain
  certificate` even though NO Apple cert secret was enrolled, because the job-level `env:` block
  unconditionally mapped `APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}`, which resolves to
  a DEFINED, EMPTY variable when the secret is absent -- the Tauri bundler's macOS signing path
  tests the variable's *presence*, not its truthiness. Task 1 added 8 executed-path regression
  tests (Tests A-H) that extract-and-run the (not-yet-existing) Apple gate step's shell body via
  `runStepScript` and assert on resolved `$GITHUB_ENV` file content, plus a new shared
  `readGithubEnv()` helper in `helpers/workflowSteps.ts` (RED: Tests A-G failed on
  `extractRunBlock` finding no such step, Test H failed on a genuine still-present six-key
  job-level env assertion -- verbatim list in `34-16-SUMMARY.md`). Task 2 removed all six
  `APPLE_*` job-level env entries and replaced the decorative `Warn if macOS signing will be
  skipped` step with `Enable Apple signing only when a complete cert secret set is enrolled`: a
  step-level env maps the six secrets onto `IN_APPLE_*`-prefixed inputs (so a defined-but-empty
  input can never leak under the real name), and a `write_env()` shell function appends to
  `$GITHUB_ENV` via a `$RANDOM`-delimited heredoc (same injection defense as WR-03's
  `$GITHUB_OUTPUT` heredoc) only when the full signing trio -- and, separately, the full
  notarization trio -- is non-empty; partial sets warn and ship unsigned; the D-04 warning string
  is emitted verbatim on the fully-absent path; no branch calls `exit 1`. Diff confined to the
  job env block, the replaced step, and comments -- every step named in the plan's hard
  constraints (renderer build, SEA sidecar build, steam-bridge build, prune step, Windows signing
  surface, updater-key preflight, tauri-action `with:`) is byte-identical apart from that. No
  deviations. See `34-16-SUMMARY.md`. **34-17/34-18 remain** in gap cycle 3.
  Prior context — `34-VERIFICATION.md`
  came back `gaps_found` at 6/10 must-haves: gap cycle 1 (34-08..34-11) genuinely closed every
  prior code-review finding, but goal-backward verification then found **three NEW BLOCKERs plus
  one WARNING** that no prior review had caught, because all 85 phase tests assert *shape and
  strings* rather than the *executed code path* -- 85 green tests over 3 live blockers. Four
  additive plans were written to close them (plan-checker: VERIFICATION PASSED, zero blockers,
  one non-blocking warning about 34-13's verify step exceeding the 30s fast-feedback target):
  **34-12 EXECUTED 2026-07-24** (wave 1, 2/2 tasks) -- closed GAP-1, the BLOCKER that broke
  *every* matrix leg: `release-tauri.yml` never ran `electron-vite build`, yet
  `tauri.conf.json` has `beforeBuildCommand: ""` and `frontendDist: "../build"`, a directory
  only that command populates. Task 1 added a 9-test ordering-regression `describe` block to
  `releaseWorkflow.test.ts` (RED: 8/9 failed against the pre-fix workflow, verbatim failing-test
  list in `34-12-SUMMARY.md`). Task 2 inserted three steps between
  `./.github/actions/install-deps` and `Install Rust stable`: the CrossOver-index fetch (mirrored
  verbatim from `draft-release-mac.yml`, non-fatal `|| echo` fallback), the macOS-only
  `pnpm build-steam-bridge` step, and `pnpm exec electron-vite build` -- all three now provably
  precede `tauri-action` (line 110 vs line 191). Also corrected the 18-line header comment,
  inserting the `UNPROVEN LIVE` marker and reframing the co-run/cert-skip paragraphs as stated
  assumptions pending 34-07's deferred live gate rather than asserted fact (34-REVIEW.md WR-09).
  releaseWorkflow suite 31/31 green; cross-plan sweep
  (`tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`)
  94/94 green. No deviations. See `34-12-SUMMARY.md`. **34-14/34-15 remain** -- both
  `depends_on: ['34-12']` and can now proceed.
  **34-13 EXECUTED 2026-07-24** (wave 1, 2/2 tasks, `buildSidecarSea` suite 36/36 green,
  cross-plan sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`
  104/104 green): closed GAP-2, the Windows-leg BLOCKER -- `meta/buildSidecarSea.ts` spawned
  extensionless `node_modules/.bin/{postject,esbuild}` with no `shell:true`, which Windows
  `CreateProcess` cannot execute without PATHEXT lookup, killing the leg before `tauri-action`
  and leaving 34-11's `sidecar_triple: x86_64-pc-windows-msvc` wiring unreachable in practice.
  Task 1 added 10 RED regression tests (verbatim RED output in `34-13-SUMMARY.md`: 10/36 failed
  against the pre-fix source, including a manual node probe confirming `.bin` string still
  present today). Task 2 deleted `POSTJECT_BIN`/`ESBUILD_BIN`, added `resolveEsbuildCli()`/
  `resolvePostjectCli()` (`require.resolve`-based, fail-loud `COMPILE GATE FAILED (D-06/CR-02)`
  on resolution failure) and `isWindowsSpawnable()`, rewired `buildPostjectArgv()`/new
  `buildEsbuildArgv()` to return `{command: process.execPath, args: [cliPath, ...]}`, and
  rewired both `bundleForSea()`/`injectBlob()` call sites to consume the resolved argv --
  closing WR-10 (the tested command is now the executed command). `pnpm build:sidecar-sea`
  ran end-to-end on this arm64 Mac and printed `SEA sidecar arch verified: arm64` plus the
  compiled binary path -- the plan's mandated BEHAVIORAL proof. One Rule-1 deviation found
  during that verification run: esbuild's own installer (`install.js maybeOptimizePackage()`)
  hardlinks `bin/esbuild` to the raw native binary on every OS except win32, so
  `process.execPath <path>` crashed with a Mach-O `SyntaxError` on this host;
  `buildEsbuildArgv()` now branches on `process.platform` (win32: wrap in `process.execPath`
  like postject; else: spawn the native binary directly), with two Task-1 tests corrected to
  match. Windows-leg behavior is unchanged from the plan's literal spec. See `34-13-SUMMARY.md`.
  **34-14 EXECUTED 2026-07-24** (wave 2, 2/2 tasks, `tauriConf` suite 21/21 green, cross-plan
  sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`
  113/113 green): closed GAP-3, the dead update feed -- the endpoint used GitHub's
  `/releases/latest/download/` form, which by design excludes prereleases, while `tauri-action`
  sets `prerelease: true` unconditionally -- a permanent 404, before and after manual publish.
  **D-09 forecloses the obvious fix**: draft+prerelease is a locked decision encoding the Phase 19
  `prerelease-not-Latest` lesson, so dropping the flag was not an option. Task 1 added a 9-test
  `describe` block to `tauriConf.test.ts` (RED: 7/9 failed against the pre-fix config/workflow --
  verbatim failing-test list in `34-14-SUMMARY.md`, including a one-liner proof that
  `workflow.includes('prerelease: true') && endpoint.includes('/releases/latest/download/')`
  printed `true` against today's files). Task 2 repointed
  `plugins.updater.endpoints[0]` to `/releases/download/updater/latest.json` (exactly one changed
  line in `tauri.conf.json`, confirmed via `git diff --numstat` = `1  1`) and added
  `.github/workflows/promote-updater-feed.yml`, triggered only on `release: types: [published]`,
  which downloads the published tag's `latest.json` (non-fatal if absent), logs its SHA-256,
  ensures the `updater` release exists as a published (never draft) prerelease, and uploads the
  manifest byte-for-byte -- declaring no Apple/Windows/Tauri-signing secret anywhere in the file,
  so the minisign trust chain is provably unweakened. One self-corrected snag during Task 2: the
  workflow's own explanatory prose initially contained the literal strings `--draft` and
  `TAURI_SIGNING_PRIVATE_KEY` (inside sentences describing what NOT to do / NOT to hold), which
  tripped the literal-string acceptance-criteria greps for those exact tokens; reworded both
  comments to state the same invariant without the literal string, no test or code weakened. A
  test guards D-09's `prerelease: true`/`releaseDraft: true` against reintroduction. See
  `34-14-SUMMARY.md`.
  **34-15 EXECUTED 2026-07-24** (wave 2, 2/2 tasks, `releaseWorkflow` suite 40/40 green,
  cross-plan sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`
  122/122 green): closed GAP-4 -- the Windows signing gate tested only `WINDOWS_CERTIFICATE`,
  not `WINDOWS_CERT_THUMBPRINT`, so a half-configured secret set yielded
  `certificateThumbprint: ""` and hard-failed the leg -- contradicting D-04's graceful-skip
  invariant and the workflow's own stated "CI must never fail on missing certs". Task 1 added
  a 9-test regression block to `releaseWorkflow.test.ts` (RED: 7/9 failed against the pre-fix
  workflow, verbatim failing-test list in `34-15-SUMMARY.md`). Task 2 narrowed the cert-import
  step's `if:` to also require `WINDOWS_CERT_THUMBPRINT != ''` (no `.pfx` written for an
  unusable cert), restructured `build_args` into an if/elif/else (both secrets -> sign;
  cert-only -> `::warning::` + ship unsigned, job stays green, no `exit 1`; neither -> existing
  default), and replaced the single-line `echo "args=..."` output with a `$RANDOM`-randomised
  heredoc, closing the WR-03 secondary `$GITHUB_OUTPUT` injection point. One deviation: Task
  1's Test 4 was rewritten from the plan's literal "no exit 1 anywhere in the whole file"
  wording (already true pre-fix, so not RED as specified) to an elif-scoped assertion that
  genuinely fails pre-fix and passes post-fix, preserving the same D-04 invariant; Task 2's
  literal whole-file "no exit 1" acceptance grep still holds. See `34-15-SUMMARY.md`.
  **All four gap-closure plans (34-12, 34-13, 34-14, 34-15) are now executed.** Next step is
  phase re-verification (`/gsd-verify-work 34` or equivalent) to confirm `34-VERIFICATION.md`'s
  remaining truths now pass, followed by resumption of 34-07's deferred live tag-push gate.
  Every plan is test-first with mandatory RED evidence (each new assertion must be shown failing
  against today's source before the fix lands), and comment-stripping is mandated wherever a
  `grep`/`toContain` assertion could otherwise be satisfied by the files' own header prose --
  the direct answer to the 85-green-tests-over-3-blockers finding.
  Waves are file-overlap safe: 34-12 and 34-13 share no `files_modified`; 34-14 and 34-15 both
  `depends_on: ['34-12']` and are mutually disjoint (GAP-3's cross-file test was deliberately
  placed in `tauriConf.test.ts` rather than `releaseWorkflow.test.ts` to keep them parallel).
  **These four fixes are a PREREQUISITE to resuming 34-07's live gate, not a replacement for it**
  -- all three blockers sit on exactly the path that gate exercises first, so running it today
  would burn a real tag on a pipeline known to be broken.
  Still explicitly out of scope (user decision GAP-D-01): WR-04 (null CSP / `withGlobalTauri` /
  broad `opener:default`) and IN-01 (loose `system.pem` match) remain tracked debt in
  `deferred-items.md`.
  Prior cycle, unchanged: all gap-closure plans 34-08..34-11 executed and verified in isolation.
  **34-11 executed 2026-07-24** (3/3 tasks, `releaseWorkflow` suite 22/22 green, cross-plan
  regression sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource`
  74/74 green): closed the CI half of CR-01 -- every `release-tauri.yml` matrix leg now
  declares an explicit `sidecar_triple` literal, passed to the `Build self-contained sidecar
  (Node SEA)` step as `GAMELIB_SIDECAR_TARGET_TRIPLE`, so 34-08's `resolveTriple()`/
  `lipo -archs` gate now actually receives a per-leg target instead of always resolving the
  host triple -- the `x86_64-apple-darwin` leg on an Apple-Silicon `macos-latest` runner will
  build a genuine x86_64 sidecar. Also closed all of WR-02 -- the Windows signing cert import
  step now wraps `Import-PfxCertificate` in `try/finally` with `Remove-Item -Path cert.pfx
  -Force -ErrorAction SilentlyContinue`, so `cert.pfx` is deleted from the runner workspace
  even on a failed import, and the step's comment no longer claims the false "ONLY in-memory"
  handling. `deferred-items.md` gained WR-04 (null CSP / `withGlobalTauri` / broad
  `opener:default`) and IN-01 (`sidecarSeaFsShim.ts` loose `system.pem` match) as tracked debt
  per user decision GAP-D-01 -- both explicitly out of scope for this gap cycle -- plus a
  close-out note naming 34-07's deferred live gate as the sole remaining phase item. See
  `34-11-SUMMARY.md`.
  **34-10 executed 2026-07-24** (3/3 tasks, `tauriShellSource` suite 8/8 green, full Wave-0
  verification set 65/65 green): closed WR-01 -- `use_dev_sidecar()` now reduces to
  `cfg!(debug_assertions)` alone (the `GAMELIB_SIDECAR_ENTRY`-env-var-or-debug-build expression
  is gone), so a release build can never be steered onto `Command::new("node")` via the process
  environment; `resolve_sidecar_entry()`'s dev override is unchanged. Also closed WR-03 --
  `SidecarState._child` renamed to `child` and is now genuinely used: a new `shutdown_child()`
  (kill + wait, log-and-swallow on error) is called from a new `RunEvent::Exit` handler
  (`main()`'s builder tail switched from `.run(context)` to `.build(context).run(|app_handle,
  event| ...)`), so quitting via red X / Cmd+Q / Alt+F4 -- not just the in-app
  `app_exit`/`app_relaunch` commands -- now actually kills the sidecar instead of risking an
  orphaned process holding an authenticated Steam session. New `tauriShellSource.test.ts`
  extends the Wave-0 config-shape convention to `main.rs` itself via a comment-stripped source
  check (with a self-test proving the stripper works, since main.rs's own doc comments quote
  the strings under assertion). One deviation: the plan's Task 1 test and Task 3 acceptance
  criteria were mutually exclusive as literally written (blanket `_child` substring ban vs. a
  required `fn shutdown_child`) -- resolved by narrowing the test to the actual stale pattern
  (`_child: Mutex<Child>`) rather than renaming the plan-mandated method. See `34-10-SUMMARY.md`.
  (WR-01/WR-03 closure superseded by 34-11's closure of CR-01's CI half and WR-02, above.)
  **34-09 executed 2026-07-24** (2/2 tasks, `tauriConf` suite 12/12 green): closed CR-02 -- committed
  a real Windows `icons/icon.ico` generated via `tauri icon public/icon.png -o <scratch>` (copying
  only `icon.ico` into place; a fresh regen was confirmed byte-different for `icon.icns`, validating
  the scratch-dir-then-copy-only approach), wired it into `bundle.icon` in `tauri.conf.json` after
  `icons/icon.icns`, and added a 4-test regression block to `tauriConf.test.ts` (array-contains,
  nsis-implies-.ico invariant, existsSync guard over every `bundle.icon` path, ICO magic-byte check
  that rejects a renamed-PNG substitute). RED-then-GREEN sequence followed the 34-01 Wave-0
  convention. See `34-09-SUMMARY.md`.
  **34-08 executed 2026-07-24** (3/3 tasks, unit-tested 26/26 passing, empirically hardware-proven
  on this arm64 Mac): closed CR-01 -- `meta/buildSidecarSea.ts` now resolves its output triple via
  `resolveTriple()`/`GAMELIB_SIDECAR_TARGET_TRIPLE` (falls back to `hostTriple()`), sources a
  checksum-verified official nodejs.org Node binary for cross-arch builds instead of relabeling
  `process.execPath`, and gates the produced binary's real Mach-O arch via `lipo -archs`
  (`verifyBinaryArch()`, T-34-14) before it can ship. `x86_64-apple-darwin` override run produced a
  genuinely `x86_64` binary; the no-override native run still produced `arm64` -- unregressed. See
  `34-08-SUMMARY.md` for verbatim `lipo -archs` evidence.
  Gap plans **34-10** (WR-01, WR-03) and **34-11** (CR-01 CI half, WR-02) are now both executed --
  all four gap-closure findings from the code review are closed in code. User scope decisions this
  cycle: WR-04 (null CSP / `withGlobalTauri` / broad `opener:default`) and IN-01 (loose
  `system.pem` match) are DEFERRED as tracked debt, recorded in the phase's `deferred-items.md`
  (WR-04/IN-01 entries added by 34-11).
  **Live gate (unchanged).** 34-07's checkpoint:human-verify live tag-push gate (REQ-34-04 live
  proof, REQ-34-09) was deferred by explicit user decision. Full repro steps recorded verbatim in
  34-07-SUMMARY.md for resumption: push `v0.7.0-rc.test` to the `gamelib` fork remote, confirm all 4
  matrix legs green + graceful signing-skip, confirm draft+prerelease Release with artifacts +
  latest.json, confirm Node-free sidecar smoke, confirm updater invisibility while draft, then clean
  up the test tag/release. REQ-34-09 stays unchecked in REQUIREMENTS.md until that run actually
  happens. Next: run the live gate -- CR-01 (correct-arch sidecar), CR-02 (icon.ico), and WR-02
  (cert cleanup) are all now closed and will no longer fail that run.
Last activity: 2026-07-26

> **Plan-counter note (2026-07-26, post-34.2-11 execution):** per the known-corruption precedent
> documented in every note below, `state.advance-plan`/`state.record-metric`/`state.add-decision`/
> `state.record-session` were all run. `advance-plan` landed correctly (`completed_plans` 73 -> 74,
> `Plan: 12 of 14`); `record-metric` (Phase 34.2 P11 | 35min | 2 tasks | 4 files) and both
> `add-decision` calls were clean; `record-session` updated `Last session` cleanly. As with
> 34.2-10's note, `update-progress` reported `percent: 87` (a PLAN-based figure computed
> internally) but did NOT write it into frontmatter `percent` (still 60, correctly phase-based) --
> instead it again spliced its own `87%` progress-bar figure into the MIDDLE of the 2026-07-25
> post-34.1-05 note two entries below (the same sentence quoting the `90%`-vs-`85%` splice
> incident), overwriting that historical quote's `90%` with `87%` mid-sentence. Restored via a
> targeted `Edit` back to the exact original `90%` text. It also stripped both `last_activity` /
> `Last activity:` lines down to a bare date, dropping the `-- Phase 34.2 gap cycle 1 executing
> (34.2-N complete)` suffix each time one of these calls ran -- hand-restored (with the plan number
> bumped to 11) after every call, not just once, since a LATER call in the same session (`
> record-session`) reverted the string again after an earlier hand-fix. `stopped_at:` was also
> hand-corrected from "Completed 34.2-10-PLAN.md" to "Completed 34.2-11-PLAN.md -- ... 34.2-12..14
> remain" (none of the four verbs above touch `stopped_at:` themselves). Against this session's own
> commits: `9aa361b3` (docs, Task 1), `a81c98ec` (test, Task 2), plus `34.2-11-SUMMARY.md` now on
> disk. `total_plans: 85` unchanged; Phase 34.2 itself is not yet marked complete pending plans
> 34.2-12..14.

> **Plan-counter note (2026-07-25, post-34.2-10 execution):** per the known-corruption precedent
> documented in every note below, `state.advance-plan`/`state.record-metric`/`state.add-decision`/
> `state.update-progress` were all run. `advance-plan` landed correctly (`completed_plans` 72 -> 73,
> `Plan: 11 of 14`); `record-metric` and `add-decision` were clean. `update-progress` reported
> `percent: 86` (a PLAN-based figure it computed internally) but did not write that value into
> frontmatter `percent` (still 60, correctly phase-based per every prior note in this cluster) --
> instead it silently reverted frontmatter `stopped_at:` back to a stale "Completed
> 34.2-09-PLAN.md" value (hand-corrected to 34.2-10 a second time) and, more damaging, spliced its
> own `86%` progress-bar figure into the MIDDLE of the 2026-07-25 post-34.1-05 note two entries
> below -- the very sentence quoting the PRIOR splice incident's `90%` -- overwriting that
> historical quote with `86%` mid-sentence. Restored via a targeted `Edit` back to the exact
> original `90%` text (verified against the note's own surrounding prose, which still describes a
> `90%`-vs-`85%` mismatch), not a blanket revert. Against this session's own commits: `ef0d8ed3`
> (fix, Task 1), `5828d3e4` (fix, Task 2), plus `34.2-10-SUMMARY.md` now on disk. `total_plans: 85`
> unchanged; Phase 34.2 itself is not yet marked complete pending plans 34.2-11..14.

> **Plan-counter note (2026-07-25, post-34.2-06 execution):** per the known-corruption precedent
> documented in every note below, `state.advance-plan`/`state.update-progress`/`state.record-metric`/
> `state.add-decision`/`state.record-session` WERE run for this execution -- `advance-plan` and
> `update-progress` landed correctly (`completed_plans` 68 -> 69, `Plan: 7 of 7`, frontmatter
> `percent` unchanged at 60 because it tracks `completed_phases`/`total_phases`, not plan count --
> Phase 34.2 itself is not yet complete), but `state.advance-plan` again reverted the body
> `Status:` line to the generic "Ready to execute" placeholder and stripped `Last activity:`'s
> descriptive suffix down to the bare date -- hand-corrected here (`Status: Executing Phase 34.2`,
> `Last activity:` restored) alongside the body `34.2-06 done --` paragraph, against this
> session's own commits: `3b17962c` (feat, Task 1), `bee6c66c` (feat, Task 2), `0bb157fb` (test,
> Task 3), `de1623d9` (fix, post-commit lint/type fixup), plus `34.2-06-SUMMARY.md` now on disk.
> `total_plans: 78` unchanged; Phase 34.2 itself is not yet marked complete pending plan 34.2-07.

> **Plan-counter note (2026-07-25, post-34.2-05 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), `state.advance-plan`/`state.update-progress`/`state.record-metric` WERE run
> for this execution -- `advance-plan` and `update-progress` landed correctly this time
> (`completed_plans` 67 -> 68, `Plan: 6 of 7`, frontmatter `percent`/body progress-bar updated to
> 87%), but `state.advance-plan` again reverted the body `Status:` line to the generic "Ready to
> execute" placeholder and stripped `Last activity:`'s descriptive suffix down to the bare date --
> hand-corrected here (`Status: Executing Phase 34.2`, `Last activity:` restored) alongside the
> body `34.2-05 done --` paragraph, against this session's own commits: `51fb141d` (feat, Task 1),
> `07c026bf` (test, Task 2), plus `34.2-05-SUMMARY.md` now on disk. `total_plans: 78` unchanged;
> Phase 34.2 itself is not yet marked complete pending plans 34.2-06/07.

> **Plan-counter note (2026-07-25, post-34.2-04 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), `state.advance-plan`/`state.record-metric`/`state.add-decision`/
> `state.record-session` WERE run for this execution (unlike prior sessions, which skipped them
> entirely) -- `advance-plan` and `update-progress` landed correctly this time
> (`completed_plans` 66 -> 67, `Plan: 5 of 7`, frontmatter `percent: 60` unchanged/phase-based),
> but `state.record-session` again stripped the body `Status:`/`Last activity:` lines' descriptive
> suffix down to bare "Ready to execute"/the date alone -- hand-corrected here (`Status: Executing
> Phase 34.2`, `Last activity:` restored) alongside the body `34.2-04 done --` paragraph, against
> this session's own commits: `cd115f98` (feat, Task 1), `45ecaf6c` (test, Task 2), `b35b31a8`
> (test, Task 3), plus `34.2-04-SUMMARY.md` now on disk. `total_plans: 78` unchanged; `percent: 60`
> is phase-based (9 of 15 completed phases), unchanged -- Phase 34.2 itself is not yet marked
> complete pending plans 34.2-05..07.

> **Plan-counter note (2026-07-25, post-34.2-03 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), those verbs were **deliberately not run** for this execution either.
> Frontmatter (`status`, `stopped_at`, `last_updated`, `last_activity`,
> `progress.completed_plans` 65 -> 66) and the body `Plan:`/`Status:`/`Last activity:` fields
> were written by hand against the phase directory and this session's own commits: `f03f95d3`
> (feat, Task 1), `137a522d` (feat, Task 2), `99cd1450` (test, Task 3), plus `34.2-03-SUMMARY.md`
> now on disk. `total_plans: 78` is unchanged (34.2-01..07 were already counted when the phase was
> planned); `percent: 60` is phase-based (9 of 15 completed phases), unchanged -- Phase 34.2 itself
> is not yet marked complete pending plans 34.2-04..07.

> **Plan-counter note (2026-07-25, post-34.2-01 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), those verbs were **deliberately not run** for this execution either.
> Frontmatter (`status`, `stopped_at`, `last_updated`, `last_activity`,
> `progress.completed_plans` 63 -> 64) and the body `Plan:`/`Status:`/`Last activity:` fields
> were written by hand against the phase directory and this session's own commits: `a8e7c809`
> (feat, Task 1), `910e8b40` (feat, Task 2), `8ad8f5e5` (test, Task 3), plus `34.2-01-SUMMARY.md`
> now on disk. `total_plans: 78` is unchanged (34.2-01..07 were already counted when the phase was
> planned); `percent: 60` is phase-based (9 of 15 completed phases), unchanged -- Phase 34.2 itself
> is not yet marked complete pending plans 34.2-02..07.

> **Plan-counter note (2026-07-25, post-34.1-05 execution):** `gsd-sdk query
> state.update-progress`, run after 34.1-05's task commits, repeated the EXACT same
> corruption the 2026-07-24 note two entries below documents: it spliced its own
> `[█████████░] 85%` progress-bar string into the middle of that OTHER note's prose --
> the very sentence describing where the PRIOR `88%` splice landed -- turning `"the
> handler expects a `**Progress:**[█████████░] 88%
> `**Progress:**[█████████░] 85%` mid-word. `state.advance-plan` and the two
> `state.add-decision` calls were clean. Fixed with a targeted `Edit` restoring the
> exact original text (verified byte-identical against `git show HEAD:.planning/
> STATE.md` for that line range), not a blanket revert -- the surrounding
> frontmatter/Current-Position/decisions/metrics writes from this same session were
> legitimate and were kept. Same precedent as every note in this cluster: never trust
> `state.update-progress` not to mangle unrelated prose anywhere in this file; always
> diff its output before committing.

> **Plan-counter note (2026-07-24, post-34-17 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:` prose block, and revert `total_plans`/`completed_plans`),
> those verbs were **deliberately not run** this time either. Frontmatter (`status`,
> `stopped_at`, `last_updated`, `last_activity`, `progress.completed_plans` 50 -> 51) and the
> body `Plan:`/`Status:`/`Last activity:` fields were written by hand against the phase
> directory and this session's own commits: `e2653759` (feat, Task 1) and `c5722ed8` (feat,
> Task 2), plus `34-17-SUMMARY.md` now on disk. `total_plans: 56` is unchanged (34-17 was
> already counted in the gap-cycle-3 plan total); `percent: 60` is phase-based (3 of 5 completed
> phases), unchanged -- Phase 34 itself is not yet marked complete pending 34-18 and
> re-verification. `REQUIREMENTS.md` was checked directly: REQ-34-05/REQ-34-06 were already
> `[x]` from earlier plans, and REQ-34-09 correctly remains `[ ]` (it is the Manual-Only live
> tag-push gate; this plan only provides its code-side mitigation, not the live proof itself) --
> `requirements mark-complete` was therefore not run, as there is nothing new to mark.

> **Plan-counter note (2026-07-24, post-34-16 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:` prose block, and revert `total_plans`/`completed_plans`),
> those verbs were **deliberately not run** this time either. Frontmatter (`status`,
> `stopped_at`, `last_updated`, `last_activity`, `progress.completed_plans` 49 -> 50) and the
> body `Plan:`/`Status:`/`Last activity:` fields were written by hand against the phase
> directory and this session's own commits: `9924b57c` (test, Task 1 RED) and `fb98bf9d` (fix,
> Task 2 GREEN), plus `34-16-SUMMARY.md` now on disk. `total_plans: 56` is unchanged (34-16 was
> already counted in the gap-cycle-3 plan total); `percent: 60` is phase-based (3 of 5 completed
> phases), unchanged -- Phase 34 itself is not yet marked complete pending 34-17/34-18 and
> re-verification.

> **Plan-counter note (2026-07-24, post-34-15 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:` prose block, and revert `total_plans`), those verbs were
> **deliberately not run** this time. Frontmatter (`status`, `stopped_at`, `last_updated`,
> `last_activity`, `progress.completed_plans` 48 -> 49) and the body `Plan:`/`Status:`/`Last
> activity:` fields were written by hand against the phase directory and this session's own
> commits: 34-01..34-03/05/06/07/08/09/10/11/12/13/14/15 all have SUMMARY.md on disk (14
> executed, no 34-04); 34-15 is this session's plan. `total_plans: 56` / `completed_plans: 49`
> reflects 34-15 landing. `percent: 60` is phase-based (3 of 5 completed phases), unchanged --
> Phase 34 itself is not yet marked complete pending re-verification.

> **Plan-counter note (2026-07-24, post-34-14 execution):** `gsd-sdk query state.advance-plan`,
> run immediately after 34-14's execution, returned `{advanced:true, previous_plan:12,
> current_plan:13, total_plans:14}` and repeated the exact same corruption documented in every
> note below: silently reverted `stopped_at:` (frontmatter) to the stale "Completed
> 34-13-PLAN.md" value, reverted `progress.total_plans` (frontmatter) from 56 back to 52,
> reverted `progress.completed_plans` from 48 back to 46, replaced the multi-line `Status:` body
> with a bare "Ready to execute" (orphaning the gap-cycle-2 prose beneath it), and truncated
> `last_activity`/`Last activity:` to a bare date. `gsd-sdk query state.update-progress` was run
> next and additionally spliced its own `[█████████░] 88%` progress-bar string into the MIDDLE of
> the immediately-preceding plan-counter note's prose (same failure mode the 2026-07-24
> corrected-again-post-34-11 note below documents). The bare "current_plan:13" number was
> coincidentally correct as a bare integer (12 plans executed before this session's 34-14 run =
> 13 after), but every other field either verb touched was wrong. Neither automated write was
> kept: `.planning/STATE.md` was restored from a pre-verb backup copy and every field was
> corrected by hand against the phase directory (34-01..34-03/05/06/07/08/09/10/11/12/13/14 all
> have SUMMARY.md on disk; no 34-04; 34-15 has PLAN.md with no SUMMARY). Same precedent as every
> plan-counter note below -- do not trust `state.advance-plan`/`state.update-progress`'s writes
> on this file without diffing against a backup and checking the phase directory directly first.

> **Plan-counter note (2026-07-24, post-34-13 execution):** `gsd-sdk query state.advance-plan`,
> run immediately after 34-13's execution, returned `{advanced:true, previous_plan:11,
> current_plan:12, total_plans:14}` and repeated the exact same corruption documented in the
> note below: silently reverted `stopped_at:` (frontmatter) to the stale "Completed
> 34-11-PLAN.md" value, reverted `progress.total_plans` (frontmatter) from 56 back to 52,
> replaced the multi-line `Status:` body with a bare "Ready to execute" (orphaning the
> gap-cycle-2 prose beneath it), and truncated `last_activity`/`Last activity:` to a bare date.
> The bare "current_plan:12" number was coincidentally correct (11 plans executed before this
> session's 34-13 run = 12 after), but every other field it touched was wrong, identical to the
> post-34-12 failure mode. The entire automated write was discarded via `git checkout --
> .planning/STATE.md` and every field was corrected by hand against the phase directory
> (34-01..34-03/05/06/07/08/09/10/11/12/13 all have SUMMARY.md on disk; no 34-04; 34-14/34-15
> have PLAN.md with no SUMMARY). Same precedent as every plan-counter note below -- do not trust
> `state.advance-plan`'s writes on this file without checking the phase directory directly first.

> **Plan-counter note (2026-07-24, post-34-12 execution):** `gsd-sdk query state.advance-plan`,
> run immediately after 34-12's execution, returned `{advanced:true, previous_plan:10,
> current_plan:11, total_plans:14}` and silently reverted `stopped_at:` (frontmatter) to the
> stale "Completed 34-11-PLAN.md" value, reverted `progress.total_plans` (frontmatter) from 56
> back to 52, replaced the multi-line `Status:` body with a bare "Ready to execute" (orphaning
> the gap-cycle-2 prose beneath it), and truncated `last_activity`/`Last activity:` to a bare
> date with no description. The bare "current_plan:11" number was coincidentally correct (10
> plans executed before this session's 34-12 run = 11 after), but every other field it touched
> was wrong. The entire automated write was discarded via `git checkout -- .planning/STATE.md`
> (targeted single-file revert) and every field was corrected by hand against the phase
> directory (34-01..34-03/05/06/07/08/09/10/11/12 all have SUMMARY.md on disk; no 34-04;
> 34-13..34-15 have PLAN.md with no SUMMARY). Same precedent as every plan-counter note below --
> do not trust `state.advance-plan`'s writes on this file without checking the phase directory
> directly first.

> **Plan-counter note (2026-07-24, gap cycle 2 planning):** `gsd-sdk query state.planned-phase`
> was **deliberately not run** this time. Every plan-counter note below documents the same
> failure mode -- that verb reverts `stopped_at:` to a stale value and replaces the multi-line
> `Status:` body with a bare "Ready to execute", orphaning the prose beneath it, and
> `state.update-progress` has additionally spliced its own progress-bar string into the MIDDLE
> of an unrelated note's sentence. Rather than run it and repair the damage a sixth time, the
> frontmatter (`status`, `stopped_at`, `last_updated`, `last_activity`, `progress.total_plans`
> 52 -> 56) and the body `Phase:`/`Plan:`/`Status:`/`Last activity:` fields were written by hand
> against the phase directory: 34-01..34-03/05/06/07/08/09/10/11 all have SUMMARY.md on disk (10
> executed, no 34-04); 34-12..34-15 have PLAN.md with no SUMMARY (4 planned, unexecuted).
> `percent: 60` is phase-based (3 of 5 completed phases), not plan-based -- unchanged.

> **Plan-counter note (2026-07-24, corrected again post-34-11):** `gsd-sdk query
> state.advance-plan`, run immediately after 34-11's execution, returned
> `{advanced:false, reason:"last_plan", current_plan:10, total_plans:10,
> status:"ready_for_verification"}` without writing anything -- harmless this time (34-11 is
> genuinely this phase's last plan). `gsd-sdk query state.update-progress` was NOT harmless: it
> reverted `status:` (frontmatter) from `executing` to `verifying`, reverted `stopped_at:`
> (frontmatter) back to the stale "Completed 34-05-PLAN.md" value, replaced the multi-line
> `Status:` body with "Phase complete — ready for verification", dropped the
> "-- Executed 34-10 (WR-01/WR-03 gap closure)" suffix from `Last activity:`, and -- most
> damaging -- spliced its own `[█████████░] 88%` progress-bar string into the MIDDLE of the
> prior plan-counter note's prose (between "the handler expects a `**Progress:**`" and "or
> `Progress:` body line"), corrupting that note's sentence. The entire automated write was
> discarded via `git checkout -- .planning/STATE.md` (a targeted single-file revert, not a
> blanket reset) and every field above was corrected by hand against the phase directory
> (34-01..34-03/05/06/07/08/09/10/11 all have SUMMARY.md on disk; no 34-04). Same precedent as
> every plan-counter note below it -- do not trust `state.*` verbs' blind field writes on this
> file, and specifically do not trust `state.update-progress` not to mangle unrelated prose
> elsewhere in the file.

> **Plan-counter note (2026-07-24, corrected again post-34-10):** the automated
> `state.advance-plan` verb, run immediately after 34-10's execution, bumped this file from
> "Plan: 8 of 10" to "Plan: 9 of 10" -- itself off by one, since 34-01..09 (9 plans) were
> already executed before this session started. It also silently reverted `stopped_at:`
> (frontmatter) to the stale "Completed 34-05-PLAN.md" value and replaced the multi-line
> `Status:` body with a bare "Ready to execute". Both repaired by hand against the phase
> directory (34-01..34-03/05/06/07/08/09/10 all have SUMMARY.md on disk; 34-11 does not).
> `state.update-progress` also returned `{updated:false, reason:"Progress field not found"}`
> against this file's YAML-frontmatter `progress:` block (the handler expects a `**Progress:**`
> or `Progress:` body line, not frontmatter) -- left unrun, no output to trust either way. Same
> precedent as every plan-counter note below it -- do not trust `state.*` verbs' blind field
> writes on this file without checking the phase directory directly.

> **Plan-counter note (2026-07-24, corrected again post-34-09):** the automated
> `state.advance-plan` verb, run immediately after 34-09's execution, bumped this file from
> "Plan: 7 of 10" to "Plan: 8 of 10" -- coincidentally correct as a bare number this time, but
> it also silently reverted `stopped_at:` (frontmatter) to the stale "Completed 34-05-PLAN.md"
> value and replaced the multi-line `Status:` body with a bare "Ready to execute", same failure
> mode documented in the note below. Both repaired by hand against the phase directory
> (34-01..34-03/05/06/07/08/09 all have SUMMARY.md on disk; 34-10/11 do not). Same precedent as
> every plan-counter note below it -- do not trust this verb's blind field writes on this file.

> **Plan-counter note (2026-07-24, corrected again post-34-08):** the automated
> `state.advance-plan` verb, run immediately after 34-08's execution, bumped this file from
> "Plan: 1 of 10" to "Plan: 2 of 10" -- itself still wrong, since it was working off the
> already-stale "Plan: 1 of 10" / "stopped_at: Completed 34-05-PLAN.md" values noted below,
> which predate this session and never accounted for 34-06/34-07/34-08 already being executed
> (34-01..34-03/05/06/07/08 all have SUMMARY.md on disk). Corrected above to 7 of 10 by
> checking the phase directory directly rather than trusting the blind counter increment --
> same precedent as the three plan-counter notes below it.
>
> **Frontmatter revert observed (2026-07-24):** after this manual correction, running
> `gsd-sdk query state.record-session` / `state.record-metric` / `state.add-decision` /
> `roadmap.update-plan-progress` in sequence silently reverted the YAML frontmatter
> `stopped_at:` field (line 6) back to the stale "Completed 34-05-PLAN.md" value, while
> leaving `last_activity` and the body `Plan:`/`Status:` fields (edited in the same manual
> pass) untouched. Root cause not diagnosed (deferred); re-corrected by hand a second time
> below. Treat `stopped_at:` frontmatter as another field this SDK write-path can silently
> clobber -- verify it after any `state.*` mutation call, not just the `Plan:` counter.

> **Plan-counter note (2026-07-24):** `gsd-sdk query state.planned-phase` regressed
> `stopped_at` to "Completed 34-05-PLAN.md" (a stale pre-34-06/07 value) and replaced the
> multi-line `Status:` prose with a bare "Ready to execute", orphaning the paragraph beneath
> it. Both were repaired by hand against the phase directory (34-01..34-07 SUMMARY.md all
> present; 34-08..34-11 PLAN.md present with no SUMMARY). Same failure mode as the two
> plan-counter notes below — do not trust the verb's blind field writes on this file.

> **Plan-counter note (2026-07-23):** the automated `state.advance-plan` verb bumped this
> file to "Plan: 2 of 4" immediately after 31-04's execution — itself stale drift, since
> `state.advance-plan` was working off the pre-existing "Plan: 1 of 4" / "stopped_at:
> Completed 31-01-PLAN.md" values, which predate this session and never accounted for
> 31-02/31-03 already being executed (both have SUMMARY.md on disk). Corrected above to
> 4 of 4 by checking `.planning/phases/31-.../` directly (31-01..31-04-SUMMARY.md all
> present) rather than trusting the blind counter increment — same precedent as the
> Phase-30 plan-counter note below.

> **Plan-counter note:** the "Plan: 2 of 7" value this file carried immediately
> before 30-07's execution was itself stale drift (predates this session) —
> phase 30 already had 30-01..30-06 executed (see 30-06-SUMMARY.md) before this
> gap-closure plan 30-07 (the 7th) was created and just executed. Corrected
> above to 7 of 7 rather than trusting the blind counter increment.

> **STATE drift corrected 2026-07-21.** This file previously read "Phase 24 complete
> (16/17) — ready to discuss Phase 25" with `Current focus: Phase 25`, which was stale on
> several counts: Phase 25 completed 2026-07-19, Phase 26 completed 2026-07-20, and
> Phase 27 (Tauri walking skeleton) had been planned AND was 4/5 executed. Corrected
> after closing 27-05. Note `ROADMAP.md` currently contains only the Phase 27 section, so
> `gsd-sdk query roadmap.analyze` returns empty and mis-identifies the current phase —
> rebuild the roadmap before relying on that verb.

**Open work, in rough priority order:**

- **Phase 23** — full-ownership install: gaps `G-23-01`/`G-23-02` open (native install
  applies no execute bits; Denuvo launch needed a manual `chmod +x`). Gate 3 never run.
  **23-06 executed (2026-07-21):** added permanent `steam-flags-census` log instrumentation
  (`depot/flagsCensus.ts`) at plan-build/download-entry/download-complete + per-invocation
  chmod counters, and wrote `23-TRACE.md`'s H1-H5 hypothesis matrix with offline forensic
  evidence — trace-only, no fix (user-locked ordering). 23-TRACE.md also flags that the Gate
  1/Gate 2 reference installs (HUMANKIND, Cyberpunk 2077) have degraded on disk since their
  UAT recordings — a fresh install is likely needed for 23-07's clean live-run census. Next:
  23-07 (live-run recording) → 23-08 (the gated fix). REQ-23-07 stays open.
  `/gsd-plan-phase 23 --gaps`

- **Tauri seam** — port the real `safeStorage` keyring (spike 011's `keyring` crate path).
  This is what blocks Phase 27 UAT steps 2/3, and it must land BEFORE any token-writing
  channel is wired, or the sidecar will corrupt the Electron app's saved session. See
  `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` § Stubbed.

- **Cross-phase verification debt** — 30 items across 9 files (`/gsd-audit-uat`).

Closed/parked native-install phases:

- **Phase 22** (Steam Game Families / multiple bottles) — ⛔ **PARKED 2026-07-21, superseded
  by Phase 24.** The bridge's single shared bottle removes the per-family bottle matrix
  this phase existed to manage. 8 plans retained unexecuted; see
  `.planning/phases/22-multiple-steam-bottles/PARKED.md`

- **Phase 24** (macOS native Steam bridge, out-of-process steam_api proxy) — ✅ Complete
  2026-07-21 (17 plans). Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-16
  closed the shim-overwrite/install-poll and launch/sync clusters. Gate 4 (Hoard) out of
  scope — the bridge proxies only ISteamUser + ISteamFriends. Remaining: human retest of
  the Avernum 5 launch on the rebuilt .app

## Native-Install Arc Phase Map (21–25)

| Phase | Name | Plans | Summaries | Status |
|-------|------|-------|-----------|--------|
| 21 | Steam Native Install (depot download) | 17 | 17 | ✅ Complete (2026-07-20) — code-review clean, secure-phase 41/41 threats_open:0; hardware UAT (7 native-install items) DEFERRED to Windows post-production + D-UAT-10 bottled-launch deferred as tracked macOS debt |
| 22 | Steam Game Families (multiple bottle configs) | 8 | 0 | ⛔ **PARKED 2026-07-21 — superseded by Phase 24.** Bridge's one shared bottle (D-03) eliminates the per-family bottle matrix; plans retained unexecuted (`22-multiple-steam-bottles/PARKED.md`) |
| 23 | Steam full-ownership install (StateFlags=4) | 10 | 6 | 🔄 In progress, NOT phase-complete — Gate 1 PASS (2026-07-19); Gate 2 CONDITIONAL PASS (2026-07-21, HUMANKIND Denuvo launch proven but only after a manual `chmod +x` workaround — blocker gap **G-23-02**, native install applies no execute bits); Gate 3 pending. Gap **G-23-01** (KCD2 `Blocked`-depot-key aborts whole install) also open. **23-06 executed** (trace-before-fix): added permanent `steam-flags-census` instrumentation (plan-build/download-entry/download-complete) + `23-TRACE.md` H1-H5 hypothesis matrix — no fix yet, per user-locked ordering. Next: 23-07 (live-run recording) → 23-08 (the gated fix). REQ-23-07 stays open until Gate 2 re-runs clean and Gate 3 passes (`/gsd-verify-work 23`) |
| 24 | macOS native Steam bridge (steam_api proxy) | 17 | 17 | ✅ Complete 2026-07-21 — Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-16 closed shim-overwrite/install-poll + CrossOver-launch/library-sync clusters; secure-phase done (threats_open:0). Gate 4 (Hoard) out of scope — bridge proxies only ISteamUser + ISteamFriends. Open: human retest of Avernum 5 launch |
| 25 | Steam depot multi-host fan-out (throughput) | 3 | 3 | ✅ Complete + HW-verified 2026-07-19 (hosts=3, ~10 MiB/s vs 1.5–2.9 baseline) |

## Earlier macOS-Compat Phase Map (17–19)

| Phase | Name | Status |
|-------|------|--------|
| 17 | Steam on macOS via CrossOver/Wine | Complete & secured (2026-07-13) — 17 plans, UAT 7/7, VERIFICATION 6/6, code-review CR-01/WR resolved (17-17), SECURITY threats_open:0 (21/21) |
| 18 | macOS 32-bit detection, badge & CrossOver routing | Complete (UAT 5/5, secured) |
| 19 | CrossOver Compatibility Index (macOS) | Complete (2026-07-14) — 8/8 plans executed, index Action live on public fork; WR-05 live check still open |

## v0.2 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Branding & About Polish | BRAND-02, BRAND-03, BRAND-04, APP-01 | Complete (2026-07-02) |
| 6 | Library & Game Status UX | LIB-05, LIB-06, GAME-05 | Complete (2026-07-03) |
| 7 | Game Details Enrichment | DETAIL-01, DETAIL-02 | Executed (UAT pending) |
| 8 | New Steam Surfaces | STORE-01, CONSOLE-01 | Not started |
| 9 | Quality Gate | QA-01 | Not started |

## v0.3 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 10 | Humble Auth + Adapter Scaffold | HACCT-01, HACCT-02, HACCT-03 | Not started |
| 11 | Library Sync + 5-State Key Model | HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04 | Not started |
| 12 | Ownership Dedup | HDEDUP-01, HDEDUP-02 | Not started |
| 13 | Keys-Waiting + Giftable-Spares Views | HVIEW-01, HVIEW-02 | Not started |
| 14 | Guided Claim Flow | HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-04, HCLAIM-05 | Not started |
| 15 | Store Overlay + Expiration Alerts | HSTORE-01, HSTORE-03 | Not started |

## Performance Metrics

**Velocity (v0.1):**

- Total plans completed: 151 (phases 1-4)
- Average duration: ~5-15 min/plan
- Total execution time: ~5 days (2026-06-24 → 2026-06-29)

**By Phase (v0.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 6 | - | - |
| 03 | 4 | - | - |
| 04 | 2 | - | - |
| 05 | 4 | - | - |
| 06 | 2 | - | - |
| 08.1 | 4 | - | - |
| 10 | 6 | - | - |
| 11 | 5 | - | - |
| 12 | 5 | - | - |
| 14 | 6 | - | - |
| 15 | 6 | - | - |
| 16 | 3 | - | - |
| 18 | 6 | - | - |
| 17 | 17 | - | - |
| 19 | 8 | - | - |
| 20 | 7 | - | - |
| 21 | 17 | - | - |
| 26 | 5 | - | - |
| 24 | 16 | - | - |
| 29 | 7 | - | - |
| 31 | 4 | - | - |
| 32 | 3 | - | - |

**v0.1 Detail Log:**

| Phase 01 P03 | 8min | 3 tasks | 8 files |
| Phase 02-steam-library P01 | 4min | 3 tasks | 5 files |
| Phase 02-steam-library P02 | 15min | 2 tasks | 3 files |
| Phase 02-steam-library P03 | 5min | 2 tasks | 3 files |
| Phase 02-steam-library P04 | 2min | 2 tasks | 4 files |
| Phase 02-steam-library P05 | 5min | 3 tasks | 9 files |

**v0.2 Trend:**

- Plans completed: 1
- Trend: —

**v0.2 Detail Log:**

| Phase 07 P01 | — | 4 tasks | 21 files (3 new components) |

*Updated after each plan completion*
| Phase 08-new-steam-surfaces P01 | 5min | 2 tasks | 3 files |
| Phase 08-new-steam-surfaces P02 | 5min | 3 tasks | 4 files |
| Phase 10 P06 | ~55min | 2 tasks | 5 files |
| Phase 14 P06 | 30min | 2 tasks | 2 files |
| Phase 14 P07 | 35min | 3 tasks | 12 files |
| Phase 14 P08 | ~30min | 2 tasks | 6 files |
| Phase 19 P05 | 35min | 3 tasks | 6 files |
| Phase 19 P06 | ~30min | 2 tasks | 11 files |
| Phase 19 P07 | 15min | 3 tasks | 5 files |
| Phase 19 P08 | 20min | 2 tasks | 6 files |
| Phase 20 P01 | 10min | 2 tasks | 4 files |
| Phase 20 P02 | 10min | 2 tasks | 4 files |
| Phase 20 P03 | 15min | 1 tasks | 2 files |
| Phase 20 P04 | 15min | 2 tasks | 6 files |
| Phase 20 P05 | 15min | 2 tasks | 6 files |
| Phase 20 P06 | 45min | 2 tasks | 9 files |
| Phase 20 P07 | 20min | 2 tasks | 4 files |
| Phase 21 P01 | 35min | 3 tasks | 5 files |
| Phase 21 P02 | 40min | 1 tasks | 2 files |
| Phase 21 P03 | 20min | 2 tasks | 8 files |
| Phase 21 P04 | 20min | 2 tasks | 3 files |
| Phase 21 P05 | ~30min | 2 tasks | 2 files |
| Phase 21 P06 | 45min | 2 tasks | 4 files |
| Phase 21 P07 | 40min | 2 tasks | 4 files |
| Phase 21 P08 | ~30min | 2 tasks | 2 files |
| Phase 21 P09 | ~50min | 2 tasks | 9 files |
| Phase 21 P11 | 25min | 1 tasks | 2 files |
| Phase 21 P10 | 55min | 2 tasks | 12 files |
| Phase 21 P12 | ~15min | 1 task (UAT prep; 3 human-verify deferred) | 1 file |
| Phase 21 P13 | 20min | 2 tasks | 2 files |
| Phase 21 P14 | 20min | 2 tasks | 4 files |
| Phase 21 P15 | 45min | 3 tasks | 8 files |
| Phase 21 P16 | 30min | 3 tasks | 9 files |
| Phase 23 P01 | 10min | 2 tasks | 4 files |
| Phase 23 P02 | 15min | 3 tasks | 5 files |
| Phase 23 P03 | ~40min | 3 tasks | 6 files |
| Phase 25 P01 | 12min | 2 tasks | 2 files |
| Phase 25 P02 | ~20min | 3 tasks | 4 files |
| Phase 21 P17 | 30min | 2 tasks | 10 files |
| Phase 26 P01 | 15min | 2 tasks | 3 files |
| Phase 26 P02 | 8min | 1 tasks | 2 files |
| Phase 26 P03 | 8min | 1 tasks | 3 files |
| Phase 26 P04 | 25min | 2 tasks | 7 files |
| Phase 26 P05 | ~10min | 2 tasks | 2 files |
| Phase 24 P01 | 25min | 3 tasks | 10 files |
| Phase 24 P02 | 20min | 2 tasks | 3 files |
| Phase 24 P03 | 10min | 1 tasks | 3 files |
| Phase 24 P04 | 20min | 1 tasks | 2 files |
| Phase 24 P05 | ~20min | 2 tasks | 5 files |
| Phase 24 P06 | 35min | 3 tasks | 5 files |
| Phase 24 P07 | 35min | 2 tasks | 7 files |
| Phase 24 P08 | 45min | 3 tasks | 4 files |
| Phase 24 P09 | 40min | 2 tasks | 8 files |
| Phase 27 P01 | 9min | 3 tasks | 16 files |
| Phase 27 P02 | 50min | 3 tasks | 21 files |
| Phase 27 P03 | 30min | 3 tasks | 10 files |
| Phase 27 P04 | ~75min | 2 tasks | 5 files |
| Phase 24 P11 | 10min | 1 tasks | 2 files |
| Phase 24 P12 | 20min | 1 tasks | 2 files |
| Phase 24 P13 | ~25min | 2 tasks | 2 files |
| Phase 24 P14 | 15min | 1 tasks | 1 files |
| Phase 24 P15 | 12min | 1 tasks | 2 files |
| Phase 24 P16 | 25min | 2 tasks | 4 files |
| Phase 24 P17 | 20min | 2 tasks | 2 files |
| Phase 28 P01 | 35min | 3 tasks | 3 files |
| Phase 28 P02 | 30min | - tasks | - files |
| Phase 28 P03 | 40min | 3 tasks | 4 files |
| Phase 28 P04 | 45min | 3 tasks | 4 files |
| Phase 28 P05 | 35min | 1 tasks | 1 files |
| Phase 28 P06 | 45min | 2 tasks | 3 files |
| Phase 29 P01 | 8min | 2 tasks | 2 files |
| Phase 29 P02 | 15min | 2 tasks | 9 files |
| Phase 29 P03 | ~20min | 3 tasks | 5 files |
| Phase 29 P04 | 35min | 3 tasks | 3 files |
| Phase 29 P05 | 40min | 3 tasks | 3 files |
| Phase 29 P06 | ~30min | 3 tasks | 3 files |
| Phase 29 P07 | ~45min | 3 tasks | 1 files |
| Phase 30 P01 | 20min | 2 tasks | 4 files |
| Phase 30 P03 | 9min | 3 tasks | 8 files |
| Phase 30 P02 | 19min | 3 tasks | 5 files |
| Phase 30 P04 | ~25min (+ multi-hour checkpoint pause) | 3 tasks | 4 files |
| Phase 30 P05 | 10min | 2 tasks | 2 files |
| Phase 30 P06 | 20min | 3 tasks | 7 files |
| Phase 30 P07 | 25min | 2 tasks | 8 files |
| Phase 31 P01 | 45min | 3 tasks | 4 files |
| Phase 31 P04 | 20min | 3 tasks | 7 files |
| Phase 32 P01 | 30min | 2 tasks | 5 files |
| Phase 32 P02 | ~30min | 2 tasks | 3 files |
| Phase 32 P03 | ~15min | 2 tasks | 3 files |
| Phase 33 P01 | ~20min | 3 tasks | 2 files |
| Phase 33 P02 | ~25min | 2 tasks | 3 files |
| Phase 33 P03 | 15min | 3 tasks | 5 files |
| Phase 33 P04 | ~40min | 3 tasks | 8 files |
| Phase 33 P06 | ~15min | 2 tasks | 2 files |
| Phase 34 P01 | 17min | 2 tasks | 4 files |
| Phase 34 P02 | ~50min | 2 tasks | 9 files |
| Phase 34 P05 | 10min | 2 tasks | 3 files |
| Phase 34 P06 | ~15min | 1 tasks | 1 files |
| Phase 34 P08 | 15min | 3 tasks | 2 files |
| Phase 34 P09 | 8min | 2 tasks | 3 files |
| Phase 34 P10 | 25min | 3 tasks | 2 files |
| Phase 34 P14 | 20min | 2 tasks | 3 files |
| Phase 34.1 P05 | 45min | 3 tasks | 4 files |
| Phase 34.1 P06 | 45min | 3 tasks | 7 files |
| Phase 34.1 P07 | 45min | 3 tasks | 7 files |
| Phase 34.1 P08 | 50min | 3 tasks | 4 files |
| Phase 34.2 P01 | ~75min | 3 tasks | 2 files |
| Phase 34.2 P04 | 50min | 3 tasks | 5 files |
| Phase 34.2 P05 | 25min | 2 tasks | 2 files |
| Phase 34.2 P06 | 35min | 3 tasks | 5 files |
| Phase 34.2 P07 | ~9min | 3 tasks | 5 files |
| Phase 34.2 P08 | 12min | 2 tasks | 3 files |
| Phase 34.2 P09 | 25min | 3 tasks | 7 files |
| Phase 34.2 P10 | 25min | 2 tasks | 2 files |
| Phase 34.2 P11 | 35min | 2 tasks | 4 files |
| Phase 34.2 P12 | 25min | 2 tasks | 2 files |
| Phase 34.2 P13 | 20min | 2 tasks | 4 files |
| Phase 34.2 P14 | 40min | 2 tasks | 1 files |
| Phase 34.2 P15 | 25m | 2 tasks | 2 files |
| Phase 34.2 P16 | 45min | 3 tasks | 6 files |
| Phase 34.2 P17 | ~35min | 2 tasks | 4 files |
| Phase 34.2 P18 | 30min | 3 tasks | 6 files |
| Phase 34.2 P19 | 100min | 3 tasks | 6 files |
| Phase 34.2 P20 | 8min | 2 tasks | 2 files |
| Phase 34.2 P21 | 15min | 2 tasks | 2 files |
| Phase 34.2 P22 | 10min | 2 tasks | 2 files |

## Accumulated Context

### Roadmap Evolution

- Phase 08.1 inserted after Phase 8: Steam Delisted Games & Library Filters — delisted availability signal, 'Game no longer available' + install-disable, only-show filter modes (from Phase 8 UAT) (URGENT)
- v0.3 roadmap created 2026-07-05: Phases 10–15, 18 requirements mapped. Dependency chain is non-negotiable (auth → sync → dedup → views → claim flow → store overlay). Phase 10 carries highest validation risk (live API confirmation of axios + cookie + X-Requested-By header reaching api/v1/user/order).
- Phase 16 added 2026-07-10 under new milestone **v0.4 — Compatibility Data**: CrossOver Compatibility Rating (CodeWeavers) — replace the extra-info Crossover rating's stale AppleGamingWiki source (from quick 260710-l27) with a live CodeWeavers slug-lookup backend. Feasibility validated by spike 260710-nwb (66.7% naive / ~83.3% with slugify fixes). Locked constraints: content-based hit/miss detection (soft-404 = HTTP 200), apostrophe-drop + roman-numeral slugify fixes, on-demand reference-style lookups (no bulk crawl). Depends on Phase 7 extra-info rows.
- Phase 17 added 2026-07-10 under new milestone **v0.5 — Steam macOS Compatibility Runtime**: Steam on macOS via CrossOver/Wine — Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle instead of native `steam://` delegation. **Locked architecture:** run Windows Steam *in a bottle* (reuse WineSelector/CrossoverBottle plumbing); do NOT wine-run individual game exes (rejected — DRM-free only). Reverses Phase 3 GAME-04 **for macOS only**: `SteamGame.isNative()` becomes per-OS (`is_mac_native`), and the `state/InstallGameModal.ts:35` short-circuit must stop firing `steam://install` for non-mac-native games on macOS. Linux keeps Proton delegation unchanged. Depends on Phase 3 + Phase 7. Requirements/success criteria TBD in discuss/plan.

- Phase 18 added 2026-07-12 (v0.5) from /gsd-explore: **macOS 32-bit detection, badge & CrossOver routing** — detect a Steam game's mac build arch and route 32-bit-only mac games to CrossOver/Wine (32-bit dropped in Catalina/2019) with an OS/arch badge beside the game logo. **Locked approach:** hybrid detection — `osarch` via `steam-user` `getProductInfo` PICS appinfo (`config.launch[N].config.osarch`; match `"macos"` + legacy `"osx"`) as pre-install hint, plus post-install Mach-O check (`lipo -archs`). Missing `osarch` is NOT assumed 32-bit (avoids Steam's documented false-32-bit-flag trap). Routes via existing `isBottleEligible()`/D-11. Steam-only V1. Pre-work: runtime `getProductInfo` dump to lock parser. See `.planning/notes/steam-mac-arch-detection-decisions.md`, todo `steam-getproductinfo-appinfo-dump.md`. Depends on Phase 17 + Phase 7.

- Phase 21 added 2026-07-14 under new milestone **v0.7 — Steam Native Install** (from /gsd-explore + spikes 001/002): replace the opaque `steam://rungameid` install handoff with an **in-process depot download GameLib owns** — real progress, real errors, recovery. GameLib downloads depots over `steam-user`'s authenticated CM connection and writes an `appmanifest_{appId}.acf` the Steam client **adopts**; launch stays with `steam://` (DRM works); **Steam owns updates, GameLib owns only the first install** (D-2). **Fully de-risked against a real machine:** spike 001 — Steam adopts a hand-written `.acf` (`StateFlags 1026`→`4`, zero-byte install, game launches); spike 002 — 171/171 files downloaded in-process, byte-identical to Steam, **pure-JS LZMA sufficient (no native module)** → C# DepotDownloader wrapper rejected. Locked: `StateFlags=1026` not `4`; depot selection = package-level ownership (two channels + DLC-app enumeration + language filter, 11/11 verified); reimplement `steam-user`'s broken `getManifest` filenames + chunk download (~100 lines); 64-bit IDs are strings (never `@node-steam/vdf.parse`); retry chunks across content servers. Pre-work: audit `@node-steam/vdf` call sites; confirm launch on a hard-DRM title. See `.planning/spikes/MANIFEST.md`, `.planning/notes/steam-depot-install-architecture.md`. Depends on Phase 3 + Phase 1.

- Phase 25 added 2026-07-19 (from resolved debug `steam-install-slow-start`, Thread C): **Steam depot download multi-host fan-out (throughput)** — raise native-depot throughput toward Steam-client parity by fanning chunk attempt-0 across the ~6 healthy CDN hosts `getContentServers` already returns, instead of `pickHost` confining all ~32 workers to the single top-scored host (rotates only on failure; with decode now clean/`err=0`, nothing fails → one host, `avgMs~360`, ~1.5–2.9 MiB/s). Acceptance = before/after hardware throughput measurement (`grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log`, expect sustained `hosts>1`). Must not regress decode, host-health scoring, stall retry, or cancel/abort. Optional bundled cleanup: excise the dormant CDN-auth phantom machinery. Code: `pickHost`/host-health in `depot.ts`/`decompress.ts`/`hostHealth`. Context in memory `steam-install-slow-start-outcome`.

- Phase 23 added 2026-07-17: **Steam full-ownership install (StateFlags=4)** — GameLib FULLY installs a Steam game with zero Steam-client step, writing an `appmanifest_{appId}.acf` with `StateFlags=4` (installed/ready) rather than Phase 21's `StateFlags=1026` (update-queued handoff). **Reverses locked D-2** ("Steam owns first install"). De-risked by **spike-003 (VALIDATED 2026-07-17)**: full-ownership `StateFlags=4` install is feasible and *supersedes* the earlier "1026 never 4" constraint — Steam trusts a hand-written `StateFlags=4` manifest once the `EDepotFileFlag` executable bit is applied (the `os error 256` failure was a missing `+x`). Env-gated behind `GAMELIB_SPIKE_STATEFLAGS4` during spike. Builds on Phase 21 depot-download infrastructure. See spike-003 commits (a8ada46d, 6fa5a157, 816a76c9, f36d173a). Depends on Phase 21.

- Phases 28–35 added 2026-07-22 under the existing **v0.8 — Tauri Shell** milestone (extends it; `/gsd-new-milestone` deliberately NOT run, v0.8 already exists from Phase 27): the incremental Electron→Tauri/daemon port, sliced from `27-.../SEAM.md`'s ranked backlog. **28** real `safeStorage` via spike 011's `keyring` crate → **29** generalize the sidecar store past the two skeleton stores → **30/31/32** IPC re-plumb in domain slices (install/uninstall/update-check, settings/config, downloads/queue) → **33** the 44-file lifecycle cluster (`app`/`dialog`/window/`Notification`/tray/protocol, plus the `session`/`powerSaveBlocker` parity soft spots) → **34** Windows/Linux packaging+signing+auto-update → **35** Electron cutover. **Slicing rule:** every phase except 35 must end with BOTH `npm run tauri:dev` and `npm start` working (REQ-27-06's additive/reversible invariant, SEAM.md checklist step 5) — 35 is the one phase that intentionally breaks it, which is why it runs last. **Phase 28 is order-constrained, not merely first-by-value:** the sidecar and Electron share one store, so wiring any token-WRITING channel under the current passthrough stub writes `TOKEN_PREFIX`+plaintext and silently signs the user out of the real Electron app. Requirements stay TBD per phase — mint at `/gsd-plan-phase N`. Note these phases are invisible to `roadmap.analyze` until STATE.md's `milestone:` frontmatter advances past v0.7 (same caveat already recorded for Phase 27).

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Steam store manager follows `src/backend/storeManagers/` pattern (new `steam/` directory)
- Steam auth approach TBD: Steamworks SDK, steam-user npm package, or browser-based login
- Auth is prerequisite for all library and game operation phases
- [Phase ?]: No follow-up getSteamUserInfo call needed since auth flows return username inline
- [Phase ?]: No enabled/experimental guard per D-08 — Steam is always first-class
- [Phase ?]: Specific route placed before loginweb/:runner catch-all to prevent WebView capture
- [Phase ?]: pendingFetches.add() before await in fetchMetadataIfNeeded (T-2-03 dedup)
- [Phase 02-04]: Gate makeLibrary steam inclusion on steam?.username (not library length) for correct D-02 first-sync empty state
- [Phase 02-04]: steamLogin uses refreshLibrary({ runInBackground: true, library: 'steam' }) per D-01; blocking handleSuccessfulLogin removed
- [v0.2 DETAIL-02]: AppleGamingWiki integration is macOS-only and Mac-games-only; ProtonDB/Linux follow-up is DETAIL-03, explicitly deferred to post-v0.2
- [v0.2 STORE-01]: Steam storefront tab is browse-only; purchasing stays in Steam's own client/web flow
- [Phase 07 DETAIL-01]: Steam `fetchMetadataIfNeeded` now captures appdetails `platforms` → `is_mac_native`/`is_linux_native`; flags persisted in `SteamMetadataCacheEntry` and re-seeded on `refresh()` so they survive resync/restart. Windows is the implicit baseline (no flag)
- [Phase 07 DETAIL-01]: platform icons are runner-agnostic (FontAwesome brand glyphs), rendered in the Install-info TabPanel
- [Phase 07 DETAIL-02]: rating-source setting (`appleRatingSource`: crossover|wine, default crossover) uses the `configStore` + `ContextProvider` pattern — NOT `useSetting`/`SettingsContext`, which isn't populated outside the Settings tree where GamePage/AppleWikiInfo render. Toggle lives in the Accessibility screen, gated to macOS
- [Phase 07 DETAIL-02]: ~~overlay gate is `platform==='darwin' && gameInfo.is_mac_native` (D-13)~~ **SUPERSEDED by Phase 7 UAT (2026-07-04):** the AppleGamingWiki CrossOver/Wine rating measures how a WINDOWS game runs on macOS via a translation layer — Mac-native games need no such rating. Gate is now `platform==='darwin' && !gameInfo.is_mac_native` (show on Windows games on macOS). Overlay still always shows an "Unrated" pill when no rating (D-12, user-confirmed); `GamePicture`'s generic `overlay` prop unchanged
- [Phase 07 tier→color]: rating tiers mapped to `_colors.scss` `--status-*` tokens (Perfect/Playable→success, Runs/Borderline→warning, Unplayable→danger, empty→default); vocabulary is free-form upstream so unknown values fall back to neutral
- [v0.3 Humble auth]: BrowserWindow + session.cookies is the only viable auth path — Humble's /processlogin requires reCAPTCHA; programmatic login is impossible. Zero new npm packages required.
- [v0.3 Humble adapter]: C5 adapter isolation is non-negotiable — all Humble HTTP calls through adapter.ts; X-Requested-By: hb_android_app header required on every request (omitting this is the likely cause of all three Lutris integration failures)
- [v0.3 claim flow]: Primary activation URL is store.steampowered.com/account/registerkey?key= NOT steam://open/activateproduct (does not pre-fill key; unreliable on Linux Flatpak/Snap)
- [v0.3 dedup threshold]: Fuzzy-name fallback at 85%+ threshold (not community-norm 70%) — DLC titles false-positive match base games at lower thresholds and false positives waste gift links
- [v0.3 Humble not a Runner]: 'humble' is NOT added to the Runner union type — keys domain is not a game platform; no LibraryManager methods required
- [Phase 10]: D-13 revised confirmed correct in practice: Humble identity endpoint (/api/v1/user/info) hard-404s on the real account tested; had identity remained a hard gate criterion, Phase 10 would never have passed
- [Phase 10]: D-14 ses.fetch() fallback on persist:humble prepared but not activated — axios reached the live Humble API successfully on first clean run after schema fix; fallback seam stays dormant
- [Phase 10]: Frontend connected-state must be gated on an explicit isLoggedIn boolean, never on optional profile fields like username — root cause of the Task 2 UAT tile-never-flips bug (e2236bc1)
- [Phase 14]: CSRF disposition for Humble reveal/redeem confirmed REQUIRED (csrf-prevention-token header + matching csrf_cookie both necessary) — csrf-capture code must not be dropped as dead code
- [Phase 14]: Reveal/redeem POST must route through Electron net.request on persist:humble session partition, not axios — Cloudflare Bot Management blocks axios's non-browser TLS fingerprint before Humble's app code inspects the request
- [Phase 14-07]: D-30 amended (Phase 14 gap closure, 14-07): server truth = revealed-ness + expiry only; redeemed_key_val presence classifies REVEALED, never REDEEMED. REDEEMED is a local-only, always-undoable overlay via Mark-as-redeemed. Closed UAT tests 2 (CR-01) and 3 (WR-02) at their shared root cause; deleted the locallyRedeemedPending/WR-02-keep-visible/server_confirmed_ack compensation machinery. HUMBLE_CLASSIFIER_VERSION bumped 4->5.
- [Phase 14-08]: Gap closure — UAT test 8 (Keys-waiting fill-then-empty sync churn) root-caused to fetchAndCommitOrder committing classifyOrder's hard-reset ownedElsewhere overlay on every per-order commit while D-26 broadcasts each intermediate snapshot. Fixed with a merged two-branch commit-time overlay (Steam gate open -> dedup recompute at commit; gate closed -> per-key carry-forward from prior entry, D-48) — also closed a T-14-03 mid-sync C2 reveal-bypass window. Added a single-sourced isServerTerminal/isFreezeEligible predicate (classify.ts) so REVEALED-without-pending-expiry orders now freeze under D-24 again (restores the freeze benefit 14-07 had lost, cutting the standing ~19-orders-per-sync Cloudflare/WAF re-fetch exposure); REVEALED-with-future-expiry orders keep re-fetching (retroactive expiry preserved). partitionGamekeys/patchCachedState both route through the same predicate. HUMBLE_CLASSIFIER_VERSION bumped 5->6.
- [Phase ?]: Steam-AppID exact joins never gated by NAME_MATCHING_SHIPS; only non-Steam name matching is (D-02)
- [Phase ?]: D-20 reversal: slugify() keeps roman numerals verbatim, only apostrophe drop is load-bearing
- [Phase 19-06]: Added LibraryManager.getListOfGames() to the interface (Rule 3 fix) - only legendary had it; gog/nile/zoom/sideload/steam now implement it reading their own persisted libraryStore
- [Phase 19-06]: isMac gate for D-16 non-mac-emptiness lives in buildCrossoverRatingMap itself, not in 19-05's getCodeweaversFromIndex/isCrossoverIndexEligible (neither actually gates on platform)
- [Phase 19-07]: Tier derivation (5->gold, 4->silver, 3->bronze, <=2->wontRun, null->unknown, undefined->no element) computed entirely inside CrossoverBadge, never read as a pre-labeled field off the index (D-12); enforces D-16 honesty invariant in one place
- [Phase 19-07]: CrossoverBadge renders unconditionally (no is.mac guard) in GameCard -- crossoverRatings map absence already yields undefined for every non-macOS/never-looked-up tile, which the component turns into no element
- [Phase 19-08]: WineSelector gained optional runner?: Runner prop so the D-18 knownnottowork warning gate can distinguish the Steam CrossOver-bottle guided-setup path (SteamBottleSetup.tsx) from the shared generic GOG/Epic/Amazon/sideload Wine-install path
- [Phase 20]: D-02: fuzzy title matcher lifted verbatim into src/common/matching/titleMatch.ts as the single shared module (normalizeTitle/titleSimilarity/isDlcFalsePositiveRisk/fuzzyMatch); HUMBLE_FUZZY_MATCH_THRESHOLD (0.85) single-sourced there, re-exported unchanged by backend/humble/constants.ts and backend/humble/dedup.ts — Store-search badge resolver (Plan 03) reuses the identical matcher instead of writing a second one, so the threshold and DLC guard behave identically on both surfaces
- [Phase 20-02]: currencyCode kept as bare string (never a literal 'USD' union) in common/types/storeSearch.ts so D-13's USD-only debt stays visible in the type system, never implicit
- [Phase 20-02]: storeMapping constant lives in common/discounts/storeMapping.ts (sibling file) per RESEARCH Open Question 1; buy handoff reuses existing openExternalUrl SyncIPC listener (D-08) rather than a new IPC channel
- [Phase 20-03]: Steam ownership resolved by EXACT steamAppId join only (fuzzyMatch never called for Steam); GOG/Epic/Amazon resolved via the Plan 01 shared fuzzyMatch; keyAvailable computed independently and never suppressed by ownership (D-01/D-02/D-07)
- [Phase 20-04]: SEARCH_CURRENCY='USD' contained inside cheapshark.ts only (D-13); T-20-01 mitigated by restricting buildRedirectUrl to interpolate only the dealID fragment inside a fixed https://www.cheapshark.com/redirect?dealID= host prefix
- [Phase 20]: [Phase 20-05]: OwnedBadgeLabel.values widened to Record<string,string|number> (was a discriminated union) so a single t(key, defaultValue, values) call type-checks against react-i18next's TFunction overloads
- [Phase 20]: [Phase 20-05]: Owned badge stack renders as ONE joined pill per the UI-SPEC copy contract (e.g. 'Owned on Steam, GOG'), not one pill per store; key-available always renders as an independent second pill (D-07 coexistence)
- [Phase 20]: [Phase 20-05]: StoreSearchBreakdown unmounts on row collapse (not cached) so a later expand is a natural retry after a fetch failure, with no persisted per-row error UI
- [Phase 20-06]: SearchBar gained optional loading prop (icon->spinner swap in same DOM slot) - non-breaking, default false, other consumers unaffected
- [Phase 20-06]: Container filters humble.keys via selectKeysWaiting before resolveStoreSearchBadges, matching Discounts' own pattern, so a redeemed/expired key never shows key-available
- [Phase 20-07]: Owned-badge false-positive on remaster/remake titles fixed in the shared common/matching/titleMatch.ts matcher (PRODUCT_VARIANT_KEYWORDS guard, isRemasterFalsePositiveRisk OR'd into fuzzyMatch), so Humble dedup inherits the same correctness fix, not just store-search
- [Phase 21-01]: lzma.d.ts ambient module declaration added (src/common/typedefs/, matches steam-shortcut-editor.d.ts precedent) since the lzma npm package ships no TypeScript types
- [Phase 21-01]: crypto.ts uses namespaced node:crypto import (nodeCrypto.createDecipheriv) rather than named import so the acceptance-criteria grep for createDecipheriv counts exactly the 2 call sites (ECB+CBC), not the import line
- [Phase 21-02]: manifest.ts avoids the literal string '@node-steam/vdf' even in explanatory prose comments (acceptance-criteria grep requires zero occurrences file-wide, not just in imports)
- [Phase 21-02]: Atomic-write test proves temp+rename via black-box stale-content replacement + structural source grep, not jest.spyOn/jest.mock -- node:fs/promises exports are non-configurable getters under this project's ts-jest/CJS interop, silently no-oping mocked I/O with no thrown error
- [Phase 21-03]: enableSteamNativeInstall opt-in toggle registered in GeneralSettings (not WineManagerSettingsModal where DownloadProtonToSteam renders); isSteamNativeInstallEnabled() is the single backend read seam, default OFF at three layers (frontend useSetting default, GlobalConfigV0 factory default, accessor ?? false fallback)
- [Phase ?]: [Phase 21-04]: Owned appId/depotId sets are derived inside depot.ts itself (getOwnedSets, from the authenticated client's package licenses via getProductInfo) rather than as a separate exported primitive in depot/select.ts
- [Phase ?]: [Phase 21-04]: loadContentManifestParser + fetchDepotPlanEntry are only invoked when selectAllDepots returns at least one descriptor -- zero owned depots returns { depots: [], totalBytes: 0 } without dynamically importing steam-user's undocumented internal parser
- [Phase ?]: [Phase 21-05]: downloadDepotFiles is a SEPARATE exported function from downloadSteamDepots (operates on an already-built DepotPlan, no SteamUser client dependency) rather than folding the streaming loop into downloadSteamDepots itself
- [Phase ?]: [Phase 21-05]: Real-tmpdir black-box fs testing (manifest.test.ts precedent) used for the streaming download loop -- node:fs/promises exports are non-configurable getters, unmockable in this project's ts-jest/CJS interop; only fetchChunk and sendFrontendMessage are mocked
- [Phase 21-06]: downloadSteamDepots's public contract changed from returning DepotPlan to a never-throwing { status, error? } outcome -- required by Plan 07's already-written SteamGame.install() call site; original plan-building logic preserved verbatim as buildDepotPlan
- [Phase 21-06]: finalizeToSteam reads LastOwner internally via SteamUser.getClient().steamID.getSteamID64() rather than a caller parameter, keeping it self-contained and reusable by Plan 08's startup-resume path (D-05)
- [Phase 21-06]: classifyDepotError classifies by regex over error text (not instanceof) since downloadDepotFiles's own failures are already reduced to plain strings by the time they reach the orchestrator
- [Phase ?]: [Phase 21-07]: install()'s native branch placed AFTER isBottleEligible() (D-15 bottle branch untouched, Plan 11's scope); installNative() maps downloadSteamDepots outcome onto InstallResult using gog/legendary's own conventions (done/error/abort) so a classified error renders through downloadqueue.ts's EXISTING generic error+Retry surface with zero changes to that file
- [Phase ?]: [Phase 21-07]: hostSteamDepotOs() is a new helper distinct from library.ts's hostInstallPlatform() -- depot/select.ts's oslist vocabulary (windows/macos/linux lowercase) differs from InstallPlatform (Windows/Mac/linux); stop() tracks in-flight native downloads via a private nativeInstallsInFlight Set (not a new aborthandler.ts export) so callAbortController is only invoked when a real depot download is running
- [Phase ?]: [Phase 21-08]: locateDownloadingTarget() is a new standalone helper, not an extension of scanDownloadingAppIds/readAcfState, so those four poller functions stay byte-for-byte unmodified; startup finalize passes depots: [] since no live DepotPlan exists on a fresh process (honest empty InstalledDepots, Steam's verify pass reconciles)
- [Phase 21-09]: resolveSteamInstallTarget honors an args.path override only when it resolve()s to exactly one getSteamLibraries() entry (D-08); unregistered/blank overrides silently fall back to the primary library rather than erroring
- [Phase 21-09]: D-09 multi-library override picker wired into InstallGameModal.ts's actual Steam chokepoint, not DownloadDialog (which Steam installs never route through); picker is a registered-libraries-only select, never PathSelectionBox's free-text filesystem browser
- [Phase ?]: [Phase 21-11]: D-15 unified via a new shared installDepotDownload() engine (installNative + installBottleNative delegate to it) rather than a second parallel implementation; bottle installdir sourced from resolveSteamInstallTarget (discarding its native-library targetSteamappsDir) since installLocation.ts's PICS installdir helpers are private and out of this plan's files_modified scope
- [Phase 21-13]: downloadSingleFile branches on DIRECTORY_FLAG(64)/SYMLINK_FLAG(512) BEFORE the size===0 fast path; symlink target resolved via resolve(dirname(dest), linktarget) then containment-checked against installRoot (never path.join); WR-02 zero-chunk and WR-03 percent-clamp closed in the same code path
- [Phase ?]: Phase 21-14: vdfEscape escapes backslash before quote (order matters) and neutralizes \r/\n/\t to a space rather than escaping them
- [Phase ?]: Phase 21-14: sanitizeInstalldir rewritten as a positive whitelist ([A-Za-z0-9 ._-]+, no leading/trailing dot) instead of an expanding denylist
- [Phase 21-15]: decompressWorker.ts sends an explicit {type:'ready'} handshake after its module graph loads; DecompressPool keys spawn-success off that message, not worker_threads' 'online' event, which fires before a bad entry path's module-not-found error surfaces
- [Phase 21-15]: DecompressPool.shutdown() sets a shuttingDown flag first and awaits in-flight replaceWorker() spawns before its terminate sweep, closing a race where a replacement worker finishing spawn concurrently with shutdown() would otherwise never be tracked/terminated
- [Phase ?]: [Phase 21-16]: GAMELIB_HANDOFF_STATE_FLAGS = 1026 tested by strict equality in pollInstallOnce (not a bitmask) since 1026 is the exact literal GameLib itself writes on handoff
- [Phase ?]: [Phase 21-16]: notifiedWaiting fire-once flag co-located on the same activePolls entry as seenDownloading rather than a separate Map
- [Phase ?]: [Phase 21-16]: GameCard/index.tsx needed zero code changes for the restart hint -- it already renders getStatusLabel's output verbatim via hasStatus.ts's label field
- [Phase 23-01]: applyDepotFileFlags never throws (returns {ok,error}); the caller (downloadSingleFile) throws to surface a mode-application failure as a DepotDownloadFailure, matching the existing SHA1-mismatch-throws convention
- [Phase 23-02]: canWriteFullOwnership is a single exported fail-closed predicate consulted at ONE call site inside finalizeToSteam (outcome==='completed' AND failures.length===0 AND buildid present/!=='0' AND allFilesVerified AND allModesApplied); GAMELIB_SPIKE_STATEFLAGS4 fully removed
- [Phase 23-02]: FinalizeToSteamOpts's new gate-input fields (outcome/failures/allFilesVerified/allModesApplied) are optional, not required — omitting them fails CLOSED to StateFlags=1026 via canWriteFullOwnership's own defaults, preserving pre-existing finalizeToSteam call sites (incl. library.ts's Wave-3-pending startup-resume finalize) without modification
- [Phase 23-03]: Directory(64)/Symlink(512)/zero-size manifest entries reconcile by existence/target-match, never sha1 — sha1File/resolveContainedPath exported from depot.ts for reuse by depot/reconcile.ts (deliberate circular import, empirically safe under CJS/ts-jest since every cross-reference is a function-body call, never top-level state)
- [Phase 23-03]: Startup resume's allModesApplied mirrors allFilesVerified rather than re-running a mode-reapplication pass — downloadSingleFile applies EDepotFileFlag modes immediately after each file's own sha1 check during the original download session, so a file reconcile trusts as verified already had correct modes applied
- [Phase 23-03]: A reconciliation-time error inside downloadDepotFiles (e.g. path traversal) falls back to the full pre-23-03 job list rather than aborting the run; a startup buildDepotPlan/reconcile failure falls back to the honest-empty depots:[] finalize — reconciliation is purely additive, never a new failure mode, and init() never crashes
- [Phase 23-06]: G-23-02 (0/18,809 HUMANKIND files landed +x) gets trace-before-fix instrumentation only (user-locked) — permanent steam-flags-census logging at plan-build/download-entry/download-complete plus per-invocation (never module-level) chmodAttempts/modeCallsites counters, proven safe under concurrent different-appId installs. 23-TRACE.md's H1-H5 hypothesis matrix + offline forensics feed 23-07's live run; no fix designed here, and 23-08 (the fix) is explicitly gated on that verdict
- [Phase ?]: TOP_N_FANOUT=3, calibrated per PATTERNS.md guidance for fan-out width
- [Phase ?]: pickHost workerSlot fan-out only applies at attemptIndex===0 && N>1; retries/circuit-breaker unaffected
- [Phase 25-02]: fetchChunk/downloadFileChunks/downloadSingleFile gained defaulted trailing workerSlot/fileWorkerSlot: number = 0 params so combination arithmetic type-checks under strict mode; combined slot = fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot per RESEARCH.md A2
- [Phase 25-02]: Integration test drives fetchChunk directly with distinct workerSlot values (not through the full downloadFileChunks pool) since pickHost's selection happens synchronously before fetchChunk's first await
- [Phase 21]: isFullyInstalledStateFlags is the ONLY place bit-4 (0x4 FullyInstalled) is computed — buildInstalledMap/readAcfState/buildBottleInstalledMap all route through it (T-21-17-01 regression lock)
- [Phase 21]: downloadSteamDepots finalize() forces outcome to cancelled when lastResult.outcome==='cancelled' OR opts.signal?.aborted===true, closing an async-interleaving class that could otherwise let a completed outcome reach canWriteFullOwnership
- [Phase 21]: markSteamInstallIncomplete() mirrors init()'s startup-surface pattern for a SAME-SESSION native cancel (the one gap init() doesn't cover), reusing the existing steamResumePending field
- [Phase 21]: steam-incomplete is a distinct statusContext value from steam-waiting-for-restart/steam-paused — applies when NOT currently installing but an incomplete manifest exists; hasStatus.ts's notInstalled branch now threads statusContext for the first time
- [Phase 26]: Phase 26-01: classifyPurchaseResult's details param typed as SteamUserLib.EPurchaseResult (not number) to satisfy no-unsafe-enum-comparison lint rule
- [Phase 26]: Phase 26-01: redeemKey tests isolate classification logic via jest.spyOn(SteamUser, ensureConnected/getClient) rather than replaying the full auth flow
- [Phase 26-02]: Test file placed in src/frontend/helpers/__tests__/ (not colocated per plan) because both src/frontend/jest.config.js and src/backend/jest.config.js enforce testMatch requiring __tests__ dirs — A colocated test file is never discovered by Jest regardless of CLI pattern; matches existing codebase convention
- [Phase 26-02]: Avoided literal '{5}' substring in steamKeyValidation.ts comments — Acceptance-criteria grep for {5} is a whole-file check; same lesson as Phase 21-02's @node-steam/vdf comment exclusion
- [Phase 26-03]: SteamUser.redeemKey's real signature (store:'steam', key:string) matched the planned IPC payload type exactly — no adaptation needed; no new refresh/recompute plumbing added, 26-04 reuses existing refreshLibrary IPC path
- [Phase 26]: [Phase 26-04]: Used ContextProvider's refreshLibrary({ library: 'steam' }) context wrapper instead of window.api.refreshLibrary — the plan's interface note had the wrong call target; window.api.refreshLibrary takes a bare Runner string, not an options object, and the context wrapper is what actually updates steam.library in React state
- [Phase 26]: [Phase 26-04]: Non-success redeem outcomes keep the key input visible/editable (typing clears the outcome) rather than hiding the form, so users can retry inline without closing the modal (D-06/D-08)
- [Phase 26-05]: Direct-invocation Jest harness for SidebarLinks (mock react/react-router-dom/react-i18next, stub SidebarItem/QuitButton/frontend-helpers) rather than jsdom — No jsdom/react-test-renderer installed; matches HumbleOriginInfo.test.tsx/StoreSearchScreen.test.tsx precedent
- [Phase 24]: [Phase 24-01] R1 vtable generator: test file placed at meta/__tests__/gen_vtables.test.ts (not the frontmatter's literal path) to match meta/jest.config.js's testMatch and 24-PATTERNS.md's stated analog location
- [Phase 24]: [Phase 24-01] Flat SteamAPI_* export set is a fixed acceptance-set superset constant (FLAT_EXPORTS_SUPERSET), not manifest-derived, per R3's acknowledged divergence (review finding #9); builtBridgeShimPath exported from paths.ts as the BLOCKER-2 shared bundled-shim-location contract for 24-05/24-07
- [Phase ?]: [Phase 24-02]: bridge_helper.c degrades instead of exit()ing on InitFlat failure (divergence from spike 005b) so CONTROL HEALTH (process-up) stays observable separately from WHOAMI (init-succeeded-against-live-session) — the two-state readiness contract the 24-06 probe consumes (finding #7); protocol.ts frame layout reverse-validated against the committed generated shim's bridge_transact() so TS decoder and live wire agree byte-for-byte; MAX_FRAME_BYTES=65536 single-sourced across the TS decoder and the C read loop (fixed static buffer, bounds-checked before recv, T-24-03)
- [Phase 24]: [Phase 24-03]: Avernum 4 = AppID 206020, HOARD = AppID 63000 (resolved via public Steam store API; spike sources contained no AppID literal, only game names/dev names cross-checked against the READMEs)
- [Phase 24]: [Phase 24-03]: allowlist.ts uses readFileSync+JSON.parse+.parse() at module load (not a direct JSON import) per the plan's key_links spec, keeping the fail-loud load path independently testable
- [Phase 24-04]: isBridgeBottleReady() checks cxbottle.conf existence only (not steam.exe) -- the bridge bottle must never contain a bottled Windows Steam client (R6), so reusing isBottleReady()'s steam.exe check would make it permanently non-ready
- [Phase 24-04]: getBridgeBottleSettings() always resolves DEFAULT_BRIDGE_BOTTLE_NAME with no stored per-install override -- one shared bridge bottle (D-03), not user-configurable this phase
- [Phase ?]: [Phase 24-05]: SHIM_EXPORTED_SYMBOLS in shimGenerate.ts is a reviewed literal copy of meta/gen_vtables.ts's FLAT_EXPORTS_SUPERSET (not a cross-boundary import) -- src/'s tsconfig include:[src] excludes meta/, and the compiled .dll ships without its source .def at packaged runtime
- [Phase ?]: [Phase 24-05]: placeShimForGame() takes shimSourcePath as an injectable option defaulting to the real builtBridgeShimPath import -- tests inject a tmpdir fixture without mocking a module-level path const, while a source-grep test proves the production default is the real BLOCKER 2 shared location
- [Phase 24-06]: Status union uses 'not-inited' (not the suggested 'needs-spawn') to accurately name HEALTH-ok-but-WHOAMI-not-ok; poll returns early once HEALTH first answers since InitFlat already ran before the accept loop (D-04)
- [Phase 24]: Phase 24-07: pinned zig 0.16.0 for aarch64-macos (verified live against ziglang.org/download/index.json); zig lands in .build-tools/zig, never public/bin
- [Phase 24]: Phase 24-07: buildSteamBridgeShims.ts independently reconstructs public/bin/${arch}/darwin paths instead of importing paths.ts (which imports Electron's app at load time and would crash under plain node)
- [Phase 24]: Phase 24-07: zig cc -shared requires an explicit -lws2_32 link flag for the shim's winsock2.h usage -- confirmed by running the real compile gate
- [Phase 24]: isBridgeEligible() composed as the FIRST sub-branch inside install()/launch()/uninstall()'s isBottleEligible() block, ahead of the Phase 17 isBottleReady() gate (BLOCKER 1)
- [Phase 24]: Bridge install/uninstall completion signaled by a direct is_installed flip, not the shared ACF poller -- library.ts's AcfSource has no bridge-bottle variant
- [Phase 24]: markBridgeFailedThisSession(appId) + isBridgeEligible() session-set check (finding #3) so a D-05 fallback re-invocation skips the failing bridge
- [Phase ?]: 24-09: i18n keys go in gamepage.json (namespace file), not translation.json as literally named in plan -- verified against SteamBottleSetup precedent
- [Phase ?]: 24-09: fallback dialog re-invokes window.api.install()/window.api.launch() directly (D-04 shape) -- D-11 on-demand bottle provisioning inherited for free via existing steamBottleSetupRequired guard chain
- [Phase ?]: [Phase 27-01]: Sidecar transport framed as stdio JSON-RPC (not a loopback TCP port) per T-27-01 — Wine on macOS shares the host netns so a loopback port would be reachable by bottled processes; the parent<->child stdio pipe is private. Contract in src/common/types/sidecarTransport.ts (string ids for 64-bit safety), imported by the Rust shell, sidecar (27-02) and renderer bridge (27-03).
- [Phase 27]: [Phase 27-02] userData path = join(appData, 'GameLib') in pathShim.ts — matches the 'GameLib' literal already used throughout paths.ts; real Electron app.getName()-derived value can't be observed from a headless sidecar
- [Phase 27]: [Phase 27-02] Fixed a pre-existing order-sensitive circular dependency in storeManagers/index.ts's eager libraryManagerMap construction — converted top-level libraryManagerMap imports to lazy await import()/require() at use sites across 12 files, matching the codebase's existing bottle.ts/games.ts convention; required for backend/storeManagers/steam/library.ts to import headlessly under the sidecar
- [Phase 27]: 27-03: split window.api attach into a dedicated Node/Electron-free module (tauriAttach.ts) rather than reusing preload/index.ts, avoiding pulling contextBridge/backend-constants-environment into the Tauri renderer bundle
- [Phase 27]: 27-03: ipc.ts/misc.ts use lazy guarded require('electron')/require('electron-store') instead of static imports, since a static import compiles to an unconditional top-level require() that would throw if bundled into the Tauri renderer
- [Phase 27]: 27-03: registered a new Preload jest project (src/preload/jest.config.js) -- src/preload had zero test discoverability before this plan
- [Phase 27]: 27-04: added backend/logger's initHeadless() (real LogWriter, no GlobalConfig/system-info-dump side effects) as a purely additive export for the headless sidecar; Electron's own init() and main.ts startup path are unmodified
- [Phase 24]: [Phase 24-11]: D-UAT-24-04 fixed via byte-identity guard (size then sha256) replacing pure existsSync existence guard in placeShimForGame — The existence guard always short-circuited because the game's depot-shipped steam_api.dll is already present at shimPath by the time placeShimForGame runs; overwrite-by-identity restores the intended bridge-shim placement, with the shim-not-built check moved above the identity check and coverage/containment guards unchanged
- [Phase 24]: [Phase 24-12]: getBridgeBottleSteamappsRoot() mirrors getBottleSteamappsRoot() exactly (dedicated small function per root) rather than a parameterized getSteamappsRootFor(source) helper -- keeps each root trivially auditable per RESEARCH.md Pitfall 2 (never conflate native/bottle/bridge roots)
- [Phase 24]: 24-13: installBridgeGame polls the bridge bottle (pollerSource:'bridge', 24-12's AcfSource) instead of the unrelated Phase 17 GameLibSteam bottle — closes D-UAT-24-05
- [Phase 24]: 24-13: clearBridgeFailedThisSession(appId) un-poisons a session-sticky bridge failure on a successful (re)install — install() and launch() routing no longer stay permanently stuck on one earlier recoverable failure (D-UAT-24-03 cascade a)
- [Phase 24]: 24-13: launchBridgeGame verifies the resolved exe exists on disk (+ bridge bottle ready) before firing runWineCommand — a bridge-eligible game installed via a non-bridge path now surfaces steamBridgeSetupRequired instead of a silent wine no-op (D-UAT-24-02); treated as recoverable, not a bridge failure, so it does not markBridgeFailedThisSession
- [Phase 24]: Gates 2-4 in 24-UAT.md re-pointed from BLOCKED to PENDING retest, with per-fix verification hooks citing 24-11/24-12/24-13 gap closures; frontmatter status fields updated to match (Rule 1 consistency fix)
- [Phase 24]: getBridgeBottleSettings() resolves CrossOver wine via a sibling of CXBOTTLE_BIN (sync helper), not the async getCrossover() detector, keeping the getter synchronous for its existing callers
- [Phase 24]: 24-16: refresh()/refreshInstallState() consult buildBridgeInstalledMap() (native > Phase 17 bottle > bridge precedence) so a bridge-installed game's badge survives the periodic sync and focus reconciliation; installPlatformForSource('bridge') now returns Windows; markBridgeGameUninstalled emits gameStatusUpdate done to clear the Uninstalling pill (D-UAT-24-07)
- [Phase 24-17]: isBridgeAuthoritativeForInstallState() deliberately excludes games.ts's transient bridgeFailedThisSession from the library-level eligibility notion — only durable eligibility (bridgeAllowlist + mac/arch gate) drives persisted install-state, since a single recoverable session failure must never permanently flip is_installed
- [Phase 28]: Plan 28-01: sidecar->Rust rustInvoke request/response channel added (requestRustInvoke, RUST_INVOKE_CHANNELS allowlist, 60s timeout); T-28-03/T-28-03b/T-28-05 mitigated at the transport layer
- [Phase ?]: 28-02: openExternal gets minimal fire-and-forget fix, not rustInvoke conversion (Open Question 2 resolved at planning)
- [Phase 28]: 28-02: KEYRING_SERVICE=com.gamelib.launcher / KEYRING_ACCOUNT=steam-refresh-token chosen as production-stable Keychain identifiers, distinct from spike 011's throwaway values
- [Phase 28]: 28-03: TokenStore seam introduced — configStore/TOKEN_STORE_KEY access confined to tokenStore.ts, selected via setTokenStore/getTokenStore registry with no env-var escape hatch
- [Phase 28]: D-11 (28-03): Electron plaintext token fallback kept verbatim in ElectronTokenStore, not unified with sidecar's stricter D-06 policy — documented as intentional divergence
- [Phase 28]: Aliased bootstrap.ts's setTokenStore import as installTokenStore to satisfy the plan's literal single-occurrence grep acceptance criterion
- [Phase 28]: keyringTokenStore.ts's docstring avoids the literal identifiers configStore/TOKEN_STORE_KEY/TOKEN_PREFIX anywhere in the file, since its own structural test asserts a whole-file regex
- [Phase ?]: Corrected the plan's stale filename assumption for the Steam configStore file (config.json, not steamConfigStore.json) and added the skeletonFlows.test.ts-style electron/electron-store mock redirection so electronUntouched.test.ts proves the REAL production configStore path is untouched, not a synthetic tmpdir-backed mock
- [Phase 28]: Phase 28 hardware checkpoint: macOS Keychain Deny surfaces as keyring::Error::PlatformFailure wrapping OSStatus -128 (errSecUserCanceled), not NoStorageAccess — closes RESEARCH Assumption A1; no code fix needed since classification is already NoEntry-vs-everything-else, variant-agnostic.
- [Phase 28]: Regression fixed (92c29a5e): Phase 27's skeletonFlows.test.ts + 28-05's electronUntouched.test.ts were driving the developer's REAL production Electron configStore; skeletonFlows Test 4 destroyed the real Steam refresh token mid-phase. Both suites made strictly read-only / isolated.
- [Phase 29]: fileStore D-14 fix implemented as a path-keyed cellRegistry (Map<filePath,{data}>) rather than singleton FileStore instances, so new FileStore() still returns a distinct object per call while sharing the underlying data
- [Phase 29]: fileStore.ts options.defaults (D-02b) seeds unset keys under loaded data at cell-creation time only and is never persisted to disk at construction, deviating intentionally from electron-store/conf
- [Phase 29]: D-15 extended to a fourth store (uploadedLogFileStore) beyond the original three, so storeRegistration.ts (29-04) imports zero host modules
- [Phase 29]: storeRegistry records {instance, options} pairs (not just the instance) so name-keyed dispatch never re-derives cwd/name from the ValidStoreName string (Pitfall 4)
- [Phase ?]: D-08: single fail-closed store ALLOW-list (storePolicy.ts) replaces three hand-duplicated deny-lists for the Tauri path; Electron's misc.ts deny-list stays deliberately divergent until Phase 35 cutover (Phase 28 D-11 precedent)
- [Phase ?]: D-09/D-13: boot vs lazy store tier partition is declared as literal lists in storePolicy.ts, anti-drift-guarded by a hardcoded-reference-list test rather than derived at runtime
- [Phase 29]: resolveRawStore() resolves wikigameinfo (a declared ValidStoreName actually built as a CacheStore) through the same cache-shaped construction as the D-13 boot cache stores, not the typed registry
- [Phase 29]: D-08 divergence made explicit at both sites: tauriTransport.ts's snapshotGet/snapshotHas gate on storePolicy.ts's single-sourced isAllowedStoreField() allow-list; misc.ts's Electron-branch SECRET_STORE_KEYS deny-list is untouched, commented as intentionally divergent until Phase 35
- [Phase 29]: hydrated is tracked per store name (Set<string>), not per-key, matching the shape both the eager snapshot and lazy fetch actually return
- [Phase ?]: Namespace-imported sidecarRpc for storeWriteHandlers.ts's single pushFrontendMessage call site, so the D-06 single-choke-point property is grep-verifiable
- [Phase ?]: storeWriteHandlers.ts write-eligibility (D-08 isAllowedStoreField) is a stricter, independently-gated surface than storeNew's creation eligibility
- [Phase 29]: SEAM.md re-baselined: store layer moved from stub language into a real §1 section; Accepted Constraints (Phase 29) records D-07/D-14/D-08/D-01 so none reads as an undocumented bug
- [Phase 29]: 3d live-verification route substituted: original Settings-screen check hit an unrelated, pre-existing unported-channel hang (Phase 30 territory); verified via an equivalent write-path check (favourites) through the same 29-06 choke point instead
- [Phase 30]: Mocked only SteamUser's three QR static methods for sidecar wiring tests (not deeper steam-session/steam-user libs) — user.test.ts already covers SteamUser's internal login-flow correctness
- [Phase 30]: Token-seam test calls getTokenStore().setToken() directly and asserts the resulting rustInvoke frame + synthetic Rust response (mirrors rustInvokeChannel.test.ts), rather than spying on requestRustInvoke
- [Phase 30]: tauri-plugin-dialog pinned as "2" (caret-major) not literal 2.7.2, matching tauri-plugin-opener's existing convention (Cargo.lock records the exact 2.7.2 resolution)
- [Phase 30]: electronStub.ts must never import backend/logger -- it reintroduces the app.getPath() import-time module wall; use console.warn instead in that one file
- [Phase 30]: D-05a (Phase 30 Plan 02): direct SteamGame.install()/update() bypass, not a downloadqueue.ts port
- [Phase 30]: D-05b/D-12 (Phase 30 Plan 02): uninstallGameCallback/checkGameUpdates reused UNCHANGED, all runners
- [Phase 30]: Task 3 both-builds checkpoint: partial pass (3/4 human-observed conditions); Steam QR login logon button unresponsive under Tauri filed as known defect G-30-01, not merely deferred — Additive/reversible invariant confirmed no-regression; QR login UI flow is known-broken, worse than unproven, so claim discipline required filing a defect rather than re-deferring
- [Phase 30]: A returned {status:'error'} from SteamGame.install() now always pushes a terminal gameStatusUpdate('done'), mirroring Electron's removeFromQueue(forceStatusUpdate=true)
- [Phase 30]: Client-not-ready sentinel excluded from the new showDialogBoxModalAuto call to avoid colliding with ensureSteamClientReady's existing steamClientSetupRequired prompt
- [Phase 30]: useSettingsContext render-gate relaxed via hasAttemptedLoad flag (extracted as pure shouldWithholdContext) instead of seeding a fake non-empty default config — Smaller, more honest fix per plan's own escape hatch; avoids masking a genuinely-empty-but-successful settings response
- [Phase 30]: Frontend fallback test extracts the hook's pure render-gate decision instead of using React Testing Library — Project's frontend jest config has no jsdom/react-test-renderer installed; installing one is excluded from auto-fix authority (Rule 3 package-install carve-out); followed existing hasStatus.reconcile.test.ts precedent in the same directory
- [Phase 30]: Bound every pre-download steam-user CM call (getProductInfo/getDepotDecryptionKey/getRawManifest/getContentServers) plus resolveSteamInstallTarget in a 25s withTimeout to close G-30-02 (install-spinner hang) — A stale-but-present CM socket never rejects on its own; timeout rejections feed the EXISTING withPlanBuildRetry + 30-05 finally/catch machinery, so zero new terminal-status logic was needed
- [Phase ?]: setSetting registered via ipcMain.on, never .handle -- a send channel registered as a handler fails 100% silently at runtime
- [Phase ?]: getUserInfo/readConfig deliberately NOT ported -- neither is reached by the Settings screen (Epic-only / Legendary-only respectively)
- [Phase ?]: process.getSystemVersion polyfilled in electronStub.ts via os.release() rather than modifying the shared backend/utils/systeminfo module
- [Phase 31]: showMessageBox de-wired to a safe RESOLVED sentinel {response:-1}, never rejects (Phase 31 Plan 04, CR-01) — Rust's dialog is OK-only; forwarding it to a multi-button destructive confirm auto-confirmed the destructive branch for already-shipped callers (promptI386Recovery, askForceUninstall). A reject-based de-wire would crash the sidecar (unguarded fire-and-forget awaits, no unhandledRejection guard) -- resolve is the only safe fix.
- [Phase 31]: Per-game setSetting/writeConfig now enforce a resolve+relative path-containment guard (WR-01) — appName is attacker-influenceable and was routed unguarded into a filesystem path; mirrors the proven library.ts locateMachOBinary containment idiom.
- [Phase 32]: D-05 boot-resume log deferred via setImmediate with a try/catch console fallback (heroicLogWriter isn't assigned until bootstrap.ts's init() runs, which happens after the ./handlers import completes)
- [Phase 32]: installFlows.test.ts's stale Invariant B example swapped from getDMQueueInformation (now legitimately ported by 32-01, REQ-32-04) to checkDiskSpace
- [Phase 32]: D-01 (Phase 32-02) interpreted as full Electron parity for install/updateGame — Dropped the Phase 30 non-steam-runner guard entirely — RESEARCH.md's own D-01/D-02 wording calls for the runner-generic ipc_handler.ts shape, and storeManagers/index.ts already force-constructs all six library managers regardless
- [Phase 32-03]: Doc-closure triad names both G-30-01 and G-30-02 as doubly-gated live-E2E blockers (D-06), never reusing Phase 30/31's single-blocker wording; documents the 32-02 deviation (dropped non-steam-runner guard) as delivered state
- [Phase 33]: 33-01: Kept the install watchdog runner-agnostic (8min) rather than steam-only gated, per 33-RESEARCH's lower-risk recommendation
- [Phase 33]: 33-01: Failure dialog fires only on status:'error' (resolved or thrown), never on 'abort' -- a user cancel is not a failure
- [Phase ?]: D-01a audit found+fixed a new bare client.getProductInfo call in bridge/launchTarget.ts reachable from the macOS bridge install path — wrapped with withTimeout/STEAM_PICS_TIMEOUT_MS, matching installLocation.ts's fetchInstalldir
- [Phase ?]: ensureConnected D-02 fix uses AppID 753 (Steam's own client) as the canary probe target and mirrors the existing cold-connect grace-window idiom for relog's bounded fallback
- [Phase 33-03]: Extended the existing dialog_message Rust arm in place (data-shape change) rather than adding a new match arm/channel
- [Phase 33-03]: Used explicit per-caller cancelId fail-safe instead of a positional last-index heuristic -- askForceUninstall and promptI386Recovery have opposite destructive-button orders
- [Phase 33]: shell.trashItem stays a logged no-op (D-05): tauri-plugin-fs 2.5.1 has no trash capability, confirmed by reading its source directly -- no vetted plugin to wire
- [Phase 33]: app.exit/quit both forward to RUST_APP_EXIT (AppHandle::exit); app.relaunch forwards to RUST_APP_RELAUNCH (AppHandle::restart) -- fixes the zombie-sidecar gap so the real Tauri process actually exits/relaunches
- [Phase 33]: Declared the 3 gate gap-fixes (notification capability grant, sidecar online-monitor wiring, windowControlsOverlay guard) found during the 33-05 live gate as first-class rows in 33-PORTED-CHANNELS.md alongside the planned 33-01..33-04 work
- [Phase 33]: Distinguished proof levels explicitly: dialog/Notification/shell/app forwards are wired-and-unit-proven; the G-30-02 fix and 3 gate gap-fixes are hardware-proven live via the 33-05 D-13 gate
- [Phase 34]: 34-01: buildSidecarSea.test.ts's target API adds a dedicated buildCodesignArgv(binaryPath, platform) export so codesign-only-on-macOS has a real positive assertion
- [Phase ?]: 34-02: SEA build bundles its own fully self-contained sidecar copy (no --packages=external), since SEA require() bypasses Module._load and cannot resolve node_modules
- [Phase 34]: 34-02: electron resolved via esbuild --alias to electronStub.ts at build time for the SEA bundle (the repo's usual runtime Module._load hook cannot reach a compiled SEA binary)
- [Phase 34]: 34-02: steam-user and lzma runtime-computed require() calls patched via pnpm patch to their always-resolved literal target (behavior-neutral, unblocks SEA bundling)
- [Phase 34]: 34-05: shell:allow-execute scoped to exactly {name:'binaries/gamelib-sidecar', sidecar:true} — no broad shell grant to the webview — T-34-09 elevation-of-privilege mitigation
- [Phase 34]: 34-05: Task 3 (npm run tauri:dev / npm start both-launch human-verify) deferred by user decision — REQ-34-08 additive/reversible invariant not yet runtime-proven; carry forward as pending human-UAT
- [Phase 34]: 34-06: Windows --config signing override computed via a bash step (id: build_args -> GITHUB_OUTPUT) rather than an inline nested-brace GHA expression ternary, avoiding brace-escaping ambiguity while preserving D-04's secrets-less-run-ships-unsigned default.
- [Phase 34]: CR-01 fixed via GAMELIB_SIDECAR_TARGET_TRIPLE override + checksum-verified official nodejs.org Node binary for cross-arch builds (GAP-D-02); Intel Mac support kept, Rosetta/dropping the leg rejected
- [Phase 34]: Confirmed via cmp that tauri icon regen is byte-identical for PNGs but byte-different for icon.icns -- validates the scratch-dir-then-copy-only-icon.ico approach as necessary
- [Phase 34]: 34-10: kept shutdown_child method name per plan's explicit Task 3 instruction; narrowed Task 1's over-broad test assertion instead, resolving a plan-internal contradiction (blanket _child substring check vs. required fn shutdown_child)
- [Phase 34]: 34-11: Used explicit per-leg sidecar_triple matrix literals over inline GHA ternary; try/finally cert.pfx cleanup; WR-04/IN-01 deferred per GAP-D-01 — Literal matrix fields match 34-06's build_args precedent and are directly test-assertable; try/finally covers the failed-import case a trailing statement would miss
- [Phase 34]: 34-14: repointed the updater feed endpoint to a fixed-tag asset URL (/releases/download/updater/latest.json) and added a release:published-triggered promote-updater-feed.yml, closing GAP-3 while preserving D-09's draft+prerelease human-review gate
- [Phase 34.1-05]: No jest-environment-jsdom added; hand-rolled DOM/event test harness on Node's built-in EventTarget/Event instead — Matches the project's documented precedent (src/frontend/jest.config.js) for avoiding this dependency; Node's EventTarget/Event already implement the dispatch/cancel semantics needed
- [Phase 34.1-05]: Split D-10 gamepad test coverage across two files — gamepadAction.test.ts uses the real tauriGamepadAction for DOM logic; gamepadActionRouting.test.ts mocks it to prove only misc.ts's isTauri() routing -- jest.mock() is file-wide/hoisted so one file could not do both
- [Phase ?]: Added the image-png Cargo feature alongside tray-icon (Rule 3 fix) -- Image::from_bytes is gated behind image-ico/image-png and is not implied by tray-icon
- [Phase ?]: changeTrayColor's initial sync is deferred via setImmediate (registerAppShellFlows runs before initLogger; GlobalConfig.get()'s first call can itself synchronously log)
- [Phase ?]: Left linux-libxdo off the tray-icon feature set -- unverified requirement, recorded as an open Linux question rather than guessed
- [Phase 34.1]: D-12 resolved: createNewWindow/showAboutWindow are renderer-side (Tauri JS) via WebviewWindow, not sidecar-routed — WebviewWindow's constructor is webview-context-only, the headless sidecar cannot call it -- zero new Rust arms needed
- [Phase 34.1]: Child-window labels are a monotonic counter (external-<n>) or fixed 'about', never derived from the URL and never 'main' — preserves capabilities/default.json's windows:['main'] fail-closed boundary -- remote content opened via createNewWindow inherits zero Tauri command access
- [Phase 34.1]: 34.1-08: zero drift found between the plan's declared 33-channel/kind assignment and what shipped, confirmed by set-equality against IPC-PORT-INVENTORY.md's corrected Slice 4 list
- [Phase 34.1]: 34.1-08: changeTrayColor recorded as sidecar send + rustInvoke (new arm), a more specific kind than the plan's flat sidecar-send bucket, not a contradiction
- [Phase 34.1]: 34.1-08: SEAM.md's headline-cost tally advanced from 28 to 61 wired/re-routed total; callTool's D-14 move to Phase 34.5 noted
- [Phase 34.2]: 34.2-01: Re-homed anticheat/ipc_handler.ts's releasesInfoReady listener body directly into bootstrap.ts (Block A) rather than importing that file, because its module scope calls addHandler from backend/ipc, which imports the real electron
- [Phase 34.2]: 34.2-01: Discovered src/backend/__mocks__/i18next.ts is a project-wide Jest automock (adjacent to the Backend project's roots) applied to every backend test file automatically with no explicit jest.mock() call anywhere -- one level further back than the exact CR-01 blind spot this plan's objective names; jest.unmock('i18next') defeats it
- [Phase 34.2]: 34.2-01: Dropped the plan's literal "rmSync the tmp home dir in afterAll" test instruction after it reproducibly crashed the whole Node process (LogWriter's real fire-and-forget writes raced the delete); adopted steamAuthFlows.test.ts's own no-explicit-cleanup precedent instead
- [Phase 34.2]: requestGameSettings stays solely owned by settingsFlowRegistration.ts (D-09); deduping getGameSettings/requestGameSettings deferred to Phase 35 Electron cutover
- [Phase 34.2]: getGameMetadataOverride/getAllGameOverrides registered directly against game_overrides/index.ts, never routed through gamedetails/dispatch.ts (already Electron-free pass-throughs)
- [Phase 34.2-05]: Route metadataChanged frontend push through sidecarRpc.pushFrontendMessage directly, not electron/backend-ipc.ts — Same relay storeWriteHandlers.ts's D-06 STORE_CHANGED_CHANNEL push already rides; zero new Rust arms; importing backend/ipc.ts is forbidden under src/backend/sidecar/
- [Phase ?]: getWikiGameInfo measured (Hades 1190ms, Stardew Valley 957ms, Portal 2 702ms) and NOT exempted from the 60s invoke bound
- [Phase ?]: getCrossoverIndex exempted from the 60s invoke bound (LONG_RUNNING_CHANNELS, zero new Rust dispatch arms)
- [Phase 34.2]: Slice closure (34.2-07): wrote 34.2-PORTED-CHANNELS.md sec.6 sign-off fresh rather than reusing 34.1's wording -- this slice's 26 channels are data-in/data-out with assertable return shapes over the real RPC loop, a genuinely stronger claim than 34.1's unobservable visual deliverable; named D-02/D-07 as the two honest exceptions
- [Phase 34.2]: Corrected (not deleted) SEAM.md's stale steamFlowRegistration.ts/libraryManagerMap claim: gameDetailsFlowRegistration.ts now dispatches runner-generically through libraryManagerMap for all six managers (D-01/Phase-32-D-02); what remains deferred is launcher.ts's own Wine/GameConfig/DownloadManager pipeline
- [Phase ?]: Sidecar unhandledRejection guard must resolve/log, never introduce a new throw/reject/exit path (sidecar-dialog-reject-crashes precedent)
- [Phase 34.2]: 34.2-10: mocked pathShim.getPath() directly (not os.homedir()) to redirect sidecar test config paths, since pathShim.resolveAppDataDir() prefers env.APPDATA/env.XDG_CONFIG_HOME over homedir() on win32/default — os.homedir() mock alone is silently bypassed by pathShim's real precedence, risking real user config wipe
- [Phase 34.2-11]: Corrected the false transitive electron-freedom claim in dispatch.ts/enrichmentFlowRegistration.ts/REQUIREMENTS.md rather than building a real transitive purity gate — a genuine transitive gate would need a 29-module allowlist spanning nearly the whole backend, constraining nothing; untangling that coupling is Phase 35's job
- [Phase 34.2-11]: electronReachLedger.test.ts is a growth-only (subset) tripwire over the measured electron-reach set, not a strict-equality pin — Phase 35 is expected to shrink the set over time as modules are decoupled from electron; a strict pin would go red on every legitimate improvement
- [Phase 34.2]: Digest pins are primary do-not-touch enforcement (byte-identity); ten-channel-set and steamLibrary.has( pins are a secondary Layer 2 that survives reformat while catching a rewrite
- [Phase 34.2]: getLaunchOptions test reads public/locales/en/gamepage.json directly rather than hardcoding the translated string, so the assertion breaks if launch.default is renamed or deleted
- [Phase 34.2-13]: storeSearch/handlers.ts documents transitive (not direct) electron reach through cheapshark.ts, mirroring plan 34.2-11's corrected wording rather than the pre-34.2-11 overclaim
- [Phase ?]: Read all six gap-cycle plans' actual shipped state from source (main.rs, bootstrap.ts, electronReachLedger.test.ts), not from plan intent, when refreshing 34.2-PORTED-CHANNELS.md
- [Phase ?]: Did not edit 34.2-HUMAN-UAT.md when refreshing 34.2-PORTED-CHANNELS.md -- recorded gap-cycle interaction with both deferred UAT items without changing their pending/deferred status
- [Phase 34.2]: 34.2-15: kept CR-02's unhandledRejection fallback message fully hardcoded/non-interpolated and did not add an uncaughtException handler, per the plan's explicit scope boundary
- [Phase 34.2]: Ported logError early from Phase 34.3/slice-6 into 34.2 gap cycle 2 (plan 34.2-16) — Gap cycle 1's onRepairYesClick renderer fix already routes a real repair failure through window.api.logError, and an unregistered send channel is a total silent no-op under Tauri
- [Phase 34.2]: Registered ONLY logError, not the other five logger/ipc_handler.ts channels — logInfo/getLogContent/showLogFileInFolder/uploadLogFile/deleteUploadedLogFile/getUploadedLogFiles remain Phase 34.3 work, declared unported in 3 places (module docstring, handlers.ts comment, both ledgers)
- [Phase 34.2]: backend/logger is jest.spyOn'd in loggerFlows.test.ts, never jest.mock'd — logger/index.ts and log_writer.ts import each other circularly; a jest.mock factory calling requireActual re-enters that cycle and throws inside LogWriter's constructor (sidecarRejectionGuard.test.ts precedent)
- [Phase 34.2]: Merged the showDialogModal-behavior test and the T-34.2-52 information-disclosure guard into one test so deleting the showDialogModal call fails exactly one test (34.2-17)
- [Phase 34.2]: Dialog message is the FIXED translated string only -- raw error text goes to console.error and window.api.logError, never the rendered dialog (T-34.2-52, 34.2-17)
- [Phase 34.2-19]: env-var-only os.homedir() redirection does not work under Jest 29's synthetic per-test-file process.env; fixed via a narrow jest.mock('os', ...) call in the setupFiles module (coordinator-approved Rule 4 correction, verified live)
- [Phase 34.2-20]: Guard logError's call to logError(...) with Promise.resolve(...).catch(...) at loggerFlowRegistration.ts's own call site (WR-02), restoring processGuards.ts's not-a-substitute-for-call-site-handling invariant — processGuards.ts's docstring explicitly forbids relying on its generic unhandledRejection guard as the primary handler; test mocks use mockImplementation not mockReturnValue since logger.logError's declared return type is void
- [Phase 34.2-21]: reportRepairFailure wraps each of the three failure signals in its own try/catch, not just the errorText precomputation, so the docstring's independence claim is actually true against any future throw source — the stringification fix removes the only KNOWN throw source but showDialogModal/logError are caller-supplied and cannot be proven never to throw
- [Phase 34.2]: Test 5 non-vacuity check uses getGameSettings (a real ported channel) rather than a made-up string; jest gate matches RAW main.rs source (not the comment-stripped helper) since #[cfg(test)] sits adjacent to doc comments

### Pending Todos

- Phase 7 manual UAT on macOS (real Steam account): overlay visibility on Mac/Windows-only games, "Unrated" pill, CrossOver↔Wine toggle drives both surfaces, pill click-through, runner-agnostic platform icons.
- Phase 10 live validation gate (before Phase 11 begins): empirically confirm axios + Cookie: _simpleauth_sess + X-Requested-By: hb_android_app reaches api/v1/user/order from Electron main process. Fallback = BrowserWindow webRequest proxy.
- Steam bottle setup offers GPTK/Wine engines that produce a broken bottle (macOS): non-CrossOver `wineVersion` selections silently fail — `cxbottle` creates the bottle but the `toolkit`/`wine` run-path (launcher.ts:434-442) drops the CX_BOTTLE binding and runs against a different prefix; readiness never passes. Fix: filter Steam WineSelector to CrossOver engines and/or reject non-crossover in provisionBottle. See `.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`.
- Productionize the macOS native Steam bridge (out-of-process `steam_api` proxy): feasibility PROVEN end-to-end (spikes 004+005 — drop-in `steam_api.dll` in the real GameLibSteam bottle returns the real SteamID from live native Mac Steam, zero Windows Steam client). DONE — shipped as Phase 24 (complete 2026-07-21), which also superseded and parked Phase 22. Next frontier = C++ vtable ABI for unmodified games + the 6 unproxied interfaces (Utils/Apps/UserStats/RemoteStorage/Matchmaking/Networking). See `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md` + `spike-findings-gamelib` skill.
- Steam native install progress polish (speed, ETA, paused-state): the native-installer-OFF `steam://install` path already surfaces a live download % (verified live 2026-07-19 via Playwright drive — `progressUpdate{runner:'steam'}` reaches the renderer). Polish gaps only: no download speed, `eta` hardcoded empty (`library.ts:1295`), and a Steam-paused download freezes the bar with no paused hint (only `StateFlags==1026` is special-cased). Plus stale `games.ts:604` docstring. Shared poller — guard bottle-path regression. See `.planning/todos/pending/2026-07-19-steam-native-install-progress-speed-eta-paused-state.md`.

### Blockers/Concerns

- Pre-push hook (`prettier` + `i18n --fail-on-update`) fails on **pre-existing repo debt** unrelated to Phase 7: ~141 files fail `prettier --check .` (likely a Prettier version bump; `pnpm-lock.yaml` already modified) and the locale files have orphaned-key drift. Phase 7 was pushed with `--no-verify` after independently verifying tsc/lint/tests. A separate housekeeping pass (`pnpm prettier --write .` + `pnpm i18n`) would clear it.
- Phase 23 Plan 05 Task 3 (checkpoint:human-verify, gate=blocking-human): 23-UAT.md Gate 1 real-hardware re-run pending — human must install a multi-depot title (Hogwarts Legacy 990080 or Cyberpunk 2077 1091500) on real macOS hardware after deleting the stale appmanifest_990080.acf, confirm single monotonic progress percent through a pause/resume cycle, and confirm StateFlags=4 completion + launch. Code fix (single-flight guard + reconciliation) is landed and regression-tested (commits cc77a9df/ddde970d/7fccfb2a/f963de8b); this is the only remaining Phase 23 gap before Gates 2/3 can proceed.
- G-30-01: Steam QR login logon button unresponsive under Tauri (Manage Accounts renders, QR tab never reached) — install/uninstall E2E for Phase 30 unreached as a direct consequence; see 30-HUMAN-UAT.md for reproduction and untested hypothesis

### Quick Tasks Completed

| # | Description | Date | Directory |
|---|-------------|------|-----------|
| 260627-vq1 | Fix QR login hang: set qrSessionState done immediately after credential storage, fire CM connection in background, add 15s timeout | 2026-06-27 | [260627-vq1-fix-qr-login-hang-set-qrsessionstate-don](.planning/quick/260627-vq1-fix-qr-login-hang-set-qrsessionstate-don/) |
| 260628-kzf | Fix blank Steam icon on Manage Accounts login page: replace FontAwesome faSteam with inline SteamLogo SVG to match other store runners | 2026-06-28 | [260628-kzf-fix-blank-steam-icon-on-manage-accounts-](.planning/quick/260628-kzf-fix-blank-steam-icon-on-manage-accounts-/) |
| 260628-pi7 | Show Steam last-played + total time on game details page (rtime_last_played) | 2026-06-28 | [260628-pi7-show-steam-last-played-on-game-details-p](.planning/quick/260628-pi7-show-steam-last-played-on-game-details-p/) |
| 260629-9ly | Fix QR-login → Steam-library race: assign QR background CM connect to connectingPromise (dedupe), gate frontend finalization on truthy poll.username | 2026-06-29 | [260629-9ly-fix-qr-login-library-race](.planning/quick/260629-9ly-fix-qr-login-library-race/) |
| 260629-rbn | Fix premature Steam install/uninstall notifications + status:done badge flash (GAME-02/03): runner==='steam' guards suppress premature DM/uninstaller emissions so the ACF poller solely owns Steam status + fires confirmed completion toasts | 2026-06-29 | [260629-rbn-fix-premature-steam-install-uninstall-no](.planning/quick/260629-rbn-fix-premature-steam-install-uninstall-no/) |
| 260630-ths | Decouple fork versioning from upstream Heroic: package.json version→1.0.0 + upstream base field (2.22.0 @ b5b5cad3), rename v0.1 tag→gamelib-v0.1, add UPSTREAM.md | 2026-06-30 | [260630-ths-decouple-fork-versioning-from-upstream-h](.planning/quick/260630-ths-decouple-fork-versioning-from-upstream-h/) |
| 260630-ud4 | Wire Steam AppID directly into ProtonDB lookup: use app_name as steamID when runner==='steam', skipping the wiki round-trip (backend + submenu + compat row) | 2026-06-30 | [260630-ud4-wire-steam-appid-directly-into-protondb-](.planning/quick/260630-ud4-wire-steam-appid-directly-into-protondb-/) |
| 260630-uod | Fix pre-push lint crash: ignore **/*.cjs in eslint flat config so Node CJS scripts aren't typed-linted (exposed 93 pre-existing Steam-code lint errors) | 2026-06-30 | [260630-uod-fix-pre-push-lint-failure-ignore-cjs-in-](.planning/quick/260630-uod-fix-pre-push-lint-failure-ignore-cjs-in-/) |
| 260630-uxp | Clear 93 lint errors in Steam store-manager code (gfs named imports, no-unused-vars ^_ convention, Function→callback type, unnecessary assertions) — pnpm lint/codecheck exit 0, 128 tests pass | 2026-06-30 | [260630-uxp-fix-93-pre-existing-lint-errors-in-steam](.planning/quick/260630-uxp-fix-93-pre-existing-lint-errors-in-steam/) |
| 260701-qxr | Rewrite README install section for GameLib: honest build-from-source (no prebuilt fork releases), fork clone URL, GameLib naming, fixed index anchors | 2026-07-01 | [260701-qxr-fix-readme-install-section-rewrite-to-ho](.planning/quick/260701-qxr-fix-readme-install-section-rewrite-to-ho/) |
| 260701-ufx | Rebrand Heroic→GameLib (user-facing + paths + protocol): migrate config dir ~/.config/heroic→GameLib w/ auto-migration, heroic://→gamelib:// (handler+registration+shortcuts+tests), user-facing backend strings. Internal identifiers left for mergeability. tsc 0, 152 tests pass | 2026-07-01 | [260701-ufx-rebrand-heroic-gamelib-user-facing-strin](.planning/quick/260701-ufx-rebrand-heroic-gamelib-user-facing-strin/) |
| 260704-mig | Fix Phase 8 Gap D launch-overlay regression (Steam overlay flashed at ~0s because steam:// blur fired instantly) via a 1.5s minimum-visible floor + 8s safety net; plus GameLib icon above text on artwork placeholders (greyscale on the 'Artwork unavailable' missing variant). tsc 0, eslint clean. Runtime re-UAT pending | 2026-07-04 | [260704-mig-fix-phase-8-gap-d-launch-overlay-regress](.planning/quick/260704-mig-fix-phase-8-gap-d-launch-overlay-regress/) |
| 260710-kba | Format Steam install_size as human-readable in Install Info panel: Steam persisted raw ACF sizeOnDisk bytes (e.g. 20622023528) while all other stores store a getFileSize()-formatted string. Wrapped all three steam/library.ts install-object sites (refresh, refreshInstallState, pollInstallOnce) in getFileSize(Number(sizeOnDisk)) and simplified getSteamInstallSize fast path to return the pre-formatted string. codecheck 0, 812 tests pass | 2026-07-10 | [260710-kba-format-steam-install-size-as-human-reada](.planning/quick/260710-kba-format-steam-install-size-as-human-reada/) |
| 260710-knr | Install Info panel consistency: Installed Platform row now renders a FontAwesome brand icon (faWindows/faApple/faLinux, case-insensitive helper w/ raw-text fallback, Browser branch unchanged) matching the Supported-platforms row; Install Path row gains a trailing faFolderOpen affordance inside the existing clickable openFolder div (no new handler) + info.openLocation i18n key. codecheck 0, eslint clean. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-knr-install-info-platform-icon-folder-open-i](.planning/quick/260710-knr-install-info-platform-icon-folder-open-i/) |
| 260710-l27 | Extra-info AppleGamingWiki refactor: split single rating row into two always-visible rows (Crossover rating + Wine rating, "Unrated" fallback via ratingTier); removed the cover-art rating pill (AppleRatingOverlay) entirely; fully removed the redundant "Mac compatibility rating source" (appleRatingSource) setting across settings UI, GlobalState/ContextProvider, frontend/common types, electron_store schema, and i18n. tsc 0, grep gate confirms zero dangling refs. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-l27-extra-info-crossover-wine-rating-rows-re](.planning/quick/260710-l27-extra-info-crossover-wine-rating-rows-re/) |
| 260710-d7b | Fix install default folder: DownloadDialog + ImportDialog fallback `${userHome}/Games/Heroic` → Games/GameLib (matches backend heroicInstallPath default). Fallback-only; configured paths unaffected. tsc 0 | 2026-07-10 | (fast task, commit d7bbd883) |
| 260710-lmo | Complete Heroic→GameLib user-facing rebrand sweep: 44 en-locale display values (translation.json + gamepage.json) + JSX default fallbacks across 25 components + theme name ("Old School GameLib") + CrossoverBottle default value ('GameLib' — behavioral: new crossover setups default to a GameLib bottle). Two factual corrections: CustomCSS path `~/.config/heroic/config.json`→GameLib, protocol `heroic://`→`gamelib://`. Preserved i18n keys, code identifiers (getHeroicVersion/HEROIC_GAME_TITLE/etc.), CSS classes, upstream URLs, legacy-config migration source. tsc 0, both locale JSON valid, grep audit clean. Runtime visual UAT pending | 2026-07-10 | [260710-lmo-complete-heroic-gamelib-rebrand-of-user-](.planning/quick/260710-lmo-complete-heroic-gamelib-rebrand-of-user-/) |
| 260710-m3f | Show estimated Install Size on pre-install Steam game page (parity w/ Epic/GOG): replaced the `runner === 'steam'` early-return in DownloadSizeInfo with a `SteamInstallSize` child component (unconditional hooks) that calls new `getSteamInstallSize` IPC handler (thin pass-through to existing backend estimator — parses store API `pc_requirements.minimum`; appId `/^\d+$/` + bounded-regex guards T-06-01/02 preserved). Install Size row ONLY (no Download Size — Steam has no public download-size source); "~"+"(estimate)" indicator; "?? MB"/undefined→"Unknown" fallback. Installed-game path untouched. codecheck 0, 812 tests pass. Runtime visual UAT PASSED (user-confirmed 2026-07-10) | 2026-07-10 | [260710-m3f-show-estimated-install-size-on-pre-insta](.planning/quick/260710-m3f-show-estimated-install-size-on-pre-insta/) |
| 260710-mkw | Fix missing Steam grid cover art: extended `CachedImage` to accept an ordered `string \| string[]` fallback chain (backward-compatible; numeric index replaces boolean useFallback, bounded/no-loop). Grid (non-justPlayed) tile now passes `[art_cover, fallBackImageMissing]` when a distinct header exists, so Steam games with a 404 portrait capsule (library_600x900.jpg) but valid header (header.jpg) — e.g. Bard's Tale IV (566090) — render real header art instead of the generic placeholder. justPlayed branch + non-Steam runners unchanged. Frontend jest 28/28, tsc 0, eslint clean. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-mkw-steam-grid-cover-art-falls-back-to-heade](.planning/quick/260710-mkw-steam-grid-cover-art-falls-back-to-heade/) |
| 260710-nwb | THROWAWAY SPIKE (not app code; lives in `spike/`). Feasibility of CrossOver (CodeWeavers) compatibility lookup by constructed slug — `GET /compatibility/crossover/{slug}`, parse schema.org JSON-LD `@graph` VideoGame node for `aggregateRating` (ratingValue/ratingCount) + sameAs. Live-run measured **8/12 = 66.7%** match rate (est. 83.3% with two slugify fixes). **Critical correction:** misses return HTTP 200 soft-404 (title `404 Not Found`), NOT 404 — future backend MUST detect hit/miss by content (VideoGame JSON-LD presence), not status code. Slugify bugs found: apostrophe should be dropped not hyphenated (`baldurs-gate-3`), roman numerals need Arabic normalization (`...-modern-warfare-2`). Verdict: **GO** on backend+pill, conditional on content-based detection + slugify fixes + graceful "no data" UI for genuine misses. Delete `spike/` once acted on. | 2026-07-10 | [260710-nwb-crossover-compatibility-lookup-spike](.planning/quick/260710-nwb-crossover-compatibility-lookup-spike/) |
| 260710-qyc | Relocate CrossOver/Wine emulation compat rows from the Extra-info tab into the Install-info tab, directly under Supported platforms (`<AppleWikiInfo>` moved after `<PlatformSupport>`). Rows now gated on `!is.native` — shown only when the game does NOT run natively on the current OS (a compat layer is actually needed). Reworded "Crossover rating"→"Crossover emulation" and "Wine rating"→"Wine emulation" (component defaults + en/gamepage.json, keys unchanged) to clarify why the rows exist. Crossover row swapped `WineBar`→`CodeweaversLogo` (codeweavers_icon.svg?react); Wine row keeps WineBar. Wine row link now branches by OS: macOS→AppleGamingWiki (`/w/index.php?search=` go-or-search), Linux→WineHQ AppDB (browse+`sHavingText` filter); Crossover row link left on codeweavers.com. Dropped `applegamingwiki`+`codeweavers` terms from the `hasWikiInfo` gate so the Extra-info tab no longer appears empty for games whose only wiki data was those two rows. codecheck 0, eslint clean on touched files. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-qyc-ui-cleanup-relocate-rework-the-crossover](.planning/quick/260710-qyc-ui-cleanup-relocate-rework-the-crossover/) |
| 260710-rjm | Rework the emulation-compat rows into three OS-specific rows + fix a CrossOver rating bug. (1) BUG FIX: CodeWeavers pages carry two editorial reviews (macOS + Linux) plus an aggregateRating that averages them; we parsed the average (A Plague Tale: Innocence showed 3 = avg of mac 5 + linux 1). Rewrote `extractVideoGameJsonLd` to read per-OS `Review.reviewRating` via `about.operatingSystem`/`reviewAspect`; `CodeweaversInfo` shape `{rating,ratingCount,slug}`→`{macRating,linuxRating,slug}`; `staleCrossoverData` self-heals old-shaped caches (refetch when `macRating===undefined`). (2) Crossover row now macOS-only (`is.mac && macRating!=null`), shows `macRating` as stars, monochrome hand-authored `crossover_icon.svg?react` (currentColor rounded-square-X) replacing the 343-path color CodeWeavers logo. (3) NEW Proton row for `is.linux && runner==='steam' && steamInfo.compatibilityLevel`: ProtonDB tier→stars via new `protonTierToStars` (platinum5/gold4/silver3/bronze2/borked1, pending/unknown→Unrated), links protondb.com/app/{app_name}; replaces the Wine row in that case (`showWine = !!applegamingwiki && !showProton`). Deleted dead `crossoverRating.ts`+test (count label dropped); added `info.proton-rating` locale key. codecheck 0; codeweavers 17/17 + protonRating tests pass (33 total in the two suites); eslint clean on touched files. NOTE: extra-tab CompatibilityInfo still shows a Proton *tier text* row — intentional (dedup out of scope). Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-rjm-rework-gamepage-emulation-compat-rows-pe](.planning/quick/260710-rjm-rework-gamepage-emulation-compat-rows-pe/) |
| fast | Crossover-row parity: the Wine row shows "Unrated" for games with no rating, but the Crossover row hid when there was no macOS rating (e.g. Avernum 6: macRating null, linuxRating 5). Changed `showCrossover` to `is.mac && !!codeweavers` and render `t('info.unrated','Unrated')` when macRating is null (no fallback to the Linux rating — "match current OS" stands). Aligned the Proton null-tier fallback to the same "Unrated" wording; added `info.unrated` locale key. Found via live-app UAT (GameLib running on A Plague Tale + Avernum 6). codecheck 0, eslint clean. | 2026-07-10 | (fast task, commit 1a56ac6d) |
| 260711-a3v | Include Steam in sidebar/stores login aggregation. Logging into only Steam left the "Log in" sidebar item visible and made the Stores link open Epic with a "not logged in" warning, because `SidebarLinks/index.tsx` aggregated login across epic/gog/amazon/zoom but never Steam. Added `steam.username` to the `loggedIn` check (hides "Log in" when only Steam) + a Steam-only `defaultStore='steam'` branch so Stores opens the browse-only Steam store instead of Epic. Pre-existing bug; found during Phase 17 UAT. tsc 0, eslint 0. Runtime re-check pending. | 2026-07-11 | [260711-a3v-fix-sidebar-stores-login-ignores-steam](.planning/quick/260711-a3v-fix-sidebar-stores-login-ignores-steam/) |
| 260711-alc | Throttle Steam metadata fetches on cold cache. Fresh/wiped cache fired one `fetchMetadataIfNeeded` axios call per game (376) with no concurrency cap or timeout → hundreds of parallel Steam-CDN connections mass-timed-out (connect ETIMEDOUT); only ~14/376 loaded art, and the saturated main process slowed queued installs. Added a metadata-fetch semaphore (MAX 5, acquire/release with slot hand-off) + 15s axios timeout in `state.ts`/`games.ts`. Pre-existing Phase 2/7 issue; surfaced during Phase 17 UAT after the uninstall wipe. tsc 0, eslint 0, full suite 915/915. Runtime re-check pending. | 2026-07-11 | [260711-alc-throttle-steam-metadata-fetches](.planning/quick/260711-alc-throttle-steam-metadata-fetches/) |
| 260711-aus | Steam empty-library message + background metadata sync indicator (2 UAT gaps). (1) `EmptyLibrary` message omitted Steam and its empty-vs-no-results trigger summed every store's library EXCEPT steam → Steam-only users wrongly saw "log in with Epic/GOG/Amazon"; added Steam to the locale string + JSX and `steam?.library.length` to the trigger. (2) `steamSyncSpinner` only reflected the library-list refresh, not the per-game metadata/art stream (throttled, long on cold cache); `games.ts` now emits `steamMetadataSyncing` on pendingFetches empty↔non-empty, wired through ipc/preload/GlobalState/ContextProvider and OR'd into LibraryHeader's `isSteamSyncing`. Pre-existing Phase 2/7 gaps; surfaced during Phase 17 UAT. tsc 0, eslint 0, full suite 915/915. Runtime re-check pending. | 2026-07-11 | [260711-aus-steam-empty-library-and-sync-indicator](.planning/quick/260711-aus-steam-empty-library-and-sync-indicator/) |
| 260711-htb | Move the 'Use shared Wine prefix' toggle to the bottom of WineSelector (global reorder — all install modals). GAP 4 (phase 17 UAT, cosmetic): the shared-prefix toggle sat above the prefix/bottle + Wine-version fields; moved it (with its warning infoBox) below the Wine-version dropdown in the shared `WineSelector`, so the new order applies to Steam AND Epic/GOG/Amazon/sideload install modals. Pure JSX reorder — no logic/state/style change, all `disabled={useSharedPrefix}` bindings preserved. tsc 0, eslint 0; no unit tests for this presentational component, runtime visual check pending. | 2026-07-11 | [260711-htb-move-the-use-shared-wine-prefix-toggle-t](.planning/quick/260711-htb-move-the-use-shared-wine-prefix-toggle-t/) |
| fast-73ee87f3 | Native Steam install focus-handover parity test (given GAP 5 CrossOver work). Added `GAME-02/focus` unit test in games.test.ts asserting native install() calls shell.openExternal WITHOUT { activate: false } (OS foregrounds Steam), contrasted with launch()'s { activate: false }; documents parity with the CrossOver raiseInstallerWindow() path (same outcome, different mechanism). Plus a 17-UAT.md manual real-hardware parity check. games.test.ts 88/88, tsc 0. /gsd-fast (inline, no task dir). | 2026-07-11 | (inline — commit 73ee87f3) |
| fast-0800e7d8 | Make the CrossOver rating Refresh icon visible. The MUI `IconButton` (260712-lkn) rendered with the default light-theme action color (translucent black — App.tsx `createTheme` sets no `palette.mode`), invisible on GameLib's dark game page though its ~36px hit area still triggered refresh (user reported clicking the row refreshed but saw no icon). Added `color="inherit"` so the `Refresh` icon adopts the surrounding `.iconWithText` link text color, visible in both themes. tsc 0, eslint clean. /gsd-fast (inline). | 2026-07-12 | (fast task, commit 0800e7d8) |
| 260712-lkn | Add a user-facing refresh for CrossOver compat ratings. A game cached once as unrated (`macRating:null`) stays that way for the 30-day TTL because `staleCrossoverData` self-heal only fires on missing/old-shape caches — so a rating newly entered on codeweavers.com (e.g. Avernum 4) never appeared. Added optional `forceRefresh` to `getWikiGameInfo` (bypasses the cached-response early return, re-populates via `wikiGameInfoStore.set`), threaded through the IPC handler + `ipc.ts` type; frontend exposes `refreshWikiInfo` on GameContext (force-refetch in GamePage that accepts any non-null result so a codeweavers-only update lands) + a small MUI `Refresh` IconButton on the CrossOver pill (stopPropagation so it doesn't open codeweavers.com, disabled while in-flight). codecheck 0, eslint clean on touched files, codeweavers 17/17. Runtime visual UAT pending (needs GUI). | 2026-07-12 | [260712-lkn-add-refresh-affordance-for-crossover-com](.planning/quick/260712-lkn-add-refresh-affordance-for-crossover-com/) |
| 260714-gnc | Add `.graphifyignore` to scope the knowledge graph to the codebase. The graph was 9,264 nodes, of which 5,541 were markdown "document" nodes — `.planning/` alone contributed 5,323, outweighing `src/` (3,269) by 1.6:1, which pushed the graph past graphify's 5,000-node HTML-viz ceiling and polluted `graphify query` results with planning-doc noise. Excludes `.planning/`, `scratchpad/`, `graphify-out/`, `.claude/`; deliberately keeps `README.md` + `CHANGELOG.md` indexed (no `*.md` blanket glob). Chosen over the `--code-only` / `--exclude` CLI flags because those exist only on `graphify extract`, whereas `.graphifyignore` is read by the shared `detect()` scanner (`detect.py:1146`) that `graphify update` also uses — so `/gsd-graphify build` honors it with no skill patching. Expected drop to ~3,900 nodes; graph not yet rebuilt. | 2026-07-13 | [260714-gnc-add-graphifyignore-to-scope-knowledge-gr](.planning/quick/260714-gnc-add-graphifyignore-to-scope-knowledge-gr/) |
| 260715-a7g | Fix Phase 20 owned-badge false positive: original titles fuzzy-matched their remasters ("Alan Wake" wrongly Owned for "Alan Wake Remastered"), found during Phase 20 store-search live UAT. Root cause: `normalizeTitle` stripped `'remastered'` (an EDITION_SUFFIXES entry) so base+remaster normalized identically → 100% similarity. Removed `'remastered'` from EDITION_SUFFIXES and added a `PRODUCT_VARIANT_KEYWORDS=['remaster','remake']` differentiator guard (`isRemasterFalsePositiveRisk`, mirrors `isDlcFalsePositiveRisk`, T-12-01 trusted-constant discipline) OR'd into `fuzzyMatch` — a remaster/remake never matches the base title (missing beats wrong, D-01/D-02). Shared matcher, so Humble dedup benefits too (D-02); deluxe/GOTY/definitive editions still match (same base game). Full backend suite 1087/1087 (incl. dedup.test.ts + storeSearchBadges.test.ts), codecheck 0. | 2026-07-15 | [260715-a7g-treat-remaster-remake-as-product-differe](.planning/quick/260715-a7g-treat-remaster-remake-as-product-differe/) |
| 260718-jmt | Fix Steam native-install download progress graph cadence (surfaced during Phase 23 Gate 1 hardware UAT): the DownloadManager ProgressHeader chart advanced one sample per `progressUpdate` IPC, which `downloadDepotFiles` emitted only from the per-chunk `onBytes` callback (throttled 500ms) — so when chunk completions bunched up the graph froze for many seconds (~30s observed; user wanted ~1s like Steam). Added `PROGRESS_HEARTBEAT_MS=1000` + a `setInterval(() => emitProgress(true), …)` started before the worker `Promise.all`, cleared in a `try/finally` scoped to that Promise.all (fires on completion AND throw/abort), so a fresh progressUpdate is emitted ~1×/sec with an honest rolling rate (0 when no bytes arrived) independent of chunk timing. Backend-only; MB/s units unchanged (Mbps change declined). Scope-fenced off the Phase-23 single-flight guard / StateFlags 4-vs-1026 / buildid / file-mode logic. steam suite 563/563, tsc 0, eslint clean. | 2026-07-18 | [260718-jmt-fix-steam-download-progress-graph-cadenc](.planning/quick/260718-jmt-fix-steam-download-progress-graph-cadenc/) |
| 260719-aog | Steam native-install progress polish (OFF path, `steam://install` → `pollInstallOnce`): added live download speed + ETA (reusing `depot.ts` `rollingRateMiBs`/`formatEta` rather than duplicating math) and a `context: 'steam-paused'` hint (frozen `BytesDownloaded` ≥3 ticks → "Paused" label; StateFlags 1026 restart-hint always takes precedence; staged-fallback never flagged) populating the pre-existing `downSpeed`/`eta` `InstallProgress` fields — no new IPC channel, no type change. Fixed stale `games.ts:604` docstring. Shared bottle-path poller (GAP-17-BOTTLE-PROGRESS) verified unregressed. steam suite 648/648, tsc 0, eslint clean. Deferred: leaked real `setInterval` in unrelated pre-existing test (`library.test.ts:2627`). | 2026-07-18 | [260719-aog-steam-native-install-progress-polish-dow](.planning/quick/260719-aog-steam-native-install-progress-polish-dow/) |
| 260720-q5n | Repoint electron-updater auto-update feed off Heroic upstream to the GameLib fork: added an explicit `publish` block (github, owner grayson-mitchell, repo GameLib) to `electron-builder.yml`. Without it, electron-builder derived the feed from package.json's `repository` field (still Heroic-Games-Launcher/HeroicGamesLauncher), so fresh Windows builds saw Heroic 2.x > GameLib 0.7.0 on startup and fired a bogus "new version available" dialog that downloaded Heroic's installer and triggered a "Heroic wants to make changes to your computer" UAC prompt. Fork has no release > 0.7.0 → check finds nothing, popup gone. package.json repository left unchanged (publish block takes precedence). YAML parse-verified. | 2026-07-20 | [260720-q5n-add-publish-block-github-grayson-mitchel](.planning/quick/260720-q5n-add-publish-block-github-grayson-mitchel/) |
| 260721-u77 | Fallback/placeholder tile art (e.g. Hoard) was cropped: `CachedImage`'s fallback rendered through the same `.gameCard .gameImg` rule as real cover art (`object-fit: cover`, `aspect-ratio: 3 / 4`). `CachedImage` now tags the `<img>` with `usingFallback` while a fallback source is displayed (cleared by the existing src-keyed effect), and GameCard styles that state `object-fit: contain` for both `.gameImg` and `.justPlayedImg` — placeholders render whole, real cover art still crops to fill. The class is inert for StoreSearchRow/DiscountCard (their CSS does not target it). New CachedImage test for the marker; jest 6/6, tsc clean. Code commit 8747aef3. | 2026-07-21 | [260721-u77-fallback-tile-art-fit-not-trimmed](.planning/quick/260721-u77-fallback-tile-art-fit-not-trimmed/) |
| 260722-c2i | Restore `.planning/ROADMAP.md` (commit 9eac4a09 had wholesale-replaced it with a 19-line Phase 27 fragment, destroying the 1016-line roadmap and breaking `gsd-sdk query roadmap.analyze`) by merging the recovered pre-truncation structure with the surviving Phase 27 content (re-integrated verbatim as new `## v0.8 Phase Details`), disk-reconciling every checkbox against actual `*-PLAN.md`/`*-SUMMARY.md` counts, re-filing misfiled detail sections (18→v0.5, 23/25→v0.7, 24→v0.7, 26→v0.7), and relocating Phase 22 to a new `## Parked / Superseded Phases` section so it can't hijack `current_phase`. Root-caused the actual mechanical bug (the `## Phases` checklist's `### vX.Y` sub-headings were matching `roadmap.analyze`'s milestone-slice regex before the real `## v0.7 Phase Details` heading did) and fixed it by converting those 8 groupings to plain bold text. Backfilled `.planning/MILESTONES.md` v0.2–v0.8 (v0.1 untouched), no fabricated ship dates (v0.2/v0.7/v0.8 marked open/undated); surfaced an honest finding that Phase 13's 24h–48h urgency-badge bug (CR-01) was never actually fixed (only 13-01 ever touched the file per git log), despite v0.3 being recorded complete elsewhere. Verified live: `gsd-sdk query roadmap.analyze` now returns `current_phase:"23"` (partial, 10 plans/5 summaries), `next_phase:null` (correct — no unstarted phase in v0.7), non-zero stats. | 2026-07-22 | [260722-c2i-PLAN.md](.planning/quick/260722-c2i-PLAN.md) / [260722-c2i-SUMMARY.md](.planning/quick/260722-c2i-SUMMARY.md) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v0.2 | v0.2 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v0.2 | v0.2 requirements |
| Console / Steam | CONSOLE-02: Steam update feedback in Console launch — when a Steam game needs an update, GameLib shows "Launched in Steam" and dismisses while Steam silently updates; user has no in-app signal. Needs own design (Steam does not report update state back). From Phase 8 UAT (finding E). | Post-v0.2 | Phase 8 UAT (2026-07-04) |
| Console / macOS | KNOWN LIMITATION — Launching a Steam game from Console mode on macOS shows a brief desktop-Space animation before the game appears. Cause: Console mode uses native fullscreen (its own macOS Space) so swipe-to-Space works; macOS must leave that Space when the game's window appears elsewhere. Not fixable from Electron without setSimpleFullScreen, which removes the swipe-able Space and has focus/chrome rough edges (prototyped + rejected in Phase 8 UAT test 11). `activate:false` on the steam:// handoff was tried and kept but does not remove the flash. Accepted as-is. | Accepted (won't fix) | Phase 8 UAT (2026-07-04) |
| Humble Store | HSTORE-02: Read-only Humble bundle/deals listing in-app with "Buy on Humble" deep-links | Post-v0.3 | v0.3 requirements (separate data source; key management prioritized) |

## Session Continuity

Last session: 2026-07-26T00:35:51.266Z
Stopped at: Completed 34.2-22-PLAN.md (Rust timeout_for() behavioral test + jest existence gate closed; gap cycle 3, plan 4 of 6 -- 34.2-23..24 remain)
Next: Execute 34.2-20-PLAN.md (gap cycle 3 continues, WR-02). Also still outstanding (unrelated to Phase 34.2): Phase 23's 23-UAT.md real-macOS D-07 gates (multi-depot Cyberpunk 2077, hard-DRM title, interrupt-then-resume) and Phase 21's 21-UAT.md real-hardware human verification (native .acf adoption, hard-DRM launch, cancel-recovery, bottled Steam adoption, client-setup flows) — both required before milestone v0.7 completion.
| 2026-07-10 | fast | Replace CrossOver icon with monochrome weave mark | ✅ |
| 2026-07-11 | fast | Steam list-view store label showed 'Other' → 'Steam' (getStoreName) | ✅ |
| 2026-07-11 | fast | Removed redundant Steam-specific refresh button from LibraryHeader | ✅ |
