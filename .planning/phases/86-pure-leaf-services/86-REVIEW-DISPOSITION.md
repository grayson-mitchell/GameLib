---
phase: 86
review: 86-REVIEW.md
titles: json
findings:
  - id: CR-41
    severity: critical
    disposition: open
    title: "unguarded `await addRecentGame` aborts the post-game callback when the Rust write rejects"
  - id: WR-01
    severity: warning
    disposition: open
    title: "SlotOwner read cache can keep a stale key after a concurrent `set`"
  - id: WR-02
    severity: warning
    disposition: open
    title: "ITAD price-cache `index` read-modify-write is not serialised (cap can be exceeded, entries orphaned)"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Remote- and caller-sourced values are interpolated into request URLs without encoding"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Synchronous Keychain read inside a guarded op cannot be cancelled by shutdown"
  - id: WR-21
    severity: warning
    disposition: open
    title: "Dev-vault file handling is racy and non-atomic (symlink TOCTOU, truncate-then-write, cross-process lost update)"
  - id: WR-22
    severity: warning
    disposition: open
    title: "`getGameMetadataOverride` bound (256) is tighter than the TS schema (4096) and than the crate's own bound (1024)"
  - id: WR-41
    severity: warning
    disposition: open
    title: "a failed or refused umu id lookup now aborts a Linux game launch"
  - id: WR-42
    severity: warning
    disposition: open
    title: "`getGameInfo` and the non-Steam shortcut flow now fail whole on a Rust round-trip rejection"
  - id: WR-61
    severity: warning
    disposition: open
    title: "fixtureRedaction scan floor is stale and no longer proves a full-tree walk"
  - id: WR-62
    severity: warning
    disposition: open
    title: "fixtureRedaction rules cover fewer secret shapes than the recorder redacted"
  - id: WR-63
    severity: warning
    disposition: open
    title: "the \"crate bakes nothing\" assertion scans 3 of about 25 crate source files"
  - id: IN-01
    severity: info
    disposition: open
    title: "`ItadGate::single_flight` follower cancellation removes the leader's flight entry"
  - id: IN-02
    severity: info
    disposition: open
    title: "Dead and test-only public items"
  - id: IN-03
    severity: info
    disposition: open
    title: "Identical helper bodies duplicated"
  - id: IN-04
    severity: info
    disposition: open
    title: "Bounds the crate claims to enforce are skipped for `wiki::get` and `umu::get`"
  - id: IN-05
    severity: info
    disposition: open
    title: "`runner_caps` and `itad::coverage` fail differently on a malformed compiled-in JSON"
  - id: IN-06
    severity: info
    disposition: open
    title: "Parity quirks (D-03) worth keeping on the todo list"
  - id: IN-21
    severity: info
    disposition: open
    title: "Already-defended-elsewhere: `cargo:rerun-if-env-changed=ITAD_API_KEY` and its pinning test"
  - id: IN-22
    severity: info
    disposition: open
    title: "Key-setter parsers borrow another slot's constant; the doc names a constant they do not use"
  - id: IN-23
    severity: info
    disposition: open
    title: "Two tests claim more than they assert"
  - id: IN-24
    severity: info
    disposition: open
    title: "Test helpers copied across six golden suites; some use `tempfile` instead of `FakeHome`"
  - id: IN-25
    severity: info
    disposition: open
    title: "17 tests depend on the process-global context never being installed"
  - id: IN-26
    severity: info
    disposition: open
    title: "Loopback and timing tests are not hermetic"
  - id: IN-27
    severity: info
    disposition: open
    title: "Generated args struct for the GOG discounts call derives `Debug` and carries the bearer token"
  - id: IN-28
    severity: info
    disposition: open
    title: "Oracle-strength notes on the goldens (documentation, no wrong assertion found)"
  - id: IN-29
    severity: info
    disposition: open
    title: "Remote-supplied error text is relayed to the renderer (parity quirk (D-03))"
  - id: IN-41
    severity: info
    disposition: open
    title: "`gameAnticheatInfo` shim makes a Rust round trip on every launch for the case that is always `null`"
  - id: IN-42
    severity: info
    disposition: open
    title: "GOG discounts lost its diagnostic log lines in the port"
  - id: IN-43
    severity: info
    disposition: open
    title: "dev vault file is now read-modify-written by two processes with non-atomic writes (dev only)"
  - id: IN-44
    severity: info
    disposition: open
    title: "stale channel counts and \"five/six/seven\" wording in `enrichmentFlowRegistration.ts`"
  - id: IN-45
    severity: info
    disposition: open
    title: "dead `recentGamesChanged` backend event and stale comments naming deleted modules"
  - id: IN-46
    severity: info
    disposition: open
    title: "`metadataChanged` push is no longer ordered with the write that caused it"
  - id: IN-47
    severity: info
    disposition: open
    title: "parity quirks kept per D-03 (no action required)"
  - id: IN-61
    severity: info
    disposition: open
    title: "stale workflow comment says the SEA step carries the key"
  - id: IN-62
    severity: info
    disposition: open
    title: "two overlapping ITAD workflow suites, and the echo guard is narrow"
  - id: IN-63
    severity: info
    disposition: open
    title: "leftover names and dead scaffolding after the TS deletions"
  - id: IN-64
    severity: info
    disposition: open
    title: "gamelib-info fixtures claim byte-exactness but have no `-text` rule"
  - id: IN-65
    severity: info
    disposition: open
    title: "port-gate floors are loose, and two scans only see single-quoted forms"
  - id: IN-66
    severity: info
    disposition: open
    title: "tauriIpcRoute leaks global state across tests in a file"
  - id: IN-67
    severity: info
    disposition: open
    title: "the \"Require the ITAD_API_KEY secret\" step lets a whitespace-only secret through"
  - id: IN-68
    severity: info
    disposition: open
    title: "gameDetails round-trip cases now test a double that re-implements the Rust rule"
open: 42
total: 42
recorded: 2026-11-22T19:54:24.939Z
---

# Phase 86: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-41 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-21 | warning | open | - |
| WR-22 | warning | open | - |
| WR-41 | warning | open | - |
| WR-42 | warning | open | - |
| WR-61 | warning | open | - |
| WR-62 | warning | open | - |
| WR-63 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-21 | info | open | - |
| IN-22 | info | open | - |
| IN-23 | info | open | - |
| IN-24 | info | open | - |
| IN-25 | info | open | - |
| IN-26 | info | open | - |
| IN-27 | info | open | - |
| IN-28 | info | open | - |
| IN-29 | info | open | - |
| IN-41 | info | open | - |
| IN-42 | info | open | - |
| IN-43 | info | open | - |
| IN-44 | info | open | - |
| IN-45 | info | open | - |
| IN-46 | info | open | - |
| IN-47 | info | open | - |
| IN-61 | info | open | - |
| IN-62 | info | open | - |
| IN-63 | info | open | - |
| IN-64 | info | open | - |
| IN-65 | info | open | - |
| IN-66 | info | open | - |
| IN-67 | info | open | - |
| IN-68 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
