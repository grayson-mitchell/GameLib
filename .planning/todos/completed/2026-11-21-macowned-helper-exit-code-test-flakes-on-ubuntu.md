---
created: 2026-11-21T00:00:00.000Z
title: 'gamelib-steamcm macowned helper exit-code test flaked on ubuntu (HelperFailed vs AccountMismatch)'
area: tests
severity: minor
platform: any
ready: code
---

## Problem

Rust test run 44872994911 (main 5bd0c0b72), ubuntu leg:
`macowned::tests::a_missing_helper_and_helper_exit_codes_fall_back` panicked at
`src-tauri/crates/gamelib-steamcm/src/macowned.rs:558` — left `Err(HelperFailed)`,
right `Err(AccountMismatch)`. `macowned.rs` was not touched in the pushed range
(005cd414d..5bd0c0b72) and the test passed on Windows and macOS, so it is treated as intermittent.
Unverified: the exit-code case may race the helper process's exit status on a loaded runner.

## Solution

Re-run to confirm intermittency, then find where the exit code can be lost (spawn/wait ordering)
and make the test deterministic. No retries.
