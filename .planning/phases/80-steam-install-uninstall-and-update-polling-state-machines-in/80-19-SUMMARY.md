---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 19
subsystem: steam-polling
tags: [rust, parity, divergence-ledger, locale]
requires: [80-17, 80-18]
provides:
  - "steamPollParity.test.ts: TS-vs-Rust record diff over 39 timelines, handler parity, locale parity"
  - "gamelib-steampoll-cli frozen_parity cargo test against expected-ts/ streams"
  - "divergences.json ledger and 80-PARITY.md report (APPROVED 2026-11-16)"
affects: [80-20, 80-21]
key-files:
  created:
    - src/backend/__tests__/steamPollParity.test.ts
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/divergences.json
    - .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-PARITY.md
decisions:
  - "DV-80-01 (ack-timeout-emits-anyway) and DV-80-02 (sidecar-not-ready-latest-wins) accepted by the operator 2026-11-16 ('approved')."
metrics:
  tasks: 3
  completed: 2026-11-16
---

# Phase 80 Plan 19: Poll parity Summary

The Rust poll loops are proven equal to the TS loops record by record over 39 timelines (285 records, 280 equal at the same index, 5 index differences all explained), with 0 unexplained diffs across stream, handler and locale (528 rows) parity. Both tests stay in the repo; the frozen-golden cargo test keeps parity enforced once the TS loops are deleted.

## Commits

- fdcc20ed5: parity tests, ledger and fixes (Task 1)
- 3c7d7b39c: operator approval recorded in 80-PARITY.md (Task 3); Task 2 was the operator checkpoint

## Divergences (both accepted)

- DV-80-01: Rust waits the 5 s ack timeout before the completion continuation (done status, notification); transport-only.
- DV-80-02: outbox holds the installed state event until the sidecar is READY (latest wins), reordering the done/notify/installed stream; content identical, startup window only.

The 80-17 carry-forward is resolved: the two non-identical timelines are exactly DV-80-01 and DV-80-02. `clearForcedWindowsViaBottle` (unconditional record) and title-at-start are documented in 80-PARITY.md as "Not diffs".

## Deviations from Plan

None beyond Task 1's in-commit fixes. The plan's note that divergences.json carries `accepted` fields did not apply: the ledger has no such field, so acceptance is recorded in 80-PARITY.md only.

## Self-Check: PASSED
