---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 14
subsystem: steam-bridge-shim
tags: [gap-closure, CR-01, gen_vtables, steamstub]
requires: [52-13]
provides:
  - "SteamClient017/014 GetISteam* lookups gated on g_bridge_steamstub_path_active"
affects: [native/steam-bridge/generated/steam_api_shim.c]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
decisions:
  - "CR-01: forwarded lookup runs only after GameLibBridge_CreateInterface sets g_bridge_steamstub_path_active; otherwise pre-phase local proxy or x64 null object"
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 52 Plan 14: CR-01 SteamStub-gated forwarded lookups Summary

Ordinary x64 titles (e.g. ELEX) again get a local proxy or the x64 null object from SteamClient GetISteam*, never NULL; forwarding to the native client with NULL on refusal now happens only after the SteamStub entry point `GameLibBridge_CreateInterface` has set a shim-global flag.

## Commits
- ff4a777cf: generator change (flag declaration, set in CreateInterface, leading local branch in forwarded lookup) and rewritten tests
- 2221c018b: regenerated steam_api_shim.c plus committed-source pin (first version had a lookup bug)
- 1937a36c3: fix to the committed-source pin

## Verification
- jest gen_vtables, shimAbiGate, shimCoverage, helperIntegration: 206 passed
- `pnpm gen-vtables` idempotent; `pnpm build-steam-bridge` passes, export present in the DLL
- prettier --check clean on the two TS files

## Deviations from Plan
- steam_api64.def and bridge_dispatch.h were unchanged and not committed (as the plan anticipated).
- The pin test inlines the generated-file path because the existing SHIM_C_PATH constant is scoped to another describe block.
- Commit 2221c018b briefly contained a failing pin test; corrected in 1937a36c3.

## Self-Check: PASSED
