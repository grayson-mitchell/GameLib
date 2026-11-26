---
created: 2026-11-27T09:00:00.000Z
title: "callRunner finds a nile app name from the unfiltered argument list, so a trailing empty argument hides it"
area: launch
files:
  - src/backend/commandRunner.ts:148 (the nile finder returns commandParts.length - 1)
  - src/backend/commandRunner.ts:422 (appName is read before commandParts.filter(Boolean) at :429)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/runner/expected/runner-appname-nile-trailing-empty/calls.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-01 `runner` golden (D-20: kept as recorded, not fixed there).
`callRunner` derives the app name from the command parts before it drops empty entries. For nile the name is
"the last part", so `['install', 'app-nile', '']` names the empty string, the call gets no app name, and its
abort id and track key become `Math.random().toString()`. `killTracked` for the game then cannot find the run.
The legendary and gog finders index from the command word, so an empty entry elsewhere does not move them
(`runner-appname-legendary-leading-empty` records that). No live call site passes an empty trailing part today.

## Solution

Not part of the port. The Rust runner replays the golden as it is. After that, decide whether the app name
should be read from the filtered parts, in one deliberate change recorded in `deltas.json`.
