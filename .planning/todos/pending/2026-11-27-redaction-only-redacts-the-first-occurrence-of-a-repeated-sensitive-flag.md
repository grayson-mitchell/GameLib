---
created: 2026-11-27T11:00:00.000Z
title: "getRunnerCallWithoutCredentials redacts only the first occurrence of a repeated sensitive flag, so the second value reaches the log"
area: launch
files:
  - src/backend/commandRunner.ts:223 (the plain branch redacts modifiedCommand.indexOf(sensitiveArg) + 1 only)
  - src/backend/commandRunner.ts:218 (the PowerShell branch replaces with a non-global regex, first match only)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/redaction/vectors.json (redact-plain-repeated-flag, redact-ps-repeated-flag)
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-03 `redaction` golden (D-20: kept as recorded, not fixed there).
For each of the eight credential flags the plain branch redacts the value after the FIRST occurrence (`indexOf`), and
the PowerShell branch replaces the first `-ArgumentList` match only. `['auth', '--code', 'a', '--code', 'b']` logs
`--code <redacted> --code b`, so the second value is written to the runner log and every log writer unredacted. No
live call site passes a sensitive flag twice today (the census in the function's comment lists one use per call), so
the leak is latent.

## Solution

Not part of the port. The Rust redaction replays the golden as it is, second value included. After that, decide in one
deliberate change, recorded in a delta, whether every occurrence is redacted.

## Also (88.2 code review IN-04)

Deferred here in 88.2 UAT test 2. The Rust port has the same two neighbours of this gap, both latent today (no caller
uses them; the `--code`, `--token`, `--password` and `--client-id` call sites were checked):

- `src-tauri/crates/gamelib-launch/src/runner/redact.rs:100-117`: the `--flag=value` form is one argv element, never
  equals the flag, and is not redacted.
- `redact.rs:121-126`: the env list is logged unredacted, so anything credential-like a future caller puts in
  `options.env` reaches `gamelib.log`.

Decide all three in the same delta.
