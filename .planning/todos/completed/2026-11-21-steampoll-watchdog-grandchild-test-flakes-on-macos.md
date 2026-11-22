---
created: 2026-11-21T03:44:28.000Z
title: gamelib-steampoll watchdog_real grandchild test flakes on macOS runners
area: tests
severity: medium
platform: macos
ready: code
files:
  - src-tauri/crates/gamelib-steampoll/tests/monitor.rs
  - src-tauri/crates/gamelib-steampoll/src/monitor.rs
---

## Problem

Test `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first`. Assertion
`assert!(alive(rig.grand))` at src-tauri/crates/gamelib-steampoll/tests/monitor.rs:711 failed on
Rust test runs 44823009090 and 44858803826 (macOS leg). Both went green on rerun.

This is the third cause of UAT gap G-82-2-r3 and is not Phase 82 code. The gap's missing item 3
asks for a deadline-based wait or a record of why the test stays flaky, and this todo is that
record.

## Hypothesis (unverified)

WATCHDOG_SH (src/monitor.rs:35) loops while the parent, the inner shell `$m` and the watched pid
are all alive, ticking with `sleep 1 & wait`. Once the test SIGKILLs the inner shell and the shell
reaps it, the next tick's `kill -0 "$m"` fails, the loop exits, and `cleanup` kills the recorded
grandchild `$g`.

The test sleeps 1500 ms, kills the inner shell, sleeps 300 ms, then asserts the grandchild is still
alive. If a tick lands inside that 300 ms window, the watchdog has already done the job under test,
and the precondition fails. Slow pgrep, ps and kill spawns on a loaded macOS runner make that more
likely.

Not measured: whether macOS's /bin/sh reaps `$m` sooner than Linux's.

## Solution

Directions, not yet decided:

- (a) Reproduce first. Loop the single test many times under CPU load on macOS, e.g. from
  src-tauri `cargo test -p gamelib-steampoll --test monitor still_kills_the_grandchild_when_the_middle_process_dies_first`,
  to confirm the window theory.
- (b) Make the precondition tolerate the watchdog winning the race, so the test always ends with
  the grandchild gone within 5 s.
- (c) Sample the precondition immediately after the SIGKILL, before any sleep.
- No retries.

## Outcome (2026-11-22)

Resolved in `0c1ea4a87` (test-only; product `WATCHDOG_SH` unchanged). The hypothesis held: the
test's fixed 1500 ms + 300 ms sleeps phase-locked the `alive(rig.grand)` sample ~150 ms before the
watchdog's second tick, which kills the orphan by design; spawn latency on a loaded runner slid the
sample past it. CPU load alone did not reproduce it (0/40); 30 concurrent copies did (31–46/90).
The fix is neither (b) nor (c): it syncs on two observed watchdog ticks instead of the fixed sleep
and freezes the watchdog with SIGSTOP across the kill and the strict precondition, then SIGCONTs
before the unchanged 5 s wait. 0/840 locally under the same loads; macOS CI green in four
consecutive Rust test runs. Closes the third cause of UAT gap G-82-2-r3. Debug session:
`.planning/debug/resolved/steampoll-watchdog-grandchild.md`.
