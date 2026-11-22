---
phase: 86-pure-leaf-services
plan: 23
subsystem: info-wiki-callers
tags: [wiki, umu, shim, resolver, clear-cache, rustinvoke, d-04, d-05, d-06, d-24, hltb-type, schedule]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-20 info_umu_get (RUST_INFO_UMU_GET); 86-22 info_wiki_get / info_wiki_cache_clear (RUST_INFO_WIKI_GET, RUST_INFO_WIKI_CACHE_CLEAR) with no TS caller; 86-05 infoShimSchedule and the shim-shape checker; 86-18 and 86-19 resolver conventions"
provides:
  - "src/backend/info/wiki.ts: getUmuId and clearWikiGameInfoCache (one-call shims, resolve unknown) and getWikiGameInfo (D-24 resolver: const title/appName/runner, one call)"
  - "gog, nile and legendary games.ts get their umu id from Rust; nonesteamgame.ts gets its wiki entry from Rust; utils.ts clearCache starts the Rust wiki-cache clear fire-and-forget (rejection logged, signature unchanged)"
  - "HeroicHowLongToBeatEntry lives in src/common/types.ts (the frontend component and the TS HLTB utils import it from there)"
  - "infoShimSchedule rows getUmuId (92), getWikiGameInfo (resolver, 94), clearWikiGameInfoCache (98); sidecarHarness answers the three channels by default"
affects: [86-24]

actuals:
  tokens: 5400
  tasks: 2
  commits: 3

plan_head_before: acee3c24e6317bb1556d25599a98338b7cb266bd
plan_head_after: 3dbdd45c446d7b2dc1f89205a2afbc822bb57778
commits: 3

key-files:
  created:
    - src/backend/info/wiki.ts
    - src/backend/info/__tests__/wiki.test.ts
    - src/backend/__tests__/clearCacheWiki.test.ts
  modified:
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/storeManagers/legendary/games.ts
    - src/backend/storeManagers/legendary/user.ts
    - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
    - src/backend/utils.ts
    - src/backend/sidecar/runnerAuthFlowRegistration.ts
    - src/common/types.ts
    - src/frontend/components/UI/WikiGameInfo/components/HowLongToBeat/index.tsx
    - src/backend/wiki_game_info/howlongtobeat/utils.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/shortcuts/nonesteamgame/__tests__/nonesteamgame.test.ts
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
    - src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts
    - meta/backendDiCeilings/shortcuts.json
    - meta/backendDiCeilings/sidecar.json
    - .planning/phases/86-pure-leaf-services/deferred-items.md

key-decisions:
  - "The shims and the resolver resolve `unknown` and their callers state the shape (`as string | null`, `as WikiInfo | null`), because the shim-shape checker does not unwrap an `as` cast: the plan's `Promise<string | null>` signature for getUmuId was not usable."
  - "`getWikiGameInfo`'s Rust op already answers null for every source failure (86-22), so the nonesteamgame caller adds no catch; a rejection means bad arguments or a missing transport and surfaces as before for any failed shortcut add."
  - "`ClearCacheDeps.requestRustInvoke` is OPTIONAL (Partial<RustInvokeDeps>), not required as the plan wrote. The renderer's clearCache path (shellFilesFlowRegistration) already carries it. The three per-library sign-out paths (GOGUser, NileUser, LegendaryUser) take deps built by runnerAuthFlowRegistration.ts, whose only caller sidecar/handlers.ts is foreign-dirty and does not pass it; a required member failed codecheck there. Those paths now leave the wiki cache as it is. OWED, recorded below."
  - "NonSteamGameDeps keeps its now-unread `stores.wikiGameInfo`, `stores.crossoverIndex`, `infoCaches` and `appRuntime` (shortcutsFlowRegistration and handlers.ts still supply them); `appRuntime` is declared inline from CrossoverIndexLookups so the file no longer imports wiki_game_info. They go with 86-24."

patterns-established:
  - "A test of a shim caller answers the Rust channel through the injected requestRustInvoke (a small wrapper over stubRustSteamFiles) instead of jest.mock of the TS service, which also lowers that file's backend-di-ceilings jestMock count."

requirements-completed: []

coverage:
  - id: D1
    description: "getUmuId is a one-call shim to RUST_INFO_UMU_GET, called by the GOG, Epic and Amazon Linux launch paths, with arguments the channel schema accepts for every runner"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "pnpm exec jest src/backend/info/__tests__/wiki.test.ts (getUmuId shim)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getWikiGameInfo reads only title, app name and runner from the game, makes one RUST_INFO_WIKI_GET call, and nonesteamgame.ts uses it"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "wiki.test.ts (getWikiGameInfo resolver); nonesteamgame.test.ts asserts the one wiki call sent for the game"
        status: pass
    human_judgment: false
  - id: D3
    description: "clearCache starts one RUST_INFO_WIKI_CACHE_CLEAR call, returns synchronously, logs a rejection and still clears every other family"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "src/backend/__tests__/clearCacheWiki.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "the three schedule rows exist, pass the shape and set-equality checks, and list exactly the importers of info/wiki.ts"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "pnpm exec jest src/backend/__tests__/infoShimSchedule.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "no non-test file outside src/backend/wiki_game_info imports from it except crossover_index/index.ts's pair; the type lives in common/"
    requirement: SVC-01
    verification:
      - kind: other
        ref: "grep -rl wiki_game_info src (see Verification notes)"
        status: pass
    human_judgment: false

