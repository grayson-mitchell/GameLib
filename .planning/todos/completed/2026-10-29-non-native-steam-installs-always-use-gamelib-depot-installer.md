---
created: 2026-10-29
title: "Non-native Steam installs always use GameLib's own depot installer and finish without bottled Steam (drop the toggle-OFF dispatch and the Start Steam to finish handoff)"
area: steam-install
severity: medium
platform: macos
ready: live-gate
found_by: "operator request 2026-10-29"
status: "RESOLVED 2026-10-30 by quick 261030-o77 (cb97d3d45, 43384ffa7, 9f12d0a5c). Both live gates passed: WazHack forced-Windows and Fallout 2 installed and launched through the bottle with no finish handoff."
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/nativeInstallSetting.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/screens/Library/components/InstallModal/index.tsx
  - src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx
  - src/backend/storeManagers/steam/bottledHandoff.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/common/types/ipc.ts
  - src/preload/api/steam.ts
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/hooks/constants.ts
  - public/locales/en/gamelib.json
---

## Problem

A title with no usable macOS build takes the `routeThroughBottle` branch of `SteamGame.install()`
(`src/backend/storeManagers/steam/games.ts`, around line 1868). There the
`enableSteamNativeInstall` toggle picks between two paths:

- ON (the default since quick 261024-exo): `installBottleNative()`. GameLib depot-downloads the
  Windows depot into the bottle's `steamapps/` itself.
- OFF: `tellBottledSteamToInstall()` dispatches the download to the bottled Windows Steam client,
  then starts a bottle ACF poller.

The OFF arm doesn't work. You can't download with Steam here. The bottled client doesn't complete
the download, so a user who turned the toggle off gets an install that never lands.

The toggle was written as the D-13 safety valve, with `steam://install` as the fallback. That only
makes sense for titles a Steam client can actually install. For non-native titles there is no
working fallback, so the toggle shouldn't apply to them.

## Proposed shape

1. In the `routeThroughBottle` branch, always call `installBottleNative()`. Remove the
   `isSteamNativeInstallEnabled()` check there. Keep the D-17 `markForcedWindowsViaBottle` handling
   exactly as it is on the native arm.
2. Step 1 leaves the toggle-OFF fallthrough in that branch unreachable, so delete it. In
   `games.ts`, around lines 1894-1934, it runs from the "delegating install ... via the bottled
   Steam client" log to `return { status: 'done' }`. It covers:
   - the `tellBottledSteamToInstall(this.appId)` call
   - the WR-01 error return
   - the duplicate `markForcedWindowsViaBottle`
   - `startInstallPolling(this.appId, { source: 'bottle', delegatedToSteamClient: true })`

   Then drop the `tellBottledSteamToInstall` import from `games.ts` if nothing else in the file
   uses it.
   - Do **not** delete `tellBottledSteamToInstall()` itself (`bottle.ts:1157`).
     `bottledHandoff.ts` still calls it for the user-clicked "Start Steam to finish installing"
     action on an install parked at StateFlags 1026.
   - Step 3 then removes that last caller.
   - Guided setup, launch and uninstall keep their own bottled-Steam mechanisms, so leave those
     alone.
3. Remove the bottled-Steam "Start Steam to finish" handoff (quick 261024-h5y). Today
   `installBottleNative()` doesn't finish the install itself.
   - It finishes the way every depot install does in `installDepotDownload()` (`games.ts`, around
     lines 3064-3090). It writes the ACF at StateFlags 1026 and starts a poller with
     `source: 'bottle', isNativeHandoff: true`.
   - `library.ts` (around lines 3046-3057) sees 1026 on a bottle-source poll and sets
     `awaitingBottledSteam`. The game then sits "installing" with a "Start Steam to finish"
     button until bottled Steam adopts the manifest (1026 -> 4).
   - That adoption is a Steam-client step, and the operator's position is that Steam can't do it
     here. So removing the button isn't enough: the bottle route has to reach "installed"
     without bottled Steam.

   **Decide first.** How does a bottle-native install become installed?
   - Candidate A: write the ACF straight to StateFlags 4 (fully installed) on the bottle route,
     instead of the 1026 handoff value.
   - Candidate B: treat files-on-disk as installed, the way the bridge route already does (see
     the "Finding #10" comment above `installBridgeGame`).
   - Either way, check what launch and uninstall for a bottle title expect. If launch still goes
     through bottled Steam (`steam://rungameid` in the bottle), an un-adopted manifest may not
     launch. Measure that before you choose.

   Then delete:
   - `src/backend/storeManagers/steam/bottledHandoff.ts` (`startBottledSteamToFinishInstall`).
   - The `steamFinishBottledInstall` IPC: its registration in `steamAuthFlowRegistration.ts`
     (around line 369, plus the doc line around 69), `src/common/types/ipc.ts:370` and
     `src/preload/api/steam.ts:33`.
   - In `library.ts`: the `awaitingBottledSteam` / `bottledSteamDispatched` poll fields,
     `isAwaitingBottledSteamAdoption()`, `markBottledSteamDispatched()`, the
     `steam-waiting-for-bottled-steam` / `steam-finishing-in-bottled-steam` status contexts, and
     the `finishInstall.notify` notification.
   - In the frontend: `bottledHandoffContext` in `MainButton.tsx` (around lines 55-63, 77,
     199-206, 348-349 and 414), the matching branches in `GameStatus.tsx` (around lines 166-183)
     and `src/frontend/hooks/constants.ts` (around lines 39-44).
   - The `gamelib:steam.bottle.finishInstall.*` keys in `public/locales/en/gamelib.json`, under
     the D-09 key-presence rule. Run `lint-translations`.
   - `tellBottledSteamToInstall()` itself (`bottle.ts:1157`), if no caller is left.
   - Tests for all of the above.

   Watch out for the native Mac route. It keeps its own 1026 "Restart Steam" handoff
   (`steam-waiting-for-restart`, plus the deferred poll in `runNativeDepotDownload`). That is
   real Mac Steam adopting a Mac-native title, and it's out of scope. Only the bottle-source arm
   goes.
