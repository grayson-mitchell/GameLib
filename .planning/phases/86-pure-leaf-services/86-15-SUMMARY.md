---
phase: 86-pure-leaf-services
plan: 15
subsystem: info-steamgriddb
tags: [steamgriddb, native-channels, secrets, migration, golden-replay, drift, d-10, d-13, d-17, d-19, d-26, sc1, sc4]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-07 SteamGridDB goldens and recorded exchanges, 86-14 SgdbKey owner and migrate_sgdb_plaintext, 86-08 info_dispatch and the info native slice, 86-03 Replay"
provides:
  - "gamelib-info::steamgrid: search_game, get_grids, get_heroes, has_api_key, set_api_key, GridArgs; OPS info_steamgrid_grids, _has_key, _heroes, _search, _set_key"
  - "native invoke channels steamgriddb.searchGame, getGrids, getHeroes, hasApiKey, setApiKey in slice info (zod bounds carried into the native parser and the crate decode)"
  - "gamelib-info::spawn_sgdb_migration + SGDB_MIGRATION_BOUND: the bounded boot migration (registrant info-sgdb-migrate), started by info_dispatch::install"
  - "drift cases steamgrid-search, steamgrid-grids, steamgrid-heroes (skipped without GAMELIB_INFO_SGDB_KEY)"
  - "describe('steamgridPortComplete') in infoPortComplete.test.ts"
affects: [86-16, 86-17]

actuals:
  tokens: 24400
  tasks: 3
  commits: 3

plan_head_before: af5fc7e6a1426a42adc0c67a7c5a2155daf1b16c
plan_head_after: c3001289a217ebfe3947950e506e1b613ad1850b
commits: 3

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/steamgrid.rs
    - src-tauri/crates/gamelib-info/tests/golden_steamgrid.rs
  modified:
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info/src/secrets.rs
    - src-tauri/crates/gamelib-info/src/http.rs
    - src-tauri/crates/gamelib-info/tests/secrets.rs
    - src-tauri/crates/gamelib-info/tests/http_replay.rs
    - src-tauri/crates/gamelib-info-cli/src/drift.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/native_router.rs
    - src/common/types/ipc/nativeChannels.json
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/devSecretVault.ts
    - src/backend/__tests__/infoPortComplete.test.ts
  deleted:
    - src/backend/steamgrid/ (utils.ts, secretStore.ts, secureKey.ts and their tests)
    - src/backend/sidecar/steamgridSecretStore.ts (and its test)
    - src/backend/info/__tests__/oracle/steamgrid.oracle.test.ts
    - meta/backendDiCeilings/steamgrid.json

key-decisions:
  - "A secret header the oracle recorder wrote as the bare word REDACTED matches any non-empty value in Replay (and a missing or empty one is still drift). The recordings never held `Bearer REDACTED`, so the plan's wording could not be met by sending a literal."
  - "Rust sends the request the recording shows: Mozilla/5.0 ... HeroicGamesLauncher/<version> User-Agent, Accept application/json, text/plain, */*, Bearer key, path encoded with a port of encodeURIComponent, query dimensions-then-styles through axios_query."
  - "set_api_key surfaces a failed keyring write as `<op>:secret-<category>`; TS swallowed it and told the renderer it had worked."
  - "Each request has a 30 s bound; TS had none."
  - "The migration runs in a crate-owned task: the blocking work holds the info-sgdb-migrate registrant for as long as it really runs, the async side races the shutdown token and a 10 s bound and reports one word."

patterns-established:
  - "A native channel whose name carries a dot is allowed: genIpcContract NATIVE_NAME admits `.` (ASCII, so the byte-order sort Rust's binary_search needs is unchanged)."
  - "Boot work started from a shell install hook goes through a crate fn that takes a report callback, so the shell logs one category word and the crate stays logger-free."

requirements-completed: []
status: complete
completed: 2026-11-23
---

# Phase 86 Plan 15: SteamGridDB port Summary

**Search, grids and heroes run in Rust against the 86-07 goldens (all 12 cases, 5 live, clean Replay finish), the Keychain-backed key owner and the one-time plaintext migration are Rust-owned and bounded at boot, and the TS steamgrid slice, its sidecar secret store and the oracle are deleted.**

## Accomplishments

