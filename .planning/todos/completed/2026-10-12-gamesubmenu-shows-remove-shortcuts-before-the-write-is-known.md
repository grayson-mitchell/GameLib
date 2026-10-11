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

## Resolution (2026-10-12, quick 261012-f05)

Option 1 was taken: `addShortcut` and `removeShortcut` are invoke-kind and resolve a `Promise<boolean>`
outcome. Option 2 (re-query `shortcutsExists`) was rejected because a send-kind channel has no
settle signal to key the re-query on. Option 3 was not needed.

What changed. Backend and transport in `48cb42c3a`: both channels moved from `SyncIPCFunctions` to
`AsyncIPCFunctions`, the preload builds them with `makeHandlerInvoker`, and the sidecar registers an
`ipcMain.handle` pair. `addShortcut` resolves `true` after the write and the success toast, and
`false` after `logSendFailure` and the existing `box.shortcuts.error` toast. `removeShortcut`
resolves `true` after the success toast and `false` after `logSendFailure`, with no error toast as
before. Neither rejects. The legacy `backend/shortcuts/ipc_handler.ts` parity copy moved to
`addHandler` with the same contract. Renderer in `d7a5da8e6`: a new `toggleShortcuts` helper awaits
the invoke and calls `setHasShortcuts` only on a strict `=== true`; `GameSubMenu` `handleShortcuts`
delegates to it. A `false`, `null`, `undefined` or rejection leaves the label unchanged.

Pins that moved, each equal to the value derived in the plan once measured from jest Received output:
census shortcuts `{invoke: 6, send: 1}`, invoke-return sweep shortcuts 6 and total 45, runnerSlice
handle 67 and listen 2 (send set is `logoutGOG` and `processShortcut`). Per-module declared counts
are unchanged at 66.

Tests added: handler true and false cases for both channels, real RPC frame cases proving `ok: true`,
an own `result` key and `result` of `true` or `false` for `addShortcut`, and renderer cases for add
and remove success, failure, a non-boolean result, rejection, no early flip, and a source guard on
the call site.

Not verified. No live app run was made. The darwin-only cases in `shortcutsFlows.test.ts` ran on
the executor host, which is macOS, so they are not skipped there; on a non-Mac host they skip. A
transport rejection (the 60 s invoke bound, which these channels deliberately keep, like
`addToSteam`) shows no toast and leaves the label unchanged. If the sidecar write then succeeds late,
the label stays stale until remount. A double click during an in-flight add re-issues the add, which
is idempotent on disk; no busy state was added.
