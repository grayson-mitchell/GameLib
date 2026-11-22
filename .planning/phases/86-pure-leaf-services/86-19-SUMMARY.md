---
phase: 86-pure-leaf-services
plan: 19
subsystem: info-crossover
tags: [crossover, compatibility-index, rating-map, runner-table, resolver, d-24, schema-bounds, gzip, replay, drift, d-09, d-10, d-12, d-18, sc1, sc4]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-06 crossover goldens, recordings and state folders (19 cases), 86-03 CacheView and its Never-returns-stale quirk, 86-16 Replay networkError, 86-18 InfoLog sink, resolver registration pattern and the miscRuntime requestRustInvoke seam"
provides:
  - "src/common/runnerCapabilities.json: the runner table both sides read (appNameIsSteamAppId, hasStoreCatalog, storeMap, umuStore), with a jest drift test against storeCapabilities, common/utils storeMap and the umu storeMapping"
  - "gamelib-info runner_caps (caps, store_map, umu_store) and crossover::{codeweavers_for, index_has, index_resolver, rating_map::rating_map}, fetcher::{load_index, read_cached}, schema, normalize::{normalize, slugify, NAME_MATCHING_SHIPS}"
  - "op info_crossover_rating_map and RUST_INFO_CROSSOVER_RATING_MAP; TS resolver src/backend/info/crossover.ts getCrossoverIndex (schedule row, deletedBy 92)"
  - "InfoCtx.crossover (CrossoverState): the failure back-off, the memoized lookup maps and a single-flight load lock; InfoPaths.public_dir is now the sidecar's own app root plus public"
  - "drift cases crossover-index-fetch and crossover-rating-map, and Mode::Subset"
affects: [86-20, 86-22, 86-23, 86-24]

actuals:
  tokens: 28000
  tasks: 3
  commits: 3

plan_head_before: f8489386124cc8be50c811d27bf94eed75690bbc
plan_head_after: d04f3f78441e7ac06efda287a06e679c1edda02b
commits: 3

key-files:
  created:
    - src/common/runnerCapabilities.json
    - src/common/__tests__/runnerCapabilities.test.ts
    - src-tauri/crates/gamelib-info/src/runner_caps.rs
    - src-tauri/crates/gamelib-info/src/crossover/mod.rs
    - src-tauri/crates/gamelib-info/src/crossover/fetcher.rs
    - src-tauri/crates/gamelib-info/src/crossover/schema.rs
    - src-tauri/crates/gamelib-info/src/crossover/normalize.rs
    - src-tauri/crates/gamelib-info/src/crossover/rating_map.rs
    - src-tauri/crates/gamelib-info/tests/golden_crossover.rs
    - src/backend/info/crossover.ts
    - src/backend/info/__tests__/crossover.test.ts
    - .planning/todos/pending/2026-11-23-crossover-index-fresh-payload-dropped-when-cache-write-fails.md
  modified:
    - src-tauri/crates/gamelib-info/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info/src/ctx.rs
    - src-tauri/crates/gamelib-info/src/http.rs
    - src-tauri/crates/gamelib-info/tests/http_replay.rs
    - src-tauri/crates/gamelib-info-cli/src/drift.rs
    - src-tauri/crates/gamelib-info-cli/src/main.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/info/__tests__/recentGames.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts

