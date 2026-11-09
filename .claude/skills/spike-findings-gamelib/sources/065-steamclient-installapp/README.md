---
spike: 065
name: steamclient-installapp
type: standard
validates: "Given the running native macOS Steam client, when a separate native process loads steamclient.dylib, connects to the global user through IClientEngine and calls IClientAppManager::InstallApp(appId), then Steam starts downloading the app with neither its main window nor its install dialog appearing"
verdict: VALIDATED
related: [004c]
tags: [steam, macos, install, steamclient, iclientengine, iclientappmanager, ipc, no-ui]
---

# Spike 065: Headless install through steamclient's IClientAppManager

## What This Validates

**Given** the native macOS Steam client running and signed in, **when** a separate native
process loads `steamclient.dylib`, connects to the global user through
`CLIENTENGINE_INTERFACE_VERSION005` and calls `IClientAppManager::InstallApp(appId, 0, false)`,
**then** Steam starts downloading the app and neither its main window nor its install dialog
appears.

Motivation: with "GameLib as downloader" OFF, every public handoff raises Steam's main window —
`steam://install`, `steam://nav/games/details`, a `-silent` cold start, and Steam hidden in the
menu bar (`.planning/debug/resolved/steam-install-opens-main-window.md`).

## Research

| Approach | Status |
|---|---|
| `steam://install/<id>` (current) | Main window + dialog, every state |
| `steam://nav/games/details/<id>` | Main window, no dialog — worse |
| `-silent` cold start + URL | Main window + dialog |
| `steam://flushconfig` | Clears download cache + restart; not a reload |
| "`\\.\pipe\SteamPipe` RefreshAppInfo 0x10 0x00" (web claim) | No evidence it exists; Windows-only path anyway |
| SteamCMD | Separate client/session; equivalent to GameLib-as-downloader ON |
| **`IClientEngine` → `IClientAppManager::InstallApp`** | **Chosen — tested here** |

Sources: OpenSteamClient (`github.com/OpenSteamClient/OpenSteamClient`, last push 2025-05-01) —
`include/opensteamworks/IClientEngine.h`, `IClientAppManager.h`, and
`dumped_data/IClientAppManagerMap.json`. The dump marks `InstallApp` as
`cannotcallincrossprocess: 0`, i.e. callable over IPC from another process. Strings in this
build's `steamclient.dylib` confirm `IClientAppManager`, `InstallApp`, `CCallInstallAppJob` and
`InstallApp: iLibraryFolderIndex is not set, installing to default folder`.

**Gotcha: the OpenSteamClient vtable order is stale for this Steam build** (steamclient.dylib
mtime 2026-10-22). Both indices it implies were wrong; see the trail.

## How to Run

```bash
clang -arch arm64 -o /tmp/probe probe.c
/tmp/probe attach            # RTTI + read-only calls
/tmp/probe vtable            # dump IClientAppManager slot offsets (→ vtable.jsonl)
/tmp/probe install 440 0     # InstallApp(440, libraryFolder 0, bLegacy false)
```

`getters.c` is the engine-slot RTTI scanner used to locate `GetIClientAppManager`.

## What to Expect

`attach`: `appManager` RTTI `20IClientAppManagerMap`; installed-app count equal to the
`appmanifest_*.acf` count; correct install state/dir for an installed and an uninstalled app.
`install`: `EAppUpdateError 0`; within seconds `steamapps/appmanifest_<id>.acf` and
`steamapps/downloading/<id>/` exist; no Steam window.

## Investigation Trail

1. **Surface exists.** `steamclient.dylib` is universal (arm64 slice), exports only the flat
   `Steam_*` set plus `CreateInterface`, is stripped, and contains
   `CLIENTENGINE_INTERFACE_VERSION005` and `SteamClient006..023`.
2. **Static map search failed.** The dumped function IDs (e.g. InstallApp `0xdd9af109`) are not
   present as data or as `movz/movk` pairs; no data pointer references the `"InstallApp"`
   string. Switched to runtime verification.
3. **Attach works from an unprivileged process.** `CreateInterface("CLIENTENGINE_INTERFACE_VERSION005")`
   returns `12CSteamClient`; `CreateSteamPipe` → 1, `ConnectToGlobalUser` → 1. RTTI
   (vtable[-1] → `type_info` name) confirmed engine slots 8 = `14IClientUserMap` and
   14 = `15IClientUtilsMap`.
4. **Engine slot 45 (header's GetIClientAppManager) returned NULL.** RTTI-scanned getter slots
   only (never calling non-getters): 17 Apps (header 17), 34 ProductBuilder (header 35),
   35 DepotBuilder, 36 NetworkDeviceManager, 37 SystemPerfManager (header 39),
   41 SystemDisplayManager, 47 HTTP (header 49) → two slots removed since the header.
   **Slot 43 = `20IClientAppManagerMap`**, 44 = `21IClientConfigStoreMap`. Slots 42 and 48
   crashed the probe (own process only).
5. **Method order verified by function ID.** Each proxy method loads its IPC function ID with
   `mov w8,#lo; movk w8,#hi,lsl #16` and interface id 17. The low halves differ from the dump
   but the **high 16 bits match**, which identifies each slot: 0 InstallApp (args 4,4,1 bytes —
   matches), 1 UninstallApp, 2 changed (LaunchApp; new ID), 3 ShutdownApp, 4 GetAppInstallState,
   5 GetAppInstallDir, 6–7 as header, **8 is a new method**, 9..23 = header 8..22 shifted +1
   (so GetNumInstalledApps is 15, not 14).
6. **Read-only calls correct** (`attach.jsonl`): GetNumInstalledApps 13 = 13 ACFs on disk;
   440 state 1 (uninstalled), 264160 state 4 (fully installed), install dirs correct.
7. **InstallApp(440, 0, false)** at 2026-11-03T07:17:43Z → `EAppUpdateError 0`
   (`install.jsonl`). Within 5 s `appmanifest_440.acf` (571 B) and `downloading/440/` existed.
   **Operator observed: no main window, no install dialog; TF2 downloading in Steam.**

## Results

**VALIDATED (macOS, n=1).** A separate native process can ask the running, signed-in Mac Steam
client to install an app over its own IPC, and Steam downloads it with **no UI at all** — the
outcome no `steam://` URL or launch flag gives.

Signal for the build:

- **Never hard-code slot indices.** Two of the header's indices were wrong for a one-year-old
  header. Resolve at runtime: find the engine getter by RTTI name (`IClientAppManagerMap`), and
  find `InstallApp` (and any other method) by its proxy's IPC function ID high half / arg shape.
  If verification fails, fall back to `steam://install` — never call an unverified slot.
- **Native helper, not Node.** This must run as native code that `dlopen`s the user's own
  `steamclient.dylib` (nothing Valve-licensed is shipped). The existing bridge helper is the
  natural host.
- **Library folder:** `0` installed to the default folder. A real build should map GameLib's
  chosen library to Steam's folder index.
- **No dialog means no confirmations.** Steam's dialog shows disk space, shortcuts and folder
  choice. GameLib's own install modal has to own those checks.
- **Not tested:** Steam not running (expect `CreateSteamPipe` → 0 → fallback); signed out;
  unowned app or bad appId (error code); Windows `steamclient64.dll` / Linux `steamclient.so`
  (same interface names expected, layout must be verified the same way); x86_64 slice; after a
  Steam client update (the runtime-verification step is what protects that).
