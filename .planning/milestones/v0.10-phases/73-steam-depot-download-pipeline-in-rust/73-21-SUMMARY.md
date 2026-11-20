---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 21
subsystem: steam-depot
tags: [steam-depot, rust, deletion, d-15, sea, lzma-native, deletion-gate]
requires: [73-20]
provides:
  - "No lzma-native: no dependency, no lockfile package, no typedef, no generated resolved-paths file or .gitignore lines, no SEA lzma_native.node / liblzma.dll assets, no prebuild resolvers, no NATIVE_LZMA_REQUIRED_TRIPLES"
  - "buildSeaConfig() takes no arguments and the sea-config.json carries no assets key"
  - "esbuildWorkerBundleShared.ts keeps only resolveEsbuildCli, seaEsbuildFlags and spawnArgv (its lzma-native and node-gyp-build helpers and their test are gone)"
  - "patches/steam-user.patch regenerated through pnpm patch / patch-commit: the comment now says lzma-native was removed in Phase 73 and steam-user's lzma/zstddec requires stay"
  - "src/backend/__tests__/depotPortComplete.test.ts: the D-15 deletion gate"
  - "src-tauri/crates/README.md section 10: the depot port as the second worked example"
affects: [74, 75]
tech-stack:
  added: []
  removed: [lzma-native 8.0.6 (and its node-gyp-build / node-addon-api@3 lockfile entries)]
  patterns:
    - "A deletion gate asserts what must stay (packages a third-party dependency loads, its patches, the golden file) as well as what must stay gone"
key-files:
  created:
    - src/backend/__tests__/depotPortComplete.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - patches/steam-user.patch
    - .gitignore
    - meta/buildSidecarSea.ts
    - meta/esbuildWorkerBundleShared.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - meta/__tests__/runTs.test.ts
    - src/backend/__tests__/releaseWorkflow.test.ts
    - src-tauri/crates/README.md
  deleted:
    - src/common/typedefs/lzma-native.d.ts
    - meta/__tests__/esbuildWorkerBundleShared.test.ts
key-decisions:
  - "esbuildWorkerBundleShared.ts was stripped, not deleted: buildSidecarSea.ts still imports it, and folding its helpers back in would make them importable only through a module whose import runs the whole SEA build"
  - "The lockfile keeps two lines naming lzma-native: steam-user's own optional peerDependencies declaration, which is steam-user's manifest, not a GameLib dependency. An override to strip it would itself put 'lzma-native' into package.json"
  - "The stale lzma-native lockfile snapshot (kept by pnpm because the optional peer was already resolved) was dropped and the lockfile re-canonicalised by pnpm, not by dedupe, which would have churned unrelated packages"
  - "The patchedDependencies block pnpm patch-commit wrote into package.json was removed: pnpm-workspace.yaml already declares all three patches"
requirements-completed: [P73-F, D-15]
duration: 25min
completed: 2026-11-10
---

# Phase 73 Plan 21: lzma-native retirement, deletion gate and pattern README Summary

**lzma-native and its SEA packaging are removed. A deletion gate now keeps the TS depot pipeline, the decompress worker and lzma-native deleted, and keeps `lzma`, `zstddec` and both patches, which steam-user still needs. The migration-pattern README now records the depot port as its second worked example.**

## Performance

- Duration: about 25 min
- Tasks: 2
- Files: 13 (1 created, 10 modified, 2 deleted)

## Accomplishments

- `lzma-native` removed from package.json. pnpm-lock.yaml lost the importer entry, the `lzma-native@8.0.6` package and snapshot, the orphaned `node-gyp-build@4.8.4` and `node-addon-api@3.2.1`, and steam-user's `(lzma-native@8.0.6)` peer suffix. `node_modules/lzma-native` is gone after `pnpm install --frozen-lockfile`.
- `buildSidecarSea.ts` lost `LZMA_NATIVE_ASSET_KEY`, `LZMA_NATIVE_DLL_ASSET_KEY`, the prebuild constants, `NATIVE_LZMA_REQUIRED_TRIPLES`, `lzmaNativePrebuildDir/Path`, `lzmaNativeDllPath`, `resolveNativeLzmaAssets` and the asset logging in `main()`. `buildSeaConfig()` and `writeSeaConfig()` take no arguments. Header fix note 4 now gives the real history.
- `esbuildWorkerBundleShared.ts` lost `LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH`, `resolveLzmaNativePkgRoot`, `writeLzmaNativeResolvedPaths`, `findOtherNodeGypBuildConsumers` and `assertNodeGypBuildSingleConsumer`, and its test was deleted. It has a new header.
- `buildSidecarSea.test.ts` now asserts that the config has no `assets` key, in place of about 200 lines of lzma-native asset, prebuild and drift tests. `runTs.test.ts` dropped its generated-`.cjs` allowlist, whose only source is gone. `releaseWorkflow.test.ts` no longer seeds `build/main/decompressWorker.js`.
- The steam-user patch was regenerated through `pnpm patch` and `pnpm patch-commit`, not hand-edited.
- `depotPortComplete.test.ts` has these parts:
  - 43 DELETED paths: plan 20's modules and tests, the `finalize.ts`/`manifest.ts` rename sources, 73-19's flag and oracle, and 73-21's typedef, helper test and generated file.
  - Seven FORBIDDEN symbols, scanned over `src/` and `meta/` with `.ts/.tsx/.cjs/.js` and comments stripped, skipping `__tests__` and this file.
  - A matcher self-test.
  - Seven KEPT paths.
  - A check that package.json still has `lzma` and `zstddec` and no `lzma-native`.
  - A check that pnpm-workspace.yaml still patches `lzma` and `steam-user`.
  - A walk of at least 500 files.