key-decisions:
  - "The index schema bounds are ported exactly and marked DO NOT LOOSEN in schema.rs: version is the number 1, generatedAt is zod 4.6's `z.iso.datetime()` (UTC `Z`, seconds required, a real calendar date including leap days), at least 1000 entries, each entry a non-empty name, an integer rating 1..=5 and an optional string steamid, unknown keys dropped. The stored document is rebuilt from the parsed fields in the schema's key order, so a refetched cache file is byte-identical to the TS one."
  - "The decompressed size is capped at 32 MiB (T-86-45): a gzip bomb fits inside the 5 MiB compressed cap, and the TS had no limit. The live payload inflates to about 240 KB. MultiGzDecoder reads every member as Node's gunzipSync does."
  - "`load_index` answers `Loaded { index, data }`: on a cache hit `data` is the stored object as is (the TS returned `cached.data` unstripped), so the 86-06 `load` golden, whose state files hold the raw live payload with its per-entry `label`, hashes identically; a fresh fetch or the bundled snapshot answers the schema's output. Lookups read only `index`."
  - "In-memory state lives in `InfoCtx.crossover`: the 5 minute failure back-off (one slot, since there is one descriptor), the maps memoized on `generatedAt` alone (as the TS memo was), and a tokio mutex so two callers that find a stale cache wait and then read the fresh copy instead of both downloading. The TS had no such guard; the wiki (86-22) will call concurrently."
  - "An unknown runner name rejects the whole `info_crossover_rating_map` call with `bad-args` (the TS `storeCapabilities[runner]` lookup threw and rejected the call); `codeweavers_for` answers `None` for one, as the TS `try` answered null."
  - "`slugify` lives in crossover/normalize.rs (the lookup answers `slug`). 86-20's CodeWeavers info should call it rather than port a second one."
  - "A5: the shell passes the sidecar's own app root joined with `public` (a debug build: `resolve_dev_app_root`, honouring a pre-set GAMELIB_APP_ROOT; a release build: `resolve_packaged_app_root`) as `InfoPaths.public_dir`. The old `resource_dir()` alone would have missed the dev repository's `public/`."
  - "The resolver test runs the real resolver: enrichmentFlows.test.ts boots the sidecar and answers the one `info_crossover_rating_map` frame through the harness's `rustAnswers`. A new `jest.mock('info/crossover')` would have grown that file's ratchet (9 -> 10), so the old crossover_index mocks were deleted instead and the ceiling is unchanged."
  - "The umu `storeMapping` is private to its module, so the runner-table drift test reads that one const as source text (a strict line parser that throws on anything it cannot read) rather than exporting it from a file this plan does not otherwise touch."

patterns-established:
  - "A resolver whose one input is a list gathered from the library managers: `const games` over `Object.values(deps.libraryManagers)`, then one typed call. A booted-sidecar test supplies `rustAnswers` for it instead of mocking the resolver."
  - "A cross-process document type that is validated on read and written back rebuilt (not as received): the stored bytes then match the TS output exactly, and extra keys a newer publisher adds never reach the cache."

requirements-completed: []
status: complete
completed: 2026-11-23
---

# Phase 86 Plan 19: CrossOver compatibility index to Rust Summary

**The library's CrossOver ratings come from `gamelib-info` `crossover`: the release asset is fetched over HTTPS (5 MiB cap, 32 MiB inflated cap), validated with the TS bounds kept exactly, stored under `crossover_index` with keep-last-good, the 5 minute back-off and the bundled cold-start snapshot, looked up by exact Steam id then by NFKD-normalized title, and answered as the three-state rating map (`{}` off macOS); all 19 86-06 goldens replay clean, including every cache byte. TS keeps only `getCrossoverIndex`, a scheduled resolver that gathers the library's games and makes one Rust call, and `runnerCapabilities.json` is the one runner table both sides read.**

## Performance

- **Tasks:** 3 (tracer + auto TDD + auto)
- **Commits:** 3 (`37eb3b40a`, `f004d2bb8`, `d04f3f784`)
- **Diff:** 31 files, 2841 insertions, 131 deletions (the lockfile and the generated contract included)

## Accomplishments

