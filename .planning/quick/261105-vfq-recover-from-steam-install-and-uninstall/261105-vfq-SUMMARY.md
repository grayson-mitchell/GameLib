---
phase: quick-261105-vfq
plan: 01
subsystem: steam
tags: [steam, install-poll, uninstall-poll, downloads, i18n]
requirements: [TODO-2026-11-05-steam-uninstall-silently-dropped-when-signed-out]
key-files:
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
  created:
    - src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx
    - src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx
completed: 2026-11-05
---

# Quick 261105-vfq: Recover from dropped steam:// install/uninstall

A delegated install or uninstall that Steam never picks up now reverts after 40 ticks (~2 min) with a "make sure Steam is signed in" notice. Cancel on a Steam-owned install stops GameLib's poll at once.

## Commits
- a171c7a02: backend timeout, early managedBySteam flag, cancelDelegatedInstall, SteamGame.stop() branch, tests
- c4c6d434f: SteamManagedItemView with enabled Cancel (window.api.kill), en keys, presence baseline

## What changed
- `DELEGATED_NO_MANIFEST_TICKS` (600) replaced by `STEAM_REQUEST_NO_ACTIVITY_TICKS = 40`, counted from `delegatedSinceTick` (so an upgraded bare poll counts from the upgrade). Seeing a manifest or downloading/staging entry (`seenDownloading`) disarms it; manifest-gone and MAX_TICKS rules unchanged.
- The uninstall poll's 20-tick grace is now the same 40-tick window; `seenUninstalling` disarms it. The upstream `notify.uninstallNotConfirmed` key is no longer used (not edited).
- `markManagedBySteam` sends `installing` + `managedBySteam: true` when a poll becomes delegated, so the Downloads row exists before Steam shows activity.
- `cancelDelegatedInstall(appId)` stops a delegated poll, sends `done`, no notice. `SteamGame.stop()` calls it after the native-depot branch.
- Four en keys (`steam.install.notStarted`, `steam.uninstall.notStarted`, `downloadManager.steamManaged.note`, `.cancelHint`); presence baseline gained only those keys x 50 locales.
- Sidecar exit contract: no new timer or handle; the timeout is tick-counted in the existing unref'd interval.

## Deviations
- Test IDs: the plan's D5-D8 collided with an existing D5, so the new backend tests are named VFQ-1..VFQ-6 (install timeout disarm, early flag, upgrade, cancel, uninstall activity disarm, uninstall completion). D1 and the uninstall grace test were rewritten as planned.
- `pnpm i18n` added the two frontend keys itself; the hand-written backend keys matched parser output.

## Verification
- jest over `src/backend/storeManagers/steam` + SteamManagedItem: 4601 passed, 1 failed, 4 skipped. The failure, `macArchKnownFixRouting.test.ts` "Intel: never seeds and does not take the bottle-branch result" (`shell.openExternal` not called with `steam://install/63000`), is pre-existing: it fails identically with library.ts/games.ts reverted to HEAD. Not fixed (out of scope).
- library.test.ts 336/336, games.test.ts 695/695, new view test passes.
- `pnpm codecheck` clean; eslint on touched files: 0 errors (360 pre-existing-style warnings in the large test/source files); `pnpm i18n-churn-guard` clean; `pnpm lint-translations:gamelib` exit 0 after baseline regen; scoped `prettier --check` passes on all written paths and the baseline (`gamelib.json` is prettier-ignored).
- Live check still owed (todo stays `ready: live-gate`): signed-out Mac Steam install/uninstall reverting after ~2 min with the notice, and Downloads Cancel clearing a stuck delegated install.

## Known stubs
None.

## Self-Check: PASSED
