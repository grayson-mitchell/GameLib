---
phase: 82
review: 82-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "GOG uninstall is refused whenever `gog-support` does not exist"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Cancelled-install cleanup refuses (and keeps manifest and breadcrumb) when `steamapps/common` is absent"
  - id: WR-02
    severity: warning
    disposition: open
    title: "One unresolvable protected-root or known-install path blocks every removal"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`safety_remove_tree` runs under the 60 s rustInvoke timeout; a long delete reports `failed` while Rust keeps deleting"
  - id: WR-04
    severity: warning
    disposition: open
    title: "An empty `trustRoot` string is read as \"no trust root\", and game-install/prefix/sideload targets then skip containment"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Steam copy-removal guard is advisory and fails open to an unguarded delete in the crate"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Sideload \"shared folder\" heuristic ignores sub-directories entirely"
  - id: WR-07
    severity: warning
    disposition: open
    title: "`findRawRecursiveDeletes` has blind spots, so the \"no raw recursive delete\" gates can pass while one exists"
  - id: WR-08
    severity: warning
    disposition: open
    title: "Adversarial lexical rows pass vacuously if a row name drifts"
  - id: WR-09
    severity: warning
    disposition: open
    title: "Deletes that run after the Rust check but outside the Rust delete-time re-check"
  - id: IN-01
    severity: info
    disposition: open
    title: "Windows `is_link_metadata` treats every reparse point as a link"
  - id: IN-02
    severity: info
    disposition: open
    title: "`remove-bottle` refusal kind is never emitted"
  - id: IN-03
    severity: info
    disposition: open
    title: "Sideload reports a `refused` second-stage guard as `failed`"
  - id: IN-04
    severity: info
    disposition: open
    title: "Known-install list ignores entries that are not yet `is_installed`"
  - id: IN-05
    severity: info
    disposition: open
    title: "CI and supply-chain hygiene in touched files"
open: 15
total: 15
recorded: 2026-11-20T19:12:20.955Z
---

# Phase 82: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-08 | warning | open | - |
| WR-09 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
