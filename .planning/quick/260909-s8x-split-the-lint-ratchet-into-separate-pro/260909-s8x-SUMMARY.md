---
phase: quick-260909-s8x
plan: 01
subsystem: infra
tags: [eslint, ci, lint, ratchet, node-api]

requires: []
provides:
  - "meta/lintScoped.cjs: single-source-of-truth ESLint-Node-API runner enforcing two independent
    warning ceilings (production 1123, tests 638) plus a minFiles scope-collapse floor for each"
  - "eslint.config.mjs test override disables the five no-unsafe-* rules alongside the pre-existing
    no-explicit-any: off, resolving the policy contradiction where any was sanctioned but its
    consumption rules still warned"
  - "package.json lint:src / lint:tests scripts exposing each ceiling independently"
affects: [ci, lint, husky-pre-push, github-actions-lint-workflow]

tech-stack:
  added: []
  patterns:
    - "ESLint Node API (`require('eslint').ESLint`) instead of a spawned binary, avoiding
      eslint 9.29.0's ERR_PACKAGE_PATH_NOT_EXPORTED on eslint/bin/eslint.js and the repo's
      catalogue of shell/exit-code fail-open shapes"
    - "Two independent zero-padding warning ceilings plus a 50%-of-measured-files minFiles floor
      per scope, to prevent one population's headroom absorbing the other's regression and to
      catch a glob silently matching nothing"

key-files:
  created:
    - meta/lintScoped.cjs
    - .planning/quick/260909-s8x-split-the-lint-ratchet-into-separate-pro/260909-s8x-LINT-BASELINE.md
  modified:
    - eslint.config.mjs
    - package.json
    - .gitignore
    - .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-LINT-BASELINE.md

key-decisions:
  - "lint runs both scopes unconditionally and fails if either fails (an AND of successes, i.e.
    ORs the failures) rather than chaining lint:src && lint:tests, so a production failure never
    hides the test half's result behind a second round trip"
  - ".husky/pre-push and .github/workflows/lint.yml stay deliberately unmodified -- both call bare
    pnpm lint, which still covers both scopes, so there is exactly one aggregate entry point"
  - "The 66 .tsx test files carrying 43 no-unsafe-* warnings were NOT folded into the disabled-rule
    override (glob stays *.ts only) -- widening it would have turned no-explicit-any off for 66
    files that currently pass with it on, an unrequested policy loosening"

requirements-completed: [QUICK-260909-s8x]

duration: ~16min (commit-to-commit span; full session including measurement and the mutation
  matrix ran longer)
completed: 2026-09-09
---

# Quick 260909-s8x: Split the Lint Ratchet Into Separate Production/Test Ceilings — Summary

**Replaced the single `--max-warnings 4157` ESLint gate with two independent ceilings (production
1123, tests 638) enforced by a new `meta/lintScoped.cjs` Node-API runner, after first disabling
the five `no-unsafe-*` rules in test files to stop them firing on an `any` the same config block
already sanctions.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 created, 4 modified)
- **Commits:** 3 task commits (`8f0d7ff20`, `1c1345064`, `41591dbee`)

## Accomplishments

- Resolved the policy contradiction: the test override already permits `any`
  (`no-explicit-any: 'off'`) but the five rules that fire on consuming an `any` stayed on. They
  are now `off` in the same override, for `.ts` test files only. Production keeps them at `warn`
  — confirmed rule-for-rule identical (not just aggregate-count identical) before and after.
- Built `meta/lintScoped.cjs`, the single source of truth for both scopes' patterns, ceilings,
  cache locations, and file-count floors, using the ESLint Node API directly (no spawned binary,
  no shell, no exit-code loss).
- `pnpm lint` now runs both scopes unconditionally and fails if either fails; `pnpm lint:src` and
  `pnpm lint:tests` expose each independently. `.husky/pre-push` and
  `.github/workflows/lint.yml` needed zero edits — both call bare `pnpm lint`.
- Ran and recorded all 7 required mutation-proof cases (both ceilings in both directions, both-
  halves propagation without short-circuit in both directions, and a scope-collapse fail-open
  probe) — 7/7 behaved exactly as specified, and the runner file was restored byte-identical after
  every mutation, confirmed by `shasum`, never by retyping.
- Wrote `260909-s8x-LINT-BASELINE.md` (496 lines) carrying verbatim transcripts, the scope-
  symmetry set-operation proof (against both raw `eslint` and the new scripts), the plan-vs-
  measured reconciliation, the recorded `.tsx` asymmetry, and the mutation matrix. Marked
  `39-LINT-BASELINE.md`'s superseded `4157` ratchet in place, pointing at the new document.

