---
created: 2026-11-10T13:00:00.000Z
title: "installGame push guard uses a stale status snapshot; showInstallModal, wineVersions and error are never read"
area: frontend-state
files:
  - src/frontend/state/initStateSubscriptions.ts (handleInstallGame, LIBRARY_STATUS_AT_REGISTRATION)
  - src/frontend/state/uiState.ts (showInstallModal, wineVersions, error)
severity: minor
platform: any
ready: code
---

## Problem

Found while moving the UI slice out of GlobalState in Phase 69-06. All three are preserved unchanged there (no behaviour change).

1. The `handleInstallGame` push handler filters `libraryStatus` for an "already installing" game, but the class captured `libraryStatus` once at componentDidMount, which is always the initial `[]`. The guard therefore never fires and an install push always opens the modal. The handler now closes over the constant `LIBRARY_STATUS_AT_REGISTRATION`.
2. `showInstallModal` is written by that handler but no component reads it; it is not in `ContextType`.
3. `wineVersions` and `error` were class state fields that no consumer read.

## Solution

Read the current game status at event time from the library/downloads store once those slices exist (Phase 69 later waves), then either wire `showInstallModal` to a consumer or delete it together with the push handler, and delete `wineVersions` and `error` if still unread.
