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
