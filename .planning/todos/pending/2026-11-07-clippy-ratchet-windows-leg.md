---
created: 2026-11-07T12:00:00.000Z
title: "Extend the clippy ratchet to the Windows leg"
area: build
files:
  - .github/workflows/rust-test.yml
  - meta/clippyRatchet.cjs
severity: minor
platform: windows
ready: human
---

## Problem

The clippy ratchet runs on the macOS leg only, so `cfg(windows)` Rust is never linted and a lint
regression that only exists under Windows cfg passes CI. A Windows ceiling could not be measured
from the Mac without risking a red leg on `main`: an equality ceiling fails in both directions,
and a cross-target run is not proven to match a native Windows run.

## Solution

1. Measure natively on Windows: the operator's Windows machine, or a `workflow_dispatch` run of a
   branch that prints `--list`.
2. Add a `win32` map to `CLIPPY_CEILINGS` in `meta/clippyRatchet.cjs`.
3. Drop the `if: runner.os == 'macOS'` gates in `rust-test.yml` (installing the pinned toolchain on
   both legs).
4. Delete caveat (f) from the workflow header.

`ready: human` because the measurement needs a Windows host or an operator-approved branch push.
