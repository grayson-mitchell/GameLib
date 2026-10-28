---
status: resolved
trigger: "Steam bridge DRM-mode launch fails at bottle-stage for appId 219990: stageDrmBottle's reg add SteamClientDll64 under the DRM runner timed out after 15000 ms"
created: 2026-10-29
updated: 2026-10-29
---

## Symptoms

<!-- DATA_START -->
- expected: Clicking Play on appId 219990 (SteamStub `.bind` exe, routed to steamclient-layer DRM mode, Phase 56) completes drmLaunchSetup (Mac Steam check, CrossOver allowlist, component, runner, Valve client, bottle staging) and launches the game.
- actual: drmLaunchSetup stops at bottle-stage. The first registry write under the DRM runner hangs 15 s and is killed by its deadline; the "This game could not start" dialog is shown (bridge-notice reason=drm-bottle-stage).
- errors (gamelib.log 2026-10-29, verbatim; the file has since rotated twice and these lines no longer exist on disk):
  - 08:48:32 `[Steam] CM logon mode=anonymous reason=launch-target`
  - 08:48:35 `steamclient-layer: steamclient-layer-cx26.3.0.39832 downloaded and verified`
  - 08:48:35 `valve client: using cached 1792618285`
  - 08:48:35 `endPerGameBridgeBottleSession: wineserver -k for bottle "GameLibSteamBridge-219990" (appId 219990)`
  - 08:48:35 `bottle: appId 219990 uses DRM runner crossover-26.3.0.39832`
  - 08:48:35 `stageDrmBottle: appId 219990 restored original x64/steam_api64.dll`
  - 08:48:35 `stageDrmBottle: appId 219990 registry not staged: Software\\Valve\\Steam\\ActiveProcess:SteamClientDll64, Software\\Valve\\Steam\\ActiveProcess:Universe, Software\\Valve\\Steam\\ActiveProcess:SteamPath, Software\\Valve\\Steam:SteamPath`
  - 08:48:35 `Checking if wine version exists: CrossOver 26.3.0.39832 (GameLib DRM runner)`
  - 08:48:35 `Running Wine command: reg add HKCU\Software\Valve\Steam\ActiveProcess /v SteamClientDll64 /t REG_SZ /d C:\Program Files (x86)\Steam\steamclient64.dll /f`
  - 08:48:50 `stageDrmBottle: appId 219990 reg add SteamClientDll64 timed out after 15000 ms`
  - 08:48:50 `stageDrmBottle: appId 219990 bottle processes at timeout: 64706:0.0:wineserver,64704:0.0:winewrapper.exe`
  - 08:48:50 `drm setup: appId 219990 stopped at bottle-stage (bottle-stage): reg add SteamClientDll64 timed out after 15000 ms`
- timeline: First DRM-mode launch of 219990 after a fresh reinstall (uninstall 08:35:12, bottle re-provisioned 08:37:12, install 08:40:11-08:45:54). No log on disk shows bottle-stage ever passing for any appId (older rotated logs grep 0 for stageDrmBottle). Earlier 219990 DRM traces exist under ~/Library/Application Support/gamelib/steam-bridge/drm/trace/ (several runs 2026-10-28/29), so earlier launches got further at some point.
- contrast: At the end of install (08:45:01-08:45:54), in the SAME bottle but under the normal bridge runtime (system CrossOver), ~20 `reg query`/`reg add` commands and the VC++/DirectX installers all completed in 1-2 s each, followed by `endPerGameBridgeBottleSession` (wineserver -k). The hang appears only under the DRM runner clone (crossover-26.3.0.39832).
- reproduction: Click Play on 219990 in GameLib (macOS, Mac Steam running). Restart tauri dev first if backend code changed (sidecar is not rebuilt by tauri dev).
- constraints: No fallback to bottled Steam or the Phase 52 forwarder (D-13; memory: bottled Steam is a narrow fallback). Child spawns follow the two-profile rule (createFakeHomeProfile). Sidecar exit contract: unref timers/children.
- relevant_files:
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
  - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
  - src/backend/storeManagers/steam/bridge/drm/runnerClone.ts
  - src/backend/storeManagers/steam/bottle.ts (getDrmBridgeBottleSettings, endPerGameBridgeBottleSession)
  - src/backend/launcher.ts (runWineCommand)
<!-- DATA_END -->

## Current Focus

