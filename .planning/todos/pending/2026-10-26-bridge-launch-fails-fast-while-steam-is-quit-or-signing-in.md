---
created: 2026-10-26
title: "Launching a bridge game while Steam is quit or still signing in fails at once with a misleading \"signed out\" dialog"
source: quick 261026-k6o live gate
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
severity: medium
platform: macos
ready: live-gate
---

During the 261026-k6o live gate, a bridge launch with Mac Steam quit, and another started a second after Steam itself, both failed in under 1 s. The helper's `SteamAPI_InitFlat` returned at once (`Could not determine Steam client install directory` when quit; `ConnectToGlobalUser failed` while signing in), the identity-only (480) fallback failed the same way, and `ensureBridgeHelperReady` reported `not-inited` with "Steam appears signed out". The game did not launch, and the user has to wait and click Play again.

InitFlat fails fast rather than waiting for Steam, so GameLib has to do the waiting. Options (pick at fix time):

- Detect that Steam is not running and start it (`open -a Steam` / `steam://`).
- Retry the helper spawn on a bounded schedule while Steam is starting or signing in.
- Tell "Steam not running" and "Steam starting/signing in" apart from a real signed-out session in the setup dialog's copy.

Any retry must respawn the helper, since InitFlat is called exactly once per helper process.

Verify on a live Mac: quit Steam and launch; start Steam and launch immediately. Both should end in the game launching, or in an accurate message.
