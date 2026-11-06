---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 19
subsystem: steam-bridge
tags: [crossover, dll-override, nvapi, overlooting, gap-closure]
requires: []
provides:
  - measured per-exe nvapi64 override that clears the Overlooting rip=0 fault in its bridge bottle
  - applyBridgeBottleDllOverrides wired into the bridge launch
affects: [src/backend/storeManagers/steam/games.ts]
key-files:
  created:
    - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-19-NVAPI.md
    - src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md
decisions:
  - "Arm B (per-exe AppDefaults\\Overlooting.exe\\DllOverrides nvapi64=\"\") is the shipped mechanism; arms C and D were not needed"
metrics:
  completed: 2026-10-25
  tasks: 2
---

# Phase 53 Plan 19: Overlooting NvAPI DLL override Summary

A measured per-exe registry override (`nvapi64=""` under `AppDefaults\Overlooting.exe\DllOverrides`) clears Overlooting's pre-shim NvAPI fault, and every bridge launch of 3410180 now applies it to its own bottle.

## Commits
- 246efddd3 docs(53-19): measure NvAPI override arms for Overlooting
- 54e43368d feat(53-19): per-appId bridge-bottle DLL override (Overlooting nvapi64)

## What changed
- Task 1: Arm A reproduced the rip=0 access violation (return rva 607f1, nvapi64 mapped, godot.log empty). Arm B removed it: nvapi64 failed to load, Godot skipped its NvAPI block, and godot.log advanced into GodotSteam init. The game ran to the 45 s bound. Bottle `user.reg` and `cxbottle.conf` were restored and hash-verified.
- Task 2: `bottleDllOverrides.ts` holds a frozen table with the single entry `3410180 -> nvapi64 / Overlooting.exe` and an applier that never rejects. games.ts awaits it after `applySteamBridgeKnownFixes` and before `startBottleProcessMonitor`, with a `.catch` fallback. 7 new tests pass, the known-fixes and games suites still pass (387 total), and `pnpm codecheck` is clean.

## Scope statement
This override is a D-53-06 per-title mitigation (fix when measured), measured on one title. It is NOT work from the out-of-scope `2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need` todo, because nothing is installed into the bottle. No Valve DLL, exe edit or stand-in was introduced, and Overlooting is never rerouted to bottled Steam.

If the override does not make Overlooting verify in 53-20 (HELLO plus a clean game Steam-init log), the row stays in the denominator as held back (bottle runtime gap: NvAPI NULL before the shim), and is never dropped or rerouted. The experiment had no helper, so HELLO is not yet proven; the 53-20 live run is the proof.

## Deviations from Plan
- A `buildOverrideCommandParts` helper was exported (needed to unit-test Test 1b exe scoping). Otherwise none.
- Raw-trace cleanup was done with literal paths, since the shell-variable form was blocked by the safety check.

## Self-Check: PASSED
Files and commits 246efddd3, 54e43368d exist.
