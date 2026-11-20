# Phase 82 test ledger

## Measurement head

- Measured head: `8ba2ba40a33fd294198eaeff476bec1b180547c8` (`docs(todo): Launch without Steam live gate passed (steps A-G, 2026-11-20)`), measured 2026-11-20.
- Method: measured from a clean `git worktree add --detach` checkout of that sha with its own pnpm install --frozen-lockfile (the worktree's `node_modules` was deleted and re-installed inside the worktree; it is never a symlink to the main tree's, which research measured as 53 phantom React reds). The main tree was dirty with another session's quick task (261120-pp4) and played no part in any measurement run.
- Every row below is from that worktree unless it says "after fix", which is the re-measure at the end of plan 82-01.

## Full-run counts

Full `pnpm test --silent --json` at `8ba2ba40a` (all jest projects):

```
Test Suites: 7 failed, 5 skipped, 1074 passed, 1081 of 1086 total
Tests:       8 failed, 36 skipped, 22920 passed, 22964 total
Time:        212.074 s
```

## Measured red set

| Suite | Red since | Cause | Verdict | Fix commit |
| --- | --- | --- | --- | --- |
| `src/backend/__tests__/storeKinds.test.ts` | `053a72cc4` (quick 261117-p38) | store `steam_direct_launch_verdict` is built at `steam/stores.ts` but absent from `EXPECTED_KINDS` | fixed: pinned `cache` (a derivable eligibility verdict, per the test header's cache-vs-user-state rule) | `7c7c266ff` |
| `src/backend/stores/__tests__/createStores.test.ts` | `053a72cc4` | same store absent from `fixtures/registeredStores.json` | fixed: fixture entry added with declaration `cache`; `MIN_CONSTRUCTIONS` untouched (the scan count did not rise) | `7c7c266ff` |
| `src/backend/__tests__/tauriShellSource.test.ts` (2 NARROWNESS cases) | `ec530001e` (rustfmt re-wrapped the Humble cookie guard) | the multi-line `CENSUS_GUARD` literal no longer matched, so each mutation replaced nothing | fixed: both mutations now use a whitespace-tolerant regex anchored on the census arm's return, each asserts the mutated text differs from the source, plus an exactly-once anchor test, so a future `cargo fmt` cannot make them vacuous | `013e721c8` |
| `src/backend/storeManagers/steam/localFiles/__tests__/acfUpdateReplay.test.ts` | `2b2d34ddd` (quick 261117-q52) | new fixture `localconfig/playtime.vdf` joined the corpus with no oracle cases | fixed: hand-written oracle cases `readLocalConfigBetaKey/playtime/{10,20,99,abc}` (null: playtime.vdf carries no BetaKey, noted beside each case), invocations added and `rust-results.json` re-recorded by the cargo golden test, which passes | `013e721c8` |
| `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` | folded todo `2026-11-18-themetokens-render-site-census-finds-37-sites-expects-34` | render-site census finds 39 `is-text` sites against a pin of 34 | fixed: re-derived 34 -> 39 per site. Five pure `button is-text` sites were added (NativePortInfo x3 by `20e70fdc1`, ThemeEditor Back by `eb33e8668`, Rename by `1f9c0efa1`); none sets its own colour or background, so none escaped the contrast census. Counts, case title and comment moved together; the folded todo is closed with this decision | `013e721c8` |
| `src/backend/__tests__/steamAuthSessionPolicy.test.ts` (Rule E) | `bf4df5676` (quick 261120-p2j) | `depotRust/verify.ts` takes the authenticated depot lease and is not in `ACQUIRE_AUTH_ALLOW`. Not in the research's red set: it landed after `21a22ad78`. | fixed: `depotRust/verify.ts` added to `ACQUIRE_AUTH_ALLOW` with its reason (the bridge Verify job takes the same depot lease as `install.ts` and `updateEstimate.ts`); Rule E also proves the file really calls `acquireAuthenticated(` | `7eabdc489` |
| `src/backend/__tests__/steamCmPortComplete.test.ts` | flaky since `bf8a8f024` (34.9) wrote the probe, `7dd6e3c8d` (79-43) scans `meta/` | `ENOENT` on `meta/runTs.__probe__.cjs`: `meta/__tests__/runTsSignals.test.ts` creates and unlinks that file while this suite walks `meta/` under full-suite load. Passes alone. | fixed: the `meta/` scan skips the transient `runTs.__probe__` file | `7eabdc489` |

Gate red outside jest (recorded in the Gates table): `backend-di-ceilings` is red at this head, from quick 261120-p2j (`2bf8758cc`, `bf4df5676`) and quick 261120-963 (`d0459b101`). Not in the research's red set. Fixed in `7eabdc489`: `validateNative` and `verifyBridge` now take their collaborators as an optional parameter, and their tests plus `rustVerify.test.ts` carry no `jest.mock` (4 + 6 + 4 violations gone, no baseline entry added); the `games.test.ts` baseline was lowered 46 -> 45, the shrink the gate itself demanded. `validateNative`'s and `verifyBridge`'s tests had mocked `backend/logger`; they now call `initHeadless()` (the log file lands under the fake HOME that `jest.setupContainment` provides).

## Gates (D-01)

| Gate | Result | Evidence line |
| --- | --- | --- |
| `pnpm test` (all jest projects) | RED, 7 suites (table above) | `Test Suites: 7 failed, 5 skipped, 1074 passed, 1081 of 1086 total` |
| `pnpm backend-di-ceilings` | RED | `FAIL: shrank: lower src/backend/storeManagers/steam/__tests__/games.test.ts to 45 in this commit (jestMock baseline says 46)`; `new violation: ...validateNative.test.ts has 4 (jestMock) and no baseline entry`; same for `verifyBridge.test.ts` (6) and `depotRust/__tests__/rustVerify.test.ts` (4) |
| `pnpm steam-line-ceiling` | PASS | `PASS (199 files scanned, 0 allowlisted over 1000)` |
| `pnpm find-deadcode` | PASS | `PASS (334 baselined knip findings; binaries: 3, dependencies: 1, devDependencies: 7, duplicates: 3, exports: 293, files: 7, types: 13, unlisted: 6, unresolved: 1)` |
| `pnpm lint` | PASS | `619 problems (0 errors, 619 warnings)`; `production: PASS \| tests: PASS` |
| `pnpm i18n --fail-on-update` | PASS | exit 0 on the clean worktree (the main tree is dirty in `public/locales/en/gamelib.json`, so it is not a valid place to read this gate) |
| `pnpm gameinfo-narrowing-ceiling` | PASS | `PASS (867 files scanned, 46 allowlisted)` |
| `pnpm planning-gates` | RED 11/12 | `.planning/state-sdk-field-anchor-gate.py`: `PROBLEM: Plan: value '—' is neither <N> of <M> ... nor gsd-core's own between-phases value Not started` (`.planning/STATE.md`, mid-milestone-transition fields) |

## Skipped suites

Five suites skip entirely (36 tests skip in total, the other 14 from conditionally skipped cases inside running suites):

| Suite | Why it skips |
| --- | --- |
| `meta/__tests__/overlayInputProbeSmoke.test.ts` (9) | `describe.skip` unless macOS and `GAMELIB_DESKTOP_SMOKE=1` (needs a window server and an interactive session) |
| `meta/__tests__/overlayInputSmoke.test.ts` (7) | same desktop-smoke opt-in |
| `src/backend/shortcuts/__tests__/windowsShortcut.win32.test.ts` (3) | Windows only: every describe is `describe.skip` elsewhere |
| `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts` (1) | needs a real CrossOver install on the machine |
| `src/backend/storeManagers/steam/bridge/drm/__tests__/ntdllPatch.realCrossover.test.ts` (2) | needs the real CrossOver `ntdll` and the payload on disk |

Conditionally skipped cases inside running suites: `meta/__tests__/steamclientLayerNotice.test.ts` (8, needs a licence file and the staged pins), `src/backend/utils/filesystem/__tests__/windows.test.ts` (2, Windows leg), `src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts` (1, platform split), `meta/__tests__/gamelibDepotCli.test.ts` (1, needs the built CLI), `src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts` (1), `meta/__tests__/genI18nGateScope.test.ts` (1, environment-dependent git availability).

## Observed flaky

- `src/backend/__tests__/steamCmPortComplete.test.ts`: red under full-suite load (see the red set), green alone. Cause is a read of a file another suite had just unlinked. Fix direction taken: skip the transient probe file in the scan, never retirement.
- `src/backend/tools/__tests__/dxvkInstallRemove.test.ts`: the research saw one `ENOTEMPTY` in `afterEach` under load. It did NOT red in this measurement (passed). Fix direction if it reds again: an `rmSync` `maxRetries` race fix, never retirement.

## CI-only reds (D-20)

| Where | Failure | Cause | Fix commit |
| --- | --- | --- | --- |
| Rust test, macOS clippy ratchet | `1 new warning(s) for deprecated` at `gamelib-steampoll/tests/adoption.rs:1528` | open (Task 3) | |
| Rust test, Windows, `gamelib-depot` `tests/fetch.rs` x3 | `a_long_outage_after_fetching_began_demotes_no_host`, `errors_before_any_success_still_demote_a_dead_host_after_a_late_start`, `outage_exhaustion_reports_the_real_attempt_count` | open (Task 3) | |
| Test CI, `tauriShellSource` | same as the jest row above | see jest row | |

## Retirement proposals (D-03)

None proposed.

## Notes

- The `backend-di-ceilings` jestMock todo (`2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests`) was already resolved by quick 261117-omv; CONTEXT folded it and nothing is left to do for it. The `backend-di-ceilings` red above is a new one from different tests.
- `.husky/pre-push` runs codecheck, lint, prettier, i18n, find-deadcode, boundaries and the three ceilings, but NOT jest and NOT planning-gates. So the D-01 exit condition is the union list in this ledger, proven in plan 82-11, not "the hook passes".
- `planning-gates` is red only because `.planning/STATE.md`'s Current Position fields are mid-milestone-transition (the field-anchor gate sees `Plan: —`). That is fixed at proof time by plan 82-11. This plan does not edit STATE.md's Current Position fields beyond the executor's normal plan-advance (parallel executors share the file).
- No suite was skipped, deleted or retired, and no baseline, ceiling, pinned count or floor was widened to turn anything green. Where a pin moved, the row says why.
