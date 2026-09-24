---
phase: quick-260924-rbx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/release-tauri.yml
  - src/backend/__tests__/releaseWorkflow.test.ts
autonomous: true
requirements: [QT-260924-rbx]
tdd_mode: true

must_haves:
  truths:
    - "A `workflow_dispatch` run with the default input builds all three matrix legs and creates NO git tag and NO GitHub release."
    - "A `v*` tag push still produces a real DRAFT PRERELEASE with a non-empty tagName, byte-for-byte the same behaviour as before this change."
    - "A push event can never enter dry-run mode, regardless of what `inputs.dry_run` resolves to."
    - "The dry-run boolean is computed in exactly one place; every other site reads that one value."
    - "The absolute `actions/upload-artifact` / `actions/cache` ban in releaseWorkflow.test.ts is still ABSOLUTE and byte-identical — the workflow satisfies it rather than amending it."
    - "No signing step, signing gate or updater-key preflight changes behaviour."
  artifacts:
    - path: ".github/workflows/release-tauri.yml"
      provides: "dry_run dispatch input (default true), the single GAMELIB_DRY_RUN job env value, conditional tagName/releaseName, explicit empty releaseId"
      contains: "GAMELIB_DRY_RUN"
    - path: "src/backend/__tests__/releaseWorkflow.test.ts"
      provides: "parsed-YAML + GitHub-expression-evaluator gates over the dry-run wiring, with a positive control proving the evaluator reproduces the empty-string trap"
      contains: "GAMELIB_DRY_RUN"
  key_links:
    - from: ".github/workflows/release-tauri.yml (on.workflow_dispatch.inputs.dry_run)"
      to: ".github/workflows/release-tauri.yml (jobs.release.env.GAMELIB_DRY_RUN)"
      via: "the `inputs` context, ANDed with github.event_name"
      pattern: "github\\.event_name == 'workflow_dispatch' && inputs\\.dry_run"
    - from: ".github/workflows/release-tauri.yml (jobs.release.env.GAMELIB_DRY_RUN)"
      to: "the tauri-action step's tagName and releaseName"
      via: "env.GAMELIB_DRY_RUN != 'true' guarding the non-empty branch"
      pattern: "env\\.GAMELIB_DRY_RUN"
    - from: "src/backend/__tests__/releaseWorkflow.test.ts"
      to: ".github/workflows/release-tauri.yml"
      via: "js-yaml parse + a GitHub-expression evaluator, asserting RESOLVED values per event"
      pattern: "evaluateGithubExpression"
---

<objective>
Make a manual `workflow_dispatch` of Release Tauri able to build all three matrix
legs WITHOUT creating a git tag and WITHOUT creating or touching a GitHub
release — and make that the DEFAULT for dispatch.

Purpose: `tagName: v__VERSION__` resolves from `tauri.conf.json`'s `version`
(`0.7.0`), NOT from the pushed tag's literal name. All four throwaway tags
(`v0.7.0-notarize-test1/2/3`, `v0.7.0-updater-test1`) therefore wrote into ONE
shared draft release, id `378785323`, which still carries a stale
`GameLib_0.7.0_x64.dmg` from 2026-08-28. A dispatch today would do the same. A
careless manual dispatch mutating a shared draft is the hazard this removes.

Output: a `dry_run` dispatch input defaulting to `true`, ONE job-level
`GAMELIB_DRY_RUN` boolean derived from `github.event_name`, conditional
`tagName`/`releaseName`, an explicit empty `releaseId`, and executable jest gates
over all of it.

**The dry run's deliverable is the LOG, not a binary.** An operator dispatches
this to prove that `install-deps`, tar, symlinks and packaging work on
`windows-latest` and that the bundler prints what it produced. A real `v*` tag
push is what yields an inspectable installer. Nothing is uploaded — see
`<traps>` TRAP 3 for why that is a decision, not an omission.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.github/workflows/release-tauri.yml
@src/backend/__tests__/releaseWorkflow.test.ts

Measured this session by the planner — do NOT re-derive:

- `.prettierignore` does **NOT** cover `.github/` in general. The only workflow
  it ignores is `.github/workflows/build-base.yml`. Therefore
  `npx prettier --check .github/workflows/release-tauri.yml` is a REAL check,
  not a vacuous pass. Both files this plan writes are prettier-enforced.
