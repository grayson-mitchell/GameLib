---
created: 2026-11-24T00:00:00.000Z
title: 'A Steam shortcut writes the app name and runner into LaunchOptions unencoded, so a double quote in either ends the quoted launch URL'
area: shortcuts
severity: minor
platform: any
ready: code
found_by: 'Phase 94 plan 94-20, porting addNonSteamGame to Rust (first seen as finding 3 of 94-07; golden steam/add-launch-options-hostile-app-name).'
files:
  - src-tauri/crates/gamelib-shortcuts/src/steam/entry.rs
  - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/add-launch-options-hostile-app-name.json
---

## Problem

The Add to Steam entry's `LaunchOptions` is `--no-gui --no-sandbox "gamelib://launch?appName=<app_name>&runner=<runner>"`
with both values put in as they are. The macOS `run.sh`, the Linux `.desktop` and the Windows `.lnk` writers
percent-encode the same two values; this one never did. An `app_name` holding a `"` closes the quoted argument early,
so Steam passes the rest as further arguments to GameLib. The runner is one of five known names and is safe; the app
name is a store id for Epic, GOG, Amazon and Steam, and a name GameLib generated for a sideloaded game, so reaching it
needs a hostile name, which the app does not normally produce.

The Rust port copies it on purpose: the 94-07 golden `add-launch-options-hostile-app-name` pins the TypeScript's bytes,
and the entry's `appid` is a hash of `Exe` and `AppName` only, so encoding `LaunchOptions` would not move any id.

## Direction

Percent-encode both values with the helper `launch_url` already uses for the `.lnk` (`launch_url(app_name, runner,
true)`), regenerate the golden from a changed oracle (never edit it by hand), and keep the old line in a delta
beside the golden until then. An existing shortcut keeps its old line; only new ones change.
