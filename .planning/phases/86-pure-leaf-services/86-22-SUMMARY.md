---
phase: 86-pure-leaf-services
plan: 22
subsystem: info-wiki-aggregator
tags: [wiki, aggregator, cache, stale-rules, native-channel, rustinvoke, drift, cloudflare, pitfall-11, d-12, d-17, d-18, d-23, sc1]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-20/86-21 wiki sources (pcgw, agw, protondb, deck, gamesdb, hltb with Result<_, Thrown> where the TS threw outside its own try), umu::get, the wiki golden harness and Replay::for_hosts; 86-19 crossover::{codeweavers_for, index_has}; 86-03 CacheView and the wikigameinfo parameters; 86-06 goldens (40 cases) and recordings; 86-12 gamelib-info-cli drift"
provides:
  - "gamelib_info::wiki::{get, clear_cache, WikiArgs, ClearArgs, TITLE_MAX_UTF16, APP_NAME_MAX_UTF16}: the aggregator, the 30 day wikigameinfo cache keyed by the cleaned title, the three stale rules"
  - "ops info_wiki_get {title, appName, runner, forceRefresh?} and info_wiki_cache_clear {}; TS constants RUST_INFO_WIKI_GET and RUST_INFO_WIKI_CACHE_CLEAR (in RUST_INFO_CHANNELS and RUST_INVOKE_CHANNELS, strict schemas, rust_dispatch arms); no non-test TS caller yet (86-23)"
  - "native info channel getWikiGameInfo (title max 1024 UTF-16, appName 1..256, runner one of five, forceRefresh absent|null|boolean); its sidecar handle and zod key are gone"
  - "drift slice wiki: eight live cases (Steam, Epic and GOG titles per platform, plus umu), one recorded live run"
affects: [86-23, 86-24]

actuals:
  tokens: 24600
  tasks: 3
  commits: 3

plan_head_before: c6fdd749b339db8842ea244667dc3c5988cdf08a
plan_head_after: df3cc46f6061fe407441d27bf8322eba39feffaf
commits: 3

key-files:
  created:
    - src-tauri/crates/gamelib-info/tests/golden_wiki.rs
  modified:
    - src-tauri/crates/gamelib-info/src/wiki/mod.rs
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info-cli/src/drift.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/enrichment.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts

key-decisions:
  - "The cache entry is built as a Json object in the TS key order (pcgamingwiki, applegamingwiki, codeweavers, howlongtobeat, gamesdb, steamInfo, umuId, fetchStatus) and `codeweavers` is built by hand as {macRating, linuxRating, slug}: `CodeweaversInfo::to_value` is a serde_json Value, which sorts its keys, and the cache file bytes are compared with the TS goldens. The first golden run caught exactly this (linuxRating before macRating)."
  - "Sources run in one tokio::join! of five futures (pcgamingwiki, gamesdb, agw on mac, umu on linux, codeweavers on mac) and only afterwards is a GamesDB or umu Err mapped to the whole-lookup null, so the other four still ran to completion, as Promise.all left them running in the TS. HowLongToBeat then takes the RAW title (not the cleaned cache key) with PCGamingWiki's howLongToBeatID; ProtonDB and the Deck report run in a second join on Linux with the Steam id from the app name (runners whose app name is a Steam app id), else GamesDB's if truthy, else PCGamingWiki's."
  - "The stale rules are pure functions over the cached serde Value (non-objects have no fields, JS property reads of primitives are undefined) and `index_has` is evaluated only when macRating is null, as the TS short-circuit did. A cached falsy value is a miss."
  - "info_wiki_cache_clear takes `{}` (an empty strict object, like info_anticheat_download), not no argument: the plan wrote `{}` and the existing empty-object pattern is the one the generator already emits for it."
  - "The runner on the native channel is a manifest `pattern` (^(legendary|gog|sideload|nile|steam)$) and the bounds are hand-decoded in info_dispatch (title <=1024, appName 1..256 in UTF-16 units, runner via runner_caps::caps, optional/null/boolean flag, a fifth argument refused), with fixed-literal rejection codes: the generator refuses length keywords, so no minLength in the manifest."
  - "The wiki drift cases are held in Mode::Whole against the golden's whole result object for the platform: a source that answers Rust 403 (or any failure) empties its part of the result and the golden's key paths for that part go missing, which is a FAIL naming them. They run for every platform the goldens cover, not only the running one (a superset of the plan: the platform is a context parameter, and a run from one machine then also asks the Linux-only ProtonDB, Steam Deck and umu)."
  - "The two TS tests that exercised getWikiGameInfo through the sidecar (a cache-hit resolve with a wrong title argument, and its row in the 'all channels' list) are replaced by a not-registered assertion; their coverage now lives in golden_wiki.rs and the native manifest vectors. The enrichmentFlows `wikiGameInfoStore` handle that only they used is removed."

