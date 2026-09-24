---
phase: quick-260924-rbx
plan: 01
subsystem: infra
tags: [github-actions, tauri-action, release, ci, dry-run]

requires: []
provides:
  - "workflow_dispatch dry_run input (default true) on release-tauri.yml"
  - "single job-level GAMELIB_DRY_RUN boolean, gated on github.event_name"
  - "conditional tauri-action tagName/releaseName (empty on dry run) and unconditional empty releaseId"
  - "GitHub-expression evaluator (evaluateGithubExpression) + resolved-value jest gates in releaseWorkflow.test.ts"
affects: [release-tauri.yml, releaseWorkflow.test.ts]

tech-stack:
  added: []
  patterns:
    - "resolved-value GitHub-expression assertions (parse YAML, then evaluate the expression string against an explicit ctx) instead of raw source greps, for anything with && / || logic"

key-files:
  created: []
  modified:
    - ".github/workflows/release-tauri.yml"
    - "src/backend/__tests__/releaseWorkflow.test.ts"

key-decisions:
  - "dry_run defaults to true (safe-by-default) because tagName: v__VERSION__ resolves from tauri.conf.json's version, not the pushed tag's literal name -- every throwaway dispatch/tag this gap cycle would otherwise land in the same shared draft release (id 378785323)"
  - "tagName/releaseName use the inverted `env.GAMELIB_DRY_RUN != 'true' && 'v__VERSION__' || ''` polarity, not the naive `== 'true' && '' || 'v__VERSION__'` form, because GitHub's &&/|| are value-returning and an empty string is falsy -- the naive form fails in the dangerous direction (creates the tag on a dry run)"
  - "releaseId: '' is unconditional, not gated on GAMELIB_DRY_RUN, since an absent input and '' are read identically by tauri-action and this makes 'never touch an existing release by id' explicit and assertable"
  - "no artifact-upload step was added for the dry run's build output; releaseWorkflow.test.ts's absolute ban on the upload-artifact/cache actions (:272-276) was left byte-identical rather than amended, per the plan's TRAP 3"
  - "notarization behavior is unchanged and left running on dry runs (all six Apple secrets are enrolled); this is a recorded, deferred trade-off (T-rbx-04), not an oversight -- no todo filed, per plan scope"

requirements-completed: [QT-260924-rbx]

duration: ~35min
completed: 2026-09-24
---

# Quick Task 260924-rbx: Dry-run conditional for Release Tauri Summary

**Added a `dry_run` `workflow_dispatch` input (default `true`) to `release-tauri.yml`, computed once as a job-level `GAMELIB_DRY_RUN` boolean gated on `github.event_name`, so a manual dispatch now builds all three matrix legs without creating a git tag or creating/mutating the shared draft GitHub release (id `378785323`) -- while a real `v*` tag push is byte-for-byte unaffected.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-24T08:05:03Z
- **Tasks:** 2 (RED test task, GREEN implementation task)
- **Files modified:** 2

## Accomplishments

