---
phase: 82
review: 82-REVIEW.md
titles: json
findings:
  - id: WR-10
    severity: warning
    disposition: open
    title: "Raw-delete detector still fails open when it cannot parse a call"
  - id: IN-06
    severity: info
    disposition: open
    title: "`safety_remove_tree` now has no bound at all, so a blocked delete hangs the caller forever"
  - id: IN-07
    severity: info
    disposition: open
    title: "`fakeSafetyRustInvoke` delete confinement is lexical, and trust-root answers outrank the configured verdict"
  - id: IN-08
    severity: info
    disposition: open
    title: "New `games.test.ts` cases copy a POSIX-only path literal and fail on a Windows host"
  - id: WR-11
    severity: warning
    disposition: open
    title: "the \"import after the Jest environment has been torn down\" warning is not fixed; it comes from the last test, not the waits"
  - id: IN-09
    severity: info
    disposition: open
    title: "slowed-download tracer test leaks a real timer on its failure path and does not prove the slow window elapsed"
  - id: WR-12
    severity: warning
    disposition: open
    title: "the WR-06 sibling-directory rule refuses the most common sideload layouts and has no override"
  - id: WR-13
    severity: warning
    disposition: fixed
    title: "the narrowed runTs shared-cache predicate can be bypassed by an ordinary spelling"
  - id: IN-10
    severity: info
    disposition: open
    title: "relative, NUL-containing and `~`-prefixed references are now skipped silently, which turns a fail-closed row into a fail-open one"
  - id: IN-11
    severity: info
    disposition: open
    title: "`refuseUnsafeCopy` docstring contradicts the WR-05 change, and the refusal reason is misleading"
  - id: IN-12
    severity: info
    disposition: open
    title: "the WR-09 re-assertions are weaker than their comments, and one fails open on a missing item"
  - id: IN-13
    severity: info
    disposition: open
    title: "new slowed-I/O tests leak a real timer on their failure path (same pattern as IN-09)"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "GOG uninstall is refused whenever `gog-support` does not exist"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Cancelled-install cleanup refuses (and keeps manifest and breadcrumb) when `steamapps/common` is absent"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "One unresolvable protected-root or known-install path blocks every removal"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "`safety_remove_tree` runs under the 60 s rustInvoke timeout; a long delete reports `failed` while Rust keeps deleting"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "An empty `trustRoot` string is read as \"no trust root\", and game-install/prefix/sideload targets then skip containment"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "Steam copy-removal guard is advisory and fails open to an unguarded delete in the crate"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "Sideload \"shared folder\" heuristic ignores sub-directories entirely"
  - id: WR-07
    severity: warning
    disposition: fixed
    title: "`findRawRecursiveDeletes` has blind spots, so the \"no raw recursive delete\" gates can pass while one exists"
  - id: WR-08
    severity: warning
    disposition: fixed
    title: "Adversarial lexical rows pass vacuously if a row name drifts"
  - id: WR-09
    severity: warning
    disposition: fixed
    title: "Deletes that run after the Rust check but outside the Rust delete-time re-check"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Windows `is_link_metadata` treats every reparse point as a link"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "`remove-bottle` refusal kind is never emitted"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Sideload reports a `refused` second-stage guard as `failed`"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "Known-install list ignores entries that are not yet `is_installed`"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "CI and supply-chain hygiene in touched files"
open: 12
total: 27
recorded: 2026-11-21T06:39:30.595Z
---

# Phase 82: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-10 | warning | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| WR-11 | warning | open | - |
| IN-09 | info | open | - |
| WR-12 | warning | open | - |
| WR-13 | warning | fixed | 692736559 (gsd-fast, 2026-11-21) |
| IN-10 | info | open | - |
| IN-11 | info | open | - |
| IN-12 | info | open | - |
| IN-13 | info | open | - |
| CR-01 | critical | fixed | 82-17-SUMMARY.md and 82-19-SUMMARY.md (not in the current review) |
| WR-01 | warning | fixed | 82-17-SUMMARY.md and 82-19-SUMMARY.md (not in the current review) |
| WR-02 | warning | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |
| WR-03 | warning | fixed | 82-18-SUMMARY.md (not in the current review) |
| WR-04 | warning | fixed | 82-17-SUMMARY.md (not in the current review) |
| WR-05 | warning | fixed | quick 261121-o99 (261121-o99-SUMMARY.md): the TS half is fixed (an installed copy that cannot be placed is refused canonicalize-failed); moving the verdict into gamelib-steampoll remove_copy itself remains for Phase 90 (not in the current review) |
| WR-06 | warning | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |
| WR-07 | warning | fixed | 82-18-SUMMARY.md (not in the current review) |
| WR-08 | warning | fixed | 82-17-SUMMARY.md (not in the current review) |
| WR-09 | warning | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |
| IN-01 | info | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |
| IN-02 | info | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |
| IN-03 | info | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |
| IN-04 | info | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |
| IN-05 | info | fixed | quick 261121-o99 (261121-o99-SUMMARY.md) (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
