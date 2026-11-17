---
phase: 47
review: 47-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "`itad.setApiKey` reports success when the keyring write failed; UI shows \"Key saved\""
  - id: WR-02
    severity: warning
    disposition: open
    title: "Key is persisted on every keystroke with no write ordering; an oversize paste permanently disables the field"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Optional user-key read can stall every search (and the Advanced settings page) on a Keychain prompt"
  - id: WR-04
    severity: warning
    disposition: open
    title: "`lookupSteamGids` keeps hammering ITAD after a 429 or network failure"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Owned-on-Steam join silently disables itself for libraries over 5000 appids"
  - id: IN-01
    severity: info
    disposition: open
    title: "Release gate accepts a whitespace-only `ITAD_API_KEY` secret"
  - id: IN-02
    severity: info
    disposition: open
    title: "A rejected built-in key surfaces as a generic provider error and does not use the stale copy"
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
recorded: 2026-11-17T09:14:07.149Z
---

# Phase 47: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
