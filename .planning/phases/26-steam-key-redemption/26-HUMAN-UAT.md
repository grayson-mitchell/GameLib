---
status: partial
phase: 26-steam-key-redemption
source: [26-VERIFICATION.md]
started: 2026-07-20
updated: 2026-07-20
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live redeem of a valid unowned Steam test key
expected: Success message names the redeemed game/package, and the game appears in the Steam library view after refresh, with no app restart.
result: [pending]

### 2. Redeem a key for an already-owned title
expected: Distinct "already owned" message (copy.ts already-owned bucket), not the generic invalid/failed copy.
result: [pending]

### 3. Redeem a malformed-but-shaped (10-40 char, valid charset) key that Steam rejects as invalid
expected: Distinct "invalid key" message, no crash, modal stays open.
result: [pending]

### 4. Entry point visibility toggling with a real Steam login/logout cycle
expected: Sidebar "Redeem a Steam key" item is absent with no Steam session and appears immediately after a real Steam login, opening the modal on click.
result: [pending]

### 5. Log inspection after a real redeem attempt (any outcome)
expected: No raw key value appears anywhere in gamelib.log.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