- **Task 1 (tracer, `b0decda93`).** `steamgrid.rs` with `search_game`, golden replay of the five search cases, `steamgriddb.searchGame` native end to end (manifest vectors, `native.ts` typing, handler on the blocking pool), and the sidecar handle, zod key and the TS oracle test deleted in the same commit. Replay learned that a recorded secret header equal to `REDACTED` is matched by any non-empty request value. The tracer gate (the full Task 1 verify chain) passed before expanding.
- **Task 2 (`b425fa3d2`).** `get_grids`, `get_heroes`, `has_api_key`, `set_api_key` and their four native channels; every zod bound lives in the native parser and again in the crate's `deny_unknown_fields` decode (gameId a positive integer, `styles`/`dimensions` at most 64 strings of at most 64 UTF-16 units and never `null`, key and query at most 256). `golden_steamgrid` replays all 12 cases and adds bound, key, header, URL-encoding and error-text cases. Four TS handles, their zod keys, the `steamgrid/utils` mock and the census pins went in the same commit.
- **Task 3 (`c3001289a`).** `spawn_sgdb_migration` (crate) started by `info_dispatch::install` after the context is set; the TS slice, `steamgridSecretStore.ts`, the `steamgrid-secrets` boot step, the `steamGridSecrets` service and the dev vault's `steamGridDbApiKey` slot deleted in the same commit, so the two migrations never run in one build. `describe('steamgridPortComplete')` plus drift cases.

| Check | Result |
| ----- | ------ |
| `golden_steamgrid` | 13 tests, all 12 recorded cases replayed with a clean finish |
| `cargo test -p gamelib-info --features testing` | all targets pass (secrets target: 36) |
| `cargo test -p gamelib-info-cli` | 10 unit + 11 integration pass |
| `cargo test --bin gamelib-shell` | 744 passed, 2 ignored (the two live-Keychain probes) |
| clippy `-D warnings` (info, info-cli, all targets) | clean; no finding in `info_dispatch.rs` / `info_secrets.rs` |
| `pnpm codecheck`, `pnpm check:ipc-contract`, `pnpm find-deadcode` | pass (312 baselined) |
| `pnpm exec jest --selectProjects Meta` | 88 suites pass |
| Backend jest (whole) | 627 suites pass; 2 failing tests at the time of the run, one mine (fixed) and one from 86-14 (see Deferred) |

## Task Commits

1. Task 1 (tracer): `b0decda93` feat(86-15): steamgriddb.searchGame native end to end with the Rust key owner and the pinned request
2. Task 2: `b425fa3d2` feat(86-15): grids, heroes and the two key channels native with the zod bounds in the Rust decode
3. Task 3: `c3001289a` feat(86-15): move the SteamGridDB plaintext migration to Rust boot and delete the TS slice and secret store

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The manifest name pattern did not allow a dot**
- **Found during:** Task 1. `genIpcContract` refused `steamgriddb.searchGame` (`[A-Za-z0-9:_-]`).
- **Fix:** `NATIVE_NAME` is now `[A-Za-z0-9:_.-]`. `.` is ASCII, so the sorted order stays the byte order `binary_search` needs.
- **Files:** meta/genIpcContract.ts. **Commit:** b0decda93

**2. [Rule 3 - Blocking] The TS oracle test was deleted in Task 1, not Task 3**
- **Issue:** it drives the `steamgriddb.*` sidecar handlers; once Task 1 removed `searchGame` its search cases could not run. The goldens and recorded exchanges (the actual oracle output) are kept.
- **Commit:** b0decda93

**3. [Plan wording] Replay and `Bearer REDACTED`**
- The recordings store `authorization: "REDACTED"`, not `Bearer REDACTED`. Replay now accepts any non-empty value for a pinned secret header recorded as exactly `REDACTED`; a missing or empty header, or a non-secret header recorded as `REDACTED`, still fails (test `replay_takes_any_value_for_a_secret_header_the_recorder_redacted`).

**4. [Plan wording] Two more ops**
- The plan listed three OPS. `info_steamgrid_has_key` and `info_steamgrid_set_key` exist too, so the two key channels run inside the crate's `guarded` wrapper like every other op.

**5. [Rule 2 - Missing critical functionality] A failed key write is reported**
- TS `setApiKey` was total: a keyring failure was logged and the renderer was told nothing. A user believed a key was saved. Rust returns `info_steamgrid_set_key:secret-timeout|unavailable|no-secret-source` (category only, never the key).