patterns-established:
  - "An aggregator golden replays a whole case (every op in it, advance included) through the op's dispatch entry, compares each op's result, the request multiset (the recording minus tsOnly, per host in order unless a rustOnly exchange is present) and every file the profile ends with, byte for byte, then asks Replay::finish."
  - "A drift case table row that depends on a recorded second host (the CrossOver index) is replayed in tests through a small Routed Http that sends `/crossover-index/` requests to that slice's recording."

requirements-completed: []

coverage:
  - id: D1
    description: "wiki::get returns the TS golden result and writes the wikigameinfo (and umu, crossover_index) bytes of every one of the 31 86-06 wiki cases, including the dotted title nesting, the 30 day expiry, forceRefresh, the three stale rules and the GOG tsOnly exchanges"
    requirement: SVC-01
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-info --features testing --test golden_wiki (every_wiki_case_matches_the_ts_results_requests_and_cache_bytes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "two concurrent lookups for one title both complete and leave one well-formed entry; a source that threw outside its own try gives null and caches nothing; bad args are refused before any request"
    requirement: SVC-01
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-info --features testing --test golden_wiki (two_concurrent_calls..., a_source_that_threw..., an_unknown_runner_and_bad_args...)"
        status: pass
    human_judgment: false
  - id: D3
    description: "getWikiGameInfo is a native info channel with decoded bounds; its sidecar handle and zod key are deleted in the same commit"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_manifest_vectors; info_dispatch wiki tests; jest nativeChannelOwnership, ipcDomainCensus, ipcSchemaCoverage, flowRegistrationCensus, runnerSliceRegistration, enrichmentFlows"
        status: pass
    human_judgment: false
  - id: D4
    description: "info_wiki_get and info_wiki_cache_clear rustInvoke ops: strict schemas, rust_dispatch arms, the clear empties wikigameinfo values and timestamps and leaves umu alone, twice is a no-op"
    requirement: SVC-01
    verification:
      - kind: integration
        ref: "golden_wiki.rs the_cache_clear_op_*; info_dispatch::tests the_wiki_rpc_ops_validate_first_and_run_the_crate; jest rustInvokeSchemas, tauriShellSource, recentGames"
        status: pass
    human_judgment: false
  - id: D5
    description: "the live drift run: no Rust-only 403 and no shape drift on any wiki source"
    requirement: SVC-01
    verification:
      - kind: other
        ref: "cargo run -q -p gamelib-info-cli -- drift --slice wiki (2026-11-23, all 8 PASS; output in this summary)"
        status: pass
    human_judgment: false

duration: about 2h 10m
completed: 2026-11-23
status: complete
---

# Phase 86 Plan 22: The wiki aggregator Summary

**The game page's wiki block is computed by Rust: wiki::get with the 30 day cache, the apple, crossover and fetch-status stale rules and all eight sources reproduces the TS result and cache bytes for every one of the 31 wiki goldens, serves `getWikiGameInfo` as a native channel with the TS registration deleted, and a live drift run shows no Rust-only 403.**

## Performance

- **Tasks:** 3 (one tracer, one tdd, one auto)
- **Files modified:** 22 (plus one created)
- **Tracer gate:** after Task 1 the automated verify was run end to end (golden_wiki, native manifest vectors, info_dispatch, clippy, fmt, check:ipc-contract, the ownership, census and schema jest suites, codecheck, prettier) and passed: `Tracer verified end-to-end — expanding`.

## Accomplishments

- `wiki::get(ctx, WikiArgs)`: the cache key is `remove_special_characters(title)` through CacheView (a dotted title nests, `__timestamp.<key>` beside it); a cached entry is served unless `forceRefresh` or a stale rule fires; the five concurrent sources, then HowLongToBeat, then ProtonDB and the Deck report; the result and `fetchStatus` in TS key order; any thrown source gives a logged line and `null` with nothing cached.
- `golden_wiki.rs` replays all 31 wiki cases (results, request multiset with per-host order, every file left behind byte for byte, clean `Replay::finish` with only `tsOnly` leftovers), keeps the MANIFEST floor and an empty-list negative, and proves the two-concurrent-calls edge, the null-on-throw edge, the bad-args edge and the clear (wiki emptied, umu untouched, second clear a no-op).
- `getWikiGameInfo` is a native `info` channel (manifest vectors, hand decode with fixed-literal rejections, router insert) and its `enrichmentFlowRegistration` handle and zod key are deleted in the same commit; the generated contract, census and schema pins follow.
- `info_wiki_get` and `info_wiki_cache_clear` are rustInvoke ops with strict schemas and `rust_dispatch` arms, for the non-Steam shortcut resolver and `clearCache` shims 86-23 writes.
- Eight wiki drift cases and one live run (below).

## Task Commits

1. **Task 1: tracer, `getWikiGameInfo` native through the Rust aggregator** - `6b563c0a6` (feat)
2. **Task 2: `info_wiki_get` and `info_wiki_cache_clear` rustInvoke ops** - `89706d19b` (feat)
3. **Task 3: wiki drift cases and the live run** - `df3cc46f6` (feat)

**Plan metadata:** the docs commit that carries this file.

## Live drift run (Task 3, Pitfall 11 / T-86-52)

`cargo run -q -p gamelib-info-cli -- drift` on this machine (macOS, network on, no keys, 2026-11-23). Every wiki line PASS; ITAD and SteamGridDB skipped for want of the operator's keys, as designed:

```
PASS anticheat-download-mac
PASS anticheat-download-linux
PASS anticheat-lookup
SKIP steamgrid-search: GAMELIB_INFO_SGDB_KEY is not set
SKIP steamgrid-grids: GAMELIB_INFO_SGDB_KEY is not set
SKIP steamgrid-heroes: GAMELIB_INFO_SGDB_KEY is not set
SKIP itad-search: GAMELIB_INFO_ITAD_KEY is not set
SKIP itad-deals: GAMELIB_INFO_ITAD_KEY is not set
SKIP itad-gids: GAMELIB_INFO_ITAD_KEY is not set
PASS gog-discounts
PASS crossover-index-fetch
PASS crossover-rating-map
PASS wiki-steam-mac
PASS wiki-steam-linux
PASS wiki-steam-windows
PASS wiki-epic-mac
PASS wiki-epic-linux
PASS wiki-gog-mac
PASS wiki-gog-linux
PASS wiki-umu
```

What the wiki PASS lines prove: a case passes only if every key path of the golden's whole result is in the live result with an overlapping type, so a source that answered Rust 403 would have emptied its part (`pcgamingwiki`, `applegamingwiki`, `howlongtobeat`, `gamesdb`, `steamInfo`, `codeweavers`, `umuId`) and failed. The Steam cases cover PCGamingWiki, HowLongToBeat by id (the by-id page), the CrossOver index, AppleGamingWiki, ProtonDB and the Steam Deck report; the Epic cases cover the HowLongToBeat init plus title search (the Cloudflare-sensitive path, which returned data); the GOG cases cover GamesDB and the gog.com store page; `wiki-umu` covers umu. The three Epic and GOG goldens that hold `null` or `error` for a part (the PCGamingWiki GOG-id `permissiondenied` quirk, the HowLongToBeat box missing on the gog.com page) matched as null live too. No 403 from any host, TS or Rust. Pitfall 11 is clear; the plan is not blocked.

## Files Created/Modified

See the frontmatter `key-files`. Everything is in the in-repo `gamelib-info` crate, the shell's `info_dispatch`, `native_router`, `rust_dispatch` and generated `ipc_contract`, the IPC manifest and types, and the one sidecar registration.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The cached `codeweavers` key order came out sorted**
- **Found during:** Task 1 (first golden run)
- **Issue:** `CodeweaversInfo::to_value()` is a `serde_json::Value`, which sorts its keys (`linuxRating, macRating, slug`); the cache file bytes must be `macRating, linuxRating, slug`.
- **Fix:** `codeweavers_json` builds the object with `Obj::insert_js` in the TS order.
- **Files modified:** `src-tauri/crates/gamelib-info/src/wiki/mod.rs`
- **Commit:** `6b563c0a6`

**2. [Rule 3 - Blocking] The plan's drift table is in `drift.rs`, not `main.rs`**
- **Found during:** Task 3
- **Issue:** `files_modified` lists `gamelib-info-cli/src/main.rs`; the table (and its tests) live in `src/drift.rs` (86-12 moved it).
- **Fix:** the cases were added to `drift.rs`; `main.rs` needed no change.
- **Commit:** `df3cc46f6`

**3. [Plan reading] Drift cases run for every platform the goldens cover**
- The plan said "on the running platform". The platform is a context parameter and the goldens exist for mac, linux and windows, so all of them run from one machine (a superset: this also asked the Linux-only ProtonDB, Steam Deck and umu from macOS).

**4. [Plan reading] `info_wiki_cache_clear` takes `{}`**
- The plan wrote `info_wiki_cache_clear {}`; the op decodes one empty strict object (the `info_anticheat_download` pattern) rather than no argument.

**5. [Rule 3 - Blocking] Pins moved**
- `flowRegistrationCensus` enrichment invoke 7 -> 6, `runnerSliceRegistration` handle 60 -> 59 and per-module [11,12,7,14,8,6] = 58, `ipcSchemas/enrichment` 6 keys, `rustInvokeSchemas` and `tauriShellSource` 135 -> 137, `recentGames` RUST_INFO_CHANNELS set, and the enrichment registration's own "Registers the N" docstring total (7 -> 6).

## Deferred Issues

- `src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts` reads `src/backend/storeSearch/itad.ts`, which 86-17 deleted: the suite cannot run (`ENOENT`). Not caused by this plan (the file went in `43a95d91d`), found by the full Frontend jest run that 86-17's Backend+Meta run did not include. Logged in `deferred-items.md`; not fixed here.
- Foreign, pre-existing and unchanged: `steamLoginPollLifecycle.test.tsx` and `nativeSeamPortComplete.test.ts` failed once under whole-repo load and passed alone; `pnpm backend-di-ceilings` fails only on `steam/__tests__/optInDlc.test.ts` and `frontend/state/__tests__/libraryStoreFollowers.test.ts`; `cargo clippy --bin gamelib-shell` has the known foreign warnings (none new in `info_dispatch.rs` or `native_router.rs` from this plan's lines).
- OWED (foreign-dirty `sidecar/handlers.ts`, carried from 86-15, 86-17, 86-18): the inert `itadSecrets` / `steamGridSecrets` / `miscRuntime` leftovers on `EnrichmentFlowDeps` and `BootServices`. This plan left `EnrichmentFlowDeps.stores` / `infoCaches` / `appRuntime` as they were; `infoCaches` and `appRuntime` were read only by the deleted handle, so they are dead there now and go with the same cleanup (or 86-24).

## Known Stubs

None.

## Threat Flags

None. `getWikiGameInfo` args are bounded and enum-checked in the Rust decode (T-86-54, manifest invalid vectors); the cache key goes through `remove_special_characters` and the StoreHost's dot-prop refusal (T-86-56); each op holds the crate's Shutdown registrant and every source request carries its own timeout (T-86-55).

## Self-Check: PASSED

- `src-tauri/crates/gamelib-info/tests/golden_wiki.rs`, `src-tauri/crates/gamelib-info/src/wiki/mod.rs`, `src-tauri/crates/gamelib-info-cli/src/drift.rs`: found.
- Commits `6b563c0a6`, `89706d19b`, `df3cc46f6`: found in HEAD's history.
- Acceptance greps: `'getWikiGameInfo'` quoted outside comments in `enrichmentFlowRegistration.ts` == 0; `info_wiki_cache_clear` in `sidecarTransport.ts` >= 1; `drift --list | grep -c wiki` == 8; `pnpm codecheck` exit 0 at the last code commit.