- `workflow_dispatch` gained a `dry_run: boolean` input, default `true` (opt-out, not opt-in), with the rationale for that default recorded as a workflow comment.
- Exactly one computation site for the dry-run boolean: `jobs.release.env.GAMELIB_DRY_RUN`, using the `inputs.` context spelling (not the string-valued `github.event.inputs.*`, which would make dry-run impossible to disable — TRAP 2) and explicitly conjoined with `github.event_name == 'workflow_dispatch'` so a `push` event can never enter dry-run regardless of what `inputs.dry_run` resolves to.
- `tauri-action`'s `tagName`/`releaseName` resolve to `''` on a dry run and to their prior real values (`v__VERSION__` / `'GameLib v__VERSION__'`) otherwise, using the polarity-correct `env.GAMELIB_DRY_RUN != 'true' && '<value>' || ''` form (TRAP 1's inverted naive form was independently confirmed to fail in the dangerous direction and is documented as such in the workflow comment).
- `releaseId: ''` added unconditionally, making "never touch an existing release by id" explicit.
- No step was added to the job — the absolute `actions/upload-artifact` / `actions/cache` ban at `releaseWorkflow.test.ts:272-276` is untouched and still passes; a rejected path-confined-upload alternative is recorded in a workflow comment (TRAP 3 / T-rbx-01).
- `releaseWorkflow.test.ts` gained a `GitHub-expression evaluator` (`evaluateGithubExpression`) with value-returning `&&`/`||` semantics and a positive control proving it reproduces the naive-form empty-string trap rather than discarding operand values, plus resolved-value assertions over the new input, the env computation, and the `tauri-action` `with:` block (including the "push can never enter dry-run" failing-direction case), and invariant re-assertions (diagnostic-step ordering, single `timeout-minutes`, parsed no-upload-artifact/cache).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — gate the dry-run wiring on RESOLVED expression values, with a positive control** — `ef2defb43` (test)
2. **Task 2: GREEN — add the dry_run input, the single GAMELIB_DRY_RUN boolean, and the conditional release inputs** — `6abd9db98` (feat)

_No plan-metadata commit made by this executor — the orchestrator handles the docs commit per the constraints in this task's brief._

## Files Created/Modified

- `.github/workflows/release-tauri.yml` — added the `dry_run` dispatch input (default `true`), the `GAMELIB_DRY_RUN` job-level env computation, and the conditional `tagName`/`releaseName`/unconditional `releaseId` on the `tauri-action` step; extensive inline rationale comments per plan requirements.
- `src/backend/__tests__/releaseWorkflow.test.ts` — extended `ParsedReleaseStep`/`ParsedReleaseWorkflow` (additive `with?`/`on?` fields), added `parseReleaseWorkflow()` and `evaluateGithubExpression()`, and a new `release-tauri.yml dry-run dispatch mode (260924-rbx)` describe block (13 new test cases across 4 nested `describe`s).

## Decisions Made

See `key-decisions` in frontmatter above. All decisions were specified by the plan and its orchestrator addendum (expression polarity, evaluator semantics, `releaseId` unconditionality); none required an independent judgment call beyond following the plan precisely.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Workflow comment text accidentally tripped the absolute upload-artifact/cache ban it was explaining**
- **Found during:** Task 2, first `<verify>` run (`npx jest ...`)
- **Issue:** The `GAMELIB_DRY_RUN` env comment explained the rationale for adding no upload step by writing the literal strings `actions/upload-artifact` and `actions/cache` in prose. `releaseWorkflow.test.ts:272-276`'s raw-text ban (`expect(source).not.toContain('actions/upload-artifact')` / `not.toContain('actions/cache')`) reads the **unstripped** file, so the explanatory comment itself failed the very test it was documenting compliance with.
- **Fix:** Reworded the comment to refer to "the artifact-upload and cache GitHub Actions" and point at the existing test by its description string instead of quoting the banned action names verbatim.
- **Files modified:** `.github/workflows/release-tauri.yml`
- **Verification:** Re-ran `npx jest src/backend/__tests__/releaseWorkflow.test.ts src/backend/__tests__/tauriConf.test.ts meta/__tests__/artifactTargets.test.ts` — all green, including the `:272-276` ban.
- **Committed in:** `6abd9db98` (part of Task 2 commit — caught before the commit was made, not a separate fix-up commit)

---

