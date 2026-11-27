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

## Resolution

Closed 2026-11-28 by quick 261128-4j2 (fix `24903e2b9`, test `cd47bab9d`).

**Fix.** `entry.rs` `launch_options` now double-quotes `launch_url(app_name, runner, true)`, the call the `.lnk` makes.
The hostile golden's entry now carries `--no-gui --no-sandbox "gamelib://launch?appName=a%20b%22c%26d%3De%23f&runner=r%3Btouch%20pwned"`,
two double quotes whatever the name holds. A unit test decodes the quoted URL back to the inputs on Linux, Windows and
Flatpak.

**TS.** There was no TypeScript to change. `nonesteamgame.ts` and its steam oracle were deleted in 94-24 (`92ab71110`),
and `shortcutsPortComplete.test.ts` keeps them deleted.

**Golden.** It could not be regenerated, because the oracle is gone. As the Direction says for that case, the case file
stays byte-identical and `steam/deltas.json` records the old line's replacement, as 261128-9fj did for
`text/deltas.json`. The delta is therefore permanent, not interim.

**Plain names.** 47 of the 48 recorded `LaunchOptions` fields are unchanged. The new test holds the delta set to the
cases whose names encode.

**Ids.** The `appid` -530905163 and the grid ids `3764062133*` replay as recorded, because the delta changes only the
`LaunchOptions` value.

**Existing shortcuts.** Add never rewrites an entry titled like the game. `proves_app_name` still proves the raw form,
so old entries stay removable, and the unit test pins that.

**Receiver.** `protocol_url_arg` forwards the URL byte for byte (`src-tauri/src/single_instance.rs:53`), and
`protocol.ts:172-173` decodes it with `searchParams.get`.

**Accepted residual.** Steam's own handling of `%` sequences inside a shortcut's `LaunchOptions` was not live-tested.
Only names that encode reach it, plain store ids are byte-identical, and the app does not normally produce such names.
