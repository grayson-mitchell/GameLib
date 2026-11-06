---
created: 2026-11-06T12:10:00.000Z
title: "Steam delegated install/uninstall give-up tells the user via a system toast, not the in-app toast stack; Cancel also logs a spurious ERROR"
area: steam-install
files:
  - src/backend/storeManagers/steam/library.ts (install give-up notify() ~3656, uninstall give-up notify() ~4105)
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx (the in-app bottom-right toast stack)
  - src/backend/storeManagers/steam/games.ts (SteamEngineLaunchNotice producer)
  - src/backend/downloadmanager/ (Aborting not possible log, utils.test.ts ~219, ~924)
severity: medium
platform: macos
ready: live-gate
---

## Problem

Found by the operator during the live gate for quick 261105-vfq on 2026-11-06
(signed-out Mac Steam, `tauri:dev`). The 2-minute give-up itself PASSED all three
arms (install reverts to Not installed, uninstall stays Installed, Cancel clears a
delegated install at once). Two defects remain around it.

**1. The user is told through a system notification, not the in-app toast.**

Both give-up paths call `notify()` (`library.ts` ~3656 install, ~4105 uninstall),
which hands off to `tauri-plugin-notification`. The log says `notify(): "7 Days to
Die" handed to tauri-plugin-notification (delivery not confirmable)`. On the gate:

- The operator saw a system toast only, and it landed on a different monitor from
  GameLib. They were looking for an in-app notice and found none.
- In a packaged macOS build the system toast may not be delivered at all (see
  memory `packaged-macos-gamelib-delivers-no-notifications`). The user would see
  the status quietly revert and get no explanation.

GameLib already has a bottom-right in-app toast stack (`SteamEngineLaunchNotice`,
quick `261104-vvz`, extended in `261105-ast`; design in the sketch-findings
`notices-and-toasts` reference). The "make sure Steam is signed in" message
(`gamelib:steam.install.notStarted`, `gamelib:steam.uninstall.notStarted`) belongs
there.

**2. Cancel on a delegated install logs `[ERROR] Aborting not possible`.**

Cancelling a Steam-owned install at 12:01:16 logged
`[ERROR] [Backend]: Aborting not possible. Could not find a matching abort
controller for 203160`, then correctly stopped the poll. A delegated install has no
abort controller by design, so this ERROR is on an expected path. Not yet traced
whether Cancel always logs it. `installStallWatchdog.ts:44` already notes the same
ERROR firing on every sideload/CLI-gap cancel.

## Solution (to decide)

- Route both give-up messages through the in-app toast stack, keeping or dropping
  the system `notify()` as a decision. Reuse the existing stack rather than a new
  component. Keep the i18n keys; new strings go in `gamelib.json`.
- For the Cancel ERROR: skip the abort lookup for a Steam-delegated install, or
  downgrade that log line for this path. Check the two existing `utils.test.ts`
  pins first.
- Live check on a signed-out Mac Steam, watching the GameLib window on the same
  monitor: install give-up and uninstall give-up each show the in-app toast; Cancel
  of a delegated install logs no ERROR.

Parent todo: `2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md`
(timeout/revert/Cancel verified by this gate; this todo is the notice channel).

## Fix landed, live check pending (quick 261106-pvk, 2026-11-06)

`4d8aade9b`, `0ca02bbd0`, `0b24d6f2c`. Both give-ups push `steamRequestNotice`
(no `notify()`), drawn as a `request` slot in the existing toast stack; its
countdown waits until GameLib is focused. `dispatch.kill()` skips the abort
lookup for a Steam-delegated install. Close after the live check above.
