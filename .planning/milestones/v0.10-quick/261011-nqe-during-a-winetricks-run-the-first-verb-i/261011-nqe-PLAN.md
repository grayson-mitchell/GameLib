---
phase: quick-261011-nqe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/backend/tools/winetricksQueue.ts
  - src/backend/tools/__tests__/winetricksQueue.test.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx
  - .planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md
  - .planning/todos/completed/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md
autonomous: true
requirements: [45-12-G3]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low # `gsd-tools query estimate-calibration` at planning: factor 1, sample_count 0, applied false

must_haves:
  truths:
    - "When the winetricksApply reply lands AFTER the run's live winetricksQueueChanged pushes, the first verb still renders Installing (row class WinetricksRow--installing) and Cancel remaining is enabled. The reply can no longer set currentVerb back to '' or every outcome back to pending (queueStateOrdering test 1: RED before the fix, GREEN after)"
    - "A reply that is NOT stale (it arrives before any newer push) is still applied: the tab enters the in-flight bar from the reply alone (control test, green before and after, so a guard that drops every reply fails it)"
    - "A run that finishes before its apply reply lands ends in the done bar, not stuck in flight with busy true, and a failure its pushes reported stays flagged (row WinetricksRow--errored with Retry). The D-15 error-clear on an accepted reply cannot erase a newer failure"
    - "A Cancel remaining reply or a remount read (winetricksQueueState) that lands after newer pushes cannot regress the tab. Exactly one installed-list re-read per finished run still fires when a stale done push is dropped"
    - "Every WinetricksQueueState the backend produces carries a process-wide, strictly increasing revision. apply() snapshots its reply AFTER runLoop's synchronous first push, so the reply shows the first verb installing and is newer than every push sent before it"
    - "StickyBar/index.tsx and src/common/winetricks/deriveRowState.ts are byte-unchanged. Cancel enablement (currentVerb === '' or cancelRequested, T-45-24) and row state still derive from run.currentVerb. The fix only guarantees the run they read is never older than the newest state the tab has applied"
    - "The todo is in .planning/todos/completed/ with a '## Fix (2026-10-11, quick 261011-nqe, ...)' section stating what was unit-proven and NOT LIVE-VERIFIED. 45-UAT.md is byte-unchanged and the owed G3 re-score is noted, not written"
  artifacts:
    - path: src/common/types.ts
      provides: "WinetricksQueueState.revision: number, documented as a process-wide snapshot sequence number"
      contains: "revision: number"
    - path: src/backend/tools/winetricksQueue.ts
      provides: "Module-level snapshot counter bumped in getState(); apply() reply snapshot taken after `void runLoop(run)`"
      contains: "revision"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
      provides: "appliedRevision ref and the single takeQueueState() guard that every state source (mount read, push, apply reply, cancel reply) goes through"
      contains: "takeQueueState"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx
      provides: "Whole-tab race tests: stale apply reply, fresh reply control, fast-finish + D-15, stale cancel reply, stale mount read, dropped stale done push still reloads"
      contains: "261011-nqe"
    - path: src/backend/tools/__tests__/winetricksQueue.test.ts
      provides: "Revision-ordering pins: apply reply newer than pushes A and B, older than every later push; cancel reply newer than its push; getState monotonic across games"
      contains: "revision"
  key_links:
    - from: src/backend/tools/winetricksQueue.ts getState()
      to: src/common/types.ts WinetricksQueueState.revision
      via: "every snapshot (push, apply reply, cancel reply, mount read, environment push) is stamped by the one counter"
      pattern: "revision"
    - from: src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx takeQueueState()
      to: StickyBar cancelDisabled / deriveRowState
      via: "queueState.run, which takeQueueState never replaces with a lower-revision state"
      pattern: "appliedRevision"
    - from: index.tsx takeQueueState()
      to: index.tsx onProgress
      via: "latestRun.current, which gates progress lines on run.currentVerb, so it can no longer regress to '' mid-verb"
      pattern: "latestRun.current"
---

<objective>
Fix the intermittent Phase 45 live-gate defect (45-12 G3; G1/G7 run frames). During a Winetricks
run the first verb renders as Queued, and Cancel remaining stays disabled until the verb boundary.
Prove the mechanism with a failing whole-tab test first, then make queue states totally ordered so
that no IPC reply can regress the tab below a push it has already applied.

Purpose: G3 ("press Cancel remaining while the first verb is Installing") could not be performed on
launch 2. The same race can leave the tab stuck in flight with Apply disabled. That happens when a
run finishes before its reply lands, and is shown by code read in planning_findings F5.

