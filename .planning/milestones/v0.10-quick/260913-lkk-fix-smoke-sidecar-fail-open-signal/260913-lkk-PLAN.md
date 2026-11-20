---
phase: quick-260913-lkk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/sidecarStartupSmoke.cjs
  - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
  - src/sidecar/installRejectionGuard.ts
  - .planning/todos/pending/2026-09-13-smoke-sidecar-cannot-detect-a-module-evaluation-crash-the-uncaughtexception-guard-makes-the-exit-code-always-zero.md
autonomous: true
requirements: [TODO-260913-901-FOLLOWUP]

must_haves:
  truths:
    - "`pnpm smoke:sidecar` exits NON-ZERO when a module-scope throw is inserted into bootstrap.ts, even though the child process still exits 0."
    - "`pnpm smoke:sidecar` exits 0 on the restored, healthy tree."
    - "A jest suite that runs in CI turns RED if the sentinel literal hardcoded in the `.cjs` gate stops matching `READY_SENTINEL` from `common/types/sidecarTransport`."
    - "The stderr-assertion arm (todo item 2) has a MEASURED verdict recorded in the summary — implemented or not, with the measurement quoted."
    - "Every shipped claim that `pnpm smoke:sidecar` catches a dead-on-boot sidecar is either true again or corrected, and the census that decided this is recorded."
  artifacts:
    - path: "meta/sidecarStartupSmoke.cjs"
      provides: "READY-sentinel stdout assertion the uncaughtException guard cannot forge"
      contains: "__GAMELIB_SIDECAR_READY__"
    - path: "src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts"
      provides: "Drift gate binding the .cjs literal to the TypeScript READY_SENTINEL export"
      contains: "sidecarStartupSmoke.cjs"
  key_links:
    - from: "meta/sidecarStartupSmoke.cjs"
      to: "run.stdout"
      via: "assertion that the captured child stdout contains the sentinel"
      pattern: "run\\.stdout"
    - from: "src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts"
      to: "common/types/sidecarTransport"
      via: "READY_SENTINEL import compared against the gate file's raw text"
      pattern: "READY_SENTINEL"
---

<objective>
`pnpm smoke:sidecar` is the ONLY check that runs the real bundled sidecar, and it is currently
blind to the exact regression class it was built for: `installUncaughtExceptionGuard()` catches a
module-evaluation throw, logs it, and lets the process exit 0 on stdin EOF. The gate's only
success signal is that exit code, so a completely dead sidecar prints PASS.

Purpose: give the gate a signal the guard cannot forge (the `READY_SENTINEL` line in the child's
stdout — already captured in `run.stdout`, never inspected), prove it RED under the recorded
negative control and GREEN when restored, then correct the claims elsewhere in the tree that
currently promise a check the gate could not deliver.

Output: an armed gate, a drift gate binding its hardcoded literal to the TypeScript export, a
measured verdict on the optional stderr arm, a corrected stale-claim census, and the todo closed
or left in `pending/` with an honest `## What remains`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-13-smoke-sidecar-cannot-detect-a-module-evaluation-crash-the-uncaughtexception-guard-makes-the-exit-code-always-zero.md
@meta/sidecarStartupSmoke.cjs
@src/backend/__tests__/fakeHomeIsolation.test.ts
@src/sidecar/installRejectionGuard.ts

<interfaces>
<!-- Extracted from the tree at HEAD 61b6e77bc. Use these directly; do not go hunting. -->

`src/common/types/sidecarTransport.ts:97`
  export const READY_SENTINEL = '__GAMELIB_SIDECAR_READY__' as const

`src/backend/sidecar/bootstrap.ts`
  line 40    import { READY_SENTINEL } from 'common/types/sidecarTransport'
  line 171   `} from './processGuards'`  <- LAST line of the module's import block
  line 1256  output.write(`${READY_SENTINEL}\n`)   <- one statement follows it in init()

`meta/sidecarStartupSmoke.cjs` (111 lines, CommonJS, cannot require the TS export)
  line 26      header claim: "Exit 0 = the sidecar reached its RPC loop..."
  lines 28-60  the fake-HOME exemption header. Anchors asserted by another gate — see below.
  line 68      const STARTUP_TIMEOUT_MS = 30_000
  lines 86-88  inline claim: "one that dies during module evaluation exits non-zero"
  lines 89-93  const run = spawnSync(process.execPath, [BUNDLE], { cwd, encoding, timeout })
  lines 95-100 ETIMEDOUT arm  (SOUND — do not touch)
  lines 101-108 run.status !== 0 arm  (still sound for a real non-zero exit — keep)

