---
phase: 48
review: 48-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Legacy `libraryTopSection` seed never reaches the renderer (SPEC R7 not delivered at runtime)"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "`{ kind: 'view', value: <unrecognised> }` passes validation and renders an unlabelled strip of arbitrary games"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "A present-but-invalid `focusRow` resurrects the legacy seed, contradicting the \"present key permanently disarms\" contract"
  - id: IN-01
    severity: info
    disposition: open
    title: "Retired settings strings left in 47 locale files"
  - id: IN-02
    severity: info
    disposition: open
    title: "Stale comments referencing deleted files"
  - id: IN-03
    severity: info
    disposition: open
    title: "Unchecked brand-map lookup for the store label"
  - id: IN-04
    severity: info
    disposition: open
    title: "Stale doc comment on `FocusRowSelection`"
open: 4
total: 7
recorded: 2026-10-05T05:00:11.801Z
---

# Phase 48: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 48-07 d7d27c89b |
| WR-01 | warning | fixed | 48-07 013984a9d |
| WR-02 | warning | fixed | 48-07 013984a9d |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