- `js-yaml` is 4.1.1 and already a direct devDependency, already imported at the
  top of `releaseWorkflow.test.ts` (`import { load as loadYaml } from 'js-yaml'`).
- **`loadYaml` keys the trigger block as the STRING `on`, not the boolean `true`.**
  Verified against the real file: `Object.keys(parsed)` is
  `["name","on","jobs"]` and `parsed.on` is
  `{"push":{"tags":["v*"]},"workflow_dispatch":null}`. So
  `parsed.on.workflow_dispatch.inputs.dry_run` is the correct access path. Do not
  write a `parsed['true']` workaround for a YAML-1.1 bool coercion that does not
  occur here.
- `actions/upload-artifact` and `actions/cache` appear NOWHERE in
  `.github/workflows/` today (`grep` over the whole directory returns nothing).
  That is the state `releaseWorkflow.test.ts`'s absolute ban protects, and this
  task MUST leave it true. See TRAP 3.
- Jest `projects` are `src/backend`, `src/common`, `src/frontend`,
  `src/preload`, `meta`. The backend project's `displayName` is `Backend`.
  Passing explicit test paths to `npx jest` resolves across projects, so one
  invocation covers `releaseWorkflow.test.ts`, `tauriConf.test.ts` (backend) and
  `artifactTargets.test.ts` (meta).
- `python3` is a Microsoft Store stub in Git Bash on this box (exits 49), and
  **PyYAML is absent from every interpreter present** — `python -c "import yaml"`
  and `py -c "import yaml"` both raise `ModuleNotFoundError: No module named
  'yaml'`. So no python one-liner can validate the workflow's YAML here; the
  plan uses `node` + the already-installed `js-yaml` instead, and says so at the
  point of use. `pnpm planning-gates` (`python3 meta/runPlanningGates.py`) works
  regardless — it resolves through cmd, not Git Bash, and imports no yaml.

<interfaces>
GitHub Actions context availability (checked against GitHub's own
"Context availability" table this session — both of these are load-bearing):

  jobs.<job_id>.env          -> github, needs, strategy, matrix, vars, secrets, inputs
                                (`env` itself is NOT available here)
  jobs.<job_id>.steps[*].with -> github, needs, strategy, matrix, job, runner,
                                 env, vars, secrets, steps, inputs

So a job-level `env:` value MAY read `github.event_name` and `inputs.*`, and a
step's `with:` MAY read `env.*`. That is exactly the shape this plan uses.

Already imported and available in releaseWorkflow.test.ts:

  import { load as loadYaml } from 'js-yaml'
  import { extractRunBlock as extractRunBlockFrom, readGithubEnv, runStepScript,
           stripHashComments, substituteExpressions } from './helpers/workflowSteps'

Already defined in releaseWorkflow.test.ts (reuse, do not duplicate):

  interface ParsedReleaseStep {
    name?: string; uses?: string; if?: string; run?: string
    env?: Record<string, unknown>
    'timeout-minutes'?: number; 'continue-on-error'?: boolean
  }
  interface ParsedReleaseWorkflow {
    jobs: Record<string, { env?: Record<string, unknown>; steps: ParsedReleaseStep[] }>
  }
  function loadReleaseWorkflow(): string
  function loadStrippedWorkflow(): string
  function parseReleaseSteps(): ParsedReleaseStep[]
  const describeOnPosix = process.platform === 'win32' ? describe.skip : describe

`ParsedReleaseStep` has no `with` field and `ParsedReleaseWorkflow` has no
trigger field. Extend both additively (add `with?: Record<string, unknown>` to
the step interface; add an `on` member to the workflow interface). Do not fork a
second parser — the file already declares a deliberate one-parser convention at
its `260917-uik` block.
</interfaces>
</context>

<traps>
Four mechanics that are individually sufficient to silently produce the WRONG
behaviour while every gate in this repo stays green. Treat each as a hard
requirement, not advice.

**TRAP 1 — the empty-string ternary is inverted from what you will reach for.**
GitHub's `&&`/`||` are value-returning, not boolean: `A && B` yields `A` when `A`
is falsy else `B`; `A || B` yields `A` when `A` is truthy else `B`. An EMPTY
STRING IS FALSY. So the natural-looking form

    ${{ env.GAMELIB_DRY_RUN == 'true' && '' || 'v__VERSION__' }}

