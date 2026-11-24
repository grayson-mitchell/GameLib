---
created: 2026-11-25T00:00:00.000Z
title: "The known-fix readers look up '<id>-undefined.json' for a sideload game; only readGamelibFixStatus guards it"
area: backend
severity: minor
platform: any
ready: code
files:
  - src/backend/knownFixes.ts
  - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/reader/expected/sideload-reads-the-undefined-store-file/result.json
---

## Problem

`readFixesFileWithin` builds the file name as `${appName}-${storeMap[runner]}${suffix}`, and
`storeMap.sideload` is `undefined`. For `runner: 'sideload'`, `readKnownFixes`,
`readKnownFixesWithLayer` and `readKnownFixProfile` therefore read `<appName>-undefined.json` (and
`.profile.json`) in every layer. `readGamelibFixStatus` is the one reader that guards it
(`if (storeMap[runner] === undefined) return null`), so for one title and one file the readers
disagree: a bundled `app1-undefined.json` gives a fix from `readKnownFixes` and `null` from
`readGamelibFixStatus`.

Quick 261024-tny fixed the same trap for steam ("never `<id>-undefined.json`") by adding the steam
store name, not by guarding the sideload one.

## Why it is minor

No file named `*-undefined.json` ships in `public/fixes`, and the remote feed has none. It is a latent
trap: a stray file with that name would be read and applied to a sideload title whose `appName`
matches, with the GameLib row saying there is no fix.

## Recorded, not fixed (D-20)

Phase 88 plan 05 records the behaviour as the golden `reader/expected/sideload-reads-the-undefined-store-file`
and the pairwise rows with `runner: sideload`. The Rust reader (88-08) replays it as recorded. Changing
it is a separate decision with its own golden diff: either every reader returns `null` for a runner with
no store name, or `readGamelibFixStatus` stops being the odd one out.