duration: about 1h 30m
completed: 2026-11-23
status: complete
---

# Phase 86 Plan 23: The last TS callers of wiki info and umu Summary

**The GOG, Epic and Amazon launch paths take their umu id from Rust through a one-call `getUmuId` shim, the non-Steam shortcut flow takes its wiki entry through a `getWikiGameInfo` resolver, `clearCache` empties the Rust wiki cache through a fire-and-forget `clearWikiGameInfoCache` shim, and `HeroicHowLongToBeatEntry` moved to `common/`, so the TS wiki module has no callers left for 86-24 to delete.**

## Performance

- **Tasks:** 2 (one tracer, one auto), plus the pre-task fix commit
- **Tracer gate:** after Task 1 the automated verify (jest for wiki.test and infoShimSchedule, `pnpm codecheck`, prettier) passed, and the storeManagers, sidecar and gate suites passed (145 suites): `Tracer verified end-to-end -- expanding`.
- **Whole jest suite (all six projects, renderer included), run before the docs commit:** 1143 suites passed, 5 skipped; 24525 tests passed, 30 skipped; 0 failed (222 s). `pnpm codecheck` clean.

## Accomplishments

- `src/backend/info/wiki.ts`: `getUmuId(deps, appName, runner)` and `clearWikiGameInfoCache(deps)` are one typed call each; `getWikiGameInfo(deps, game, forceRefresh?)` is a D-24 resolver whose body is `const { title, app_name: appName, runner } = game.getGameInfo()` then one `RUST_INFO_WIKI_GET` call. All three are scheduled (D-06) and a test pins each call's channel, argument and that the argument passes the channel's strict schema.
- gog, nile and legendary `games.ts` import `getUmuId` from `backend/info/wiki` (grep for `wiki_game_info/umu` sums to 0). `nonesteamgame.ts` imports `getWikiGameInfo` from there and no longer imports the TS wiki module.
- `utils.ts` `clearCache` stays synchronous and starts `void clearWikiGameInfoCache(deps).catch(...)`, logging a warning on rejection; `wikiGameInfo` is gone from its stores Pick. `clearCacheWiki.test.ts` proves one call, synchronous return, the per-library clear still clears the wiki cache, a rejection is logged without throwing, and the rest of the clear still runs.
- `HeroicHowLongToBeatEntry` is defined in `src/common/types.ts`; the frontend HowLongToBeat component and the TS HLTB utils import it from there.
- `infoShimSchedule` rows: `getUmuId` (shim, deletedBy 92), `getWikiGameInfo` (resolver, inputs `title`, `appName`, `runner`, deletedBy 94), `clearWikiGameInfoCache` (shim, deletedBy 98). `callers` is checked per file, so the three rows share one `WIKI_CALLERS` list of the five importers.
- `sidecarHarness` `DEFAULT_RUST_ANSWERS` answers `info_umu_get`, `info_wiki_get` and `info_wiki_cache_clear` with null.

## Task Commits

0. **Pre-task fix: storeSearchThumbBox repointed at the Rust `thumb_of`** - `e54070132` (fix(86-17))
1. **Task 1: tracer, the getUmuId shim wired from the three store managers** - `53d2bb042` (feat)
2. **Task 2: the wiki resolver, the clear shim, the type move, the schedule rows** - `3dbdd45c4` (feat)

**Plan metadata:** the docs commit that carries this file.

## Verification notes