evaluates, on a dry run, to `'' || 'v__VERSION__'` → **`v__VERSION__`** — i.e. it
creates the tag and mutates the shared draft, the exact hazard this task exists
to remove, failing in the dangerous direction. The condition MUST be inverted so
the non-empty branch is the truthy one:

    ${{ env.GAMELIB_DRY_RUN != 'true' && 'v__VERSION__' || '' }}

Independently confirmed by the operator this session. The test-side positive
control in Task 1 exists to keep this from silently regressing.

**TRAP 2 — `github.event.inputs.dry_run` is a STRING; `inputs.dry_run` is a BOOLEAN.**
With the `github.event.inputs.*` spelling, an unchecked box arrives as the string
`'false'`, which is TRUTHY in a GitHub expression — dry-run could then never be
turned off. Use the `inputs.` context spelling, which honours `type: boolean`.

**TRAP 3 — the `actions/upload-artifact` ban is ABSOLUTE and is NOT yours to amend.**
`releaseWorkflow.test.ts:272-276` reads:

    test('has no upload-artifact or cache step that could exfiltrate the workspace (and its cert.pfx)', () => {
      expect(source).not.toContain('actions/upload-artifact')
      expect(source).not.toContain('actions/cache')
    })

**This test is a CONSTRAINT THE CHANGE MUST SATISFY, not a test to modify.** Both
assertions stay byte-identical. Do not rename the test, do not soften it to a
path-confinement predicate, do not make it conditional, and do NOT add an
`actions/upload-artifact` step anywhere in the workflow.

WHY, recorded so a future reader does not "helpfully" add one. An earlier draft of
this task did specify a dry-run artifact upload. The operator withdrew it. Their
reasoning, accepted:
  - The dry run's real value is the BUILD LOG — proof that `install-deps`, tar,
    symlinks and packaging work on `windows-latest`, with the bundler printing
    what it produced. A real `v*` tag push is what yields the binary anyway.
  - Converting an ABSOLUTE security guarantee into a CONDITIONAL one is not worth
    an inspectable installer.

And the trap the operator explicitly REJECTED, which is the reason this is
absolute rather than merely careful: "`cert.pfx` is never written today because
the Windows signing secrets are not enrolled" is TRUE right now and still wrong
to rely on. A path-confined upload would plant a latent defect that ARMS the day
the SignPath certificate lands — exactly the class of dormant, confidently-green
failure this repo keeps stamping out. There is no upload step, so there is
nothing to arm.

**TRAP 4 — two existing positional assertions must not be disturbed.**
`'ORDERING: the diagnostic step sits immediately after tauri-action'` asserts
`diagIdx === tauriIdx + 1`, and `'blast-radius census: exactly one step in the
job carries timeout-minutes'` asserts `toHaveLength(1)`. This task adds NO steps
at all, so both hold trivially — but they are recorded here because they are the
reason adding a step is not a free action, and because Task 1 (e) re-asserts them
so a later change cannot break them unnoticed.
</traps>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — gate the dry-run wiring on RESOLVED expression values, with a positive control that proves the evaluator reproduces the empty-string trap</name>
  <files>src/backend/__tests__/releaseWorkflow.test.ts</files>
  <behavior>
Write these FIRST and confirm they are RED against the unmodified workflow.

