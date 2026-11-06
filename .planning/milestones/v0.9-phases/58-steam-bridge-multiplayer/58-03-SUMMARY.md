---
phase: 58-steam-bridge-multiplayer
plan: 03
subsystem: steam-bridge
tags: [shim, manifests, proton, flat-accessors, stubs]
requires: []
provides:
  - "x64 stub manifests: SteamMatchMakingServers003, SteamNetworkingSockets013, SteamNetworkingUtils004, SteamNetworkingMessages002"
  - "ALLOWED_PROTON_REFS and --proton-ref on extract-proton-inventory"
  - "flatAccessorAliases manifest field"
  - "SteamAPI_SteamMatchmaking_v009 (SDK spelling) exported beside the old SteamMatchMaking spelling"
affects: [58-12, 58-21]
tech-stack:
  added: []
  patterns: ["second pinned Proton SHA gated by an allow-list"]
key-files:
  created:
    - meta/sdk/isteammatchmakingservers003.manifest.json
    - meta/sdk/isteamnetworkingsockets013.manifest.json
    - meta/sdk/isteamnetworkingutils004.manifest.json
    - meta/sdk/isteamnetworkingmessages002.manifest.json
  modified:
    - meta/extractProtonInventory.ts
    - meta/gen_vtables.ts
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/ordinals.json
    - meta/sdk/isteammatchmaking009.manifest.json
    - meta/sdk/isteamnetworking006.manifest.json
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
    - native/steam-bridge/generated/steam_api_shim.c
key-decisions:
  - "SHIM_EXPORT_SET_VERSION moved e5c8d97c6a2e -> f438299ee400"
  - "Sockets/Utils/Messages added to BARE_ACCESSOR_FAMILY (CR-02 pin requires it once their manifests export bare accessors)"
requirements-completed: [M-03]
duration: ~50min
completed: 2026-10-31
---

# Phase 58 Plan 03: Baseline multiplayer manifests Summary

Four current-version x64 stub manifests (MMServers003 and Sockets013 from Proton 164e0ccd, Utils004 and Messages002 from 2c620c0f), MM009/Networking006 repointed at the real Mac accessors, and the SDK spelling `SteamAPI_SteamMatchmaking_v009` exported alongside the old one via a new `flatAccessorAliases` field.

## Commits
- a5058271b feat: second pinned Proton ref and four manifests
- 9baa97e47 feat: flatAccessorAliases and helperInterface
- 371659f38 feat: served tables, regenerated shim, test updates

## Verification
- Slot counts match Proton VTABLE_ADD_FUNC blocks: Sockets013 48, MMServers003 18 (Utils004 26, Messages002 6).
- steam_api64.def exports all six accessor spellings; `pnpm build-steam-bridge` compile gates passed (x86 and x64).
- Suites green: extractProtonInventory, gen_vtables, shimAbiGate, shimCoverage, shimGenerate, bridgeCensus; `pnpm codecheck` exit 0.

## Deviations from Plan

**1. [Rule 3 - blocking] BARE_ACCESSOR_FAMILY entries.** The CR-02 family-spelling pin failed because the new manifests export bare `SteamNetworkingSockets/Utils/Messages` accessors. Added the three keys to `interfaceVersions.ts`. Side effect: a game importing a bare accessor of those families now resolves a required version (or reports `@unknown-version`).

**2. [Rule 1 - test drift] Tests that used newly served families as the "unserved" example** (`shimGenerate.test.ts` x3, `shimCoverage.test.ts` pinned counts, `bridgeCensus.test.ts`) were repointed at `ISteamGameCoordinator` or the new `@unknown-version` miss. Added a 58-03 describe block for the served tables and a pre-58-03 export-set-version pin.

**3. Process slip.** I ran `git stash` once by mistake mid-task and popped it immediately; the stash list held only that entry and the tree was restored in full (the unrelated dirty files included). No content lost.

## Findings needing a decision
**Utils004 coverage gap.** Proton's SteamNetworkingUtils004 vtable has 26 slots; SDK 165 flat names `SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess` and `_IsFakeIPv4` have no slot, so they stay unexported while the family is now served. A Steamworks.NET title importing them is classified `missing-symbols` (census Mono shape) where before it counted as an unserved-family import. Pinned in tests; the wiring plans should decide whether to export them.

**Pre-existing test failures seen in the full `meta` run** (`live tree` working-tree classification, `genI18nGateScope` A-17 anti-rot) depend on the dirty working tree / `public/locales` change, not on this plan.

## Known Stubs
All four new manifests are `mode: stub` by design (D-07); wiring plans 58-12..58-21 flip methods.

## Self-Check: PASSED
Commits a5058271b, 9baa97e47, 371659f38 present; four manifest files exist.
