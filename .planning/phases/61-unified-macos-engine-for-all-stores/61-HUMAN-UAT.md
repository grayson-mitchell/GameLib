---
status: partial
phase: 61-unified-macos-engine-for-all-stores
source: [61-VERIFICATION.md]
started: 2026-11-07T10:00:00Z
updated: 2026-11-07T12:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Decide on review WR-01: inconclusive pre-flight always launches on CrossOver
expected: Either accept it (59 D-09: inconclusive is not broken), or have it fixed to keep the bottle's current engine / limit it to invalid-bottle, with an honest log label instead of `cx-healthy`. The rule lives in shared `decideLaunchEngine` (`engineDecision.ts:487-509`), so Steam launches and installs are affected too, and that path had no Steam UAT.
result: pass — decided FIX 2026-11-07; fixed in 61-26: an inconclusive pre-flight keeps the bottle's marker engine (non-crossover marker -> built-in pin, otherwise CrossOver), labelled reason=cx-inconclusive, no fallback toast or notice; Steam and non-Steam busy-bottle tests in engineDecision.test.ts

### 2. Decide on review WR-02: notice-only deadline raises the main window
expected: Accept, or deliver the launch-deadline-unconfirmed notice without `raiseMainWindow` plus a modal over a running (possibly fullscreen) game the matcher cannot see.
result: [pending]

### 3. Run or waive 61-UAT items 13 and 14 (live CrossOver)
expected: Item 13 — a game keeps running past 180 s and only a notice appears. Item 14 — Sideload Run installer runs in the game's own GameLib-sideload bottle. Both are covered by unit tests; record the result in 61-UAT.md.
result: [pending]

## Summary

total: 3
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
