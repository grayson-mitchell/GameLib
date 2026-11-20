---
quick_id: 260825-acv
slug: refresh-34-9-review-cycle2-c2-05-disposi
description: "Refresh 34.9-REVIEW-CYCLE2's C2-05 disposition to cite adc648eb6, and record 34.16's interim macOS-packaging block"
mode: quick
created: 2026-08-25
status: planned
---

# Quick Task 260825-acv: Refresh C2-05's disposition and record the interim packaging block

## Why

`34.9-REVIEW-CYCLE2.md`'s `disposition_note` (written 2026-08-23) says C2-05 is "still DEFERRED …
blocked on the default-branch push". That went stale on 2026-08-25: plan 34.16-01 (`adc648eb6`)
added a hardcoded `pnpm verify:runner-bundle build --arch=x64` step to both `dist:mac`
(`package.json:51`) and `release:mac` (`:46`), which is C2-05's own prescribed fix.

Observed live while auditing (this session, 2026-08-25, both commands run against the working tree):

- `pnpm verify:runner-bundle build --arch=arm64` → **PASS**
- `pnpm verify:runner-bundle build --arch=x64` → **FAIL**, all three runners reported missing
  (`build/bin/x64/darwin` still holds onefile binaries — 34.16-CONTEXT.md constraint 3 predicted this)

Because that step is `&&`-chained, `pnpm dist:mac` and `pnpm release:mac` now abort on every machine
until real x64 onedir digests are pinned (plan 34.16-05), and `build-base.yml:48`'s macos-15 leg will
fail on the first PR or push to `main`. No 34.16 artifact records this consequence. It also
invalidates `pnpm dist:mac --arm64 --publish=never` — the arch flags land on `electron-builder`, not
on the hardcoded guard steps — which is the recipe that discharged 34.9 ledger item 16 and that
`34.9-GUARD-PROOF.md` §2.5 AMENDMENT v2 §A3 makes normative.

## Scope

Documentation only. No source file, no `package.json`, no workflow is touched.

## Tasks

### Task 1: Refresh C2-05's disposition record in 34.9-REVIEW-CYCLE2.md

**Files:** `.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-CYCLE2.md`

**Action:** Update the frontmatter `disposition_note` to state that C2-05's code-side fix landed in
`adc648eb6` and that what remains is the unobserved "does a real x64 onedir tree pass the guard"
question (34.16-05 pins digests, 34.16-06 is the live gate). Bump `disposition_updated` to
2026-08-25 and extend `dispositioned_by`. Preserve the superseded note verbatim, per this file's own
"annotated, never replaced" convention. Add a dated ANNOTATION under the C2-05 finding body pointing
at the same commit — the finding text itself stays unedited.

**Verify:** `disposition:` still reads `partial`; the prior note text is still present; `adc648eb6`
appears in both the frontmatter and the C2-05 section.

**Done:** A reader of C2-05 learns the wiring landed and what is actually still open.

### Task 2: Record the interim packaging block in 34.16-CONTEXT.md

**Files:** `.planning/phases/34.16-macos-runner-onedir-x64-ci-leg-publish-the-workflow-to-the-d/34.16-CONTEXT.md`

**Action:** Add a constraint to the `<constraints>` block recording (a) that both macOS packaging
scripts now abort at the x64 guard until digests are pinned, with the two observed guard runs as
evidence, (b) that `build-base.yml:48`'s macos-15 leg fails on the first PR/push to `main`, and
(c) that `pnpm dist:mac --arm64 --publish=never` is invalidated because the guard steps are
hardcoded, naming 34.9 ledger item 16 and GUARD-PROOF AMENDMENT v2 §A3 as the affected recipes.
Add a matching correction entry so a reader of the corrections block is not left with the stale
"item 18 is blocked on the push" framing.

**Verify:** `grep -n "arch=x64" 34.16-CONTEXT.md` shows the new constraint; the existing seven
constraints and four corrections are unedited.

**Done:** Any planner picking up 34.16-03/04/05/06 learns packaging is fail-closed in the interim
before trying to run it.
