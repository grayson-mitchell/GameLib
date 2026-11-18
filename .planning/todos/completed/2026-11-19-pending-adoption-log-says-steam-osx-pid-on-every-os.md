---
created: 2026-11-19T00:00:00.000Z
title: 'Pending-adoption log line says "steam_osx pid" on Windows and Linux'
area: steam
severity: minor
platform: any
ready: code
files:
  - src/backend/storeManagers/steam/gameInstallDepot.ts
---

## Problem

`gameInstallDepot.ts:314` logs
`SteamGame: recorded pending Steam adoption for <appId> (steam_osx pid <pid>)` on every OS. On the
Windows 11 live gate (Phase 81 item 10, 2026-11-19) the pid it prints is `steam.exe`'s, so the
label is wrong there and on Linux.

## Direction

Say `Steam pid` (or name the process per platform). Check whether any jest pin or live-gate
contract greps the literal before changing it.
