---
phase: 86-pure-leaf-services
plan: 17
subsystem: info-itad
tags: [itad, store-search, delete-ts-slice, shared-coverage, store-table-extra-rows, sidecar-key-bake, drift, d-12, d-13, d-18, d-19, d-25, d-26, d-29, sc4]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-16 native ITAD channels and the Rust itad crate module, 86-14 Rust ITAD key owner, 86-11 store-deletion pattern (EXTRA_ROWS, DELETED_IN_PHASE_86), 86-15 steamgrid exemption pattern and the drift table"
provides:
  - "src/common/itadCoverage.json (priced countries, fallback, Steam/GOG/Epic shop ids) read by the renderer through src/common/itadCoverage.ts and by Rust's itad/coverage.rs through include_str!"
  - "describe('storeSearchPortComplete') in infoPortComplete.test.ts"
  - "genStoreTable EXTRA_ROWS entries for store_cache/itad_prices and store_cache/itad_steam_gids (storeTable.json byte-identical)"
  - "gamelib-info-cli drift cases itad-search, itad-deals, itad-gids"
affects: [86-18]

actuals:
  tokens: 6500
  tasks: 3
  commits: 3

plan_head_before: fd544242a358006bc6569632392bf5191915ad73
plan_head_after: c73a9ef6e0447e5f0e6bb845881ca803a230006e
commits: 3

key-files:
  created:
    - src/common/itadCoverage.json
    - src/common/itadCoverage.ts
  modified:
    - src-tauri/crates/gamelib-info/src/itad/coverage.rs
    - src-tauri/crates/gamelib-info/src/itad/mod.rs
    - src-tauri/crates/gamelib-info-cli/src/drift.rs
    - src-tauri/crates/gamelib-info-cli/src/main.rs
    - meta/genStoreTable.ts
    - meta/buildSidecar.ts
    - meta/buildSidecarSea.ts
    - meta/esbuildWorkerBundleShared.ts
    - meta/measureItadCoverage.ts
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/infoPortComplete.test.ts
  deleted:
    - src/backend/storeSearch (all 12 files)
    - src/backend/sidecar/itadSecretStore.ts
    - src/backend/info/__tests__/oracle/storeSearch.oracle.test.ts
    - meta/backendDiCeilings/storeSearch.json

key-decisions:
  - "The shared coverage file is JSON read through resolveJsonModule on the TS side and include_str! on the Rust side (as gamelib-store reads storeTable.json). Rust now exposes priced_countries(), fallback_country() and shop_id_steam() behind a OnceLock; runner_for compares against the parsed ids, so the shop ids cannot drift either."
  - "ITAD_FALLBACK_COUNTRY has no TS consumer, so knip flagged it; storeMapping.test.ts now cross-checks it (priced, no duplicates, 32 entries) rather than tagging the export @public."
  - "The itadKeyDefine.test.ts file is KEPT as a guard (the shared module exports no define builder, and neither sidecar bundle carries any --define), not deleted: it is the only test of buildSidecarArgv's base flags. The source-level ban on the __ITAD_API_KEY__ identifier is infoPortComplete's storeSearchPortComplete, across src and meta, so the two cover different things."
  - "The inert `itadSecrets?: undefined` (BootServices, EnrichmentFlowDeps) and an inert `miscRuntime?: unknown` (EnrichmentFlowDeps) stay because the foreign-dirty sidecar/handlers.ts still passes them; the port-complete gate names exactly those three files in ITAD_SECRETS_EXEMPT."
  - "The two moved sample files live under state/storeSearch/itad-samples; the Rust golden harness reads state/storeSearch/<case> per case id and ignores that folder."

patterns-established:
  - "A deleted cache store that Rust still owns: the cache-family and user-state-family mirror probes carry a NO_TS_STORE list for rows that stay in the table with no TS store built over them."

requirements-completed: []
status: complete
completed: 2026-11-23
---

# Phase 86 Plan 17: Delete the TS store-search slice Summary

