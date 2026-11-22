---
phase: 86-pure-leaf-services
reviewed: 2026-11-22T19:54:04Z
depth: standard
files_reviewed: 179
files_reviewed_list:
  - src-tauri/crates/gamelib-info-cli/Cargo.toml
  - src-tauri/crates/gamelib-info-cli/src/drift.rs
  - src-tauri/crates/gamelib-info-cli/src/main.rs
  - src-tauri/crates/gamelib-info-cli/tests/cli.rs
  - src-tauri/crates/gamelib-info/Cargo.toml
  - src-tauri/crates/gamelib-info/src/anticheat.rs
  - src-tauri/crates/gamelib-info/src/cache_view.rs
  - src-tauri/crates/gamelib-info/src/crossover/fetcher.rs
  - src-tauri/crates/gamelib-info/src/crossover/mod.rs
  - src-tauri/crates/gamelib-info/src/crossover/normalize.rs
  - src-tauri/crates/gamelib-info/src/crossover/rating_map.rs
  - src-tauri/crates/gamelib-info/src/crossover/schema.rs
  - src-tauri/crates/gamelib-info/src/ctx.rs
  - src-tauri/crates/gamelib-info/src/discounts.rs
  - src-tauri/crates/gamelib-info/src/http.rs
  - src-tauri/crates/gamelib-info/src/itad/cache.rs
  - src-tauri/crates/gamelib-info/src/itad/collate.rs
  - src-tauri/crates/gamelib-info/src/itad/coverage.rs
  - src-tauri/crates/gamelib-info/src/itad/gate.rs
  - src-tauri/crates/gamelib-info/src/itad/mapping.rs
  - src-tauri/crates/gamelib-info/src/itad/mod.rs
  - src-tauri/crates/gamelib-info/src/js.rs
  - src-tauri/crates/gamelib-info/src/lib.rs
  - src-tauri/crates/gamelib-info/src/overrides.rs
  - src-tauri/crates/gamelib-info/src/recent.rs
  - src-tauri/crates/gamelib-info/src/runner_caps.rs
  - src-tauri/crates/gamelib-info/src/secrets.rs
  - src-tauri/crates/gamelib-info/src/steamgrid.rs
  - src-tauri/crates/gamelib-info/src/umu.rs
  - src-tauri/crates/gamelib-info/src/wiki/agw.rs
  - src-tauri/crates/gamelib-info/src/wiki/codeweavers.rs
  - src-tauri/crates/gamelib-info/src/wiki/deck.rs
  - src-tauri/crates/gamelib-info/src/wiki/gamesdb.rs
  - src-tauri/crates/gamelib-info/src/wiki/gog_ctx.rs
  - src-tauri/crates/gamelib-info/src/wiki/hltb.rs
  - src-tauri/crates/gamelib-info/src/wiki/mod.rs
  - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
  - src-tauri/crates/gamelib-info/src/wiki/protondb.rs
  - src-tauri/crates/gamelib-info/src/wiki/regexes.rs
  - src-tauri/crates/gamelib-info/src/wiki/title_match.rs
  - src-tauri/Cargo.toml
  - src-tauri/build.rs
  - src-tauri/crates/README.md
  - src-tauri/crates/gamelib-info/tests/cache_view.rs
  - src-tauri/crates/gamelib-info/tests/golden_anticheat.rs
  - src-tauri/crates/gamelib-info/tests/golden_crossover.rs
  - src-tauri/crates/gamelib-info/tests/golden_discounts.rs
  - src-tauri/crates/gamelib-info/tests/golden_overrides.rs
  - src-tauri/crates/gamelib-info/tests/golden_recent.rs
  - src-tauri/crates/gamelib-info/tests/golden_steamgrid.rs
  - src-tauri/crates/gamelib-info/tests/golden_storeSearch.rs
  - src-tauri/crates/gamelib-info/tests/golden_umu.rs
  - src-tauri/crates/gamelib-info/tests/golden_wiki.rs
  - src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs
  - src-tauri/crates/gamelib-info/tests/http_replay.rs
  - src-tauri/crates/gamelib-info/tests/regex_vectors.rs
  - src-tauri/crates/gamelib-info/tests/secrets.rs
  - src-tauri/crates/gamelib-info/tests/wiki_golden/mod.rs
  - src-tauri/crates/gamelib-info/tests/wiki_hltb_edges.rs
  - src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs
  - src-tauri/src/info_dispatch.rs
  - src-tauri/src/info_secrets.rs
  - src-tauri/src/ipc_contract.rs
  - src-tauri/src/main.rs
  - src-tauri/src/native_router.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/tray.rs
  - src-tauri/src/tray/recent.rs
  - src/backend/appRuntime.ts
  - src/backend/gamedetails/dispatch.ts
  - src/backend/gamedetails/overrides.ts
  - src/backend/info/anticheat.ts
  - src/backend/info/crossover.ts
  - src/backend/info/discounts.ts
  - src/backend/info/gameOverrides.ts
  - src/backend/info/recentGames.ts
  - src/backend/info/wiki.ts
  - src/backend/launcher.ts
  - src/backend/miscRuntime.ts
  - src/backend/protocol.ts
  - src/backend/services/types.ts
  - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/devSecretVault.ts
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/backend/sidecar/gameDetailsFlowRegistration.ts
  - src/backend/sidecar/runnerAuthFlowRegistration.ts
  - src/backend/sidecar/shortcutsFlowRegistration.ts
  - src/backend/sidecar/steamFlowRegistration.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/index.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/legendary/user.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/steam/launchDispatch.ts
  - src/backend/storeManagers/steam/optInDlc.ts
  - src/backend/store_backend.ts
  - src/backend/stores/createStores.ts
  - src/backend/utils.ts
  - src/common/itadCoverage.json
  - src/common/itadCoverage.ts
  - src/common/runnerCapabilities.json
  - src/common/types.ts
  - src/common/types/ipc/enrichment.ts
  - src/common/types/ipc/gameDetails.ts
  - src/common/types/ipc/native.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/common/types/sidecarTransport.ts
  - src/frontend/components/UI/WikiGameInfo/components/HowLongToBeat/index.tsx
  - .github/workflows/release-tauri.yml
  - .github/workflows/rust-test.yml
  - .prettierignore
  - meta/__tests__/buildSidecarSea.test.ts
  - meta/__tests__/itadKeyDefine.test.ts
  - meta/__tests__/releaseItadKey.test.ts
  - meta/__tests__/rustTestWorkflow.test.ts
  - meta/backendDiCeilings/shortcuts.json
  - meta/backendDiCeilings/sidecar-tests-flows-1.json
  - meta/backendDiCeilings/sidecar.json
  - meta/buildSidecar.ts
  - meta/buildSidecarSea.ts
  - meta/esbuildWorkerBundleShared.ts
  - meta/genStoreTable.ts
  - meta/measureItadCoverage.ts
  - src/backend/__tests__/appRuntime.test.ts
  - src/backend/__tests__/cargoFeatures.test.ts
  - src/backend/__tests__/clearCacheWiki.test.ts
  - src/backend/__tests__/diPhaseGates.test.ts
  - src/backend/__tests__/infoPortComplete.test.ts
  - src/backend/__tests__/infoShimSchedule.test.ts
  - src/backend/__tests__/releaseWorkflow.test.ts
  - src/backend/__tests__/storeKinds.test.ts
  - src/backend/__tests__/storeMapping.test.ts
  - src/backend/__tests__/storeMirrorSchedule.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
  - src/backend/info/__tests__/anticheat.test.ts
  - src/backend/info/__tests__/crossover.test.ts
  - src/backend/info/__tests__/discounts.test.ts
  - src/backend/info/__tests__/fixtureRedaction.test.ts
  - src/backend/info/__tests__/gameOverrides.test.ts
  - src/backend/info/__tests__/recentGames.test.ts
  - src/backend/info/__tests__/wiki.test.ts
  - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
  - src/backend/shortcuts/nonesteamgame/__tests__/nonesteamgame.test.ts
  - src/backend/sidecar/__tests__/bootSourceShape.test.ts
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
  - src/backend/sidecar/__tests__/devSecretVault.test.ts
  - src/backend/sidecar/__tests__/electronReachLedger.test.ts
  - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
  - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
  - src/backend/sidecar/__tests__/ipcSchemas/enrichment.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts
  - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
  - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
  - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
  - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
  - src/backend/sidecar/__tests__/steamFlows.test.ts
  - src/backend/sidecar/__tests__/storeLayer.test.ts
  - src/backend/storeManagers/sideload/__tests__/uninstallSafety.test.ts
  - src/backend/storeManagers/steam/__tests__/optInDlc.test.ts
  - src/backend/stores/__tests__/cacheFamily.test.ts
  - src/backend/stores/__tests__/createStores.test.ts
  - src/backend/stores/__tests__/userStateFamily.test.ts
  - src/backend/testUtils/__tests__/testServices.test.ts
  - src/backend/testUtils/infoPortGate.ts
  - src/backend/testUtils/testAppRuntime.ts
  - src/backend/testUtils/testEpicAmazonRuntimes.ts
  - src/backend/testUtils/testMiscRuntime.ts
  - src/backend/testUtils/testServices.ts
  - src/common/__tests__/runnerCapabilities.test.ts
  - src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts
  - src/frontend/state/__tests__/libraryStoreFollowers.test.ts
  - src/frontend/testUtils/tauriIpcRoute.ts
