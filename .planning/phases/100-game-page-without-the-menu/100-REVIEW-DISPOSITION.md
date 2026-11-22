---
phase: 100
review: 100-REVIEW.md
titles: json
findings:
  - id: WR-06
    severity: warning
    disposition: open
    title: "A real Move rejection leaves the game stuck on \"moving\", and the new `!is.moving` suppression then hides the failure"
  - id: WR-07
    severity: warning
    disposition: open
    title: "The move-timeout hand-off (`isInvokeTimeout`, `stillRunning`, `release`) cannot fire in the shipped stack"
  - id: WR-08
    severity: warning
    disposition: open
    title: "The two danger-zone buttons do not gate each other, and Remove all copies emits no status"
  - id: IN-07
    severity: info
    disposition: open
    title: "The hook's docblock is detached by the new helper's docblock"
  - id: IN-08
    severity: info
    disposition: open
    title: "Move and Set-folder Retry skip the confirmation that the danger-zone Retry keeps"
  - id: IN-09
    severity: info
    disposition: open
    title: "New list entries are admitted \"on shape\", against the list's own stated rule, and `changeInstallPath` has no recovery if it wedges"
  - id: IN-10
    severity: info
    disposition: open
    title: "`UninstallModal`'s fallback catch calls `window.api.logError` unguarded, and has no behavioural test"
  - id: IN-11
    severity: info
    disposition: open
    title: "Failure-clearing covers only the Location row"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Verify, Update and What's new vanish for any installed game with no `install.version`"
  - id: CR-02
    severity: critical
    disposition: fixed
    title: "A Move that runs longer than 60 s is shown as \"Move failed\", and the Retry link can start a second move"
  - id: WR-01
    severity: warning
    disposition: open
    title: "The \"Edit details\" button sits on top of the 32-bit macOS badge"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Installed third-party-managed games lose \"Browse Files\""
  - id: WR-03
    severity: warning
    disposition: open
    title: "The long-action guard's header and the CloudSavesSync failure path point at a deleted behavioural test"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Row failure state is sticky, and a second simultaneous failure is hidden"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "Danger-zone confirms have no failure path (unhandled rejections)"
  - id: IN-01
    severity: info
    disposition: open
    title: "`StoreBadgeLink` interpolates the store URL into the query string unencoded"
  - id: IN-02
    severity: info
    disposition: open
    title: "`ProtonDbLink` dropped the `gamesdb.steamID` fallback"
  - id: IN-03
    severity: info
    disposition: open
    title: "Stale comments and naming left over from the plan-by-plan rollout"
  - id: IN-04
    severity: info
    disposition: open
    title: "Two `useTranslation()` results with the same namespace in `EosOverlaySetting`"
  - id: IN-05
    severity: info
    disposition: open
    title: "Accessibility details"
  - id: IN-06
    severity: info
    disposition: open
    title: "The footer play-time suffix appears for states that are not idle in practice"
open: 16
total: 21
recorded: 2026-11-21T19:00:33.145Z
  - id: WR-09
    severity: warning
    disposition: open
    title: "Opt-in DLC switches ignore `installActionGates`, so they stay live during a move, verify, uninstall, folder change, sync, launch, and while the game is running"
  - id: WR-10
    severity: warning
    disposition: open
    title: "A failed or unavailable re-read replaces `info` with `null`, which removes the whole group together with the failure message it just set"
  - id: WR-11
    severity: warning
    disposition: open
    title: "Pending/failure handling is hand-rolled instead of `useRowAction` / `reportRowActionFailure`; an unguarded `logError` in a catch can leave every row stuck busy"
  - id: IN-12
    severity: info
    disposition: open
    title: "`desired` is computed from the `info` snapshot taken at mount, and the update treats it as the complete set to keep"
  - id: IN-13
    severity: info
    disposition: open
    title: "Test coverage for the new rows skips the cases that carry the findings above"
---

# Phase 100: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-09 | warning | open | - |
| WR-10 | warning | open | - |
| WR-11 | warning | open | - |
| IN-12 | info | open | - |
| IN-13 | info | open | - |
| WR-06 | warning | open | - (not in the current review) |
| WR-07 | warning | open | - (not in the current review) |
| WR-08 | warning | open | - (not in the current review) |
| IN-07 | info | open | - (not in the current review) |
| IN-08 | info | open | - (not in the current review) |
| IN-09 | info | open | - (not in the current review) |
| IN-10 | info | open | - (not in the current review) |
| IN-11 | info | open | - (not in the current review) |
| CR-01 | critical | fixed | 100-12-SUMMARY.md (not in the current review) |
| CR-02 | critical | fixed | 100-11-SUMMARY.md and 100-13-SUMMARY.md (not in the current review) |
| WR-01 | warning | open | - (not in the current review) |
| WR-02 | warning | fixed | 100-13-SUMMARY.md (not in the current review) |
| WR-03 | warning | open | - (not in the current review) |
| WR-04 | warning | fixed | 100-13-SUMMARY.md (not in the current review) |
| WR-05 | warning | fixed | 100-14-SUMMARY.md (not in the current review) |
| IN-01 | info | open | - (not in the current review) |
| IN-02 | info | open | - (not in the current review) |
| IN-03 | info | open | - (not in the current review) |
| IN-04 | info | open | - (not in the current review) |
| IN-05 | info | open | - (not in the current review) |
| IN-06 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