`src/backend/__tests__/fakeHomeIsolation.test.ts:101-104` — the two anchor phrases it re-reads
out of the smoke gate's header. Both must survive verbatim, on ONE line each:
  'DELIBERATELY EXEMPT from the fake-HOME two-profile rule'
  'reachable only behind `GOGUser.isLoggedIn()`'

`src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts`
  line 75    import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'
  line 1385  describe('Group 3: entry-ordering gate (by-construction, source text ...)')
  line 1457  a comment asserting the source gate "and `pnpm smoke:sidecar` are the two checks that can"
  Group 3 already reads files outside its jest root as RAW TEXT — this is the established idiom
  and the right home for the new drift assertion. It runs in the `src/backend` jest project,
  which CI runs via `pnpm test:ci`.

CI: `.github/workflows/test.yml:31-32` runs `pnpm smoke:sidecar` as its own step.
`meta/runPlanningGates.py:87` — MINIMUM_EXPECTED_GATES = 11.
</interfaces>

<measured_baseline>
Re-measured by the orchestrator against HEAD `61b6e77bc`. Re-measure anything you rely on —
another session has been committing to this branch today.

- `run.stdout` is captured and NEVER inspected: grep for `run.stdout` in the gate returns ZERO.
- `build/main/sidecar.js` exists and is current, though the gate rebuilds as its first step.
- The four pre-existing dirt paths listed in `<constraints>` are untracked/modified and MUST NOT
  be staged.
- Standing finding: `pnpm test:ci` is RED at HEAD from an unrelated leaked store-embed timer with
  ZERO reported test failures. Establish the baseline BEFORE claiming any regression.
</measured_baseline>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Arm the gate with the sentinel signal, bind the literal, measure the stderr arm</name>
  <files>meta/sidecarStartupSmoke.cjs, src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts</files>
  <action>
Three pieces, in this order. Piece C is a MEASUREMENT that may conclude "do not implement" — that
outcome is a success, not a deferral.

**(A) Arm the gate.** In `meta/sidecarStartupSmoke.cjs`, declare a module-level constant holding
the sentinel literal `__GAMELIB_SIDECAR_READY__` (name it so the drift gate in piece B can find
it, e.g. `READY_SENTINEL`). Document on that constant, in one or two lines, that it is hardcoded
because this file is CommonJS and cannot require the TypeScript export, and that
`sidecarRejectionGuard.test.ts` asserts the two still agree. After the existing ETIMEDOUT arm and
after the existing `run.status !== 0` arm — both kept exactly as they are — add a THIRD arm:
`(run.stdout || '')` must include the sentinel; if it does not, `fail()` with a message naming the
real mechanism (the uncaughtException guard keeps a dead sidecar's exit code at 0, so the exit
code cannot be the signal) and pass `run.stderr` as the `extra` argument so the operator sees the
swallowed stack. Guard against a null `run.stdout`. Do NOT add an `env` key to the `spawnSync`
call — this file is the named real-profile exemption and another gate asserts its header anchors.
Do NOT change `STARTUP_TIMEOUT_MS`. Do NOT touch lines 28-60 in this task; header-claim corrections
belong to Task 3, after the gate actually backs them up.

**(B) Bind the literal (RULING 1).** Add ONE `it(...)` inside the existing `Group 3` describe of
`src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts`. It imports `READY_SENTINEL` from
`common/types/sidecarTransport` (`bootstrapWirings.test.ts:36` proves that specifier resolves from
this jest project), reads `meta/sidecarStartupSmoke.cjs` from disk, and asserts the file still
contains `READY_SENTINEL`'s VALUE. Run the assertion against `stripComments(source)`, not raw
source — a gate satisfied by the prose that names it is a recorded failure mode in this repo, and
the sentinel is about to be mentioned in prose. Add a positive control in the same test proving the
read really landed on the gate file (e.g. the stripped source also contains `STARTUP_TIMEOUT_MS`),
so an empty or wrong-path read cannot pass the assertion vacuously. Write a comment naming WHY the
binding exists: `.cjs` cannot require a TS export, so renaming or retyping the sentinel would
silently disarm the smoke gate. Do not add a build step, a bundler, or convert the gate to TS.

