---
created: 2026-11-21T00:00:00.000Z
title: 'gamelib-log golden fails on Windows: chunks-wine-header writes a backslash in the per-game log path'
area: tests
severity: major
platform: windows
ready: code
---

## Problem

Rust test run 44872994911 (main 5bd0c0b72), Windows leg only:
`rust_writer_matches_the_ts_golden` panics at `src-tauri/crates/gamelib-log/tests/golden.rs:191`,
case `chunks-wine-header`. The Rust writer logs
`Logging to file(s) ${LOGDIR}/games/Game Name_gog\launch.log`; the TS golden has
`.../Game Name_gog/launch.log`. ubuntu and macOS are green.

Introduced by Phase 84 (gamelib-log crate, 84-02 / 84-04). Found during Phase 82 UAT item 2
re-test; not a Phase 82 regression.

## Solution

Decide which side is canonical: either the Rust writer joins the logged path with `/` to match the
TS oracle, or the golden normalises separators on Windows. Do not weaken the golden to skip the case.
