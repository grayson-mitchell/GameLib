---
quick_id: 260711-aus
slug: steam-empty-library-and-sync-indicator
date: 2026-07-11
status: complete
files_modified:
  - src/frontend/screens/Library/components/EmptyLibrary/index.tsx
  - public/locales/en/translation.json
  - src/common/types/ipc.ts
  - src/preload/api/steam.ts
  - src/backend/storeManagers/steam/games.ts
  - src/frontend/types.ts
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/screens/Library/components/LibraryHeader/index.tsx
  - src/backend/storeManagers/steam/__tests__/games.test.ts
---

# Summary

Two Steam library UX gaps found during Phase 17 UAT.

## Issue 1 — empty-library message

- Added **Steam** (and Zoom) to the "your library is empty, log in with…"
  message — updated both the displayed locale string
  (`emptyLibrary.noGames`) and the JSX `<Trans>` default.
- Included `steam?.library.length` in the empty-vs-no-results trigger sum so a
  Steam-only user no longer wrongly sees the "log in with Epic/GOG/Amazon"
  message.

## Issue 2 — background metadata/art sync indicator

The `steamSyncSpinner` only reflected the library-*list* refresh. Now it also
shows while per-game metadata/art streams in (the long tail on a cold cache).

- `games.ts` `fetchMetadataIfNeeded` emits `steamMetadataSyncing {syncing:true}`
  when `pendingFetches` goes empty→non-empty and `{syncing:false}` when it
  drains back to empty.
- Declared the push channel (`ipc.ts`) + listener slot
  (`preload/api/steam.ts`), mirroring `steamBottleSetupRequired`.
- `GlobalState` subscribes and sets a `steamMetadataSyncing` context flag
  (added to `types.ts` ContextType + `ContextProvider` default; the provider
  already spreads `...this.state`).
- `LibraryHeader`: `isSteamSyncing = (refreshing && refreshingInTheBackground)
  || steamMetadataSyncing`.

## Verification

- `npm run codecheck` 0; eslint 0 errors; full suite **915/915**.
- Updated 3 `games.test.ts` assertions from `sendFrontendMessage.not
  .toHaveBeenCalled()` to `.not.toHaveBeenCalledWith('pushGameToLibrary', …)`,
  since the sync on/off signals now fire in the failure/ambiguous branches; the
  "no game pushed" intent is preserved.
- Runtime re-check pending in the running dev app.

## Notes

- Pre-existing gaps (Phase 2/7 library UX), surfaced by the Phase 17 UAT.
- The indicator is a boolean spinner (reuses the existing `steam.syncing`
  tooltip), not a done/total count — matches the existing UI element.

## Self-Check: PASSED
