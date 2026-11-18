---
created: 2026-11-19T00:00:00.000Z
title: 'Windows: "Open Steam" on the adoption note does not bring Steam to the front'
area: steam
severity: medium
platform: windows
ready: live-gate
files:
  - src/backend/storeManagers/steam/adoptionStatus.ts
---

## Problem

Phase 81 live gate, item 10 (e) (`81-HUMAN-UAT.md`, Windows 11, 2026-11-19). With Steam signed
out and game 250320 pending, the note "Sign in to Steam to finish setup" showed with "Open Steam".
Pressing it did not bring Steam's window forward. gamelib.log shows the handler ran every time:
`SteamGame: opening Steam from the adoption note` 15 times between 06:41:08 and 06:41:39. The
rest of the item behaved: the note cleared only after sign-in (06:42:32, terminal
`adoption appId 250320 adopted (log)`).

On macOS (item 3) the same action brought Steam forward.

## Direction

`openSteamForAdoption` (`adoptionStatus.ts:195`) only calls `openExternal('steam://open/main')`.
Unverified hypothesis: on Windows the URL reaches the running `steam.exe`, but the foreground lock
(`SetForegroundWindow` rules) stops Steam taking focus because the request came from a background
process (the sidecar), not the foreground app. Measure first: does `steam://open/main` from a
terminal raise Steam's sign-in window? If not, the shell may need to hand focus over (for example
`AllowSetForegroundWindow` for Steam's pid before the open, or raising the window from the Rust
shell, which owns the foreground window). Live check on Windows: press Open Steam with Steam behind
GameLib, at the sign-in screen and when signed in.