Shared additions (additive, at the existing parsed-YAML block near the
`260917-uik` comment — reuse `loadReleaseWorkflow`, do not add a second parser):

  - extend `ParsedReleaseStep` with `with?: Record<string, unknown>`
  - extend `ParsedReleaseWorkflow` with
      on?: { push?: { tags?: string[] }
             workflow_dispatch?: { inputs?: Record<string, { type?: string; default?: unknown; description?: string }> } | null }
  - add `function parseReleaseWorkflow(): ParsedReleaseWorkflow`
  - add `function evaluateGithubExpression(expr: string, ctx: Record<string, string | boolean>): string | boolean`
    A minimal evaluator of GitHub's `&&`/`||` VALUE semantics over the subset
    this workflow uses. Required semantics:
      * strip a single wrapping `${{ ... }}` if present
      * split on `||` at the top level, then each side on `&&` (both
        left-associative; `&&` binds tighter than `||`)
      * operand forms: a single-quoted literal (`''` -> empty string), a
        comparison `<lookup> == '<lit>'` or `<lookup> != '<lit>'` -> boolean,
        or a bare `<lookup>` resolved from `ctx` (missing key -> `''`)
      * truthiness: `false` and `''` are falsy; `true` and any non-empty string
        are truthy
      * `A && B` -> falsy(A) ? A : B ; `A || B` -> truthy(A) ? A : B
    Lookups are resolved by literal dotted key against `ctx` (e.g.
    `'github.event_name'`, `'inputs.dry_run'`, `'env.GAMELIB_DRY_RUN'`).

(a) EVALUATOR POSITIVE CONTROL — **write this one first; it is the most valuable
    test in the task.** Every resolved-value assertion below is only as
    trustworthy as the evaluator, so the evaluator must be shown to reproduce
    TRAP 1 rather than to return whatever we hoped for:

      expect(evaluateGithubExpression("${{ env.D == 'true' && '' || 'v__VERSION__' }}",
                                      { 'env.D': 'true' })).toBe('v__VERSION__')
      expect(evaluateGithubExpression("${{ env.D != 'true' && 'v__VERSION__' || '' }}",
                                      { 'env.D': 'true' })).toBe('')

    The first line is the naive form and MUST evaluate to `v__VERSION__` — if the
    evaluator returns `''` there, it is a JS-semantics evaluator, not a GitHub
    one, and every assertion resting on it is worthless. Comment it to that
    effect. This test passes immediately (it exercises the helper, not the
    workflow) and that is expected.

(b) INPUT DECLARATION — `parseReleaseWorkflow().on.workflow_dispatch.inputs.dry_run`
    is defined, `type` is `'boolean'`, and `default` is the BOOLEAN `true` (not
    the string `'true'`). Also assert `push.tags` still contains `'v*'`.

(c) SINGLE SOURCE, GATED ON THE EVENT — read the job-level env value
    `parseReleaseWorkflow().jobs.release.env.GAMELIB_DRY_RUN` (a string
    expression, not prose, so a substring check here is sound) and assert it
    contains `github.event_name == 'workflow_dispatch'`. Then EVALUATE it:
      * `{ 'github.event_name': 'workflow_dispatch', 'inputs.dry_run': true }`  -> truthy
      * `{ 'github.event_name': 'workflow_dispatch', 'inputs.dry_run': false }` -> falsy
      * FAILING DIRECTION: `{ 'github.event_name': 'push', 'inputs.dry_run': true }` -> falsy.
        A push can never enter dry-run even with the input forced on.
    Also assert the expression does NOT use the string-valued
    `github.event.inputs` spelling (TRAP 2).

(d) REAL-RELEASE PATH CANNOT BE SILENTLY TURNED OFF — find the tauri-action step
    via `(s.uses ?? '').includes('tauri-action')`. Non-vacuity first: assert the
    step and each key read below is defined, so a renamed or removed key cannot
    pass by `undefined`. Then with `{ 'env.GAMELIB_DRY_RUN': 'false' }`:
      * `evaluateGithubExpression(String(step.with.tagName), ctx)` is a non-empty
        string and equals `'v__VERSION__'`
      * `releaseName` likewise resolves non-empty
      * `releaseDraft` is `true` and `prerelease` is `true` (D-09 guard, restated
        at the resolved level rather than only as the existing `toContain`)
    And with `{ 'env.GAMELIB_DRY_RUN': 'true' }`:
      * `tagName` and `releaseName` both resolve to `''`
      * `with.releaseId` is `''`

(e) INVARIANTS THIS CHANGE MUST NOT DISTURB — assert, in the new block, that
    nothing was appended or reordered:
      * the `notarytool history` diagnostic step is still at `tauriIdx + 1`
      * exactly one step in the job carries `timeout-minutes`, and it is
        tauri-action
      * NO step's `uses` includes `actions/upload-artifact` or `actions/cache`,
        asserted over the PARSED steps array. This is deliberately redundant with
        the existing raw-text ban at :272-276 and is the point: the raw ban
        catches the string, the parsed assertion catches a step, and a comment
        should record that the redundancy is intentional (see TRAP 3 — the ban is
        absolute because a path-confined upload would arm the day the SignPath
        cert lands).
  </behavior>
  <action>
