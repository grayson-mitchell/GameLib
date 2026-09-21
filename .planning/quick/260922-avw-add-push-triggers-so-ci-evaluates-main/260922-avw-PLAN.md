---
phase: quick-260922-avw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/test.yml
  - .github/workflows/lint.yml
  - .github/workflows/codecheck.yml
  - meta/__tests__/ciTriggerWiring.test.ts
  - CLAUDE.md
  - .planning/ROADMAP.md
  - .planning/todos/pending/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md
  - .planning/todos/completed/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md
autonomous: true
requirements:
  - TODO-2026-09-21-nothing-triggers-ci-on-a-push-to-main
must_haves:
  truths:
    - "All three quality workflows declare a `push:` trigger on `main` (and `stable`) filtered by `paths-ignore`, so a code push to `main` schedules CI instead of nothing scheduling it"
    - "The pre-existing `pull_request:` and `workflow_dispatch:` triggers survive unchanged and UNFILTERED on all three — the new pin fails if a future edit satisfies `push:` by replacing them"
    - "Each workflow declares top-level `concurrency` with `cancel-in-progress: true`, a sibling of `on:`/`permissions:`, not nested inside either"
    - "Each workflow's existing `permissions:` block and `jobs:` body are byte-identical to `f12a8bfc4`"
    - "A jest test parses all three workflows with `js-yaml` and goes RED if any of those structural properties is removed, including a near-miss that carries only `pull_request`"
    - "`CLAUDE.md`'s `smoke:sidecar` citation and `.planning/ROADMAP.md`'s `pnpm prettier` citation resolve to the intended `run:` line AFTER the +9-line insertion, verified by reading the cited line back out of the workflow"
    - "The source todo's 'Open question' section records the measured `pnpm test:ci` result instead of an open question, and the file lives in `.planning/todos/completed/` with that edit present in the COMMITTED tree"
    - "The green baseline is preserved: `pnpm test:ci` exit 0, `pnpm lint` at both ceilings, `pnpm prettier` clean, `pnpm find-deadcode` exit 0, `pnpm planning-gates` 12/12"
  artifacts:
    - path: ".github/workflows/test.yml"
      provides: "push+pull_request+workflow_dispatch triggers, concurrency group"
      contains: "paths-ignore"
    - path: ".github/workflows/lint.yml"
      provides: "same trigger block"
      contains: "cancel-in-progress: true"
    - path: ".github/workflows/codecheck.yml"
      provides: "same trigger block"
      contains: "cancel-in-progress: true"
    - path: "meta/__tests__/ciTriggerWiring.test.ts"
      provides: "js-yaml structural pin over all three trigger blocks plus an anti-vacuity arm"
      min_lines: 60
    - path: ".planning/todos/completed/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md"
      provides: "closed record with the open question answered"
  key_links:
    - from: "meta/__tests__/ciTriggerWiring.test.ts"
      to: ".github/workflows/{test,lint,codecheck}.yml"
      via: "readFileSync + js-yaml load of each of the three paths"
      pattern: "load\\("
    - from: "CLAUDE.md"
      to: ".github/workflows/test.yml `run: pnpm smoke:sidecar`"
      via: "line-number citation"
      pattern: "workflows/test\\.yml:[0-9]+"
    - from: ".planning/ROADMAP.md"
      to: ".github/workflows/lint.yml `run: pnpm prettier`"
      via: "line-number citation"
      pattern: "workflows/lint\\.yml:[0-9]+"
---

<objective>
Nothing in `.github/workflows/` fires on a push to `main`. This repo works direct-to-main at
volume, so `main` went **226 commits** since the last `pull_request`-triggered run (`fa2ad5030`,
2026-09-15) with no automatic evaluation — the 2026-09-21 run existed only because someone
dispatched it by hand. `pnpm test:ci` and `pnpm smoke:sidecar` run **nowhere** automatically:
`.husky/pre-push` runs five gates and zero jest, and `.husky/pre-commit` is entirely commented out.

That matters most for `smoke:sidecar`, which `CLAUDE.md` records as the *only* gate for the
sidecar exit contract — a contract that broke three times in three weeks — and which "runs warm
locally and only ever sees the cold path in CI".

