---
quick_id: 260823-dyd
slug: park-34-2-human-uat-nothing-actionable-r
date: 2026-08-23
status: complete
---

# Quick task 260823-dyd — park 34.2-HUMAN-UAT

## Problem

`34.2-HUMAN-UAT.md` read `status: diagnosed` → amber, i.e. "someone must act". Nobody can.
Both items were RUN on real hardware 2026-08-22: UAT-34.2-02 PASSED outright, UAT-34.2-01
PASSED its dev half. Its packaged half FAILED on `R-34.5-G1-PKG`, a defect owned by another
phase, and no re-run of this document can close it. The file says so itself
(`/gsd-verify-work 34.2` "should NOT be resumed against this file").

Amber here spends the operator's attention on a file with nothing in it to do — the exact
failure mode the colour coding exists to prevent.

## Why `parked`, not green

`complete` asserts a pass. UAT-34.2-01's packaged half **failed**; claiming complete would
erase a real finding. `parked` — already in the extension's vocabulary since v0.4.0, badge ⊘,
`charts.purple` — means "stood down on purpose", sits in `SETTLED` so STATE.md cannot repaint
it, and is **dropped by `rollup()`** so it holds nothing back. No new vocabulary needed.

## Approach

1. `status: diagnosed` → `status: parked`, plus `parked_on:`, `parked_reason:` and a
   `superseded_by:` block. `blocked_on:` is kept verbatim — it is accurate and carries the
   homing history.
2. `superseded_by:` is written as an explicit **TBD with the acceptance criterion spelled
   out**, because the ROADMAP note only says Phase 35 should "mint a requirement". Closing
   halves (a) and (b) of `R-34.5-G1-PKG` makes locale resolution *possible*; it does not
   re-make UAT-34.2-01 step 4's observation. Without the criterion written down, that
   coverage disappears silently — the `blocker-records-rot-silently` shape.
3. Check the two other `status: diagnosed` gate files for the same shape.

## Verification required

- Badge resolves `parked`; `folderArtifactStatuses` returns it and `rollup()` drops it.
- `gsd-sdk query audit-uat` results **byte-identical** before and after — a status flip on a
  UAT file must not hide an item from the sweep.
- All 54 folder colours diffed.