findings:
  critical: 1
  warning: 11
  info: 30
  total: 42
  necessity: 1
status: issues_found
---

# Phase 86: Code Review Report

**Reviewed:** 2026-11-23
**Depth:** standard (from workflow.code_review_depth)
**Files Reviewed:** 179
**Status:** issues_found

## Scope and method

The file scope came from the phase's 26 SUMMARY.md key-files plus the task-commit evaluation scope (`check evaluation-scope`, status resolved, base `a8582375580c1854c29abed40989bcc543f54861`): 972 existing files after excluding planning artifacts and 15 deleted files (the removed TS oracle tests under `src/backend/info/__tests__/oracle/` and `src/backend/wiki_game_info/howlongtobeat/utils.ts`). Of those, 790 are recorded golden fixtures under `src-tauri/crates/gamelib-info/tests/fixtures/` (test data, not reviewed line by line; lane D scanned them for secrets), and three are generated or lock files (`src-tauri/Cargo.lock`, `src/common/types/ipc/ipcSchemaSnapshot.json`, `src/common/types/ipc/nativeChannels.json`), also not reviewed. The remaining 179 source files were split across four gsd-code-reviewer lanes run in parallel and merged here. Finding IDs keep each lane's numbering block (lane A 01-19, B 21-39, C 41-59, D 61-79), so gaps in the sequence are expected. For large shared files the lanes reviewed the phase-86 hunks rather than the whole file.

| Lane | Scope | Critical | Warning | Info |
|---|---|---|---|---|
| A | Rust gamelib-info crate + gamelib-info-cli | 0 | 4 | 6 |
| B | src-tauri shell code + gamelib-info integration tests | 0 | 2 | 9 |
| C | TS production code | 1 | 2 | 7 |
| D | TS tests, test utilities, meta/ build scripts, CI workflows | 0 | 3 | 8 |

Phase decision D-03 (ports deliberately copy TS quirks) applies: parity quirks are filed as Info and tagged "parity quirk (D-03)". The known, intentionally owed items (inert `?: undefined` members and `MiscRuntime.requestRustInvoke` pending a clean `src/backend/sidecar/handlers.ts`; `registerRunnerAuthFlows` not yet passed `requestRustInvoke`; the PCGW GOG `permissiondenied` upstream bug) are not reported as findings.

## Summary

### Lane A: Rust gamelib-info crate + gamelib-info-cli

Lane A covers the `gamelib-info` crate and `gamelib-info-cli`. The crate is in good shape on the points the brief
named. Secrets never reach an error string or a `Debug` output (`Request`, `ResolvedKey`, `SetKeyArgs`,
`DiscountsArgs` and `Credentials` all redact, and `ReqwestHttp` strips URLs from transport errors). Every request
carries a timeout and a body cap. The cache and anti-cheat file writes are atomic or go through the StoreHost. No
production `unwrap` or `expect` touches network data; the only one is `coverage()` on a compiled-in file. The crate
spawns no child process, and its one boot task (`spawn_sgdb_migration`) holds a `Shutdown` registrant and is bounded
to 10 s. The regexes are linear-time and every JS-vs-Rust semantic gap is spelled out.

No Critical issues. The four warnings are real but narrow: two concurrency regressions from the TS-to-Rust move
(the TS ran these read-modify-writes on one thread, Rust runs them on several), one URL-hygiene gap, and one
shutdown-contract gap.

Tools run: none beyond reading (no cargo invocations), so compile and clippy status is not asserted.

Known or owed items, not re-reported: the inert `?: undefined` members and `MiscRuntime.requestRustInvoke`, the
`registerRunnerAuthFlows` gap, and the PCGW GOG `permissiondenied` bug.

### Lane B: src-tauri shell code + gamelib-info integration tests

Lane B covers the shell side of the phase (`info_dispatch.rs`, `info_secrets.rs`, the phase-86 hunks of
`main.rs` / `ipc_contract.rs` / `native_router.rs` / `sidecar.rs` / `tray.rs` / `tray/recent.rs` /
`rust_dispatch.rs`, `Cargo.toml`, `build.rs`, `crates/README.md`) and the `gamelib-info` integration tests.
`info_dispatch.rs` and `info_secrets.rs` were read in full; the shared files were reviewed from
`git diff a8582375 HEAD`, with the interleaved Phase 85 / 84 / 100 hunks (store host, log escaping,
`LONG_RUNNING_CHANNELS` additions, version bump 0.8.0 -> 0.11.0) skipped as non-phase-86.

No blocker. Against the Rust shutdown contract the new code is sound: no process is spawned; every
`info_*` op runs inside the crate's `guarded` wrapper (shutdown registrant raced against the token); the
only boot work (`spawn_sgdb_migration`) is bounded at 10 s and holds `info-sgdb-migrate` until the blocking
write returns; native channels use `spawn_blocking` + `block_on` (legal on a blocking-pool thread) and the
rustInvoke handlers run on the per-call `thread::spawn` worker, so `dispatch_sync` never runs on an async
worker. Secret handling is careful: keys never reach a log line or IPC error (`shell_log_detail` keeps
OS text on stderr only; rejections carry fixed path/code literals; tests assert no echo for every
secret-bearing channel); the Keychain slot names are routed through `keyring_account`'s allowlist and
pinned by tests. Validation in the dispatch layer is thorough and tested at every bound.

The two warnings are a robustness gap in the dev-only plaintext vault and a validation bound that is
tighter than both the TS it replaces and the crate beneath it. The infos are mostly test hygiene.

**Known / owed (not reported as findings, per the brief):** inert `?: undefined` members
(`itadSecrets`, `steamGridSecrets`, `miscRuntime`, `infoCaches`, `appRuntime`) and
`MiscRuntime.requestRustInvoke` pending a clean `src/backend/sidecar/handlers.ts`;
`registerRunnerAuthFlows` not yet passed `requestRustInvoke` (sign-outs skip the Rust wiki-cache clear);
the PCGW GOG `permissiondenied` upstream bug (golden `golden_wiki_sources.rs` asserts it deliberately).

### Lane C: TS production code