**6. [Rule 2] A 30 s bound on every request**
- TS used the global axios with no timeout. A transport timeout answers axios's own text (`timeout of 30000ms exceeded`).

**7. [Seam] `sidecar/handlers.ts` was foreign-dirty**
- Another session had an uncommitted `onlineMonitor` line in `src/backend/sidecar/handlers.ts`, and line 273 there still passes `steamGridSecrets` to `registerEnrichmentFlows`. The file was not touched. Seam: `BootServices['steamGridSecrets']` and `EnrichmentFlowDeps['steamGridSecrets']` remain as an inert `steamGridSecrets?: undefined`, so that line compiles and passes `undefined`. `steamgridPortComplete` allows `steamGridSecrets` in exactly those three files (services/types.ts, enrichmentFlowRegistration.ts, handlers.ts) and nowhere else; the list can only shrink. **Owed:** delete the handlers.ts line, the two optional members, and empty `STEAMGRID_SECRETS_EXEMPT` once handlers.ts is clean.

**8. [Floors, called out] counts that track what this plan deleted**
- `OWNED_66_3` length 28 -> 26 (the two deleted secret-store files; dated comment in diPhaseGates.test.ts). jestMock ceilings: `enrichmentFlows.test.ts` 11 -> 9 (two `jest.mock`s removed), `steamgridSecretStore.test.ts` entry and the `steamgrid.json` shard removed with their files. Census pins in runnerSliceRegistration, flowRegistrationCensus and ipcSchemas/enrichment (enrichment registrations 17 -> 12) follow the five channels leaving.

**9. [Not done, by design] Replay `networkError`**
- No SteamGridDB case uses it (the plan said add it only if one does). The ITAD and discounts cases do: 86-16 must add the field to Replay.

## Verification Notes

- Live drift was not run: it needs the operator's key in `GAMELIB_INFO_SGDB_KEY`, and no real key was read or used. `drift --slice steamgrid` without it prints three `SKIP ... GAMELIB_INFO_SGDB_KEY is not set` lines and exits 0; the three recorded replays of the cases pass in `cargo test -p gamelib-info-cli`.
- No test creates a keyring `Entry`; keys in tests are `MemorySecretSource` or a stub `SecretSource`, and the request key in goldens is the word `REDACTED`.
- Shell `rustfmt --check` on `info_dispatch.rs` and `native_router.rs` is clean (the generated `ipc_contract.rs` was regenerated, not formatted).

## Deferred Issues

- `src/backend/__tests__/shellLogCategoryOnly.test.ts` fails on two 86-14 call sites, `info_secrets.rs:81` and `:113` (`shell_log_detail` whose first argument contains `keyring_error_kind(&e)` / the error identifier). Both sites are in 86-14's `info_secrets.rs`, a file this plan did not touch (this plan's own `shell_log` line, which the same test also caught, was changed to a fixed word). The test's sanitiser knows `kind_name(...)` only; the fix is either to route those two lines through a classifier the test knows or to extend the test's allow-list for `keyring_error_class` / `keyring_error_kind`. Left for 86-14's owner because it would widen an allow-list.
- `pnpm backend-di-ceilings` still fails only on the two known foreign files (steam/__tests__/optInDlc.test.ts, frontend/state/__tests__/libraryStoreFollowers.test.ts).

## Known Stubs

None.

## Threat Flags

None new. T-86-31 (the key only in the Authorization header, fixed-category errors, replay prints no secret header value), T-86-32 (bounds in the native parser, the crate decode and the manifest's invalid vectors), T-86-33 (setApiKey writes only the steamgrid slot through `SgdbKey`; non-strings rejected before the context is read) and T-86-34 (registrant, 10 s wait bound, shutdown token, one attempt per boot) are mitigated as planned.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-info/src/steamgrid.rs, src-tauri/crates/gamelib-info/tests/golden_steamgrid.rs
- DELETED as planned: src/backend/steamgrid, src/backend/sidecar/steamgridSecretStore.ts, src/backend/info/__tests__/oracle/steamgrid.oracle.test.ts
- FOUND commits: b0decda93, b425fa3d2, c3001289a (ancestors of HEAD); `git rev-list --count af5fc7e6a..HEAD` = 3
