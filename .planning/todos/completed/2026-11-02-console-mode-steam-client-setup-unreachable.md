---
created: 2026-11-02
title: "Console Mode cannot host the Steam client-setup prompt, so a missing or never-launched client shows the library card instead"
source: quick 261102-21x (D-UAT-15 follow-up)
area: steam
files:
  - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/App.tsx
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/screens/ConsoleMode/index.tsx
  - src/frontend/state/SteamClientSetup.ts
  - public/locales/en/gamelib.json
severity: minor
platform: any
ready: live-gate
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

## Decision (operator, 2026-11-02)

Chosen: hand off to desktop mode for setup (leave Console Mode and let the desktop prompt run).
Rejected: a console-native client-setup card, and accepting the corrected card copy as sufficient.

## Fix (quick 261102-pgy, 2026-11-02) — awaiting a controller live run

- `c85f4cbeb` `InstallGameModal.ts`, `consoleSteamTarget.ts`, `InstallOverlay/index.tsx`,
  `ConsoleMode/index.tsx`: one shared `steamClientSetupCause` predicate for the desktop gate and
  Console Mode's probe; the probe verdict carries `clientSetup` on a client cause; the card gains a
  `setupSteam` chip (intent `handoff`, focused by default); activating it opens the setup store and
  then leaves Console Mode through the existing `quit`.
- `9e1c966af` `consoleSteamTarget.ts`, `InstallOverlay/index.tsx`, `gamelib.json`:
  `releaseUnclaimedSteamClientSetup` closes the store the recheck's backend push opened when the
  card is dismissed or the overlay unmounts without a hand-off; new en catalog key
  `consoleMode.steamClientSetupHandOff`.

Not changed: the card title and library-missing copy are unchanged. Non-client library-missing,
library-full and non-Steam installs are unchanged. No other locale gained the key.

Tests: consoleSteamTarget.test.ts A10-A13, B5, H1-H3, D9-D11 (with RED specimens) and I1, alongside
InstallGameModal.test.ts, SteamClientSetup.test.ts and SteamClientSetup.waitingDialog.test.tsx.

Live gate (any OS, controller): with the Steam client absent (D-10) or installed but never launched
(D-11), enter Console Mode and press A on an uninstalled Steam game. The card shows "Set up Steam in
desktop mode" with focus on it. Press A: GameLib leaves Console Mode and the consent dialog (D-10) or
the "Waiting for Steam" dialog (D-11) is open. Repeat and press B instead: the card closes, and
leaving Console Mode shows no client-setup dialog.
