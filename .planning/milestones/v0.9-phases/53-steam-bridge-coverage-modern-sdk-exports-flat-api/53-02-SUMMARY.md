---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 02
subsystem: steam-bridge
tags: [pe-parsing, ecma-335, implmap, anycpu, utf16-versions]
requires: []
provides:
  - "managedImports.ts: readPeClrHeader, effectiveLaunchArch, readPeEffectiveArch, readManagedSteamApiImports (zero imports)"
  - "interfaceVersions.ts: parseInterfaceVersionStringsUtf16, readManagedInterfaceVersionStrings, selectInterfaceVersionPool"
  - "fixtures/steamworksNetFlatNames.json: measured steam_api64 flat-name union (960 names)"
affects: [53-05, 53-07]
tech-stack:
  added: []
  patterns: ["zero-import ranged PE reader with caps and byte budget", "synthetic CLI assembly builder"]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/managedImports.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/managedPe.ts
    - src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/steamworksNetFlatNames.json
  modified:
    - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
    - src/backend/storeManagers/steam/bridge/__tests__/interfaceVersions.test.ts
decisions:
  - "Managed version constants alone form the request pool when present (resolved open question 2)"
  - "Total bytes requested through the reader capped at 64 MiB via a counting wrapper, in addition to MAX_STREAMS 16 and MAX_ROWS 1<<22"
metrics:
  completed: 2026-10-25
---

# Phase 53 Plan 02: Managed import reader, AnyCPU rule and flat-name measurement Summary

A bounds-checked ECMA-335 ImplMap reader (never executes managed code), the amended D-53-10 AnyCPU launch-arch rule, UTF-16 interface-version extraction with a managed-first pool, and a committed measured flat-name union from the five installed Mono Unity titles.

## Measured steam_api64 DllImport counts (D-53-02)

Read-only over `com.rlabrecque.steamworks.net.dll` in each `GameLibSteamBridge-<appid>` bottle:

| App | Title | steam_api64 | steam_api |
|---|---|---|---|
| 1167950 | Vampire's Fall Origins | 944 | 0 |
| 1284190 | The Planet Crafter | 944 | 0 |
| 1691190 | Rogue Waters | 930 | 0 |
| 1782460 | Hell Clock | 952 | 0 |
| 648800 | Raft | 944 | 0 |

Matches the plan's 944/944/930/952/944 exactly. Union: 960 names. Each assembly also references `sdkencryptedappticket64`, kept under `importsByModule` and not counted as steam_api.

**D-53-02 caveat (plan-checker, 2026-10-25):** the flat-name fixture is measured on the 5 installed Mono titles only; owned-but-uninstalled Unity titles, and IL2CPP titles, may import Steamworks.NET names the fixture lacks.

## Measured UTF-16 interface versions (vs RESEARCH Pattern 4)

- 1167950, 1284190, 648800: SteamClient020, SteamUser023, SteamFriends017, SteamUtils010, USERSTATS_012, APPS_008, REMOTESTORAGE_016, SteamNetworking006, MatchMaking009, MatchMakingServers002, SteamGameServer015, SteamGameServerStats001, SteamInput006, UGC_017. Matches the table.
- 1691190 Rogue Waters: SteamClient020, SteamUser021, SteamGameServer014, UGC_016. Matches (User021, GameServer014 as predicted).
- 1782460 Hell Clock: SteamClient021, SteamUser023, UGC_020, REMOTEPLAY_002. Matches.

Beyond the table, the constants also include SteamNetworkingSockets012, NetworkingMessages002, NetworkingUtils004, Parties002, MatchGameSearch001, GameCoordinator001, plus HTTP/Music/Screenshots/ParentalSettings families; those have no served version and fall to the null object (D-51-13).

## Commits

- fa82de313: managedImports.ts, managedPe builder, CLR header and D-53-10 tests
- bb9a42906: ImplMap/ModuleRef decode and hostile-metadata tests
- 58551bcdf: UTF-16 version helpers, pool rule, names fixture
- 5f6f5c262: typing nit (eslint warning)

## Verification

- managedImports (22 tests) and interfaceVersions (27 tests) suites pass; all `src/backend/storeManagers/steam` suites pass (2354 tests).
- `grep -c '^import' managedImports.ts` is 0; prettier and eslint clean; tsc reports nothing for touched files.
- Real-assembly smoke ran through `meta/runTs.cjs --bundle` with an fd-backed ranged reader (script kept in the scratchpad, not committed).

## Deviations from Plan

**1. [Process] Tasks 1 and 2 reader code landed together.** The full ImplMap decode was written alongside the CLR header read in `managedImports.ts`, so commit fa82de313 contains the reader for both; the Task 2 decode and hostile tests are in the separate commit bb9a42906. No behavior change.

Otherwise none. The pre-existing failures (pluralCategoriesFor, genI18nGateScope A-17, findDeadcode.cjs CLI) were not touched.

## Known Stubs

None.

## Threat Flags

None. T-53-05..T-53-08 mitigations are in place (bounds-checked ranged reads, MAX_STREAMS / MAX_ROWS / byte budget caps, no execution, fixture holds identifiers only with a path-separator check).

## Self-Check: PASSED

All created files exist; commits fa82de313, bb9a42906, 58551bcdf, 5f6f5c262 exist.
