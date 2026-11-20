---
quick_id: 260827-9hv
status: complete
completed: 2026-08-27
---

# Un-yellow the 34.17 folder — two stale frontmatter fields

## Diagnosis — the parser was replayed, not the prose

The 34.17 folder read yellow while everything under it was finished: 3/3 PLAN+SUMMARY
pairs, `34.17-VERIFICATION.md` at `verdict: passed` (9/9 must-haves, 4/4 requirements,
0 gaps open), and the ROADMAP entry reading **PHASE COMPLETE**.

Replaying `~/.vscode/extensions/gsd-phase-status/parse.js` over the real folder gave the
answer before any file was written:

```
plan statuses:      [complete, complete, complete]
artifact statuses:  [pending]
rollup(plans)             -> complete      (green)
rollup(plans + artifacts) -> inprogress    (yellow)
```

Since v0.7.0 the folder rolls up its tier-1 gate artifacts too, and `rollup()` returns
`inprogress` the moment the set holds `complete` **and anything else**. The lone `pending`
came from `34.17-VALIDATION.md` at `status: planned`. This is the same single-gate holdback
that pinned 08.1 yellow on a `draft` VALIDATION.

`34.17-VERIFICATION.md` was a **second, independent** signal loss: it declares `verdict: passed`
but carried **no `status:` field**, so `resolveArtifactStatus()` returned `null` and the file was
dropped. Null is not a holdback — the folder colour was unaffected — but the phase's strongest
green signal carried no badge in the explorer.

## The `planned` was stale bookkeeping, not outstanding work

Every artifact the VALIDATION's own per-task map names exists on disk, so the unticked `⬜ pending`
rows and `wave_0_complete: false` are lag, not a blocker (the 08.1 lesson: check whether the wave's
named artifact exists in `src/` before treating a `false` flag as a reason not to flip):

| VALIDATION row | Named artifact | On disk |
|---|---|---|
| REQ-34.17-01/-02 | `src/frontend/components/UI/PathSelectionBox/__tests__/index.test.tsx` | yes (13 KB; 8/8 green, mutation-killed 3 ways per VERIFICATION) |
| REQ-34.17-03 | `evidence/34.17-affordance-{dirty,saved}.png` | both present |
| REQ-34.17-04 | `34.17-HALF-B-PASTE-GATE.md` (`status: run`, `verdict: VERIFIED-ABSENT`) + `evidence/34.17-halfb-target-cmdv.png` | present |

## Change — two lines, both pre-verified against the parser

Target values were checked **before** editing, so neither flip was a guess:

| file | field | before | after | `resolveArtifactStatus()` |
|---|---|---|---|---|
| `34.17-VALIDATION.md` | `status` | `planned` | `approved` | `pending` -> `complete` |
| `34.17-VERIFICATION.md` | `status` | *(absent)* | `passed` | `null` -> `complete` |

`approved` is the house convention for a settled VALIDATION (22 files vs 13 still `draft`).
`status:` was inserted directly under `verified:`, matching 34.10/34.11/34.14/34.15. `verdict: passed`
was **left in place**, not replaced — other readers may key on it.

Post-edit replay: `artifacts: [complete, complete]`, `plans: [complete, complete, complete]`,
**folder -> `complete`**. Diff is exactly `+2 / -1` across the two files.

## Checked for collateral damage, because a `status:` on a VERIFICATION.md can hide UAT items

`audit-uat` admits a VERIFICATION.md at `passed` but `parseVerificationItems` only emits at
`human_needed` — so adding a `status:` field can silently zero a phase's open items. It cannot
here: `34.17-VERIFICATION.md` has **no `human_verification:` array** (grep count 0). Before the
edit the file was skipped for having no `status:` at all; after it, it is admitted and emits
nothing. Zero either way, confirmed by running `gsd-sdk query audit-uat` post-edit — 34.17 is
absent from the report in both states.

## Residual, deliberately not touched

`34.17-VALIDATION.md` still carries `nyquist_compliant: false`, `wave_0_complete: false`, and four
`⬜ pending` rows in its per-task map. None affect the folder colour (only the top-level `status:`
is read), and flipping them was outside the requested scope. They are stale by the evidence in the
table above and are the residue a future reader could misread as real debt.

## Commit

`.planning/`-only. Committed with `git commit --only <paths>` — the working tree carried unrelated
Steam/library changes from a concurrent session that a bare `git commit` would have absorbed.
