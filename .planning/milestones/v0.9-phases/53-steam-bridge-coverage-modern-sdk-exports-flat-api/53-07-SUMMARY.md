---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 07
subsystem: steam-bridge
tags: [census, bridgeScan, anycpu, mono, x86-parity]
requires:
  - phase: 53-05
    provides: "bridgeScan.ts shared scan with injected deps"
provides:
  - "census classifies through the shared bridgeScan (UE layout, runtime dll walk, importer PEs, Mono scan, effective arch)"
  - "x86 modern/flat footer count and the D-53-09 deferral todo (count 0)"
affects: [53-08]
tech-stack:
  added: []
  patterns: ["census injects a Promise-wrapped objdump + delay-import reader as BridgeScanDeps"]
key-files:
  created:
    - .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
key-decisions:
  - "Census stand-in exe for an Unreal install is the root-level bootstrap stub (census-only choice; layout probe is the shared findUnrealLayout)"
  - "Rows with no static steam_api import report the exe's effective launch arch instead of none (D-53-10); no-steam-api rows stay none"
  - "D-53-09: x86 parity deferred on a measured count of 0"
metrics:
  tasks: 2
  commits: 2
completed: 2026-10-25
---

# Phase 53 Plan 07: Census on the shared scan Summary

The census now answers every scan question through `bridgeScan.ts` (the module `shimGenerate.ts` uses), carries Mono, importer-PE and AnyCPU evidence into its rows, and measured the D-53-09 x86 count at 0.

## What was built

- `CensusTitleInput` gained `managed`, `importerEvidence` and `launchArch`. The classifier merges `partitionManagedImports(...).required` into the judged symbols, uses `selectInterfaceVersionPool` for the pool, appends `+N unserved-family imports (lazy)` on Mono rows and `il2cpp: not scanned` on IL2CPP rows. A runtime-loaded row with importer or managed-required evidence is now evaluated; with neither it keeps the `<dll>@runtime-loaded` marker (same rule as shimGenerate).
- Driver: `findRuntimeSteamApiDll` deleted. `scanDeps` (`scanImports` = Promise-wrapped objdump + `readPeSteamApiDelayImports`, `warn` = counter, `isShimBytes`) feeds `findUnrealLayout`, `findRuntimeLoadedSteamApiDlls`, `findSteamApiImporterPes`, `scanManagedSteamApi`, `readFileEffectiveArch`. No new spawn; the declared real-profile objdump arm docblock names the wrapper. `pickRuntimeSteamApiDll` kept (provenance mapping).
- `countX86ModernOrFlat` plus footer lines `x86 titles needing modern SteamInternal_* or flat API: N (...)` and `Scan warnings: N`.
- Tests: `D-53-12` describe (Rogue Waters-shaped input clean with lazy-count detail, il2cpp reason, UE importer evidence never no-steam-api, AnyCPU x64, x86 count, source-text no-parallel-copy test).

## Real census run (2026-10-25, `pnpm bridge-census`)

Majority line: `0 of 18 Steamworks-using rows verified (majority: no)` (all 18 unverified: no HELLO / no game-originated call in current logs).
Summary: 17 of 18 routed; 3 of 18 covered by the shim (static scan).
x86 line: `x86 titles needing modern SteamInternal_* or flat API: 0 (none)`.

Target rows:

| AppID | Title | Arch | Class | Detail |
| ----- | ----- | ---- | ----- | ------ |
| 1119730 | Ranch Simulator | x64 | unknown-version | SteamClient@ambiguous(SteamClient017,SteamClient021) |
| 1363080 | Manor Lords | x64 | unknown-version | SteamClient/SteamGameServer/SteamUser ambiguous |
| 427410 | Abiotic Factor | x64 | unknown-version | SteamClient/SteamGameServer/SteamUser ambiguous |
| 284100 | Unclaimed World | x64 | missing-symbols | runtime-loaded, shim-only, persisted miss (CSteamworks-era names) |
| 3410180 | Overlooting | x64 | missing-symbols | runtime-loaded, shim-only, persisted miss |

Other rows: 200510 XCOM x86 known-bad; 206020 Avernum 4 x86 bridge; 206060 Avernum 6 x86 bridge; 230070 Age of Decadence x64 bridge; 411300 ELEX known-bad; 648410 Colony Ship unknown-version (SteamClient017/020); Mono rows 1284190, 1691190, 1782460, 648800 show `+N unserved-family imports (lazy)` (371, 16, 392, 371 style counts); 1167950, 1603180, 219990 runtime-loaded shim-only persisted misses.

None of the three UE rows reads `no-steam-api`; Unclaimed World reads x64.

## Findings for the orchestrator

- The three UE titles now reach version resolution and read `unknown-version` (ambiguous Valve-dll/exe version pools such as SteamClient017 vs 020/021). That is the census applying `resolveRequiredInterfaceVersions` to the original dll plus the Shipping exe's strings; if install resolves these differently on the same bytes, that is a divergence worth checking in the phase verification (53-05's D-53-11 regression used fixture versions).
- Rows backed only by a placed shim (no `.gamelib-orig`) go through the persisted verdict path, so they are not re-evaluated by the new managed/importer scan; Mono counts appear only where the shim-only rows still carry `managed`.
- Overlooting (322 MB exe): the real run classifies it without error (arch read via ranged fd reads, x64); no PE-read failure found, no todo needed.
- The older todo `2026-10-24-bridge-census-misses-unreal-layout-steam-api.md` is now fixed by this plan (D-53-12); it was left in place for the orchestrator to close.

## Deviations from Plan

**1. [Rule 2 - Correctness] UE stand-in exe preference.** The largest-exe fallback picked the Shipping exe, which defeats the stub-plus-Shipping probe. When a real `Engine/` layout exists, the census now chooses among root-level exes. Census-only, commented.

**2. [Rule 1 - Consistency] `launchArch` on runtime-loaded rows.** Needed for "Unclaimed World reads x64" (its exe has no static steam_api import so the old arch was `none`).

**3. Commit grouping.** The x86 count code (planned for Task 2) landed in the Task 1 commit because it shares the driver rewrite; Task 2's commit is the deferral todo.

## Verification

- `npx jest meta/__tests__/bridgeCensus.test.ts`: 73 passed; `fakeHomeIsolation.test.ts` passes.
- `prettier --check` clean on the two .ts paths (the todo is under .planning, prettier-ignored); `eslint` and `tsc -p tsconfig.meta.json` clean; `pnpm planning-gates` 12/12.
- `grep -c "function findRuntimeSteamApiDll" meta/bridgeCensus.ts` is 0.

## Known Stubs

None.

## Commits

- 8a1385d6e feat(53-07): census answers scan questions through shared bridgeScan, x86 modern/flat count
- 43148e0d1 docs(53-07): defer x86 modern-SDK and flat-API parity on a measured count of 0 (D-53-09)

## Self-Check: PASSED
