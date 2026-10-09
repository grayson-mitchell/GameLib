---
phase: 49
review: 49-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "nile sign-in probe's flip is a runner-command dedup collision, not stdout/stderr ordering (F-49-R1-5)"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Amazon sign-in probe reports healthy with zero installed games, independent of credential state (A4 / F-49-R1-4)"
  - id: WR-03
    severity: warning
    disposition: open
    title: "A cleared verdict for a non-Humble store is invisible to the renderer until the whole probe pass finishes (F-49-R1-2)"
  - id: WR-04
    severity: warning
    disposition: open
    title: "authTrigger.ts origin lookup is a plain-object bracket access on untrusted input"
---

# Phase 49 — Code review disposition

Review: `49-REVIEW.md` (standard depth, 34 files, 0 critical, 4 warning, 0 info, 2026-10-09).
Every finding is `open` and tracked as a pending todo; none blocks closure (all warnings, each
fails closed today). Recorded 2026-10-09 by the execute-phase closure chain.

| Finding | Severity | Disposition | Source / tracking |
|---|---|---|---|
| WR-01 | warning | open | `2026-10-10-nile-probe-joins-list-updates-in-flight-spawn-and-never-observes-output.md` (renamed from the interleaving todo; root cause corrected per this review) |
| WR-02 | warning | open | `2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md` |
| WR-03 | warning | open | `2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md` (review adds the mechanism: only Humble gets a per-store push; the rest wait for `publishSignInProbeOutcomes()` after the whole pass) |
| WR-04 | warning | open | `2026-10-10-authtrigger-origin-lookup-is-an-unguarded-bracket-access.md` (new) |