- **Tracer (Task 1).** `runnerCapabilities.json` plus `runner_caps.rs` (`include_str!`, parsed once) and a jest drift test proving the JSON equals `storeCapabilities`, `common/utils` `storeMap` and the umu mapping. `crossover::{schema, normalize, fetcher, rating_map, mod}` and the op `info_crossover_rating_map` (strict args, at most 20000 games, every runner must be one of the five), a regenerated contract, the `rust_dispatch` arm and the `info_dispatch` handler. `src/backend/info/crossover.ts` is the D-24 resolver (`const games`, one `RUST_INFO_CROSSOVER_RATING_MAP` call); the enrichment registration forwards to it and `getCrossoverIndex` stays in `LONG_RUNNING_CHANNELS`. `golden_crossover` replayed the live fetch, the fresh cache and the linux/windows empty cases, cache bytes included.
- **Task 2.** The bundled snapshot (`<public_dir>/crossover-index.json.gz`, validated, written into the cache with `fetchedAt` now, served when there is no cache and a refresh fails, also inside the back-off), the decompressed cap, and `golden_crossover` over all 19 cases: the five schema rejections (version 2, rating 6, 999 entries, a bad `generatedAt`) and the non-gzip and over-5-MiB bodies each leave the previous cache bytes identical, the non-https URL is refused with no request, the back-off holds for 5 minutes and recovers, the bundled fallback is used and persisted, a bundled snapshot that fails validation is a cold start. Extra cases: a second rating map inside 24 h makes no request (the SVC-01 idempotency edge), a cold start with no public dir, and the persisted bundled copy answering the synchronous probe. Unit tests: every schema bound, the datetime grammar, the TS normalize and slugify vectors (NFKD, edition-suffix chains, apostrophes), first-wins collisions, the memo, gzip multi-member and a 32 MiB bomb.
- **Task 3.** Two drift cases against the live asset: `crossover-index-fetch` holds the cache file the op wrote against the live-fetch golden's whole shape (a dropped `steamid` is a missing path), `crossover-rating-map` holds a three-game rating map to the golden's types through the new `Mode::Subset`. Cargo tests replay the recorded live fetch for both and prove a service that stops serving the index fails both with the path. Run live on 2026-11-23: `PASS crossover-index-fetch`, `PASS crossover-rating-map`.

## Task Commits

1. **Task 1 (tracer): CrossOver rating map served by Rust behind a games resolver** - `37eb3b40a`
2. **Task 2: bundled fallback, bounds proven over all 19 goldens, app-root public dir** - `f004d2bb8`
3. **Task 3: CrossOver drift cases against the live release asset** - `d04f3f784`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `InfoCtx` needed a home for the index's session state**
- **Found during:** Task 1
- **Issue:** the failure back-off and the `generatedAt`-keyed maps are per-boot state in TS (`createCrossoverIndexFetcher` / `createCrossoverIndex`). The crate has no per-process object but `InfoCtx`, and `ctx.rs` is not in the plan's file list.
- **Fix:** `InfoCtx.crossover: CrossoverState` (default-constructed by `InfoCtx::new`), holding the back-off slot, the memo and the load lock.
- **Files modified:** `src-tauri/crates/gamelib-info/src/ctx.rs`, `crossover/mod.rs`
- **Commit:** `37eb3b40a`

**2. [Rule 3 - Blocking] The pins the plan did not list had to move with the new channel**
- `rust_dispatch` arm count 133 -> 134 and the new-arm allow-list (`tauriShellSource`), `RUST_INVOKE_CHANNELS` 133 -> 134 (`rustInvokeSchemas`), the `RUST_INFO_CHANNELS` expected set (`recentGames`), and `enrichmentFlows.test.ts`, whose three-state-map tests drove the deleted `buildCrossoverRatingMap`. They are rewritten to pin the routing: the real resolver sends every manager's games in one frame and answers what Rust returns, a rejected frame is a rejection, and the SEAM list answers its frame. The `crossover_index/index` mock keeps only `createCrossoverIndex` (the TS wiki still reads it).
- **Commit:** `37eb3b40a`

**3. [Rule 1 - Bug] `Replay` did not consume an exchange whose answer was over the request's body cap**
- **Found during:** Task 2 (the over-5-MiB case)
- **Issue:** `Replay::serve` returned `TooLarge` before marking the exchange consumed, so `finish()` reported the request that had just been made as unconsumed.
- **Fix:** the exchange is consumed first, then the cap is checked; `http_replay.rs` pins it (over the cap is `TooLarge` and the replay finishes clean; exactly at the cap is served).
- **Commit:** `f004d2bb8`

**4. Plan staging.** The tracer needed gunzip, validation, the persisted write, the back-off (its state would otherwise be dead code under `clippy -D warnings`) and the https assertion to replay its cases, so they landed in Task 1; Task 2 added the bundled fallback, the inflated cap, the remaining cases, the A5 wiring and the unit tests.

**5. Plan location difference.** The drift cases live in `gamelib-info-cli/src/drift.rs` (the table), as in 86-17 and 86-18; `main.rs` only got its doc line.

### Auth gates

None. The index is a public release asset: no key, no token, no Keychain access.

## Measurements and notes

