---
phase: 86-pure-leaf-services
plan: 24
subsystem: info-wiki-crossover-delete
tags: [wiki, umu, crossover, delete, store-table, extra-rows, d-13, d-18, d-29, oracle-retired, gate, knip]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-19 CrossOver in Rust and the D-24 getCrossoverIndex resolver; 86-22 wiki in Rust; 86-23 the last TS callers turned into shims/resolver (getUmuId, clearWikiGameInfoCache, getWikiGameInfo); 86-05 the gate scans; 86-11/86-17 the D-29 row 5 pattern"
provides:
  - "src/backend/wiki_game_info (with umu, HLTB, the store family) and src/backend/crossover_index are deleted; the wiki and CrossOver oracle tests, the oracle recorder and harness, meta/measureCrossoverMatching.ts and two DI ceiling shards go with them"
  - "meta/genStoreTable.ts EXTRA_ROWS keeps store_cache/crossover_index, store_cache/umu and store_cache/wikigameinfo (tsNames unchanged); src/common/types/ipc/storeTable.json is byte-identical"
  - "AppRuntime has no crossover members; createAppRuntime() and createTestAppRuntime() take no arguments; InfoCaches is { systemInfo } (the HLTB credentials are Rust's)"
  - "infoPortComplete.test.ts describes wikiPortComplete, crossoverPortComplete and oraclePortComplete: with the seven earlier describes every ported slice has a delete gate (SC4)"
affects: [86-25, 86-26]

actuals:
  tokens: 6100
  tasks: 3
  commits: 4

plan_head_before: 7c6461d5906192ec4ff57e3be0f60ea436747b3a
plan_head_after: 81fd93a07
commits: 4

key-files:
  created: []
  modified:
    - meta/genStoreTable.ts
    - src/backend/appRuntime.ts
    - src/backend/stores/createStores.ts
    - src/backend/services/types.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/testUtils/testAppRuntime.ts
    - src/backend/testUtils/testEpicAmazonRuntimes.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
    - src/backend/storeManagers/nile/games.ts
    - src/common/types.ts
    - src/backend/__tests__/infoPortComplete.test.ts
    - src-tauri/src/main.rs
  deleted:
    - src/backend/wiki_game_info/
    - src/backend/crossover_index/
    - src/backend/info/__tests__/oracle/
    - meta/measureCrossoverMatching.ts
    - meta/backendDiCeilings/wiki_game_info.json
    - meta/backendDiCeilings/crossover_index.json

key-decisions:
  - "D-29 row 5 done in one commit with the deletion: the three cache rows moved to EXTRA_ROWS with their tsNames; `node meta/runTs.cjs ... meta/genStoreTable.ts --check` and `git diff --quiet -- src/common/types/ipc/storeTable.json` both clean, so the Rust host opens all three caches unchanged and the renderer's wiki read still resolves `wikigameinfo` through ts_names."
  - "meta/measureCrossoverMatching.ts is deleted, not kept: it was a Phase 19 one-off measurement harness (its result is recorded in Phase 19), knip listed it as an unused file, and its only import target (crossover_index/normalize) is gone."
  - "The oracle tests for wiki and crossover were deleted in Task 1, not Task 3, because they import the deleted modules and `pnpm codecheck` had to stay green at the deletion commit (the plan's own truth). Task 3 then removed the recorder and harness, the last oracle files."
  - "createAppRuntime lost its `{clock, paths}` argument: the CrossOver fetcher was its only reader, so keeping it would have left unused parameters. createTestAppRuntime lost its options for the same reason (no test used them outside the deleted crossover cases)."
  - "The foreign-dirty sidecar/handlers.ts still passes `infoCaches` and `appRuntime` to registerEnrichmentFlows and registerShortcutsFlows (object literals, so an undeclared key is a type error). Both stay on those two deps types as inert `?: unknown` members; `INERT_DEPS_EXEMPT` in infoPortComplete.test.ts pins the exact file set so the list can only shrink (the 86-15/86-17 pattern)."
  - "The umu store-name drift check in runnerCapabilities.test.ts was dropped: its only counterpart was the `storeMapping` const in the deleted umu/utils.ts, so runnerCapabilities.json is now the sole source and the Rust golden umu cases pin the names it yields."

patterns-established:
  - "The wiki-only wiki source shapes in common/types.ts (GameScoreInfo, AppleGamingWikiInfo, CodeweaversInfo, GamesDBInfo, SteamInfo, WikiSourceOutcome, HowLongToBeatOutcome) are module-private now; the deleted modules were their only importers."

requirements-completed: []

