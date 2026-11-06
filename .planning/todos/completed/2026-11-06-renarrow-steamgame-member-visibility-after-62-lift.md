---
created: 2026-11-06T12:00:00.000Z
title: "Re-narrow SteamGame member visibility removed by the 62 mechanical lifts"
area: steam-refactor
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/gameEligibility.ts
  - src/backend/storeManagers/steam/gameInstall.ts
  - src/backend/storeManagers/steam/gameLaunchOverlay.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameUninstall.ts
severity: minor
platform: any
ready: code
---

Lift rule L4 (phase 62, D-06) removed the `private` keyword from every SteamGame member a lifted body reaches through `steamGame.`. TS `private` rejects outside access; there is no runtime effect, but the class surface is wider than before.

Proposal: where no test reaches the member (prototype spy or `as any` cast), have the lifted modules call the sibling free function directly instead of through the stub, then restore `private`. Where a test spies on the prototype member (`fetchMetadataIfNeeded`, `installBottleNative`, `launchDrmModeGame`, `launchBridgeGameBody`, `launchBridgeGame`, `fireBridgeWineLaunch`, `prepareTcpOverlay`), keep it public or mark it `/** @internal */`.

## Members de-privated

- 62-06 eligibility: `appId`, `fetchMetadataIfNeeded`, `isBottleEligibleFromPlatforms`, `isForcedWindowsViaBottle`, `isBottleEligible`, `assembleBridgeRouteInput`, `bridgeRoute`, `ensurePlatformsCaptured`.
- 62-06 install: `removeDemotedNativeOrphan`, `installNative`, `hasBottledSteamCopy`, `installBottleNative`, `crossoverRequiredError`, `ensureBuiltInEngineForInstall`, `installBridgeGame`, `provisionBridgeBottleForInstall`, `restorePinEngine`, `resolveInstallEngineSettings`, `installBridgeGameLeased`, `persistBridgeDrmSignal`, `reconcileBridgePrescreen`, `resolveBridgeGameInstallRoot`, `markBridgeGameInstalled`, `installDepotDownload`, `runNativeDepotDownload`, `installResultForRefusal`, `runNativeDepotDownloadLeased`, `clearStaleBridgeVerdict`, `prefetchBridgeDrmDownloads`.
- 62-07 core launch: `showEngineDialog`, `launchBridgeGame`.
- 62-07 bridge launch: `maybeNotifyBridgeLimited`, `maybeNotifyDrmModeFailed`, `sendLaunchDone`, `notifyCrossoverRequired`, `selectLaunchEngine`, `onBridgeLaunchDeadline`, `readLaunchExeCegMarkers`, `launchDrmModeGame`, `prepareTcpOverlay`, `runBridgeLaunch`, `launchBridgeGameBody`, `fireBridgeWineLaunch`.
- 62-07 overlay: `resolveLaunchOverlay`, `notifyOverlaySetupFailed`, `overlayInputLine`, `overlayInputArg`, `logOverlayInputOutcome`, `overlayProbeArg`.
- 62-08 uninstall: `markBridgeGameUninstalled`, `uninstallBridgeGame`, `uninstallNativeInGameLib`, `uninstallUnadoptedMacNativeDirectly`, `removeNativeInstallDirectly`, `uninstallBottleGameDirectly`.
- 62-08 maintenance: none (all already public).