Reviewed the six `src/backend/info/*.ts` shims in full and the phase-86 hunks of the shared files, with
the Rust dispatcher (`src-tauri/src/info_dispatch.rs`, `src-tauri/crates/gamelib-info`, `info_secrets.rs`)
read for the TS<->Rust contract. `npx tsc --noEmit` over the repo is clean. The zod schemas in
`rustInvoke.ts` agree with the Rust arg structs for every `info_*` channel (field names, `overrideData`
rename, optional `appNamespace`/`latestFileHash`/`forceRefresh`, the five-runner enum). The `WikiInfo`
and HLTB TS shapes match what `wiki/hltb.rs` emits. The `info_gog_discounts` token path never reaches a
log line on either side. No secret leaks and no exit-contract violations (no new timers, watchers or
child handles in the TS shims; the one `setTimeout` touched, in `resetHeroic`, is already `unref`'d).

The recurring defect class is on the TS caller side of the new Rust round trips. Several call sites
that were synchronous, in-memory and effectively infallible before the port (store read/write, an
`axios` call with `.catch(() => null)`) now await a `rustInvoke` that can reject. Four of them have no
guard, and one of those sits in the post-game lifecycle where a rejection strands the UI.

Known / owed, not re-reported: inert `?: undefined` members (`itadSecrets`, `steamGridSecrets`,
`infoCaches`, `appRuntime` on the flow deps), `MiscRuntime.requestRustInvoke` riding on the bundle,
`registerRunnerAuthFlows` not yet passed `requestRustInvoke` (`canClearWikiCache` skip), the PCGW GOG
`permissiondenied` upstream bug.

### Lane D: TS tests, test utilities, meta/ build scripts, CI workflows

Lane D is in good shape. No blocker was found.

- **CI and release.**
  - The ITAD secret is read only through `IN_ITAD_API_KEY` / `ITAD_API_KEY` env mappings and is never echoed.
  - The "Require the ITAD_API_KEY secret" step runs before both the SEA step and tauri-action, on every matrix leg and on dry runs, so an absent key fails the release.
  - The key is no longer on the SEA step. It is on the tauri-action step, which is where `cargo` runs the `option_env!` compile.
  - `build.rs` has `rerun-if-env-changed`. The Rust side trims both baked and env keys before use (`secrets.rs::effective`), so a trailing newline in the secret is harmless.
  - `rust-test.yml` runs `-p gamelib-info -p gamelib-info-cli` on all three OS legs through the multi-crate step, and the push trigger has no `paths:` filter. A mutation test pins it.
- **meta/ build scripts.**
  - `__ITAD_API_KEY__` and `itadKeyDefineFlag` are fully gone from the live tree. The remaining hits are in `.claude/worktrees/release-v0.10`, which is not part of the scope.
  - `buildSidecar` and `buildSidecarSea` emit no `--define`.
  - `genStoreTable.ts` is consistent: its `CHAIN_VERSIONS` is pinned to the shell by a cargo test, and the new EXTRA_ROWS match the deletions.
- **Fixtures.**
  - I independently scanned the committed gamelib-info fixtures. Every `key=` is `REDACTED`, every `authorization`, `x-auth-token` and `set-cookie` value is `REDACTED`, and the HLTB tokens are `REDACTED` or synthetic. No secret is committed.
- **Tests.** No file in scope spawns a child process, so no fake-HOME violation exists. The suites that boot the sidecar use the harness fake HOME. No in-scope test reaches the real network: the network clients are mocked, or the call is answered by a `requestRustInvoke` double.

The findings below are guard-strength and maintainability issues.

## Critical Issues

### CR-41: unguarded `await addRecentGame` aborts the post-game callback when the Rust write rejects

**File:** `src/backend/launcher.ts:474` (callee `src/backend/info/recentGames.ts:19`, Rust `src-tauri/crates/gamelib-info/src/recent.rs:129`)
**Issue:** `runLaunchEventCallback` ends with `await addRecentGame(deps, gameInfo)` and then does the
save sync, `sendGameStatusUpdate(..., 'done')` and, for `isCLINoGui`, `deps.appState.exit()`. Before the
port that call was an in-memory `configStore.set` that could not realistically reject. It is now a
`rustInvoke` to `info_recent_add`, which rejects with `info_recent_add:write-failed` (a read-only
`config.json`, the Phase 85 "newer file opens read-only and every write is refused" case in
`gamelib-store/src/host.rs`), `:store-unavailable`, `:corrupt-list`, `:bad-args` (appName empty or over
1024 UTF-16 units), `:not-ready`, or the sidecar's `rustInvoke timed out after 60000ms`. Any of these now
throws out of the launch callback, so the `'done'` status is never sent (the card stays on "playing"),
save upload is skipped, and a CLI no-GUI launch never exits. The two other call sites already know this
hazard and guard it: `steam/launchDispatch.ts:104-111,176-181` wraps it in try/catch and
`sideload/games.ts:234` adds `.catch`. This one was missed. Recording a recent game is bookkeeping and
must not decide whether the launch lifecycle completes.
**Fix:**
```ts
try {
  await addRecentGame(deps, gameInfo)
} catch (error) {
  logWarning(['Recording recent game failed:', error], LogPrefix.Backend)
}
```

## Warnings

### WR-01: SlotOwner read cache can keep a stale key after a concurrent `set`

**File:** `src-tauri/crates/gamelib-info/src/secrets.rs:196-248`
**Issue:** `SlotOwner` guards against a read caching a stale answer with an `epoch`. `set` bumps the epoch once, in
`invalidate()` at line 234, and then writes to the keyring. It does not hold the `fetch` mutex and does not bump the
epoch again after the write. Trace:
1. `set` runs `invalidate()`, so the epoch becomes E+1 and the cache is empty.
2. A concurrent `get` passes `peek`, takes `fetch`, reads `epoch = E+1`, and starts `source.get()`, which returns the
   old key.
3. `set` finishes its keyring write and stores `value = Some(new)` (line 243).
4. `get` returns, sees `cache.epoch == epoch` (both E+1), and overwrites the cache with the old key (line 214).

The window is the duration of the keyring write. With a Keychain prompt or the 45 s bound it is wide. The stale value
then sticks until the next `set`, and every ITAD or SteamGridDB request uses the removed or old key. ITAD's own
`rejected` handling would paper over only the ITAD case.
**Fix:** Make `set` take the `fetch` lock for the whole write, or bump the epoch after a successful write:
```rust
Ok(()) => {
    let mut cache = locked(&self.cache);
    cache.epoch += 1; // a read that started during the write must not cache its older answer
    cache.value = Some(written);
    Ok(())
}
```

### WR-02: ITAD price-cache `index` read-modify-write is not serialised (cap can be exceeded, entries orphaned)

**File:** `src-tauri/crates/gamelib-info/src/itad/cache.rs:115-135` (callers `itad/mod.rs:363`, `mod.rs:486-492`, `mod.rs:602`)
**Issue:** `write_price_entry` reads the `index` key list, appends the key, evicts the oldest while over 500, and
writes the list back. It does this as separate store calls with no lock. The TS ran this on the single Node thread
with a synchronous `conf`, so it was atomic. In Rust, `dispatch_sync` is called from several shell worker threads (see
`info_dispatch.rs`), and `single_flight` only collapses identical cache keys. Two searches for different titles, or a
search and a deals expansion, run in parallel and interleave. The second writer overwrites the first's `index` update.
The first's entry then exists in `itad_prices.json` but is in no index, so it is never evicted. Over time the cap is
not enforced and the 43200-minute store grows. `recent.rs` and `overrides.rs` already take a module-level `Mutex` for
exactly this reason (their module docs cite "research Pitfall 7"), so the pattern is known; it was missed here.
**Fix:** Take a module-level lock around the whole function:
```rust
fn write_lock() -> std::sync::MutexGuard<'static, ()> {
    static L: std::sync::Mutex<()> = std::sync::Mutex::new(());
    L.lock().unwrap_or_else(|e| e.into_inner())
}
pub fn write_price_entry(...) {
    let _g = write_lock();
    // existing body
}
```

### WR-03: Remote- and caller-sourced values are interpolated into request URLs without encoding

**File:** `wiki/pcgw.rs:186` (gog id), `wiki/pcgw.rs:211-213` and `wiki/agw.rs:111-114` (`pageid`), `wiki/protondb.rs:37`
and `wiki/deck.rs:37-39` (`steam_id`), `wiki/gog_ctx.rs:38` and `:58` (`store` and `id`), `wiki/mod.rs:335`
**Issue:** `pcgw::lookup` interpolates `args.app_name` (the GOG id) raw into a `where=...%20HOLDS%20{id}` clause. The
page id from the PCGW and AGW answers goes in via `to_js_text` with no encoding. The Steam id passed to ProtonDB and
the Steam Deck report can come from `to_js_text(&gamesdb.steam_id)`, which is the `external_id` string of a GOG
GamesDB response. `gog_ctx` interpolates the Epic or Amazon app name into two GOG URLs. None of these values is
validated as digits. A `?`, `#`, `&`, `/` or `..` in one of them rewrites the path or query of the request. The host
cannot change, since every URL starts with a fixed `https://host/` prefix, so the impact is bounded to the same-site
path or query and to a wasted or odd request. Commit `aacc9c11f` fixed the PCGW title term for this exact class, so
the same fix belongs on the neighbours. Note that `HttpError`/`Request` redaction means a bad URL would not even show
in a log.
**Fix:** Encode at the boundary with `encode_uri_component`, or validate (`id.bytes().all(|b| b.is_ascii_digit())`)
where the value must be an id:
```rust
format!("{API}?...%20HOLDS%20{}&format=json", encode_uri_component(id))
let steam_id = steam_id.filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))?;
```
Do the digits check for ProtonDB, Deck and the PCGW and AGW `pageid`, and encode for the GOG id and for
`gamesdb_release` / `gog_store_url`.

### WR-04: Synchronous Keychain read inside a guarded op cannot be cancelled by shutdown

**File:** `src-tauri/crates/gamelib-info/src/lib.rs:127-143`, `secrets.rs:196-226`, `itad/mod.rs:203-209`, `steamgrid.rs:113-119`
**Issue:** `guarded` races the op future against the shutdown token and holds an `info` registrant. Several ops call
`ctx.itad_key.effective()` or `ctx.sgdb_key.get()` before their first `.await`. These run `SecretSource::get`, which
blocks synchronously, and the shell's `KeyringSecretSource::get` is bounded at 45 s (`info_secrets.rs`). While the
thread sits in that read the `select!` cannot poll `token.cancelled()`, so the op does not answer `<op>:shutdown`.
The `info` registrant is held for up to 45 s against the 3.5 s drain budget, so the exit reports
`still running at exit deadline: info` and abandons it. A second caller on the same slot also parks on the `fetch`
std mutex. The brief's contract point 2 says in-flight work must watch the token for cancellation; this one cannot.
The blocking does not stall the shell's tokio workers (they use `block_on` on a caller or `spawn_blocking` thread),
so this is an exit-latency issue, not a hang.
**Fix:** Do the keyring read on `tokio::task::spawn_blocking` and `await` the handle so the shutdown branch can win:
```rust
let owner = ...; let ctx_ref = ...;
let outcome = tokio::task::spawn_blocking(move || source.get(slot)).await;
```
This needs the source in an `Arc` (it already is) and an async variant of `SlotOwner::get`. Or accept the 45 s bound
and record it in `secrets.rs` as a known exception to the contract.

### WR-21: Dev-vault file handling is racy and non-atomic (symlink TOCTOU, truncate-then-write, cross-process lost update)

**File:** `src-tauri/src/info_secrets.rs:196-208`, `222-235`, `259-272`, `277-291`
**Issue:** `DevVaultSecretSource` shares `<temp>/gamelib-dev-secret-vault.json` with the TS sidecar vault
(which still owns the Steam and Humble slots in that file). Three weaknesses, all dev-only
(`GAMELIB_DEV_SECRET_VAULT=1` AND `tauri::is_dev()`), but the file holds plaintext credentials:
1. `create` refuses a symlink with `symlink_metadata`, then `exists()`, then `OpenOptions::open(create,
   truncate)` and later `set_permissions` / `metadata` all follow links. A link planted between the check
   and the open (or after `create`, since every `write_slot` re-opens by path) is followed on a shared
   temp directory (Linux `/tmp`). The refusal test only covers a link that already exists.
2. `write_owner_only` truncates and then writes in place. A crash or a concurrent reader between the two
   sees an empty or partial file; `read_map` treats that as "nothing stored", and the next write (this
   process or the sidecar) then persists only its own slot, silently erasing the Steam refresh token and
   Humble session that lived in the same file. `a_corrupt_vault_reads_as_empty_and_the_next_write_repairs_it`
   asserts this erasure as intended behaviour.
3. The `rmw` mutex serialises only this process. The TS vault does an unlocked read-modify-write on the same
   file, so a Rust ITAD/SteamGridDB save racing a sidecar Steam token save loses one of them.
TS had the same non-atomic write (parity), but the Rust side also advertises a symlink defence that the
sequence above does not deliver.
**Fix:** write to a sibling temp file created with `OpenOptions::mode(0o600)` + `custom_flags(libc::O_NOFOLLOW)`
(or `create_new`), `sync_all`, then `rename` over the vault; open the existing file with `O_NOFOLLOW` for
reads; and on a corrupt read, refuse to write (return `Err("corrupt")`) instead of treating it as empty, so
the other slots survive. A cross-process advisory lock (or documenting that the two writers must not run
together) covers item 3.

### WR-22: `getGameMetadataOverride` bound (256) is tighter than the TS schema (4096) and than the crate's own bound (1024)

**File:** `src-tauri/src/info_dispatch.rs:453-472`
**Issue:** `OVERRIDE_APP_NAME_MAX_UTF16 = 256`. The TS channel was `z.tuple([nonEmptyString()])`
(`src/common/types/ipc/gameDetails.ts:65` at the base commit; `nonEmptyString(max = 4096)` in
`schemaTypes.ts:26`). The crate's `overrides::APP_NAME_MAX_UTF16` is 1024 (`recent.rs:42`, reused in
`overrides.rs:43`), and `info_overrides_set` / `info_overrides_get` accept up to 1024. So an override stored
through the set path for an `appName` of 257-1024 units can never be read back by the renderer's native
`getGameMetadataOverride` (it is rejected `too_big` before the crate runs), and the shell is stricter than
the TS it replaces with no recorded reason. Real app names are short, so impact is small, but this is a
Rust-is-worse-than-TS deviation, not a D-03 parity quirk, and the three layers disagree.
**Fix:** drop the local constant and reuse `gamelib_info::recent::APP_NAME_MAX_UTF16` (the same bound
`parse_remove_recent` already uses), or document why 256 is intended and make the crate agree.

