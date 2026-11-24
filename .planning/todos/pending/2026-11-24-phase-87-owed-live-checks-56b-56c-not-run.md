---
created: 2026-11-24T10:00:00.000Z
title: "Phase 87 owed live checks 56b-1, 56b-2, 56b-3 and 56c-3 were not run"
area: engine
files:
  - .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md ("Live checks owed by 87-56a, 87-56b, 87-56c and 87-57")
  - .planning/phases/87-engine-wine-and-tools/87-RERUN-1-HUMAN-UAT.md (the re-run does not cover them)
severity: medium
platform: macos
ready: live-gate
---

## Problem

Four live checks that Phase 87 plans owed to the macOS gate were not run in the 87-59 gate (2026-11-24), and the re-run
contract (87-RERUN-1) does not cover them either:

- **56b-1** a built-in-engine Steam bridge launch registers its selection, runs, and Stop clears it. The selection is not
  observable live today: there is no log line, and the badge is independent of the live selection.
- **56b-2** a DRM-mode launch restores to CrossOver and the install's redist switch reaches Rust. It needs a DRM-mode title.
- **56b-3** CrossOver installed only under `~/Applications`: the Steam bottle's synchronous lookup finds it. Not coverable on
  this Mac, where CrossOver is in `/Applications`.
- **56c-3** engine-state and notice dismissals come from Rust alone. The two dismissable notices were already dismissed in the
  notices store, so there was nothing to dismiss.

56c-1 (cold start, prompt quit) was done: `exit finished in 51 ms` on every launch.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so these are deliberately not planned there.

## To do

Run each on a signed build when its precondition exists: a DRM-mode Steam title for 56b-2, a Mac with CrossOver under
`~/Applications` for 56b-3, a fresh notices store (a profile where the engine notices were never dismissed) for 56c-3, and a
log line or a visible indicator for the live selection before 56b-1 can be observed at all.