Edit ONLY `src/backend/__tests__/releaseWorkflow.test.ts`. Add the shared helpers
and a new `describe('release-tauri.yml dry-run dispatch mode (260924-rbx)')`
block at the END of the file, in that file's existing parsed-YAML idiom (the
`260917-uik` / `260923-mrx` blocks are the models).

**Modify no existing test.** In particular, `releaseWorkflow.test.ts:272-276`
(`not.toContain('actions/upload-artifact')` / `not.toContain('actions/cache')`)
stays byte-identical — it is a constraint this change satisfies, not one it
amends (TRAP 3). Leave the weak `expect(source).toContain('workflow_dispatch')`
test at :87-89 alone too — it is harmless; do not imitate its style.

Write real assertions on RESOLVED values, not substring greps for `dry_run`. The
file's own header comment and the new workflow comments will legitimately contain
the strings `dry_run`, `GAMELIB_DRY_RUN`, `tagName` and `upload-artifact`, so a
raw `toContain` over the unstripped source would be satisfiable by prose alone —
this repo's recurring green-check-proving-nothing failure. The one sound
substring use is against a PARSED expression VALUE (the job env string), which
contains no comments.

Do NOT touch the workflow in this task.

Expected RED at the end of this task, and this is the point of the task: (b),
(c) and (d) fail because the `dry_run` input, the `GAMELIB_DRY_RUN` env value and
the conditional `tagName` do not exist yet. Record the actual failure count in
the SUMMARY.
  </action>
  <verify>
    <automated>
npx prettier --check src/backend/__tests__/releaseWorkflow.test.ts
pnpm codecheck 2>&1 | tail -20
npx jest src/backend/__tests__/releaseWorkflow.test.ts 2>&1 | tail -60
    </automated>
  </verify>
  <done>
`releaseWorkflow.test.ts` is prettier-clean and `pnpm codecheck` (the repo's
`tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`) is clean. `npx jest` on it
reports RED with failures confined to the new `260924-rbx` describe block, and
the failure messages name the MISSING workflow shape (undefined `dry_run` input /
undefined `GAMELIB_DRY_RUN` / a `tagName` with no conditional) — not a helper
crash.

Already GREEN at this point, and expected to be, because they exercise helpers or
the unchanged workflow rather than the new shape:
- (a) both evaluator positive-control assertions
- (e) all three invariants, including the parsed no-`upload-artifact`/no-`cache`
  assertion

Every pre-existing test in the file is still green and unmodified — `git diff`
on this file shows ADDITIONS ONLY, with no hunk touching lines 272-276.
  </done>
</task>

<task type="auto">
  <name>Task 2: GREEN — add the dry_run input, the single GAMELIB_DRY_RUN boolean, and the conditional release inputs</name>
  <files>.github/workflows/release-tauri.yml</files>
  <action>
Edit ONLY `.github/workflows/release-tauri.yml`. Three edits plus comments.

**1. Trigger.** Give the bare `workflow_dispatch:` an input:

      workflow_dispatch:
        inputs:
          dry_run:
            description: 'Build all three legs WITHOUT creating a tag or a GitHub release'
            type: boolean
            default: true

Comment the rationale immediately above it, in this file's existing prose style,
and state these things explicitly:
  - This is a DELIBERATE BEHAVIOUR CHANGE for `workflow_dispatch`. A dispatch
    before this change created a tag and mutated a shared draft release; after
    it, the default dispatch does neither.
  - WHY `default: true` and not `false`: `tagName: v__VERSION__` resolves from
    `tauri.conf.json`'s `version` (`0.7.0`), NOT from any pushed tag's literal
    name, so all four throwaway tags (`v0.7.0-notarize-test1/2/3`,
    `v0.7.0-updater-test1`) landed in ONE shared draft release, id `378785323`,
    which still carries a stale `GameLib_0.7.0_x64.dmg` from 2026-08-28. The
    SAFE mode is therefore the correct default for a manual dispatch; an
    operator who wants a real release opts IN by unticking the box.
  - WHAT a dry run delivers: the BUILD LOG, not a binary. It proves
    `install-deps`, tar, symlinks and packaging work on `windows-latest` and that
    the bundler prints what it produced. Nothing is uploaded — see edit 4 below
    for why that is a decision rather than an omission.
  - `v*` tag pushes are UNAFFECTED — see the `GAMELIB_DRY_RUN` note below for
    the mechanism that guarantees it.

