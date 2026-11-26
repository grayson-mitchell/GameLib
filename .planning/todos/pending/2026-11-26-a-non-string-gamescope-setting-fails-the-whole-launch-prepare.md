---
created: 2026-11-26T13:00:00.000Z
title: "A non-string gamescope setting fails the whole launch prepare instead of that one flag"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/prepare/launch.rs:370-373 (the decode that returns Err)
  - src-tauri/crates/gamelib-launch/src/builders/gamescope.rs:19-46 (GamescopeSettings, String fields with serde default)
severity: minor
platform: any
ready: code
---

## Problem

`GamescopeSettings` declares `game_width`, `fps_limiter` and the other fields as `String` with `#[serde(default)]`, and
`default` only covers an absent key. A value that is a number or `null` (a hand-edited `GamesConfig/<app>.json`, for
example `"gameWidth": 1920`) makes `serde_json::from_value` fail, and the step returns `Err("the gamescope settings
have an unexpected shape")`, so `launch_prepare` rejects and the adapter throws. The pre-port TypeScript pushed the
value into the argv as it was, and the error aborts the launch for an unrelated reason: the user only asked for a
frame limiter.

Found by 88.1-REVIEW.md WR-02, confirmed by 88.1-VERIFICATION.md (by reading the code; only a hand-edited
`GamesConfig/<app>.json` triggers it, so the verifier weighed it a warning).

## Solution

Decode leniently per field: a `#[serde(deserialize_with = ...)]` that accepts a string, a number or null and yields a
`String` (empty for null), or read the group as `Value` and take
`as_str().map(str::to_string).or_else(|| number.to_string())`.

The parity target is the TypeScript behaviour (the value went into the argv as it was). Its golden vector, a numeric
`gameWidth`, must be recorded from the pre-port TS the way 88.1-21 and 88.1-22 recorded their cases (a scratch
worktree at 51329e5d648b308756ec03220b970dbe1edb3361; `88.1-22-oracle-recording.patch` in the phase directory shows the
whole edit), never typed by hand.