### WR-41: a failed or refused umu id lookup now aborts a Linux game launch

**File:** `src/backend/info/wiki.ts:31` (callers `src/backend/storeManagers/gog/games.ts:747`, `src/backend/storeManagers/legendary/games.ts:1073`, `src/backend/storeManagers/nile/games.ts:459`)
**Issue:** The TS `getUmuId` swallowed every network failure (`.catch(() => null)`) and only threw for a
malformed 200 body. The Rust `umu::get` additionally rejects with `info_umu_get:store-unavailable` and
`:store-write` (cache read or write failed) plus the transport failures (`:not-ready`, 60 s timeout, a
`bad-args` for an empty or over-256-unit app name). The three `launch()` bodies call it as
`(await getUmuId(...)) as string | null` with no try/catch, so a lookup whose only purpose is to set an
optional `GAMEID` env var now rejects `launch()` and the game never starts. A cache-write failure after a
successful HTTP answer is enough. The umu id is best-effort; the original contract (never blocks a launch
on a network failure) is worse now.
**Fix:** make the shim honour the old best-effort contract so the four call sites stay one line:
```ts
export async function getUmuId(deps, appName, runner): Promise<unknown> {
  try {
    return await deps.requestRustInvoke(RUST_INFO_UMU_GET, [{ appName, runner }])
  } catch (error) {
    logWarning(['umu id lookup failed:', error], LogPrefix.Backend)
    return null
  }
}
```
(The schedule test pins "one typed call", so adjust it, or put the try/catch at the three call sites.)

