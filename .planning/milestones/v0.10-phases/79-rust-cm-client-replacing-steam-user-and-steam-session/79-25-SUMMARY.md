---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 25
subsystem: steam-cm
tags: [flag-flip, uat, rust-cm]
requires: [79-24]
provides: [cm default rust, 79-UAT.md part A]
affects: [79-26, 79-37]
key-files:
  modified:
    - src/backend/storeManagers/steam/cm/steamCmFlags.ts
    - src/backend/storeManagers/steam/cm/__tests__/steamCmFlags.test.ts
  created:
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-UAT.md
decisions:
  - "cm default flipped to rust after 79-PARITY.md APPROVED (CM ops); signin default stays ts until UAT-A passes"
  - "UAT item 10 (wrapped logon) omitted because 79-WRAP-RETEST verdict is PASS; numbering skips 10"
metrics:
  tasks: 2
  completed: 2026-11-15
requirements: [D-02, D-05, D-06, D-07, D-11, D-18]
---

# Phase 79 Plan 25: cm default flip and UAT part A Summary

The `cm` flag now defaults to rust (signin stays ts), and 79-UAT.md part A holds 10 runnable live items for 79-26.

## Tasks

1. Flip the cm default: commit 27be7df30. `STEAMCM_CM_DEFAULT = 'rust'`, tests updated (cm defaults rust, signin ts, `GAMELIB_STEAMCM_CM=ts` still selects ts, flags independent). The gate check `Status: APPROVED (CM ops)` passed first. Jest `steam/cm` 35/35 green; prettier unchanged. `jest.setupContainment.ts` still pins both flags to ts and was left alone per the plan.
2. Author 79-UAT.md part A: commit d9f299508. Ground rules, Structural Reachability Review, items 1 to 9 and 11 (all `result: pending`), Part B placeholder.

## Deviations from Plan

None to the code. Item 10 is omitted by the plan's own condition (WRAP-RETEST `verdict: PASS`), so item numbers go 1-9 then 11; the reachability table notes this.

## Notes for 79-26

- Proof strings come from `session.rs`: `CM logon mode=authenticated reason={reason}`, `CM sleep gap {n}s detected`, `CM session rebuilt in {ms}ms`. The `reason=user-refresh` value and the `[steamcm] rust <channel>` names (`steamcm_signin_qr_start`, `steamcm_signin_status`, `steamcm_signin_guard_submit`) are taken from the plan and were not confirmed in source; 79-26 should confirm them before marking an item `blocked`.
- Item 9 expects a "steamcm shutdown outcome" line in the shell log; the exact wording was not located (`session.rs` `shutdown` returns a `RestoreOutcome`).
- Item 11 references a Rust CLI binary build step by description only.
- The UAT file changed on disk after the commit was made (editor or formatter); the committed content may differ slightly from the working tree.

## Self-Check: PASSED
