---
phase: 47
review: 47-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Kept rows can be up to ~2 hours old; the \"never older than the cache\" claim is false"
  - id: WR-02
    severity: warning
    disposition: open
    title: "First frame of a remount shows the \"Search a title…\" prompt beside a filled search box"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`limitTags={2}` plus the removed Tooltip leaves blurred Genres/Features hiding chips; the comment says otherwise"
  - id: IN-01
    severity: info
    disposition: open
    title: "`storeSearchSession.test.ts` replaces `globalThis.localStorage`/`sessionStorage` and never restores them"
  - id: IN-02
    severity: info
    disposition: open
    title: "`rowSurfaceTheme.test.ts` hard-codes \"ten built-in themes\""
  - id: IN-03
    severity: info
    disposition: open
    title: "Container-query comment contradicts itself about the one-column rule"
  - id: IN-04
    severity: info
    disposition: open
    title: "`meta/i18nGateScope.json` `generatedBy` is an append-only multi-KB history string"
  - id: WR-04
    severity: warning
    disposition: open
    title: "`lookupSteamGids` keeps hammering ITAD after a 429 or network failure"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Owned-on-Steam join silently disables itself for libraries over 5000 appids"
open: 9
total: 9
recorded: 2026-11-18T18:58:05.363Z
---

# Phase 47: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| WR-04 | warning | open | - (not in the current review) |
| WR-05 | warning | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
