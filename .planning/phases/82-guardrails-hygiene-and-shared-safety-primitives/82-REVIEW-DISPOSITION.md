---
phase: 82
review: 82-REVIEW.md
titles: json
findings:
  - id: WR-11
    severity: warning
    disposition: open
    title: "sharedRedistInstall.test.ts: the last in-flight test leaves its install run unawaited, so `import('../depot')` fires after Jest teardown"
  - id: IN-09
    severity: info
    disposition: open
    title: "82-20 slowed-download tracer: 250 ms real timer never cleared, and the slow path's elapsed time is not asserted"
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
    disposition: deferred
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
    disposition: deferred
    title: "Steam copy-removal guard is advisory and fails open to an unguarded delete in the crate"
  - id: WR-06
    severity: warning
    disposition: deferred
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
    disposition: deferred
    title: "Deletes that run after the Rust check but outside the Rust delete-time re-check"
  - id: IN-01
    severity: info
    disposition: deferred
    title: "Windows `is_link_metadata` treats every reparse point as a link"
  - id: IN-02
    severity: info
    disposition: deferred
    title: "`remove-bottle` refusal kind is never emitted"
  - id: IN-03
    severity: info
    disposition: deferred
    title: "Sideload reports a `refused` second-stage guard as `failed`"
  - id: IN-04
    severity: info
    disposition: deferred
    title: "Known-install list ignores entries that are not yet `is_installed`"
  - id: IN-05
    severity: info
    disposition: deferred
    title: "CI and supply-chain hygiene in touched files"
open: 4
total: 19
recorded: 2026-11-20T07:55:52.740Z
---

# Phase 82: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-10 | warning | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| CR-01 | critical | fixed | 82-17-SUMMARY.md and 82-19-SUMMARY.md (not in the current review) |
| WR-01 | warning | fixed | 82-17-SUMMARY.md and 82-19-SUMMARY.md (not in the current review) |
| WR-02 | warning | deferred | fail-closed (over-refuses, never deletes). A lexical fallback for unresolvable reference paths is a design change, and its Windows unplugged-drive branch can only be proven on the CI Windows leg. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| WR-03 | warning | fixed | 82-18-SUMMARY.md (not in the current review) |
| WR-04 | warning | fixed | 82-17-SUMMARY.md (not in the current review) |
| WR-05 | warning | deferred | bounded by remove_copy own symlink-root, installdir-shape and downloading guards (D-21). The TS pre-check goes away when Phase 90 ports Steam uninstall, and remove_copy should then take the gamelib-safety verdict itself. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| WR-06 | warning | deferred | a sub-directory rule would refuse nearly every real game folder (Data or Engine beside the exe). What marks a sibling game directory needs its own decision. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| WR-07 | warning | fixed | 82-18-SUMMARY.md (not in the current review) |
| WR-08 | warning | fixed | 82-17-SUMMARY.md (not in the current review) |
| WR-09 | warning | deferred | both are named, accepted exceptions (the Phase 75 critical section; cxbottle deletes by bottle name). Re-asserting the check after cxbottle and at the cancel delete is follow-up work. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| IN-01 | info | deferred | needs the Windows reparse tag, which std metadata does not expose; fails safe as delete-failed. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| IN-02 | info | deferred | cosmetic toast title for bottle removal. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| IN-03 | info | deferred | sideload toast wording for a refused second-stage guard. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| IN-04 | info | deferred | in-progress installs are outside the D-16 known-install list today. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |
| IN-05 | info | deferred | the rust-test.yml job timeout and the deny.toml advisory reasons need the network advisory DB and a workflow-pin test change. Todo: .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
