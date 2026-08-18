---
created: 2026-08-19T11:20:00.000Z
title: "A resumed Steam depot install reports progress from 0% and can never reach 100%"
area: steam/depot/progress
needs: code-fix
status: OPEN
severity: major
surfaced_by: "Phase 23 plan 23-10 Task 2 (Gate 3 interrupt-resume), observed live by the operator 2026-08-19"
---

## Symptom

Force-quit a native Steam install mid-download, relaunch, and resume it. The download progress
reported to the user **restarts at 0%** even though most of the content is already on disk — and it
**never reaches 100%**. It climbs only to `bytes-fetched-this-run / whole-plan-bytes` and then the
install completes, so the UI appears to stall short of done and jump.

The 0% start is what the operator noticed. The **ceiling is the more damaging half**: on a resume that
skips a lot of content, a fully successful install looks like it froze well short of finished.

## Mechanism

`src/backend/storeManagers/steam/depot.ts`:

- **:1930** `healReconciledFileModes(...)` runs — reconciliation has already decided which files are
  present and correct and will be SKIPPED.
- **:1938** `let doneBytes = 0` — initialized fresh, *after* reconcile. Skipped files contribute
  nothing to it. It only ever accumulates bytes this run actually writes.
- **:1915** `const totalBytes = plan.totalBytes` — the whole plan's summed file sizes from plan-build
  (`:749`, `:757`), completely unaffected by reconcile.
- **:2044** `percent = Math.round((doneBytes / totalBytes) * 100)`.

So the numerator is run-scoped and the denominator is plan-scoped. On a fresh install they agree and
percent is correct; on a resume they are measured over different sets. Same expression feeds the
user-facing bus update at **:2191-2194** (whose WR-03 `clamp to 100` comment shows the opposite
overflow case was considered, but not this one) and the throttle delta at **:2136**.

## Live measurement (Gate 3 run, HUMANKIND 1124300, 2026-08-19)

Killed at **15,538 of 18,809 files**, which was ~83% by file count but only **~26% by bytes** — the
interrupted run had fetched mostly small files and left the bulk assets. Resume series:

```
11:15:32  files=16237  disk=10.07 GB  percent=3%
11:16:02  files=16425  disk=10.44 GB  percent=4%
```

Full series: `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md` Gate 3 record.
**Observed terminal percent: _(fill in when the run completes — this is the ceiling, and it is the
cleanest evidence of the defect)_.**

Note the file-count-vs-bytes gap is itself the reason a naive "it looked ~83% done" intuition is
wrong; any fix must reason in bytes.

## Fix sketch (not prescriptive)

Make numerator and denominator agree on a set. Either:

1. **Seed `doneBytes` with the reconciled-skip byte total** so it means "bytes of the plan present on
   disk" against the unchanged plan-scoped `totalBytes` — preserves "percent of the whole install",
   which is what a user expects, and makes 100% reachable; or
2. **Subtract the skipped bytes from `totalBytes`** so both are run-scoped — makes 100% reachable but
   redefines the number as "percent of the remaining work", which will read oddly against a resumed
   install's own size.

(1) is the better user-facing semantics. Either way `reconcilePartialState` must return the skipped
byte total, which it does not currently surface to this call site.

## Guard against a vacuous test

A fresh install cannot distinguish the two implementations — numerator and denominator agree when
nothing is skipped. Any regression test MUST exercise a plan with a non-empty reconciled-skip set and
assert the terminal percent is 100, and must be shown to FAIL against the current expression. Same
shape as the standing lesson that a gate can be non-vacuous, correctly computed, and still measure the
wrong property.

## Not in scope for Phase 23

Cosmetic/reporting only — it does not affect what lands on disk, the reconcile skip itself, mode
application, or the `StateFlags` decision. Gate 3's contract is the resume's correctness, not its
progress reporting, so this is filed rather than fixed inside 23-10.
