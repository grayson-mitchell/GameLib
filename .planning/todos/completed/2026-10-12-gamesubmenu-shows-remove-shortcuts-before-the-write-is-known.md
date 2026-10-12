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

## Fix (2026-10-12, quick 261012-ca6)

**Decision.** Option 1 combined with option 2: `addShortcut` and `removeShortcut` are now
invoke-kind and each resolves the `shortcutsExists` predicate, evaluated in the sidecar AFTER the
work has settled. Option 2 alone (re-query from the renderer) cannot work with a send-kind channel:
the transport resolves a send once the Rust shell has accepted the frame and the sidecar runs
listeners fire-and-forget, so nothing in the renderer can observe when the write finished. Option 3
(a pushed outcome event) needs a new frontend message, appName/runner filtering and a
subscribe/unsubscribe lifecycle, all to rebuild a reply that invoke already provides. The return
value is "do shortcuts exist now", not "did the call succeed": a partial add shows "Remove
shortcuts" because a removable shortcut exists, and an add that wrote nothing does not flip.

**Fix.** Two commits.

- `f36b7e64f` (tracer): `src/common/types/ipc.ts` (both channels move to `AsyncIPCFunctions`,
  `Promise<boolean>`), `src/preload/api/menu.ts` (`makeHandlerInvoker`),
  `src/backend/sidecar/shortcutsFlowRegistration.ts` (invoke handlers, shared
  `shortcutsExistOnDisk`, toast chosen from the outcome), `src/backend/shortcuts/ipc_handler.ts`
  (the Electron-era copy, kept typechecking), the new
  `src/frontend/screens/Game/GameSubMenu/shortcutsToggle.ts` (state set from `result === true`,
  unchanged on rejection, busy released in `finally`), `GameSubMenu/index.tsx` (`handleShortcuts`
  delegates, spinner while busy), and the four pins that count kinds
  (`shortcutsFlows`, `runnerSliceRegistration`, `flowRegistrationCensus`,
  `invokeReturnValueSweep`).
- `2716f525e`: `src/backend/shortcuts/shortcuts/shortcuts.ts` (`removeShortcuts` awaits
  `fs/promises` `unlink`/`rm`, ENOENT counts as removed, other failures go to `logError` and are not
  rethrown), `shortcutsFlowRegistration.ts` (the removal toast only when nothing remains, else the
  new `box.shortcuts.error-remove`), `public/locales/en/translation.json` (en only, as for
  `box.shortcuts.error`), plus tests. The never-reject contract protects the four uninstall callers
  that await `removeShortcuts` (gog, legendary, nile, zoom) and the one that does not (sideload).

**Tests.** RED first. Task 1: `shortcutsToggle` failed to load (module missing), and
`shortcutsFlows` had 7 failures besides the known containment one (2 registration-kind, 5 outcome).
Task 2: `removeShortcutsOutcome` 3 failed / 1 passed (the ENOENT case already held), and 2 new
`shortcutsFlows` toast cases failed. GREEN, local (Windows): `shortcutsToggle` 9/9,
`removeShortcutsOutcome` 4/4, `addShortcutsOutcome` 4/4, `shortcutsExistsFallback` 6/6,
`runnerSliceRegistration` 95/95, `flowRegistrationCensus` 72/72, `invokeReturnValueSweep` 7/7.
`shortcutsFlows`: 30 passed / 1 failed (the known OneDrive containment test) / 4 skipped, six
`261012-ca6` cases among the passes. Describe 5 of `shortcutsFlows` is darwin-only and was NOT run
on this box; only its invocation changed (it now awaits the invoke handler), and `pnpm codecheck`
is the only local check of that edit. `pnpm codecheck` exits 0, `pnpm lint` PASS on both ceilings,
scoped eslint and `prettier --check` clean.

**Not exercised (operator-only).** A live click in the running app; the busy spinner's render; the
toasts' render; the invoke-bound (60 s) rejection path in a real shell.

**Side finding.** The pre-existing `260905-mv5 (no regression)` test created
`%USERPROFILE%\OneDrive\Desktop\260905-mv5 Site 4 No-Regression Game.lnk`, an empty directory dated
2026-10-08, on the operator's real Desktop. It now runs under the containment home. The leaked
directory itself was left for the operator to delete.

**Stale docs, not edited.** `.planning/IPC-PORT-INVENTORY.md` and `34.5-PORTED-CHANNELS.md` still
list the two channels as send-kind. They are historical records.

**CLOSED 2026-10-12 (quick 261012-ca6):** the menu entry flips only from the sidecar's disk answer.
A failed add leaves it reading "Add shortcut", proven by the helper test and by the handler
resolving false; the real Desktop has no `261012-ca6` entry after the runs.

## Merge note (2026-10-12)

Quick `261012-f05` landed the same fix independently in a second session on this branch
(`48cb42c3a` backend/transport, `d7a5da8e6` renderer) with a resolve-the-call-outcome contract and
a `GameSubMenu/shortcutToggle.ts` helper. At merge the `261012-ca6` implementation above was kept
(disk-truth `shortcutsExists` return, busy state) and f05's two files were removed; f05's commits
remain in history. Its summary lives under `.planning/quick/261012-f05-*/`.
