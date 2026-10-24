---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 15
subsystem: steam-bridge
tags: [diagnosis, gap-closure, wine, nvapi, steamstub, pe-scanner]
requires: [53-14, 53-11, 53-13]
provides:
  - named causes for Overlooting, Ranch Simulator, Rogue Waters
  - PE section sizing by VirtualSize in the DRM scanner
affects: [53-16]
key-files:
  created:
    - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-15-DIAGNOSIS.md
    - .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md
    - .planning/todos/pending/2026-10-25-bridge-scan-iscontainedwithin-dotdot-prefix.md
  modified:
    - src/backend/storeManagers/steam/bridge/peSteamDrm.ts
    - src/backend/storeManagers/steam/bridge/managedImports.ts
    - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md
    - .planning/todos/pending/2026-10-24-steamstub-launch-check-static-re-decision.md
    - .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
decisions:
  - Overlooting is a bottle NvAPI runtime gap, not a shim defect (reproduces with the shim removed)
  - Ranch Simulator is SteamStub (.bind), Phase 52 scope, exits 53 identically with the original dll
  - Rogue Waters meets the strict verified criterion
metrics:
  tasks: 3
  completed: 2026-10-25
---

# Phase 53 Plan 15: Pre-HELLO fault diagnosis Summary

Overlooting and Ranch Simulator are not shim defects (both fail identically without it), while Rogue Waters now passes loading and meets the strict bridge-verified criterion.

## Operator outcomes (verbatim)

"1. rogue waters runs, other two do not, think they have not changed"

Build before scoring: steam_api64.dll 497664 bytes (12:24), sidecar rebuilt 12:25.

## Results

- **Rogue Waters 1691190: verified.** Player.log `Steam API initialized`, `Steam AppId: 1691190`; no `SteamAPI_Init() failed`, zero NOVER. gamelib.log: `HELLO shim attached appid=1691190`, CALLs SteamUtils010.GetAppID, SteamUser021.GetSteamID, STEAMAPPS_INTERFACE_VERSION008.GetCurrentGameLanguage and BIsDlcInstalled, STEAMUSERSTATS_INTERFACE_VERSION012.StoreStats. Fixed by 53-12; no todo.
- **Overlooting 3410180: bottle runtime gap.** `callq *%r15` at 0x1400607ee is an unchecked NvAPI function pointer in Godot 4.4 driver-profile setup. CrossOver's builtin nvapi64.dll fails to load nvapi.dll (c0000135), so QueryInterface returns NULL. Same with the shim removed. Todo created.
- **Ranch Simulator 1119730: SteamStub.** Shipping exe has a `.bind` section and exits 53 before steam_api64.dll loads; identical with the original dll. Appended to the Phase 52 steamstub todo (no new todo).

## Task commits

1. Task 1 diagnosis: 305a4caf9
2. Task 2 checkpoint: operator live launches (answered above)
3. Task 3: 0a933329a (fix: PE sections sized by VirtualSize so the 8-byte-virtual / 214 MB-raw `pck` section no longer shadows `.rsrc`; this was why DRM detection could not parse Overlooting's exe), 9f4a6a5be (docs: DIAGNOSIS dispositions, UAT items 15-17, todos)

## Routing

- Steamstub todo: `## 53-15 evidence` for Raft 648800, Grim Dawn 219990, Ranch Simulator 1119730.
- Old-SDK todo already carried Unclaimed World's `SteamAPI_InitSafe` evidence; nothing appended.
- x86 parity todo: `## 53-15 evidence: Avernum 6 206060` (HELLO only, no CALL; strict criterion not loosened). Frontmatter already ordered severity/platform/ready.
- IN-03 todo created (`severity: minor`, `platform: any`, `ready: code`).

## Deviations from Plan

- The Ranch and Rogue Waters todo files listed in the plan frontmatter were not created: Ranch is routed by the plan's own rule to the existing steamstub todo, and Rogue Waters is resolved.
- The scanner fix (0a933329a) was not a gen_vtables change; it is a PE scanner bug found while explaining the Overlooting parse failure, pinned by a test in that commit.

## Deferred / known gate failure

`pnpm planning-gates`: 11/12 pass. The single failure is the pre-existing 53-VERIFICATION.md frontmatter, logged in deferred-items.md, unrelated to this plan. All todo frontmatter passes.

## Housekeeping

Raw traces deleted from the scratchpad; gamelib-shell stopped.

## Self-Check: PASSED

Commits 305a4caf9, 0a933329a, 9f4a6a5be exist; todos and DIAGNOSIS present.
