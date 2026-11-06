---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 03
subsystem: steam-bridge
tags: [zig, pe, steamstub, forwarder]
requires: [52-02]
provides:
  - steamclient64.dll forwarder built by pnpm build-steam-bridge
  - builtBridgeSteamClient64Path
affects: [52-07]
key-files:
  created:
    - native/steam-bridge/steamclient/steamclient_fwd.c
  modified:
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - src/backend/constants/paths.ts
key-decisions:
  - "x64 only; x86 steamclient.dll deferred (decision 6)"
requirements-completed: [P52-SCOPE-2]
completed: 2026-10-24
---

# Phase 52 Plan 03: steamclient64 forwarder Summary

Zig-built x64 `steamclient64.dll` exporting only `CreateInterface`, which delegates to `GameLibBridge_CreateInterface` in the game's already-loaded `steam_api64.dll` (by module name, then own directory with MAX_PATH-bounded path build), returning NULL with rc=1 when absent.

## Tasks

1. Forwarder source (54452c67d): no logging, no local answers, no DllMain.
2. Build step, prune, path constant, tests (008f99641): `compileSteamClient64` runs after `compileShim64` in `main()`; `builtBridgeSteamClient64Path` added beside the shim64 constant.

## Measurements

Byproducts (directory listing diff before/after the zig compile in `public/bin/arm64/darwin`):
`steamclient64.dll`, `steamclient64.pdb`, `steamclient_fwd.lib`. Pinned `.pdb` and `.lib` in `STEAMCLIENT64_BUILD_BYPRODUCTS`; none remain after `pnpm build-steam-bridge`.

objdump export table:

```
DLL name: steamclient64.dll
Ordinal base: 1
 Ordinal      RVA  Name
       1   0x1000  CreateInterface
```

## Deviations from Plan

- The B5 test's `COMPILE GATE FAILED` count was raised from 4 to 6 to account for the new function's two throws (expected consequence, not a bug).

## Notes

- `public/bin/arm64/darwin/` shows as untracked after the build (generated output, not committed).
- The forwarder was only compiled and export-checked, not run in a Wine bottle; that is covered by later plans.

## Self-Check: PASSED
