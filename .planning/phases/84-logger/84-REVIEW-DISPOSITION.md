---
phase: 84
review: 84-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "One malformed entry drops the whole 32 KiB batch, including unrelated lines and other targets"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Shell and crate-bridge lines are written with raw CR/LF, and now land in the file users upload"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Store persist can truncate the live file when the temp write fails (data loss)"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Renderer `{name,message,stack}` objects bypass the documented 65,536-unit cut"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "A dropped or skipped rotating entry silently skips rotation"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "`LogForwarder.flush` promises a bounded wait but the chain wait is unbounded"
  - id: WR-07
    severity: warning
    disposition: fixed
    title: "`validate_paste_url` stores and returns the raw response text, not the parsed URL"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Writer counts messages as \"lines\" in its drop report"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Limiter windows key off sender-supplied timestamps"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`install_bridges` failure is silent"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "`ExitBudget` remaining is computed before finish's own work"
  - id: WR-08
    severity: warning
    disposition: fixed
    title: "A rotation owed after a rejected Promise message can rotate away the session's already-written lines"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "Refused entries vanish with no trace; `refusedTotal` is never read"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "Remaining paths that lose a rotation without owing it"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "Two native entry points with opposite escaping rules, enforced only by a comment"
  - id: IN-08
    severity: info
    disposition: fixed
    title: "The bridge-install warning claims all crate diagnostics are lost when only one bridge may have failed"
  - id: IN-09
    severity: info
    disposition: fixed
    title: "Residual free text reaches the uploaded file through paths the new gate does not cover"
  - id: IN-10
    severity: info
    disposition: fixed
    title: "`flush` doc says it returns at once with no transport, but it first waits on the chains"
open: 0
total: 18
recorded: 2026-11-22T00:00:00.000Z
---

# Phase 84: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 84-15: `28c9f8caf` (RED `fbc5185db`) |
| WR-02 | warning | fixed | 84-16: `e7eb01597` (RED `fdc5b6457`); 84-17: `13d057271`, `6b2ecf847` |
| WR-03 | warning | fixed | 84-12: `8f0e3e12f` (RED `2600b3dc8`) |
| WR-04 | warning | fixed | 84-14: `720fb9d86` |
| WR-05 | warning | fixed | 84-14: `6a385ab97`; 84-15: `c42be0306` (RED `3336fae60`) |
| WR-06 | warning | fixed | 84-15: `0a39bba18` (RED `f4cd3008c`) |
| WR-07 | warning | fixed | 84-12: `415b97206` (RED `27ee3dac1`) |
| IN-01 | info | fixed | 84-14: `720fb9d86` |
| IN-02 | info | fixed | 84-14: `6a385ab97` |
| IN-03 | info | fixed | 84-16: `f5c3c9eef` |
| IN-04 | info | fixed | 84-16: `bbf189be0` (RED `ce1f0689a`) |
| WR-08 | warning | fixed | REVIEW-FIX r2: `1790bba62` |
| IN-05 | info | fixed | REVIEW-FIX r2: `5020002a4` |
| IN-06 | info | fixed | REVIEW-FIX r2: `1192c510a` (b), `1438bbd0f` (a) |
| IN-07 | info | fixed | REVIEW-FIX r2: `6535f3135` |
| IN-08 | info | fixed | REVIEW-FIX r2: `3eebffe5b` |
| IN-09 | info | fixed | REVIEW-FIX r2: `7ff92181a` |
| IN-10 | info | fixed | REVIEW-FIX r2: `7eea6b58d` (doc-only) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
