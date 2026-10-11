---
created: 2026-10-10T22:46:00.000Z
title: During a Winetricks run the first verb intermittently renders as Queued with Cancel remaining disabled until the verb boundary
area: winetricks
severity: major
platform: any
ready: code
found_by: "Phase 45 live gate 45-12 G3 (launch 2) and G1/G7 run frames (launches 1-2), 2026-10-10"
files:
  - src/backend/tools/winetricksQueue.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.tsx
---

## Observation

G3 (launch 2, run `physx`/`d3dcompiler_47`/`d3dx11_43`): the operator reports Cancel remaining was
greyed out for the whole of the first verb (`physx`, 14 s per the backend log) and only became
enabled at the verb boundary, so the pre-registered "press Cancel while the first verb is
Installing" could not be done. Window captures confirm the same in two other runs: launch 1
`burst-light-26.png` (bar `Installing 1 of 3`, Cancel greyed) and launch 2 `burst2-light-071..073.png`
(single-verb run: the in-flight row shows the disabled Queued checkbox, no spinner, no phase word,
for all three frames across the ~7 s run). In launch 4 (`burst6-119.png`) the first verb rendered
correctly (spinner, `Wird installiert…`, Cancel enabled), so the defect is intermittent.

## Candidate mechanism (code read, not unit-proven)

`winetricksQueue.apply()` takes `const state = getState(...)` BEFORE `pushState(run)` and before
`void runLoop(run)` sets `run.currentVerb` and pushes again; it returns that snapshot in the IPC
reply. `applyVerbs()` in the tab does `setQueueState(result.value.state)` on the reply. When the
reply lands after the live pushes, the tab regresses to `currentVerb: ''` and every outcome
`pending`; `StickyBar` then computes `cancelDisabled = run.currentVerb === ''` and
`deriveRowState` returns `queued` for the in-flight verb until the next push at the verb end.
Either return the post-push state from `apply()`, or have the tab ignore a reply state whose
`runId` it already holds with a later `currentVerb`. A unit test can race the two messages.

