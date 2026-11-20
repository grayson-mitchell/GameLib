---
phase: 75-steam-local-file-formats-in-rust
plan: 17
subsystem: steam-local-files
tags: [typescript, rustInvoke, valve-manifest, installscript, census, replay-parity]
requires: [75-13]
provides:
  - parseValveClientManifestFile (write-then-path, rust flag) in valveClient.ts
  - readInstallScript(rust, path) in bridge/sharedRedists.ts, used by depot/sharedRedist.ts
  - meta/gamelibSteamfilesCli.ts (fake-HOME CLI spawn helper) and census ACF reads through steamfiles_scan_acfs
  - bridgeReplay.test.ts (14 cases) and overrides/bridge.json
affects: [75-24]
key-files:
  created:
    - meta/gamelibSteamfilesCli.ts
    - meta/__tests__/gamelibSteamfilesCli.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/bridgeReplay.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/drm/valveClient.ts
    - src/backend/storeManagers/steam/bridge/sharedRedists.ts
    - src/backend/storeManagers/steam/depot/sharedRedist.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/steamProcesses.ts
    - src/backend/sidecar/bootstrap.ts
    - meta/bridgeCensus.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/bridge.json
decisions:
  - requestRustInvoke is threaded at instance level (createValveClient/createSteamDrm/createSteamProcesses deps, from bootstrap) rather than through per-call ValveClientDeps, so valveClient keeps no static backend/utils import
  - readManifests is exported with an injectable scan function so the census mapping is unit-tested without spawning
  - the three installscript overrides are recorder artefacts (golden.rs tokenise rewrites every backslash to '/'), not Rust behaviour differences
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 17: Bridge VDF reads and census on Rust Summary

Under the rust flag the downloaded Valve client manifest is written into the run's own `.partial-` dir (mode 0o600) and only its path goes to `steamfiles_parse_valve_manifest`; installscript.vdf entries come from `steamfiles_read_installscript`; the census reads bottle ACFs through `gamelib-steamfiles-cli` under a fresh fake HOME.

## Commits
- f78ab568e feat(75-17): Valve manifest write-then-path and installscript on Rust behind text flag
- ca53d85c2 feat(75-17): census reads bottle ACFs through the steamfiles CLI; bridge replay parity

## Files touched by threading requestRustInvoke
`steamProcesses.ts` (new `requestRustInvoke` dep), `sidecar/bootstrap.ts` (passes it), `bridge/drm/drmLaunchSetup.ts` (createSteamDrm deps), `bridge/sharedRedistInstall.ts` (RedistDeps picks `requestRustInvoke`, passes `rust: deps`), `depot/sharedRedist.ts` (`DownloadSharedRedistOpts.rust`), plus test deps in valveClient, drmLaunchSetup, depot.sharedRedist and depotRust/rustInstall tests (a rejecting stub; they run the ts flag).

## Replay parity
14 cases (9 valve manifests, 5 installscripts) replayed. Overrides (all with divergenceNote): installscript conditionals, dotnet-duplicate and escapes, where the recorded Rust result has `/` for the decoded `\` in Process paths. Cause: `tests/golden.rs` tokenise rewrites every backslash in every string; the parser itself decodes the same string as parseKv1. The synthesised `oversize` and `not-text` manifest cases are not replayed (in-memory inputs; cargo covers the size cap).

## Deviations from Plan
- [Rule 3] `sharedRedists.ts` header said "no fs, no logger"; `readInstallScript` (plan-mandated location) adds a readFile and the logging transport import, so the header was amended.
- Threading was instance-level (see decisions) instead of on per-call ValveClientDeps.
- Plan expected likely-no installscript overrides; three were needed (artefact above).

## Verification
tsc clean (checked with humble/__tests__/adapter.test.ts excluded: it was mid-edit by another worker with syntax errors, not part of this plan); bridge, depot.sharedRedist, depotRust, meta census/CLI, fakeHomeIsolation and localFiles Jest suites pass except the known shimCoverage/shimGenerate failures; `cargo test -p gamelib-steamfiles --test golden` ok; `check:ipc-contract` up to date; codecheck exit 0; prettier clean; `bridge-census` bundle runs and prints its table via the CLI. backend-di-ceilings shows only the known frontend/jestMock baselines (none from touched files).

## Known Stubs
None.

## Self-Check: PASSED
