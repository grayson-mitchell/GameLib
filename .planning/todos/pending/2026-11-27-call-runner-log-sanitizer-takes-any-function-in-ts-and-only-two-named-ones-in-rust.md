---
created: 2026-11-27T13:00:00.000Z
title: "callRunner's logSanitizer takes any function in the TS; the Rust runner takes the two named sanitizers only"
area: launch
files:
  - src/common/types.ts:549 (logSanitizer?: (line: string) => string)
  - src/backend/commandRunner.ts:505 (onChunk applies the function to the writers' text)
  - src/backend/__tests__/oracle/runner.oracle.test.ts (the mask-secret test-local sanitizer and the test-local-sanitizer delta)
  - src-tauri/crates/gamelib-launch/src/runner/sanitize.rs (LogSanitizer { GogAuth, NileAuth })
  - src-tauri/crates/gamelib-launch/tests/golden_runner.rs (the case replayed with the writers' raw text blanked)
severity: minor
platform: any
ready: code
---

## Problem

Recorded by 88.2-08 (D-20: kept as recorded, not fixed in the port). The TS `RunnerOptions.logSanitizer` is any
`(line: string) => string`. Only two exist in the product (gog's and nile's `authLogSanitizer`), and the Rust
`call_runner` takes them by name (`logSanitizer: "gogAuth" | "nileAuth"`). The one golden case that hands the TS a
function of the test's own (`mask-secret`, `line.replace('SECRET', '***')`) cannot be reproduced, so it replays with the
text written to the log writers blanked on both sides (`test-local-sanitizer` in golden/runner/deltas.json); the result,
the stream, the window, the write order and every other entry are still compared.

## Solution

Not part of the port. 88.2-22 moves the TS call sites to the sanitizer names; at that point the TS type can narrow to the
two names too, and the `mask-secret` case can be re-recorded with a named sanitizer so the writers' text is compared
byte for byte instead of blanked.
