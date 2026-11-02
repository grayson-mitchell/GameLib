---
created: 2026-11-02
title: "D-UAT-15: with the Steam client absent or never launched, the install dialog first shows \"library couldn't be reached. Reconnect the drive\""
source: Phase 21 UAT 4a/4b, Windows client-setup pass 2026-11-02 (21-UAT.md)
area: steam
files:
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - public/locales/en/gamelib.json
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/state/__tests__/InstallGameModal.test.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
severity: minor
platform: windows
ready: live-gate
---

Both 4a (client absent) and 4b (installed, never launched) showed `steam.install.libraryMissingOnlyNotice`
("Your Steam library couldn't be reached. Reconnect the drive, then try again.") before the correct
D-10/D-11 prompt. Operator: "the first error window should be skipped, the second is the relivent
error" and the "Reconnect the drive" sentence assumes a removable drive. The `library-missing`
degrade should not win when the client itself is absent or never launched; separately reconsider
the drive wording. Root cause and the fix are in the sections below.

## Root cause

`getSteamLibraries()` always yields the configured default Steam path (plus a hardcoded fallback),
even when `libraryfolders.vdf` does not exist. With Steam absent or never launched, the primary
library's `steamappsDir` does not exist, so `startSteamQuickInstall`'s D-24 probe reported
`validPath: false` and produced a spurious `library-missing` degrade. The real precondition check,
`ensureSteamClientReady`, ran only inside `runNativeDepotDownload`, which is after the click in the
options dialog.

## Code landed (quick 261102-21x)

Commits: b6d8bb7c8 (the recheck gate) and a87c0e91d (the copy), after a `test(...)`
commit ec1b908d4 that pinned the behavior first (Group U).

- `startSteamQuickInstall` now, on a library-missing verdict only, calls `steamClientSetupRecheck`
  (the same `ensureSteamClientReady` the click would reach, which sends the same
  `steamClientSetupRequired` push). A `needs-install` / `needs-launch` verdict with no `error` returns
  without opening the options dialog; the backend push has already opened `SteamClientSetup`. A
  rejected recheck, an `error` verdict, a `ready` verdict, library-full, an ok verdict, the 0-library
  delegated path and the sign-in pre-check all behave as before, and only the library-missing branch
  pays the extra round-trip. Pinned by Group U (U1-U8).
- Copy: the desktop notice now reads "Your Steam library folder couldn't be found. Check that it
  still exists and that its drive is connected, then try again." and the Console Mode card names the
  client cause too ("Check that Steam is installed and has been opened at least once, and that the
  library's drive is connected.").
- Accepted ordering consequence: on a macOS bottle-routed title with no native Steam, the
  client-setup prompt can now appear before the CrossOver / bridge / bottle checks `install()` makes
  first. Every prompt is still a real precondition.
- Console Mode is deliberately not gated: `SteamClientSetup` is mounted only in `App.tsx`'s
  non-console branch, so the push would open an unmounted store (a silent failure D-29 forbids).
  It keeps its in-place card with the new copy. The gap is tracked in
  `2026-11-02-console-mode-steam-client-setup-unreachable.md`.

Operator live gate (NOT yet run; this todo stays pending until it passes). Use a GameLib build that
contains the fix and the Test recipe in
`.planning/todos/completed/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md` (empty
Default Steam path) to re-run UAT 4a/4b on the Windows box. Check:

- 4a (client absent): Install opens the guided-install consent prompt first, with no library notice
  before it.
- 4b (installed, never launched): Install opens the launch-once prompt first.
- Record the results on items 4a/4b in
  `.planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md`, then move this todo to
  completed.

## Resolution (live gate passed 2026-11-02, real Windows)

Covered by the D-UAT-17 4a re-run (03:06 onward, build containing b6d8bb7c8 and a87c0e91d), run
with Default Steam path = an empty folder. With the client absent, Install went straight to the
D-10 consent prompt; after the hand-off to Valve's installer, the never-launched state showed the
D-11 launch-once prompt (03:08:58 onward). The library-missing notice did not appear in either
state. Operator: passed. Recorded on 4a/4b and the D-UAT-15 finding in 21-UAT.md.
