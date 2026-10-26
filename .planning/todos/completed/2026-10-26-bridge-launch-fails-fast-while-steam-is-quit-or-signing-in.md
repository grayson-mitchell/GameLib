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

## Resolution

Closed by quick `261027-aue` (2026-10-27): commits `00533026d` (helper), `4f3208b14` (launch wiring and dialog copy) and `014357b72` (presence baseline).

- `helperProcess.ts` reads the helper's `INIT ... InitFlat failed ... err=<text> appid=<id>` line, checking the appid. `Could not determine Steam client install directory` maps to `steam-not-running`, and `ConnectToGlobalUser failed` maps to `steam-not-signed-in`. Any other text takes the unchanged D-51-04 path, which tries the 480 fallback and then reports `not-inited`.
- On a Steam-state cause, the helper starts Steam once via `steam://open/main` through the shell opener (`activate: false`). It then stops the helper and spawns a fresh one every 3 s (`STEAM_RETRY_INTERVAL_MS`) within a 60 s budget (`STEAM_WAIT_BUDGET_MS`), checked before each spawn. The sleeps are unref'd. A helper whose InitFlat failed is never reused.
- A Steam-state cause never enters the 480 fallback, and it does not poison the session, so the next Play retries the bridge. Its setup message has `fallbackAvailable: false`.
- `launch()` shows a "Waiting for Steam" toast when the wait starts. The setup dialog explains each cause (not running, not signed in, refused a session) instead of recommending bottled Steam.

The live Mac check is filed as `2026-10-27-bridge-waits-for-steam-live-gate.md`.
