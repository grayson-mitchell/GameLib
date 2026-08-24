---
quick_id: 260825-acv
slug: refresh-34-9-review-cycle2-c2-05-disposi
description: "Refresh 34.9-REVIEW-CYCLE2's C2-05 disposition to cite adc648eb6, and record 34.16's interim macOS-packaging block"
status: complete
completed: 2026-08-25
tasks_completed: 2
files_modified:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-CYCLE2.md
  - .planning/phases/34.16-macos-runner-onedir-x64-ci-leg-publish-the-workflow-to-the-d/34.16-CONTEXT.md
commits:
  - 579028f35
  - 66fd09736
---

# Quick Task 260825-acv Summary

**C2-05's disposition was stale by two days, and the commit that made it stale left a live packaging
block that no 34.16 artifact recorded.**

## What changed

### Task 1 — `34.9-REVIEW-CYCLE2.md` (`579028f35`)

Frontmatter `disposition_note` rewritten: C2-05's own prescribed fix **landed** in `adc648eb6`
(phase 34.16 plan 01), which added a hardcoded `pnpm verify:runner-bundle build --arch=x64` step to
`dist:mac` (`package.json:51`) and `release:mac` (`:46`). The note now states what is actually still
open — whether a REAL x64 onedir tree passes the guard, which has never been observed — and where it
lives (34.16-05 pins digests, 34.16-06 is the live gate). `disposition_updated` → 2026-08-25;
`dispositioned_by` extended with the commit and kept a single-line scalar, because `gsd-sdk query
frontmatter.get` is line-based and returns the literal `>-` for a folded value.

`disposition:` deliberately **stays `partial`** — item 18 has not closed, so the Explorer badge is
unchanged.

Both superseded notes are preserved verbatim, and the C2-05 finding body was **annotated, not
edited**, following this file's own `260823-v27` convention. The annotation carries three
qualifications: the closure is unprotected against regression (34.16 D-09), C2-05's *second*
suggestion was deliberately declined (D-06 keeps the guard npm-script-level, so no
`build-base.yml:48` comment), and the still-open question is a different one from the finding's.

### Task 2 — `34.16-CONTEXT.md` (`66fd09736`)

New constraint 8 and correction 5. Constraint 8 records the interim consequence with its measurement,
and is explicitly scoped to expire on the digest-pin commit.

## What was measured, not read

Both guard invocations were run against the working tree, both directions:

| Command | Result |
|---|---|
| `pnpm verify:runner-bundle build --arch=arm64` | **PASS** — all three runners present, above the floor |
| `pnpm verify:runner-bundle build --arch=x64` | **FAIL** — all three runners reported missing |

The x64 failure is not a symlink defect: `build/bin/x64/darwin` still holds **onefile** binaries,
exactly as 34.16-CONTEXT.md constraint 3 predicted. Because the step is `&&`-chained, three
consequences follow, none of them previously written down:

1. **`pnpm dist:mac` and `pnpm release:mac` abort on every machine** until plan 34.16-05 pins real
   digests.
2. **`build-base.yml:48`'s macos-15 leg goes red on the first PR or push to `main`.** Nothing is red
   today only because `build-prs.yml` triggers on `pull_request` to `main`/`stable` and
   `build-main.yml` on pushes to the same — neither sees this feature branch. The workflow-publish
   commit this phase exists to make is precisely such a push.
3. **`pnpm dist:mac --arm64 --publish=never` is invalidated as a re-run recipe.** The guard steps are
   hardcoded per-arch (D-05) and pnpm appends CLI args to the *end* of the resolved script string, so
   `--arm64` lands on `electron-builder` and never suppresses the x64 guard step. That is the command
   that discharged **34.9 ledger item 16** and that **`34.9-GUARD-PROOF.md` §2.5 AMENDMENT v2 §A3**
   makes normative (cite, never paraphrase) — so that contract cannot be re-run as written until the
   digests are real.

This is **fail-closed by design, not a defect** — an unverified x64 leg can no longer reach
`electron-builder`, which is the point of D-05/D-08. Recorded so plans 34.16-03..06 do not discover
it mid-run, with an explicit warning not to "fix" it by dropping the x64 step (that reopens item 18).

## Scope

Documentation only. No source file, no `package.json`, no workflow, and no `disposition:`/`status:`
field was touched. `34.9-deferred-items.md` item 18 was deliberately **not** rewritten — it remains
the authoritative statement of the exposure; 34.16-CONTEXT.md correction 5 is the statement of its
closure.

## Not done / still owed

- **Ledger item 18 stays open.** Its remaining half — a real x64 onedir build — needs the
  human push to `gamelib main` plus the CI dispatch, i.e. plans 34.16-03..06.
- **No regression pin was added** for the x64 invocation. D-09 recorded that gap deliberately; this
  task did not reverse that decision, only re-stated it where a later reader will hit it.
- **Cycles 3/4/5 and `34.9-REVIEW.md` were not audited** for the same staleness class. `260823-v27`
  flagged them as likelier than not to carry citation drift; that remains true and unexamined.
