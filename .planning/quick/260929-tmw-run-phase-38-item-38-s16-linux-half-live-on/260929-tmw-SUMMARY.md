---
phase: quick-260929-tmw
plan: 01
status: complete
completed: 2026-09-29
---

# Quick 260929-tmw: Phase 38 sitting 9 -- 38-S16 Linux/row-7 half

`/mnt/PopGames` was left MOUNTED at its fstab mountpoint (restored, see `evidence/remount.txt`).

**Result: PASS on all four facts (F1 off-copy, F2 off-container, F3 on-copy, F4 on-container). `38-S16` STAYS OPEN**: it is scored on matrix rows 5 and 7 and the Windows/row-5 half is still not scored. The ledger is flat at 7 open, 19 discharged, 10 retired.

- Copy verdicts are codepoint-exact AT-SPI compares against `public/locales/en/gamelib.json` (OFF: 185 chars EXACT; ON with one library: 122 chars EXACT; the other key MISMATCH in both; 0/0 negative controls).
- Container verdicts rest on the STRUCTURAL basis; no Inspect Element route was exposed (`DOM_ROUTE=none`).
- `enableSteamNativeInstall` ended at its original `false`. No process survives; no install was dispatched.

## Deviations
- The machine crashed during Task 1; the task was resumed from the untracked files after a fresh baseline re-measure.
- The reboot remounted the games drive, so the operator unmounted it again to arm the ON branch. The device node had moved to `nvme1n1p3`.
- Task 4's non-interactive mount succeeded (cached polkit authorization), so no operator pause was needed for the remount.
- Closing the OFF dialog with its X also opened an IGDB child window (closed); GNOME Settings surfaced once and one click selected an item in it (no setting changed); one wrong game page was opened and left untouched.
- The first Task 3 commit missed most paths (a mistyped `git add`); it was amended before anything was pushed.
- `.planning/STATE.md` was not edited, per the plan; the quick-task row is for the orchestrator step.

Commits: `d29e767c9` (sitting record), `3d60c565f` (remount record).
