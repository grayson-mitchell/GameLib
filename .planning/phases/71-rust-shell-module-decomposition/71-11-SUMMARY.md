---
phase: 71-rust-shell-module-decomposition
plan: 11
subsystem: infra
tags: [rust, tauri, wave-2, gate, ci, live-check]
requires: [71-10]
provides:
  - wave-2-end baseline
  - Wave 2 automated gate passed and live check approved; three-leg CI PENDING (GitHub release-asset outage)
affects: [71-12, 71-13]
key-files:
  created:
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-2-end/
key-decisions:
  - "D-03 deviation: Wave 2 three-leg CI deferred to 71-13, which must cover Waves 2 and 3 together before its live check"
requirements-completed: [D-12, D-13, D-14, D-15]
duration: 90min
completed: 2026-11-08
---

# Phase 71 Plan 11: Wave 2 gate Summary

Wave 2 automated gate passes and the live check is approved (title bar OFF and ON). Three-leg CI did NOT complete: it is PENDING because of a GitHub release-asset outage, not green.

## Automated gate
- wave-2-end captured at BASE_REF 752d8dbfe. cargo 445 passed / 0 failed / 2 ignored; jest 714 passed, 2 failed (known WR-07, C3).
- `baseline.sh compare wave-2-start wave-2-end`: all PASS (cargo counts, no test name lost or added, clippy list identical, clippy exit 0, jest failing set identical, jest passed 714 >= 714).
- `moveproof --wave 2 --require-all`: PASS.
- `pnpm check:ipc-contract`: up to date.
- `sizes.py` exit 0; over-limit files are only the allowed single_instance.rs, store_embed.rs, tray.rs.
- `graphify update .` ran.

## CI (PENDING, D-03 deviation)
Operator-authorized 2026-11-08. rust-test.yml run 42464334792 on 6e3b5963e failed attempts 1-7 on all three legs in `./.github/actions/install-deps` with `Error: Failed to download https://github.com/<store-tool>/releases/download/...: 504` (gogdl, legendary, nile, comet, Epic integration exe; a different asset each time). No cargo, clippy or ratchet step ran. This is a GitHub release-asset outage, reproduced via curl from the dev Mac, while githubstatus.com showed "All Systems Operational" (not updated since 09:04Z). A background retry loop re-runs the failed jobs when downloads recover.

Operator decision: run the live check before CI, then start Wave 3 with CI pending. 71-13's push and three-leg CI must cover Waves 2 and 3 together before its live check.

## Live check (operator approved 2026-11-08)
Sidecar rebuilt 22:19 before the check. Operator replied "approved"; OFF and ON recorded as pass for each item.

| Item | Title bar OFF | Title bar ON |
| --- | --- | --- |
| Embedded store page | pass | pass |
| Humble (sheet attach, native bar, Cmd+V, cookie poll, disconnect clears, reveal key) | pass | pass |
| GOG and Amazon sign-in/out | pass | pass |
| Epic pristine login + sign-out clears default-store cookies | pass | pass |
| Epic embed (open, resize, hide/show, switch to GOG, download hand-off, close) | pass | pass |
| Devtools | pass | pass |
| Invite picker | pass | pass |

## Task Commits
1. 6e3b5963e capture wave-2-end baseline (pushed)
2. Task 2 (live check) is verification only, no commit.

## Deviations from Plan
**1. [D-03] Three-leg CI not completed** - see CI section; status PENDING, operator-authorized.

No code deviations. Unrelated commits landed on main after 6e3b5963e from other work (quick-261108-ved 339bdd386 moved keyring helpers from login_window.rs to keyring_dispatch.rs; 53b5f9366 added a moveproof `--stem` override); they are outside this plan.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED

## CI update (2026-11-09)
Wave 2's three-leg CI evidence is rust-test.yml run 42469036864 attempt 10, green on windows-latest, macos-latest and ubuntu-latest on 05bf973bf, which contains all Wave 2 commits, per the operator's decision. The PENDING status above is superseded; see 71-13-SUMMARY.md.