**(C) Measure the stderr arm (RULING 2) — do not implement it blind.** The todo only says
"consider" failing on `[sidecar] uncaught exception:` in the child's stderr, resting on the
UNMEASURED assumption that a clean boot emits none. There is a standing finding in this repo that
this guard gets fed EPIPE by its own logging. So measure first: write a throwaway script in the
scratchpad that spawns `build/main/sidecar.js` exactly as the gate does — `process.execPath`, cwd
= repo root, `encoding: 'utf-8'`, 30s timeout, NO `env` key — and writes the child's stdout and
stderr to separate scratchpad files. Then count matches with a `;` separator, never `&&`
(`grep -c` returning 0 exits 1 and silently breaks the chain). If the count is 0, implement the
stderr assertion as a fourth arm in the gate. If it is 1 or more, DO NOT implement it — that arm
would ship a flaky gate — and say so.

  This run inherits the REAL profile by design (it mirrors the exempt gate). Standing finding:
  a bare sidecar run against the real HOME leaks live session data into its output. Keep the
  captures in the scratchpad, NEVER in the repo; quote only the matching
  `[sidecar] uncaught exception:` lines (or the zero count plus a redacted line-count) into the
  summary; delete the captures when done. `timeout` and `cat -A` do not exist on this BSD
  userland — bound the run with `node`'s own `timeout` option, which the script already uses.

Record the measured verdict, the count, and the reasoning in the summary either way.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects src/backend --passWithNoTests -- src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm smoke:sidecar; echo "smoke rc=$?"</automated>
  </verify>
  <done>
The gate asserts the sentinel in `run.stdout`, still passes no `env` key, and still exits 0 on the
healthy tree. The drift test and all 5 fakeHomeIsolation tests pass. The stderr arm has a measured
verdict (implemented with a quoted zero count, or not implemented with the offending lines quoted).
  </done>
</task>

<task type="auto">
  <name>Task 2: Negative control — prove RED, restore by cp, prove GREEN</name>
  <files>src/backend/sidecar/bootstrap.ts (transient only — must end byte-identical)</files>
  <action>
This task is the POINT of the work, not a formality. A fix shipped without a red run is the
green-check-proving-nothing pattern this repo exists to stamp out. If you cannot make the gate go
red, THAT IS THE FINDING — report it and stop; do not paper over it.

1. **Copy first.** `cp src/backend/sidecar/bootstrap.ts` to a pristine copy in the scratchpad and
   record its `shasum`. Do this BEFORE any edit.
2. **Insert the control.** Add `throw new Error('NEGATIVE CONTROL 260913-lkk')` as the first
   module-scope statement after the import block — the import block's last line is
   `} from './processGuards'` at line 171, so the throw goes immediately after it (the todo
   recorded the same insertion landing at line 173 last time).
3. **Prove the break is real, not a build-cache artefact.** Run `pnpm smoke:sidecar`, capture the
   exit code and the FAIL text. Separately grep `build/main/sidecar.js` for
   `NEGATIVE CONTROL 260913-lkk` and record the occurrence count (`;` separator, not `&&`). Record
   in the summary: occurrences in source, occurrences in the built bundle, the gate's rc, and the
   verbatim FAIL line.
   EXPECTED: rc=1 and the new sentinel-missing FAIL — NOT the "exited N at startup" arm, because
   the guard keeps the child's exit code at 0. If the "exited N" arm fires instead, say so; that
   would mean the premise shifted and the finding changes.
4. **Negative control for the drift gate too.** Temporarily change ONLY the hardcoded literal in
   `meta/sidecarStartupSmoke.cjs` to a wrong value, run the Group 3 suite, and prove it goes RED.
   Restore that file by `cp` from a scratchpad pristine copy taken before the edit. This is the
   anti-vacuity proof for the RULING 1 binding — without it the binding is an untested assertion.
5. **Restore bootstrap.ts by `cp` from the pristine copy. NEVER `git checkout --`** — standing
   finding: it fires this repo's post-checkout hook. Prove restoration two ways: a `shasum` match
   against the pristine copy, AND an empty `git diff -- src/backend/sidecar/bootstrap.ts`.