### WR-42: `getGameInfo` and the non-Steam shortcut flow now fail whole on a Rust round-trip rejection

**File:** `src/backend/gamedetails/dispatch.ts:113`, `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts:260`
**Issue:** `getGameInfo` used to decorate the game with `attachOverrides` from an in-memory store. It now
awaits `info_overrides_attach` over rustInvoke and propagates any rejection (transport timeout,
`:not-ready`, shutdown-guard refusal), so the game page's `getGameInfo` call rejects even though the
override is pure decoration and the fallback (return `tempGameInfo` unchanged) is trivially correct. The
same class: `addNonSteamGame` did `await getWikiGameInfo(deps, game)`, which returned `null` on any
source failure; it now awaits the Rust call unguarded (`info_wiki_get` rejects with `bad-args` for an
empty or over-256-unit app name or over-1024-unit title, `:not-ready`, timeout), which throws out of
`addNonSteamGame` before the shortcut is written, although the wiki data only supplies an optional Steam
id.
**Fix:**
```ts
// dispatch.ts
try {
  return (await attachOverrides(deps, tempGameInfo)) as GameInfo
} catch (error) {
  logWarning(['attachOverrides failed:', error], LogPrefix.Backend)
  return tempGameInfo
}
// nonesteamgame.ts
const wikiInfo = await (getWikiGameInfo(deps, game) as Promise<WikiInfo | null>).catch(() => null)
```

### WR-61: fixtureRedaction scan floor is stale and no longer proves a full-tree walk

**File:** `src/backend/info/__tests__/fixtureRedaction.test.ts:36` (the floor is used at `:97-101`)

**Issue:**
- `FILE_FLOOR = 189` was measured from "the three 86-04 goldens" (recent, overrides, anticheat). The fixture tree now holds 992 files (`find .../gamelib-info/tests/fixtures -type f | wc -l`), about 36 MB across eight slices.
- The floor only has to be cleared by 19% of the tree. A walk that silently loses a whole slice, such as `recorded/discounts` or `recorded/wiki`, which are exactly where tokens and headers live, still passes. That is the failure mode the floor exists to catch.
- This is the only permanent secret scan. The recorder that redacted at write time is deleted (86-24).

**Fix:** Raise the floor to a measured value, for example 900. Add a per-slice assertion that each of the eight top-level slice directories contributes at least one file, as `ORACLE_SLICES_WITH_GOLDEN` in `infoPortComplete.test.ts` already enumerates. Re-measure and raise the floor whenever fixtures are added.

### WR-62: fixtureRedaction rules cover fewer secret shapes than the recorder redacted

**File:** `src/backend/info/__tests__/fixtureRedaction.test.ts:42-72` (RULES), header comment `:1-16`

**Issue:**
- The committed recordings carry `"set-cookie": "REDACTED"` (several exchanges under `recorded/wiki` and `recorded/steamgrid`), so the deleted recorder did redact cookies.
- The permanent scan has no rule for `Cookie` or `Set-Cookie` values, nor for `x-api-key`, `access_token`, `refresh_token` or `?token=`/`apikey=` in a query.
- The `key=` rule only matches `[?&]key=`.
- Now that the recorder is deleted, a future hand-added or Rust-written recording can commit a live cookie or token and this test stays green. The header says it is the check "that nothing slipped past" the recorder, which overstates its coverage.

**Fix:** Add rules mirroring the recorder's redaction set (at minimum `set-cookie` and `cookie` values must be `REDACTED`), plus a generic `(access|refresh|id)_token` field rule and an `api[_-]?key` rule. Each needs the same planted-value self-test the existing rules have. Update the header to list exactly what is covered.

### WR-63: the "crate bakes nothing" assertion scans 3 of about 25 crate source files

**File:** `meta/__tests__/releaseItadKey.test.ts:176-184`

**Issue:**
- The test is titled "the crate hard-codes no environment variable name and bakes nothing (D-25)" but only walks `secrets.rs`, `ctx.rs` and `lib.rs`.
- `gamelib-info/src` also holds `itad/*`, `steamgrid.rs`, `wiki/*`, `http.rs`, `discounts.rs` and others.
- A later `option_env!("ITAD_API_KEY")` or `std::env::var("ITAD_API_KEY")` in `itad/gate.rs`, say, would pass.
- The one legitimate `env!(` use (`env!("CARGO_MANIFEST_DIR")` in `runner_caps.rs` and `itad/coverage.rs`) is already excluded by the `[^_]env!\(` shape, so widening the walk is safe.

**Fix:** Walk every `.rs` under `src-tauri/crates/gamelib-info/src`, for example with `walkStripped(['src-tauri/crates/gamelib-info/src'], { ext: /\.rs$/ })` from `infoPortGate`. Keep the `ITAD_API_KEY` and `option_env!` bans, and add a floor on the number of files read.

## Info

### IN-01: `ItadGate::single_flight` follower cancellation removes the leader's flight entry

**File:** `src-tauri/crates/gamelib-info/src/itad/gate.rs:29-48`
**Issue:** `Leave::drop` removes the table entry whenever `Arc::ptr_eq(current, self.flight)`. Leader and followers
share the same `Arc`, so any follower that is dropped (a cancelled op) removes the entry while the leader is still in
flight. A later identical request then starts a second flight and a duplicate ITAD call. The leader's result is
unaffected. The code comment says only the leader should remove it. Only a leader that created the entry should
remove it.
**Fix:** Record in `single_flight` whether this caller inserted the entry (`Entry::Vacant`) and have `Leave` act only
if it did.

### IN-02: Dead and test-only public items

**File:** `ctx.rs:124-129` (`InfoCtx::secret`), `http.rs:105` (`HttpError::Cancelled`), `crossover/mod.rs:217`
(`Resolver::is_loaded`), `itad/coverage.rs:65` (`PRICE_AMOUNT_SOURCE`), `itad/gate.rs:61` (`blocked_until`)
**Issue:** A grep of `src-tauri/crates` and `src-tauri/src` finds no caller for `InfoCtx::secret` (so the
`use ...::Slot` import in `ctx.rs` serves only it), none for `Resolver::is_loaded`, and none for
`PRICE_AMOUNT_SOURCE`. `blocked_until` is called only from tests. `HttpError::Cancelled` is never constructed by
`ReqwestHttp`, `Replay` or any test `Http` outside two unit tests. It still forces an arm in `steamgrid.rs:157`,
`discounts.rs:123`, `crossover/fetcher.rs:124`, `wiki/mod.rs:82`.
**Fix:** Delete the unused ones, or `#[cfg(test)]` the test-only accessors. If `Cancelled` is meant as a future shell
`Http` impl seam, say so in its doc comment.

### IN-03: Identical helper bodies duplicated

**File:** `steamgrid.rs:150-160` and `discounts.rs:114-126` (`transport_message`); the `GameLib/<v> (+https://github.com/...)`
User-Agent string is built in `anticheat.rs:186`, `wiki/mod.rs:45`, `crossover/fetcher.rs:178`
**Issue:** `transport_message` is byte-for-byte the same in two modules, and `wiki::user_agent` already exists but is
re-implemented three times. A repository rename or a change to the message wording needs edits in every copy.
**Fix:** Hoist both to `http.rs` (the second as `http::game_user_agent(ctx)`).

### IN-04: Bounds the crate claims to enforce are skipped for `wiki::get` and `umu::get`

**File:** `wiki/mod.rs:154-157, 219-230`, `umu.rs:57`
**Issue:** `itad/mod.rs:53-54` says "the native decode in the shell checks them first; the crate checks them again",
and steamgrid, recent, overrides, discounts and the rating map do enforce their own bounds. `wiki::TITLE_MAX_UTF16`
and `wiki::APP_NAME_MAX_UTF16` are only `pub const`s that `info_dispatch.rs` reads. `wiki::get` and `umu::get` take an
unbounded title and app name straight into URLs and a cache key. That is reachable by the CLI and by any later in-Rust
caller, not by the renderer today.
**Fix:** Add the two length checks to `wiki::get` and one to `umu::get`, as the sibling ops do.

