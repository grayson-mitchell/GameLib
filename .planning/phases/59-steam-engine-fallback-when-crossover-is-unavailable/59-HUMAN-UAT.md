---
status: partial
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
source: [59-VERIFICATION.md]
started: 2026-11-02T22:20:00+13:00
updated: 2026-11-02T22:20:00+13:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live no-CrossOver install of a title with shared redists (UAT 14 redist half)
expected: Install-time redist lines run the pinned wine (a path under the engine root), and no redist entry fails on a missing CrossOver binary.
result: [pending — Dinkum (1062520) has no shared redists, so this is covered only by unit tests]

### 2. Install refusal on a rejected stored Steam session (UAT 13, skipped)
expected: No bottle directory appears and no engine download starts.
result: [pending — this can't be reached through the UI when signed out, so it's unit-tested only; decide whether a live check is wanted]

### 3. Untested CrossOver build warning (D-15)
expected: A CrossOver version absent from testedCrossoverVersions logs a warning line, and the launch is not blocked.
result: [pending — never exercised live; it needs a build or fixture that isn't in the tested list]

### 4. Fallback bottle survives a different Wine-Staging build (UAT 11, skipped)
expected: The prefix updates silently, the game launches, and the save is still present.
result: [pending — no second Wine-Staging-macOS build exists; decide whether to accept the skip]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
