---
phase: 71-rust-shell-module-decomposition
plan: 13
subsystem: infra
tags: [rust, tauri, wave-3, gate, ci, live-check, store-embed]
requires: [71-12]
provides:
  - wave-3-end baseline
  - Wave 3 automated gate passed, three-leg CI green (covers Waves 2 and 3), live check approved
affects: [71-14]
key-files:
  created:
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-3-end/
key-decisions:
  - "D-03 ordering deviation: Wave 3 live check ran before CI went green (GitHub release-asset outage); CI subsequently went green"
requirements-completed: [D-03, D-10, D-12, D-13, D-14, D-15]
duration: multi-session (CI outage retries)
completed: 2026-11-09
---

# Phase 71 Plan 13: Wave 3 gate Summary

Wave 3 (store_embed split) closes: automated gate passes, rust-test.yml is green on all three legs for the pushed HEAD, and the operator approved the live check with the title bar OFF and ON.

## Automated gate
- wave-3-end captured at a7b08ede2. cargo 445 passed / 0 failed / 2 ignored; jest 24 suites, 714 passed, 2 failed (known WR-07, C3).
- `baseline.sh compare wave-3-start wave-3-end`: all PASS (cargo 445 >= 445, no test name lost or added, clippy list identical and exit 0, jest failing set identical, 714 >= 714).
- `moveproof --wave 3`: Layer 1 0/0; Layer 3 (store_embed) 0 removed/changed, 0 added/changed; PASS. Only `use` items to review: `pub(crate) use controls/layout/open/policy/state::*`.
- `pnpm check:ipc-contract`: up to date. `sizes.py` exit 0 (only allowed files OVER). `graphify update .` ran.

## CI (green)
Plain `git push` 6e3b5963e..05bf973bf succeeded; it covered the Wave 2 and Wave 3 commits plus other sessions' commits (operator-authorized).

rust-test.yml run 42469036864 on 05bf973bf. Attempts 1-9 failed only in `./.github/actions/install-deps` from a GitHub release-asset outage (504, then 502/503 and "fetch failed: other side closed"); no cargo or clippy step failed in any attempt (macOS passed from attempt 6, ubuntu from attempt 8). Attempt 10 (2026-11-09 ~00:45 NZDT) succeeded on windows-latest, macos-latest and ubuntu-latest.

This green run is the D-03 three-leg evidence for BOTH Wave 2 and Wave 3 (operator decision recorded in 71-11). It confirms the open items: `linux_store_embed_layout` compiles on Linux, the win32 unused_imports ceiling stays 0, and cfg-gated login_window children build on Linux and Windows.

## Live check (operator approved 2026-11-09)
Sidecar rebuilt before the check. Operator replied "approved"; OFF and ON recorded as pass for each item.

| Item | Title bar OFF | Title bar ON |
| --- | --- | --- |
| Embedded store page: open, resize/track content area, back/forward/reload/navigate, hide/show, link popup, Steam handoff + throttle, user agent render | pass | pass |
| Humble sign-in and sign-out | pass | pass |
| GOG sign-in and sign-out | pass | pass |
| Amazon sign-in and sign-out | pass | pass |
| Epic sign-in and sign-out | pass | pass |
| Epic embed: open, resize, hide/show | pass | pass |
| GOG -> Epic -> GOG surface hide | pass | pass |
| Epic embed: download hand-off, close | pass | pass |

## Task Commits
1. 05bf973bf capture wave-3-end baseline (pushed)
2. Task 2 (live check) is verification only, no commit.

## Deviations from Plan
**1. [D-03] Ordering** - the live check ran before CI went green because of the release-asset outage (operator-authorized). CI later went green on the same HEAD, so no evidence is missing.

No code changes or fix commits.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
