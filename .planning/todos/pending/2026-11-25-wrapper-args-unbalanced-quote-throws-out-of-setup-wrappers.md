---
created: 2026-11-25T12:00:00.000Z
title: "An unbalanced quote in a wrapper option's args or gamescope additional options throws shlex's raw error"
area: launch
files:
  - src/backend/launcher.ts:1562-1588 (setupWrappers splits each wrapper entry's args with shlex.split, no guard)
  - src/backend/storeManagers/legendary/games.ts:1039 (the caller; gog, nile and storeManagerCommon call it the same way)
  - src/backend/gamescopeCommand.ts:68 (buildGameScopeCommand splits additionalOptions with the same shlex.split, no guard)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/builders/expected/shlex-split-unterminated-double-quote/result.json
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/gamescope/expected/cmd-pairwise-*/result.json (the rows whose additionalOptions is unterminated record { error })
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-01 builders golden (`shlex-split-unterminated-*`, `wrappers-pairwise-*` rows with an
unterminated quote; D-20: kept as recorded, not fixed there). `shlex.split('FOO="a b')` throws
`Got EOF while in a quoted string`, and `setupWrappers` lets it propagate, so a user who types an unbalanced
quote into a wrapper option's arguments gets a launch that fails with shlex's own message and no hint of
which setting caused it. `buildGameScopeCommand` does the same with the gamescope "additional options" text
(`cmd-pairwise-*` rows with an unterminated quote record `{ error }` in `golden/gamescope`).

## Solution

Not part of the port. Once the Rust `setupWrappers` replays the golden, decide the behaviour (skip the
entry and warn, or fail the launch with a message naming the wrapper setting) as one deliberate change with
a `deltas.json` entry.
