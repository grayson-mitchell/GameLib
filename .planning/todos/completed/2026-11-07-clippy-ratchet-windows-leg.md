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

## Resolution

The Windows ceilings were measured natively on the operator's Windows box (rustc 1.99.1, x86_64-pc-windows-msvc, at 4422ba2f3), a `win32` map was added to `CLIPPY_CEILINGS`, both `rust-test.yml` clippy steps lost their `if: runner.os == 'macOS'` gate, and caveat (f) was deleted from the workflow header. A prerequisite fix came first: the macOS leg was already red on main from 17 `clippy::get_first` warnings in the generated `ipc_contract.rs` (fixed at the generator, which now emits `args.first()` for index 0) plus a stale `needless_borrow` ceiling (deleted). macOS green is inferred from CI run 42417450472, not measured, until the next CI run. See quick task 261107-uh4.
