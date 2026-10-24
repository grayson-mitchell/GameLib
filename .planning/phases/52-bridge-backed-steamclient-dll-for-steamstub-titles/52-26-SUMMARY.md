---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 26
subsystem: steam-bridge
tags: [gap-closure, steamstub, forwarder, version-resource]
requires: [52-25]
provides:
  - "steamclient64.dll forwarder carries a GameLib VS_VERSIONINFO resource (steamclient_fwd.rc)"
  - "52-UAT item 22: operator decision and implementation record"
affects: [52-27 (item 25 hygiene: forwarder byte-identical to new build, 187392 B)]
key-files:
  created:
    - native/steam-bridge/steamclient/steamclient_fwd.rc
  modified:
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/deferred-items.md
requirements-completed: [P52-DONE, P52-SCOPE-2]
completed: 2026-10-24
---

# Phase 52 Plan 26: Gap 5 fix decision 3 Summary

Operator chose option-versioninfo with GameLib's own strings; the forwarder now carries a compiled VS_VERSIONINFO resource (CompanyName "GameLib", FileDescription "GameLib steamclient forwarder") built through the pinned zig 0.16.0 `zig cc`, with no Valve identity and no answer added.

## What was done

- Task 1: item 22 set to `pass — operator chose option-versioninfo`, label boundary-compliant, files allowed recorded (decision commit cad85dd11; opened earlier in 0c30ae234). Plan base for the scope diff: f8ee7113b.
- Task 2 (TDD): RED run failed on the new `STEAMCLIENT_FWD_RC_PATH` argv pin (1 failed, 42 passed); GREEN after adding the constant, the .rc and the argv entry (43 passed). Commit 979c3b0e3.
- Task 3 desk gate: `pnpm gen-vtables` no drift; `pnpm codecheck` clean; jest (buildSteamBridgeShims, gen_vtables, shimAbiGate, src/backend/storeManagers/steam) 63 suites / 2490 tests pass; `pnpm build-steam-bridge` succeeded, zig compiled the .rc with no new tool.
- Measurements: SHIM64 251904 B; forwarder 187392 B (was 186368); exports CreateInterface only; `.rsrc` Resource Directory present; strings CompanyName/FileDescription/ProductName GameLib, versions 1.0.0.0, no "Valve" string.
- Boundary checks: no HKLM in native/steam-bridge/steamclient/ (steamClientSetup.ts:9 matches only a pre-existing comment forbidding HKLM); no Grim Dawn.exe in the diff; no .dll in the diff (steamclient64.dll is git-ignored); forwarder differs from the genuine DLL (size 187392 vs 26547864).
- Hygiene delta for 52-27 (item 25): forwarder byte-identical to the new build (size 187392).
- prettier --check passed over the two TypeScript paths; planning gates 12/12.

## Deviations from Plan

None - plan executed as written. UAT Summary counts updated to total 22, passed 10.

## Not verified

Whether Grim Dawn's SteamStub now accepts the forwarder is unobserved; that needs the packaged-build run in 52-27. Bridge-verified is not claimed.

## Known Stubs

None.

## Self-Check: PASSED
