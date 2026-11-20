---
phase: 74-steam-game-updates
plan: 11
subsystem: steam
tags: [steam, update, ipc, status-label, i18n]
requires: [74-06, 74-09, 74-10]
provides:
  - getSteamUpdateInfo IPC channel (schema, preload, handler, backend module)
  - SteamUpdateInfo type (src/common/types/steam.ts)
  - "Planning update…" / "Applying update…" stage labels (card, game page, Downloads hero)
  - gamelib:gamepage.update.* strings for plan 12
affects: [74-12]
key-files:
  created:
    - src/backend/storeManagers/steam/updateInfo.ts
    - src/backend/storeManagers/steam/__tests__/updateInfo.test.ts
    - src/frontend/hooks/__tests__/statusLabel.steamUpdate.test.ts
  modified:
    - src/common/types/ipc/install.ts
    - src/common/types/steam.ts
    - src/preload/api/misc.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/sidecar/__tests__/ipcSchemas/install.test.ts
    - src-tauri/src/ipc_contract.rs
    - src/frontend/hooks/constants.ts
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
    - public/locales/en/gamelib.json
key-decisions:
  - "Strings live in gamelib.json under gamepage.* (keys gamelib:gamepage.steamUpdatePlanning, steamUpdateCommitting, update.*), not gamepage.json: i18n-churn-guard forbids touching upstream catalogs."
  - "Only an explicit computeSize on a stale bridge game may call estimateBridgeUpdate (authenticated lease); freeBytes is read then via getDiskInfo."
requirements-completed: []
completed: 2026-11-12
---

# Phase 74 Plan 11: Update info IPC and stage labels Summary

One `getSteamUpdateInfo` channel gives the renderer a game's update state without authenticated traffic, and the card, game page and Downloads hero name the plan and commit stages of a bridge update.

## Commits
- e16fc8028 feat(74-11): getSteamUpdateInfo IPC channel (includes regenerated `src-tauri/src/ipc_contract.rs`)
- 091c6098a feat(74-11): steam update stage status labels and update strings

## Verification
- jest: updateInfo (10), ipcSchemas/install, installFlows, statusLabel*, DownloadManager all pass
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm i18n-churn-guard` pass; prettier scoped checks clean
- `pnpm lint-translations` fails only on non-English locale gaps for the new gamelib keys (known, out of scope)

## Deviations from Plan

**1. [Rule 3 - Blocking] Catalogue location changed.** The plan put the keys in `public/locales/en/gamepage.json`; `i18n-churn-guard` rejects edits to upstream catalogs. Keys went into `public/locales/en/gamelib.json` under `gamepage` and call sites use the `gamelib:` prefix. Plan 12 must use `gamelib:gamepage.update.*` (not `gamepage:game.update.*`); the stage keys are `gamelib:gamepage.steamUpdatePlanning` / `steamUpdateCommitting`. The plan's python acceptance check on gamepage.json therefore does not apply.

**2. [Rule 3] `pnpm gen:ipc-contract`** regenerated `src-tauri/src/ipc_contract.rs` (check:ipc-contract was stale), committed with task 1.

## Known Stubs
None.

## Threat Flags
None; T-74-35/36 mitigated (strictObject schema, NUMERIC_APP_ID re-guard, authenticated estimate only on computeSize === true for stale bridge games).

## Self-Check: PASSED
