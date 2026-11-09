---
spike: 067
name: steamclient-uninstallapp
type: standard
validates: "Given an app installed in running native Mac Steam, when a separate process calls IClientAppManager::UninstallApp(appId), then Steam removes it completely with no window or confirmation dialog, and a signed-out Steam returns an explicit error instead of dropping the request"
verdict: VALIDATED
related: [065, 066]
tags: [steam, macos, uninstall, steamclient, iclientappmanager, ipc, no-ui, signed-out]
---

# Spike 067: Headless uninstall through IClientAppManager::UninstallApp

## What This Validates

**Given** an app installed in the running native Mac Steam, **when** a separate native process
calls `IClientAppManager::UninstallApp(appId)`, **then** Steam removes the app completely, with
no window and no confirmation dialog. **And** a signed-out Steam returns an explicit error
instead of silently dropping the request, which is what `steam://uninstall` does
(`.planning/todos/completed/2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md`).

Input to `.planning/todos/pending/2026-11-05-gamelib-native-steam-game-delete.md`.

## Research

Same steamclient build as 065/066 (`steamclient.dylib` mtime 2026-10-22 11:15, 52628544 B), so
066's `slotmap.txt` applies. `UninstallApp` is slot 1. Its proxy's IPC function-ID high half is
`0x4505`, matching the dump's `UninstallApp` (`0x4505e2ec` in the dump, `0x4505e2cd` in this
build). It takes one serialized arg, `bytes4` (appId), and is marked
`cannotcallincrossprocess: 0`.

## How to Run

```bash
clang -arch arm64 -o /tmp/probe067 probe.c
/tmp/probe067 state 264160
/tmp/probe067 uninstall 264160
```

## Investigation Trail

All on 2026-11-06 (UTC; content-log times are local, +13h). WazHack 264160, 171 files, 112 MB,
plus Workshop content.

1. **Signed-out arm (Steam at its login screen).** `GetNumInstalledApps` 0, WazHack state 1,
   even though its files and ACF were on disk. Pipe and user still connect.
   `UninstallApp(264160)` at 06:08:36 → **18 `k_EAppErrorNotInstalled`**, returned
   synchronously. After 10 s: all 171 files and the ACF are still present, and there are no
   content-log lines. Nothing was deleted and the request was not queued.
2. Operator signed in. WazHack state 4, 14 installed.
3. **Signed-in arm.** `UninstallApp(264160)` at 06:57:54 → **0**. At +1 s: state 1, 13
   installed, `common/WazHack` directory gone (0 files), `appmanifest_264160.acf` gone,
   `workshop/content/264160` and `workshop/appworkshop_264160.acf` gone. Content log
   (`content_log_uninstall.txt`):
   `state changed : Update Required,Fully Installed,Files Missing,Uninstalling,` →
   `Uninstalled,` → `finished uninstall (No Error)`, all within the same second. No
   `shadercache/` or `compatdata/` entry existed for this app before or after.
4. Operator observed: no window and no confirmation dialog. Probably no toast (operator was not
   watching closely). WazHack shows as not installed in Steam's library.

## Results

**VALIDATED (macOS, n=1).** `UninstallApp` is the silent counterpart of `InstallApp`. Steam
deletes the install folder, the ACF and the Workshop content and updates its own in-memory state
in under a second, with no UI and no confirmation. The "running Steam still has it loaded"
question in the delete todo goes away, because Steam does the removal itself.

A signed-out Steam answers **18 synchronously** and touches nothing. GameLib can turn that into
a clear "sign in to Steam" (or its own file delete) instead of sitting on Uninstalling.

Signal for the build:

- **No confirmation from Steam.** GameLib's uninstall dialog is now the only confirmation, so it
  must name the game and the size, and refuse while the game is running. `ShutdownApp` is
  available but untested.
- **Error 18 is ambiguous.** It covers both "signed out" and "genuinely not installed". To tell
  them apart, check `GetNumInstalledApps` (0 while signed out) or `GetAppInstallState` first.
- **Cloud saves are untouched**, as with any Steam uninstall.
- Same fragility as 065/066: verify slots at runtime and fall back to `steam://uninstall` or
  GameLib's own delete.
- Not tested: an app that is running, Proton/compatdata cleanup (Linux), non-default library
  folders, an install GameLib downloaded that Steam never adopted (expect 18; GameLib's existing
  `uninstallUnadoptedMacNativeDirectly` covers that case), Windows/Linux.