- The live index is 33 KB gzipped, 2469 entries, about 240 KB inflated, and carries a `label` on every entry that the zod schema drops. An oracle cache seeded from the raw payload therefore holds `label`; `Loaded.data` keeps it on a hit so the golden hashes agree.
- `generatedAt` accepts exactly what zod 4.6.7 `z.iso.datetime()` does (read from `node_modules/zod/v4/core/regexes.js`): no offset, no local form, seconds required.
- The log lines (`ctx.note`) are fixed text plus a status number or a category word: `crossover index refresh failed (status 500), keeping the last good copy`, `... (network)`, `crossover index payload rejected (version)`, `crossover index: no bundled snapshot, cold start`. The golden test asserts no line holds `://`, `github` or `userData`.
- Worst case of one rating-map op: one 10 s request (the axios client's timeout), inside the 60 s rustInvoke bound; the channel's TS registration also stays in `LONG_RUNNING_CHANNELS`.
- `cargo clippy --bin gamelib-shell -D warnings` still fails with 14 errors in `login_window/*`, `native_router.rs`, `store_embed/state.rs`, `shell_state.rs` and `native_gamepad_shape.rs` (none in files this plan touched; foreign, as noted since 86-08).

## Owed Cleanup

- `sidecar/handlers.ts` (foreign-dirty): the 86-15, 86-17 and 86-18 leftovers still stand (`steamGridSecrets`, `itadSecrets`, the inert members, and `registerEnrichmentFlows` reading `requestRustInvoke` from `MiscRuntime`). This plan only added one more reader of that seam.
- `getCrossoverIndex` (resolver) and its registration go in phase 92 with the last TS library manager. The TS `crossover_index/` module stays for the TS wiki and is deleted with it in 86-24; `crossoverRatingMap.ts` is already reached only from tests.
- The copied quirk (a validated fresh payload is dropped when the cache write fails) is filed as `.planning/todos/pending/2026-11-23-crossover-index-fresh-payload-dropped-when-cache-write-fails.md`.

## Verification

- `cargo test -p gamelib-info --features testing` (golden_crossover 7/7: all 19 cases plus the idempotency, cold-start and restart tests; `crossover::` unit tests; http_replay), `cargo test -p gamelib-info-cli` (18 and 11), `cargo test --bin gamelib-shell` (758 passed, 2 ignored), `cargo clippy -p gamelib-info -p gamelib-info-cli --all-targets -D warnings`, `cargo fmt -p gamelib-info -p gamelib-info-cli -- --check`, `rustfmt --check` on the touched shell files (only the generated `ipc_contract.rs` differs, foreign), `pnpm check:ipc-contract`: green.
- `pnpm codecheck`, `pnpm find-deadcode` (312 baselined, unchanged), `pnpm planning-gates` (12/12), prettier on every touched path, eslint on the touched TS (warnings only, all pre-existing): green.
- `pnpm exec jest --selectProjects Backend Meta Common --silent`: 733 suites passed, 17368 tests, 0 failed. `pnpm backend-di-ceilings` fails only on the two known foreign files (the enrichmentFlows ceiling did not move). `cargoFeatures.test.ts` passes: no new lockfile package name (only `flate2` and `unicode-normalization` edges on `gamelib-info`).
- Live: `cargo run -p gamelib-info-cli -- drift --slice crossover` printed `PASS crossover-index-fetch` and `PASS crossover-rating-map`; `drift --list | grep -c crossover` prints 2.

## Known Stubs

None.

## Threat Flags

None. T-86-44 (the schema bounds, keep-last-good and https-only, each proven by a rejection golden), T-86-45 (5 MiB compressed cap from the HTTP seam, 32 MiB inflated cap), T-86-46 (the bundled path is the shell's own app root plus `public`, never from TS or the renderer) and T-86-47 (the strict schema and the crate cap the list at 20000 games) are mitigated as planned.

## Self-Check: PASSED

- FOUND: src/common/runnerCapabilities.json, src/common/__tests__/runnerCapabilities.test.ts, src-tauri/crates/gamelib-info/src/runner_caps.rs, src-tauri/crates/gamelib-info/src/crossover/{mod,fetcher,schema,normalize,rating_map}.rs, src-tauri/crates/gamelib-info/tests/golden_crossover.rs, src/backend/info/crossover.ts, src/backend/info/__tests__/crossover.test.ts
- FOUND commits: 37eb3b40a, f004d2bb8, d04f3f784