**2. The ONE place the boolean is computed.** Add exactly one key to the existing
job-level `env:` map (keep it alongside the existing entries; do NOT add a
second computation site anywhere):

      GAMELIB_DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run }}

Resolves to the string `'true'` or `'false'`; every other site reads
`env.GAMELIB_DRY_RUN`. Comment, next to it:
  - WHY the `github.event_name` conjunct is explicit rather than relying on
    `inputs.dry_run` being falsy on a push: a push must be structurally incapable
    of entering dry-run, not incidentally safe.
  - WHY the `inputs.` context spelling and NOT `github.event.inputs.dry_run`:
    the latter yields the STRING `'false'` for an unticked box, and a non-empty
    string is TRUTHY in a GitHub expression, so dry-run could never be turned
    off (TRAP 2).
  - **DEFERRED DECISION, recorded not actioned:** all six Apple secrets are now
    enrolled, so a dry run DOES perform a real notarization submission — slow,
    and it consumes submissions. Skipping notarization on dry runs would make
    them cheaper but would stop them exercising a path already proven by run
    `35942560790`. That trade-off is explicitly DEFERRED; this task does not
    change notarization behaviour. Do not file a todo for it.
  - Note that job-level `env:` may read `github`/`inputs` but NOT `env` itself,
    which is why the derivation lives here and the consumers read `env.*`.

**3. tauri-action inputs.** In the `tauri-apps/tauri-action@v1` step's `with:`:

      tagName: ${{ env.GAMELIB_DRY_RUN != 'true' && 'v__VERSION__' || '' }}
      releaseName: ${{ env.GAMELIB_DRY_RUN != 'true' && 'GameLib v__VERSION__' || '' }}
      releaseId: ''

Leave `releaseBody`, `releaseDraft: true`, `prerelease: true`, `args` and
`timeout-minutes: 60` EXACTLY as they are — the two literals `releaseDraft: true`
and `prerelease: true` are the D-09 regression guard and must stay present and
true.

The `!=` polarity is load-bearing, not stylistic. Comment it: GitHub's `&&`/`||`
return VALUES and an empty string is FALSY, so
`DRY == 'true' && '' || 'v__VERSION__'` yields `v__VERSION__` on a dry run —
failing in the dangerous direction by creating the tag and mutating the shared
draft. Inverting the condition puts the non-empty branch on the truthy side,
which is the only form that behaves.

`releaseId: ''` is unconditional and that is intentional: it is absent today, and
an absent Actions input and one set to `''` are both read as `''`, so this is
semantically identical on the tag-push path while making "never touch an existing
release by id" explicit and assertable. Comment that equivalence. Per
tauri-action's own README, omitting `tagName`/`releaseName`/`releaseId` is the
documented way to build without uploading assets.

**4. Add NO steps. Specifically, add NO artifact upload.** Do not add
`actions/upload-artifact`, `actions/cache`, or any other step to this job. Record
in a short comment near the dry-run env computation that a dry run deliberately
uploads nothing, and why:
  - `releaseWorkflow.test.ts` bans `actions/upload-artifact` and `actions/cache`
    ABSOLUTELY, and that ban is a constraint this workflow satisfies rather than
    amends.
  - A path-confined upload was considered and REJECTED: `Import Windows signing
    certificate` writes a PKCS#12 to `cert.pfx` in the workspace, and while that
    step does not fire today (the Windows secrets are not enrolled), relying on
    that would plant a latent defect that ARMS the day the SignPath certificate
    lands. The dry run's value is the log; a real tag push is what yields a
    binary.
This comment is the durable record — it is what stops a future reader from
"helpfully" adding an upload step.

