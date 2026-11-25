---
phase: 88
review: 88-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Quadratic duplicate-key scan in `JsValue::visit_map` lets a downloaded fix file stall the known-fix runtime"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Reader warnings echo raw file values and key names, with no URL redaction and no length bound on key names"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "The feed URL embeds `app_name` unencoded, and `contained_dest` does not refuse URL metacharacters"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Three ops take an unbounded `appName` and `installPath`; the other five bound them"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Both CLIs panic on non-UTF-8 arguments, and `gamelib-knownfix-cli` panics on a non-UTF-8 environment variable"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "The headless CLIs default to the production relay, so `knownfix_report_detected` with `enabled: true` posts for real"
  - id: IN-01
    severity: info
    disposition: open
    title: "`target_already_there` mixes raw errno values from different OS namespaces"
  - id: IN-02
    severity: info
    disposition: open
    title: "`guarded`, `CatchUnwind`, `runtime` and `dispatch_sync` are copy-pasted across crates"
  - id: IN-03
    severity: info
    disposition: open
    title: "Unused dependencies and feature flags in the new manifests"
  - id: IN-04
    severity: info
    disposition: open
    title: "Cancelling the install that is initialising a cell removes the cell while a joiner is still using it"
  - id: IN-05
    severity: info
    disposition: open
    title: "A corrupt compiled-in catalogue is reported as \"unknown overlay id\""
  - id: IN-06
    severity: info
    disposition: open
    title: "The remote cache's temp file name is per process, so two concurrent fetches of one app collide"
  - id: CR-02
    severity: critical
    disposition: fixed
    title: "Windows release build checks out a tree with paths over 260 characters and does not enable `core.longpaths`"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "A single non-string tier-1 `envVariables` value rejects the whole overlay-env call, so all tier-2 overlays are silently dropped"
  - id: WR-07
    severity: warning
    disposition: fixed
    title: "The two unbounded known-fix channels have no sidecar-side backstop, so a lost reply hangs the launch"
  - id: IN-07
    severity: info
    disposition: open
    title: "Comments overstate how strict the shell's generated decode is, and one catalogue comment names a removed function"
  - id: IN-08
    severity: info
    disposition: open
    title: "`overlayArchiveUrl` is exported but used only by tests, and the bridge duplicates `overlayBaseEnv`"
  - id: IN-09
    severity: info
    disposition: open
    title: "`aborts` is a dead dependency of `LauncherDeps` and `BridgeKnownFixDeps`"
  - id: IN-10
    severity: info
    disposition: open
    title: "`getSettings()` is evaluated outside the `.catch` on the three fire-and-forget report call sites"
  - id: IN-11
    severity: info
    disposition: open
    title: "`KnownFixLaunchOverrides` is declared twice with the same shape"
  - id: WR-08
    severity: warning
    disposition: fixed
    title: "The overlay archive replay never independently compares gzip bytes; the \"same\" branch is circular"
  - id: WR-09
    severity: warning
    disposition: fixed
    title: "The TS twin's gzip fields are dropped by a one-case probe that degrades silently"
  - id: WR-10
    severity: warning
    disposition: fixed
    title: "The fetcher and overlay-install replays are `cfg(unix)` only, so about 79 golden cases do not run on the Windows leg"
  - id: WR-11
    severity: warning
    disposition: fixed
    title: "Event level comparison in the fetcher and report replays cannot tell info from error"
  - id: WR-12
    severity: warning
    disposition: fixed
    title: "The launcher-path registry replay drops every error-level log line before comparing events"
  - id: IN-12
    severity: info
    disposition: open
    title: "The golden_registry `prefixDir` fold uses a raw string prefix and folds every separator outside the profile"
  - id: IN-13
    severity: info
    disposition: open
    title: "The `normalise_text` replacement table puts the real-path HOME entry last, so on macOS it is dead"
  - id: IN-14
    severity: info
    disposition: open
    title: "Loose time and grace bounds in the registry replay"
  - id: IN-15
    severity: info
    disposition: open
    title: "The Windows leg skips the four symlink launch-override cases, including the escape-rejection ones"
  - id: IN-16
    severity: info
    disposition: open
    title: "Test-environment hygiene nits"
  - id: IN-17
    severity: info
    disposition: open
    title: "Tautological checks"
  - id: IN-18
    severity: info
    disposition: open
    title: "The port-complete gate imports another test file"
open: 18
total: 32
recorded: 2026-11-25T04:11:25.347Z
---

# Phase 88: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 88-REVIEW-FIX.md |
| WR-01 | warning | fixed | 88-REVIEW-FIX.md |
| WR-02 | warning | fixed | 88-REVIEW-FIX.md |
| WR-03 | warning | fixed | 88-REVIEW-FIX.md |
| WR-04 | warning | fixed | 88-REVIEW-FIX.md |
| WR-05 | warning | fixed | 88-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| CR-02 | critical | fixed | 88-REVIEW-FIX.md |
| WR-06 | warning | fixed | 88-REVIEW-FIX.md |
| WR-07 | warning | fixed | 88-REVIEW-FIX.md |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| IN-09 | info | open | - |
| IN-10 | info | open | - |
| IN-11 | info | open | - |
| WR-08 | warning | fixed | 88-REVIEW-FIX.md |
| WR-09 | warning | fixed | 88-REVIEW-FIX.md |
| WR-10 | warning | fixed | 88-REVIEW-FIX.md |
| WR-11 | warning | fixed | 88-REVIEW-FIX.md |
| WR-12 | warning | fixed | 88-REVIEW-FIX.md |
| IN-12 | info | open | - |
| IN-13 | info | open | - |
| IN-14 | info | open | - |
| IN-15 | info | open | - |
| IN-16 | info | open | - |
| IN-17 | info | open | - |
| IN-18 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
