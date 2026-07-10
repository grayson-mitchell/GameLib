---
quick_id: 260711-aus
slug: steam-empty-library-and-sync-indicator
date: 2026-07-11
type: quick
---

# Fix: Steam in empty-library message + background metadata sync indicator

Two Steam library UX gaps found during Phase 17 UAT.

## Issue 1 — empty-library message omits Steam (message + trigger)

`EmptyLibrary/index.tsx` + `public/locales/en/translation.json`:
- The "your library is empty, log in with your Epic, GOG.com, or Amazon
  accounts" message didn't mention **Steam** (or Zoom).
- The trigger that distinguishes "truly empty (log in)" from "filters produced
  no results" summed epic+gog+amazon+zoom+sideloaded but **not steam** — so a
  Steam-only user wrongly saw the "log in" message.

Fix: add Steam to the message (locale string, which is the displayed text, and
the JSX default) and include `steam?.library.length` in the trigger sum.

## Issue 2 — no indicator while artwork/metadata streams in

The existing `steamSyncSpinner` in `LibraryHeader` was tied to `refreshing`,
which only covers the library-*list* fetch. Per-game metadata/art
(`fetchMetadataIfNeeded`) streams afterward (throttled 5-at-a-time, 260711-alc)
with no indicator, so a cold cache looks idle while art slowly loads.

Fix (mirrors the `humbleSyncProgress` / `steamBottleSetupRequired` push pattern):
- Backend `games.ts` emits `steamMetadataSyncing {syncing}` on the empty↔
  non-empty transitions of `pendingFetches`.
- `ipc.ts` + `preload/api/steam.ts`: declare the channel + listener slot.
- `GlobalState` subscribes → `steamMetadataSyncing` context flag
  (`types.ts` + `ContextProvider` defaults).
- `LibraryHeader`: `isSteamSyncing = (refreshing && background) || steamMetadataSyncing`.

## Verification

- `npm run codecheck` 0, eslint 0 errors, full suite 915/915.
- Updated 3 `games.test.ts` assertions (`not.toHaveBeenCalled()` →
  `not.toHaveBeenCalledWith('pushGameToLibrary', …)`) since the sync signals now
  fire; the "no game pushed" intent is preserved.
- Runtime re-check pending in the running dev app.
