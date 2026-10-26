---
created: 2026-10-27
title: "Bridge launch's wait-for-Steam retry is unverified on a live Mac"
severity: medium
platform: macos
ready: live-gate
area: steam-bridge
found_by: "quick 261027-aue execution, 2026-10-27"
files:
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/games.ts
  - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
---

## Problem

Quick `261027-aue` makes a bridge launch wait, within a bound, for Mac Steam to start and sign in. It starts Steam and spawns a fresh helper every 3 s for up to 60 s. Only unit tests cover it so far, and the 60 s budget is a guess, not a measurement.

## Live gate

Restart `tauri dev` first, because it does not rebuild the sidecar (check the `sidecar.js` mtime). Then:

1. Quit Steam and press Play on a bridge game. Steam opens, the "Waiting for Steam" toast shows, and the game launches once Steam signs in. `gamelib.log` shows several `InitFlat failed ... Could not determine Steam client install directory` attempts, then `ConnectToGlobalUser failed` attempts, then `READY init=ok`.
2. Start Steam and press Play straight away. The game launches after sign-in.
3. Leave Steam at its login window for over a minute and press Play. The dialog shows the not-signed-in copy with no bottled-Steam button, and a second Play still goes through the bridge.

Record the measured seconds from cold start to `READY init=ok`, to confirm or retune `STEAM_WAIT_BUDGET_MS`.

## Live result, 2026-10-27 (appId 1363080)

- Check 1 **passed**. With Steam quit, Play opened Steam and the game launched. `gamelib.log` shows `Could not determine Steam client install directory` at 12:30:42, `ConnectToGlobalUser failed` at 12:30:45 and `READY init=ok` at 12:30:48. A cold start took **~7 s** from Play to ready, well inside the 60 s `STEAM_WAIT_BUDGET_MS`, so the budget stays as it is.
- Check 2 **passed**. The Play button greyed out, then the game launched once Steam was up. The log shows one `ConnectToGlobalUser failed` at 12:33:55, then `init=ok` 3 s later.
- Check 3 **not exercised**. Steam signed the saved account in by itself, so the game launched and the timeout branch never ran.

## Check 3, re-run 2026-10-27

Check 3 **passed**. Steam was left at its login window, then Play was pressed. A fresh helper was spawned every 3 s, each refused with `ConnectToGlobalUser failed`, from 12:37:41. At 12:38:42 the log shows `gave up waiting for Steam for appId 1363080 (steam-not-signed-in) after 60693ms`. The dialog read "Steam is open but not signed in…" with only a Cancel button and no bottled-Steam fallback. After signing in, a second Play gave `READY init=ok` at 12:40:24 and the log shows `launching appId 1363080 via the Steam bridge`, so the earlier timeout did not stop the second Play from using the bridge.

## Resolution

All three live checks passed on 2026-10-27, and quick `261027-aue` is live-verified. The cold start took ~7 s against the 60 s budget, so no retune is needed.