coverage:
  - id: E1
    description: "src/backend/wiki_game_info and src/backend/crossover_index are deleted together in one compile-green commit with the crossoverIndex app-runtime slot, the wikiGameInfo/crossoverIndex store families and infoCaches.hltb"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "fcf981590: pnpm codecheck exit 0; wikiPortComplete and crossoverPortComplete deleted-path cases"
        status: pass
    human_judgment: false
  - id: E2
    description: "the three cache rows move to EXTRA_ROWS unchanged and storeTable.json is byte-identical"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "genStoreTable --check; git diff --quiet -- src/common/types/ipc/storeTable.json; storeTable.test.ts; storeRowKeys cases in wikiPortComplete and crossoverPortComplete"
        status: pass
    human_judgment: false
  - id: E3
    description: "the oracle recorder and harness are gone; every golden, recording and state profile and fixtureRedaction.test.ts stay, and the Rust suite still passes with every fixture"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-info --features testing: 360 passed, 0 failed; oraclePortComplete (no oracle dir, eight MANIFEST.json files); fixtureRedaction.test.ts"
        status: pass
    human_judgment: false
  - id: E4
    description: "getCrossoverIndex keeps exactly one TS registration, a forward to the scheduled D-24 resolver; getWikiGameInfo has none"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "crossoverPortComplete and wikiPortComplete; infoShimSchedule.test.ts"
        status: pass
    human_judgment: false
  - id: E5
    description: "no TS implementation of any ported slice remains; only scheduled shims and resolvers reach Rust (SC4)"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "infoPortComplete.test.ts: a describe per slice (imagesCache, recentGames, gameOverrides, anticheat, steamgrid, storeSearch, discounts, wiki, crossover) plus oraclePortComplete: infoPortComplete, infoShimSchedule and fixtureRedaction together run 244 tests, all passing"
        status: pass
    human_judgment: false

duration: about 1h
completed: 2026-11-23
status: complete
---

# Phase 86 Plan 24: Delete the TS wiki and CrossOver index slices Summary

**The TS wiki game info (with umu and HowLongToBeat) and CrossOver index modules are deleted in one compile-green commit together with their store families, the AppRuntime crossover slots and the HLTB credentials cache; the three cache rows live on in `genStoreTable.ts` EXTRA_ROWS with `storeTable.json` byte-identical, the oracle harness is retired with its last test, and `wikiPortComplete`, `crossoverPortComplete` and `oraclePortComplete` close the delete gate for every ported slice.**

## Performance

- **Tasks:** 3 (one tracer, two auto), plus the pre-task lint fix commit
- **Tracer gate:** `blocking-human` was not set and no auto mode was active (`AUTO_CHAIN`/`AUTO_CFG` not true; `HUMAN_VERIFY_MODE` default `end-of-phase`). The tracer's `<verify>` is automated-only, so it was re-run end to end after the commit: the generator `--check`, `git diff --quiet` on storeTable.json, `pnpm codecheck` (0 errors), the stores/kinds/appRuntime jest set and prettier all passed, and the whole Backend project then passed (609 suites, with only the two census floors below needing their measured updates). `Tracer verified end-to-end -- expanding`.
- **Whole jest suite (all six projects), run before the docs commit:** 1125 suites passed, 5 skipped, 1 failed; 24376 tests passed, 30 skipped, 1 failed. The one failure is foreign, see Issues Encountered.
- **`pnpm lint`:** 0 errors, 855 warnings (the one error that existed at plan start is fixed, see Deviations).
- **`pnpm codecheck`:** clean (main and meta tsconfigs, 0 errors).
- **Also run:** `pnpm find-deadcode` PASS (310 baselined findings, was 312); `pnpm backend-di-ceilings` fails only on the two known foreign files (`optInDlc.test.ts`, `libraryStoreFollowers.test.ts`); `cargo test -p gamelib-info --features testing` 360 passed, 0 failed; `rustfmt --edition 2021 --check src/main.rs` shows no hunk outside the generated `ipc_contract.rs`.

## Accomplishments

- Deleted `src/backend/wiki_game_info/` (wiki_game_info.ts, stores.ts, umu, howlongtobeat with titleMatch, pcgamingwiki, applegamingwiki, codeweavers, gamesdb, protondb, steamdeck, the manual mock and every test) and `src/backend/crossover_index/` (index, fetcher, ratingMap, normalize, schema, stores and tests): 41 files, about 7.7k lines.
- Removed the `crossoverIndex` and `wikiGameInfo` store families from createStores, `Stores`, testServices (STORE_KEYS and familyBuilders) and `registeredStores.json`; the `crossoverFetcher`/`crossoverIndex` members and the `{clock, paths}` argument from AppRuntime; `infoCaches.hltb` and `createHltbCredentials` from services, bootstrap and the test runtimes.
- Moved `store_cache/crossover_index`, `store_cache/umu` and `store_cache/wikigameinfo` into EXTRA_ROWS with a comment naming why; regenerated with `--check`; `storeTable.json` did not change.
- Retired the oracle recorder and harness (D-11): every golden, recorded and state fixture and `fixtureRedaction.test.ts` are kept.
- Added the three gate describes. `forwardRegistrationProblems(source, channel, resolver)` generalises the 86-18 registration check so `getCrossoverIndex` is proven to be one forwarded call with no other call in its arguments; the resolver shape and the one `RUST_INFO_CROSSOVER_RATING_MAP` call site are pinned.
- Updated every census and shape test to the new tree and recorded each moved floor with its measured reason.

