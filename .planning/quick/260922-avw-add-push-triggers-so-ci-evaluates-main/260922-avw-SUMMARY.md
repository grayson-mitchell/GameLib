# Quick Task 260922-avw: Add push triggers so CI evaluates main — Summary

One-liner: added a `push:`-on-`[main, stable]` trigger (filtered by `paths-ignore`) plus a
top-level `concurrency` block to `test.yml`, `lint.yml`, and `codecheck.yml`, pinned the wiring
with a new `js-yaml`-structural jest suite, and closed the source todo after recomputing its two
line-number citations that the insertion shifted.

## Starting state correction (as instructed)

Executed at HEAD `2b18e4ef3` (not the plan frontmatter's baseline sha — `260922-e01` landed in
between and touches none of this task's files). Per the state_correction: Lint and Test were both
green in CI already (first green Lint run in the fork's recorded history), and
`pnpm find-deadcode` measured `unreachable: 47 OK | used-in-module: 203 OK` — those numbers were
re-measured during this task's own verification and are unchanged (see Verification below), so no
correction to the deadcode ledgers was made or needed.

## Tasks completed

### Task 1 — push trigger + concurrency on all three workflows

Replaced the identical four-line `on:` block in `.github/workflows/{test,lint,codecheck}.yml`
with the locked block: `push` on `[main, stable]` filtered by two `paths-ignore` globs
(`.planning/**`, `**.md`), the pre-existing `pull_request` and `workflow_dispatch` left byte-
identical and unfiltered, and a new top-level `concurrency` block
(`group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`).

Verified: js-yaml structural check OK on all three (keys `on`/`concurrency`/`permissions`/`jobs`,
`push.branches == [main, stable]`, two-entry `paths-ignore`, unfiltered `pull_request`,
`concurrency['cancel-in-progress'] === true`, `permissions.contents == 'read'`). Prettier clean.
`git diff --numstat` confirmed exactly `+9/-0` per file, with the only removed lines being the four
lines of the old `on:` block — nothing under `jobs:` or `permissions:` moved.

Commit: `4155d96b6` — `feat(quick-260922-avw): add push trigger and concurrency to quality workflows`

### Task 2 — pin the wiring with a js-yaml structural test

Wrote `meta/__tests__/ciTriggerWiring.test.ts`, modelled on `meta/__tests__/planningGatesWiring.test.ts`
and its stated philosophy that a wiring gap needs a test, not just a fix. 28 tests across
`describe.each` over the three workflows plus a standalone anti-vacuity `describe`:
- push-on-`main`/`stable` presence
- non-empty `push['paths-ignore']`
- top-level `concurrency.cancel-in-progress === true`
- survival of `pull_request` and `workflow_dispatch` as keys (never truthiness —
  `workflow_dispatch:` parses to `null`)
- `pull_request` stays unfiltered (no `paths-ignore` under it)
- `permissions.contents === 'read'` byte-preserved
- self-test that the parsed `name` is real, non-empty text
- a `hasWiredPushTrigger()` predicate factored out and proven by a dedicated `describe` to reject
  `{ on: { pull_request: {...} } }`, `{}`, push-without-`paths-ignore`, and
  push-without-`concurrency` — the near-miss/anti-vacuity arm.

Used `import { load } from 'js-yaml'` (named import, not default) — measured 0 eslint problems.

**RED proof, executed exactly as instructed:**
1. `cp .github/workflows/test.yml "$SCRATCH/test.yml.bak"`
2. Removed the `push:` stanza from the live `test.yml` in place (via Edit, not `git checkout --`,
   to avoid firing the `post-checkout` hook).
3. Ran the suite. Result: **3 of 28 failed**, all and only in the `CI trigger wiring: test.yml`
   block:
   - `✕ declares push on main (and stable)`
   - `✕ push is filtered by a non-empty paths-ignore`
   - `✕ the wiring predicate accepts this workflow as written`
   The `lint.yml` and `codecheck.yml` describe blocks and the anti-vacuity describe stayed fully
   green (25/28 passed) — proving the failure was scoped to the mutated file, not a global break.
4. `cp "$SCRATCH/test.yml.bak" .github/workflows/test.yml`.
5. Re-ran: 28/28 green. `git diff --numstat .github/workflows/test.yml` after restore showed no
   output at all (the file was byte-identical to the already-committed Task 1 state, i.e. clean —
   stronger than the `9 0` the plan asked for, since Task 1 had already landed by this point).

Commit: `38b47198a` — `test(quick-260922-avw): pin the push-trigger wiring on all three workflows`

### Deviation — Rule 1 auto-fixed bug: prettier formatting on the new test file

**Found during:** full-baseline verification (`pnpm prettier`, repo-wide), after Task 2's commit
had already landed.
**Issue:** `meta/__tests__/ciTriggerWiring.test.ts` as committed in `38b47198a` had two missing
trailing commas and one call-argument line-wrap that prettier reformats. `pnpm prettier --check .`
failed with exactly this one file flagged.
**Fix:** `npx prettier --write meta/__tests__/ciTriggerWiring.test.ts`. Re-verified jest (28/28),
eslint (0 problems), and repo-wide prettier (clean) after the fix. No behavioral change.
**Commit:** `5d61e4091` — `fix(quick-260922-avw): prettier-format the new CI-trigger pin test`
(new commit, not an amend, per protocol — Task 2's commit had already landed).

### Task 3 — recompute the two moved citations, close the source todo

**3a/3c — recompute and read back, not calculate:**
- `grep -n 'run: pnpm smoke:sidecar' .github/workflows/test.yml` → **line 41** (predicted 41).
  Read back: `        run: pnpm smoke:sidecar` — confirmed the intended line.
- `grep -n 'run: pnpm prettier' .github/workflows/lint.yml` → **line 28** (predicted 28).
  Read back: `        run: pnpm prettier` — confirmed the intended line.
Both predictions in the plan held exactly; grep was run regardless, per instruction.

**3b — updated exactly two citations:**
- `CLAUDE.md`: `` `.github/workflows/test.yml:32` `` → `` `.github/workflows/test.yml:41` ``
- `.planning/ROADMAP.md`: `` `.github/workflows/lint.yml:19` `` → `` `.github/workflows/lint.yml:28` ``
`git diff --stat` on these two files showed exactly 2 insertions/2 deletions total — nothing else
in either file touched. The other historical citations of these workflow paths elsewhere in the
repo (completed todos, past SUMMARY/REVIEW/PLAN files) were left untouched, per the citation scope
boundary — this task deliberately did not sweep them.

**3d — answered the open question:** replaced the todo's "Open question, not answered here"
section (which asked whether `pnpm test:ci` was green) with the measured result: **exit 0 — 440
suites, 9025 passed, 2 skipped, zero failures** (measured at `f12a8bfc4`, this plan's baseline
HEAD), and re-titled the section "Open question, since answered." Left the rest of the todo body,
including its verbatim `test.yml:32` quote of `CLAUDE.md` as it read on the day of filing,
untouched.

**3e — moved it with the staged-content check the plan mandates for `git mv`:**
1. `git add` the pending-path file first (staging the 3d edit).
2. `git mv` to `.planning/todos/completed/<same filename>`.
3. Before committing: `git show :<completed-path> | grep -c '9025 passed'` → `1`;
   `git show :<completed-path> | grep -c 'Open question, not answered here'` → `0`. Both passed,
   confirming the staged index bytes carried the edit rather than the pre-edit HEAD content that
   `git mv` is recorded (three times in this repo) to silently restore.

Commit: `214c0beb1` — `docs(quick-260922-avw): recompute moved workflow line citations, close CI-trigger todo`

## Verification (full baseline, run in the order specified, after all commits)

| gate | result |
|------|--------|
| `npx jest meta/__tests__/ciTriggerWiring.test.ts` | green — 28/28 |
| `pnpm lint` | exit 0 — production **1119/1124**, tests **638/638** (zero headroom, still PASS): `production: PASS \| tests: PASS` |
| `pnpm prettier` (repo-wide) | clean, exit 0 (after the Rule 1 fix above) |
| `pnpm codecheck` | exit 0 |
| `pnpm find-deadcode` | exit 0 — `unreachable: 47 OK \| used-in-module: 203 OK` (matches the state_correction's measured figures exactly) |
| `pnpm planning-gates` | 12/12 |
| `pnpm test:ci` | exit 0 — **441 suites passed / 441 total** (baseline 440), **9056 passed, 2 skipped, 9058 total** (baseline 9025 passed — strictly greater, as required; the delta reflects the 28 new tests plus other tests that landed on `main` between the plan's baseline sha and this run) |
| `git status --porcelain` | clean except the untracked `.planning/quick/260922-avw-.../` plan/summary directory (not committed, per instruction) — no stray `.bak` or mutated workflow left over from the Task 2 RED proof |

## Threat model disposition (as declared, all held)

- T-avw-01 (elevation of privilege): `permissions.contents == 'read'` confirmed byte-preserved in
  all three files by both the Task 1 automated verify and the plan-level structural check.
- T-avw-02 (tampering): the new pin test is exactly the mitigation — proven RED against a
  `push:`-less `test.yml` in Task 2.
- T-avw-03 (repudiation via `cancel-in-progress`): accepted trade, unchanged from the plan's
  argument; not revisited here.
- T-avw-04 (log disclosure on a public repo): unchanged, job bodies untouched.
- T-avw-SC (package install): n/a — no installs; `js-yaml@^4.1.1` was already a devDependency.

## Known residual — cannot be verified locally

**Firing was not verified.** Nothing local proves that a `push:` trigger actually schedules a
GitHub Actions run — that requires an actual push to `main` and observation of the Actions tab.
`actionlint` is not installed and was not invoked, per instruction. The honest gates run here are:
the YAML parses, the parsed structure matches what was intended (js-yaml checks, all green), the
pin test is green, and the pre-existing baseline gates all stayed green with the tested-count going
up, not sideways. **Live confirmation belongs to the operator's next push to `main`** — check the
Actions tab for automatically-scheduled `Test`, `Lint`, and `Code check` runs against that push,
without a manual dispatch.

The planner's own noted concern also stands, unaddressed by design: the two line-number citations
recomputed in Task 3 are still ungated — nothing greps them, so they can rot again on the next edit
that shifts lines above them. The locked plan deliberately did not widen Task 2's pin to cover this
(scoped to trigger structure only), so this remains a known, accepted gap rather than an oversight.

## Self-check

- `test -f .github/workflows/test.yml && grep -q 'push:' .github/workflows/test.yml` → FOUND
- `test -f .github/workflows/lint.yml && grep -q 'concurrency:' .github/workflows/lint.yml` → FOUND
- `test -f meta/__tests__/ciTriggerWiring.test.ts` → FOUND
- `test -f .planning/todos/completed/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md` → FOUND
- `test ! -f .planning/todos/pending/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md` → CONFIRMED (no longer in pending/)
- Commits `4155d96b6`, `38b47198a`, `5d61e4091`, `214c0beb1` all present in `git log --oneline`.

## Self-Check: PASSED

## Commits

| commit | type | subject |
|--------|------|---------|
| `4155d96b6` | feat | add push trigger and concurrency to quality workflows |
| `38b47198a` | test | pin the push-trigger wiring on all three workflows |
| `5d61e4091` | fix | prettier-format the new CI-trigger pin test (deviation, Rule 1) |
| `214c0beb1` | docs | recompute moved workflow line citations, close CI-trigger todo |
