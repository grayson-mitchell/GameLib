# Deferred Items — Phase 34.2

Out-of-scope discoveries logged during plan execution per the executor's scope-boundary rule
(fix only what the current task's changes directly caused; log everything else here instead
of fixing it inline).

## From plan 34.2-03

- **Pre-existing eslint error in `src/backend/crossover_index/__tests__/index.test.ts:29`**
  (`@typescript-eslint/no-unnecessary-type-assertion`) — confirmed pre-existing via
  `git stash` + re-run (present before any of this plan's edits, in a file this plan never
  touches). Out of scope for 34.2-03's Task 2 eslint acceptance criterion, which only covers
  `launcher.ts`, `knownFixes.ts`, `crossover_index`, and `main.ts` as a group; the pre-existing
  error sits inside that directory group but predates this plan and is unrelated to the D-06
  extraction. Not fixed here.

## From plan 34.2-07

- **Pre-existing leaked-timer crash in `src/backend/storeManagers/steam/library.ts`'s
  `pollInstallOnce`, blocking a clean `pnpm test:ci` run.** This plan is documentation-only
  (`git diff --stat` across all three of its commits touches only
  `34.2-PORTED-CHANNELS.md`/`34.2-HUMAN-UAT.md`/`34.2-VALIDATION.md`/`SEAM.md` — zero source
  files), and `library.ts`'s last touching commit (`f78bb576`) predates this phase by several
  phases. Confirmed via `git log -- src/backend/storeManagers/steam/library.ts`. Under
  `--runInBand`, a `setTimeout` started by `library.test.ts`/`reconcile.test.ts`/
  `clientSetup.test.ts` (one of the suites exercising `pollInstallOnce`) survives its own test's
  teardown and fires later in the same process, after the mocked `getSteamLibraries` has been
  reset to `undefined` by a later suite — `readAcfState` then throws
  `TypeError: Cannot read properties of undefined (reading 'map')` inside a bare `Timeout`
  callback, an uncaught exception that aborts the whole `--runInBand` Node process
  (`ELIFECYCLE exit 1`), not a normal test failure. Reproduced identically on two consecutive
  runs, and reproduces even with `library.test.ts` excluded (`--testPathIgnorePatterns`) —
  another suite exercising the same poll path triggers it just as reliably, confirming this is
  systemic to `library.ts`'s poll timer teardown, not one specific test file. This matches a
  previously documented, already-known project issue ("known separate library.ts leaked-timer
  jest exit-1", recorded in this project's own memory from the `fix/steam-native-install-stability`
  branch's earlier work). Out of scope for a documentation-only plan to fix. **Alternative
  verification performed instead:** the phase's own targeted cross-file sweep (7 suites, 152
  tests: `gameDetailsFlows|enrichmentFlows|bootstrapWirings|gameDetailsImportGate|
  gameDetailsModules|knownFixes|longRunningChannels`) is green; `npx tsc --noEmit` is clean;
  `cd src-tauri && cargo check --quiet` is clean. `pnpm test:ci`'s full-suite green requirement
  in this plan's own `<verification>` section could not be satisfied end-to-end due to this
  pre-existing, unrelated defect — recorded here rather than silently claimed passing.

## From the phase-level post-merge test gate (orchestrator, /gsd-execute-phase 34.2)

- **Pre-existing FAILING test: `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` →
  "writes a single well-formed rustInvoke frame for an allowlisted channel".** The assertion
  `expect(rustInvokeLines).toHaveLength(1)` receives 2 frames: the expected
  `keyring_get` plus an unexpected `tray_set_icon` frame (`{"dark":false}`). Confirmed
  **pre-existing and NOT introduced by phase 34.2**: bisected by checking out `src/backend`
  at `4e6e9de4` (the last commit before any 34.2 execution work) and re-running the suite in
  isolation — it fails there byte-identically (1 failed, 7 passed), then the tree was restored
  to HEAD clean. Fails deterministically in isolation, so it is not test-ordering pollution.
  Provenance points at phase 34.1's tray work (`34.1-06`, "real Tauri tray — tray_set_icon
  rustInvoke arm + changeTrayColor registration"): **phase 34.1 was marked COMPLETE with this
  test red.** Full backend suite otherwise green at end of 34.2: 105/106 suites, 2211/2212
  tests passing. Out of scope for 34.2 to fix — belongs to a 34.1 gap-closure cycle or a
  standalone fix. Flagged to the user in the phase-completion report.

