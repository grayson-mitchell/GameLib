---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 07
subsystem: steam-bridge
tags: [shim, steamstub, gen-vtables, x64]
requires: [52-01, 52-02, 52-03]
provides:
  - GameLibBridge_CreateInterface x64 shim export (native-backed via CONTROL slot 3)
affects: [52-03 forwarder, 52-11 live verification]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api64.def
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
decisions:
  - Only GameLibBridge_CreateInterface was added; the five SteamInternal_* exports already shipped in quick 261024-i94 and were left unchanged.
metrics:
  completed: 2026-10-24
---

# Phase 52 Plan 07: x64 shim CreateInterface export Summary

The x64 shim now exports `GameLibBridge_CreateInterface(name, rc)`. It sends HELLO once, asks the helper (CONTROL slot 3) whether the native client accepts the version, and returns the shim proxy for that exact version only on a native yes. Otherwise it returns NULL with rc=1, never the null object. The name length is bounded at 4096.

## Deviations from Plan

**1. [Scope reconciliation] Five SteamInternal_* exports already existed**
- Quick task 261024-i94 had already shipped `SteamInternal_SteamAPI_Init`, `_ContextInit`, `_FindOrCreateUserInterface`, `_FindOrCreateGameServerInterface` and `_GameServer_Init_V2`, with their own passing tests and pins. Those tests assert the null-object fallback for FindOrCreate* and a global context counter. I did not rewrite them to the plan's different semantics (NULL for the game-server lookup, a constant counter), because that would regress shipped, tested behavior. Only the sixth export, `GameLibBridge_CreateInterface`, was added. The .def now has all six names, and the built DLL's export table lists all six.
- The plan's "FindOrCreateGameServerInterface returns NULL" and "constant counter" behaviors are not implemented. This is a decision for the caller to confirm if those semantics matter.

x86 `steam_api.def` and `SHIM_EXPORTED_SYMBOLS` are unchanged.

## Verification
- gen_vtables, shimCoverage and shimAbiGate suites pass (197 tests).
- `pnpm gen-vtables` is idempotent.
- `pnpm build-steam-bridge` passes for the x64 shim and the steamclient64 forwarder. The objdump export grep prints 6.
- prettier --check passes on the .ts paths.

## Commits
- 68d1e3eff: generator export and tests
- b18005b73: regenerated shim and coverage pin

## Self-Check: PASSED
