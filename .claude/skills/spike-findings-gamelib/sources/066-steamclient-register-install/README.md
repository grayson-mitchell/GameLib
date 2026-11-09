---
spike: 066
name: steamclient-register-install
type: standard
validates: "Given a complete game on disk plus its appmanifest that the running native Mac Steam has not loaded, when a separate process calls an IClientAppManager method, then Steam registers it as Fully Installed without a restart, a re-download or any Steam window"
verdict: VALIDATED
related: [065]
tags: [steam, macos, install, adoption, acf, steamclient, iclientappmanager, ipc, no-ui, restart-steam-to-finish]
---

# Spike 066: Register an already-downloaded install with running Steam

## What This Validates

**Given** a complete game on disk in `steamapps/common/<installdir>` plus its
`appmanifest_<id>.acf`, which the running native Mac Steam has not loaded (the GameLib-downloader
"Restart Steam to finish" situation), **when** a separate native process calls an
`IClientAppManager` method, **then** Steam registers the game as Fully Installed with no restart,
no re-download and no Steam window.

## Research

Candidates from the OpenSteamClient `IClientAppManagerMap` dump (107 methods), slots resolved
for this build by IPC function-ID high half (`slotmap.txt`, method from spike 065):

| Candidate | Slot | Result |
|---|---|---|
| `RefreshLibraryFolders()` | 83 | ✗ no effect |
| `RecoverAppFromFolder(appId, path)` | 66 | ✗ returns 18 `k_EAppErrorNotInstalled` — repairs a known install only |
| **`InstallApp(appId, 0, false)` with files present** | 0 | **✓ adopts the files** |
| `StartValidatingApp(appId)` | 27 | not tried — needs an app Steam already knows |

`EAppUpdateError` values from OpenSteamClient `include/opensteamworks/AppsCommon.h`.

## How to Run

```bash
clang -arch arm64 -o /tmp/probe066 probe.c
/tmp/probe066 state 264160          # GetAppInstallState + GetNumInstalledApps
/tmp/probe066 refresh               # RefreshLibraryFolders
/tmp/probe066 recover 264160 <dir>  # RecoverAppFromFolder
/tmp/probe066 install 264160 0      # InstallApp
```

Ground-truth setup (no GameLib): quit Steam, move `appmanifest_264160.acf` aside, start Steam
`-silent` (WazHack now state 1), copy the ACF back while Steam runs.

## Investigation Trail

All on 2026-11-03, WazHack 264160 (117 MB, 171 files, originally installed by real Steam).
Times UTC; content-log times are local (+13h).

1. Steam restarted without the ACF: state **1**, 12 installed apps.
2. **Control:** ACF copied back at 07:27:38 with Steam running. 30 s later: still state 1. This
   reproduces the "running client has not re-read the manifest" defect.
3. **`RefreshLibraryFolders`** at 07:28:17: state 1 at +2/+5/+10/+20 s. No effect.
4. **`RecoverAppFromFolder(264160, common/WazHack)`** at 07:29:05: ret 18 (NotInstalled), state 1,
   no content-log lines.
5. **`InstallApp(264160, 0, false)`** at 07:30:11: ret 0. State 268 at +2 s, **4 (Fully
   Installed) at +5 s**, 13 installed apps. `content_log_install.txt`:
   `Validation: full scan … found 171/0 matching files` and
   `Found 171 pre-existing matching files for depot 264162 (117426878 bytes)`. Only the depot
   manifest was fetched, with no chunk downloads for 264162. No game file has an mtime after the
   call. Total time about 2 s. The 5 chunks fetched afterwards are WazHack's Workshop content
   (depot 264160), normal for this app.
6. Operator observed: no Steam window, an "installed" toast, and WazHack shown in the library.

## Results

**VALIDATED (macOS, n=1).** `InstallApp` on an app whose complete files already sit in its
install dir makes the running Steam **adopt** them: it validates against the depot manifest,
finds every file matching, downloads nothing, writes its own ACF and reports Fully Installed. No
restart and no window, just a toast. The one call covers both cases: spike 065's headless fresh
install and registering a GameLib-downloaded install.

Signal for the build:

- **Replaces "Restart Steam to finish."** After GameLib's own depot download, call `InstallApp`.
  Steam re-verifies (fast: one manifest fetch plus hashing local files) and takes ownership.
- **Steam's validation is a second, independent integrity check.** Any file GameLib wrote wrong
  is quietly re-downloaded by Steam instead of leaving StateFlags 1026 (compare the XCOM
  cross-depot collision session).
- `RefreshLibraryFolders` does **not** rescan manifests. `RecoverAppFromFolder` is repair-only.
- Same fragility as 065: resolve slots at runtime by RTTI plus function ID, fall back to the
  current behaviour if verification fails.
- Not tested: the GameLib-downloader-written ACF itself (this used a Steam-written ACF),
  multi-depot or large apps (validation time), install in a non-default library folder (folder
  index ≠ 0), files partly wrong, Windows/Linux.
