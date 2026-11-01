---
created: 2026-10-26
title: "Route Steam installs by platform (steam://install when Mac Steam can install it) and protect the remaining authenticated logons from the Friends flip"
source: debug friends-signout-steam-user, Follow-up 2026-10-26
area: steam-install
files:
  - src/backend/storeManagers/steam/nativeInstallSetting.ts
  - src/backend/storeManagers/steam/games.ts
  - src/frontend/state/InstallGameModal.ts
  - src/backend/storeManagers/steam/user.ts
severity: medium
platform: macos
ready: blocked
---
## Problem

Native depot installs need an authenticated CM session (depot keys, manifest request codes, CDN
auth), and no credential other than the refresh token avoids a CM logon. Each native install
therefore flips Mac Steam Friends. `enableSteamNativeInstall` (default ON since quick 261024-exo)
sends every install down the native path, including titles Mac Steam can install itself through
`steam://install` with no GameLib logon at all.

## Proposed shape

1. Route by platform. A title with a macOS build goes to `steam://install`, so Mac Steam downloads
   with its own session and Friends is untouched. Only Windows-only titles take the native depot
   path. `enableSteamNativeInstall` stays as the override.
2. Protect the native path and explicit Refresh with the go-offline trick. Mac Steam goes offline
   only around the moment of GameLib's logon, then back online while the session stays open.
   Automated or guided, per the spike verdict.
3. If neither works, the install dialog says up front that Friends will sign out until Steam
   restarts.

## Blocked on

- Phase 54 (one gated entry point for authenticated logons).
- The spike `2026-10-26-spike-gamelib-toggles-mac-steam-offline-around-logon.md`.

Also worth a look before building: Mac Steam's console `download_depot <app> <depot> [manifest]`.
It downloads through the user's own session, so it could replace native Windows-only installs with
no GameLib logon. It is unverified, and automating the console is awkward.

## Cross-reference: known-fix macArch "32" (quick 261027-bqe)

The "title with a macOS build goes to steam://install" rule must treat a title for which `knownFixSaysMac32(appId, meta)` is true, or whose stored `mac_arch` is '32', as Windows-only. Otherwise this routing sends it to the unusable Mac build. See `src/backend/storeManagers/steam/macArchKnownFix.ts`.

## Resolution (2026-11-02)

Closed as resolved by Phase 54 (54-VERIFICATION `status: passed`). Both blockers are cleared: Phase 54 shipped, and the spike `2026-10-26-spike-gamelib-toggles-mac-steam-offline-around-logon.md` is completed (verdict: the go-offline wrap is automatable, spikes 046a-c).

- **Part 2 (protect authenticated logons): done.** `macSteamOffline.ts` wraps every cold authenticated connect in `user.ts` (`withMacSteamOffline`) with `steam://open/gooffline` / `goonline`. `autoRelogin: false` means no unwrapped reconnect. If Mac Steam's LogOff isn't seen within 5 s, a `GuidedOfflineRequiredError` asks the user to go offline instead of logging on silently. The Friends sign-out todo was closed as fixed by Phase 54 (`e5fbd8ef7`).
- **Part 3 (warn in the install dialog): not needed.** It was only the fallback for when parts 1 and 2 both fail.
- **Part 1 (route Mac-build titles to `steam://install`): deliberately not built.** Its only purpose was to avoid the Friends flip, which part 2 now prevents. The remaining cost of the native depot path is a ≈3-4 s Mac Steam/Friends-chat drop during the wrap. `steam://install` also opens Steam's install dialog and needs a human click (quick 261029-iwy, `macSteamAdoption.ts`). `enableSteamNativeInstall` OFF still sends Mac-native titles to `steam://install` for anyone who prefers that. The macArch "32" cross-reference already holds: `mac_arch === '32'` makes a title bottle-eligible (`isBottleEligibleFromPlatforms`). Re-open as a part-1-only todo if the wrap's brief offline window proves annoying in use.
