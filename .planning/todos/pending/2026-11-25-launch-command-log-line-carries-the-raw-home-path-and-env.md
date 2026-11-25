---
created: 2026-11-25T16:00:00.000Z
title: "The `Launching <title>:` command line logs the full environment and the raw home path"
area: logging
files:
  - src/backend/commandRunner.ts:468 (the `${logMessagePrefix}:` line written with `safeCommand`)
  - src/backend/storeManagers/legendary/games.ts:1152 (the `Launching <title>` prefix)
  - src/backend/storeManagers/gog/games.ts:946 (the same prefix)
  - src/backend/storeManagers/nile/games.ts:510 (the same prefix)
severity: medium
platform: any
ready: code
---

## Problem

Observation O1 from the 87-69 re-run 1 gate (2026-11-24). The launcher's `[Legendary] Launching <title>:` line, written by
`commandRunner.ts` through `getRunnerCallWithoutCredentials` and `logger.logInfo([prefix, safeCommand], ...)`, carries the
whole launch environment and the command, including the operator's raw home path and the pinned-engine paths. Across the 8
archived logs the line matched 2 times, one of them the same line duplicated through the `.old` copy.

The 87-61 redactor that rewrites engine-origin lines (home as `~`, no account name, no token, no full argument line) lives in
the Rust shell's `ShellEngineLog`. It does not reach this TypeScript line, so this is the one place in `gamelib.log` where a
launch writes the home path unredacted. The line is launcher-origin and predates Phase 87, so it sat outside re-run 1 item 2's
engine-origin contract, and the gate scored item 2 by excluding it.

The Phase 88 launch port moves launch into Rust: that is the natural place to write this line through the same redaction
(home as `~`, no full argument line, no environment dump) instead of carrying the TypeScript behaviour across.

## Not fixed in Phase 87

The user decided on 2026-11-25 that O1 to O3 are observations, not findings against the re-run items, so this is tracked here
and not planned in Phase 87.

## To do

Write the launch command line through the engine log's redaction, or redact it in `commandRunner.ts` before `logInfo`: home
path as `~`, the environment omitted or its values dropped, and no full argument line. Cover it with a test that fails on the
raw home path. Check the three store prefixes (legendary, gog, nile) and any other `logMessagePrefix` caller.
