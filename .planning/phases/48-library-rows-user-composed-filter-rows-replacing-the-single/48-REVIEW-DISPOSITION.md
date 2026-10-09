---
phase: 48
review: 48-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "[Group 1, 48-12] ResizeObserver callback resizes its own observed target, so every width-changing resize frame raises a \"ResizeObserver loop\" error"
  - id: WR-02
    severity: warning
    disposition: open
    title: "[Group 1, 48-09] Stale-focus ring suppression now keys off `.listing:hover`, hiding keyboard focus whenever the pointer rests anywhere in the library"
  - id: IN-01
    severity: info
    disposition: open
    title: "[Group 1, 48-12] `pageScrollDelta` tolerance and its sweep test model a geometry the DOM no longer has"
  - id: IN-02
    severity: info
    disposition: open
    title: "[Group 2, 261008-aoe] Retry is a silent no-op while a dismissed overlay plays its 500ms exit"
  - id: IN-03
    severity: info
    disposition: open
    title: "[Group 2, 261008-aoe] New `TauriLoginPanel` tests replace `window.location` and never restore it"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "`hydrateFocusRowSelection` \"NEVER rejects\" contract is broken if `onError` throws"
  - id: IN-05
    severity: info
    disposition: open
    title: "`testContainment.test.ts` bookkeeping not maintained for the new suite"
  - id: IN-06
    severity: info
    disposition: open
    title: "Hydration guard is per-module, not per-mount; the \"once\" claim holds per page load only"
  - id: IN-07
    severity: info
    disposition: open
    title: "Drift-guard comment overstates what `pnpm codecheck` catches"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Legacy `libraryTopSection` seed never reaches the renderer (SPEC R7 not delivered at runtime)"
  - id: IN-04
    severity: info
    disposition: open
    title: "Stale doc comment on `FocusRowSelection`"
open: 8
total: 11
recorded: 2026-10-07T19:32:29.096Z
---

# Phase 48: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 48-14 1cc619836 |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| WR-03 | warning | fixed | quick-261002-b63 0cecb87b1 (not in the current review) |
| IN-05 | info | open | - (not in the current review) |
| IN-06 | info | open | - (not in the current review) |
| IN-07 | info | open | - (not in the current review) |
| CR-01 | critical | fixed | 48-07 d7d27c89b (not in the current review) |
| IN-04 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
