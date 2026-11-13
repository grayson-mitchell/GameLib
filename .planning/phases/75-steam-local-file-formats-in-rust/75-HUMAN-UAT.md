---
status: partial
phase: 75-steam-local-file-formats-in-rust
source: [75-VERIFICATION.md]
started: 2026-11-14T00:00:00Z
updated: 2026-11-14T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. rust-test.yml green on all three OSes for the post-review-fix commits
expected: Push of the WR-01..08 fix commits (1cf90847c..cf8bb6d43) runs rust-test.yml green on macos-latest, ubuntu-latest and windows-latest, including the gamelib-depot Windows build (not checkable locally) and the clippy ratchet.
result: [pending]

### 2. WR-02 co-install delete-guard change signed off
expected: Operator accepts that findOtherManifestsWithInstalldir returns the '<unknown>' conflict when the ACF scan skipped any sibling entry, so only the manifest is removed and the shared install dir is kept (recorded in 75-PARITY.md "Post-review change"; four overrides in overrides/library.json).
result: [pending]

### 3. WR-01 / WR-07 conservative failure paths accepted
expected: Operator accepts the failure-path behaviour covered by Jest only (live UAT exercised success paths): a rejected steamfiles read yields 'unknown' (refresh skips the reconcile instead of persisting not-installed; uninstall poll skips the tick; delete refuses with running-check-failed; Mac Play launches without quitting Steam), and an existing-but-unparseable manifest counts as installed (cancelDelete refuses 'manifest unparseable').
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