Output: a `revision` field on `WinetricksQueueState` and a backend snapshot counter. The apply reply
is snapshotted after the first push. One frontend guard, `takeQueueState`, through which all four
state sources pass. Six whole-tab race tests and three backend ordering pins. The source todo
closed to `completed/`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md
@src/backend/tools/winetricksQueue.ts
@src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
@src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.tsx
@src/common/winetricks/deriveRowState.ts
@src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/applyTracer.test.tsx
@src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts
@src/backend/tools/__tests__/winetricksQueue.test.ts

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence. Its fifth convention is
the scoped prettier rule, and the `--file-info` probe comes first.

<planning_findings>
Code read at HEAD 165103156. All line numbers are from that commit.

F1 - The todo's mechanism is CONFIRMED, with one refinement.
`src/backend/tools/winetricksQueue.ts:172` takes `const state = getState(runner, appName)`, a
frozen copy built by `getState` at :62-83 with spread `run`, `verbs`, `outcomes` and `log`. At that
point the copy has `currentVerb: ''`, every outcome `pending` and `busy: true`. It is taken BEFORE
`pushState(run)` at :174 (push A) and before `void runLoop(run)` at :180. `apply()` returns the copy
at :187.

The refinement is that the loop's first push is not "later". `runLoop` sets
`run.outcomes[verb] = 'installing'` (:93) and `run.currentVerb = verb` (:94), then calls
`pushState(run)` (:95). All three run synchronously, before the loop's first `await` at :101. So
push B (first verb installing) is sent inside `apply()`, before the reply.

The backend send order is therefore FIXED: push A, push B, then the reply carrying the pre-run
snapshot. The intermittency is entirely renderer-side arrival order. Pushes travel the
`winetricksQueueChanged` event path and the reply travels the invoke-reply path. Inference only,
not measured: nothing orders those two paths against each other.

F2 - The renderer applies the reply unconditionally.
`WinetricksSettings/index.tsx` `applyVerbs` (:375-395) sets `latestRun.current` (:385) and
`setQueueState(result.value.state)` (:386) with no check against what the pushes already delivered.
`StickyBar/index.tsx:70` computes `cancelDisabled = run.currentVerb === '' || run.cancelRequested`.
`deriveRowState.ts:46` returns `installing` only when `run.currentVerb === verb`, and :58 returns
`queued` for a `pending` outcome. A late reply therefore yields a Queued row and a disabled Cancel.
They stay that way until the next push. That push comes at the verb's END (:107-109, which still
has `currentVerb ''`), and Cancel only enables when the second verb's :95 push arrives. This matches
the operator's "enabled at the verb boundary".

