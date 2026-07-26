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

## From plan 34.2-18 (gap cycle 2, CR-03/WR-01 closure) — CLOSED by gap cycle 3

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

**RESOLVED 2026-07-26 by gap cycle 3, plan 34.2-19.** This debt is closed, not by applying the
four-part kit to each of the 11 files individually, but structurally: `src/backend/jest.setupContainment.ts`,
registered via the backend jest project's `setupFiles` entry in `src/backend/jest.config.js`,
redirects `os.homedir()` (a narrow `jest.mock('os', ...)` overriding only `homedir`) plus eight
HOME/XDG/APPDATA/LOCALAPPDATA environment variables for every suite under `src/backend` — including
`bootstrap.test.ts` and the other 10 named above — before any suite's own imports run. A suite is
now contained by existing under `src/backend`, not by carrying its own mock kit. Live evidence
(`34.2-19-SUMMARY.md`, "Live Destruction Check"): the real `~/Library/Logs/GameLib/gamelib.log`/
`.log.old` mtimes were byte-identical before and after a full `src/backend/sidecar/__tests__` run
with the fix in place (`Jul 26 11:42:53 2026` unchanged on both files across the run), directly
refuting the three independent live reproductions (`34.2-VERIFICATION.md`, 10:49 -> 10:56 -> 10:57
rotation) this entry originally recorded. Plan 34.2-23 subsequently deleted
`KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES` from `testContainment.test.ts` entirely (0 occurrences
remaining, including in prose) and replaced it with a `readdirSync`-derived set-equality tripwire
proving every `*.test.ts` file in the directory is classified — so a 12th suite added without
conscious classification cannot be silently invisible the way this hole was.

## From plan 34.2-20 (gap cycle 3, WR-02 closure)

**RESOLUTION NOTE, 2026-07-26 (gap cycle 4, plan 34.2-30):** this entry is superseded, not
duplicated, by **D4-DEF-01** below. Plan 34.2-26 (gap cycle 4) added `logErrorSettled`, a
promise-returning sibling of the block-body `logError` wrapper this entry describes, and rewired
`loggerFlowRegistration.ts`'s call site to use it — closing the specific consequence this entry
warned about (a real log-write rejection dropped before it could reach a `.catch()`). The
underlying observation this entry originally made — that all four wrapper exports still discard
their promise — remains true and is restated with a measured blast radius (309 call sites) in
D4-DEF-01. The original text below is preserved unedited, per this project's convention (the same
one gap cycle 3 used when it closed the 34.2-18 entry).

- **`backend/logger/index.ts`'s four exported wrappers (`logDebug`/`logInfo`/`logWarning`/
  `logError`) all discard the promise `heroicLogWriter.<method>(...)` returns.** Each is a
  block-body arrow function with no `return` statement (e.g. `const logError = (...params) =>
  { heroicLogWriter.logError(...params) }`, `index.ts:25-27`), so at runtime `logError(...)`
  always synchronously returns `undefined` — never the `Promise<void>` that
  `LogWriter#logError` (`log_writer.ts:171-173`) actually produces via `#logBase`'s
  `fsPromises.appendFile`/`mkdir`. This means a real log-write failure's rejection is dropped
  *inside `logger/index.ts` itself*, before it ever reaches a caller like
  `loggerFlowRegistration.ts` — so this plan's Task 1 `.catch()` (which normalises whatever
  `logError(...)` returns via `Promise.resolve(...)`) can only observe a rejection if a future
  fix makes the wrapper actually `return` the writer's promise. The plan's own `<interfaces>`
  section states `logError(...)` "returns `heroicLogWriter.logError(...)`" — that claim is
  currently FALSE against the real source; Task 2's test suite works around this by
  `jest.spyOn`-overriding the exported `logError` function directly (bypassing the wrapper's
  real body entirely), so the WR-02 proof itself is unaffected. Not fixed here: touching
  `logger/index.ts` would change behavior for all four wrappers project-wide, a scope well
  beyond this plan's declared `files_modified` (`loggerFlowRegistration.ts` +
  `loggerFlows.test.ts`), and is exactly the kind of "significant structural modification
  affecting a shared module" Rule 4 reserves for an explicit decision. Natural home: a
  standalone plan making all four `backend/logger` wrapper exports `return` their writer call,
  with call-site audits of every fire-and-forget `logInfo`/`logDebug`/`logWarning` call this
  project has (a wide blast radius, hence a separate plan).

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

