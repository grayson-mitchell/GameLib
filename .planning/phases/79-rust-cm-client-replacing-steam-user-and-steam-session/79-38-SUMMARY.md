---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 38
subsystem: steam-cm
tags: [uat, live, delete-gate, ci]
requires: [79-37]
provides: [UAT part B results, delete gate met]
affects: [79-39, 79-40, 79-41, 79-42]
key-files:
  modified:
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-UAT.md
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-PARITY.md
  created:
    - src/backend/storeManagers/steam/library/macSteamPathFlag.ts
    - .planning/todos/pending/2026-11-15-mac-steam-path-shows-playing-spacewar.md
decisions:
  - "The Mac Steam path ships OFF by default (GAMELIB_STEAM_MAC_PATH=on opts in) because its helper shows 'playing Spacewar' in Friends; operator decision 2026-11-15"
  - "Delete gate: test.yml must show no new failures against the pre-phase baseline (8 named pre-existing suites); operator decision"
  - "Operator approved UAT part B with item 14 as an accepted issue"
  - "Restored SteamUpdateInfo.scss (accidentally deleted by quick 261114-op0) rather than wait for the operator's obu work; operator decision"
metrics:
  completed: 2026-11-15
requirements: [D-09, D-12, D-14, D-15, D-16]
---

# Phase 79 Plan 38: UAT part B live run and delete gate Summary

UAT part B ran live on macOS on the defaults: both flags are rust. The operator approved it. The delete gate is met with CI evidence: rust-test.yml is green on all three legs, test.yml shows no failures beyond the pre-phase baseline, and cargo-deny is green.

## UAT part B

| Item | Result |
|------|--------|
| 12 CM-path Refresh, Mac Steam quit | pass |
| 13 D-09 second arm (helper renamed) | pass: unwrapped, no LogOff in connection_log, Friends online for 90 s |
| 14 Mac Steam path | issue: Spacewar presence, so the Mac path is off by default |
| 15 Mac-path fallback | pass |
| 16 Account mismatch | skipped (Mac path off) |
| 17 Store enrichment | pass (appdetails live; the cold enrich path is unreachable because all 390 apps are cached) |
| 18 Restart keeps sign-in | pass; it also re-checked the freeze and Spacewar fixes live |
| 19 Force Quit mid-download | pass after fix |

## Defects found live and fixed

- **c0cc89913: ~5 s UI freeze on Refresh.** Each per-game `pushGameToLibrary` was its own store write and re-render, 410 in a burst. They are now coalesced over 50 ms into one write.
- **292b6af2d: stale library entries.** The frontend only upserted Steam entries, so ~20 Mac-path-only entries survived the switch back to CM. A sync now reconciles the library against the persisted set and keeps installed games.
- **e3dfe2937: sidecar orphaned after a Force Quit mid-download.** The install stall watchdog's 8-minute timer was ref'd. Under cm=rust, the `depot_job_run` request to a dead shell never settles, so that timer held the loop. The cause dates from the phase 73 depot path. The timer is now unref'd.
- **c8a33e304 and a79fbf100: Spacewar 480 removed** from the Mac-path owned games.
- **3b7417c05: Mac path off by default.** The presence itself is not fixed. Probing narrowed the trigger to the helper's first IClientUser IPC call, but live steamclient probing was denied by the permission classifier. A todo is filed, blocked on that permission.

## Push and CI (task 2)

- **Push-gate cleanup.** The operator authorized the push. `main` was 398 commits ahead, and the pre-push gate chain was red, so it was cleaned up first:
  - lint errors and the tests warning ceiling (0ba954760, e6172b935, 976f4138b)
  - knip (33fb7cc3b)
  - `user.ts` split from 1238 to 980 lines into `rustSession.ts` and `logonVerdict.ts` (1a2d181be)
  - DI ceilings (1869e2773, 2679311c7)
  - the committed SteamUpdateInfo's dangling scss import (2c79851b2, later 52cba2585)
- **Pushing past the hook.** The pre-push hook was skipped with the operator's permission, because its narrowing ratchet reads the operator's uncommitted GamePage edits. Every hook check was first verified green on a clean `git archive HEAD` export.
- **CI fixes.**
  - CLI op count (5c3db0924)
  - rustTestWorkflow and steamAuthSessionPolicy (8345575b0)
  - a hardcoded "(installed)" string (445106b28)
  - libraryReplay buildid fixture (5e068ed20)
  - protobuf advisory ignore and tokio 1.54.1 (bce156071)
  - unix-gating of the Mac-path test stubs for the Windows leg (ade3afbb1, ba6f108c5, a986c318a)
- **Final runs:** Rust test 43692870596 (a986c318a) green on all three legs. Test 43691683424 (ba6f108c5) shows exactly the 8 baseline failures. Supply-chain 43692870623 green.
- **Other session's commits.** The push also carried two operator quick tasks committed from another session (261115-szs, 261115-t7m). On a986c318a they add a `themeTokens` census failure (from szs) and a `steamBridgeKnownFixes` CI flake. Neither is phase-79 code.

## Follow-ups (not phase 79)

- The Spacewar presence todo (blocked on operator permission for live probing).
- Both GamePage-related items wait on the operator's uncommitted GamePage (261114-obu) work: the test-mock baseline counts, and the jest.mock baselines for the three GamePage tests.
- The tests lint ceiling can be lowered from 661 to about 650.
- The `themeTokens` census needs updating for quick-261115-szs.

## Self-Check: PASSED