Purpose: make a push to `main` schedule the three quality workflows, and pin that wiring so it
cannot be quietly removed the way its absence went unnoticed for 226 commits.
Output: three edited workflows, one new pin test, two corrected line-number citations, one closed
todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md
@meta/__tests__/planningGatesWiring.test.ts
@.github/workflows/test.yml
@.github/workflows/lint.yml
@.github/workflows/codecheck.yml

**Baseline HEAD:** `f12a8bfc4`. Every number below was measured by the planner at that sha — do
not re-derive them, but DO re-read any line you are about to edit.

### The honest verification ceiling — state this in the SUMMARY, do not dress it up

**You cannot verify that a `push:` trigger actually fires.** That requires pushing to `main` and
observing GitHub; nothing local proves it. `actionlint` is **NOT installed** — do not plan or run a
step that calls it. The gates in this plan are: the YAML parses, the parsed structure is what was
intended, the pin test is green, and the pre-existing gates stay green. Live confirmation is a
residual belonging to the operator's next push to `main`. Do NOT write a `<done>` or a success
criterion claiming the trigger is proven to fire.

### Measured baseline to preserve

| gate | measured at `f12a8bfc4` |
|------|-------------------------|
| `pnpm test:ci` | exit 0 — 440 suites, 9025 passed, 2 skipped, zero failures |
| `pnpm lint` | production 1119 / ceiling 1124; **tests 638 / ceiling 638 — ZERO headroom** |
| `pnpm prettier` | clean |
| `pnpm find-deadcode` | exit 0 |
| `pnpm planning-gates` | 12/12 |
| `.husky/pre-push` (five gates) | exit 0 |

### Measured traps — these will bite if you skip them

1. **`import yaml from 'js-yaml'` makes `pnpm lint` RED.** Measured: a default import used as
   `yaml.load(...)` in a `meta/__tests__/*.ts` file emits exactly **1** eslint warning
   (`import-x/no-named-as-default-member`). The `tests` scope in `meta/lintScoped.cjs` has
   `TESTS_CEILING = 638` and sits at **638 — zero headroom**, so one warning fails the gate.
   Use `import { load } from 'js-yaml'`; measured **0 problems**.
2. **`js-yaml` v4 keeps the key as the string `'on'`**, not YAML-1.1 boolean `true` — measured,
   `Object.keys(doc)` contains `'on'`. Index it as `doc['on']`.
3. **`workflow_dispatch:` parses to `null`.** Measured. Asserting truthiness (`expect(on.workflow_dispatch).toBeDefined()`
   passes, but `toBeTruthy()` FAILS). Assert key presence — `Object.keys(on)` / the `in` operator.
4. **`js-yaml` is a devDependency (`^4.1.1`) and ships NO types**; `@types/js-yaml` is absent. This
   does not break `pnpm codecheck`: `tsconfig.json` has `"include": ["src"]`, so `meta/` is not
   typechecked, and `pnpm find-deadcode` runs ts-prune against that same tsconfig so it does not
   see the new file either. Measured: `npx jest` runs the file fine.
5. **The new test file IS inside the lint `tests` scope** (`**/__tests__/**/*.ts`). Lint it
   directly and require **0 problems** before running the whole gate.
6. **`git checkout --` fires this repo's `post-checkout` hook.** For the RED proof in Task 2,
   restore the mutated workflow by `cp` from a scratchpad copy, not by `git checkout`.
7. **`git mv` commits HEAD content and drops unstaged edits — recorded three times in this repo.**
   Task 3 both edits and moves the todo, so the staged-content check there is mandatory.

### The two citations that move (+9 lines inserted above each)

| document | current text | cites | predicted new line |
|----------|--------------|-------|--------------------|
| `CLAUDE.md:257` | ``(`.github/workflows/test.yml:32`) is the only gate`` | `run: pnpm smoke:sidecar` | **41** |
| `.planning/ROADMAP.md:1986` | ``` `.github/workflows/lint.yml:19` runs `pnpm prettier` ``` | `run: pnpm prettier` | **28** |

