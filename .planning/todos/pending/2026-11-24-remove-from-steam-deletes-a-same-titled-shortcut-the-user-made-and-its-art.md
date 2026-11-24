---
created: 2026-11-24T00:00:00.000Z
title: 'Remove from Steam deletes the first shortcut with the game title, and its grid art, whoever made it'
area: shortcuts
severity: medium
platform: any
ready: code
found_by: 'Phase 94 plan 94-20, porting removeNonSteamGame to Rust (D-22 and D-29 name the desktop shortcut; the Steam removal has no creation proof).'
files:
  - src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs
  - src-tauri/crates/gamelib-shortcuts/src/steam/art.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/remove-basic.json
  - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
---

## Problem

`removeNonSteamGame` takes out the first `shortcuts.vdf` entry whose `AppName` equals the game's title, in every Steam
user folder, then deletes the five grid files that entry's own `Exe` and `AppName` name. It never asks whether GameLib
wrote the entry. A user who added their own non-Steam shortcut to a game of the same title (from the Steam client, or
another launcher) and then uses "Remove from Steam" in GameLib loses that shortcut and its art.

D-29 gives the Applications `.app`, the Linux `.desktop` and the Windows `.lnk` a creation proof and refuses what it
cannot prove; this removal has none. The Rust port copies the TypeScript because the 94-07 goldens
(`remove-basic`, `remove-keeps-the-other-entries`, `remove-skips-0-and-ac`) remove entries from upstream test files that
carry no GameLib launch URL, and no steam delta was recorded.

Grid art is only ever deleted by the five computed names under that user's `grid` folder, through `gamelib-safety`
with the grid folder as its trust root (T-94-37), so the blast radius is that one entry and its own art.

## Direction

Prove the entry is GameLib's before removing it: its `LaunchOptions` contains `gamelib://launch?appName=` and the
`appName` is the game's. Refuse and report an entry that does not (as `shortcuts_remove` reports `refused`). That
changes the removal goldens: record steam deltas for the entries the upstream files hold, as 94-07 did for the
desktop items, rather than editing a golden.
