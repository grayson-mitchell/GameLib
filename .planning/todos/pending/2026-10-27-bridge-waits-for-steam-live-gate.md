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
