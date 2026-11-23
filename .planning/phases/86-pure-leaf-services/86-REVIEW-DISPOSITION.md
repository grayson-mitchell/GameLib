---
phase: 86
review: 86-REVIEW.md
titles: json
findings:
  - id: CR-41
    severity: critical
    disposition: fixed
    title: "unguarded `await addRecentGame` aborts the post-game callback when the Rust write rejects"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "SlotOwner read cache can keep a stale key after a concurrent `set`"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "ITAD price-cache `index` read-modify-write is not serialised (cap can be exceeded, entries orphaned)"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Remote- and caller-sourced values are interpolated into request URLs without encoding"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Synchronous Keychain read inside a guarded op cannot be cancelled by shutdown"
  - id: WR-21
    severity: warning
    disposition: fixed
    title: "Dev-vault file handling is racy and non-atomic (symlink TOCTOU, truncate-then-write, cross-process lost update)"
  - id: WR-22
    severity: warning
    disposition: fixed
    title: "`getGameMetadataOverride` bound (256) is tighter than the TS schema (4096) and than the crate's own bound (1024)"
  - id: WR-41
    severity: warning
    disposition: fixed
    title: "a failed or refused umu id lookup now aborts a Linux game launch"
  - id: WR-42
    severity: warning
    disposition: fixed
    title: "`getGameInfo` and the non-Steam shortcut flow now fail whole on a Rust round-trip rejection"
  - id: WR-61
    severity: warning
    disposition: fixed
    title: "fixtureRedaction scan floor is stale and no longer proves a full-tree walk"
  - id: WR-62
    severity: warning
    disposition: fixed
    title: "fixtureRedaction rules cover fewer secret shapes than the recorder redacted"
  - id: WR-63
    severity: warning
    disposition: fixed
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
  - id: WR-64
    severity: warning
    disposition: fixed
    title: "`ClearCacheDeps.requestRustInvoke` still optional and `LegendaryUserDeps` lacks it; the silent-skip guard that hid the 86-23 regression is now unreachable in production (round 2, 86-REVIEW-ROUND2.md)"
  - id: IN-69
    severity: info
    disposition: open
    title: "new 86-27 warning lines omit appName/runner; `getGameInfo` can warn on every call while Rust is not ready (round 2)"
  - id: IN-70
    severity: info
    disposition: open
    title: "the three `launch()` bodies' best-effort umu lookup is covered only by a source-regex gate, no behavioural launch test (round 2)"
  - id: WR-65
    severity: warning
    disposition: open
    title: "WR-04's `set_async`/`get_async` spawn_blocking Keychain work holds no shutdown Registrant; a cancelled write is left unwaited (round 3, 86-REVIEW-ROUND3.md)"
  - id: WR-66
    severity: warning
    disposition: open
    title: "`set_async` takes no lock: overlapping saves can reach the Keychain in one order and `finish_write` in the other, caching a stale key (round 3)"
  - id: IN-71
    severity: info
    disposition: open
    title: "`native.ts:69` still documents the old 256-unit cap for `getGameMetadataOverride` (round 3)"
  - id: IN-72
    severity: info
    disposition: open
    title: "vault doc says a planted link is replaced though the write refuses; a zero-length vault is corrupt forever; crash-orphaned plaintext .tmp files never swept (round 3)"
  - id: IN-73
    severity: info
    disposition: open
    title: "three new fix tests assert less than they claim (AGW positive control, atomic-write test, effective_async shutdown path) (round 3)"
  - id: IN-74
    severity: info
    disposition: open
    title: "PCGW GOG id is encoded but not digit-validated (round 3)"
open: 38
total: 51
recorded: 2026-11-22T19:54:24.939Z
---

# Phase 86: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-41 | critical | fixed | 9acbfc580 |
| WR-01 | warning | fixed | 1fe59191e |
| WR-02 | warning | fixed | af85c9090 |
| WR-03 | warning | fixed | 3f57a909f |
| WR-04 | warning | fixed | 95badff10 |
| WR-21 | warning | fixed | a28705392 |
| WR-22 | warning | fixed | bf8d257a8 |
| WR-41 | warning | fixed | 97b62cb2d |
| WR-42 | warning | fixed | 92d18429d |
| WR-61 | warning | fixed | d4e9f140f |
| WR-62 | warning | fixed | d4e9f140f |
| WR-63 | warning | fixed | 417dd183b |
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
| WR-64 | warning | fixed | a85189b85 |
| IN-69 | info | open | 86-REVIEW-ROUND2.md |
| IN-70 | info | open | 86-REVIEW-ROUND2.md |
| WR-65 | warning | open | 86-REVIEW-ROUND3.md |
| WR-66 | warning | open | 86-REVIEW-ROUND3.md |
| IN-71 | info | open | 86-REVIEW-ROUND3.md |
| IN-72 | info | open | 86-REVIEW-ROUND3.md |
| IN-73 | info | open | 86-REVIEW-ROUND3.md |
| IN-74 | info | open | 86-REVIEW-ROUND3.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
