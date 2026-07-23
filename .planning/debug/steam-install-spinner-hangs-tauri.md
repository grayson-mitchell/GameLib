---
status: diagnosed
trigger: "Phase 30 UAT Test 4 — under Tauri (npm run tauri:dev), clicking Install on a Steam title: 'nothing happens when click on install other than the spinner appearing'. Expected the native macOS folder picker (dialog_open) to open."
created: 2026-07-23T00:00:00Z
updated: 2026-07-23T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: The Game-Page Steam Install button never opens a folder picker by design (D-04); the install invoke reaches the sidecar (spinner = installing badge), SteamGame.install() returns {status:'error'} on the headless native depot path, and the Phase-30 sidecar `install` bypass emits no terminal gameStatusUpdate for a RETURNED error → badge stuck on 'installing' forever.
test: static trace of React handler → preload invoke → sidecar registration → SteamGame.install → runNativeDepotDownload; config value + pathShim verified on disk.
expecting: confirmed root cause; no fix applied (diagnose-only).
next_action: return ROOT CAUSE FOUND to plan-phase --gaps.

## Symptoms

expected: Under Tauri, clicking Install on a Steam title opens the real macOS native folder picker (dialog_open) so an install target can be chosen; picking a folder starts the install and the button transitions queued → installing → done.
actual: "nothing happens when click on install other than the spinner appearing" — no picker, no modal, no progress, no error toast; button spins indefinitely.
errors: None surfaced to the tester.
reproduction: Phase 30 UAT Test 4. Tauri build, signed in to Steam (377 owned games), library populated, enableSteamNativeInstall true. Click Install on a Steam title.
started: Discovered Phase 30 UAT, 2026-07-23 (Steam install slice ported onto the Tauri sidecar).

## Eliminated

- hypothesis: enableSteamNativeInstall is false, routing to the legacy steam://install branch (debug-context suspect c).
  evidence: `~/Library/Application Support/GameLib/config.json` contains `enableSteamNativeInstall": true`; the sidecar pathShim (src/backend/sidecar/pathShim.ts) resolves userData to the SAME `~/Library/Application Support/GameLib` folder Electron uses, so isSteamNativeInstallEnabled() reads true in the sidecar. The install takes the NATIVE branch (installNative), not steam://.
  timestamp: 2026-07-23T00:00:00Z

- hypothesis: The install path calls the dialog_open / openDialog channel, which silently rejects under Tauri (debug-context suspect a).
  evidence: The Steam install path calls NO dialog at all. GamePage handleInstall (src/frontend/screens/Game/GamePage/index.tsx:673-684, "Steam: bypass install-location modal — delegate straight to SteamGame.install() (D-04)") calls window.api.install({path:''}) directly. The React <select> location picker (SteamInstallLocationPicker.tsx) is a different, non-native modal and only mounts from startSteamInstall when listSteamLibraryTargets() returns >1 library — a code path the Game-Page button never uses. dialog_open/showOpenDialog is grep-absent from steam/games.ts; it serves only the generic WR-01 file-picker call sites (Wine/Proton binary, SideloadDialog, PathSelectionBox), not the Steam install button.
  timestamp: 2026-07-23T00:00:00Z

- hypothesis: install is an unported `send` channel that silently no-ops (family of steam-logon-button-tauri KB match).
  evidence: `install = makeHandlerInvoker('install')` (src/preload/api/downloadmanager.ts:3) — an INVOKE, and it IS registered in the sidecar (installFlowRegistration.ts ipcMain.handle('install', ...)). The spinner appearing (is.installing) is proof the invoke reached the sidecar and the handler pushed queued→installing.
  timestamp: 2026-07-23T00:00:00Z

## Evidence

- timestamp: 2026-07-23T00:00:00Z
  checked: Knowledge base + memory (steam-logon-button-tauri / sidecar-send-channels-fail-silently).
  found: Strong keyword overlap on "Tauri install button unresponsive / spinner / no console output". Tested first — but install is an invoke, not a send, so the exact KB mechanism does not apply. It did correctly point at "sidecar outcome not surfaced to the frontend" as the family.
  implication: Same family (a non-happy-path sidecar outcome that the frontend never sees), different specific channel.

- timestamp: 2026-07-23T00:00:00Z
  checked: src/frontend/screens/Game/GamePage/index.tsx:659-705 (handleInstall).
  found: For runner==='steam' && !is_installed it returns window.api.install({appName, path:'', runner:'steam', ...}) directly — NO listSteamLibraryTargets, NO picker, NO modal (comment: "bypass install-location modal — delegate straight to SteamGame.install() (D-04)").
  implication: The tester's "native folder picker should open" expectation is invalid for this entry point. Picker absence is by design; the real question is what happens to the direct install invoke.