6. **Prove GREEN.** Re-run `pnpm smoke:sidecar` (it rebuilds as its first step) and confirm rc=0
   with the PASS line. Re-run the Group 3 suite and confirm the drift test passes again.

Do not remove or weaken `installUncaughtExceptionGuard()` — it is correct, and the defect is the
gate's choice of signal. Do not raise or remove `STARTUP_TIMEOUT_MS`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && git diff --stat -- src/backend/sidecar/bootstrap.ts meta/sidecarStartupSmoke.cjs; git status --porcelain -- src/backend/sidecar/bootstrap.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm smoke:sidecar; echo "restored smoke rc=$?"</automated>
  </verify>
  <done>
Recorded in the summary: gate RED under the bootstrap throw (rc, verbatim FAIL line, bundle
occurrence count), drift gate RED under a wrong literal, both restored by `cp` with matching
shasums, `git diff` empty for `bootstrap.ts`, and the gate GREEN again with rc=0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Census and correct the stale claims, run the gates, dispose of the todo</name>
  <files>src/sidecar/installRejectionGuard.ts, meta/sidecarStartupSmoke.cjs, src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts, .planning/todos/pending/2026-09-13-smoke-sidecar-cannot-detect-a-module-evaluation-crash-the-uncaughtexception-guard-makes-the-exit-code-always-zero.md</files>
  <action>
Only start this after Task 2 has proven the gate RED-then-GREEN. Correcting a claim before the
gate backs it up would just move the falsehood.

**Census, do not trust the todo's list.** The todo names three sites. Run the census yourself —
`grep -rn "smoke:sidecar" src meta package.json .github` — and build a table of every hit with a
verdict: STALE / HISTORICAL (a true record of a past run) / INSTRUCTION (true again once the gate
is armed). The orchestrator's own scan of HEAD found 6 hits under `src/` plus two claims inside
the gate's own header, and found ZERO `smoke:sidecar` hits in `src/backend/sidecar/bootstrap.ts` —
which would make the todo's "bootstrap.ts's own `init()` docblock carries the same assumption"
claim WRONG. Re-measure it. If it is wrong, say so explicitly in the summary; a todo's blast-radius
claim being partly false is a finding worth recording, not a detail to smooth over.