## From gap cycle 3 (plans 34.2-19..34.2-23)

Residual findings from `34.2-REVIEW-GAP-CYCLE-2.md` that this cycle deliberately did not fix,
recorded here with a reason and a natural home so a future gap cycle does not have to re-derive
scope from scratch.

- **WR-05** — `src/backend/sidecar/__tests__/loggerFlows.test.ts:84,105,139`,
  `testContainment.test.ts:44,66,97`, `sidecarRejectionGuard.test.ts:83,108,145`,
  `gameDetailsFlows.test.ts:123,141,180`, `enrichmentFlows.test.ts:82,100,139`. Each of these five
  suites hardcodes its containment tmp-root string three times — once per mock factory (`os`,
  `pathShim`, `backend/logger/paths`) — with nothing asserting the three copies agree; a future
  edit to one factory but not the other two would silently desynchronize them while every existing
  tripwire still passes, because all three roots remain under `os.tmpdir()` regardless. **Reason
  for deferring:** plan 34.2-19's structural containment (`src/backend/jest.setupContainment.ts`,
  `setupFiles`) demoted these five suites' per-suite mocks from the primary containment mechanism
  to defence in depth — the project-wide `setupFiles` entry already redirects `os.homedir()` and
  the relevant env vars regardless of what any individual suite's own mocks say, so a desync
  between the three per-suite mocks can no longer produce a write outside `os.tmpdir()`. Still
  worth fixing for legibility. **Natural home:** hoist each suite's tmp-root string to a single
  `mock`-prefixed module-scope constant (the `mock` prefix is what makes it legal inside a hoisted
  `jest.mock` factory) referenced by all three factories — a small, mechanical, five-file cleanup.
- **WR-06** — `loggerFlows.test.ts:88-95` and `testContainment.test.ts:48-55`. Both hoisted
  `jest.mock` factories reference a `TMP_ROOT_NAME`/`TMP_ROOT_NAME`-shaped `const` declared BELOW
  the hoisted `jest.mock` call site — `ts-jest` hoists `jest.mock(...)` above the `const`
  declaration and above all `import`-generated `require`s. This survives today only because the
  reference sits inside a lazily-evaluated `homedir: () => ...` arrow and nothing calls
  `os.homedir()` during module evaluation (both `pathShim` and `backend/logger/paths` are mocked
  away in both files); under `babel-jest` (which `babel-plugin-jest-hoist` enforces), the file
  would be rejected outright with "The module factory of `jest.mock()` is not allowed to reference
  any out-of-scope variables." **Reason for deferring:** same as WR-05 — the fix is naturally
  bundled with it, since both are the same hoisted-factory tmp-root constant. **Natural home:**
  rename to a `mock`-prefixed identifier (`mockTmpRootName`), the convention this repo already
  uses for `mockTestHomeSuffix` in `sidecarRejectionGuard.test.ts:73` — hoist-legal and
  TDZ-documented — as part of the same WR-05 cleanup pass.
