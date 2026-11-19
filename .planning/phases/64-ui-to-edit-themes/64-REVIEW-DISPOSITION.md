---
phase: 64
review: 64-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Gradient validator lets a layered `image-set(\"https://...\")` through, so a token value can fetch from the network (T-64-12 bypass)"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Leaving the editor while a Save is in flight loses the draft, and a later failure notice says the changes are \"still here\""
  - id: WR-02
    severity: warning
    disposition: open
    title: "A gradient over 512 characters is dropped on Save, but Save still reports \"Saved\""
  - id: WR-03
    severity: warning
    disposition: open
    title: "`saveCustomThemeTokens` builds its write from a snapshot taken before the `await`, which can undo a concurrent rename or delete"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Duplicate, Rename and Delete persist without confirmation, while Save waits for confirmation"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Impossible-state guard: `THEME_ID_PATTERN` check on a freshly generated id"
  - id: IN-01
    severity: info
    disposition: open
    title: "For built-in sources, Duplicate passes the theme key to `nextCopyName` but the formatter uses the display label"
  - id: IN-02
    severity: info
    disposition: open
    title: "The gallery marks no card as active when the stored key falls back to the default theme"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`cleanTokens` accepts a gradient for any token, including colour tokens"
  - id: IN-04
    severity: info
    disposition: open
    title: "The `label` prop of `GradientField` is unused"
  - id: IN-05
    severity: info
    disposition: open
    title: "Copy-name truncation can split a surrogate pair"
  - id: IN-06
    severity: info
    disposition: open
    title: "A module in the production `customThemes` tree imports from `testUtils`"
open: 10
total: 12
recorded: 2026-11-19T15:22:59.679Z
---

# Phase 64: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 64-REVIEW-FIX.md |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | fixed | 64-REVIEW-FIX.md |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
