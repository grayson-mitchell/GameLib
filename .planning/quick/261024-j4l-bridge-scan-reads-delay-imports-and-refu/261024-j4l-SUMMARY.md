---
phase: quick-261024-j4l
plan: 01
subsystem: steam-bridge
tags: [pe, delay-imports, shim, guard]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/delayImportPe.ts
  modified:
    - src/backend/storeManagers/steam/bridge/peSteamDrm.ts
    - src/backend/storeManagers/steam/bridge/importScan.ts
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/games.ts
metrics:
  completed: 2026-10-24
---

# Quick 261024-j4l: delay-import scan, withhold guard, .gamelib-orig backup

The bridge scan now reads the PE Delay Import Directory (zero-spawn, bounded reader in
peSteamDrm.ts). When importer evidence names a delay-imported missing symbol or an unservable
interface version, the shim is withheld, a GameLib shim already on disk is restored from
`<dll>.gamelib-orig`, and the launch goes direct. Every overwrite of a game-original dll now keeps
that backup.

## Commits

- ce577e1df test: failing tests for delay-import scan
- e40acf7c7 feat: steam_api scan reads the PE delay import directory
- 362192274 test: failing tests for original-dll backup and unservable versions
- 4e1864377 feat: keep the game-original steam_api dll as .gamelib-orig
- 97b8f09bc test: failing tests for the withhold guard
- 433cf9d02 feat: withhold the shim on delay-imported misses / unservable versions

## Verification

- `npx jest src/backend/storeManagers/steam`: 2214 passed, 0 failed.
- `pnpm codecheck`: clean. eslint: 0 errors (warnings pre-existing). Scoped prettier check clean
  on every written path, none prettier-ignored. `grep -c "^import" peSteamDrm.ts` = 0.
- Test diffs vs the plan start are additions only (one import line in peSteamDrm.test.ts and one
  `logInfo: jest.fn()` entry in importScan.test.ts's logger mock were extended).
- `pnpm build:sidecar` and `graphify update .` run.
- games.ts diff: 8 insertions, 3 deletions, confined to launchBridgeGame.

## Deviations

**1. [Plan inconsistency] Manor Lords test body uses served versions for SteamUser/SteamUtils.**
The plan's test body is 'SteamUser023 SteamFriends017 SteamUtils010' and asserts
`missingSymbols` does not contain 'SteamUser023'. The x64 served map has only SteamUser019,
SteamFriends015 and SteamUtils008 (023 is in the x86 map), so under the plan's own skew rule
SteamUser023 and SteamUtils010 are also unservable on x64 and WOULD be named. The test uses
'SteamUser019 SteamFriends017 SteamUtils008' so only SteamFriends017 is the gap. Consequence for
the real game: the live Manor Lords verdict will also list SteamUser023 and SteamUtils010 (the todo's
"Shim implements: yes" for SteamUser023 does not match the x64 TS served map). No served map was
changed.

**2. [Rule 3] Test fixture:** the VA-form descriptor is only built for PE32 (PE32+ descriptors are
always RVAs and cannot hold a 64-bit VA); a PE32+ `vaForm` request builds the RVA form.

**3. importScan.test.ts logger mock** gained `logInfo: jest.fn()` (additive) because the scan now
logs one info line when delay imports are found.

## Surfaced to the orchestrator

- **Static-miss question:** the guard does not withhold on static-import misses (oq7 kept, per
  orchestrator decision). A static miss still gets "placed-miss" and will likely fail at load.
- **Manor Lords already-placed limit:** today it has a current shim on disk and no backup, so it takes
  the pinned no-walk 'already-placed' path before any guard runs. Hand-restore the original
  steam_api64.dll first; the next launch then evaluates, withholds and leaves it alone.
- **meta/bridgeCensus.ts does not read delay imports yet** (follow-up).
- The withhold guard evaluates only when a walk runs; a game whose shim is current and identical
  never reaches it (by design, pinned tests).

## Known Stubs

None.

## Self-Check: PASSED

All six commits present in `git log`; fixture and source files exist.
