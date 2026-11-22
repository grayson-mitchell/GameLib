---
status: testing
phase: 85-store-host-config-and-versioned-migrations
source: [85-VERIFICATION.md]
started: 2026-11-22T09:30:00Z
updated: 2026-11-22T09:30:00Z
---

## Current Test

number: 1
name: SC3 residual: credentials that were not signed in during the live gate
expected: |
  Either the operator accepts the live-gate evidence as sufficient (Steam's stored credential was read with zero Keychain prompts on the signed v0.10.0 → v0.11.0 upgrade), or UAT item 2 is re-run on a signed baseline with Humble, Epic and the SteamGrid key signed in, and they survive the upgrade with no prompt.
awaiting: user response

## Tests

### 1. SC3 residual: credentials that were not signed in during the live gate
expected: The operator accepts the live-gate evidence as sufficient (Steam's stored credential was read with zero Keychain prompts on the signed v0.10.0 → v0.11.0 upgrade), or UAT item 2 is re-run on a signed baseline with Humble, Epic and the SteamGrid key signed in, and they survive the upgrade with no prompt.
result: [pending]

### 2. 85-15 prohibition: reset and uninstall must not recreate deleted settings
expected: The operator decides whether TS-side settings resurrection after reset or uninstall (review C-WR-01, C-WR-02; the cached GameConfig instance and missing dropSettingsDoc in resetHeroic; pre-existing before Phase 85) is fixed before the phase closes or filed as a follow-up. Rust-side eviction already holds.
result: [pending]

### 3. Triage the open code-review warnings
expected: The operator decides the disposition of the 22 warnings in 85-REVIEW.md (fix now with /gsd-code-review 85 --fix, or file as todos), and 85-REVIEW-DISPOSITION.md is updated to match.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