**Leave semantically unchanged** (do not edit, reorder or re-gate): the
`Compute tauri-action build args (Windows signing override merge)` step and all
three of its branches, `Enable Apple signing only when a complete cert secret
set is enrolled`, `Import Windows signing certificate (if present)`,
`Warn if Windows signing will be skipped`,
`Fail fast with a clear message if the updater signing key is absent`, and
`Diagnose a notarization timeout` (which must remain the step immediately after
tauri-action, and the LAST step in the job). This task does not touch signing.

Do NOT edit `src-tauri/tauri.conf.json`, `promote-updater-feed.yml`, or any gate
script. Do NOT push a tag, trigger a workflow run, or run `gh` to mutate
anything — draft release `378785323` must be left exactly as it is.
  </action>
  <verify>
    <automated>
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/release-tauri.yml','utf8')); console.log('YAML OK')"
npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts
npx jest src/backend/__tests__/releaseWorkflow.test.ts src/backend/__tests__/tauriConf.test.ts meta/__tests__/artifactTargets.test.ts 2>&1 | tail -40
pnpm planning-gates 2>&1 | tail -20
    </automated>
  </verify>
  <done>
- `node -e "require('js-yaml')..."` prints `YAML OK` — the workflow still parses
  (a broken `${{ }}` otherwise surfaces only at run time on a real tag push, the
  most expensive place to find it).

  DECLARED SUBSTITUTION, not a dropped check. This task was specified with
  `python -c "import yaml,io; yaml.safe_load(...)"`. **PyYAML is not installed on
  this box on any interpreter** — measured this session: `python -c "import yaml"`
  and `py -c "import yaml"` both raise
  `ModuleNotFoundError: No module named 'yaml'` (Python 3.12 at
  `/c/Users/grays/AppData/Local/Programs/Python/Python312/python`), and `python3`
  is the Microsoft Store stub. Running the specified command would have reported
  an import error, never a verdict on the YAML. `js-yaml@4.1.1` is a direct
  devDependency and is the SAME parser `releaseWorkflow.test.ts` already uses, so
  the node form checks the real thing. `npx prettier --check` over the same file
  is an independent second parser — prettier fails outright on unparseable
  YAML — so two distinct parsers agree before this task is done. (`pnpm
  planning-gates` runs `python3 meta/runPlanningGates.py` and works, because it
  goes through cmd rather than Git Bash; those gates do not import yaml.)
- `npx prettier --check` passes over BOTH written paths. Neither is
  prettier-ignored: `.prettierignore` covers only
  `.github/workflows/build-base.yml` among workflows, so this is a real check.
- `npx jest` over `releaseWorkflow.test.ts`, `tauriConf.test.ts` and
  `artifactTargets.test.ts` is fully GREEN, with real output pasted into the
  SUMMARY (not "tests pass"). Every pre-existing assertion in
  `releaseWorkflow.test.ts` still passes UNMODIFIED, including
  `releaseDraft: true`, `prerelease: true`, BOTH halves of the
  `not.toContain('actions/upload-artifact')` / `not.toContain('actions/cache')`
  ban, the `diagIdx === tauriIdx + 1` ordering and the single-`timeout-minutes`
  census.
- `pnpm planning-gates` is still 12/12.
- `git diff` on `releaseWorkflow.test.ts` is ADDITIONS ONLY — no hunk touches
  lines 272-276. `git diff .github/workflows/release-tauri.yml` adds no step
  (`git diff | grep -c '^+.*uses:'` is 0).
- The SUMMARY records the DEFERRED notarization trade-off, surfaced for the
  operator — a dry run WILL notarize, and no todo was filed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator -> `workflow_dispatch` form | a human-chosen boolean decides whether a tag and a release are created |
