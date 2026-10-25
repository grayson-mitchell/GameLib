---
created: 2026-10-25
title: "Mining Mechs shows a Win32 error dialog four times on launch through the bridge, then runs once clicked through"
source: 53-16 live session, operator report (item 22)
area: steam-bridge
files:
  - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md
severity: minor
platform: macos
ready: human
---

Operator, 53-16 session: Mining Mechs (1603180) raised a "Win32 error" dialog four times and ran
once each was clicked through. The bridge evidence is clean (HELLO, five distinct CALLs incl.
identity, census `verified`), and gamelib.log records no error for it, so the dialog text is the
missing fact. Next step: relaunch, capture the dialog text and the Wine stderr for the bottle
`GameLibSteamBridge-1603180`, and check whether it is a missing Windows runtime component (see
`2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`).