**The renderer's price-region list and Rust's ITAD coverage now read one `src/common/itadCoverage.json`; the whole TS store-search slice (code, secret store, `itadGate`, `storeSearch` store family, 'itad-secrets' boot step, vault slot, oracle) is gone with both cache rows kept in `EXTRA_ROWS` (storeTable.json byte-identical); the sidecar no longer bakes `__ITAD_API_KEY__`, the release workflow keeps the key on the Tauri step only, and `describe('storeSearchPortComplete')` plus three ITAD drift cases guard it.**

## Performance

- **Tasks:** 3 (tracer + two auto)
- **Commits:** 3 (`ecedc3ea5`, `43a95d91d`, `c73a9ef6e`)
- **Diff:** 62 files, 576 insertions, 3095 deletions

## Accomplishments

- **Tracer (Task 1):** `itadCoverage.json` is the one source. `storeRegion.ts` and `storeMapping.test.ts` import it through `common/itadCoverage`, `coverage.rs` parses it with `include_str!`, and a Rust test asserts the parsed country count equals the JSON array length. The eight measured response samples moved (git mv) to `gamelib-info/tests/fixtures/state/storeSearch/itad-samples`, and `meta/measureItadCoverage.ts` writes there. The tracer verified end to end (jest, `cargo test -p gamelib-info`, the 37-case golden, codecheck) before any deletion, so it expanded; no `blocking-human` gate on it.
- **Deletion (Task 2):** `src/backend/storeSearch/`, `sidecar/itadSecretStore.ts`, the ITAD oracle, `meta/backendDiCeilings/storeSearch.json`, `itadGate` in `miscRuntime`, the `storeSearch` family in `createStores`/`testServices`/`Stores`, `registeredStores.json` entries, the `itad-secrets` boot step (`BOOT_STEP_NAMES` lost one name), and the dev vault's `itadApiKey` slot (the TS vault now holds only Steam and Humble). `itad_prices` and `itad_steam_gids` moved into `genStoreTable` EXTRA_ROWS; regeneration is a no-op and `git diff --quiet src/common/types/ipc/storeTable.json` holds.
- **Sidecar key bake (Task 3):** `itadKeyDefineFlag` and both `--define:__ITAD_API_KEY__` plumbings (dev `build:sidecar` and the SEA argv) are removed. `release-tauri.yml` no longer gives the SEA step `ITAD_API_KEY`; the require step and the Tauri step env stay. `build/main/sidecar.js` contains no `__ITAD_API_KEY__`; `pnpm smoke:sidecar` passes.
- **Gate and drift:** `describe('storeSearchPortComplete')` (deleted paths, kept golden/recorded/itad-samples/shared JSON, forbidden identifiers `ItadSecrets`, `createItadGate`, `handleSearchStores`, `searchGames`, `createStoreSearchStores`, `__ITAD_API_KEY__`, the five channels native with no TS registration, the two cache rows' kind and `tsNames`, the vault slot, no `GAMELIB_STORE_SEARCH`). `gamelib-info-cli drift --list` shows three ITAD cases; each is replayed against its 86-07 recording in a cargo test (clean `Replay.finish`) and SKIPs with `GAMELIB_INFO_ITAD_KEY is not set` otherwise.

## Task Commits

1. **Task 1 (tracer): one ITAD coverage file** - `ecedc3ea5`
2. **Task 2: delete the TS slice, keep the two cache rows** - `43a95d91d`
3. **Task 3: drop the sidecar key bake, pin the workflow, gate and drift cases** - `c73a9ef6e`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Files outside the plan's list had to change**
- `src/common/discounts/storeMapping.ts` (comment naming the deleted file), `src/backend/stores/__tests__/cacheFamily.test.ts` (its mirror probe threw for the two rows that no longer have a TS store: a `NO_TS_STORE` list, as `userStateFamily.test.ts` already does), `src/backend/stores/__tests__/createStores.test.ts` and `src/backend/__tests__/storeMirrorSchedule.test.ts` (DELETED_IN_PHASE_86 gained the two caches), `src/backend/__tests__/releaseWorkflow.test.ts` (it pinned the SEA step's `ITAD_API_KEY`; flipped to "carries none"), `src/backend/sidecar/__tests__/{devSecretVault,bootSourceShape}.test.ts`, `src/backend/testUtils/__tests__/testServices.test.ts`, and `meta/buildSidecarSea.ts` (its `buildEsbuildArgv` also applied the define; both argv builders lost their unused `env` parameter).
- **Commits:** `43a95d91d`, `c73a9ef6e`

**2. [Rule 3 - Blocking] The ITAD oracle and TS itad test read the moved samples in Task 1**
- Between Task 1 and Task 2 the two tests that read the samples would have gone red, so Task 1 repointed their path; both were deleted in Task 2.

**3. [Rule 1 - Bug] ITAD_FALLBACK_COUNTRY flagged by find-deadcode**
- Cross-checked in `storeMapping.test.ts` instead of tagging `@public`; the knip baseline stays at 312.

**4. Floors that track lists this plan shrank (dated comments in each file, none lowered to turn a run green)**
- diPhaseGates: stores modules 14 -> 13 and 15 -> 14, owned list 72 -> 71 (`storeSearch/itad.ts` left `OWNED_66_4`); storeKinds `MIN_CONSTRUCTIONS` 51 -> 50 (the walk counted 52 at the start; deleting `storeSearch/stores.ts` removes exactly the two `itad_*` constructions); testServices family count 16 -> 15; electronReachLedger's required-absent list lost `storeSearch/itad.ts`. No jestMock ceiling moved: `enrichmentFlows.test.ts` still mocks axios for GOG discounts.

**5. [Plan option] itadKeyDefine.test.ts kept, not deleted** (see key-decisions).

### Auth gates

None. The live ITAD drift cases were NOT run (the operator's real key is off limits); they SKIP, and the recorded replay proves the requests and shapes.

## Owed Cleanup

`src/backend/sidecar/handlers.ts` is foreign-dirty, so these stay until it is clean: `itadSecrets: deps.services.itadSecrets` (line ~274) and `steamGridSecrets` (line ~273) in the `registerEnrichmentFlows` call; the inert `itadSecrets?: undefined` and `steamGridSecrets?: undefined` on `BootServices` (`services/types.ts`); the inert `itadSecrets?: undefined`, `steamGridSecrets?: undefined` and `miscRuntime?: unknown` on `EnrichmentFlowDeps`. Empty `ITAD_SECRETS_EXEMPT` and `STEAMGRID_SECRETS_EXEMPT` in `infoPortComplete.test.ts` in the same change. `src/backend/sidecar/keyringTokenStore.ts` still exports `KEYRING_SLOT_ITAD_API_KEY` (unused by TS now; knip does not flag it, the keyring slot name is shared with the Rust side's naming) and can go with the 86-24 sweep if nothing reads it.

## Verification

- `cargo test -p gamelib-info` (incl. `golden_storeSearch`, 37 cases), `cargo test -p gamelib-info-cli` (12 + 11), `cargo clippy -p gamelib-info-cli --all-targets -D warnings`, `cargo fmt -p gamelib-info -p gamelib-info-cli -- --check`: green.
- `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreTable.ts --check`: up to date; storeTable.json byte-identical.
- `pnpm codecheck`, `pnpm find-deadcode` (312 baselined, unchanged), `pnpm build:sidecar`, `pnpm smoke:sidecar`, prettier on every touched TS/JSON/YAML path: green.
- `pnpm exec jest --selectProjects Backend Meta`: 711 suites passed (16779 tests, 5 suites skipped). `pnpm backend-di-ceilings` fails only on the two known foreign files (`steam/__tests__/optInDlc.test.ts`, `frontend/state/__tests__/libraryStoreFollowers.test.ts`).

## Known Stubs

None.

## Threat Flags

None. T-86-39 (key only in the shell build), T-86-40 (store rows byte-identical) and T-86-41 (require step kept, Tauri step pinned, mutation test for the sidecar step) are mitigated as planned.

## Self-Check: PASSED

- FOUND: src/common/itadCoverage.json, src/common/itadCoverage.ts, 86-17-SUMMARY.md
- GONE: src/backend/storeSearch, src/backend/sidecar/itadSecretStore.ts
- FOUND commits: ecedc3ea5, 43a95d91d, c73a9ef6e
