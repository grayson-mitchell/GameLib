---
created: 2026-11-05T22:10:00.000Z
title: "Discuss a more robust way to manage the 'restart Steam to finish' hold"
area: steam-install
files:
  - src/backend/storeManagers/steam/library.ts (shouldHoldForSteamRestart, releaseSteamHold)
  - src/backend/storeManagers/steam/games.ts (adoption branch ~3370)
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - native/steam-bridge/helper/gamelib_installapp.h
  - .planning/quick/261105-ord-steam-experimental-installapp-setting-ma/261105-ord-SUMMARY.md (live gate item 6)
severity: medium
platform: macos
ready: human
---

## Problem

After a GameLib depot download on macOS, if a Mac Steam process is running and
GameLib cannot prove Steam has adopted the install, the game enters
`steam-waiting-for-restart` (D-UAT-13) and its page says "restart Steam to
finish". That hold is released only when the Steam pid recorded at handoff
exits. Nothing else releases it, and the user has no in-app way out. The
operator called it brittle: "in this case I am stuck and need to do a reset."

Observed in the 261105-ord live gate, item 6 (2026-11-05, appId 112100, Steam
open at its sign-in screen, pid 10645):

- GameLib finished the download at 22:02:00. InstallApp adoption fell back
  (`library-lookup-unverified`), so the hold was set at 22:02:03.
- The operator signed in to Steam. The **same** pid 10645 logged
  `Loaded Steam library folders configuration` and
  `Loaded 14 apps from install folder` at 22:04:44 and showed Avadon
  installed.
- GameLib still said "restart Steam to finish". The hold's premise, that only a
  Steam restart rescans manifests, is wrong: sign-in also rescans.

The hold can also outlive reality in other ways. Examples: the user installs
through Steam anyway, or Steam adopts the game some other way. And it still
asks for a restart that may not be needed.

## To discuss

Options to weigh. None is decided.

- **Evidence-based release:** release the hold when Steam shows it knows the
  app, not only when the process exits. Candidate signals:
  - a content_log `Loaded N apps from install folder` line after the hold time
  - the ACF being rewritten by Steam (the baseline snapshot differs)
  - an InstallApp/app-state query through the bridge helper
- **Retry adoption:** while holding, retry `InstallApp` when the earlier
  failure was transient (signed out, Steam starting up), e.g. on the next
  poll after sign-in.
- **User escape hatch:** an action on the game page ("I've restarted Steam" /
  "Check again" / "Restart Steam now") instead of passive text.
- **Copy:** whatever the mechanism, the text should say what GameLib is waiting
  for and what the user can do.

## Related

The same gate item found that the helper's `not-signed-in` check
(`ConnectToGlobalUser` returning <= 0) does not fire at Steam's sign-in
screen. Fallback only happened because the library lookup failed. That is
tracked with the 261105-ord live gate. A robust hold design may depend on
detecting sign-in state reliably.