- hypothesis: CONFIRMED (partially reproduced): runWineCommand settles on child 'close' (waits for stdout/stderr pipe holders); the wineserver that the reg call itself starts inherits the pipes and outlives reg.exe. stageDrmBottle omits resolveOnExit:true, so the 15 s deadline races wineserver lifetime, not reg.exe. Old candidates:
  1. The first wine start under the cloned runner does a prefix update/wineboot (runner version differs from the bottle's last runner), which blocks or shows UI and outlasts the 15 s reg deadline; only wineserver + winewrapper.exe were alive, no reg.exe.
  2. The cloned runner's wineserver is incompatible with/locked by state left by the system CrossOver session (socket/lock in the bottle or /tmp), so winewrapper waits on the server.
  3. The clone itself is incomplete or mis-signed (macOS Gatekeeper/quarantine stall on first exec of the cloned binaries).
- test: Reproduce the exact reg add by hand under the DRM runner against the bottle with a longer deadline, timing it and capturing wine debug output; compare with the system CrossOver runner.
- expecting: Either it completes slowly (1), never completes with server wait (2), or stalls before wine starts (3).
- next_action: awaiting user decision on fix (pass resolveOnExit:true in stageDrmBottle runReg); no code edited yet

## Evidence

- checked: hand run of DRM-runner bin/wine reg add/query vs bottle (CX_BOTTLE form) via node spawn with pipes
  found: reg.exe 'exit' at ~1.0 s, 'close' at ~4.1-5.2 s (wineserver lingers holding pipes). Once (after back-to-back runs with wineserver -k) a run never exited/closed within 40 s: wineserver + wineboot --init + winedevice.exe (one spinning 100% CPU) stayed alive. Clean runs from zero processes: no hang.
  implication: runWineCommand 'close' is gated on wineserver lifetime; unbounded when wineboot/winedevice are up. Runner works fine (not Gatekeeper, not incompatible).
- checked: launcher.ts runWineCommand + WineCommandArgs.resolveOnExit doc + commit a2f661281
  found: resolveOnExit exists precisely for this (settle on exit + 250 ms drain); only shared-redist calls use it. stageDrmBottle passes wait:false but not resolveOnExit.
  implication: fix is one flag. Failure log had reg.exe absent from process list at timeout (only wineserver + winewrapper.exe) = command done, pipes held.
- checked: standalone reg query after failure: ActiveProcess values already present in user.reg
  found: later run staged them; fresh-bottle first start under new runner is the slow case (prefix init).

## Eliminated

## Resolution

### Fix applied (2026-10-29, operator chose option A + regression test)

- `stageDrmBottle.ts` default `runReg`: `resolveOnExit: true` on `runWineCommand`, so the reg call settles on reg.exe exit (+250 ms drain), not on the pipe close that the fresh wineserver holds open. Same pattern as `a2f661281` (shared redists).
- Regression test in `stageDrmBottle.test.ts`: every default reg call passes `resolveOnExit: true`.
- Checks: jest `steam/bridge/drm` 10 suites / 269 pass (1 skipped); `pnpm codecheck` clean; prettier clean; eslint 0 errors.
- NOT verified live. Needs: restart tauri dev (sidecar is not rebuilt), then Play on 219990.
- The debugger's hand runs already wrote SteamClientDll64/Universe/SteamPath into the bottle's user.reg, so the next launch may skip the reg add entirely (alreadyStaged). A clean live test needs those values removed, or a different SteamStub game.
- Open risk (unexplained): one hand run left wineserver + `wineboot --init` + `winedevice.exe` (~100% CPU) alive >40 s after `wineserver -k` and an immediate restart. If the live retest still stalls, investigate that next.

### Live verification (2026-10-29 10:06, operator, after tauri dev restart)

- Bottle user.reg had the four DRM values removed first (backup `user.reg.pre-drm-retest-20261029-095720`), so staging ran for real: `registry not staged` listed all four.
- All four `reg add` calls settled 10:06:47-10:06:48; `registered ... steamclient64.dll under HKCU ActiveProcess` at 10:06:49 (was: first call timed out after 15000 ms).
- `drm setup: appId 219990 ready`; Grim Dawn started (pid 3169), window raised.
- DRM trace `219990-1793221609270.log`: 36 lines, `role=game`, SteamStub ownership check (GetAppOwnershipTicketData, GetSteamID) then real init (CreateSteamPipe, ConnectToGlobalUser, BIsSubscribedApp, RemoteStorage). Meets the DRM-mode verified criterion (D-56-15/16).
- The wineboot/winedevice race seen once in a hand run did not occur; it stays unexplained.