| runner workspace -> GitHub artifact store | **no crossing exists, by design** — no `upload-artifact` or `cache` step, so nothing in the workspace (including the PKCS#12 `cert.pfx`) can leave the ephemeral runner |
| repo -> GitHub Releases API | `tauri-action` can create a tag and create or MUTATE an existing release |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rbx-01 | Information disclosure | workspace -> artifact store | mitigate | NO `actions/upload-artifact` step is added; `releaseWorkflow.test.ts:272-276`'s absolute ban stays byte-identical, and Task 1 (e) adds a parsed-steps assertion alongside it. A path-confined upload was considered and rejected: it would arm the day the SignPath cert lands, since `Import Windows signing certificate` writes a PKCS#12 to the workspace |
| T-rbx-02 | Tampering | `tauri-action` `tagName`/`releaseId` | mitigate | dry run passes empty `tagName`/`releaseName`/`releaseId`, so the shared draft `378785323` cannot be mutated; Task 1 (d) asserts the RESOLVED empty values, and Task 1 (a)'s positive control proves the evaluator would catch TRAP 1's naive form |
| T-rbx-03 | Tampering | the dry-run conditional itself | mitigate | computed in ONE job-level `env:` value gated on `github.event_name`; Task 1 (c) includes the failing-direction check that `event_name: push` + `inputs.dry_run: true` still resolves falsy |
| T-rbx-04 | Denial of service | Apple notarization on every dry run | accept | all six Apple secrets are enrolled, so a dry run submits a real notarization and consumes a submission. Explicitly DEFERRED, recorded in a workflow comment and surfaced in the SUMMARY; skipping it would stop dry runs exercising a path proven by run `35942560790`. No todo filed, per this task's scope |
| T-rbx-05 | Repudiation | D-09 human-review gate | mitigate | `releaseDraft: true` and `prerelease: true` are left untouched and literally present; Task 1 (d) additionally asserts both at the resolved level on the tag-push path |
| T-rbx-SC | Tampering | package installs | mitigate | none required — this task installs nothing and adds no action reference. `js-yaml@4.1.1` is an existing direct devDependency; no npm/pip/cargo install task exists, so the Package Legitimacy Gate does not apply |
</threat_model>

<verification>
Phase-level checks, all already folded into Task 2's `<verify>`:

1. `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/release-tauri.yml','utf8'))"` — the workflow still parses. Substituted for the specified PyYAML command, which cannot run here: PyYAML is absent on every interpreter on this box (see Task 2's `<done>` for the measurement). Prettier is the independent second parser.
2. `npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts` — explicit paths only, never a bare `.`; neither path is prettier-ignored.
3. `npx jest src/backend/__tests__/releaseWorkflow.test.ts src/backend/__tests__/tauriConf.test.ts meta/__tests__/artifactTargets.test.ts` — green, real output in the SUMMARY.
4. `pnpm planning-gates` — 12/12.
5. `git diff --stat` shows EXACTLY two files changed; `git diff src/backend/__tests__/releaseWorkflow.test.ts` contains no hunk over lines 272-276; `git diff .github/workflows/release-tauri.yml | grep -c '^+.*uses:'` is 0 (no step added).

NOT verified here, and stated plainly in this file's own spirit: no dry run has
ever executed. Every behavioural claim about the dispatch path is an INTENDED
invariant proven only by static/parsed gates, not by a runner. The scope fence
forbids triggering a run, so the live discharge belongs to a separate operator
action.
</verification>

<success_criteria>
- A `workflow_dispatch` with the default input resolves `tagName` and
  `releaseName` to `''` and `releaseId` to `''` — no tag, no release created or
  touched.
- A `v*` tag push resolves `tagName` to `v__VERSION__` with `releaseDraft: true`
  and `prerelease: true` — identical behaviour to before this change.
- `github.event_name: push` + `inputs.dry_run: true` resolves the dry-run
  boolean FALSY (asserted, not assumed).
- Exactly one computation site for the boolean (`jobs.release.env.GAMELIB_DRY_RUN`).
- The evaluator positive control passes: the naive
  `DRY == 'true' && '' || 'v__VERSION__'` form evaluates to `v__VERSION__`,
  proving the resolved-value assertions are not self-confirming.
- `releaseWorkflow.test.ts:272-276` is byte-identical to its pre-task state, and
  the workflow contains no `actions/upload-artifact` and no `actions/cache`. The
  reason is recorded in a workflow comment so it is not re-litigated by accident.
- Notarization behaviour is unchanged; the trade-off is recorded in a workflow
  comment and surfaced in the SUMMARY, with no todo filed.
- Only `.github/workflows/release-tauri.yml` and
  `src/backend/__tests__/releaseWorkflow.test.ts` are modified.
</success_criteria>

<output>
Create `.planning/quick/260924-rbx-add-a-dry-run-conditional-to-release-tau/260924-rbx-SUMMARY.md` when done.
</output>
