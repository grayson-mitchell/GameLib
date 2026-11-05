---
created: 2026-11-05T12:00:00.000Z
title: "Install modal should own disk-space and library choice on the Steam InstallApp route"
area: steam-install
files:
  - src/backend/storeManagers/steam/installFlowRegistration.ts (listSteamLibraryTargets handler)
  - src/frontend/screens/Game/InstallModal/index.tsx (steamNativeInstallOn)
  - src/frontend/screens/Game/InstallModal/steamSectionGating.ts
  - src/frontend/components/UI/SteamDialog/index.tsx (signInRequired)
severity: minor
platform: macos
ready: code
---

## Problem

Quick 261105-ord added the opt-in "Steam Experimental InstallApp Feature". With
the downloader toggle OFF and the feature ON, `SteamGame.install()` asks the
running Steam to install through `IClientAppManager::InstallApp`, so Steam's own
install dialog (which carried the library choice and the free-space line) never
appears. The backend half is enforced: the target is always a registered Steam
library mapped to Steam's own folder index, and an unmapped path falls back to
Steam's dialog.

The modal half is not done. The install modal derives "GameLib installs this"
from the length of the `listSteamLibraryTargets` IPC list, and the same signal
drives SteamDialog's sign-in gate and notice copy. So on this route the modal
shows neither the library dropdown nor the free-space line, and the user loses
both confirmations.

Parent todo: `.planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md`
(step 6, lost confirmations).

## Solution

Give the modal its own discriminator for "InstallApp route" (a field on the
`listSteamLibraryTargets` reply, or a separate IPC) instead of overloading the
list length, then show the library dropdown and free-space line for it without
changing the sign-in gate or notice copy. The settings read must stay in the
backend accessor `isSteamExperimentalInstallAppEnabled()` (RESEARCH Pitfall 4
forbids a second settings read in the renderer).

## Resolution

Closed by quick 261105-upw. A new backend-authoritative IPC,
`getSteamInstallAppTargets(appName)`, returns `{ installAppRoute, libraries }`
(true only for feature ON + native OFF + non-bottle title on macOS). The modal
calls it only when `listSteamLibraryTargets` resolved `[]`, then feeds the
section-gating resolver `steamLibraryChoiceOwned`, so the library dropdown and
free-space line render on the InstallApp route. `SteamDialog` keeps receiving
`steamNativeInstallOn`, so its sign-in gate and notice copy are unchanged.

Single-library behaviour matches native-ON: no picker and no free-space line;
the install goes to the primary library.

The `files:` paths above were stale. The real ones are
`src/backend/sidecar/installFlowRegistration.ts`,
`src/frontend/screens/Library/components/InstallModal/` and
`src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx`.
