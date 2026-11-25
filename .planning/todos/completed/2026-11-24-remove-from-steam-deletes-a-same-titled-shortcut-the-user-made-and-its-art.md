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

## Resolution (2026-11-25): Remove from Steam proves the entry before removing it

An entry is now removed only when its `LaunchOptions` contain `gamelib://launch?appName=` with this game's appName,
either raw, as the add writes it today, or percent-encoded, so the sibling encoding todo can land without touching the
proof. The runner is not compared, and an empty appName never proves.

The target is the first same-titled entry that proves it, not the first same-titled entry. The removal names that
entry's exact `LaunchOptions`, and gamelib-steamfiles removes only an entry whose AppName and LaunchOptions both match,
on its own re-read under the per-path lock. A user's same-titled entry that comes first is left in place, and so is a
file Steam rewrote between the proof's read and the edit.

An entry that does not prove it stays in `shortcuts.vdf` with its five grid files. The outcome is a log note (no
LaunchOptions text, Exe or user folder) and the existing `notify.finished.remove.steam.corrupt` notification instead of
the success one. The op still answers null, so the IPC contract and the renderer are unchanged.

The goldens: `tests/fixtures/golden/steam/deltas.json` records 9 deltas, the removal cases whose upstream
`shortcuts.vdf` entry carries no GameLib launch URL. Each replays refused as seeded, then again with the entry proven,
which pins the TypeScript's recorded success and apply-failure answers for GameLib's own entry. No golden file and no
MANIFEST.json was edited.

`src/backend/shortcuts/nonesteamgame/nonesteamgame.ts`, named in this todo's `files:`, was already deleted by 94-24
(`92ab71110`). The live path is the Rust op `shortcuts_steam_remove` alone, called by the renderer's
`resolveRemoveFromSteam` and the store managers' `removeNonSteamGame`, and neither needed a change.

Fix commit, by subject because this branch may be rebased on merge: "fix(quick-261125-uzz): Remove from Steam removes only the shortcut GameLib proves it wrote".

Not done, as follow-ups: `steam_is_added` and the add's duplicate check still match by title alone. A user's own
same-titled shortcut therefore still reads as "in Steam", and the game page's Show in Steam switch, which sets itself
off after any remove (`useSteamShortcut.ts`), comes back on at the next mount. A pre-rebrand `heroic://launch` entry is
refused, not removed. The sibling encoding todo
(`2026-11-24-steam-shortcut-launch-options-carry-the-app-name-and-runner-unencoded.md`) is untouched.

Like the finding, this was verified by tests, not by a live Steam client.
