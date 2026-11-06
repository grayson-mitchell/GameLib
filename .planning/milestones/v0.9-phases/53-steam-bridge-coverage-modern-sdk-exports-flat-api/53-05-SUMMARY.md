---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 05
subsystem: steam-bridge
tags: [scan, mono, il2cpp, anycpu, verdict, j4l]
requires:
  - phase: 53-01
    provides: "x64 served versions for the three UE titles"
  - phase: 53-02
    provides: "managedImports.ts / interfaceVersions.ts managed readers"
provides:
  - "bridgeScan.ts: one async shared scan module (importer-PE, UE layout, runtime dll walk, Mono managed scan, effective arch) with injected deps and zero backend imports"
  - "partitionManagedImports: lifecycle and served-family names are required, unserved-family imports only counted"
  - "SteamBridgeScanVerdict.managedScan (mono counts / il2cpp reason) persisted through the zod schema"
  - "placement uses the AnyCPU-aware effective arch"
affects: [53-06, 53-07]
tech-stack:
  added: []
  patterns: ["shared scan module with injected scanImports/warn/isShimBytes so the census can reuse it"]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/bridgeScan.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeScan.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/managedImports.ts
    - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
key-decisions:
  - "Shared module is async (node:fs/promises); census injects a Promise-returning objdump wrapper"
  - "BridgeScanDeps gained a third injected member, isShimBytes, because the runtime dll walk classifies shim bytes and that helper lives in shimGenerate"
  - "Managed-derived unservable interface versions follow the existing rule (feed the guard); managed symbol names never enter delayMissingAll"
metrics:
  tasks: 3
  commits: 2
completed: 2026-10-25
---

# Phase 53 Plan 05: Shared bridge scan, Mono managed scan, AnyCPU arch Summary

One async `bridgeScan.ts` now holds every walk the backend and the census share, adds the Mono managed scan with the amended required-set rule, and placement reads the AnyCPU-aware launch arch.

## What was built

- `bridgeScan.ts` (no `backend/` imports; an import-boundary test pins this): `findRuntimeLoadedSteamApiDlls`, `findUnrealLayout`, `findSteamApiImporterPes`, `resolveWalkRoot`, `isContainedWithin`, `readFileEffectiveArch`, `servedFamiliesFor`, `partitionManagedImports`, `scanManagedSteamApi`. Walk invariants (depth 4, 512-file cap, symlink skipping, containment, Shipping exes first) moved verbatim; shimGenerate.ts keeps no copies.
- Mono scan: `<exe>_Data/Managed/*.dll`, real-dir lstat, bottle containment, symlinks skipped, 256-dll cap with one warning, unparsable dlls counted. IL2CPP (GameAssembly.dll, no Managed dir) reports `il2cpp: not scanned` and keeps `@runtime-loaded`.
- shimGenerate: managed required names merge into the coverage input; the managed UTF-16 constants alone form the version pool; verdict carries `managedScan`; `readExeMachineArch` removed in favour of `readFileEffectiveArch`.
- Verdict: `managedScan` declared in the type and the zod schema (discriminated union, fixed reason literal).
- j4l guard block is untouched (diff shows no change); `D-53-11` regression describe covers Manor Lords, Abiotic Factor and Ranch Simulator, all placed clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] Third injected dependency.** `findRuntimeLoadedSteamApiDlls` needs `isGameLibShimBytes`, which lives in shimGenerate.ts; importing it would break the zero-backend-import rule, so `BridgeScanDeps` gained `isShimBytes`.

**2. [Rule 1 - Bug] `readPeEffectiveArch` too strict.** It required a full optional-header layout, so the sparse PEs in existing tests (and any PE without a parsable layout) lost their machine arch (`exeArch` null, two existing tests failed). It now reads the machine type from the COFF header first and only consults the CLR header for x86. File: `managedImports.ts`.

**3. Commit grouping.** Tasks 1 and 2 are in one commit (`a5f60ebbd`): the managed scan sits in the same new file as the lifted walks, so they were not separable cleanly.

## Verification

- `npx jest src/backend/storeManagers/steam/bridge`: 17 suites, 522 tests passing.
- `pnpm codecheck` exits 0; `prettier --check` clean on all written paths.
- `readExeMachineArch` count in shimGenerate.ts: 0.

## Known Stubs

None.

## Commits

- a5f60ebbd feat(53-05): lift scan walks into bridgeScan.ts with managed scan and partition
- 3cf30b8d3 feat(53-05): shimGenerate consumes managed scan and effective arch, persist managedScan

## Self-Check: PASSED
