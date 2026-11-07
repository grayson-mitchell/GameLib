---
created: 2026-11-07T00:00:00.000Z
title: 'Route a forced-Windows Steam install of a Mac-native game through the native bridge, not bottled Steam'
area: steam
severity: medium
platform: macos
ready: live-gate
found_by: 'quick 261107-li0 planning (Console Mode Platform row deferred)'
---

The desktop Steam install dialog's "install the Windows version instead" choice (`forceWindowsViaBottle` / `steamForceWindowsViaBottle`, D-17) always lands on the shared bottled Windows Steam client (`installBottleNative`, shared `GameLibSteam` bottle and shared Wine engine), never on the native bridge. Cause: the bridge route input is built by `assembleBridgeRouteInput()` (`src/backend/storeManagers/steam/gameEligibility.ts:106`) from `isBottleEligibleFromPlatforms()` (`:46`), which is true only for `mac_arch '32'` or `is_mac_native === false` and deliberately ignores the user's forced-Windows choice. A game with a runnable Mac build therefore gets a `not-eligible` route and never reaches `installBridgeGame`. That works against the goal of shrinking the bottled-Steam path to a narrow fallback.

Fix: when the install carries the forced-Windows override (the triple-gated `steamForceWindowsViaBottle === true` AND macOS AND `is_windows_native === true` check), feed it into the bridge route input so the normal bridge verdict (seed/scan/known-bad/DRM) applies, and the game gets its own `GameLibSteamBridge-<appId>` bottle. Bottled Steam stays only as the verdict's own fallback. Keep the post-install launch path consistent: a forced-Windows bridge install of a Mac-native title must launch the Windows exe through the bridge, not the Mac build.

Unblocks: a Console Mode Platform row (macOS default, Windows alternative) for dual-build Steam games, with no Wine row. Revisit the D13 gate in `src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts` and the comment in `InstallOverlay/index.tsx` that records this finding. On the desktop dialog, quick 261107-li0's `resolveBridgeOwnsEngine` will then hide the shared Wine selector for these installs automatically once the verdict is native.

Verify live on this Mac: force Windows on a dual-build title, confirm a `GameLibSteamBridge-<appId>` bottle is created and the game launches with a clean bridge verdict (see the strict "verified" bar).

**Resolved 2026-11-07 by quick 261107-lum** (commits 7614188b7, 4d4dccdd1, 850819137). Live gate on the operator's Mac: a forced-Windows install of Undertale (391540) and Cat Quest (593280) both routed by the bridge verdict into their own `GameLibSteamBridge-<appId>` bottles, with nothing in `GameLibSteam`, and launched through the bridge; after uninstalling Undertale the Platform row defaulted back to macOS. Closed on the routing evidence by operator decision. The strict bridge-verified bar was not met on either title, for shim-coverage reasons independent of this change: both count as "played through the bridge, unverified", and Cat Quest's gap is tracked in `2026-11-07-cat-quest-bridge-shim-withheld-steam-init-fails.md`. The Console Mode Platform row is tracked in `2026-11-07-console-mode-steam-platform-row.md`.
