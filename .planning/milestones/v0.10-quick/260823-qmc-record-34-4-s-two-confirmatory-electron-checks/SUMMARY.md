---
quick_id: 260823-qmc
slug: record-34-4-s-two-confirmatory-electron-checks
description: Ran and recorded Phase 34.4's two outstanding confirmatory Electron checks — both PASS
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Quick Task 260823-qmc — SUMMARY

Phase 34.4's two "outstanding confirmatory checks" are **discharged, both PASS**. They had been
open 27 days and existed only as prose in three documents — no later phase, todo or audit ever
carried them.

## What shipped

| task | file | result |
|---|---|---|
| T1 | `34.4-LIVE-GATE.md` | § "Outstanding confirmatory checks" replaced with both measurements; item 5's own trailing `**Outstanding:**` line struck through and pointed at it, so the two statements cannot drift |
| T2 | `ROADMAP.md` | Phase 34.4's Open list no longer claims the checks are unrun; WR-02/WR-03's file re-filed |
| T3 | `STATE.md` | carried-forward block AMENDED IN PLACE with a dated correction; quick-tasks table row added |

No source files touched.

## The two results

**A — bottle-pair parity: PASS.** Electron returns the identical contradictory pair
(`{provisioned:false, bottleName:'GameLibSteam'}` / `true`) that the Tauri gate recorded on
2026-07-27.

**B — sign-out sanity: PASS.** All three session keys cleared within 1s, backend logged
`Logging user out from Steam`, tile flipped, no failure dialog, and **no revert after a full
renderer reload** — the exact pre-fix symptom `1cf42d43b` exists to prevent.

## What the run taught, beyond the two verdicts

**A check can go stale by STATE while every line number still resolves.** Item 5's contradiction
depended on `steamBottleConfigStore`'s `provisioned` flag being unset. It is `true` today, so the
first Electron measurement returned an *agreeing* pair. Recording that would have been a green
result that proved nothing about the defect under test — the same failure shape as
`gate-literal-can-be-stale-by-behaviour`, arrived at from the data side rather than the code side.
The fix was to restore the recorded precondition (with a backup) before measuring, then restore it
again after.

**Three of the four claims in `STATE.md`'s carried-forward block were stale** — WR-01 was already
fixed when the block was written, and WR-02/WR-03 named a file that had since been rewritten to
remove the defect. Only "secure-phase 34.4 is owed" survived. The corrections were made **in place,
dated and labelled**, not by rewriting the original text.

**A destructive check can be made reversible AND the reversal proven.** The sign-out was run against
a real session; the restore was then verified by a deliberate refresh producing `loggedOn` and
`fetched 381 owned games`, and by diffing the final store byte-for-byte against the pre-run backup.
Restoring credentials without proving they still authenticate would have left a *misleading*
signed-in state — worse than the clean signed-out one it replaced.

## Still open on Phase 34.4 after this task

1. **`/gsd-secure-phase 34.4` — never run.** No `34.4-SECURITY.md`. Also owed on 34.3, 34.5 and 28.
2. **WR-02 / WR-03**, at their corrected location: `TauriLoginPanel.tsx` `:79`/`:120`/`:170`
   (runner-id capitalization instead of the display-name helper) and `:151` (runner baked into a
   `t()` default instead of `{{runner}}`). Note the keys already exist in the locale JSON, so
   editing the `t()` default alone is a silent no-op — the interpolation has to go into the key.