**Total deviations:** 1 auto-fixed (1 Rule-1 bug, caught by the task's own verify loop before committing)
**Impact on plan:** No scope creep — the fix only reworded a comment's phrasing; the substantive content (why no upload step exists) is unchanged.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — no external service configuration required.

## Verification Evidence

All commands below were run for real; output is condensed but not fabricated.

**Task 1 (RED):**
```
npx prettier --check src/backend/__tests__/releaseWorkflow.test.ts   -> All matched files use Prettier code style!
pnpm codecheck                                                        -> clean (no output = success)
npx jest src/backend/__tests__/releaseWorkflow.test.ts
  Tests: 8 failed, 23 skipped, 75 passed, 106 total
  8 failures confined to the new "260924-rbx" describe block:
    - INPUT DECLARATION: dry_run is a boolean workflow_dispatch input defaulting to true
    - (4x) SINGLE SOURCE, GATED ON THE EVENT sub-tests
    - (3x) REAL-RELEASE PATH CANNOT BE SILENTLY TURNED OFF sub-tests
  Already green as expected: the evaluator positive control (a) and all
  three INVARIANTS THIS CHANGE MUST NOT DISTURB tests (e), plus the
  "push trigger still targets v*" test.
```

**Task 2 (GREEN, after the comment fix above):**
```
node -e "require('js-yaml').load(...)"                                -> YAML OK
npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts
  -> All matched files use Prettier code style!
npx jest releaseWorkflow.test.ts tauriConf.test.ts artifactTargets.test.ts
  -> Test Suites: 3 passed, 3 total
  -> Tests: 41 skipped, 114 passed, 155 total
pnpm planning-gates -> 12/12 planning gates passed.
```

**Orchestrator-mandated diff guards (run against pre-plan base `4779bb1bd`, since Task 1 and Task 2 were committed separately):**
```
git diff --stat 4779bb1bd -- .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts
  -> 2 files changed, 386 insertions(+), 2 deletions(-)   [EXACTLY 2 files]

git diff -U0 4779bb1bd -- src/backend/__tests__/releaseWorkflow.test.ts | grep '^@@'
  -> @@ -1138,0 +1139 @@ / @@ -1143,0 +1145,9 @@ / @@ -1154,0 +1165,99 @@ / @@ -1373,0 +1483,191 @@
  [no hunk touches lines 272-276]

git diff 4779bb1bd -- .github/workflows/release-tauri.yml | grep -c '^+.*uses:'
  -> 0   [no step added]
```

The 2 deletions in the workflow diff are the two replaced `with:` lines
(`tagName: v__VERSION__` / `releaseName: 'GameLib v__VERSION__'`), not a
removed step — confirmed by reading the full diff, which shows them
replaced in place by the conditional-expression forms plus a new
`releaseId: ''` line.

## Deferred Trade-off (T-rbx-04, disposition: accept)

**Notarization behavior is unchanged by this task.** All six Apple signing
secrets are now enrolled, so a dry run performs a real `notarytool submit
--wait` — slow, and it consumes a real submission. Skipping notarization on
dry runs was considered and explicitly **not** done: it would stop dry runs
from exercising a path already proven live by run `35942560790`. This is
recorded as a workflow comment next to the `GAMELIB_DRY_RUN` computation and
surfaced here per the plan's scope fence. **No todo was filed for this**, per
explicit plan instruction.

## Next Phase Readiness

- The dry-run conditional is entirely static/parsed-gate verified; no dry run
  has ever executed (per the plan's own `<verification>` section, this is
  stated plainly rather than implied). The live discharge — actually
  dispatching the workflow with the default input and confirming no tag/
  release is created — belongs to a separate operator action, outside this
  task's scope fence (which forbids triggering a workflow run or touching
  draft release `378785323`).
- `src-tauri/tauri.conf.json`, `promote-updater-feed.yml`, all signing steps,
  and all gate scripts were left untouched, as required.

---
*Phase: quick-260924-rbx*
*Completed: 2026-09-24*

## Self-Check: PASSED

- FOUND: `.github/workflows/release-tauri.yml`
- FOUND: `src/backend/__tests__/releaseWorkflow.test.ts`
- FOUND: `.planning/quick/260924-rbx-add-a-dry-run-conditional-to-release-tau/260924-rbx-SUMMARY.md`
- FOUND: commit `ef2defb43` (Task 1)
- FOUND: commit `6abd9db98` (Task 2)
