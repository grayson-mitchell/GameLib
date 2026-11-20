# Phase 82 test ledger

## Proof head

- Proof head P: `a8eb655b5ed6bc4d19976dd60821442eb38cb873` (`fix(82-11): name the sideload runner check without a GameInfo narrowing`), 2026-11-20. Measured in a clean `git worktree add --detach` checkout with its own `pnpm install --frozen-lockfile` (its `node_modules` is a real directory, never a symlink to the main tree's).
Provenance: `git worktree add --detach <scratchpad>/proof-82 413bbb533400e7d056a27ac32971c550eafbc23d` created the worktree; `git -C <scratchpad>/proof-82 rev-parse HEAD` printed `413bbb533400e7d056a27ac32971c550eafbc23d` before any install. The first run at 413bbb533 found one red gate (gameinfo-narrowing-ceiling, below), fixed by cause in `a8eb655b5`; the same worktree was then moved with `git checkout --detach a8eb655b5ed6bc4d19976dd60821442eb38cb873` (HEAD re-read as `a8eb655b5ed6bc4d19976dd60821442eb38cb873`, `git status --short` empty), re-installed with `pnpm install --frozen-lockfile`, and EVERY measurement below was re-run at P. The 14 SUMMARY files checked are 82-01..82-10 and 82-13..82-16; 51 commit shas listed under their "## Task Commits" were verified ancestors of HEAD with `git merge-base --is-ancestor`, and 82-04 and 82-13 (whose SUMMARYs have no "## Task Commits" section) were verified through their frontmatter `plan_head_after` (`c3e3855c6`, `92c81d999`), also ancestors: 53 commits in all. This repo runs `workflow.use_worktrees=false` with `git.branching_strategy=none`, so each prior plan committed straight onto main. The main checkout had 14 uncommitted entries (other sessions' `.planning/` debug, spike and todo files, `public/locales/en/gamelib.json`, and an untracked `*.dxvk-cache`) when the worktree was made, plus this plan's own ledger and inventory edits; none is in the proof by construction. `git diff --name-only 413bbb533 a8eb655b5` lists only `src/backend/safety/knownInstalls.ts`.
- The proof is of P, which is origin/main plus every commit that has landed on local main since (see the push checkpoint's commit list); it includes other sessions' commits, such as the `quick-261120-rdo` one named in the surviving reds below.

## Measurement head

- Measured head: `8ba2ba40a33fd294198eaeff476bec1b180547c8` (`docs(todo): Launch without Steam live gate passed (steps A-G, 2026-11-20)`), measured 2026-11-20.
- Method: measured from a clean `git worktree add --detach` checkout of that sha with its own pnpm install --frozen-lockfile (the worktree's `node_modules` was deleted and re-installed inside the worktree; it is never a symlink to the main tree's, which research measured as 53 phantom React reds). The main tree was dirty with another session's quick task (261120-pp4) and played no part in any measurement run.
- Every row below is from that worktree unless it says "after fix", which is the re-measure at the end of plan 82-01.

## Full-run counts

Full `pnpm test --silent --json` at the proof head `a8eb655b5` (all jest projects, clean worktree):

```
Test Suites: 3 failed, 5 skipped, 1097 passed, 1100 of 1105 total
Tests:       3 failed, 36 skipped, 23206 passed, 23245 total
Time:        236.885 s
```

The 3 failed suites in that run, and their disposition:

| Suite | Verdict |
| --- | --- |
| `src/backend/__tests__/moduleStateCensus.test.ts` ("has no site outside SANCTIONED") | SURVIVING RED, not phase 82's: `src/backend/storeManagers/steam/bridge/shimCoverage.ts:515` `X86_NULL_OBJECT_VERSION_SET` is a module-level `new Set`, added by `a94108e3e` (quick-261120-rdo, another session). Still present at HEAD when re-checked at the end of this plan. See Retirement proposals. |
| `src/backend/__tests__/diPhaseGates.test.ts` ("66.3 end state ... shimCoverage.ts has no module state") | SURVIVING RED, same cause and same file. |
| `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` ("writes a single well-formed rustInvoke frame...") | observed flaky: `Exceeded timeout of 5000 ms` under full-suite load; 9/9 pass alone, three runs in a row. Not a defect. |

The earlier run of this proof at `413bbb533` (before the gameinfo fix) had the same two surviving reds plus `dxvkInstallRemove.test.ts` (`ENOTEMPTY` in the `afterEach` `rmSync`, 25/25 pass alone three times); that run's counts were `Test Suites: 3 failed, 5 skipped, 1097 passed, 1100 of 1105 total`, `Tests: 3 failed, 36 skipped, 23206 passed, 23245 total`. The first plan-82-01 measurement (at `8ba2ba40a`) was `7 failed, 5 skipped, 1074 passed` and is superseded; its red set is the table below.

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
| `meta/__tests__/x86CallbackWineHarness.test.ts` ('fake helper saw HELLO, one 168 drain and CBDISP 168/3/0') | `dc69dcf5b` (quick 261106-qvp, 2026-11-06) | the shim has sent CBREG (control slot 15) since that commit; the case's frame allow-list stopped at slots 2, 6 and 10 (`Expected value: 15 / Received array: [2, 6, 10]`). Hidden from the first measurement: the file silently skips (and so passes in 123 ms) when `.build-tools/zig/zig` is absent, and the fresh worktree had no zig until its install step fetched it. Found by the post-fix full re-measure, reproduced at `8ba2ba40a` too, so it is not caused by this plan. | fixed: `SLOT_CBREG = 15` joins the allowed slots, with its frame shape asserted (8 bytes, path 0 or 1) | `aae024262` |

The first measurement therefore listed 7 red suites; the full re-measure after the fixes found an eighth (the x86 harness row). Silent early-return skips make a suite read as passed, see Skipped suites.

Gate red outside jest (recorded in the Gates table): `backend-di-ceilings` is red at this head, from quick 261120-p2j (`2bf8758cc`, `bf4df5676`) and quick 261120-963 (`d0459b101`). Not in the research's red set. Fixed in `7eabdc489`: `validateNative` and `verifyBridge` now take their collaborators as an optional parameter, and their tests plus `rustVerify.test.ts` carry no `jest.mock` (4 + 6 + 4 violations gone, no baseline entry added); the `games.test.ts` baseline was lowered 46 -> 45, the shrink the gate itself demanded. `validateNative`'s and `verifyBridge`'s tests had mocked `backend/logger`; they now call `initHeadless()` (the log file lands under the fake HOME that `jest.setupContainment` provides).

## Gates (D-01)

All at the proof head `a8eb655b5`, in the clean worktree, run one at a time (`find-deadcode` alone, never beside jest).

| Gate | Result | Evidence line |
| --- | --- | --- |
| `pnpm test` (all jest projects) | 2 SURVIVING REDS (not phase 82's), 1 load flake | `Test Suites: 3 failed, 5 skipped, 1097 passed, 1100 of 1105 total` (see Full-run counts) |
| `pnpm backend-di-ceilings` | PASS | `backend-di-ceilings: PASS childProcess=1 (1 files) jestMock=1865 (448 files) sanctioned=1` |
| `pnpm steam-line-ceiling` | PASS | `PASS (201 files scanned, 0 allowlisted over 1000)` |
| `pnpm find-deadcode` | PASS | `PASS (312 baselined knip findings; binaries: 3, dependencies: 1, devDependencies: 7, duplicates: 3, exports: 274, files: 7, types: 10, unlisted: 6, unresolved: 1)` |
| `pnpm lint` | PASS | `622 problems (0 errors, 622 warnings)`; `production: PASS \| tests: PASS` |
| `pnpm i18n --fail-on-update` | PASS | exit 0; `Added keys: 0`, `Restored keys: 0`, `Unreferenced keys: 0`. The run re-sorts a few `themeEditor` keys in `public/locales/en/gamelib.json` on disk (a collation-order difference, `contrastSummaryNone` and `saveFailed`/`saved`); it is not counted as an update, and the worktree copy was restored after the run |
| `pnpm gameinfo-narrowing-ceiling` | PASS | `PASS (876 files scanned, 46 allowlisted)`. Was RED at `413bbb533`: `FAIL [grew]: src/backend/safety/knownInstalls.ts has 1, baseline 0` (82-05's `isStore({ runner }, 'sideload')`); fixed by cause in `a8eb655b5` with `isStore(runner, 'sideload')`, no baseline entry added |
| `pnpm planning-gates` | PASS | `12/12 planning gates passed` (was 11/12: STATE.md `Progress` anchor missing; fixed in `413bbb533` by adding the line, the gate untouched) |
| `pnpm codecheck` | PASS | `tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`, exit 0 |
| `pnpm prettier` | PASS | `All matched files use Prettier code style!` |
| `pnpm boundaries` | PASS | `no dependency violations found (1392 modules, 8524 dependencies cruised)` |
| `pnpm check:ipc-contract` | PASS | `src-tauri/src/ipc_contract.rs is up to date` |
| `cargo test -p gamelib-safety -p gamelib-testutil` (macOS, local) | PASS | `25 passed` (unit), `42 passed` (`tests/adversarial.rs`), `8 passed` (gamelib-testutil); the Windows and Linux legs are CI-only (D-18) |

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

Silent skips (the suite returns early and reports PASS, so they are not in the 36): `meta/__tests__/x86CallbackWineHarness.test.ts` returns early unless macOS, CrossOver's `wineloader` and the pinned `.build-tools/zig/zig` all exist (`GAMELIB_REQUIRE_WINE_HARNESS=1` makes the absence an error). The first measurement ran with no zig and passed it in 123 ms; with zig it ran for 35 s and found the red in the table. Any suite with this shape is only as green as the machine that ran it.

## Observed flaky

- `src/backend/__tests__/steamCmPortComplete.test.ts`: red under full-suite load (see the red set), green alone. Cause is a read of a file another suite had just unlinked. Fix direction taken: skip the transient probe file in the scan, never retirement.
- `src/backend/tools/__tests__/dxvkInstallRemove.test.ts`: the research saw one `ENOTEMPTY` in `afterEach` under load. It did NOT red in this measurement (passed). Fix direction if it reds again: an `rmSync` `maxRetries` race fix, never retirement.

## CI-only reds (D-20)

| Where | Failure | Cause | Fix commit |
| --- | --- | --- | --- |
| Rust test, macOS clippy ratchet | `1 new warning(s) for deprecated` at `gamelib-steampoll/tests/adoption.rs:1528` (`Atomic::<usize>::fetch_update: renamed to try_update`) | fixed: the slow-slot take is an explicit `compare_exchange` loop (`take_slow_slot`); no ceiling or allow attribute added (`meta/clippyRatchet.cjs` untouched by this plan). `cargo clippy -p gamelib-steampoll --all-targets -- -D warnings` clean locally; macOS proof is this local run, the CI leg is collected by plan 82-11 | `a4f3660d0` |
| Rust test, Windows, `gamelib-depot` `tests/fetch.rs` x3 | `a_long_outage_after_fetching_began_demotes_no_host` (`fetch.rs:583` `left: 0 right: 1`), `errors_before_any_success_still_demote_a_dead_host_after_a_late_start` (`fetch.rs:562` `left: 0 right: 3`), `outage_exhaustion_reports_the_real_attempt_count` (`fetch.rs:511`, `reported 3 attempts: chunk abc failed after 3 attempts (outage budget exhausted): connect from 127.0.0.1:58868`), from run 44671043816, `FAILED. 18 passed; 3 failed` | Diagnosed from that log: each failing case runs a connect to a closed 127.0.0.1 port under a 200-300 ms outage window. The Windows leg shows the dead host's attempts were not recorded (`attempts: 0`) and only 3 attempts fit the 300 ms budget, so one refused connect outlasts the window (the Windows TCP stack retries the SYN before reporting a refusal; it is refused at once on Unix). Fixed by hosting the three cases' dead host on a listener that accepts and drops every connection (`dropping_addr`), which fails fast on every OS; assertions, counts and test names unchanged, and `dead_addr` stays for the two cases that need the port closed so a server can bind it later. All 21 tests pass locally (5 repeats). Windows proof: observed GREEN in Rust test run 44784193543 at `064d8f5c7` (`Running tests\fetch.rs`, `21 passed; 0 failed`, the three formerly failing cases `a_long_outage_after_fetching_began_demotes_no_host`, `errors_before_any_success_still_demote_a_dead_host_after_a_late_start` and `outage_exhaustion_reports_the_real_attempt_count` all `ok`; see "CI proof follow-up at 064d8f5c7"). | `a4f3660d0` |
| Test CI, `tauriShellSource` | same as the jest row above | see jest row | `013e721c8` |

## After fix (re-measure at `aae024262`)

Same clean worktree (own `node_modules`), detached at the final code head of plan 82-01.

- Full `pnpm test --silent --json` at `a4f3660d0` (every fix except the x86 harness one): `Test Suites: 1 failed, 5 skipped, 1080 passed, 1081 of 1086 total`, `Tests: 1 failed, 36 skipped, 22928 passed, 22965 total`, `Time: 217.636 s`. The one failure is the x86 harness row; it was fixed in `aae024262` and re-run in the clean worktree at that head (`Tests: 12 passed, 12 total`). No full re-run was made after that single-test change.
- Gates at `aae024262`: `backend-di-ceilings` PASS (`jestMock=1865 (448 files)`), `steam-line-ceiling` PASS (199 files), `gameinfo-narrowing-ceiling` PASS (867 files, 46 allowlisted), `find-deadcode` PASS (334 baselined), `lint` PASS (`production: PASS | tests: PASS`, 962 and 619 warnings, 0 errors), `i18n --fail-on-update` PASS. `planning-gates` stays RED 11/12 on `.planning/STATE.md` field anchors (`Plan` and `Progress` mid-milestone-transition); that is plan 82-11's proof-time fix, not this plan's.
- A `find-deadcode` run made while jest ran concurrently failed on `meta/runTs.__probe__.cjs` (the same transient file as the steamCmPortComplete race, seen by knip as a stray file). It is an artifact of running the two at once, not a repo defect; the gate was clean when run alone.

## Retirement proposals (D-03)

Nothing is proposed for retirement. Two suites are red at the proof head and neither is phase 82's work; both are written up here for plan 82-12's per-suite decision, with the recommended path being a fix, not a retirement:

| Suite | Evidence | Recommended |
| --- | --- | --- |
| `moduleStateCensus.test.ts` and `diPhaseGates.test.ts` ("shimCoverage.ts has no module state") | `src/backend/storeManagers/steam/bridge/shimCoverage.ts:515` `const X86_NULL_OBJECT_VERSION_SET: ReadonlySet<string> = new Set(SHIM86_NULL_OBJECT_VERSIONS)` is a module-level `new Set`, introduced by `a94108e3e` (quick-261120-rdo, 2026-11-20). `moduleStateCensus` reports `shimCoverage.ts:515 X86_NULL_OBJECT_VERSION_SET new Set` ("1 site(s), not a sanctioned file"); `diPhaseGates` expects `undefined` and receives `1`. Both pass at every phase 82 wave head before that commit landed. | Fix it where it was introduced: build the set inside the function that uses it (it is read at `shimCoverage.ts:593` and `:717`), or add `shimCoverage.ts` to the census sanction list with a reason. Do NOT retire either suite: both guard the 66.4 "no module state" end state, which this commit broke. The operator chose to continue past this red during phase 82. |

## Notes

- The `backend-di-ceilings` jestMock todo (`2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests`) was already resolved by quick 261117-omv; CONTEXT folded it and nothing is left to do for it. The `backend-di-ceilings` red above is a new one from different tests.
- `.husky/pre-push` runs codecheck, lint, prettier, i18n, find-deadcode, boundaries and the three ceilings, but NOT jest and NOT planning-gates. So the D-01 exit condition is the union list in this ledger, proven in plan 82-11, not "the hook passes".
- `planning-gates` was red 11/12 only because `.planning/STATE.md` had no anchored `Progress:` line in Current Position (the field-anchor gate wants exactly one). Fixed at proof time by plan 82-11 (`413bbb533`); the gate was not edited. It is 12/12 at the proof head.
- No suite was skipped, deleted or retired, and no baseline, ceiling, pinned count or floor was widened to turn anything green. Where a pin moved, the row says why.
- Surviving reds are not caused by phase 82: `moduleStateCensus.test.ts` and `diPhaseGates.test.ts` are red from `a94108e3e` (quick-261120-rdo). `.husky/pre-push` does not run jest, so the push is not blocked by them; they would be red on `test.yml` too (see CI proof).
- Load flakes seen across the six wave gates and the two proof runs, each green alone: `dxvkInstallRemove.test.ts` (`ENOTEMPTY` in the `afterEach` `rmSync` under load), `steamLoginPollLifecycle.test.tsx` (5 s timeouts under load), `rustInvokeChannel.test.ts` (5 s timeout under load, proof run 2). The `runTs.__probe__.cjs` `ENOENT` race is fixed in `steamCmPortComplete` (82-01) and `steamPollsPortComplete` (orchestrator, wave 4). `depotPortComplete.test.ts` and `steamFilesPortComplete.test.ts` also walk `meta/` (their `walk(join(ROOT, 'meta'), files)` calls) with no `.__probe__.` skip, so they carry the same latent race; it did not red in either proof run and is not fixed here (a source change would move the proof head). `scannerPortComplete.test.ts` walks only `src/`, so it is not exposed.
- D-01 exit condition: `.husky/pre-push` runs nine checks (codecheck, lint, prettier, i18n, find-deadcode, boundaries, steam-line-ceiling, backend-di-ceilings, gameinfo-narrowing-ceiling), not jest and not planning-gates. The union of the D-01 set is proven by the Gates table above plus the push, which runs the hook without `--no-verify`.
- D-19 (moved to Phase 91, not deleted here): `src/backend/storeManagers/legendary/commands/*` (14 files) have 10 live importers, and `commands/base.ts` is in the bundle and exports runtime zod brands that `save_sync.ts`, `compatibility_layers.ts` and the legendary `games`, `library` and `user` modules use; deleting it is a Phase 91 (Epic runner) act. The FEATURES type-only files each have live importers: they are erased at runtime but not unused, so they move with their importers in Phase 91.
- D-21: `gamelib-safety` unlinks a symlinked install root (it removes the link, never the target), while `gamelib-steampoll`'s `guard_install_root` keeps refusing a symlinked install root; both leave the target data intact. The two behaviours differ on purpose (the shared primitive deletes a user-chosen folder, the steampoll guard guards a poller's working root) and are recorded here so neither is "unified" by accident.
- Delete-site classifications (outside the D-10/D-11 set): `shortcuts.ts` `removeShortcuts` is reachable from uninstall but removes a shortcut (lstat-based; it unlinks a link), not a game folder. `utils.ts` `removeFolder` (download-queue partial cleanup) and the `provisionBottle` and `bottlePrimitives` rollback deletes are outside D-10/D-11. `cancelDelete`'s delete stays a synchronous Node delete (a Phase 75 critical section), pre-checked by `gamelib-safety`. Sideload's delete-files path has no UI caller today. The appName file-delete finding (`removeFixFile`, `removeSettingsAndLogs`) was filed as a todo and closed by quick 261120-ux8.
- Plan items NOT delivered (record, do not paper over): 82-04 did NOT delete `src/backend/sidecar/fileStore.ts` (about 27 sidecar jest suites still `requireActual('../fileStore')` through `store_backend` mocks; Phase 85 or a gap follow-up). 82-13 did NOT delete `src/common/types/proxy-types.ts` (it is the only declaration of the global `Window.api` type; deleting it adds 808 TS errors).
- Owed proofs: the live sidecar-to-shell safety round trip was never exercised (82-05/07/08/09 all used `fakeSafetyRustInvoke`); the Windows and Linux legs of `gamelib-safety` (82-03), the Windows depot fetch fix and the clippy legs (82-01) need CI (D-18/D-20), collected below.
- `.planning/STATE.md` could not be advanced with `state.update-progress`: STATE.md asserts milestone `v0.10`, which matches no ROADMAP heading, and requirements live in `REQUIREMENTS-v0.11.md` rather than `REQUIREMENTS.md`. The Progress line was written by hand.
- The `legendary-runtime` and `nile-runtime` step comments in `bootstrap.ts` (lines 2257 and 2267) still mention "the e2e legendary/nile stub slot"; the slots themselves are gone (comment text only, left alone so the proof head did not move).

## CI proof (D-18)

Pushed once from the main checkout by plan 82-11 (operator decision `push-once`): `826373aa0..76fd0e112 main -> main`, `.husky/pre-push` run without `--no-verify` and exit 0 (all nine checks passed in the main tree, which carried another session's dirty `public/locales/en/gamelib.json`: codecheck, lint `production: PASS | tests: PASS`, prettier, i18n `--fail-on-update`, find-deadcode `PASS (312 baselined knip findings)`, boundaries, steam-line-ceiling `PASS (201 files)`, backend-di-ceilings `PASS`, gameinfo-narrowing-ceiling `PASS (876 files, 46 allowlisted)`; the best-effort graphify refresh then ran).

CI ran at **`e4f5c0e45`**, not `76fd0e112`: another session pushed a one-file `.planning/todos` commit on top within moments, so GitHub started workflows for the tip only. `git diff --stat 76fd0e112 e4f5c0e45` is that one todo file, so the code CI measured is exactly the pushed phase 82 code (and, per the Proof head, the measured proof head plus `.planning/` and the 82-11 knownInstalls fix).

| Workflow | Run | Conclusion |
| --- | --- | --- |
| Rust test (`rust-test.yml`) | 44781299137 | failure (windows, ubuntu); macos green |
| Test (`test.yml`) | 44781299279 | failure (`ci` job; see below) |
| Code check | 44781299232 | success |
| Lint | 44781299291 | success |
| Supply-chain audit | 44781299234 | failure (`cargo-deny` step; also failed on `826373aa0`, run 44671043932, so not new) |

Rust test per leg (steps in file order):

| Leg | gamelib-safety + gamelib-testutil (first step, D-18) | multi-crate step (gamelib-depot `fetch.rs`, D-20) | clippy ratchet | Tauri shell test |
| --- | --- | --- | --- | --- |
| macos-latest | success | success | success | success |
| windows-latest | FAILURE: `adversarial.rs` `nfc_and_nfd_spellings_match_only_when_insensitive` (1 failed, 39 passed), line 150: `nfc/nfd, sensitive: after remove_tree: ...\common\Café\GameB\b.exe was deleted` | SKIPPED (the red first step stops the job, so the D-20 depot `fetch.rs` result is NOT observed) | SKIPPED | SKIPPED |
| ubuntu-latest | FAILURE: `adversarial.rs` `case_insensitive_mode_refuses_a_differently_cased_nested_install` and `nfc_and_nfd_spellings_match_only_when_insensitive` (2 failed, 40 passed), line 150: `case, sensitive: after remove_tree: /tmp/.../common/Studio/GameB/b.exe was deleted` | SKIPPED | SKIPPED | SKIPPED |

The D-18 proof is therefore NOT complete: the first safety step is red on two of three legs, and because it runs first (by design, so an earlier red cannot mask it) it also hides the D-20 Windows depot result and the Windows/Linux clippy legs. macOS is fully green, including the clippy ratchet fixed in `a4f3660d0`.

Cause of the safety reds (phase 82-03's own test, a test-fixture bug, not a defect in `gamelib-safety`): in the "sensitive" branch of those two rows the fixture keeps the `b.exe` inside the target in `fx.precious`, yet the row expects the target to be removed whole (`removed()`), so `assert_precious` flags the legitimate deletion. macOS folds case and normalises NFC/NFD, so it always took the other branch and the removed branch never ran there. Linux hits the removed branch in both rows; Windows hits it in the NFC/NFD row only (NTFS keeps NFC and NFD as distinct names, contrary to the old comment, now corrected). Fix: `fx.precious.retain(|p| !p.starts_with(&fx.target))` before the two `removed()` calls. Written and committed locally on branch `fix/82-11-safety-adversarial-precious` (`5a86d54ac`, a worktree off `e4f5c0e45`), NOT pushed (push-once: it returns to the operator as a new decision). Verified locally on a case-sensitive APFS disk image (the same branch Linux takes): `42 passed; 0 failed`.

Test (`test.yml`, `ci` job) failed on 6 suites. None is phase 82's work and `.husky/pre-push` does not run jest, so none blocked the push:

| Suite | Failure | Cause | Owner |
| --- | --- | --- | --- |
| `diPhaseGates.test.ts` ("shimCoverage.ts has no module state") and `moduleStateCensus.test.ts` | the two surviving reds already in "Retirement proposals (D-03)" | `a94108e3e` (quick-261120-rdo) `shimCoverage.ts:515` module-level `new Set` | 82-12 (fix, do not retire) |
| `steamLaunchRuntime.test.ts` (3 tests: `sleeps on the injected clock and cancelRaiseLoops clears every pending timer`, `a fresh loop after a cancel is not suppressed`, `the cancel of one runtime leaves another runtime loop untouched`) | `expect(clock.pendingCount()).toBe(1)` received `0` at `steamLaunchRuntime.test.ts:141` | Linux-only: green on macOS in the clean proof worktree. Last touched by `0c5c35a32` (66.4-06), untouched by phase 82 | 82-12 (CI-only red) |
| `meta/__tests__/callbackRegistryHost.test.ts` ("callback registry host harness (P55-3)", 50 `PASS ...` rows) | `FAIL cr_buffer_zeroed left == 0:1311` from the C harness `callback_registry_harness.c` on the Linux runner | Linux-only: green on macOS. Harness last touched by `4234aa0da` (quick-261117-pfj), untouched by phase 82 | 82-12 (CI-only red) |

Remaining before D-18/D-20 can close: push the safety-test fix (operator decision), then re-collect the Rust test run so the Windows depot `fetch.rs` step, the clippy legs on Windows and Linux, and the Tauri shell test are observed for the first time.

### CI proof follow-up at `064d8f5c7` (plan 82-12, 2026-11-21)

The operator then authorised cherry-picking 82-11's fixture fix onto main and pushing. `064d8f5c7` (`fix(82-11): drop the removed tree's own files from the precious list in the two case-sensitive adversarial rows`) was pushed together with `376647841` and `ca6608e27`; the pre-push hook was green and `--no-verify` was not used. All five workflows ran at `064d8f5c7`:

| Workflow | Run | Conclusion |
| --- | --- | --- |
| Rust test (`rust-test.yml`) | 44784193543 | failure (windows only) |
| Test (`test.yml`) | 44784193642 | failure (`ci` job, 5 suites) |
| Code check | 44784193579 | success |
| Lint | 44784193663 | success |
| Supply-chain audit | 44784193419 | failure (`cargo-deny`; `pnpm-audit` job success) |

Rust test per leg at `064d8f5c7`:

| Leg | gamelib-safety + gamelib-testutil (D-18) | multi-crate step (D-20 depot `fetch.rs`) | static codec linkage | Tauri shell test | clippy ratchet |
| --- | --- | --- | --- | --- | --- |
| macos-latest | success (25 + 42 + 8 passed) | success | success | success | success |
| ubuntu-latest | success (25 + 42 + 8 passed; both formerly red `adversarial.rs` rows now pass) | success | success | success (`cargo check --all-targets` and `cargo test --bin gamelib-shell` also success) | skipped by workflow design: `rust-test.yml` runs the clippy steps on the macOS and Windows legs only ("clippy is NOT run on Linux", caveat (a); there is no measured Linux ceiling map in `meta/clippyRatchet.cjs`), so Linux-only cfg code is compiled but never linted |
| windows-latest | success (21 + 40 + 6 passed; the formerly red NFC/NFD row passes) | FAILURE: one test, see below | skipped (the red step stops the job) | skipped | skipped |

- D-18 (gamelib-safety + gamelib-testutil on all three legs): observed GREEN. The fixture fix `064d8f5c7` held on Windows and Linux.
- D-20 (Windows `gamelib-depot` `tests/fetch.rs`): observed GREEN. The Windows multi-crate step log shows `Running tests\fetch.rs (...fetch-ab3aeb34ad73e25a.exe)` then `running 21 tests` and `test result: ok. 21 passed; 0 failed`; the three cases that failed at `e4f5c0e45`'s predecessor run 44671043816 all print `ok`. The "21 passed" line is therefore the `fetch.rs` binary, not another suite.
- Windows multi-crate step FAILED on exactly one test, not phase 82's: `gamelib-steamcm wrap::tests::connection_log_path_is_absolute_without_a_usable_home` panicked at `crates\gamelib-steamcm\src\wrap.rs:460:13` (`None -> "/nonexistent-home\\Library/Application Support/Steam/logs/connection_log.txt"`); `303 passed; 1 failed; 3 ignored`. The test came from Phase 79 (`179ac05b7`, 2026-11-16), a macOS path assumption on Windows (`/nonexistent-home` and `/Users/u` are not absolute paths on Windows).
- UNOBSERVED on Windows because of that failure: cargo stops at the first failing test binary (no `--no-fail-fast`), and the failing binary was `gamelib-steamcm --lib`, so the remaining test binaries in that step never ran on Windows: `gamelib-steamcm` `tests/golden.rs` and `tests/vent_api_shapes.rs`, `gamelib-steamcm-cli`, all `gamelib-steampoll` and `gamelib-steampoll-cli` suites, and `gamelib-i18n`. Plus the Windows static codec linkage, Tauri shell test and clippy ratchet. A fix for the steamcm test can therefore expose further Windows reds; each needs its own CI round.
- Test (`test.yml`) at `064d8f5c7`: `Test Suites: 5 failed, 10 skipped, 1090 passed, 1095 of 1105 total`, `Tests: 31 failed, 190 skipped, 23024 passed, 23245 total` (25 of the 31 are the C harness's per-case `PASS` rows that all fail together when the harness exits non-zero). The 5 are: `diPhaseGates.test.ts` and `moduleStateCensus.test.ts` (the shimCoverage module-state red), `steamLaunchRuntime.test.ts` (3 tests, Linux), `meta/__tests__/callbackRegistryHost.test.ts` (Linux), and a NEW load flake `sharedRedistInstall.test.ts` ("restores after an installer timeout", `Exceeded timeout of 5000 ms`). At `e4f5c0e45` (run 44781299279) the same job reported `4 failed` (the first four of these); `sharedRedistInstall` passed there.
- Supply-chain audit at `064d8f5c7`: `cargo-deny` red on two new advisories against `zip 4.6.1` (RUSTSEC-2026-0545 and RUSTSEC-2026-0548), reached only through `tauri-plugin-updater 2.10.1` (`zip = '^4'`). See the Decision brief.

## CI proof, 82-12 fix rounds

Push authority for these rounds was a standing operator grant (fast-forward only, hook never bypassed, at most 4 rounds). Local main also carried other sessions' commits each push, listed per round.

### Round 1: `633217fa8bf8b3e1931ab4867d926a915633556d` (pushed `064d8f5c7..633217fa8`, 2026-11-21)

Carried besides the 82-12 commits: `2c72b10a7`, `f16f58990`, `7c61e07e0`, `2e443f0e6` (quick-261121-97s, another session).

| Workflow | Run | Conclusion |
| --- | --- | --- |
| Rust test | 44788203590 | failure (windows clippy ratchet only; macos and ubuntu all green) |
| Test | 44788203604 | failure (1 suite: `callbackRegistryHost`) |
| Code check | 44788203627 | success |
| Lint | 44788203639 | success |
| Supply-chain audit | 44788203665 | success (e: the two advisories are ignored; `cargo-deny` green) |

Observed fixed at this sha: (a) `moduleStateCensus` and `diPhaseGates` pass on the Linux Test job; (c) `steamLaunchRuntime.test.ts` passes on Linux; (b) the Windows multi-crate step (`gamelib-steamcm` `wrap` test, then `golden.rs`, `vent_api_shapes.rs`, the CLI crates, all `gamelib-steampoll` and `gamelib-i18n` suites) passes for the first time, and so do the Windows static codec linkage and Tauri shell test; (e) Supply-chain audit is green. Test: `Test Suites: 1 failed, 10 skipped, 1094 passed, 1095 of 1105 total`.

Reds found at round 1, both second diagnoses (no retirement):

1. `callbackRegistryHost` (Linux): `cr_buffer_zeroed` now passes (the first Linux observation of the live-memory scan), but the harness stops at its first failure and the red moved to `FAIL no_hold_168 left == 0:912`. Three more cases (`buffer_zeroed`, `no_hold_168`, `mms_unknown_handle_dropped`) scan a drain buffer through a pointer into the registry's dead stack frame; `no_hold_168` passed at `064d8f5c7` and failed at `633217fa8` with no registry change, which confirms the cause is stack layout rather than a missing zeroing. Fix: those cases run `gl_cb_run_callbacks` on a pthread whose stack is a harness-owned block (`9ab56bdbe`).
2. Windows clippy ratchet (reached for the first time because the steamcm test now passes): `dead_code: 8 found, ceiling is 5` and `unused_imports: 1, no ceiling`. The three new `dead_code` and the import are `gamelib-safety/src/safe_path.rs:189 flip_ascii_case` (only the unix probe calls it) and `gamelib-depot/tests/post.rs` `LAUNCHER`, `elf`, `apply_elf_fallback` (only cfg(unix) tests use them). Fix: `#[cfg(unix)]` on each, ceilings untouched (`b7a411b6a`). `cargo clippy --target x86_64-pc-windows-msvc -p gamelib-safety --all-targets` is clean locally; gamelib-depot cannot be cross-checked on this host (`ring`'s C build needs a Windows sysroot).

### Round 2: `964e2b7f73d8239850c293dbe0a58e5e4a6cd3b9` (pushed `633217fa8..964e2b7f7`, 2026-11-21)

No other session's commits were carried (the three pushed were all 82-12).

| Workflow | Run | Conclusion |
| --- | --- | --- |
| Rust test | 44791256415 | SUCCESS on all three legs (ubuntu, macos, windows) |
| Test | 44791256524 | failure: one load flake, see below |
| Code check | 44791256354 | success |
| Lint | 44791256388 | success |
| Supply-chain audit | 44791256457 | success |

Rust test per leg: macos, ubuntu and windows all green. On Windows every step passed, including the multi-crate step, the static codec linkage, the Tauri shell test and the clippy ratchet (the round 1 `dead_code` and `unused_imports` reds are gone with no ceiling touched). So D-18 and D-20 are observed green on all three legs at this sha.

Test: `Test Suites: 1 failed, 10 skipped, 1094 passed, 1095 of 1105 total`, `Tests: 1 failed, 190 skipped, 23060 passed, 23251 total`. `callbackRegistryHost` is green on the Linux runner (entry (d) observed fixed). The one failure is `sharedRedistInstall.test.ts` "installer timeout > records timedOut, stops all further entries and statuses, and does not settle" (`Exceeded timeout of 5000 ms`): the same load flake as the "restores after an installer timeout" case recorded at `064d8f5c7`, a different test of the same shape (500 `setImmediate` turns under fake timers; 62/62 pass locally). Per the operator's instruction it gets a per-test timeout, applied to all three tests of that shape (`records timedOut ...`, `restores after an installer timeout`, `Graphics query times out`): 30 s, no retry, no skip.

## Decision brief (D-03)

Prepared by plan 82-12 Task 1 at HEAD `064d8f5c7` (CI runs: Rust test 44784193543, Test 44784193642, Supply-chain audit 44784193419; see "CI proof follow-up at `064d8f5c7`"). Nothing is decided here and no test or source file was changed. No suite is proposed for retirement by the executor: each red below has a concrete fix by cause, and D-03 makes fixing the default. The operator decides per entry (retire, or keep fixing). "Fix attempts so far" is none for every entry (none of these is phase 82's work and none was touched by this phase).

The D-20 depot `fetch.rs` question is closed without a decision: the three Windows cases are fixed (`a4f3660d0`) and observed green on Windows in run 44784193543 (21 passed), so nothing to retire there.

### (a) `moduleStateCensus.test.ts` and `diPhaseGates.test.ts` (shimCoverage module state)

- Suite paths: `src/backend/__tests__/moduleStateCensus.test.ts`, `src/backend/__tests__/diPhaseGates.test.ts` (case "66.3 end state ... shimCoverage.ts has no module state").
- Legs: every OS (test.yml ubuntu, and red on macOS locally at the proof head). Run 44784193642 (and 44781299279).
- Failing assertion: `module-state census is zero outside the sanctioned list (D-66.4-02) › has no site outside SANCTIONED and exactly the sanctioned counts` (`shimCoverage.ts:515 X86_NULL_OBJECT_VERSION_SET new Set`, "1 site(s), not a sanctioned file"); `diPhaseGates` expects `undefined` and receives `1`.
- Cause: `a94108e3e` (quick-261120-rdo, 2026-11-20) added `const X86_NULL_OBJECT_VERSION_SET: ReadonlySet<string> = new Set(SHIM86_NULL_OBJECT_VERSIONS)` at module level in `src/backend/storeManagers/steam/bridge/shimCoverage.ts:515`. History: the same two suites were also red in run 43496021525 (2026-11-13) and were green between, so this is a recurrence, not a long-standing red.
- Coverage lost if retired: the 66.4 end state "no module state outside the sanctioned list" for the whole backend (the census) and the shimCoverage "no module state" case. Both would stop guarding against the exact regression that just happened.
- Fix attempts so far: none.
- Recommendation: FIX. Build the set where it is used, following the file's own pattern (`shimServedInterfaceVersions()` already returns a freshly built `Map` from a function): replace the constant with `function x86NullObjectVersionSet(): ReadonlySet<string> { return new Set(SHIM86_NULL_OBJECT_VERSIONS) }` and call it at the three read sites (`shimCoverage.ts:593`, `:717`, `:738`). `SHIM_EXPORT_SET_VERSION` (`:589`) is a computed string, not a Set/Map, and the census does not flag it today. Do not add `shimCoverage.ts` to `SANCTIONED` (that widens the baseline D-03 forbids widening).

### (b) `gamelib-steamcm wrap::tests::connection_log_path_is_absolute_without_a_usable_home` (Windows leg)

- Suite path: `src-tauri/crates/gamelib-steamcm/src/wrap.rs` (test at line 457).
- Leg: windows-latest only (ubuntu and macOS pass). Run 44784193543.
- Failing assertion: `wrap.rs:460:13` `assert!(p.is_absolute(), "{home:?} -> {p:?}")` with `None -> "/nonexistent-home\\Library/Application Support/Steam/logs/connection_log.txt"`; `303 passed; 1 failed; 3 ignored`.
- Cause: Phase 79 `179ac05b7` (2026-11-16, "B/IN-04 never resolve Steam's connection_log.txt relative to the CWD"). `NO_HOME` is the POSIX literal `/nonexistent-home` and the filter uses `Path::is_absolute`, which on Windows requires a drive or UNC prefix, so the fallback path is not absolute there; the same test also feeds `/Users/u` as a "usable" home, which is not absolute on Windows either (it would fail on the next assertion once the first is fixed). The production code only reads Mac Steam's log, so this is the test and a Windows-only constant, not a runtime defect on the supported path.
- Coverage lost if retired: the B/IN-04 invariant (a missing or relative home never yields a CWD-relative log path) on Windows and, if the whole test were deleted, on every OS.
- Fix attempts so far: none.
- Recommendation: FIX, platform-aware. Make `NO_HOME` platform-correct (`#[cfg(windows)] r"C:\nonexistent-home"`, else the POSIX literal) and have the test pick an absolute home with `cfg!(windows)` (for example `C:\Users\u` versus `/Users/u`) and compare with `Path::join` rather than a hard-coded `/` string. The alternative of marking the test `#[cfg(unix)]` is smaller but drops the Windows invariant; not recommended. Proof is the next Windows CI run (cannot be run on this macOS host).
- Risk to record: the Windows multi-crate step stops at the first failing test binary, so `gamelib-steamcm` `tests/golden.rs`, `tests/vent_api_shapes.rs`, `gamelib-steamcm-cli`, all `gamelib-steampoll` and `gamelib-steampoll-cli` suites and `gamelib-i18n` have never been observed on Windows at this head. Fixing (b) may expose more Windows reds; each is a fix by cause, never a retirement without a fresh decision.

### (c) `steamLaunchRuntime.test.ts` (3 raise-loop tests, Linux leg)

- Suite path: `src/backend/storeManagers/steam/__tests__/steamLaunchRuntime.test.ts`.
- Leg: ubuntu-latest (the Test workflow's only OS). Run 44784193642. Green on macOS.
- Failing assertions (all `expect(clock.pendingCount()).toBe(1)` receiving `0`): `sleeps on the injected clock and cancelRaiseLoops clears every pending timer` (`:141`), `a fresh loop after a cancel is not suppressed (the flag resets per loop)` (`:159`), `the cancel of one runtime leaves another runtime loop untouched` (`:175`).
- Cause (reproduced locally): `raiseLoop` in `src/backend/storeManagers/steam/bottledSteam.ts` returns immediately when `!isMac` (it imports `isMac` from `backend/constants/environment`, `process.platform === 'darwin'`, "No-op on Linux/Windows"), so on Linux the loop never calls `clock.setTimeout` and the test sees zero pending timers. Reproduced by forcing `process.platform` to `linux` for the jest process (`NODE_OPTIONS=--require <file that defines process.platform = 'linux'>`, in-band): the same 3 tests fail with `Expected: 1 Received: 0` at the same lines; 6 other tests in the file pass. The tests assume macOS without saying so.
- History correction: the earlier note in this ledger attributes this red to `0c5c35a32` (66.4-06). It is older than that: the suite is red on Linux in every retained Test run back to run 43273759425 (2026-11-12), and the Test workflow has had no green run in the 30 most recent runs (back to 2026-11-12). So it is pre-existing and never was green on the Linux leg; it predates phase 82 and the three other Linux/CI reds in this brief.
- Coverage lost if retired: the only behavioural proof that the bottled-Steam raise loop sleeps on the injected clock, that `cancelRaiseLoops` clears every pending timer, that a fresh loop after a cancel is not suppressed, and that cancelling one runtime leaves another untouched (66.4-06 D-05).
- Fix attempts so far: none.
- Recommendation: FIX by dependency injection, the pattern the surrounding code already uses (`platform: NodeJS.Platform` is injected in `steamProcesses.ts`, `adoptionStatus.ts`, `macSteamAdoption.ts`): add an optional `platform` (default `process.platform`) to `createBottledSteamRaiser` and `SteamLaunchRuntimeDeps`, have `raiseLoop` test `platform === 'darwin'` instead of the dynamic `isMac` import, and pass `platform: 'darwin'` in the three tests. This adds no `jest.mock` (the `backend-di-ceilings` jestMock ceiling is 1865 and must not grow). Verify the same way as the reproduction (platform forced to linux) plus the macOS run; also re-run `games.test.ts` and `externalDynamicImportGate.test.ts`, which reference `raiseFrontmostBottledProcess`.

### (d) `meta/__tests__/callbackRegistryHost.test.ts` (`cr_buffer_zeroed`, Linux leg)

- Suite path: `meta/__tests__/callbackRegistryHost.test.ts` (harness `meta/__tests__/fixtures/callback_registry_harness.c`, generated registry `meta/gen_vtables.ts`).
- Leg: ubuntu-latest. Run 44784193642. Green on macOS.
- Failing assertion: `FAIL cr_buffer_zeroed left == 0:1311` from the C harness (`CHECK(left == 0)`); because the harness exits non-zero every later `PASS <case>` row and the `harness exits 0 with no FAIL line` row also fail (25 of the 31 failed tests in the run are this one suite).
- Cause (diagnosed by reading, NOT reproduced: no Linux or docker on this host): `case_cr_buffer_zeroed` (harness line 1299) keeps the pointer the transport stub was handed (`g_lastcrbuf = buf`, harness line 121) and, after `gl_cb_run_callbacks()` has returned, counts bytes still equal to `0xCD` in the 2600 bytes behind it. That pointer is the generated registry's stack array (`uint8_t buf[GL_CB_DRAIN_RESP_MAX_BYTES]` in `gl_cb_run_callbacks`, `meta/gen_vtables.ts:4596`), so the harness reads a dead stack frame. The registry does zero it with a `volatile` store loop (`gl_cb_zero`, so it is not optimised away); what the harness sees afterwards depends on whatever the platform's stack layout left there. The most likely source of the 1311 leftover `0xCD` bytes on the Linux x86-64 runner is the harness's own `push_cr_raw` frame (`uint8_t tmp[2700]` memset with the seed), but that is an inference, not an observation. It passes on macOS by stack-layout luck.
- History correction: the earlier note attributes this red to `4234aa0da` (quick-261117-pfj). It is older: red on the Linux leg in every retained Test run back to run 43273759425 (2026-11-12), and the `cr_buffer_zeroed` case dates from `2071e4873` (58-10). Pre-existing, never green on the Linux leg.
- Coverage lost if retired: the only behavioural proof that the call-result drain buffer (which can hold a game's call-result data) is zeroed after use. Retiring the whole suite would also drop the other 49 passing harness cases (lock discipline, re-entrancy, throttling, relay dispatch).
- Fix attempts so far: none.
- Recommendation: FIX the harness, keep the suite and the case name. Observe the zeroing on live memory: in the harness's `gl_cb_transport_drain_cr` (harness lines 118-136) a later call of the drain loop receives the same `buf` after the registry has zeroed it, so on a call after the first, scan `buf` for the `0xCD` seed before writing the reply and record the count; `case_cr_buffer_zeroed` then asserts that recorded count is zero instead of reading `g_lastcrbuf` after return. The loop continues after a delivered result (it breaks only on `r <= 0`), so a second transport call with the zeroed buffer exists in this case. Because the cause is diagnosed rather than reproduced, the proof is the Linux leg of the next CI run; if that still reds, the next step is a second diagnosis, not retirement.

### (e) Supply-chain audit, `cargo-deny` (not a test suite)

- Workflow: `Supply-chain audit`, job `cargo-deny`, run 44784193419. The `pnpm-audit` job is success (its step is warn-only).
- Failing check: `advisories FAILED` for `zip 4.6.1` (`src-tauri/Cargo.lock:651`): RUSTSEC-2026-0545 (WinZip AES entries returned without checking the authentication code; needs the `aes-crypto` feature and `ZipArchive::by_name_decrypt`) and RUSTSEC-2026-0548 (`ZipStreamReader` extracts under local-header names that can differ from the central directory; the fix is opt-in). Also two yanked-crate warnings (`async-executor 1.14.0`, `clipboard-win 5.4.1`), which are warn-only by `deny.toml`.
- Cause: not a code change in this repo. The advisory DB is fetched at run time (`deny.toml` header says the job "can go red with no change in this repo"). `zip 4.6.1` is reached only through `tauri-plugin-updater 2.10.1` (`zip = '^4'`); `cargo info` shows 2.10.1 is the latest stable (3.0.0-alpha.3 is the next), so it cannot be upgraded through the lockfile. Red since at least `826373aa0` (run 44671043932), before this phase's push.
- Established convention in this file: `src-tauri/deny.toml` already carries `ignore` entries with written reasons for the earlier `zip 4.x` advisories (RUSTSEC-2026-0367, -0368, -0369, -0429, all "reachable only through tauri-plugin-updater's extract path; nothing in GameLib invokes the updater ... Revisit when tauri-plugin-updater adopts zip >= 9"), plus `rsa` and `protobuf` entries pinned by `steam-vent`.
- Coverage lost if "retired": retirement does not apply; the choice is to accept the risk with a recorded reason, or leave the audit red.
- Fix attempts so far: none.
- Recommendation: FIX as the file already does it: add `RUSTSEC-2026-0545` and `RUSTSEC-2026-0548` to the `ignore` list in `src-tauri/deny.toml`, with the same reason text as the four `zip 4.x` entries (updater extract path only; no GameLib caller; AES path also needs `by_name_decrypt` with the `aes-crypto` feature). This is a standing documented risk acceptance, not a baseline widening in the D-03 sense, but it is the operator's call: say so if you would rather leave the audit red or pin `tauri-plugin-updater` differently.

### Operator decisions (D-03), 2026-11-21

The operator decided each entry on 2026-11-21: **keep fixing (a), (b), (c), (d) and (e); retire nothing.** No suite was deleted, skipped or put on a known-red list. Constraints the operator set per entry, and what was done (fix commits are filled in below as they land; CI proof is in "CI proof, 82-12 fix rounds"):

| Entry | Decision (2026-11-21) | Fix as decided | Commit |
| --- | --- | --- | --- |
| (a) `moduleStateCensus` + `diPhaseGates` | keep-fixing | build the set inside a function (`x86NullObjectVersionSet()`, like `shimServedInterfaceVersions()`), call sites updated, `shimCoverage.ts` NOT added to `SANCTIONED`. Local proof: both suites and `shimCoverage.test.ts` green (293 tests) | `11996d3ed` |
| (b) `gamelib-steamcm` `wrap::tests::connection_log_path_is_absolute_without_a_usable_home` | keep-fixing | `NO_HOME` is `cfg(windows)`-absolute (`C:\nonexistent-home`), the test picks an absolute usable home per OS with `cfg!(windows)`; the Windows invariant is kept, no `#[cfg(unix)]` gate. Local proof: macOS `cargo test -p gamelib-steamcm` (309 passed) and clippy `-D warnings`; Windows proof is CI | `8f32bcb9d` |
| (c) `steamLaunchRuntime.test.ts` (Linux) | keep-fixing | optional `platform` (default `process.platform`) injected into `createBottledSteamRaiser` and `SteamLaunchRuntimeDeps`; the raise-loop tests (and `bottledSteam.test.ts`'s raiser) pass `'darwin'`; no new `jest.mock`. Local proof: macOS green; the forced-linux reproduction (`process.platform` = linux for the jest process) now passes the two files (26 tests) and the whole steam `__tests__` tree (105 suites, 2724 passed) | `eac686d51` |
| (d) `callbackRegistryHost.test.ts` `cr_buffer_zeroed` (Linux) | keep-fixing | zeroing observed on live memory: the transport stub scans the buffer the registry hands back to a later pull of the same run (exactly `cap` bytes); the case keeps its name and also proves the seed was present. Mutation check: with `gl_cb_zero(crbuf, ...)` removed from `gen_vtables.ts` the case fails (`g_crresidue == 0`), restored after. Proof: Linux CI; if still red, a second diagnosis, not retirement | `5ff4c193c` |
| (e) `cargo-deny` zip 4.6.1 | operator ACCEPTS the risk | `RUSTSEC-2026-0545` and `RUSTSEC-2026-0548` added to `src-tauri/deny.toml` `ignore` with the same reason text as the earlier zip 4.x entries (only `tauri-plugin-updater 2.10.1`, latest stable, reaches zip 4.6.1). `cargo-deny` is not installed on this host; the TOML parses (8 entries); proof is the Supply-chain audit run | `606d761ac` |

Correction to entry (d) above: `FAIL cr_buffer_zeroed left == 0:1311` carries the harness SOURCE LINE (1311, the `CHECK(left == 0)`), not a count of 1311 leftover bytes; the earlier "1311 leftover `0xCD` bytes" wording was a misreading. The over-read is also worth noting: the case scanned 2600 bytes of a 2596-byte buffer (`GL_CR_DRAIN_RESP_MAX_BYTES` = 4+8+4+4+4+2572), so it read four bytes of neighbouring dead stack as well.

`sharedRedistInstall`'s "restores after an installer timeout" case: the operator asked for a per-test timeout only if it reds again; it has not (this plan), so nothing was changed.

### Load flakes, not reds

Each passes alone and does not count against FND-01 criterion 1; the fix direction is a race or timeout repair, never retirement.

- `src/backend/tools/__tests__/dxvkInstallRemove.test.ts` (`ENOTEMPTY` in the `afterEach` `rmSync` under load).
- `src/frontend/.../steamLoginPollLifecycle.test.tsx` (5 s timeouts under load).
- `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` (5 s timeout under load).
- the `meta/runTs.__probe__.cjs` `ENOENT` race: fixed in `steamCmPortComplete` and `steamPollsPortComplete`; `depotPortComplete.test.ts` and `steamFilesPortComplete.test.ts` still walk `meta/` with no probe skip, so the latent race remains.
- NEW at `064d8f5c7`: `src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts` ("null display window (261027-nd3) › restores after an installer timeout", `Exceeded timeout of 5000 ms`, followed by the "import a file after the Jest environment has been torn down" noise). 62/62 pass locally, three runs, and 62/62 with the platform forced to linux; passed in the previous CI run at `e4f5c0e45`. It spins up to 500 `setImmediate` turns waiting for the installer call under fake timers, which a loaded shared runner can stretch past 5 s. Fix direction if it reds again: a per-test timeout on that case, not retirement.

### Phase 82 items not delivered (kept visible, not this plan's to fix)

- 82-04: `src/backend/sidecar/fileStore.ts` was NOT deleted (about 27 sidecar jest suites still `requireActual('../fileStore')` through `store_backend` mocks); follow-up todo `.planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md`.
- 82-13: `src/common/types/proxy-types.ts` kept (the only declaration of the global `Window.api` type; deleting it adds 808 TS errors).
- The live sidecar-to-shell safety round trip was never exercised (82-05/07/08/09 all used `fakeSafetyRustInvoke`).
