---
phase: 84
review: 84-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "One malformed entry drops the whole 32 KiB batch, including unrelated lines and other targets"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Shell and crate-bridge lines are written with raw CR/LF, and now land in the file users upload"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Store persist can truncate the live file when the temp write fails (data loss)"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Renderer `{name,message,stack}` objects bypass the documented 65,536-unit cut"
  - id: WR-05
    severity: warning
    disposition: open
    title: "A dropped or skipped rotating entry silently skips rotation"
  - id: WR-06
    severity: warning
    disposition: open
    title: "`LogForwarder.flush` promises a bounded wait but the chain wait is unbounded"
  - id: WR-07
    severity: warning
    disposition: open
    title: "`validate_paste_url` stores and returns the raw response text, not the parsed URL"
  - id: IN-01
    severity: info
    disposition: open
    title: "Writer counts messages as \"lines\" in its drop report"
  - id: IN-02
    severity: info
    disposition: open
    title: "Limiter windows key off sender-supplied timestamps"
  - id: IN-03
    severity: info
    disposition: open
    title: "`install_bridges` failure is silent"
  - id: IN-04
    severity: info
    disposition: open
    title: "`ExitBudget` remaining is computed before finish's own work"
open: 11
total: 11
recorded: 2026-11-21T09:28:07.129Z
---

# Phase 84: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