## Task Commits

1. **Pre-task fix:** `618c50302` fix(86-15): drop the unused config binding left in the secret-stores boot step
2. **Task 1 (tracer):** `fcf981590` feat(86-24): delete the TS wiki game info and CrossOver index slices with their store families and runtime slots
3. **Task 2:** `abd2edc4e` chore(86-24): census comments, test call sites and dead wiki source types after the TS wiki and CrossOver deletion
4. **Task 3:** `81fd93a07` feat(86-24): retire the oracle harness and add the wiki, crossover and oracle gate describes

## Floors and baselines that moved (each tracks a list this plan shrank; none lowered to turn a run green)

| Gate | From | To | Why |
| --- | --- | --- | --- |
| diPhaseGates stores modules (count / floor with index.ts) | 13 / 14 | 11 / 12 | crossover_index/stores.ts and wiki_game_info/stores.ts deleted |
| diPhaseGates OWNED_66_4 floor | 71 | 68 | crossover_index/fetcher.ts, crossover_index/index.ts, wiki_game_info/howlongtobeat/utils.ts deleted |
| testServices store families | 15 | 13 | the two families deleted |
| storeKinds MIN_CONSTRUCTIONS / MIN_FILES_WITH_CONSTRUCTION | 50 / 15 | 47 / 13 | three constructions (umu, wikigameinfo, crossover_index) in two files; measured 47 and 13 |
| storeTable.test EXPECTED_KINDS names floor | 50 | 47 | the literal lost three names; measured 47 |
| backend-di-ceilings enrichmentFlows.test.ts | 9 | 8 | the crossover_index/index jest.mock was removed |
| backend-di-ceilings gogImportGame.test.ts | 19 | 18 | the umu/utils jest.mock was removed (the module is gone; getUmuId comes from info/wiki) |
| backend-di-ceilings shards | wiki_game_info.json, crossover_index.json | deleted | every file they listed is gone |
| knip baseline | 312 | 310 | crossover_index/normalize.ts duplicates line and the measureCrossoverMatching file line |
| gameInfoNarrowingBaseline | howlongtobeat/utils.ts entry (2) | removed | the file is deleted |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `pnpm lint` error at plan start: unused `config` in the `secret-stores` boot step**
- **Found during:** the pre-task check (the orchestrator named bootstrap.ts:~2784)
- **Issue:** `git log -S` showed the use of `config` was removed by `c3001289a` feat(86-15) (it dropped `config,` from the argument object of the SteamGridDB migration call), so a phase 86 commit introduced the dead binding. (86-23's notes dated it to 66.4-14; that was where the destructure line was written, not where it stopped being used.)
- **Fix:** removed `config` from the destructure (it was used nowhere else in that block) and let prettier collapse the destructure to one line.
- **Files modified:** src/backend/sidecar/bootstrap.ts
- **Commit:** 618c50302 (subject `fix(86-15)`, the plan that introduced it)

**2. [Rule 3 - Blocking] Wiki and crossover oracle tests, census tests and meta files moved into Task 1**
- **Issue:** the plan puts the oracle tests in Task 3 and the census/meta fixes in Task 2, but the oracle tests import the deleted modules, `meta/measureCrossoverMatching.ts` imports `crossover_index/normalize`, and several census tests pin counts, so the plan's own truth ("codecheck stays green at that commit") and the tracer's `<verify>` required them in the deletion commit.
- **Fix:** deleted both oracle tests and the meta script, updated diPhaseGates, bootSourceShape, storeKinds, storeTable, storeMirrorSchedule, cacheFamily, createStores, testServices, nativeChannelOwnership, enrichmentFlows (mock removed), gogImportGame (mock removed), runnerCapabilities, the narrowing baseline, the knip baseline and the main.rs comment in `fcf981590`. Task 2 and Task 3 then held what was left.
- **Commit:** fcf981590

**3. [Rule 3 - Blocking] `pnpm find-deadcode` failed on nine newly dead exports in src/common/types.ts**
- **Issue:** `GameScoreInfo`, `AppleGamingWikiInfo`, `CodeweaversInfo`, `GamesDBInfo`, `SteamInfo`, `WikiSourceOutcome` and `HowLongToBeatOutcome` were imported only by the deleted modules; `ProtonDBCompatibilityInfo` and `SteamDeckComp` by nothing now.
- **Fix:** un-exported the seven still used by `WikiInfo` (the repo's own precedent for `WikiFetchStatus`), deleted the two unused types. Baseline did not need a new entry.
- **Files modified:** src/common/types.ts
- **Commit:** abd2edc4e

**4. [Rule 1 - Bug] storeKinds, storeTable, diPhaseGates and testServices floors tracked deleted lists**
- **Issue:** the Backend run after Task 1 failed `storeKinds` (constructions 47 < 50, files 13 < 15) and `storeTable.test` (47 names < 50).
- **Fix:** lowered each to the measured value with a dated comment naming the deleted files (table above). The floors provably track lists this plan shrank.
- **Commit:** fcf981590

### Decisions recorded as the plan asked

- `meta/measureCrossoverMatching.ts` deleted: see key-decisions.
- The `getCrossoverIndex` entry in nativeChannelOwnership's MULTI_REGISTRATION was removed: its second file (crossover_index/crossoverRatingMap.ts) is gone, so the channel now has one file like any other.

**Total deviations:** 4 auto-fixed (2 Rule 1, 2 Rule 3). **Impact:** none on scope; all follow from the deletion.

## Issues Encountered

- **FOREIGN, not fixed (a never-touch path):** `meta/__tests__/genI18nGateScope.test.ts` "A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation" fails in the whole-repo run (and alone). The live derivation lists `src/frontend/components/UI/WikiGameInfo/components/HowLongToBeat/index.tsx`, which `3dbdd45c4` (86-23) modified to import `HeroicHowLongToBeatEntry` from `common/`, so it became fork-touched; the committed list was not refreshed. No file of this plan is a frontend file. `meta/i18n*` is on the do-not-touch list for this run, so the fix is owed: run `pnpm gen-i18n-gate-scope` and commit `meta/i18nForkTouchedFiles.json` (and `i18nGateScope.json` if the generator moves it), as `ee1995796` did for the DLC files. Logged in deferred-items.md.
- The Rust shell was not rebuilt: the only change in `src-tauri/src/main.rs` is a comment on the `getCrossoverIndex` LONG_RUNNING_CHANNELS entry (it now names `src/backend/info/crossover.ts`). `rustfmt --edition 2021 --check` is clean for it.
- A Rust golden proving the wiki or CrossOver behaviour was not re-recorded: every golden and recording is unchanged and `cargo test -p gamelib-info --features testing` passes against all of them.

## OWED (foreign-dirty `sidecar/handlers.ts`)

`handlers.ts` still passes `infoCaches` and `appRuntime` to `registerShortcutsFlows` and `infoCaches` to `registerEnrichmentFlows`, plus the earlier `steamGridSecrets`, `itadSecrets` and `miscRuntime` leftovers. The members stay as inert `?: unknown` on `ShortcutsFlowDeps` and `EnrichmentFlowDeps`; `INERT_DEPS_EXEMPT` (infoPortComplete.test.ts) names exactly those two files. Once handlers.ts is clean: delete the three lines there, the two inert members, empty `INERT_DEPS_EXEMPT`, `STEAMGRID_SECRETS_EXEMPT` and `ITAD_SECRETS_EXEMPT`, and make `ClearCacheDeps.requestRustInvoke` required (86-23).

## Known Stubs

None. The inert `?: unknown` members are declared, exact-listed compatibility seams for a file this session may not edit, not stubbed behaviour.

## Threat Flags

None. No new endpoint, auth path or trust boundary; T-86-58 (the store rows) is mitigated by the byte-identical `storeTable.json` plus the generator `--check`, and T-86-59 by the nine slice describes, `oraclePortComplete` and the unchanged schedule set-equality.

## Next Phase Readiness

- 86-25 and 86-26 can rely on: no TS wiki, umu, HLTB or CrossOver index implementation exists; `info/wiki.ts` and `info/crossover.ts` are the only TS paths, each scheduled; the Rust host still owns the three caches.
- Open items for the closing plans: the i18n fork-touched artifact refresh (above), the handlers.ts clean-up (above), and the two foreign backend-di-ceilings files.

## Self-Check: PASSED

- FOUND: commits 618c50302, fcf981590, abd2edc4e, 81fd93a07 are on HEAD.
- Deleted and gone: `src/backend/wiki_game_info`, `src/backend/crossover_index`, `src/backend/info/__tests__/oracle`, `meta/measureCrossoverMatching.ts`.
- FOUND: `src/backend/__tests__/infoPortComplete.test.ts` holds `wikiPortComplete`, `crossoverPortComplete` and `oraclePortComplete`; `meta/genStoreTable.ts` holds the three EXTRA_ROWS names; golden `MANIFEST.json` exists for all eight slices.
