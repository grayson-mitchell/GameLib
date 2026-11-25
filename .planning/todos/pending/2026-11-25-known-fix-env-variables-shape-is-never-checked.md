---
created: 2026-11-25T12:00:00.000Z
title: "A tier-1 known fix whose envVariables is a string, list or non-string map reaches the game's env unchecked"
area: launch
files:
  - src/backend/launcher.ts:1262-1270 (getKnownFixesEnvVariables returns knownFixes?.envVariables || {} as it came)
  - src/backend/launchrust/knownFixTwins.ts (filterTier1KnownFixes keeps the key without checking its value's shape)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/builders/expected/known-fix-env-env-variables-is-a-string/result.json
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/builders/expected/known-fix-env-object-value/result.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-01 builders golden (`known-fix-env-*`, D-20: kept as recorded, not fixed there).
`getKnownFixesEnvVariables` returns the fix's `envVariables` exactly as the JSON held it. A fix file whose
`envVariables` is the string `"A=1"` is returned as that string (the managers spread it, which makes
`{0: 'A', 1: '=', 2: '1'}`), a list is returned as a list, and a map with a number, boolean, null, list or
object value keeps those values. The remote layer is a download, so a malformed file is a reachable input.

## Solution

Not part of the port. After the Rust builders replay the golden, decide the shape rule (string-valued map
only, drop the rest with a warning) in the Rust reader and the golden together, in one deliberate change
recorded in `deltas.json`.
