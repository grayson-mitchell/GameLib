---
created: 2026-10-12T00:00:00.000Z
title: "GameSubMenu shows Remove shortcuts before the write is known — addShortcut is send-kind with no reply, corrected only on remount"
area: shortcuts
severity: minor
platform: any
ready: code
found_by: "Carried from the 2026-10-05 Windows shortcuts todo (Progress note and quick 261012-9aa Live gate); filed by quick 261012-9t1"
files:
  - src/frontend/screens/Game/GameSubMenu/index.tsx:208-216
  - src/frontend/screens/Game/GameSubMenu/index.tsx:366-369
  - src/preload/api/menu.ts:3-4
  - src/common/types/ipc.ts:122-123
  - src/backend/sidecar/shortcutsFlowRegistration.ts:219-261
---

## Problem

`handleShortcuts()` in `GameSubMenu` calls the send-kind `window.api.addShortcut(appName, runner,
true)` and then `setHasShortcuts(true)` unconditionally, before any outcome is known. The remove
branch (`removeShortcut` followed by `setHasShortcuts(false)`) is symmetric. Both channels are
send-kind (`makeListenerCaller`, typed `=> void`), and the sidecar listener only shows
`box.shortcuts.error` on failure; it sends nothing back to the renderer. The state is corrected only
by `window.api.shortcutsExists(...)` when the menu (re)mounts.

## Failure scenario

The write fails on any OS, for example a deny-write Desktop on Windows or a missing `~/Desktop` on
Linux. The user sees the `box.shortcuts.error` toast, but the menu already says "Remove shortcuts"
until the page remounts and `shortcutsExists` re-reads the disk. A second click then runs the
remove path against shortcuts that were never written.

## Suggested fix

Options, no decision taken:

- Make `addShortcut` and `removeShortcut` invoke-kind and return the outcome, flipping
  `hasShortcuts` only on success.
- Re-query `shortcutsExists` after the call settles, and set the state from that answer.
- Push an outcome event from the sidecar that the submenu listens for.

## Provenance

Line numbers as of the HEAD of quick 261012-9t1. Found by reading the code while closing the
Windows shortcuts todo; no live run was made, and the failure path itself was exercised only
through the sidecar's own result (`{ ok: false }` and the toast mapping), never through the
renderer.