### IN-05: `runner_caps` and `itad::coverage` fail differently on a malformed compiled-in JSON

**File:** `runner_caps.rs:38-47`, `itad/coverage.rs:30-35`
**Issue:** Both include a JSON file at compile time. `coverage()` uses `.expect(...)`, so a malformed file panics at
first use (caught by `guarded` as `<op>:panic`). `table()` falls back silently to an empty table, so every runner is
"unknown" and every wiki, umu and rating-map op answers `bad-args`. A malformed file is a build-time mistake that the
unit tests catch in either design, so this is a consistency nit. The silent form hides the cause.
**Fix:** Use the same strategy in both; for `runner_caps` prefer `expect`, as its own doc says run-time failure is
impossible.

### IN-06: Parity quirks (D-03) worth keeping on the todo list

**File:** `crossover/mod.rs:85-87,105`, `anticheat.rs:125-132`, `anticheat.rs:198-203`
**Issue:** parity quirk (D-03), not new bugs:
- `normalize()` of a title with no Latin letters or digits (any all-CJK, Cyrillic or Greek name) is `""`. `by_name`
  `or_insert`s the first such entry's rating under `""`, so every other non-Latin game on macOS matches it and shows
  that rating. The index drives a "this game won't run" badge. The TS had the same behaviour (checked against
  `a8582375:src/backend/crossover_index/index.ts`). A one-line guard (`if key.is_empty() { skip }` in
  `IndexMaps::build`, and `None` in `rating` for an empty key) would fix it, which is why it belongs on the list.
- `anticheat::info` with `appNamespace: ""` matches the first entry that has any Epic namespace (`"".contains` is
  always true). The drift case relies on it deliberately.
- `anticheat::download` accepts any 2xx body, including a captive-portal or GitHub error page, and renames it over a
  known-good data file. The rename is atomic against a crash, not against bad content or a power cut (no `fsync`). A
  JSON-array check before the rename would keep the last good file, and the doc comment already presents the temp
  file as the safeguard.
**Fix:** As above, each in its own todo.

### IN-21: Already-defended-elsewhere: `cargo:rerun-if-env-changed=ITAD_API_KEY` and its pinning test

**File:** `src-tauri/build.rs:1-5`, `src-tauri/src/info_dispatch.rs:2786-2797`
**Category:** necessity
**Issue:** The comment claims that "without this line cargo would reuse a build made with a different key".
That state cannot occur: rustc records `option_env!` reads in dep-info and Cargo recompiles the crate when
the variable changes, independent of any build script. Measured here with a throwaway crate containing only
`option_env!("ITAD_PROBE")` and no `build.rs`: building with `ITAD_PROBE=a` then `ITAD_PROBE=b` printed
`Compiling envprobe` on the second build and the binary printed `Some("b")`. `build_rs_reruns_when_the_baked_key_changes`
then pins the redundant line by text-matching `build.rs`. (Emitting any `rerun-if-*` is harmless here
because `tauri_build::build()` already does.) This rests on cargo behaviour rather than on repo contents, so
Info, not Warning.
**Fix:** remove the line, the premise in its comment and the text-match test, or keep it and correct the
comment to "belt and braces". Do not rely on it to explain why the baked key is picked up.

### IN-22: Key-setter parsers borrow another slot's constant; the doc names a constant they do not use

**File:** `src-tauri/src/info_dispatch.rs:685-688`, `1013-1016`
**Issue:** `parse_steamgrid_set_key` and `parse_itad_set_key` both delegate to `parse_steamgrid_search`, so
the ITAD key bound is `gamelib_info::steamgrid::TEXT_MAX_UTF16` while the doc comment cites
`gamelib_info::itad::KEY_MAX_UTF16`. Both are 256 today, so nothing is wrong yet; changing either constant
silently changes (or fails to change) the other channel. The four zero-argument parsers
(`parse_get_all_game_overrides`, `parse_steamgrid_has_key`, `parse_itad_key_status`, and the shape of
`parse_remove_recent` vs `parse_get_game_metadata_override`) are also copy-pasted.
**Fix:** give each its own constant reference (`itad::KEY_MAX_UTF16`, `steamgrid::TEXT_MAX_UTF16`) through one
shared `parse_bounded_string(args, max, allow_empty)` and one `parse_no_args(args)`.

### IN-23: Two tests claim more than they assert

**File:** `src-tauri/src/info_dispatch.rs:2177-2205`, `2332-2363`
**Issue:** `the_key_status_json_has_exactly_two_boolean_keys_and_not_the_key` ends with the comment
"A write clears a stored key and the answer follows", but after `info_itad_set_key` with `"  "` it never
re-reads the status (and with the `OneKey` source, whose `delete` is a no-op and `get` always answers a key,
it could not show `hasKey: false` anyway), so only `Ok(Null)` is checked. In
`the_wiki_lookup_serves_a_fresh_cached_entry...` the force-refresh arm asserts `again.is_object() ||
again.is_null()`, which any lookup result satisfies; the real claim ("forceRefresh reaches the sources") rests
on the following `!canned.is_empty()` line alone.
**Fix:** use `MemorySecretSource` for the key-status test and assert `hasKey` flips to `false`; assert a
specific `fetchStatus` for the forced lookup.

### IN-24: Test helpers copied across six golden suites; some use `tempfile` instead of `FakeHome`

**File:** `tests/golden_recent.rs:86-183`, `golden_overrides.rs`, `golden_anticheat.rs:100-158`, `golden_crossover.rs:162-201`,
`golden_storeSearch.rs:66-98, 227-266`, `golden_discounts.rs`, `golden_steamgrid.rs` (all under
`src-tauri/crates/gamelib-info/tests/`); `http_replay.rs:44`, `golden_storeSearch.rs:494`
**Issue:** `copy_tree`, `tree`, `check_manifest`, `read_json`, `expected_folders` and a `TestClock` exist in
`wiki_golden/mod.rs` but are re-implemented in each of the other suites (ten copies of `check_manifest`, each
with its own `an_empty_case_list_fails_the_manifest_guard` testing that copy). `tree`/`walk` swallow an
unreadable directory (`let Ok(read) = ... else { return }`), so a missing `after/` folder compares as an empty
tree. Separately, `http_replay.rs` and `golden_storeSearch.rs` create fixtures with `tempfile::tempdir()`
while `crates/README.md` section 2b says fixtures belong in `FakeHome` (0700 root); the content is synthetic
and keyless, so this is convention drift rather than exposure.
**Fix:** move the shared helpers into `gamelib-testutil` (or a common `tests/common/mod.rs`), make `tree`
panic on an unreadable directory that is expected to exist, and use `FakeHome` for the synthetic replay cases.

### IN-25: 17 tests depend on the process-global context never being installed

**File:** `src-tauri/src/info_dispatch.rs` (16 `assert!(info_ctx().is_none())` sites, e.g. 1233, 1339, 1431),
`src-tauri/src/tray.rs:685`
**Issue:** the "not ready" and "validates before the context" tests all assume no other test in the
`gamelib-shell` bin calls `install` (a `OnceLock` that can be set once and never cleared). Nothing enforces
that; one future test that installs the context, or a code path under test that does, turns 17 unrelated
tests red depending on scheduling order.
**Fix:** let the handlers take the context lookup through a small injectable accessor for tests (as
`TrayRecentSink` already injects its tray and limit), or isolate the "not ready" assertions behind a
`#[cfg(test)]` reset, so they do not read global state.

### IN-26: Loopback and timing tests are not hermetic

