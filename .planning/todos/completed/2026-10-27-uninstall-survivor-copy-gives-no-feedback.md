---
created: 2026-10-27
title: "Uninstall that removes one copy while another survives gives the user no feedback, so it reads as a failed uninstall"
source: live XCOM 200510 reinstall for todo 2026-10-26-chunk-timeouts-by-depot-or-host-unmeasured (2026-10-27)
area: steam
files:
  - src/backend/storeManagers/steam/library.ts:3255-3285
severity: minor
platform: any
ready: code
---

## Problem

XCOM 200510 had two installs: the native Steam copy and a GameLibSteam bottle copy left by
earlier spikes. Clicking Uninstall in GameLib handed off to `steam://uninstall/200510`. Steam
removed the native copy and its own status changed, but GameLib still showed the game as
installed. The operator read this as an uninstall bug, uninstalled again, and the second attempt
removed the bottle copy and flipped the badge.

The behaviour is by design. Log at 10:03:47:

```
Steam: uninstall polling complete for appId 200510 — removed the native copy; a bottle copy
survives at ".../CrossOver/Bottles/GameLibSteam/.../steamapps/common/XCom-Enemy-Unknown",
badge stays installed and install_path re-resolved to it
```

The survivor branch in `library.ts` (~3255-3285) re-resolves `install_path` to the surviving copy,
keeps `is_installed: true`, and suppresses the "Game Uninstalled" toast on purpose, because that
toast would overstate what happened. Nothing replaces it, though. The only trace is a log line, so
from the UI the click looks like it did nothing.

## Solution

In the survivor branch, send a notification in place of the suppressed toast, such as
"<title>: removed the native copy; a bottle copy is still installed at <path>". It should name both
the removed source and the surviving one, so a second click is a deliberate choice. Add an
i18n key under `public/locales/en/gamelib.json` (ignored by prettier, so hand-match the
surrounding style). Extend the existing survivor-branch jest coverage to assert the notification.
Optional: let the game page show that the title is installed in both roots before the uninstall
starts.

## Resolution (2026-10-27, `6de4cce9b`)

The survivor branch of `pollUninstallOnce` (`library.ts`) now sends a `notify()` in place of the
suppressed toast. The message is `gamelib:steam.uninstall.copySurvives`: "Removed the {{removed}}
copy. A {{survivor}} copy is still installed — use Remove all copies… to remove it too". The two
copies are named through `gamelib:steam.uninstall.copySource.{native,bottle,bridge}` (Mac Steam /
Windows Steam (CrossOver) / Steam bridge). It points at the existing Remove all copies… action
rather than showing a path. The three survivor-branch tests in `library.test.ts` now assert that
exactly one notify fires, that it is not "Game Uninstalled", and that the labels are interpolated
correctly; 242/242 pass, codecheck is green. The gamelib presence baseline was regenerated. It
was already red at HEAD for the 261027-cux `cancelDialog` keys.

Not live-gated: uninstalling a title that has both a native and a bottle copy and seeing the
notice.
