---
created: 2026-11-27T17:00:00.000Z
title: "Windows: batch files and embedded-quote command lines differ between Node and Rust (the direct runner path copies Node)"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/runner/call_runner.rs (BATCH_REFUSAL, is_batch_file, the refusal before the game and helper split)
  - src-tauri/crates/gamelib-launch/tests/windows_quoting.rs
  - src-tauri/crates/gamelib-launch/tests/batch_refusal.rs
  - src-tauri/crates/gamelib-launch/src/bin/cmdline_echo.rs
severity: minor
platform: windows
ready: human
---

## Problem

Recorded by the 88.2-14 Windows cross-check (D-20: a runtime difference, not fixed in the port). Two things differ
between the runtime the TS runner used (Node's `child_process`, libuv) and the one the Rust runner uses (`std::process`):

1. **Batch files.** Node 18.20.2 and later (the project needs 22) refuses to start a `.bat` or `.cmd` without a shell:
   `spawn` throws `spawn EINVAL`. Rust's std runs the file through cmd.exe. `call_runner`'s direct (non-PowerShell) path
   now refuses a program ending in `.bat` or `.cmd` with Node's text, so the outcome of a call matches. The
   PowerShell form (`Start-Process`) does run a batch file and is unchanged. A runner or sideload game whose launch
   target is a batch file therefore fails with `spawn EINVAL` on the direct path, in the TS runner as well as the Rust one.
2. **Embedded quotes.** For an argument that holds a `"`, libuv wraps the whole argument in quotes and escapes inside
   (`"a\"b"`) where Rust's std escapes in place (`a\"b`). Both parse to the same argument in the child (the cross-check
   asserts that, on a real exe, for every row), so no runner argument is mangled; only the bytes of the command line
   differ. The program name differs the same way (Rust always quotes it).

## Solution

Decide whether a batch-file launch target should be supported (run through `cmd.exe /c` with an argument check, or kept
refused like Node). If supported, it needs its own quoting, because cmd.exe's rules are not CommandLineToArgvW's.
The test table in `windows_quoting.rs` records, per row, what Node did and what Rust's std did with the same
`echo.bat` and `echo.cmd`, so the decision can read the output of the Windows leg. Nothing to do for item 2 unless a
program is found that parses its own command line instead of using the CRT.
