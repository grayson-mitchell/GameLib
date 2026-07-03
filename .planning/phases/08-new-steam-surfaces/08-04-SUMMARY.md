---
phase: 08-new-steam-surfaces
plan: 04
subsystem: steam-console
tags: [steam, console, delisted, gap-closure, CONSOLE-01]
gap_closure: true
requires:
  - Steam store manager (fetchMetadataIfNeeded, steamMetadataStore)
  - ConsoleMode grid + activateGame
provides:
  - is_delisted flag on GameInfo (confirmed-unavailable Steam apps)
  - is_delisted persistence on SteamMetadataCacheEntry (survives restart/resync)
  - Console grid excludes delisted games + activation guard
affects:
  - src/common/types.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/screens/ConsoleMode/index.tsx
tech-stack:
  added: []
  patterns:
    - appdetails envelope success flag distinguishes definitive delisted (success:false) from transient failure (axios throw / empty envelope)
    - persisted verdict re-seeded on library refresh (mirrors DETAIL-01 is_mac_native pattern)
key-files:
  created: []
  modified:
    - src/common/types.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/frontend/screens/ConsoleMode/index.tsx
decisions:
  - is_delisted set ONLY on explicit appdetails success===false; axios throws and empty/ambiguous envelopes never set it (availability-vs-visibility integrity)
  - success path clears a stale flag (is_delisted:false) so a re-listed app reappears
  - delisted verdict persisted in steamMetadataStore without wiping cached art/extra, re-seeded on refresh() so it survives resync/restart
  - no-op activation guard is sufficient (no overlay/notice) since delisted games are already filtered from the visible grid
metrics:
  duration: ~9min
  completed: 2026-07-03
  tasks: 3
  files: 5
---

# Phase 08 Plan 04: Delisted Steam Games — Console Exclusion Summary

Delisted Steam games (appdetails `success:false`) are now flagged `is_delisted`, persisted across sessions, filtered out of the Console grid, and blocked from install/launch activation — while a transient/offline API failure can never mark a game delisted.

## What Was Built

UAT gap B (tests 3 + 6) found delisted owned Steam games showing the placeholder image in the Console grid and, if activated, firing a `steam://install` handoff that cannot succeed. This plan derives an `is_delisted` flag from the Steam appdetails API's definitive `success:false` verdict and uses it to hide + de-activate those games.

**Task 1 — Type surface (`8b605961`):** Added `is_delisted?: boolean` to `GameInfo` (src/common/types.ts) and `SteamMetadataCacheEntry` (electronStores.ts). Additive optional fields; no call sites broke.

**Task 2 — Verdict derivation (`ac510f3c`):** In `fetchMetadataIfNeeded` the appdetails envelope is now read as `{ success, data }` before touching `data`:
- `entry?.success === false` (definitive "no such app" / delisted) → merge `is_delisted: true` into the existing metadata store entry (preserving cached art/extra), update the in-memory library entry, and `pushGameToLibrary` so the frontend drops it live, then return.
- `!data` but `success` not explicitly false (ambiguous/empty envelope) → treated as transient; returns WITHOUT setting the flag (prior behavior).
- Success path → sets `is_delisted: false` on both the `updated` GameInfo and the `steamMetadataStore.set` payload, so a previously (wrongly/temporarily) flagged app gets un-flagged when it becomes available again.
- The catch block (axios throw / offline) is unchanged — a network blip cannot mark a game delisted.
- `library.ts` refresh seeds `is_delisted: cachedMeta?.is_delisted ?? false` alongside the existing `is_mac_native` seeding so the verdict survives a resync.

**Task 3 — Console consumption (`26f1d6d3`):** `allGames` filter predicate extended with `&& !g.is_delisted` (also transitively hides the Steam chip when all Steam games are delisted, since `storesWithGames`/`storeFilters` derive from `allGames`). `activateGame` gained an early `if (game.is_delisted) return` guard so no install/launch handoff fires even if a delisted game is somehow focused.

## Must-Haves Verification

- **Delisted flag set + persisted on definitive verdict:** `success === false` branch sets `is_delisted: true` in steamMetadataStore (persisted) and pushes the updated GameInfo. `library.ts` re-seeds from `cachedMeta?.is_delisted` on refresh.
- **Hidden from Console grid:** `allGames` predicate includes `!g.is_delisted`.
- **Not activatable:** `activateGame` early-returns on `game.is_delisted` before any install/launch path.
- **Transient failure does NOT mark delisted:** the empty-envelope branch and the axios catch block both leave `is_delisted` untouched; `is_delisted: true` appears EXACTLY ONCE in games.ts (only the `success === false` branch), confirmed by `grep -c` = 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restructured the delisted branch to satisfy the exactly-once enforcement**
- **Found during:** Task 2 verification
- **Issue:** The plan's action wrote `is_delisted: true` in both the `steamMetadataStore.set` payload and the `delistedInfo` GameInfo literal, producing `grep -c 'is_delisted: true'` = 2. The acceptance criterion enforces EXACTLY ONCE (`-eq 1`) to prove the literal is absent from the catch/transient branch.
- **Fix:** Built `delistedInfo` first with the single `is_delisted: true` literal, then referenced `is_delisted: delistedInfo.is_delisted` in the metadata store payload. Same runtime behavior (both persisted store and pushed GameInfo carry the verdict), single textual literal, still only inside the `success === false` branch.
- **Files modified:** src/backend/storeManagers/steam/games.ts
- **Commit:** ac510f3c

## Verification Results

- `pnpm codecheck` (tsc --noEmit) exits 0 after each task.
- `grep "success === false"` and `grep "is_delisted: false"` confirm the definitive-verdict branch and the clear-on-success path in games.ts.
- `grep -c 'is_delisted: true' games.ts` = 1 (only the delisted branch).
- `grep "cachedMeta?.is_delisted"` confirms the library.ts resync seed.
- `grep "!g.is_delisted"` + `grep "game.is_delisted"` confirm the Console grid filter and activation guard.
- Manual re-UAT deferred to `/gsd:verify-work`: a known-delisted owned game disappears from the Console grid; an offline session does NOT hide otherwise-valid games.

## Threat Model Compliance

- **T-08-06 (false hide / DoS):** mitigated — flag set only on explicit `success === false`; transient/offline paths never set it; success path clears a stale flag.
- **T-08-07 (delisted activation):** mitigated — delisted games are both filtered from the grid AND blocked in `activateGame`.
- **T-08-SC (supply chain):** accept — zero new packages; edits touch only existing backend/frontend/type files.

No new security surface introduced beyond the plan's threat model.

## Known Stubs

None. All added fields are wired to real data sources (appdetails verdict → metadata store → library → Console grid + activation guard).
