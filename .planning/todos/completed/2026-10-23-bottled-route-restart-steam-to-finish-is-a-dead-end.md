---
created: 2026-10-23
title: "Bottled route: \"Restart Steam to finish\" is a dead end (disabled button, no way to start bottled Steam)"
source: phase 51-28 live gate item 17 (XCOM, 200510, bottled Steam)
area: steam-bottle
files:
  - src/backend/storeManagers/steam/games.ts
severity: major
platform: macos
ready: code
---

After a GameLib-direct download into the GameLibSteam bottle fails closed to StateFlags=1026 (see `2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md`), the tile shows "Restart Steam to finish" as a disabled button. Bottled Steam was not running, and nothing in the app starts it, so the manifest is never adopted. The operator had to start it by hand with `wine --bottle GameLibSteam steam.exe steam://install/<appId>`; bottled Steam then adopted and repaired the files and polling flipped to installed (20:42:29).

Fix direction: when the state is 1026 on the bottled route and bottled Steam is not running, make the button actionable (start bottled Steam with `steam://install/<appId>`), or start it automatically. Either way, say what is happening instead of leaving a disabled control.

## Closed 2026-10-24: bottled 1026 handoff now has a Start Steam to finish button

Root cause: the disabled "Restart Steam to finish" state waited passively for the user to restart Steam so it would adopt GameLib's manifest. That works natively. The bottle route has no user-visible Steam, so nothing ever started the bottled client and the state never ended.

What changed (quick 261024-h5y): a bottle-source `isNativeHandoff` poll at StateFlags 1026 now emits `steam-waiting-for-bottled-steam`, and the game page shows an enabled "Start Steam to finish" button. Clicking it calls the new `steamFinishBottledInstall` IPC. That is guarded (it refuses unless an active bottle handoff poll sits at 1026), single-flight per appId, and dispatches through the existing `tellBottledSteamToInstall`. After a successful dispatch the context becomes `steam-finishing-in-bottled-steam`, the label reads "Show Steam", and a further click re-sends `steam://install` to the running bottled client, which raises its window. The native route keeps the passive, disabled "Restart Steam to finish".

Why a button and not an auto-start: GameLib never auto-drives Steam, and starting a Wine Steam client can self-update or ask for a login. That should follow a user click, not a poll tick.

Live verification on the Mac (XCOM 200510 bottled, cold and with bottled Steam already running) is still owed.