- timestamp: 2026-07-23T00:00:00Z
  checked: src/backend/sidecar/installFlowRegistration.ts (install handler, lines 119-217).
  found: Handler pushes sendGameStatusUpdate 'queued' then 'installing' immediately (→ spinner), then `new SteamGame(appName).install({path:'', ...})`. It emits a terminal 'done' ONLY in the catch (a THROWN error) and in the finally when `deferredToSetup || wasAborted`. A RETURNED `{status:'error'}` logs the error and returns {status:'error'} but pushes NO terminal gameStatusUpdate.
  implication: When SteamGame.install() RETURNS an error (its normal never-throw convention), the frontend badge is left on 'installing' permanently. This is the spinner-forever mechanism.

- timestamp: 2026-07-23T00:00:00Z
  checked: src/backend/storeManagers/steam/games.ts install()/installNative()/runNativeDepotDownload() (678-1265).
  found: Native path first awaits ensureSteamClientReady(appId). If not ready it returns {status:'error', error: clientReady.error ?? 'Steam client not ready for appId X'}. downloadSteamDepots error also returns {status:'error'}. Both are RETURNED, not thrown.
  implication: The returned-error outcome flows straight into the installFlowRegistration gap above → stuck spinner. Progress (sendFrontendMessage('progressUpdate')) is only emitted once the chunk stream starts; a pre-download stall/error shows only the static 'installing' spinner — exactly "nothing happens".

- timestamp: 2026-07-23T00:00:00Z
  checked: src/backend/storeManagers/steam/clientSetup.ts ensureSteamClientReady (92-132).
  found: Returns 'needs-install' when !SteamUser.isSteamClientInstalled(), 'needs-launch' when !hasLibraryFoldersVdf() (reads defaultSteamPath/steamapps/libraryfolders.vdf). Both fire sendFrontendMessage('steamClientSetupRequired', ...) AND return ready:false with error UNDEFINED. runNativeDepotDownload then returns {status:'error', error:'Steam client not ready...'}.
  implication: On a Mac where the NATIVE Steam client is absent or never-launched at defaultSteamPath (this dev primarily uses CrossOver-bottle Steam — see memory steam-two-install-paths), the native depot install returns error before any download, producing the exact stuck-spinner symptom. The steamClientSetupRequired consent dialog it fires may also not be wired/surfaced under Tauri (secondary, unconfirmed).

- timestamp: 2026-07-23T00:00:00Z
  checked: config.json on disk + pathShim.ts.
  found: enableSteamNativeInstall": true; sidecar userData == ~/Library/Application Support/GameLib (same as Electron).
  implication: Native branch is taken; legacy steam:// hypothesis eliminated.

## Resolution

root_cause: |
  Two-part. (1) FRAMING: the UAT premise is wrong — the Game-Page Steam Install button (GamePage/index.tsx:673-684, D-04) calls window.api.install({path:''}) directly and NEVER opens a folder picker (dialog_open) or any modal, so "the native folder picker never opens" is by design, not the bug.

  (2) THE BUG (spinner forever): window.api.install is a registered invoke, so it reaches the Tauri sidecar, whose install handler pushes queued→installing (the spinner) and then calls SteamGame.install({path:''}). enableSteamNativeInstall is true (verified on disk; sidecar reads the same config folder), so this runs the native depot path (installNative → runNativeDepotDownload), whose first await is ensureSteamClientReady(appId). That path RETURNS {status:'error'} (never throws) whenever it cannot proceed headless — most likely ensureSteamClientReady → 'needs-install'/'needs-launch' because the NATIVE macOS Steam client is absent/never-launched at defaultSteamPath (this environment runs Steam via CrossOver bottle), or a headless downloadSteamDepots failure. The Phase-30 sidecar install bypass (installFlowRegistration.ts) emits a terminal gameStatusUpdate('done') ONLY for a THROWN error (catch) or deferredToSetup/wasAborted (finally); it does NOT emit any terminal status for a RETURNED {status:'error'}. So the frontend's is.installing badge is never cleared → the button spins indefinitely with no picker, no progress, no toast. On Electron the same returned-error result is cleared by downloadmanager/utils.ts installQueueElement, which the bypass deliberately does not port — making this a Phase-30 regression in the direct-install bypass.
fix: ""
verification: ""
files_changed: []