- **IN-01** — `prettier --check` flags five gap-cycle-2 files: `src/backend/sidecar/processGuards.ts`,
  `__tests__/sidecarRejectionGuard.test.ts`, `__tests__/loggerFlows.test.ts`,
  `__tests__/testContainment.test.ts`, `src/frontend/screens/Game/GameSubMenu/__tests__/repairFailure.test.ts`.
  **Reason for deferring:** `prettier --check` is red at baseline across dozens of pre-existing
  files in this repository (confirmed by `34.2-REVIEW-GAP-CYCLE-2.md`'s IN-01), so the gate cannot
  distinguish this cycle's own contribution from pre-existing debt, and reformatting only these
  five files would not change the gate's overall red/green outcome. Separately: gap cycle 3's OWN
  new/modified files (`src/backend/jest.setupContainment.ts`,
  `src/backend/sidecar/__tests__/structuralContainment.test.ts`,
  `src/backend/sidecar/loggerFlowRegistration.ts`,
  `src/backend/sidecar/__tests__/loggerFlows.test.ts`,
  `src/frontend/screens/Game/GameSubMenu/repairFailure.ts`,
  `src/frontend/screens/Game/GameSubMenu/__tests__/repairFailure.test.ts`, `src-tauri/src/main.rs`,
  `src/backend/__tests__/longRunningChannels.test.ts`,
  `src/backend/sidecar/__tests__/testContainment.test.ts`) are this cycle's own responsibility —
  none of the five plans' own eslint/typecheck acceptance criteria flagged a newly-introduced
  prettier violation in any of them. **Natural home:** `npx prettier --write` on the five named
  files, ideally alongside a project-wide prettier pass that also clears the pre-existing baseline
  violations, since fixing only these five in isolation leaves the gate red for everyone else.
- **IN-03** — `src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts:319,376`. Both
  `setupIsolatedBootstrapHarness()` and `loadFreshProcessGuards()` create
  `jest.spyOn(loggerModule, 'logWarning')` with no matching `mockRestore()`. Benign today because
  each runs inside a fresh `jest.isolateModules()` registry, so the un-restored spy cannot leak
  into a sibling test's module instance — but plan 34.2-18's own IN-03 note (the reason
  `loadConstantsPaths()` was narrowed in the first place) states the rationale was specifically to
  avoid "leaving an unrestored `jest.spyOn`", and that rationale is only half-applied while these
  two call sites remain unrestored. **Reason for deferring:** out of scope for the five plans this
  cycle ran (none of 34.2-19..34.2-23 touch `sidecarRejectionGuard.test.ts`'s harness helpers).
  **Natural home:** add `afterEach(() => jest.restoreAllMocks())` at the describe level in
  `sidecarRejectionGuard.test.ts`, a one-line, low-risk fix for a future small plan or the next gap
  cycle.
- **IN-06** — `src/backend/sidecar/__tests__/loggerFlows.test.ts` (four `startSidecar()` calls) and
  `sidecarRejectionGuard.test.ts`. Observed during test runs: `MaxListenersExceededWarning:
  Possible EventEmitter memory leak detected. 11 exit listeners added to [process].` Each
  `init()` call attaches process-level listeners that are never removed; cosmetic in a test run
  today, but it is the same accumulate-without-cleanup shape that would matter if `init()` were
  ever called twice in production. **Reason for deferring:** the real fix belongs with
  `bootstrap.init()`'s own idempotency guard (mirroring the module-scope idempotency flag pattern
  `processGuards.ts` already uses for its own installation), not with a test file — fixing it only
  in the test harness (e.g. `process.setMaxListeners(0)`) would silence the warning without
  addressing the production shape it is warning about. **Natural home:** a standalone plan adding
  an idempotency guard to `bootstrap.init()`'s process-listener registration.

**IN-04 — ACCEPTED, not deferred.** `src/backend/sidecar/loggerFlowRegistration.ts:56-58`: the
renderer can send arbitrary text through the newly-ported `logError` channel, including embedded
newlines, which `LogWriter` appends verbatim — allowing forged log lines (e.g. a fake `[ERROR]:`
entry) in `gamelib.log`. This is accepted rather than deferred because it is exact parity with the
Electron handler (`src/backend/logger/ipc_handler.ts:15`), which has the identical property today;
changing it here, in the sidecar port only, would be an undeclared behavioural divergence between
the two builds, which REQ-34.2-14 explicitly forbids. Cross-referenced in plan 34.2-20's threat
model as T-34.2-69. **Natural home, if tightened later:** a single change in
`LogWriter#writeString` (escape `\n` → `\\n` for non-forced messages), applied once for both
builds rather than per-channel.

## From gap cycle 4 (plans 34.2-25..34.2-29)

Deliberate deferrals from `34.2-REVIEW-GAP-CYCLE-3.md`'s 14 findings that gap cycle 4 did not
fix, recorded with a reason and a natural home so a future gap cycle does not have to re-derive
scope from scratch. Pinned by `currency-gate.py`'s `CYCLE4_DEFERRED_FINDING_TOKENS` so a future
edit cannot quietly drop the record that these were considered and not silently forgotten.

- **D4-DEF-01** — `src/backend/logger/index.ts:16-27`. The four exported wrappers
  (`logDebug`/`logInfo`/`logWarning`/`logError`) still discard the `Promise<void>` their
  `LogWriter` method returns (each is a block-body arrow function with no `return` statement).
  Plan 34.2-26 added `logErrorSettled`, a promise-returning sibling, for the one call site that
  must settle (`loggerFlowRegistration.ts`'s `logError` send-channel listener), rather than
  changing the four shared wrappers themselves. **Reason for deferring:** the measured blast
  radius — 309 statement-position `logError(...)` call sites under `src/backend` (excluding
  `logger/`/`__tests__`), none awaited, against this project's
  `@typescript-eslint/no-floating-promises: 'warn'` eslint rule — would add roughly 309 new lint
  warnings for zero runtime change (the promise is dropped either way; only the drop site moves
  from inside the wrapper to each unawaited call site). This is the "audit with
  `@typescript-eslint/no-floating-promises`" the code review's CR-01 finding itself asked for;
  the count, not just the conclusion, is recorded here. **Natural home:** a standalone plan
  changing all four `backend/logger` wrapper exports to `return` their writer call together, with
  a call-site audit of the resulting new lint warnings across the 309 sites — a wide blast radius,
  hence a separate plan, not a rider on this one. **This entry supersedes and updates the
  pre-existing "From plan 34.2-20" entry above (see its dated resolution note) rather than
  duplicating it** — that entry described the same underlying fact before `logErrorSettled`
  existed; this entry restates it with the measured 309-site figure gap cycle 4 added.
- **D4-DEF-02** — the carried-forward gap-cycle-3 residuals that gap cycle 4 did not touch, each
  re-stated with its current status:
  - The per-suite containment tmp-root string triplication (gap cycle 3's WR-05: five suites each
    hardcode their tmp-root string three times, once per mock factory, with nothing asserting the
    three copies agree) and the hoisted-factory TDZ naming issue (gap cycle 3's WR-06: two
    hoisted `jest.mock` factories reference a `const` declared below the hoist point) — both
    **still open**, and now further demoted from "worth fixing for legibility" to purely cosmetic
    by gap cycle 4's own `setupFiles`-time precondition (plan 34.2-25): a desync between any
    per-suite mock and the project-wide mechanism now throws loudly (`REFUSING TO RUN`) rather
    than silently producing a contained-but-inconsistent state, so the failure mode WR-05/WR-06
    originally warned about is structurally closed even though the duplication itself is not.
    **Natural home:** unchanged — hoist each suite's tmp-root string to a single `mock`-prefixed
    module-scope constant referenced by all three factories, a small mechanical five-file cleanup.
  - The two unrestored `jest.spyOn` calls in `sidecarRejectionGuard.test.ts:319,376` (gap cycle
    3's IN-03) — **still open**, out of scope for gap cycle 4's five plans (none touch that
    file's harness helpers). **Natural home:** unchanged — `afterEach(() =>
    jest.restoreAllMocks())` at the describe level, a one-line fix for a future small plan.
  - The project-wide `prettier --check` baseline (gap cycle 3's IN-01) — **still red for
    pre-existing files** project-wide; gap cycle 4 makes its OWN touched files clean (confirmed
    by plan 34.2-30's own final consistency sweep: `npx prettier --check` exits 0 on all 11 files
    touched across plans 34.2-25..34.2-29), which is the part CI attributes to this cycle's work.
    **Natural home:** unchanged — a project-wide `npx prettier --write` pass, ideally as its own
    dedicated plan since fixing only gap-cycle-4's files in isolation does not change the gate's
    overall red/green outcome for everyone else.
  - The pre-existing, non-deterministic `storeManagers/steam/library.ts` poll-timer leaked-`Timeout`
    flake — explicitly out of scope for this cycle, unchanged. Re-observed during this plan's own
    final consistency sweep: one of two full-backend-project runs additionally failed
    `withTimeout.test.ts` with the same root cause already documented under "From plan 34.2-07"
    and "From plan 34.2-19" above (`TypeError: Cannot read properties of undefined (reading
    'map')` inside `readAcfState`/`pollInstallOnce`); the second run reproduced the clean,
    documented baseline exactly (`{rustInvokeChannel.test.ts}` only). Confirms, a third time, that
    WHICH suite the leaked timer lands on is non-deterministic and unrelated to whatever this
    project's plans touch. **Natural home:** unchanged — a standalone fix for `library.ts`'s
    poll-timer teardown.
