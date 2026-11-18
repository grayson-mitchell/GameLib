---
phase: 47
review: 47-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Offline \"Try again\" can re-request the previous store's URL after a store switch"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Offline banner is driven by app connectivity alone, so it overrides a healthy loaded page"
  - id: WR-03
    severity: warning
    disposition: open
    title: "RegionPicker has no accessible name for its combobox"
  - id: IN-01
    severity: info
    disposition: open
    title: "Impossible-state guard on `connectivity?.status`"
  - id: IN-02
    severity: info
    disposition: open
    title: "\"Showing prices for {{country}}\" caption now duplicates the region picker"
  - id: WR-04
    severity: warning
    disposition: open
    title: "`lookupSteamGids` keeps hammering ITAD after a 429 or network failure"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Owned-on-Steam join silently disables itself for libraries over 5000 appids"
  - id: IN-03
    severity: info
    disposition: open
    title: "Dead/unused configuration code (necessity)"
  - id: IN-04
    severity: info
    disposition: open
    title: "Expanded breakdown renders an empty panel when ITAD returns no deals"
open: 9
total: 9
recorded: 2026-11-18T10:46:00.038Z
---

# Phase 47: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| WR-04 | warning | open | - (not in the current review) |
| WR-05 | warning | open | - (not in the current review) |
| IN-03 | info | open | - (not in the current review) |
| IN-04 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