- README section 10 covers the JobHost seam, the unbounded run channel with EOF cancel, the oracle captured before deletion, the codec-coverage corpus, the aes 0.9 correction, the MSRV decision, the flag's life and the packaging retirement.

## Task Commits

1. **Task 1: Remove lzma-native and its SEA packaging**: `15c19d5fa` (chore)
2. **Task 2: Deletion gate and migration-pattern write-up**: `68d961ce2` (feat)

## Verification

- Full SEA build, run with the real `meta/buildSidecarSea.ts` from a scratch mirror directory. That directory symlinks src, meta, node_modules and patches and has its own `build/` and `src-tauri/binaries/`, so the shared `src-tauri/binaries` sidecar was not touched. Exit 0, arm64 arch verified. `sea-config.json` has no `assets`. The binary was booted with a scratch HOME and stdin at EOF: it printed `__GAMELIB_SIDECAR_READY__`, logged no uncaught exception, exited 0, and has `lzma` and `zstddec` bundled. The only `lzma-native` strings in the bundle are steam-user's inlined package.json peer metadata.
- `pnpm build:sidecar` and `pnpm smoke:sidecar` PASS.
- `GAMELIB_DEV_SECRET_VAULT=1 node meta/tauriDevPreflight.cjs && pnpm build:sidecar` exits 0.
- `pnpm install --frozen-lockfile` exits 0, and both patches apply.
- Gates, each run on its own and each exit 0: codecheck, lint, prettier, `i18n --fail-on-update`, find-deadcode (354 baselined), boundaries, steam-line-ceiling.
- Jest: buildSidecarSea, runTs, releaseWorkflow and rustTestWorkflow 190/190; depotPortComplete and scannerPortComplete 55 + 12 pass.
- Mutant: a new `meta/` file containing `'GAMELIB_DEPOT_PIPELINE'` made the gate fail and name the file. The file was then removed.
- `pnpm test:ci`: 884 suites passed and 7 failed (19718 tests passed, 9 failed). All 7 failing suites are on the known pre-existing list: tauriShellSource WR-07, macArchKnownFixRouting "Intel: never seeds...", logSecretGate, lintTranslations R13, gamelibCatalogParity `sl`, genI18nGateScope A-17 and x86CallbackWineHarness. This plan added none.
- `cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli`: 361 passed, 0 failed. `cargo test --bin gamelib-shell`: 453 passed, 0 failed.
- `pnpm planning-gates`: 12/12.

## Deviations from Plan

### Adjusted acceptance criterion

**1. `grep -c 'lzma-native' pnpm-lock.yaml` is 2, not 0**
- **Why:** steam-user 5.3.0 declares `lzma-native` as an optional `peerDependencies` entry, and pnpm copies the declaring package's manifest metadata into its `packages:` entry. Getting to 0 would need a `steam-user>lzma-native: '-'` override, which puts `lzma-native` back into package.json and breaks the first criterion.
- **What is gone:** the importer entry, the package and snapshot, the optional-dependency edge, the peer suffix and node_modules/lzma-native. The gate's package.json check is the binding assertion.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The stale optional-peer resolution kept lzma-native installed**
- **Found during:** Task 1, when `pnpm install` ran after the package.json removal
- **Issue:** pnpm kept `lzma-native@8.0.6` as steam-user's already-resolved optional peer, so the package stayed in node_modules.
- **Fix:** the stale package, snapshot, optional-dependency edge and peer suffix were dropped, and pnpm re-canonicalised the lockfile. It changed only blank lines and pruned the orphans. `pnpm install --frozen-lockfile` then passed. `pnpm dedupe` was tried in scratch and rejected because it churned unrelated packages.
- **Commit:** `15c19d5fa`

**2. [Rule 1 - Bug] `pnpm patch-commit` duplicated patchedDependencies into package.json**
- **Fix:** the block was removed. pnpm-workspace.yaml is the declaration that already existed.
- **Commit:** `15c19d5fa`

**3. [Scope] DELETED list widened beyond plans 20 and 21**
- The list adds the rename sources `depot/finalize.ts`, `depot/manifest.ts` and `__tests__/manifest.test.ts`, and 73-19's `depotGoldenOracle.ts`, `depotGolden.test.ts` and `depotPipelineFlag.test.ts`. This stops the oracle or a pre-rename module from coming back.

### Not needed

- `src/sidecar/installRejectionGuard.ts` had no lzma reference left, because 73-20 removed the SELFTEST branch. Nothing was changed there.
- `.planning/todos/pending/` has no todo about win32 native LZMA, so none was moved.

## Known Stubs

None.

## Next Phase Readiness

Phase 73 is ready for verification. All 21 plans are complete, and the D-15 deletion list is done and gated.

## Self-Check: PASSED

- FOUND commits: 15c19d5fa, 68d961ce2
- FOUND: src/backend/__tests__/depotPortComplete.test.ts, src-tauri/crates/README.md (section 10)
- ABSENT: src/common/typedefs/lzma-native.d.ts, meta/__tests__/esbuildWorkerBundleShared.test.ts, node_modules/lzma-native