**Correct the genuinely stale sites.** At minimum, expect these four:
  - `src/sidecar/installRejectionGuard.ts:42-46` — the named false claim ("the only check that
    catches this class of regression"). Make it true again by naming the SIGNAL, not just the
    command: the gate asserts the READY sentinel in the child's stdout, because the
    uncaughtException guard makes the exit code unconditionally 0 for this failure class.
  - `meta/sidecarStartupSmoke.cjs:26` — "Exit 0 = the sidecar reached its RPC loop and shut down
    cleanly on stdin EOF." False as written; exit 0 alone proves nothing. Reword to name the
    conjunction the gate now actually checks.
  - `meta/sidecarStartupSmoke.cjs:86-88` — "one that dies during module evaluation exits non-zero".
    False since the guard landed. Correct it and name the guard.
  - `src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts:1457` — "this source gate and
    `pnpm smoke:sidecar` are the two checks that can". True again only because of this task's
    work; annotate it with what makes it true.
Record WHEN each claim went stale (the guard is D-35-10-01, Phase 35 — it post-dates the gate's
2026-08-23 founding incident, so the gate was disarmed by a later, individually-correct change).

**Do not disturb the exemption anchors.** Editing the gate's header risks the two anchor phrases
asserted at `fakeHomeIsolation.test.ts:101-104`. They must survive verbatim and each on ONE line.
Re-run that suite after every header edit.

**Gates.** Run and record: `pnpm codecheck`; `pnpm lint` (two ceilings, one free slot — an
orphaned disable costs +2); `pnpm planning-gates` — capture its pass count AT EXECUTION TIME and
compare against that, not a remembered number (`MINIMUM_EXPECTED_GATES = 11`); the targeted jest
suites from Tasks 1-2; and `pnpm smoke:sidecar` one final time. If you run `pnpm test:ci`, first
establish the pre-existing RED baseline (a leaked store-embed timer, ZERO reported failures) so
you do not misattribute it to this change.

**Todo disposition.** If the gate demonstrably went RED under the negative control and GREEN when
restored AND the census is corrected: `git mv` the todo into `.planning/todos/completed/` and set
`status: completed`. Otherwise leave it in `pending/` with an updated `## What remains`. Either
way the frontmatter keys must stay BARE and lowercase — `severity: medium`, never
`severity: "medium"` — with `platform:` immediately after `severity:` and `ready:` immediately
after `platform:`; CI enforces this on `pending/` only. Note the standing finding that `git mv`
commits HEAD content and drops unstaged edits: make the frontmatter edit and verify the STAGED
blob, watching for an `R100`/`RM` status.

**Housekeeping.** `graphify update .` at the end, since `src/` changed. Delete the scratchpad
captures from Task 1. Commit with an EXPLICIT pathspec on every `git add` and `git commit` — never
stage `.planning/todos/completed/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md`,
`.claude/skills/archify/`, `.planning/quick/260912-d84-align-the-humble-keys-game-column-header/`,
or `skills-lock.json`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm planning-gates</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects src/backend --passWithNoTests -- src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && git status --porcelain | grep -E "humble-keys-title-wrap|archify|260912-d84|skills-lock" ; echo "dirt still unstaged (expect ?? or space-M prefixes, never staged)"</automated>
  </verify>
  <done>
The census table is in the summary with a verdict per hit and an explicit statement on whether the
todo's bootstrap.ts claim held. Every STALE claim is corrected. `fakeHomeIsolation` is 5/5,
`codecheck` clean, `planning-gates` at its measured pass count, `pnpm smoke:sidecar` rc=0. The todo
is closed or left pending with correct bare-lowercase frontmatter. The four dirt paths are
untouched and unstaged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI gate -> operator trust | A green check is the only thing most readers will see; a fail-open gate transfers false confidence |
| real-profile spawn -> disk captures | The smoke gate and the Task 1 measurement inherit a populated profile whose live session data can land in captured output |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lkk-01 | Spoofing | `meta/sidecarStartupSmoke.cjs` success signal | mitigate | Assert the READY sentinel in `run.stdout` — a signal the uncaughtException guard cannot forge — and prove it with the recorded negative control (Task 2) |
| T-lkk-02 | Tampering | hardcoded `.cjs` literal vs TS `READY_SENTINEL` | mitigate | Drift assertion in `sidecarRejectionGuard.test.ts` Group 3, run in CI, with its own RED proof (Task 2 step 4) |
| T-lkk-03 | Info disclosure | Task 1 stderr measurement against the real HOME | mitigate | Captures stay in the scratchpad, only the matching guard lines are quoted, captures deleted at task end |
| T-lkk-04 | Tampering | gate header edits vs `fakeHomeIsolation` anchors | mitigate | Re-run that suite after every header edit; both anchors must survive verbatim on one line each |
| T-lkk-SC | Tampering | package-manager installs | accept | No new dependencies — no package installs in this plan, so the legitimacy gate does not arm |
</threat_model>

<verification>
- `pnpm smoke:sidecar` rc=1 with the sentinel-missing FAIL under the bootstrap negative control.
- `pnpm smoke:sidecar` rc=0 with PASS on the restored tree.
- `shasum` match + empty `git diff` for `src/backend/sidecar/bootstrap.ts`.
- Drift test RED under a wrong literal, GREEN when restored.
- `fakeHomeIsolation.test.ts` 5/5.
- `pnpm codecheck` clean; `pnpm lint` at or under its two ceilings; `pnpm planning-gates` at the
  pass count measured at execution time.
- The four pre-existing dirt paths are unstaged and unmodified by this work.
</verification>

<success_criteria>
- A module-scope throw in `bootstrap.ts` now turns `pnpm smoke:sidecar` RED — demonstrated, not
  asserted — while the child still exits 0.
- The gate's hardcoded literal cannot silently drift from `READY_SENTINEL`, and that binding has
  its own proven RED run.
- The stderr arm has a MEASURED verdict recorded with its evidence; "measured, not implemented"
  is an acceptable and complete outcome.
- No shipped comment promises a check `pnpm smoke:sidecar` cannot deliver, and the census behind
  that statement — including where the todo's own blast-radius claim was wrong — is recorded.
- `installUncaughtExceptionGuard()` and `STARTUP_TIMEOUT_MS` are unchanged.
</success_criteria>

<output>
Create `.planning/quick/260913-lkk-fix-smoke-sidecar-fail-open-signal/260913-lkk-SUMMARY.md` when done.
</output>
