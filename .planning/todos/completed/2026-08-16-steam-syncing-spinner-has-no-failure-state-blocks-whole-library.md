---
created: 2026-08-16T11:20:00.000Z
title: "\"Syncing your Steam library…\" spinner has no failure state and blocks the WHOLE library (other runners' games included)"
area: steam
severity: high
found_by: "Phase 34.14 D-08 UAT, Run 2 setup (operator observation, 2026-08-16)"
resolved: 2026-08-16
resolved_by: "Phase 34.15 -- steam-platform-signal-and-sync-integrity (VERIFICATION.md status: passed, 16/16; D-16 human UAT gate PASSED 4/2/0 on both runtimes)"
files:
  - src/frontend/screens/Library/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src/backend/storeManagers/steam/library.ts
---

## Problem

When the Steam client cannot reach the network, the centred **"Syncing your Steam library…"**
overlay renders **forever**, and it visually blocks the entire library view — including games
from other runners. Reproduced live: with `api.steampowered.com` blocked via `/etc/hosts`, the
operator saw an endless centre-screen spinner and **could not see the 6 GOG games that should
have been listed**.

Two distinct defects, both pre-existing (neither file is touched by Phase 34.14; the overlay
block dates to `8f2973b1b feat(02-04)`):

**1. No terminal/failure state.** The guard is:

```tsx
{steam?.username &&
  steam?.library?.length === 0 &&
  refreshingInTheBackground && (
    <UpdateComponent message={t('steam.syncing', 'Syncing your Steam library…')} />
  )}
```
(`src/frontend/screens/Library/index.tsx:1013-1019`)

`refreshingInTheBackground` defaults to `true` (`GlobalState.tsx:295`) and `steam.library` starts
`[]`, so the overlay renders immediately at mount and clears **only** by the library populating.
There is no failure branch, no timeout, and no error surface. Backend logs
`Steam client not ready, skipping library refresh` (`library.ts:670`) and gives up — but nothing
propagates that to the UI, so the spinner spins with no error shown.

**This is the sibling of an already-fixed bug.** `GlobalState.tsx:1508-1515` documents the
`debug/steam-refresh-hung-on-startup` session, where the spinner "spun forever with no errors,
since nothing was ever running to clear it." That fix ensured `SteamLibraryManager.refresh()`
actually RUNS on a Steam-only login. It did not add a terminal state for the case where refresh
runs and then FAILS. Same visible symptom, different cause, still unfixed.

**2. A Steam-only failure takes down the whole library UI.** The overlay is not scoped to the
Steam section. `libraryToShow` legitimately contained 6 GOG games, but the centred
`UpdateComponent` obscured them. A single runner being unreachable must not hide other runners'
games.

## Related (separate, already-deferred)

The empty-Steam-library half is the known deferred item: Steam rebuilds from `[]` via async
per-game `pushGameToLibrary` IPC events instead of hydrating synchronously from its local cache
the way Epic/GOG/Amazon/Zoom do. Blocked on `steam_library` not being in the renderer
store-security allowlists (`storePolicy.ts`, `handlers.ts`); folded into the Phase 35 IPC-port
slices. See `.planning/debug/resolved/login-logout-wipes-library.md`.

That deferred item predicted "Steam trickles in from zero". It did NOT predict the permanent
overlay or the collateral hiding of other runners — those are this todo.

## How to fix

- Give the spinner a terminal state: clear it on refresh failure, and surface the actual error
  (the backend already knows — `library.ts:670` logs `Steam client not ready`). A spinner with no
  timeout and no failure branch is a hang by construction.
- Scope the overlay to the Steam section only, so an unreachable Steam never hides GOG/Epic/
  Amazon/Zoom games that loaded fine.
- Add a regression test for the failure path specifically. The existing coverage proves the
  spinner appears and that it clears on success; the uncovered case is refresh RUNNING and
  FAILING — exactly the gap that let the sibling bug recur in a new form.