**File:** `tests/http_replay.rs:599-614, 624-634, 563-593`; `tests/secrets.rs:665-687`;
`tests/golden_storeSearch.rs:762-786`
**Issue:** (a) `ReqwestHttp::new()` builds a stock reqwest client, which reads `HTTP(S)_PROXY` from the
environment; a developer shell with a proxy and no `NO_PROXY=127.0.0.1` would route the loopback tests
through it and fail them (not run here; reasoned from reqwest's env-proxy default). (b)
`reqwest_http_errors_never_carry_the_url_or_its_key` gets a "port nothing listens on" by binding and dropping
a listener, which another process can take in between. (c)
`a_slow_keyring_ends_the_wait_at_the_bound...` needs `elapsed < 500ms` around a 600 ms sleep, and
`a_pending_search_is_cancelled_by_shutdown` relies on a 100 ms thread sleep with no timeout around a
`dispatch_sync` that would hang forever if cancellation regressed. All pass in the normal case; they are
flake or hang risks, not wrong assertions.
**Fix:** construct the client with `.no_proxy()` for the loopback tests (a `ReqwestHttp::for_tests`), reserve
a refused port by connecting to a listener that has been closed and keeping the guard, widen the keyring
margin (or use a channel handshake instead of elapsed time), and wrap `dispatch_sync` waits in a watchdog.

### IN-27: Generated args struct for the GOG discounts call derives `Debug` and carries the bearer token

**File:** `src-tauri/src/ipc_contract.rs:2976-2985`
**Issue:** `InfoGogDiscountsArgs` (`token: Option<String>`) derives `Debug` like every generated struct. Nothing
formats it today (`gog_discounts_with` discards the parsed value), but a later `{args:?}` in a log or panic
message would print the GOG token into `gamelib.log`, which users upload. The crate's `Request` already hides
its secrets from `Debug` for exactly this reason.
**Fix:** have the generator emit a redacting `Debug` for fields it knows are secrets (or drop the `Debug`
derive on that struct), and add the struct to the source-text gate that forbids formatting secret-bearing args.

### IN-28: Oracle-strength notes on the goldens (documentation, no wrong assertion found)

**File:** `tests/golden_wiki.rs:182-203`, `tests/golden_recent.rs:1-8, 185-213`, `tests/regex_vectors.rs:413-442`
**Issue:** (a) `replay_case` skips the per-host request-order check for any case holding a `rustOnly`
exchange, so for those cases only the multiset of requests is pinned. (b) `sixty-entry-list` and the
`NO_OP_REWRITES` case are not straight TS recordings (the first is hand-derived from the 50-entry cap per the
operator ruling; both are named in the file header), so they prove the Rust behaviour, not TS parity.
(c) `the_*_class_is_the_javascript_*_over_every_code_unit` iterates `char::from_u32(0..=0xFFFF)`, which skips
the 2048 surrogate code units that JS `.` matches; the claim "every UTF-16 code unit" is slightly broader than
what can be represented in a Rust `&str` (a lone surrogate cannot reach these patterns).
**Fix:** none required; keep the three in the file headers so a future reader does not read them as TS-pinned.

### IN-29: Remote-supplied error text is relayed to the renderer (parity quirk (D-03))

**File:** `tests/golden_steamgrid.rs:566-573` (asserting the behaviour of the crate's `steamgrid` error path)
**Issue:** parity quirk (D-03). A SteamGridDB `{"success":false,"errors":["a","b"]}` answer becomes the op's
`Err("a, b")` and reaches the renderer verbatim through `info_dispatch::steamgrid_*` (`run_info_op` returns
the crate's string unchanged). The TS did the same, so it is not a regression, and the renderer shows text
rather than markup; noted only because it is the one place where third-party text crosses into an IPC error
unmodified, while the shell elsewhere takes care to return fixed literals.
**Fix:** none for this phase; if the renderer ever renders the string as HTML, map unknown API errors to the
fixed "Failed to get grids" message.

### IN-41: `gameAnticheatInfo` shim makes a Rust round trip on every launch for the case that is always `null`

**File:** `src/backend/launcher.ts:783`, `src/backend/info/anticheat.ts:39`
**Issue:** The TS function returned `null` immediately for `appNamespace === undefined` and on Windows,
with no I/O. Every non-Epic launch (and every Windows launch) now sends `{ appNamespace: undefined }`
(serialised as `{}`) to Rust to be answered `null`. The rejection is harmlessly swallowed by
`logWriter.logInfo`'s promise handling, so this is waste, not a bug. Short-circuit in the shim or at the
call site (`namespace === undefined ? Promise.resolve(null) : ...`), keeping Rust's check as the second
line.

### IN-42: GOG discounts lost its diagnostic log lines in the port

**File:** `src/backend/info/discounts.ts:25-32`
**Issue:** The TS body logged `Failed to get user credentials: User maybe is not looged in` (warning) when
a flag was set with no credentials, and `Failed to fetch GOG discounts: ...` (error) before rethrowing.
Neither exists now: a `GOGUser.getCredentials` rejection (it spawns `gogdl auth`) and a failed Rust call
both reject to the renderer with nothing in `gamelib.log` from the sidecar side, and a flag silently
downgraded to unauthenticated is invisible (the crate logs only page numbers and status codes). Add the
two log lines in the shim (the token must stay out of them).

### IN-43: dev vault file is now read-modify-written by two processes with non-atomic writes (dev only)

**File:** `src/backend/sidecar/devSecretVault.ts:149-163` with `src-tauri/src/info_secrets.rs` (`write_slot`, `write_owner_only`)
**Issue:** D-26 deliberately shares `<temp>/gamelib-dev-secret-vault.json` between the sidecar vault (Steam
and Humble slots) and the Rust vault (ITAD and SteamGridDB slots). Each side re-reads the file per
operation and keeps unknown keys, which is correct for one process, but each side's mutex is
process-local and Rust writes with `OpenOptions::truncate(true)` + `write_all` (TS `writeFileSync` does the
same), so a reader can see a truncated empty file, and `readVaultFile` treats parse failure as `{}`. A
concurrent write from the other side then persists a map missing the other side's slots (for example the
Steam refresh token). Gated behind `GAMELIB_DEV_SECRET_VAULT=1` in a dev build, so the cost is a
spurious re-login in dev. Writing to a temp file in the same directory and `rename`ing on both sides
removes the truncation window.

### IN-44: stale channel counts and "five/six/seven" wording in `enrichmentFlowRegistration.ts`

**File:** `src/backend/sidecar/enrichmentFlowRegistration.ts:6,36-39,63-64,100-105,175`
**Issue:** The header says "Registers the 7 enrichment channels" and "all seven registrations ... every
one of the seven is INVOKE", a later paragraph says "all six", another says "every one of these five
channels", and `registerEnrichmentFlows`' own doc says 6. The function registers exactly six
(`getKnownFixes`, `getGamelibFixStatus`, `getRunsForMeMap`, `setRunsForMe`, `getCrossoverIndex`,
`getGogDiscounts`). Reconcile to 6 (the sidecar's channel census tests presumably pin the real set).

### IN-45: dead `recentGamesChanged` backend event and stale comments naming deleted modules

**File:** `src/backend/backend_events.ts:13,31-34`, `src/frontend/screens/StoreSearch/storeSearchSession.ts:31`, `src/backend/info/wiki.ts:3-18`
**Issue:** With `recent_games.ts` gone nothing emits or listens for `BackendEvents.recentGamesChanged`
(grep over `src/backend` finds only the type member and the comment, which still describes a `tray_icon`
listener that no longer exists). `storeSearchSession.ts` cites `src/backend/storeSearch/itadCache.ts`, which
was deleted in 86-17. `info/wiki.ts`'s header has two overlapping paragraphs (the umu paragraph is spliced
into the wiki module doc and says "this shim" for the module). Remove the dead member and fix the
references.

### IN-46: `metadataChanged` push is no longer ordered with the write that caused it

**File:** `src/backend/gamedetails/overrides.ts:91-105`
**Issue:** `setGameMetadataOverride` now does `await set` then `await get_all` as two separate frames; the
sidecar comment states Rust dispatches each `rustInvoke` on its own worker thread. The Rust RMW is behind a
mutex so the file is consistent, but two rapid overrides for different games can finish their
`get_all` snapshots out of order and the older snapshot can be pushed last, leaving the renderer with a
stale map until the next refresh. Low likelihood (the dialog sends once per save). Fixing needs either a
single Rust op returning the whole map after the write or a sequence guard in `notifyChanged`.

### IN-47: parity quirks kept per D-03 (no action required)

**File:** `src/backend/info/anticheat.ts`, `src/common/types/ipc/native.ts:62-66`, `src/common/types/ipc/rustInvoke.ts`
**Issue:** parity quirk (D-03): anticheat no-match answers `null` where the TS answered `undefined` (the
renderer hook already types `AntiCheatInfo | null`); `info_umu_get` rejects `bad-response` for a malformed
200 body as the TS did (by a `TypeError`); bounds are inconsistent between the native
`getGameMetadataOverride` (256 UTF-16 units) and the rustInvoke `info_overrides_get` (1024), and the
rustInvoke zod schemas carry no length bounds at all (the crate re-validates, which holds). All noted for
the record only.

### IN-61: stale workflow comment says the SEA step carries the key

**File:** `.github/workflows/release-tauri.yml:714`

**Issue:** The new comment says the tauri-action step "must carry it, exactly as the sidecar SEA step does." Phase 86 removed the key from the SEA step (lines 344-345 of the same file say so), so the sentence now contradicts the file.

**Fix:** Drop "exactly as the sidecar SEA step does".

### IN-62: two overlapping ITAD workflow suites, and the echo guard is narrow

**File:** `src/backend/__tests__/releaseWorkflow.test.ts:1819-1840` and `meta/__tests__/releaseItadKey.test.ts:93-116`

**Issue:**
- Both suites assert "SEA step has no key", "job env has no key" and "no run body echoes the key". Two suites must change in step for every future edit to this wiring.
- Both `echo` guards match only `echo[^\n]*\$\{?(IN_)?ITAD_API_KEY`. A `printf`, `cat`, `env` dump or `set -x` is not caught.

**Fix:** Keep one owner for the ITAD wiring (`releaseItadKey.test.ts`) and delete the duplicate cases. Widen the guard to any run body that references the variable beyond the single `test -n` form.

### IN-63: leftover names and dead scaffolding after the TS deletions

**Files:**
- `src/backend/sidecar/__tests__/enrichmentFlows.test.ts:88-99, 392-393, 720-725, 702-707`
- `src/backend/sidecar/__tests__/gameDetailsFlows.test.ts` (ids `all15-${index}`)
- `meta/__tests__/itadKeyDefine.test.ts` (file name)

**Issue:**
- `mockAxiosGet` and `mockAxiosPost` are still defined, reset and armed to reject. The file's own comment says nothing calls them any more. The arrangement implies a no-network guarantee that is no longer exercised.
- `ALL_7_CHANNELS` now holds 2 entries, and its test ids are still `all7-`.
- gameDetailsFlows renamed the table to `ALL_13_CHANNELS` but kept the `all15-` request ids.
- `itadKeyDefine.test.ts` now asserts the define's absence, so its name no longer matches what it does.

**Fix:** Delete the dead axios plumbing (keep `axios.create` for `fetchLastestReleases`). Rename the constants and ids. Optionally rename the file to `sidecarNoItadDefine.test.ts`.

### IN-64: gamelib-info fixtures claim byte-exactness but have no `-text` rule

**File:** `.gitattributes` (compare the store and log rules at lines 22-33) and `.prettierignore:49-50`

**Issue:**
- The new `.prettierignore` entry says the fixtures are "byte-exact". The sibling store corpus and log golden each have a `-text` line in `.gitattributes` for that reason. The info fixtures do not.
- The repo-wide `* text=auto eol=lf` therefore applies. No CR bytes exist in the tree today (I checked), so nothing is wrong yet. A recorded HTTP body that carries CRLF would be silently normalised the moment it is committed, and a Rust replay that compares bytes or hashes would then differ from what was recorded.

**Fix:** Add `src-tauri/crates/gamelib-info/tests/fixtures/** -text` after the `* text=auto` line, as the other fixture trees do.

### IN-65: port-gate floors are loose, and two scans only see single-quoted forms

**Files:**
- `src/backend/__tests__/infoPortComplete.test.ts:40-45` (SCANNED_FILES_FLOOR 800, RUST_FILES_FLOOR 40, BACKEND_FILES_FLOOR 400) and `:331-338`
- `src/backend/testUtils/infoPortGate.ts:116-146`

**Issue:**
- The floors sit at about 60 to 65% of the measured trees (1329, 66 and 612). That is intentional headroom, but a walk that drops a third of the tree still passes.
- `STEAMGRID_CHANNELS.map((c) => \`'${c}'\`)` feeds `findIdentifiers`, which only matches the single-quote spelling.
- `findTsRegistrations` only matches `ipc.on|handle('literal'`. It misses `ipc.handle<T>('x'`, a channel held in a `const`, and a template literal.
- Today's code uses the matched forms, so no hole exists now. It is a false-green risk for the later phases that reuse these gates.

**Fix:** Tighten the floors to about 90% of the measured counts when re-measured. Match `['"]` in the channel-name scan, and allow an optional generic argument in the registration regex.

### IN-66: tauriIpcRoute leaks global state across tests in a file

**File:** `src/frontend/testUtils/tauriIpcRoute.ts:19-58`

**Issue:**
- The module overwrites `globalThis.window` at import and never restores it.
- `callbacks` and `listeners` are module-level maps. Nothing clears them between tests, so listeners from an earlier test keep receiving `emitTauriEvent` payloads unless that test's `unlisten` ran.
- `libraryStoreFollowers.test.ts` disposes its own followers, so it is fine today. The next consumer is exposed.

**Fix:** Export a `resetTauriRoute()` that clears both maps and restores `tauriRoute.handler`, and call it from consumers' `afterEach`.

### IN-67: the "Require the ITAD_API_KEY secret" step lets a whitespace-only secret through

**File:** `.github/workflows/release-tauri.yml:337-342`

**Issue:**
- `test -n "$IN_ITAD_API_KEY"` accepts `"  "`.
- The Rust side trims and treats it as absent (`baked_itad_key` filters blank, `effective` trims), so the release would ship "not set up in this build" while the gate said it was set.
- The TS build had the same gap (its define was `.trim()`ed), so this is parity, not a regression.

**Fix:** Test the trimmed value, for example `test -n "$(printf '%s' "$IN_ITAD_API_KEY" | tr -d '[:space:]')"`. Do not print the value.

### IN-68: gameDetails round-trip cases now test a double that re-implements the Rust rule

**File:** `src/backend/sidecar/__tests__/gameDetailsFlows.test.ts:325-345, 1055-1100`

**Issue:**
- The "round-trip", "push" and "delete" cases read back from `storedOverrides`, an in-memory double whose `info_overrides_set` re-codes the crate's delete-when-empty rule. They prove only that the shim forwards `{appName, overrideData}` and that the push uses the answer of `info_overrides_get_all`.
- The file's header says the real semantics are covered by the Rust goldens, which is accurate.
- The titles still read as store behaviour ("deletes the entry").

**Fix:** Reword the titles to say what they pin (the forwarded frame and the pushed value), or drop the delete-rule branch from the double so the double cannot be mistaken for the oracle.

## Known / owed (not re-reported)

- The inert `?: undefined` / `?: unknown` members and the `STEAMGRID_SECRETS_EXEMPT`, `ITAD_SECRETS_EXEMPT` and `INERT_DEPS_EXEMPT` lists pending a clean `handlers.ts`.
- `MiscRuntime.requestRustInvoke` is wired in the test utility with an "unwired" rejecting default. This is consistent with the owed item.
- `clearCache` skipping the wiki clear on paths with no Rust transport. `clearCacheWiki.test.ts` pins this as "OWED".

---

_Reviewed: 2026-11-23_
_Reviewer: gsd-code-reviewer (4 lanes, merged by the code-review orchestrator)_
_Depth: standard_
