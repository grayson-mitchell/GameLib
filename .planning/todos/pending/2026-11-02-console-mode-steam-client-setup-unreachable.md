---
created: 2026-11-02
title: "Console Mode cannot host the Steam client-setup prompt, so a missing or never-launched client shows the library card instead"
source: quick 261102-21x (D-UAT-15 follow-up)
area: steam
files:
  - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/App.tsx
severity: minor
platform: any
ready: human
---

The desktop quick install now asks the backend (`steamClientSetupRecheck`) whether the Steam client
is the reason the library looks missing, and lets the D-10/D-11 `SteamClientSetup` prompt win. Console
Mode runs the same pre-check (`probeSteamQuickInstallTarget`) but does not apply that gate.

Why not: `App.tsx` mounts `<SteamClientSetup />` only in the non-console branch of its `isConsoleMode`
ternary. Under `/console` the backend push would open the `useSteamClientSetup` store with nothing
rendered, so the overlay would show nothing, a silent failure D-29 forbids. The desktop prompt would
also pop up later, when the user leaves Console Mode.

What it does now: the D-29 terminal card for `library-missing` keeps working, and its copy names the
client cause as well as the drive ("Check that Steam is installed and has been opened at least once,
and that the library's drive is connected."). A couch user with no Steam client sees that card, not
a guided install.

Decision needed (options, none chosen):

- A console-native client-setup card (gamepad-navigable install / launch-once guidance) mounted in
  the console branch.
- Hand off to desktop mode for setup (leave Console Mode and let the desktop prompt run).
- Accept the corrected card copy as sufficient.