## Task Commits

1. **Task 1: Resolve the policy contradiction and measure both populations** - `8f0d7ff20` (fix)
2. **Task 2: Install two independent ratchets behind a single-source-of-truth runner** -
   `1c1345064` (fix)
3. **Task 3: Write the baseline record, supersede the old ceiling, and commit by explicit path** -
   `41591dbee` (docs)

_No SUMMARY/STATE/ROADMAP metadata commit was made by this executor — the orchestrator owns
that, per this task's explicit constraints._

## Both Final Ceilings

| Scope | Ceiling | Measured against | minFiles floor |
|---|---|---|---|
| production (`SRC_CEILING`) | **1123** | `8f0d7ff20` | 375 (50% of 751 measured files) |
| tests (`TESTS_CEILING`) | **638** | `8f0d7ff20` | 220 (50% of 441 measured files) |

Neither carries padding. Both proven RED at N-1 and GREEN at N in the mutation matrix (cases 1-4).

## Plan-vs-Measured Reconciliation Outcome

Production landed exactly on the planner's prediction (1123, unchanged, rule-for-rule identical).
Tests landed at **638**, one above the top of the planner's predicted range (635 + 1-2 = 636 or
637). Root cause found and fully reconciled: the planner correctly identified that disabling the
five rules would turn `src/preload/__tests__/childWindows.test.ts:127`'s
`eslint-disable-next-line` comment into an unused directive (contributing 1 new warning), but
missed a **second** file with the same shape —
`src/backend/__tests__/launcher_callRunner.test.ts:260` — which contributes 2 more (ESLint reports
one unused-directive warning per rule named on that line, versus one combined message for
`childWindows.test.ts`'s comment). 635 + 1 + 2 = 638, exactly what was measured. Full detail,
including the diffed `ruleId: null` findings from both files, is in
`260909-s8x-LINT-BASELINE.md`'s reconciliation table. Per the plan, neither directive was deleted.

## 7/7 Mutation Matrix Result

All seven cases behaved exactly as specified — full verbatim transcripts in
`260909-s8x-LINT-BASELINE.md`:

1. `pnpm lint:src` at `SRC_CEILING - 1` (1122) → exit 1, names maximum 1122. **PASS**
2. `pnpm lint:src` restored to 1123 → exit 0. **PASS**
3. `pnpm lint:tests` at `TESTS_CEILING - 1` (637) → exit 1, names maximum 637. **PASS**
4. `pnpm lint:tests` restored to 638 → exit 0. **PASS**
5. `pnpm lint` with only `SRC_CEILING` lowered → exit 1, AND the tests half's full stylish output
   printed in the same run (proves no short-circuit). **PASS**
6. `pnpm lint` with only `TESTS_CEILING` lowered → exit 1 (production alone was clean). **PASS**
7. `pnpm lint:tests` with the `tests` patterns pointed at a nonexistent directory → exit 1, names
   the `minFiles` floor (220) against 0 observed files — proven to be the floor catching it, not
   an ESLint abort, because `errorOnUnmatchedPattern: false` let the run complete. **PASS**

Every mutation was made against a `cp` backup and restored from it, confirmed byte-identical by
`shasum -a 256` (never by retyping) before moving to the next case.

## Two Recorded Decisions

1. **`lint` runs both scopes unconditionally and fails if either fails**, rather than chaining
   `lint:src && lint:tests`. The chained form is exit-code-correct but reports only half the
   picture: a production failure would stop the command before the test scope ever ran. Since the
   entire point of the split is independent visibility, chaining defeats it.
2. **`.husky/pre-push` and `.github/workflows/lint.yml` stay unmodified.** Both call bare
   `pnpm lint`, which still runs and still fails on either half, so keeping one aggregate entry
   point avoids any risk of a future caller being updated to run only one scope.

## Files Created/Modified

- `meta/lintScoped.cjs` - the single-source-of-truth runner (ESLint Node API, two scopes, two
  ceilings, two floors, unconditional both-halves aggregate)
- `eslint.config.mjs` - added the five `no-unsafe-*` rules at `'off'` to the existing test
  override, alongside `no-explicit-any: 'off'`
- `package.json` - `lint` now delegates to `node meta/lintScoped.cjs`; added `lint:src` and
  `lint:tests`
- `.gitignore` - added `.eslintcache-src` and `.eslintcache-tests` (explicit names, no wildcard)
- `.planning/quick/260909-s8x-.../260909-s8x-LINT-BASELINE.md` - the full measurement/proof record
- `.planning/phases/39-.../39-LINT-BASELINE.md` - SUPERSEDED note added in place on the old
  `4157` ratchet section; nothing else in that file changed

## Decisions Made

See "Two Recorded Decisions" above; also recorded in full with rationale in
`260909-s8x-LINT-BASELINE.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prettier syntax error from a literal `*/` sequence inside a `.cjs` block comment**
- **Found during:** Task 2 (writing `meta/lintScoped.cjs`)
- **Issue:** A doc comment describing `eslint.config.mjs`'s `**/*.cjs` ignore glob contained the
  literal substring `*/` (inside `**/*.cjs`), which prematurely closed the enclosing `/* ... */`
  block comment, producing a real syntax error (`prettier --check` caught it, not a linter).
- **Fix:** Reworded the comment to describe the same fact ("its `ignores` block already excludes
  every `.cjs` file") without spelling out the glob literal.
- **Files modified:** `meta/lintScoped.cjs`
- **Verification:** `npx prettier --check meta/lintScoped.cjs` passes; `node meta/lintScoped.cjs`
  runs without a syntax error.
- **Committed in:** `1c1345064` (part of Task 2 commit)

**2. [Constraint precedence] Task 3's commit list, as written in the plan, names the plan file
itself among the files to commit — the executor's explicit constraints forbid committing
PLAN.md/SUMMARY.md/STATE.md**
- **Found during:** Task 3 (commit step)
- **Issue:** The plan's Task 3 action says the third commit should include "this plan file". This
  quick task's own executor constraints ("Do NOT commit SUMMARY.md, PLAN.md or STATE.md — the
  orchestrator handles the docs commit") directly contradict that one clause.
- **Fix:** Followed the executor constraint (which is explicitly the higher-precedence
  instruction for this session) and committed only the two `*-LINT-BASELINE.md` files in the
  Task 3 commit. `260909-s8x-PLAN.md` remains untracked for the orchestrator to handle.
- **Files modified:** none beyond what Task 3 already specified minus the plan file.
- **Committed in:** `41591dbee` (Task 3 commit, scoped to the two baseline docs only)

---

**Total deviations:** 2 (1 auto-fixed bug, 1 constraint-precedence scoping decision).
**Impact on plan:** Neither affected the substance of the lint-ratchet change. No scope creep.

## Issues Encountered

None beyond the two deviations above and the tests-count reconciliation (635 predicted vs. 638
measured), which is fully explained in the Plan-vs-Measured Reconciliation section and is not a
defect — it is the planner's census having missed one file, now corrected.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `pnpm lint`, `pnpm lint:src`, `pnpm lint:tests`, `pnpm codecheck`, and `pnpm planning-gates` all
  exit 0 at HEAD. `.husky/pre-push`'s lint half is green (its `pnpm prettier` half is
  independently red per prior recorded todos, unrelated to this task and explicitly out of scope
  — this task did not run `pnpm prettier` repo-wide, only `npx prettier --check` on the files it
  touched, all of which are clean).
- `git diff --name-only -- src/` is empty across all three commits — zero individual lint warnings
  were fixed or suppressed, confirming this was a policy/measurement change only.
- Whoever next legitimately moves either ceiling should follow
  `260909-s8x-LINT-BASELINE.md`'s "How each ceiling is legitimately changed" section — fix
  warnings, re-measure with the documented commands, edit the one constant, commit with the fresh
  number and sha.

## Self-Check: PASSED

- `meta/lintScoped.cjs` exists: FOUND
- `.planning/quick/260909-s8x-split-the-lint-ratchet-into-separate-pro/260909-s8x-LINT-BASELINE.md`
  exists: FOUND
- Commit `8f0d7ff20` exists in `git log --oneline --all`: FOUND
- Commit `1c1345064` exists in `git log --oneline --all`: FOUND
- Commit `41591dbee` exists in `git log --oneline --all`: FOUND
- `pnpm lint` exits 0 at HEAD (re-verified after cache cleanup): CONFIRMED (638 warnings, both
  scopes PASS)
- `git status --short` at end of session shows only the three pre-existing unrelated paths
  (`.claude/skills/archify/`, `skills-lock.json`) plus this task's own uncommitted `PLAN.md`
  (deliberately excluded per constraints): CONFIRMED

---
*Phase: quick-260909-s8x*
*Completed: 2026-09-09*