The insertion is net **+9 lines** in each workflow (measured against a probe copy). **Treat 41 and
28 as predictions, not answers** — recompute them with grep after editing and read the line back
out of the workflow, per Task 3. Do not compute the offset arithmetically and trust it.

### Citation scope boundary — do NOT sweep all 32

Measured census: `test.yml:32` appears in **6** files, `lint.yml:19` in **14**, and there are **32**
`workflows/(test|lint|codecheck).yml:N` citations repo-wide. **Only the two rows above get
updated.** Every other hit is a frozen historical record — completed todos, `*-SUMMARY.md`,
`*-REVIEW*.md`, past phase `PLAN.md` files — and each records what was true when it was written.
Rewriting them would falsify the record. This includes the source todo's own line 43, which quotes
`CLAUDE.md` verbatim as it read on the day of filing: leave that quote alone.

### Deliberately out of scope — decided, not forgotten

- **Adding `pnpm test:ci` to `.husky/pre-push`: REJECTED on the record.** `CLAUDE.md` states
  `smoke:sidecar` "runs warm locally and only ever sees the cold path in CI", so a local pre-push
  run is the warm path — the one that cannot see the defect the gate exists for. Local execution is
  the weaker half here, not a substitute.
- **A `schedule:` nightly backstop: deliberately deferred.** The source todo raises it as a
  *consider*, not a decision. Not forgotten; not in this plan.
- **Every other workflow.** Seven others exist; only these three are quality gates.
- **`cancel-in-progress: true` is an accepted trade**, already argued in the source todo: rapid
  successive pushes cancel earlier runs, so an intermediate commit's failure can be missed while
  the tip is still evaluated. For rot detection that is the right choice.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add the push trigger and concurrency block to the three quality workflows</name>
  <files>.github/workflows/test.yml, .github/workflows/lint.yml, .github/workflows/codecheck.yml</files>
  <action>
In each of the three files, replace the existing four-line `on:` block

```
on:
  pull_request:
    branches: [main, stable]
  workflow_dispatch:
```

with this block, **verbatim** — it is the spec, and it was measured prettier-clean as written:

```yaml
on:
  push:
    branches: [main, stable]
    paths-ignore:
      - '.planning/**'
      - '**.md'
  pull_request:
    branches: [main, stable]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Constraints:
- The existing `pull_request` and `workflow_dispatch` triggers stay **unchanged and UNFILTERED** —
  no `paths-ignore` under `pull_request`. A PR always runs in full.
- `concurrency` is **top-level**, a sibling of `on:` and `permissions:`. Not nested inside either.
- Preserve each file's existing `permissions:` block exactly as it is, and change nothing under
  `jobs:` — including the long explanatory comments in `test.yml` and `codecheck.yml`.
- All three files currently carry the identical `on:` block and identical
  `permissions:\n  contents: read`, so the same edit applies three times.

Why `paths-ignore` and not an unfiltered `push`: measured, **433 of 579** commits in the last 14
days touch no `src/`, `meta/` or `src-tauri/` path — they are `.planning/` and docs commits. The
filter removes three quarters of the would-be runs. The repo is PUBLIC, so Actions minutes are free
and there is no billing trade-off to weigh.

This does not double-run PRs: a PR from a topic branch pushes to *that* branch, which is not in
`push.branches`, so only the `pull_request` event fires.
  </action>
  <verify>
    <automated>node -e "const {load}=require('js-yaml');const fs=require('fs');let bad=0;for(const f of ['test','lint','codecheck']){const p='.github/workflows/'+f+'.yml';const d=load(fs.readFileSync(p,'utf8'));const on=d['on']||{};const k=Object.keys(d);const ok=k.includes('on')&&k.includes('concurrency')&&k.includes('permissions')&&k.includes('jobs')&&JSON.stringify(on.push&&on.push.branches)==='[\"main\",\"stable\"]'&&Array.isArray(on.push['paths-ignore'])&&on.push['paths-ignore'].length===2&&!('paths-ignore' in (on.pull_request||{}))&&JSON.stringify(on.pull_request&&on.pull_request.branches)==='[\"main\",\"stable\"]'&&Object.keys(on).includes('workflow_dispatch')&&d.concurrency['cancel-in-progress']===true&&d.permissions.contents==='read';console.log(f,ok?'OK':'FAIL',JSON.stringify(Object.keys(on)));if(!ok)bad++;}process.exit(bad?1:0)"</automated>
    <automated>npx prettier --check .github/workflows/test.yml .github/workflows/lint.yml .github/workflows/codecheck.yml</automated>
    <automated>node -e "const {execSync}=require('child_process');const n=execSync('git diff --numstat .github/workflows/').toString().trim().split(String.fromCharCode(10));if(n.length!==3){console.error('expected 3 changed workflows, got '+n.length);process.exit(1)}for(const l of n){const parts=l.split(String.fromCharCode(9));if(parts[0]!=='9'||parts[1]!=='0'){console.error('expected +9/-0, got '+l);process.exit(1)}}const removed=execSync('git diff -U0 .github/workflows/').toString().split(String.fromCharCode(10)).filter(x=>/^-[^-]/.test(x));const allowed=new Set(['-on:','-  pull_request:','-    branches: [main, stable]','-  workflow_dispatch:']);const bad=removed.filter(x=>!allowed.has(x));if(bad.length){console.error('unexpected removals: '+JSON.stringify(bad));process.exit(1)}console.log('OK: 3 files +9/-0, '+removed.length+' removed lines, all from the old on: block')"</automated>
  </verify>
  <done>All three workflows parse; each yields exactly the keys `on`/`concurrency`/`permissions`/`jobs` with `push.branches == [main, stable]`, a two-entry `push.paths-ignore`, an UNFILTERED `pull_request` on the same branches, a `workflow_dispatch` key, `concurrency['cancel-in-progress'] === true`, and `permissions.contents == 'read'`. Prettier is clean. The diff is +9/-0 in each file and the only removed lines are the four lines of the old `on:` block — nothing under `jobs:` or `permissions:` moved.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin the three trigger blocks with a js-yaml structural test</name>
  <files>meta/__tests__/ciTriggerWiring.test.ts</files>
  <behavior>
Modelled on `meta/__tests__/planningGatesWiring.test.ts`, whose header states the philosophy to
carry across: the runner was only half the fix, and the other half is that its CI wiring "cannot be
quietly removed or renamed without a test going red". A trigger gap that went unnoticed for 226
commits is exactly that failure mode, so the new triggers get pinned the same way. Copy that file's
honesty too: say in the header that there is no way to execute a GitHub Actions workflow from jest,
so this pins the wiring rather than dressing itself up as a behavioural test.

Parametrise over all three workflows (`test.yml`, `lint.yml`, `codecheck.yml`) — e.g.
`describe.each` — and assert, for each:

- Test 1: `push` exists under the parsed `on` block and its `branches` includes `main`.
- Test 2: `push['paths-ignore']` is present and is a non-empty array. (Presence, per the locked
  design — not a pin on the exact two globs, which are tuning.)
- Test 3: top-level `concurrency` exists with `cancel-in-progress === true`.
- Test 4: **the old triggers survive** — `Object.keys(on)` contains both `pull_request` and
  `workflow_dispatch`, so a future edit cannot satisfy this pin by REPLACING the old triggers
  instead of adding to them. Assert key presence, never truthiness: measured,
  `workflow_dispatch:` parses to `null`.
- Test 5: self-test that the file really was read and is the right one — a path typo must not make
  the assertions vacuous against an empty string. Assert the parsed `name` and a nonzero length,
  the way the model file asserts `name: Code check`.
- Test 6: **anti-vacuity / near-miss arm.** Factor the structural checks into a small predicate
  over a parsed object and prove the predicate REJECTS an inline object carrying only
  `{ pull_request: { branches: ['main'] } }`, and rejects `{}`. This is the arm that proves a path
  typo or an empty parse cannot pass.

Structural assertions go through `js-yaml`, **not** a regex over the raw text — a regex would pass
on a `push:` key that is commented out or nested in the wrong place. Use raw-text assertions only
where structure cannot express the property.

Import as `import { load } from 'js-yaml'` — measured, the default-import form costs exactly one
eslint warning and the tests ceiling has zero headroom.
  </behavior>
  <action>
Write `meta/__tests__/ciTriggerWiring.test.ts` implementing the behaviours above. Resolve paths the
way the model file does (`join(__dirname, '..', '..', '.github', 'workflows', …)`).

Prove it goes RED against the pre-Task-1 state rather than asserting it would. Recipe, avoiding the
`post-checkout` hook that `git checkout --` fires:

1. `cp .github/workflows/test.yml "$SCRATCH/test.yml.bak"`
2. Remove the `push:` stanza from `.github/workflows/test.yml` in place.
3. Run the suite — it must FAIL, and the failure must name the `test.yml` push assertion.
4. `cp "$SCRATCH/test.yml.bak" .github/workflows/test.yml` and re-run — green.
5. Confirm `git diff --numstat .github/workflows/test.yml` is back to `9 0`.

Record the RED output in the SUMMARY. Do not commit the mutated workflow.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/ciTriggerWiring.test.ts 2>&1 | tail -20</automated>
    <automated>node -e "const {execSync}=require('child_process');const out=execSync('npx eslint --no-cache --format json meta/__tests__/ciTriggerWiring.test.ts').toString();const n=JSON.parse(out).reduce((a,x)=>a+x.messages.length,0);console.log('eslint messages on the new test file: '+n+' (must be 0 -- the tests ceiling has zero headroom)');process.exit(n===0?0:1)"</automated>
    <automated>node -e "const {load}=require('js-yaml');const s=require('fs').readFileSync('meta/__tests__/ciTriggerWiring.test.ts','utf8');if(!/from 'js-yaml'/.test(s)||/import yaml from 'js-yaml'/.test(s)){console.error('must use the named { load } import');process.exit(1)};for(const f of ['test.yml','lint.yml','codecheck.yml'])if(!s.includes(f)){console.error('workflow not referenced: '+f);process.exit(1)};if(!/pull_request/.test(s)||!/workflow_dispatch/.test(s)){console.error('old-trigger survival arm missing');process.exit(1)};console.log('OK: named import, all three workflows, survival arm present')"</automated>
  </verify>
  <done>`meta/__tests__/ciTriggerWiring.test.ts` passes; it parses all three workflows with the named `js-yaml` `load` import; it asserts push-on-`main`, `paths-ignore` presence, `concurrency.cancel-in-progress === true`, and survival of both `pull_request` and `workflow_dispatch`; it carries a self-test arm and a near-miss arm proving the predicate rejects a `pull_request`-only object and `{}`. `npx eslint` reports **0 problems** on the file. The RED proof was executed against a `push:`-less `test.yml` and its output is recorded in the SUMMARY; the workflow is restored to `9 0`.</done>
</task>

<task type="auto">
  <name>Task 3: Recompute the two moved citations and close the source todo</name>
  <files>CLAUDE.md, .planning/ROADMAP.md, .planning/todos/pending/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md, .planning/todos/completed/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md</files>
  <action>
**3a — recompute, do not calculate.** Task 1 inserted lines ABOVE both cited lines, so both
citations are now stale. Get the true numbers from the files:

- `grep -n 'run: pnpm smoke:sidecar' .github/workflows/test.yml`
- `grep -n 'run: pnpm prettier' .github/workflows/lint.yml`

Predicted **41** and **28** respectively. If grep disagrees with the prediction, grep wins.

**3b — update exactly two citations.** In `CLAUDE.md` (the sidecar-exit-contract section, at
baseline line 257), change `` `.github/workflows/test.yml:32` `` to the recomputed number. In
`.planning/ROADMAP.md` (baseline line 1986), change `` `.github/workflows/lint.yml:19` `` to the
recomputed number. Nothing else. The 30 other workflow line citations repo-wide are frozen
historical records — see the citation scope boundary in `<context>`.

Note `CLAUDE.md`'s own preamble: the `GSD:*` regions are hand-maintained and no tool rewrites them,
so editing the region directly is correct here.

**3c — read the line back.** For each updated citation, `sed -n '<N>p'` the workflow at the new
number and confirm it is the intended `run:` line. Do not trust arithmetic.

**3d — answer the open question before closing.** The todo's final section, "Open question, not
answered here", says whether `pnpm test:ci` is green at HEAD was unmeasured. It has since been
measured. Replace that section with the result: **`pnpm test:ci` exit 0 — 440 suites, 9025 passed,
2 skipped, zero failures** (measured at `f12a8bfc4`). Re-title the section so it does not read as
open (e.g. "Open question, since answered"). A closed record must not be left carrying an
unanswered question that is in fact answered. Leave the rest of the body — including its verbatim
`test.yml:32` quote of `CLAUDE.md` at filing time — untouched.

**3e — move it, and verify the STAGED bytes.** `git mv` commits HEAD content and drops unstaged
edits; that has happened three times in this repo, and this file is being edited as part of being
closed. So:

1. `git add <pending path>` — stage the 3d edit first.
2. `git mv <pending path> .planning/todos/completed/<same filename>`
3. **Before committing**, prove the edit is in the index:
   `git show :.planning/todos/completed/<filename> | grep -c '9025 passed'` must print `1` or more,
   and `git show :... | grep -c 'Open question, not answered here'` must print `0`.
4. If either check disagrees, re-apply the 3d edit at the new path and `git add` it again. Never
   commit on the strength of the working tree alone.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const g=(p,re)=>{const l=fs.readFileSync(p,'utf8').split('\n');const i=l.findIndex(x=>re.test(x));return{n:i+1,t:l[i]}};const sm=g('.github/workflows/test.yml',/run: pnpm smoke:sidecar/);const pr=g('.github/workflows/lint.yml',/run: pnpm prettier/);const c=fs.readFileSync('CLAUDE.md','utf8');const r=fs.readFileSync('.planning/ROADMAP.md','utf8');let bad=0;if(!c.includes('workflows/test.yml:'+sm.n)){console.error('CLAUDE.md does not cite test.yml:'+sm.n);bad++}if(/workflows\/test\.yml:32/.test(c)){console.error('CLAUDE.md still cites the stale 32');bad++}if(!r.includes('workflows/lint.yml:'+pr.n)){console.error('ROADMAP.md does not cite lint.yml:'+pr.n);bad++}if(/workflows\/lint\.yml:19/.test(r)){console.error('ROADMAP.md still cites the stale 19');bad++}console.log('read-back  test.yml:'+sm.n+' => '+sm.t.trim());console.log('read-back  lint.yml:'+pr.n+' => '+pr.t.trim());process.exit(bad?1:0)"</automated>
    <automated>T=.planning/todos/completed/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md; test -f "$T" && test ! -e "${T/completed/pending}" && test "$(git show :$T | grep -c '9025 passed')" -ge 1 && test "$(git show :$T | grep -c 'Open question, not answered here')" -eq 0 && echo 'STAGED CONTENT CARRIES THE EDIT'</automated>
    <automated>pnpm planning-gates 2>&1 | tail -3</automated>
    <automated>npx prettier --check CLAUDE.md .planning/ROADMAP.md .planning/todos/completed/2026-09-21-nothing-triggers-ci-on-a-push-to-main-so-main-goes-unevaluated-for-hundreds-of-commits.md</automated>
  </verify>
  <done>`grep -n` reports the true line for each `run:` target; both citations name that number; neither stale number (`test.yml:32`, `lint.yml:19`) survives in `CLAUDE.md` or `.planning/ROADMAP.md`; each cited line was read back and is the intended `run:` line. The todo's open-question section states the measured `pnpm test:ci` result, the file exists only under `completed/`, and `git show :<path>` proves the edit is in the INDEX before any commit. `pnpm planning-gates` is 12/12 and prettier is clean on all three touched documents.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| pushed ref → GitHub Actions scheduler | a workflow trigger definition decides what code runs with what token |
| workflow file → `GITHUB_TOKEN` scope | trigger type plus `permissions:` decides the privilege a run gets |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-avw-01 | Elevation of privilege | new `push:` trigger on `.github/workflows/*.yml` | mitigate | Trigger stays `push`/`pull_request`, never `pull_request_target`; Task 1 asserts `permissions.contents == 'read'` is byte-preserved in all three files, so a run gains no write scope. |
| T-avw-02 | Tampering | the three workflow files | mitigate | Task 2's `js-yaml` pin goes RED if `push`, `paths-ignore`, `concurrency`, `pull_request` or `workflow_dispatch` is removed or renamed — the pin exists precisely because this wiring's absence went unnoticed for 226 commits. |
| T-avw-03 | Repudiation (lost measurement) | `cancel-in-progress: true` | accept | Rapid successive pushes cancel earlier runs, so an intermediate commit's failure can be missed while the tip is still evaluated. Argued in the source todo: for rot detection this is the right trade. Reversible by dropping the key if per-commit bisectability ever matters more. |
| T-avw-04 | Information disclosure | Actions logs on a PUBLIC repo | accept | Job bodies are unchanged; the same steps already run on every PR with the same log visibility. This plan changes only when they are scheduled. |
| T-avw-SC | Tampering | npm/pip/cargo installs | n/a | **No package installs.** `js-yaml@^4.1.1` is already a devDependency and already resolved in `node_modules`; `@types/js-yaml` is deliberately NOT added (`meta/` is outside `tsconfig.json`'s `include`, so nothing typechecks the new test). No legitimacy gate is required. |
</threat_model>

<verification>
Run after all three tasks, in this order:

1. `npx jest meta/__tests__/ciTriggerWiring.test.ts` — green.
2. `pnpm lint` — production **≤ 1124** (baseline 1119) and tests **≤ 638** (baseline 638, **zero
   headroom** — a single new warning fails).
3. `pnpm prettier` — clean repo-wide.
4. `pnpm codecheck` — exit 0.
5. `pnpm find-deadcode` — exit 0.
6. `pnpm planning-gates` — 12/12.
7. `pnpm test:ci` — exit 0, **≥ 440 suites and ≥ 9026 passed** (baseline 9025 plus this plan's new
   tests; the count must go UP, not sideways). This is the gate the whole task exists to schedule,
   and `pre-push` does not run it — run it here by hand.
8. `git status --porcelain` — no stray scratchpad or `.bak` file, and no mutated workflow left over
   from Task 2's RED proof.

**Not verifiable here, and do not claim otherwise:** that a push to `main` actually schedules these
workflows. `actionlint` is not installed and nothing local exercises the GitHub scheduler. The live
confirmation is the operator's next push to `main`; record it in the SUMMARY as an outstanding
residual, with the Actions tab as where to look.
</verification>

<success_criteria>
- All three quality workflows carry the locked trigger block verbatim: `push` on `[main, stable]`
  with the two `paths-ignore` globs, an unchanged and unfiltered `pull_request` on the same
  branches, `workflow_dispatch`, and top-level `concurrency` with `cancel-in-progress: true`.
- `permissions:` and everything under `jobs:` in all three files are unchanged from `f12a8bfc4`;
  the diff is +9/-0 per file.
- `meta/__tests__/ciTriggerWiring.test.ts` is green, lints at **0 problems**, parses with `js-yaml`
  rather than regexing YAML structure, carries a self-test and a near-miss arm, and was
  demonstrated RED against a `push:`-less workflow.
- Both moved citations name a line number obtained by grep and confirmed by reading that line back;
  no stale `test.yml:32` or `lint.yml:19` remains in `CLAUDE.md` or `.planning/ROADMAP.md`; the
  other 30 historical citations are untouched.
- The source todo is in `.planning/todos/completed/`, its open question replaced with the measured
  `pnpm test:ci` result, and the edit was proven present in the git INDEX via `git show :<path>`
  before the commit.
- The full baseline (items 2-7 of `<verification>`) is green, with `pnpm test:ci`'s passed count
  strictly greater than 9025.
- The SUMMARY states plainly that firing was not verified locally and names the operator's next
  push to `main` as the live residual.

**Planner concern (one line, plan the locked version anyway):** the two line-number citations remain
ungated after this — nothing greps them, so they will rot again on the next edit above them; a
follow-up could have the pin test assert that `CLAUDE.md`'s cited line resolves to the
`smoke:sidecar` `run:` line, but the locked design scopes the pin to the trigger structure and says
not to widen it.
</success_criteria>

<output>
Create `.planning/quick/260922-avw-add-push-triggers-so-ci-evaluates-main/260922-avw-SUMMARY.md` when done
</output>