- `grep -c "wiki_game_info/umu"` over the three games.ts files: 0, 0, 0 (HEAD was 3).
- `grep -c "backend/wiki_game_info"` over `src/common/types.ts` and the HowLongToBeat component: 0 (HEAD was 2).
- `grep -rl "wiki_game_info" src --include='*.ts' --include='*.tsx'` outside `src/backend/wiki_game_info/`, tests and `crossover_index/` lists only files that mention it in a comment or import a different module of that directory: `Library/useWikiMetacriticScores.ts` (comment), `enrichmentFlowRegistration.ts` (comments), `utils.ts` (comment at the HLTB paragraph), `handlers.ts` (comment), `services/types.ts` (the `HltbCredentials` type from `howlongtobeat/utils` and the `wiki_game_info/stores` store type), `sidecar/bootstrap.ts` and `testUtils/testEpicAmazonRuntimes.ts` (`createHltbCredentials` from `howlongtobeat/utils`), `stores/createStores.ts` and `testUtils/testServices.ts` (`wiki_game_info/stores`). None imports `wiki_game_info/wiki_game_info.ts` or the umu utils; all of these go with 86-24's deletion of the module and its store family.
- Pins moved: `meta/backendDiCeilings/shortcuts.json` `nonesteamgame.test.ts` 4 -> 3 and `sidecar.json` `shortcutsFlows.test.ts` 6 -> 5 (one `jest.mock` each removed; both floors track a list this plan shrinks).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] storeSearchThumbBox.test.ts could not load (ENOENT)**
- **Found during:** the pre-task step (and 86-22's whole-repo jest)
- **Issue:** the suite `readFileSync`d `src/backend/storeSearch/itad.ts`, which 86-17 deleted in `43a95d91d`, to pin the thumbnail-box ratio to the asset order `banner300 > banner145 > boxart` (G-47-7).
- **Fix:** the fact moved to Rust, so the test now reads `src-tauri/crates/gamelib-info/src/itad/mapping.rs` and extracts `fn thumb_of(` instead of `function thumbOf(`; both assertions are unchanged and pass. It was repaired, not deleted, because what it guards (the CSS box ratio and the preferred asset agree) still exists. The `deferred-items.md` entry now says resolved.
- **Files modified:** `src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts`, `.planning/phases/86-pure-leaf-services/deferred-items.md`
- **Commit:** `e54070132`

**2. [Rule 3 - Blocking] `getUmuId` resolves `unknown`, not `string | null`**
- The plan's signature returned `Promise<string | null>`; the shim-shape checker does not unwrap an `as` cast, so the shim returns `Promise<unknown>` and the three callers write `as string | null`. Same for the resolver (`as WikiInfo | null`).

**3. [Rule 3 - Blocking] `requestRustInvoke` is optional on `ClearCacheDeps`; three more files touched**
- **Found during:** Task 2 (`pnpm codecheck`)
- **Issue:** the plan added `RustInvokeDeps` to `ClearCacheDeps`, but `clearCache` has three other callers (`GOGUser`, `NileUser`, `LegendaryUser`, built from `runnerAuthFlowRegistration.ts`'s `userDeps()`). Supplying the transport there needs `registerRunnerAuthFlows`'s caller `sidecar/handlers.ts` to pass it, and that file is foreign-dirty.
- **Fix:** `ClearCacheDeps extends DialogBoxDeps, Partial<RustInvokeDeps>`; `clearCache` starts the wiki clear when the transport is present (a type guard, `canClearWikiCache`). The renderer's `clearCache` send, the path that matters, carries it and clears the wiki cache. The three per-library sign-outs do not, so they leave the wiki cache alone (public game data, refreshed after 30 days anyway; the TS cleared it on every call). `wikiGameInfo` was removed from `LegendaryUserDeps.stores` and `RunnerAuthFlowDeps.stores` (read only by the old clear). Files: `utils.ts`, `legendary/user.ts`, `runnerAuthFlowRegistration.ts`. OWED below.
- **Commit:** `3dbdd45c4`

**4. [Rule 3 - Blocking] The shortcut tests answer the Rust channel**
- `nonesteamgame.test.ts` and `shortcutsFlows.test.ts` auto-mocked the TS wiki module; the resolver now sends `RUST_INFO_WIKI_GET` through the injected `requestRustInvoke`, which the steamfiles stub rejects as unstubbed. Both tests answer that channel with null in a small wrapper and drop the `jest.mock`, lowering two ceilings (above). `nonesteamgame.test.ts` also asserts the one wiki call sent.

**5. [Plan reading] schedule `callers` is per file**
- The plan listed the three rows' callers one per function; the checker compares per file (`findImporters`), so all three rows list all five importers (`WIKI_CALLERS`).

## Deferred Issues

- OWED (foreign-dirty `sidecar/handlers.ts`): once it is clean, pass `requestRustInvoke` to `registerRunnerAuthFlows`, add it to `userDeps()` in `runnerAuthFlowRegistration.ts`, make `ClearCacheDeps.requestRustInvoke` required and drop `canClearWikiCache`, so the GOG, Nile and Legendary sign-outs clear the wiki cache again. Any plan that may touch handlers.ts can do it (with the 86-15/17/18 leftovers).
- Pre-existing, not from this plan: `pnpm lint` exits 1 on one production-scope error, `src/backend/sidecar/bootstrap.ts:2784` `'config' is assigned a value but never used` (a bootstrap file this plan did not touch). 898 warnings are unchanged in kind. Logged for whoever next edits bootstrap.ts.
- `NonSteamGameDeps` and `ShortcutsFlowDeps` still carry `stores.wikiGameInfo`, `stores.crossoverIndex`, `infoCaches` and `appRuntime`, read by nothing in the shortcut flow now; 86-24 removes them with the TS wiki module and its store family (the handlers.ts side is foreign-dirty).
- The live `pnpm tauri:dev` Linux umu launch was not run (macOS machine, operator asleep); the shim's argument shape is proven by the channel schema in `wiki.test.ts` and the Rust op by 86-20/86-22's goldens.

## Threat Flags

None. No new network endpoint, auth path or schema; the three shims are pinned by the D-06 shape check (T-86-57).

## Self-Check: PASSED

- Files exist: `src/backend/info/wiki.ts`, `src/backend/info/__tests__/wiki.test.ts`, `src/backend/__tests__/clearCacheWiki.test.ts`.
- Commits are ancestors of HEAD: `e54070132`, `53d2bb042`, `3dbdd45c4`.