## From plan 34.2-18 (gap cycle 2, CR-03/WR-01 closure)

- **11 other sidecar suites lack the `pathShim`/`backend/logger/paths` containment kit.**
  `testContainment.test.ts`'s Block B gate holds exactly four suites
  (`gameDetailsFlows.test.ts`, `enrichmentFlows.test.ts`, `sidecarRejectionGuard.test.ts`,
  `loggerFlows.test.ts`) to the full four-part containment kit (`os` mock, `pathShim` mock,
  `backend/logger/paths` mock, and a `resolve`+`relative` tripwire covering
  `appFolder`/`userDataPath`/`fixesPath`/`getLogFilePath({})`). The following 11 sidecar
  suites also drive the REAL, unmocked `bootstrap.init()` and therefore carry the SAME
  pre-existing risk class this repo's own `tests-clobbering-real-steam-store` incident
  (commit `92c29a5e`) describes — an `os.homedir()` mock alone (or no redirect at all) does
  not guarantee containment on Windows/Linux, since `pathShim.resolveAppDataDir()` and
  `logger/paths.ts`'s `getBaseLogPath()` both prefer `env.APPDATA`/`env.XDG_CONFIG_HOME`/
  `env.XDG_STATE_HOME`/`env.LOCALAPPDATA` over `homedir()` on those platforms:
  `appShellFlows.test.ts`, `bootstrapWirings.test.ts`, `bootstrap.test.ts`,
  `downloadQueueFlows.test.ts`, `electronUntouched.test.ts`, `onlineMonitorWiring.test.ts`,
  `installFlows.test.ts`, `skeletonFlows.test.ts`, `settingsFlows.test.ts`,
  `rustInvokeChannel.test.ts`, `steamAuthFlows.test.ts`. This is pre-existing risk, not
  introduced by phase 34.2 — none of these 11 files were touched by this plan. Verified
  against the tree at execution time (2026-07-26): all 11 files exist under
  `src/backend/sidecar/__tests__/`, confirmed by `testContainment.test.ts`'s own
  anti-vacuity assertion (`KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES` has exactly 11 entries,
  every file exists). `testContainment.test.ts`'s own docstring states plainly that its gate
  does not cover these 11 files, so it cannot be misread as a directory-wide containment
  proof. Natural home for closing this debt: a small follow-up plan applying the same kit to
  each of the 11 files, or folded into Phase 35's broader Electron-cutover work. Not fixed
  here — out of scope for this plan's four named suites.

## From plan 34.2-19 (gap cycle 3, structural containment)

- **Re-observed: the pre-existing `library.ts` leaked-timer flake (see "From plan 34.2-07"
  above) intermittently lands on OTHER, unrelated suites, not only
  `rustInvokeChannel.test.ts`.** During this plan's Task 3 full-backend-project baseline
  reconciliation, `npx jest --testPathPattern=src/backend` was run 5 times: 4 runs showed the
  documented baseline exactly (111/112 suites, 2279/2280 tests, sole failure
  `rustInvokeChannel.test.ts`); 1 run additionally failed `enrichmentFlows.test.ts`
  (`TypeError: Cannot read properties of undefined (reading 'map')` inside
  `readAcfState`/`pollInstallOnce`, `storeManagers/steam/library.ts:1153`/`1306`); a
  subsequent single-run repro instead hit `bootstrapWirings.test.ts` (an unrelated JSON-content
  assertion) with the same leaked-`Timeout` root cause. This confirms the 34.2-07 entry's own
  prediction that the leak is "systemic to `library.ts`'s poll timer teardown, not one specific
  test file" — WHICH suite the leaked timer lands on depends on non-deterministic
  worker-to-file assignment (this plan does not use `--runInBand`), not on this plan's
  containment changes. `src/backend/storeManagers/steam/library.ts` was not touched by this
  plan (`git diff --stat` across all of plan 34.2-19's commits confirms zero changes to it or
  any of its tests). Reported to the user per this plan's own acceptance criterion ("the set of
  FAILING suites does not grow beyond `rustInvokeChannel.test.ts`" — satisfied on 4 of 5 runs;
  the 5th run's extra failure is this pre-existing, already-tracked defect surfacing on a
  different file, not a new regression). Not fixed here — same natural home as the 34.2-07
  entry (a standalone fix for `library.ts`'s poll-timer teardown).