Evidence: `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log` ("G3 backend", "G7 light run-2
finding", "G3/G9 finding"), captures named above. Launch ordinals 1, 2 (reproduced), 4 (not).

## Fix (2026-10-11, quick 261011-nqe, commits aff474c69 6e1ea7ee4)

**Mechanism, confirmed by code read and unit test.** F1 holds, with a refinement unit tests can
show but a live run cannot: the backend's send order was never actually random. The original
`winetricksQueue.ts:172` took its reply snapshot before `pushState(run)` (push A, the pending
state) and before `void runLoop(run)` ran its synchronous prefix through to push B (`currentVerb
'vcrun2019'`, installing, `winetricksQueue.ts` :99-107, which complete before `runLoop`'s first
`await` at :113 -- calling an async function runs its body synchronously up to that point). So the
backend's three sends for a fresh run were always in the fixed order reply, A, B -- deterministic,
not a race, and backend test (i) pins exactly that fixed order today the other way round (reply
after both A and B). The intermittency the live gate saw is therefore squarely on the renderer
side: the reply travels back over the invoke's return channel while A and B travel over the
`winetricksQueueChanged` event channel, and neither IPC layer we use (Electron's early days, now
Tauri's `invoke`/`emit`) promises any delivery order between the two channels. That cross-channel
explanation is an inference from the code and was not itself measured -- no instrumentation timed
the two channels against each other in a live run.

**Fix.** Two changes, not one.
- (a) `winetricksQueue.ts` `apply()`: the reply snapshot (`getState()`, now at :208) moved to after
  `void runLoop(run).catch(...)` (:191), i.e. after the backend has already sent A and B for this
  run. The reply can therefore never be older, by backend send order, than a push already sent for
  it.
- (b) a `revision: number` field on `WinetricksQueueState`, stamped by a module-level counter
  inside `getState()`, plus a `takeQueueState()` guard in `index.tsx` that every state source --
  mount read, push, apply reply, cancel reply -- now goes through, refusing to regress below an
  already-applied revision.

(a) alone is not enough: it only fixes backend SEND order, not renderer ARRIVAL order. A reply that
was sent after B can still be *read* by the renderer after the run has moved on further still --
finished, even failed -- if the invoke channel is slow enough (test 2 / F5, "the run finishes
before its reply"). Without (b), that late-arriving-but-send-order-correct reply would still
stomp the renderer's state back to the pre-run snapshot, reproducing the exact "stuck in flight"
symptom this todo reports, just with a narrower window. (b) is what actually closes the renderer
race; (a) only narrows how stale a reply can be when (b) is absent or bypassed.

The revision sits on the outer `WinetricksQueueState` snapshot, not on `WinetricksQueueRun`,
because `getState()` is the one place that already returns a fresh, immutable copy on every call
(the function's own pre-existing "copy, not the live object" comment) -- every message a game's
tab receives, including the no-run environment-change pushes that `WinetricksQueueRun` cannot
represent at all, is one of these snapshots. A run-scoped counter could not order those, and would
have to be rewritten on every one of the run's in-place mutations across its lifetime instead of
stamped once per snapshot.

**Sites closed beyond the reported one.** The reported symptom was the apply reply specifically;
the same guard now also covers the cancel reply (`cancelRemaining`'s `result.value`, test 4), the
tab's own remount read (the mount effect's `stateResult.value`, test 5), and the D-15 failure-clear
in `applyVerbs`: that clear used to apply blindly on an accepted reply, so a late reply could erase
a failure flag the run's own newer pushes had already set. It now folds `latestRun.current`'s
outcomes back over the clear before applying it, so a fresher failure re-asserts itself (test 2 /
F5).

**What is unit-proven.** All of the following are in
`src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx`
and `src/backend/tools/__tests__/winetricksQueue.test.ts`, 15 WinetricksSettings-plus-guard
suites / 239 tests (Frontend) and 5 suites / 222 tests (Backend), all passing after both commits:
- Test 1 (Task 1, G3 race): RED on pre-fix code at `findByClass(afterReply,
  'WinetricksRow--installing')` -- `Expected length: 1, Received length: 0, Received array: []`,
  with the pre-reply anchor assertion passing first (proving the regression is attributable to the
  reply, not the setup). GREEN after (a)+(b).
- Test 3 (Task 1, control: a fresh reply IS applied): green throughout, unaffected by the fix.
- Test 2 / F5 (Task 2): RED on Task-1-only code at `findByClass(tree,
  'WinetricksRow--errored')` -- `Expected length: 1, Received length: 0, Received array: []`
  (the stale-but-unguarded accepted reply let `clearVerbError` erase the flag). GREEN after the
  D-15 fold.
- Test 4 (Task 2, stale cancel reply): RED on Task-1-only code at `findByClass(tree,
  'WinetricksStickyBar--done')` -- `Expected length: 1, Received length: 0, Received array: []`
  (the unguarded cancel reply set the tab back to running). GREEN after routing it through
  `takeQueueState`.
- Test 5 (Task 2, stale remount read): RED on Task-1-only code at `findByClass(tree,
  'WinetricksStickyBar--inFlight')` -- `Expected length: 1, Received length: 0, Received array: []`
  (the unguarded mount read returned the tab to rest with no run). GREEN after routing it through
  `takeQueueState`.
- Test 6 (Task 2, dropped stale done push still reloads once): green on Task-1-only code already,
  and stays green after Task 2. Its mutation proof did NOT reproduce the plan's predicted failure:
  reverting the reload check's source from `latestRun.current` back to the incoming push's own
  `state.run` and re-running left test 6 still passing (6/6 green, exact-2-calls assertion
  unchanged), because in this test's specific scenario the dropped push's own content and the
  already-applied run are the same `runId` and `'done'` status, so the two sources agree here. The
  mutation was still performed, restored by `cp` from a scratch copy, and the shasum
  (`61869d2b8932b68f0d55d4fdbeb06ad65feb02dc`) confirmed matching afterward -- but it does not
  discriminate this guard the way the plan expected, and no other test in the file isolates the
  `latestRun.current`-vs-`state.run` choice in `onQueueChanged` either. That choice is
  unit-unproven as a result; it is correct by code read (see "Sites closed" above: the push being
  dropped means `state.run` is exactly the content the guard just rejected), not by a red mutation.
- Backend test (i) (Task 2, apply reply's place in the push order): RED on Task-1-only code at
  `result.state.run?.currentVerb` -- `Expected: "xact", Received: ""`. GREEN after moving the
  snapshot per fix (a).
- Backend tests (ii) (cancel reply newer than its push) and (iii) (two games' `getState` calls
  strictly increasing): pins, green on Task-1-only code as the plan predicted, and still green
  after Task 2.

**Open observation (F3).** The stale reply also regressed `latestRun.current`, which gates
`onProgress` (progress lines and percent are only applied for the game's current run). While a
stale reply held, the first verb's own progress lines and percent were dropped for the window the
reply was in effect. This may bear on 45-UAT.md item 12 ("Early lines between apply-accepted and
run registration"), which is currently `blocked`, not scored. Not measured here; no claim is made
about whether this fix changes that item's outcome.

**NOT LIVE-VERIFIED.** All of the above is unit-level evidence only. A live re-run of 45-12 G3 is
owed: press Cancel remaining during the first verb of a fresh three-verb run and confirm Cancel is
enabled and the row shows Installing (spinner, phase word) throughout, not Queued. 45-UAT.md item
3 (G3) currently reads `result: issue`; its re-score is owed to that re-run and is deliberately NOT
written here. Also owed: the G1/G7 run-frame recheck -- confirming the first verb shows a spinner
and a phase word in every launch ordinal, not only launch 4 as last observed.