4. The bridge route (`installBridgeGame`) also downloads Windows depots. Confirm it never falls
   back to a Steam-client download when the toggle is off, and apply the same rule if it does.
5. Narrow the toggle's scope to mac-native titles, where `steam://install` is a real path.
   - Update the doc comment in `nativeInstallSetting.ts`.
   - Update the IPC gates that return `[]` when the setting is off
     (`installFlowRegistration.ts:268`, plus the handlers `InstallModal/index.tsx:415-444` relies
     on). A non-native install still needs library targets and depot selection with the toggle
     off.
   - Update the settings copy in `EnableSteamNativeInstall.tsx` so it says the toggle only affects
     titles that Steam itself can install.
6. Tests: with the toggle off, a bottle-eligible title goes to `installBottleNative()` and never
   to `tellBottledSteamToInstall()`. A mac-native title with the toggle off still goes to
   `steam://install`. A bottle-native install that completes reaches installed with no 1026 wait
   and no handoff button.

## Relation to other work

- This doesn't conflict with
  `2026-10-26-route-steam-installs-by-platform-and-protect-authenticated-logons.md`. That todo
  sends mac-native titles to `steam://install` and leaves Windows-only titles on the native depot
  path. This todo makes that second half unconditional.
- It matches the memory rule that bottled Steam is a narrow fallback to eliminate, not a download
  path to keep.

## Triage

- `medium`: a real defect with a bounded blast radius.
  - The toggle-OFF arm only bites when someone has turned the toggle off.
  - The handoff arm bites on every bottle-native install, but the "Start Steam to finish" button
    is the existing workaround.
- `platform: macos`: the bottle route and CrossOver live on the operator's Mac.
- `ready: live-gate`: steps 1, 2, 4 and 5 are desk work. Step 3's decision (how a bottle install
  becomes installed and launchable without bottled Steam adopting it) has to be measured with a
  real bottle install and launch.

## Status (2026-10-30, quick 261030-o77)

Desk work for steps 1-6 landed in `cb97d3d45`, `43384ffa7` and `9f12d0a5c`.

Step 3 was decided by the operator as "mark resumable":

- A verified download writes StateFlags 4 and is installed (the existing `canWriteFullOwnership`
  fast path).
- A bottle-source 1026 fallback now marks the install incomplete and resumable instead of waiting
  on bottled Steam. Resume re-runs GameLib's own depot installer.

Two live gates are still open, which is why this todo stays `ready: live-gate`:

1. A real bottle-route install on the Mac reaches installed with no "Start Steam to finish"
   button. A forced 1026 fallback shows Resume.
2. Bottled Steam launches a GameLib-written StateFlags 4 manifest via `tellBottledSteamToLaunch`
   without its own verify or adoption. If it doesn't, file a launch todo.

Close this todo when both pass.

## Resolved (2026-10-30, operator live test)

Both live gates passed on the operator's Mac:

1. **WazHack (264160), forced to Windows via the bottle:** reached installed with no "Start Steam to
   finish" button.
2. **Launch through bottled Steam:** it launched. The first open took a very long time, but it
   passed.
3. **Fallout 2, a Windows-only title:** installed and launched.

Open observation, not filed: the slow first launch of WazHack in the bottle.