F3 - The same regression also silences the first verb's live output.
`onProgress` (:330-337) drops every progress event whose `installingComponent` is not
`latestRun.current.currentVerb`. While the stale reply holds `currentVerb ''`, every progress line
and percent of the first verb is discarded. This is consistent with "no spinner, no phase word" in
`burst2-light-071..073`. It may also bear on 45-UAT item 12 ("Early lines between apply-accepted and
run registration"). That is NOT measured, so record it as an open observation only.

F4 - The same unguarded pattern exists at two more sites, both closed by this plan.
(i) The Cancel remaining reply, at `index.tsx:405-408`. The backend pushes at
`winetricksQueue.ts:209` and then returns `getState` at :211. A verb-end or done push can land
before that reply.
(ii) The remount read at `index.tsx:254-277`. Its `winetricksQueueState` reply can land after a push
received by the listener registered at :356.

F5 - Fix (a) on its own is insufficient. Fix (a) means "return the post-push state from apply()".
Moving the :172 snapshot after :180 does make the reply carry the first verb `installing`, because
of F1. But a single verb that finishes or fails quickly sends its verb-end push (:109) and its done
push (:114) after that snapshot. If the reply lands after them, the tab is set back to
`status: 'running', busy: true`. No later push ever arrives, so the tab is stuck in flight with
Apply disabled until a remount.

The same late reply also re-runs `clearVerbError` (:392). That erases the failure flag the pushes
just folded in (D-15), so a fast-failing Retry shows Available instead of Install failed.

F6 - Census for the type change. The only `WinetricksQueueState` object literals are
`winetricksQueue.ts:67`, `index.tsx:84` (`emptyQueueState`) and `tabFixtures.ts:63`. Every test
fixture spreads from that last one. Adding a field adds NO IPC channel.

Four tests pin channel or call-site counts, and none of them pins the state's shape:
- `invokeReturnValueSweep.test.ts:45` (invoke channels, 15)
- `flowRegistrationCensus.test.ts`
- `runnerSliceRegistration.test.ts`
- `DeferredChannelCallSiteGuard.test.ts:33-35`, which pins 6 `window.api.winetricks*` call sites in
  `index.tsx`. It must stay 6, so this plan adds and removes no `window.api` call.

`wineToolsFlows.test.ts:626-700` mocks `WinetricksQueue` and asserts by-identity forwarding, so it
is shape-agnostic.

F7 - The sidecar is spawned once per app lifetime. `src-tauri/src/main.rs:12393` is the only
`spawn_sidecar` call, and a failed spawn exits the app. So a process-wide counter cannot reset under
a living renderer.

Baselines at 165103156:
- `pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts --selectProjects Frontend`
  gives 14 suites / 233 tests, all passing.
- The Backend command in Task 2's verify gives 5 suites / 219 tests, all passing.
- In `index.tsx` with comment lines filtered out: `setQueueState(` occurs 4 times,
  `latestRun.current = ` occurs 4 times, and `window.api.winetricks` occurs 6 times.
</planning_findings>

<fix_choice>
The chosen fix is (b) plus (a). (b) is the fix. (a) is a one-statement refinement.

(b): `WinetricksQueueState` gains `revision: number`. `getState()` stamps it from a module-level
counter, bumping it once per snapshot. Snapshots are taken synchronously in one process, so the
revision order is the backend's real state order. The tab applies a state only if
`state.revision >= appliedRevision`. Equal revisions are applied: in production only the same
snapshot can share a number, and every existing fixture carries 0, so all 233 existing tests keep
their behaviour.

The revision belongs on the STATE, not on the run. A per-run number cannot order a run-null remount
read or an environment-only push (:43-45) against run states. A runId-only rule (drop a reply whose
runId the tab already holds) would also work for the apply reply, but only while the invariant
"every run mutation pushes" holds. It still could not order the run-null mount read.

(a): take apply()'s reply snapshot after `void runLoop(run).catch(...)`. The reply is then never
older than a push already sent. When the reply wins the race, the tab shows Installing at once
instead of showing Queued for the few ms until push B lands. This makes task-intent item 3 hold in
every arrival order: `currentVerb === ''` only before the first verb has actually started.
</fix_choice>

<interfaces>
These are the existing contracts the executor needs, so no further exploration is required.
- `src/common/types.ts:916` defines
  `interface WinetricksQueueState { runner: Runner; appName: string; run: WinetricksQueueRun | null; busy: boolean; environment: WinetricksEnvironmentReport }`.
  `WinetricksApplyResult` (:924) is `{ accepted: true; state: WinetricksQueueState } | { accepted: false; reason: 'busy' | 'invalid'; detail: string }`.
- `tabFixtures.ts` exports `buildCatalog`, `idleStateWith`,
  `queueStateWith(run, busy = false, environment = {})` (defaults: runId 1, `status 'running'`,
  `currentVerb ''`), `makeApi(overrides)`, `installApi`, `capturedQueueChangedListener(api)` (the
  last registered listener), `capturedProgressListener`, `rerender(tab)` and
  `mountTab(tab, afterFirstFlush?)`.
  Frontend jest uses `resetMocks: true`, so build deferred mocks inside the test or in `beforeEach`.
- `treeHarness.ts` exports `flush(times = 60)`, `findAll`, `findByClass` and `collectText`. There is
  no jsdom. The component is called as a plain function through `rerender`, and the tests invoke
  `props.onClick` directly. `useMouseDownActivate`'s `onClick` fires the action when no mousedown
  preceded it.
- Row root className always contains `WinetricksRow--${rowState}` (`Row/index.tsx:195-199`). Cancel
  is `.WinetricksStickyBar__cancel`. The bar root carries `WinetricksStickyBar--inFlight`, `--done`
  or `--rest`.
- Backend test helpers (`winetricksQueue.test.ts`) are `queueChangedPushes(appName?)`, the local
  structural interface `QueuePushPayload` (:166-178), `spawned(count)`,
  `finishChild(index, exitCode)` and `flushMicrotasks`. `currentRun`, `nextRunId` and the new
  counter are module-level and persist across tests. Use a fresh appName per test, finish every
  run, and assert RELATIVE revisions only.
</interfaces>

<source_coverage>
- Task-intent 1 (prove first, cite lines): Task 1 RED, and planning_findings F1-F3.
- Task-intent 2 (choose and justify): fix_choice. Task 1 builds the (b) slice. Task 2 builds (a) and
  the remaining guarded sites. F5 is the case that shows (a) alone fails, and it becomes test 2.
- Task-intent 3 (Cancel derived from the same state): StickyBar and deriveRowState stay unchanged,
  pinned by `git diff --quiet` in Task 2. Test 1 asserts Cancel is enabled. Test 3 and (a) cover
  reply-first ordering.
- Task-intent 4 (suites, codecheck, eslint, prettier): every task's verify.
- Task-intent 5 (close the todo; NOT LIVE-VERIFIED; G3 re-score owed, not written): Task 3.
- Todo option "ignore a reply whose runId it already holds": superseded by the revision guard, which
  covers that case and also the run-null mount read. fix_choice records why.
</source_coverage>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer - a stale apply reply can no longer regress the in-flight verb (RED first, then revision end to end)</name>
  <files>src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx, src/common/types.ts, src/backend/tools/winetricksQueue.ts, src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts</files>
  <precondition>HEAD descends from 165103156, and `git diff --quiet 165103156 -- src/backend/tools/winetricksQueue.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/common/types.ts` exits 0, so the line numbers cited in planning_findings still hold. If it does not exit 0, halt and re-read the files before editing.</precondition>
  <read_first>src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/applyTracer.test.tsx (copy its mock header and its checkboxFor/applyButton helpers), src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts, src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx:119-191 and :300-395</read_first>
  <behavior>
    - Test 1 (G3 race, apply reply lands last). Use a single-verb catalog, `['vcrun2019']`, as in applyTracer. Mount the tab. Tick vcrun2019, rerender and press Apply. `winetricksApply` returns a deferred promise. Deliver push A, a running run with vcrun2019 `pending`, `currentVerb ''`, busy true, at revision 2. Deliver push B, vcrun2019 `installing` with `currentVerb 'vcrun2019'`, busy true, at revision 3.
      - Anchor: assert the row is `WinetricksRow--installing` and Cancel `disabled === false` BEFORE the reply. This proves a later failure is attributable to the reply.
      - Then resolve the reply as `{ accepted: true, state }`, where state is the pre-run snapshot exactly as `winetricksQueue.ts:172` produces it (pending, `currentVerb ''`, busy true) at revision 1. Flush and rerender.
      - Assert the row is still `WinetricksRow--installing`, Cancel `disabled === false`, and the bar is `WinetricksStickyBar--inFlight`.
      - RED expected on current code: the row class contains `WinetricksRow--queued` and Cancel is disabled.
    - Test 3 (control: a fresh reply IS applied). Same mount and Apply. Resolve the reply FIRST, with the pre-run snapshot at revision 1, while the tab still holds the mount state at revision 0.
      - Assert the bar is `WinetricksStickyBar--inFlight` and the row is `WinetricksRow--queued`. This fails under any guard that swallows replies.
      - Then deliver A (revision 2) and B (revision 3). Assert Installing and Cancel enabled.
      - Expected: green before and after the fix.
  </behavior>
  <action>
**RED.**

Create `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx`:
- Its docstring names quick 261011-nqe, the 45-12 G3 observation, and planning_findings F1/F2 in
  prose.
- Copy applyTracer's seven stylesheet mocks, its `react`, `react-i18next` and
  `@fortawesome/react-fontawesome` mocks, and its `checkboxFor` and `applyButton` helpers verbatim.
- Build `api` in `beforeEach` with a vcrun2019-only catalog.
- Add a local helper, `atRevision(revision, state)`. It returns `Object.assign({}, state, { revision })`,
  typed as the input type intersected with `{ revision: number }`. This lets the RED file compile
  under ts-jest before the type has the field, and it still compiles after the type gains it.
- Deferred replies are a `new Promise` whose resolver the test captures. Install it with
  `api.winetricksApply.mockImplementation`.
- Write tests 1 and 3 per the behavior block. Only `tabFixtures` builders are used: `queueStateWith`
  with `busy = true` for the running states.

Run `pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx --selectProjects Frontend`.
Confirm test 1 fails AT THE POST-REPLY assertion, with received text showing `WinetricksRow--queued`
or Cancel disabled, and that its pre-reply anchor passed. Confirm test 3 passes. If test 1 fails
anywhere else (compile, anchor, harness), the test proves nothing: fix the test, not the code.
Paste the failing expect and its received value into the SUMMARY under "RED evidence". Do NOT
commit a red tree. The RED is recorded in the SUMMARY, and the test and fix commit together.

**GREEN.** This is the thinnest slice through every layer.

(1) `src/common/types.ts`. Add `revision: number` to `WinetricksQueueState`, with a doc comment. The
comment says it is a process-wide snapshot sequence number that strictly increases with every
`getState()` snapshot. A renderer holding two states for one game can therefore tell which is newer,
whichever order the event push and the invoke reply arrived in (261011-nqe).

(2) `src/backend/tools/winetricksQueue.ts`. Next to `currentRun`, `nextRunId` and `applyInFlight`
(:36-38), add a module-level counter, starting at 0, with a comment citing 261011-nqe and
planning_findings F1. `getState()` increments it once per call and returns the new value as
`revision` in the returned object. The sidecar is spawned once per app lifetime (F7), so the counter
never resets under a living renderer. Say so in the comment. Do NOT move the :172 snapshot in this
task. That is Task 2's fix (a), with its own RED.

(3) `src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx`:
- `emptyQueueState` (:80-91) gains `revision: 0`.
- Declare `const appliedRevision = useRef(0)` alongside `latestRun`/`seededRunId` (:153-154). It MUST
  be above the `if (!runner)` early return at :161, which keeps the hook order stable.
- After `seedLogFrom` (:174-184), add a `function takeQueueState(state: WinetricksQueueState): boolean`:
  - If `state.revision < appliedRevision.current`, it returns false and changes nothing.
  - Otherwise it records `appliedRevision.current = state.revision`, sets
    `latestRun.current = state.run`, calls `setQueueState(state)` and `seedLogFrom(state.run)`, runs
    `setErroredVerbs((current) => foldRunOutcomes(current, state.run))`, and returns true.
  - Its comment explains the race: the reply is snapshotted before the run's own pushes, and the two
    arrive by independent paths. It also explains that equal revisions are applied.
- In `onQueueChanged` (:300-316), replace the first four statements after the game filter (:305-308)
  with a call to `takeQueueState(state)`. Leave the done/`reloadInstalled` block as it is for now.
  Task 2 changes it.
- In `applyVerbs` (:384-393), replace the three lines :385-387 with `takeQueueState(result.value.state)`.
  Keep `setSelection([])` and the `clearVerbError` line unchanged for now. Task 2 owns the D-15
  change.

(4) `tabFixtures.ts`. `emptyQueueState()` (:62-70) gains `revision: 0`.

Rerun the test file and the whole WinetricksSettings directory: all green, with the 233 baseline
tests unchanged in outcome.

Commit the test and code together as
`fix(winetricks): order queue states by a snapshot revision so a late apply reply cannot regress the in-flight verb (261011-nqe)`.
Do not stage `.planning/milestone.lock`.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings --selectProjects Frontend</automated>
    <automated>pnpm jest src/backend/tools/__tests__/winetricksQueue.test.ts --selectProjects Backend</automated>
    <automated>pnpm codecheck && npx eslint src/common/types.ts src/backend/tools/winetricksQueue.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx</automated>
    <automated>for p in src/common/types.ts src/backend/tools/winetricksQueue.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/common/types.ts src/backend/tools/winetricksQueue.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx</automated>
  </verify>
  <done>
    - Test 1 was observed RED at its post-reply assertion, with received text and the passing anchor recorded in the SUMMARY. It is GREEN after the change.
    - Test 3 is green throughout.
    - All WinetricksSettings suites pass (233 baseline plus 2 new), and the backend queue suite passes.
    - codecheck and eslint exit 0. All five paths report `ignored: false` and pass `prettier --check`.
    - One `fix(winetricks): ... (261011-nqe)` commit.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expand - guard the cancel and remount replies, keep D-15 and the reload honest, and snapshot the apply reply after the first push</name>
  <files>src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx, src/backend/tools/winetricksQueue.ts, src/backend/tools/__tests__/winetricksQueue.test.ts</files>
  <read_first>src/backend/tools/__tests__/winetricksQueue.test.ts:140-258 (helpers and the N=1 tracer), src/backend/tools/winetricksQueue.ts:123-212, src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx (as left by Task 1)</read_first>
  <behavior>
    - Frontend test 2 (F5: the run finishes before its reply).
      - Mount, tick, press Apply with a deferred reply. Deliver four pushes:
        - revision 1: pending.
        - revision 2: vcrun2019 installing.
        - revision 4: vcrun2019 `failed`, `currentVerb ''`.
        - revision 5: status `done`, vcrun2019 failed, busy false.
      - Then resolve the reply in the (a) shape: vcrun2019 installing, `currentVerb 'vcrun2019'`, busy true, revision 3.
      - Assert the bar is `WinetricksStickyBar--done` and contains '1 failed'. Assert there is no `--inFlight`. Assert the row is `WinetricksRow--errored` with a `WinetricksRow__retry`.
      - RED on Task 1 code: the stale reply is dropped, but `clearVerbError` erases the flag, so the row is `--available`.
    - Frontend test 4 (stale cancel reply).
      - Set up the held state by push only, with no Apply: a running run with verbs `['vcrun2019', 'xact']`, vcrun2019 installing, xact pending, at revision 3. Press Cancel through `.WinetricksStickyBar__cancel` `props.onClick`, with a deferred `winetricksCancelRemaining`.
      - Deliver three pushes:
        - revision 4: `cancelRequested` true, xact `cancelled`.
        - revision 6: vcrun2019 `installed`, `currentVerb ''`.
        - revision 7: status `done`, busy false.
      - Then resolve the cancel reply with the revision-4 content at revision 5.
      - Assert the bar is `--done` with '1 installed', there is no `--inFlight`, and the row is `WinetricksRow--installed`. Assert `api.winetricksListInstalled` was called exactly 2 times: the mount, plus one done reload.
      - RED on Task 1 code: the cancel reply is unguarded, so it is set back to running and stays stuck in flight.
    - Frontend test 5 (stale remount read).
      - Make `winetricksQueueState` deferred, then `mountTab`, which leaves the tab loading. Deliver a push at revision 7: running, vcrun2019 installing, `currentVerb 'vcrun2019'`, busy true.
      - Resolve the mount read with `idleStateWith({})` at revision 6, which has no run. Flush and rerender.
      - Assert the bar is `--inFlight`, Cancel is enabled, and the row is `--installing`.
      - RED on Task 1 code: the mount read is unguarded, so the tab returns to rest with no run.
    - Frontend test 6 (a dropped stale done push still triggers the one reload).
      - Hold the revision-3 running state as in test 4, then press Cancel with a deferred reply.
      - Resolve the cancel reply FIRST at revision 7: done, vcrun2019 installed, xact cancelled, busy false. Flush.
      - Then deliver the stale done push at revision 6. Flush.
      - Assert `api.winetricksListInstalled` was called exactly 2 times and the bar is `--done`.
      - This test is GREEN on Task 1 code and must stay green. It guards against the cancel wiring dropping the done push without moving the reload check.
    - Backend test (i), the apply reply's place in the push order.
      - `await WinetricksQueue.apply('gog', 'revision-apply-game', ['xact', 'corefonts'])`. Then pushes A (first, xact pending) and B (`currentVerb 'xact'`, xact installing) are already present.
      - The reply's `state.run.currentVerb` is `'xact'` with xact installing.
      - `state.revision` is greater than both A's and B's revisions.
      - Drive both children to exit 0. Every push's revision then strictly increases in send order, no push shares the reply's revision, and every push sent after B has a revision greater than the reply's.
      - RED on Task 1 code: the reply has `currentVerb ''` and a revision below A's.
    - Backend test (ii), the cancel reply is newer than its push.
      - Apply on 'revision-cancel-game' with `['xact', 'corefonts']`, then `await spawned(1)`, then `cancelRemaining`.
      - The last push for that game shows corefonts `cancelled`. The returned state has `cancelRequested` true and a revision greater than that push's. Finish child 0 to drain the run.
      - This is a pin, expected green on Task 1 code.
    - Backend test (iii): two consecutive `getState` calls for two different games return strictly increasing revisions. This is a pin.
  </behavior>
  <action>
**RED.**

Append frontend tests 2, 4, 5 and 6 to `queueStateOrdering.test.tsx`, reusing the Task 1 helpers
and `atRevision`.

In `winetricksQueue.test.ts`:
- Add `revision: number` to the local `QueuePushPayload` interface (:166-178).
- Add a `describe('WinetricksQueue state revisions (261011-nqe)')` with backend tests (i), (ii) and
  (iii), using a fresh appName each.
- Assert only relative revisions. The counter is module-level and other tests in the file advance
  it.

Run both suites, using the commands in verify:
- Record which tests are RED and their received values in the SUMMARY. Expected RED: frontend 2, 4
  and 5, and backend (i).
- Frontend 6 and backend (ii)/(iii) are expected green.
- Any other outcome means re-reading the test before touching code.

**GREEN.**

(a) `src/backend/tools/winetricksQueue.ts` `apply()`: move the `const state = getState(runner, appName)`
statement from :172 to directly after the `void runLoop(run).catch(...)` statement, ending at :185,
just before `return { accepted: true, state }`.
- Rewrite its comment. Say the snapshot is taken after runLoop's synchronous prefix has pushed the
  first verb as installing (`runLoop` :93-95 run before its first await at :101). The reply is
  therefore never older than a push already sent. Ordering against LATER pushes is the renderer's
  revision guard's job (planning_findings F5).
- `sendGameStatusUpdate` and `pushState` keep their current order.

`src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx`, in four places:

(1) Mount read (:266-277). Route it through `takeQueueState(stateResult.value)`. Mark
`reloadedRunId.current` for a done run only when that call returned true. Keep the existing
"installed list above is already fresh" rationale.

(2) `onQueueChanged`. After `takeQueueState(state)`, read the newest applied run from
`latestRun.current`, not from the incoming `state.run`. Run the existing done-reload check against
that newest run: if it is done and its `runId` is not `reloadedRunId.current`, mark it and
`void reloadInstalled()`. Comment why: a stale done push can be dropped after a fresher reply
already applied the done state, and the one re-read per finished run must still fire.

(3) `applyVerbs`, on accepted:
- Call `takeQueueState(result.value.state)`.
- Call `setSelection([])`.
- Capture `latestRun.current` into a local.
- Replace the bare `clearVerbError` updater with one that first clears the applied verbs
  (`verbs.reduce(clearVerbError, current)`) and then folds the captured newest run over the result
  with `foldRunOutcomes`.

Comment the effects. D-15's clear still happens for every accepted run. A failure the run's own
pushes already reported, newer than the reply, is re-applied rather than erased. For a fresh reply,
the fold is a no-op beyond what D-15 already did.

(4) `cancelRemaining`, on `result.ok`: replace the two lines (:406-407) with
`takeQueueState(result.value)`.

Do NOT touch any `window.api.winetricks*` call. `DeferredChannelCallSiteGuard` pins 6. Do NOT edit
`StickyBar/index.tsx` or `src/common/winetricks/deriveRowState.ts`.

**MUTATION PROOF for test 6.**
1. Copy `index.tsx` to the session scratchpad and record its `shasum`.
2. Change the reload check in `onQueueChanged` back to read the incoming `state.run`.
3. Run `queueStateOrdering.test.tsx` and confirm test 6 FAILS, with the call count at 1.
4. Restore with `cp` from the scratch copy and confirm the `shasum` matches.

Never use `git checkout --` for this revert. It would silently discard the uncommitted fix. Record
the failing count in the SUMMARY.

Rerun everything in verify. Then run `graphify update .`. The output is gitignored, so there is
nothing to commit.

Commit as
`fix(winetricks): guard the cancel and remount replies by revision and snapshot the apply reply after the first push (261011-nqe)`.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts --selectProjects Frontend</automated>
    <automated>pnpm jest src/backend/tools/__tests__/winetricksQueue.test.ts src/backend/sidecar/__tests__/wineToolsFlows.test.ts src/backend/sidecar/__tests__/invokeReturnValueSweep.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts --selectProjects Backend</automated>
    <automated>F=src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx; test "$(grep -vE '^\s*(//|\*|/\*)' $F | grep -oF 'setQueueState(' | wc -l | tr -d ' ')" -eq 1 && test "$(grep -vE '^\s*(//|\*|/\*)' $F | grep -oF 'latestRun.current = ' | wc -l | tr -d ' ')" -eq 1 && test "$(grep -vE '^\s*(//|\*|/\*)' $F | grep -oF 'window.api.winetricks' | wc -l | tr -d ' ')" -eq 6 && git diff --quiet 165103156 -- src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.tsx src/common/winetricks/deriveRowState.ts</automated>
    <automated>pnpm codecheck && npx eslint src/backend/tools/winetricksQueue.ts src/backend/tools/__tests__/winetricksQueue.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx</automated>
    <automated>for p in src/backend/tools/winetricksQueue.ts src/backend/tools/__tests__/winetricksQueue.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/backend/tools/winetricksQueue.ts src/backend/tools/__tests__/winetricksQueue.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx</automated>
  </verify>
  <done>
    - Frontend tests 2, 4 and 5 and backend test (i) were observed RED on Task 1 code and are GREEN now, with RED evidence in the SUMMARY.
    - Test 6 is green, and its mutation run failed with a count of 1 and was restored by `cp` with a matching shasum.
    - The Frontend run is 16 suites (14 + DeferredChannelCallSiteGuard + the new file) and the Backend run is 5 suites, all passing.
    - In `index.tsx`, with comment lines filtered out, `setQueueState(` occurs exactly 1 time and `latestRun.current = ` exactly 1 time. `window.api.winetricks` still occurs 6 times.
    - StickyBar and deriveRowState are byte-unchanged since 165103156.
    - codecheck and eslint exit 0, and prettier is clean on all four paths.
    - One `fix(winetricks): ... (261011-nqe)` commit.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo with a Fix section in the kqx shape - unit-proven, NOT LIVE-VERIFIED, G3 re-score owed</name>
  <files>.planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md, .planning/todos/completed/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md</files>
  <read_first>.planning/todos/completed/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md from its "## Fix" heading to the end (the shape to follow), .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md items 1, 3 and 12 (read only)</read_first>
  <action>
`git mv .planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md .planning/todos/completed/`.
Leave the frontmatter untouched. `completed/` is exempt from the triage gate.

Append a section headed `## Fix (2026-10-11, quick 261011-nqe, commits <task1-short-hash> <task2-short-hash>)`,
using the real hashes from `git log`. Write it in the kqx closure's bolded-lead-paragraph style,
covering these points in this order:

1. **Mechanism, confirmed by code read and unit test.** Restate planning_findings F1 with the line
   numbers and the refinement: push B is sent synchronously inside `apply()`, so the backend order
   is fixed and the intermittency is renderer-side arrival order. The event-path versus
   invoke-path explanation is an inference and was not measured.
2. **Fix.** (b) the revision guard plus (a) the post-push reply snapshot. Say why (a) alone was not
   enough (the F5 stuck-in-flight case) and why the revision sits on the state rather than the run.
3. **Sites closed beyond the reported one.** The cancel reply, the remount read, and the D-15 clear
   that a late reply used to apply on top of a newer failure.
4. **What is unit-proven.** Name each test and whether it was RED before its fix, quoting the
   received value from the SUMMARY's RED evidence. Include the test 6 mutation and the
   suite/test counts.
5. **Open observation (F3).** The stale reply also regressed `latestRun.current`, which gates
   `onProgress`, so the first verb's progress lines and percent were dropped while it held. This
   may bear on 45-UAT item 12 (early lines). Not measured; no claim.
6. **NOT LIVE-VERIFIED.** A live re-run of 45-12 G3 is owed: press Cancel remaining during the
   first verb of a fresh three-verb run. 45-UAT.md item 3 (G3) currently reads `result: issue`.
   Its re-score is owed to that re-run and is NOT written here. Also owed: the G1/G7 run-frame
   recheck, meaning the first verb shows a spinner and a phase word in every launch ordinal, not
   only launch 4.

Do not edit 45-UAT.md, STATE.md or any other todo.

Prettier: `npx prettier --file-info` reports `{"ignored":true,"inferredParser":null}` for
`.planning/` paths (measured at planning on the sibling kqx closure). A `--check` here would be
vacuous, so it is omitted by design. Match the kqx file's wrap width and heading style by hand.

Commit as `docs(quick-261011-nqe): close the first-verb Queued and Cancel-disabled todo with its unit-proven fix`.
  </action>
  <verify>
    <automated>C=.planning/todos/completed/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md; test -f "$C" && test ! -e .planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md && grep -q '^## Fix (2026-10-11, quick 261011-nqe, commits ' "$C" && grep -q 'NOT LIVE-VERIFIED' "$C" && grep -q 'winetricksQueue.ts:172' "$C" && git diff --quiet 165103156 -- .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md && pnpm planning-gates</automated>
  </verify>
  <done>
    - The todo lives only in `completed/`, renamed with git history.
    - Its `## Fix` section cites both code commits, the :172/:93-95/:101/:187 line evidence, every test with its RED and GREEN status, the F3 open observation, and NOT LIVE-VERIFIED with the owed G3 re-run and re-score.
    - 45-UAT.md is byte-unchanged since 165103156, and `pnpm planning-gates` passes.
    - One `docs(quick-261011-nqe): ...` commit.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> renderer IPC | Queue states cross from the Node sidecar to the webview by two independent paths: the `winetricksQueueChanged` event and the invoke reply. Both producers are first-party. The threat is ordering and availability, not hostile input. No new channel, endpoint or input is added. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261011-nqe-01 | Denial of service | index.tsx reply handling | medium | mitigate | A stale reply can strand the tab in flight with Apply disabled and no further push coming (planning_findings F5). Every state source goes through `takeQueueState`'s revision check (structural count gate: one `setQueueState(` site). Tests 2, 4 and 5 cover the stuck cases. |
| T-261011-nqe-02 | Denial of service | revision counter reset | low | accept | A reset would make every later state "older" and freeze the tab. The sidecar is spawned once per app lifetime (`src-tauri/src/main.rs:12393` is the single call, and a failed spawn exits), and a renderer reload resets `appliedRevision` to 0. The rationale is recorded in the counter's comment. |
| T-261011-nqe-03 | Repudiation | todo closure | low | mitigate | The closure cites both code commits, quotes the RED evidence and states NOT LIVE-VERIFIED. 45-UAT.md is pinned byte-unchanged, so no live result is claimed from desk work. |
| T-261011-nqe-04 | Tampering | Task 2 mutation proof | low | mitigate | The revert is by `cp` from a scratch copy with a shasum match, never `git checkout --`, so the uncommitted fix cannot be silently discarded. |
| T-261011-nqe-SC | Tampering | npm/pip/cargo installs | low | accept | This plan installs no packages, so the legitimacy gate has nothing to inspect. |
</threat_model>

<verification>
- Task 1 RED evidence: test 1 fails at the post-reply assertion on 165103156-equivalent code, showing `WinetricksRow--queued` or Cancel disabled, and passes after the change.
- Task 2 RED evidence: frontend tests 2, 4 and 5 and backend (i) fail on Task 1 code and pass after. The test 6 mutation fails with a count of 1.
- Final: Frontend 16 suites and Backend 5 suites pass. `pnpm codecheck`, scoped eslint and scoped prettier (after `--file-info`) are clean. The structural counts are 1 / 1 / 6. StickyBar, deriveRowState and 45-UAT.md are unchanged since 165103156.
- `pnpm planning-gates` passes after the todo move.
</verification>

<success_criteria>
- In every arrival order of the apply reply against the run's pushes, the in-flight verb renders Installing and Cancel remaining is enabled from the moment the tab knows the first verb started.
- No IPC reply (apply, cancel or remount) can set the tab back below a state it has already applied, so the stuck-in-flight and erased-failure variants cannot occur.
- The fix is unit-proven (RED then GREEN) and honestly labelled NOT LIVE-VERIFIED, with the G3 re-run and re-score recorded as owed.
</success_criteria>

<output>
Create `.planning/quick/261011-nqe-during-a-winetricks-run-the-first-verb-i/261011-nqe-SUMMARY.md` when done. It includes a "RED evidence" section quoting each RED test's failing expect and received value, the test 6 mutation result, the final suite and test counts, and both code-commit hashes.
</output>
