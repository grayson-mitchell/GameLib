---
phase: quick-261108-mcc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/engine/__tests__/launchEngine.deadline.test.ts
  - src/backend/engine/__tests__/engineState.test.ts
  - .planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md
autonomous: true
requirements: [61-REVIEW-WR-01, 61-REVIEW-IN-01, 61-REVIEW-IN-02]

must_haves:
  truths:
    - "The CR-03 deadline test asserts only things the deadline path can reach. A broken implementation that stopped the armed game, killed the bottle wineserver or removed a neighbour from the ledger would fail it."
    - "A test pins the intended IN-02 behaviour (D-05 / 261107-v6q: no toast, notice or badge on an inconclusive pre-flight). The case is an inconclusive pre-flight, no cached pre-flight and a kept built-in pinned selection with reason cx-inconclusive. The published EngineState has engine null, so the badge is blank, and launchNotice null."
    - "No production code changes: engineState.ts, common/types/engine.ts, EngineBadge, locales and the i18n baseline are untouched."
    - "61-REVIEW.md frontmatter reads status: clean with zero open findings. WR-01, IN-01 and IN-02 are each marked resolved with a commit, and the original findings text is kept."
  artifacts:
    - path: "src/backend/engine/__tests__/launchEngine.deadline.test.ts"
      provides: "CR-03 test with reachable assertions only"
    - path: "src/backend/engine/__tests__/engineState.test.ts"
      provides: "IN-02 pin: inconclusive + no cache + kept built-in → engine null, launchNotice null"
      contains: "v6q"
    - path: ".planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md"
      provides: "Resolution record"
      contains: "status: clean"
  key_links:
    - from: "engineState.test.ts IN-02 pin"
      to: "recordLaunchDecision → compute()"
      via: "setEngineStatePublisher capture of the published state"
      pattern: "cx-inconclusive"
---

<objective>
Close the three Phase 61 re-review findings so that 61-REVIEW.md can honestly say `status: clean`.

- WR-01 is already fixed by quick 261107-v6q in commit `88c8296b7`. It only needs recording.
- IN-01: the CR-03 deadline test has a vacuous neighbour assertion. Fix it.
- IN-02: the user chose to keep the badge blank, per D-05 and 261107-v6q's rule of no toast, notice or badge on an inconclusive pre-flight. This is the reviewer's second fix option: pin the intended behaviour with a test and change no production code.

Purpose: the review becomes a true record with no open findings.
Output: a strengthened deadline test, an IN-02 pinning test and an updated REVIEW.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md
@src/backend/engine/__tests__/launchEngine.deadline.test.ts

Load Skill("gamelib-conventions") before writing `<verify>` evidence, because the `<verify>` formatter rule applies. All three paths in this plan were checked with `npx prettier --file-info`: none is prettier-ignored, and all currently pass `--check`.

<interfaces>
These facts were found during planning. The executor does not need to rediscover them.

bottleLedger.ts (keys only, no Game objects):
  markGameRunning(bottleName: string, key: EngineKey): boolean
  markGameStopped(bottleName: string, key: EngineKey): void
  gamesRunningIn(bottleName: string): EngineKey[]

launchEngine.ts onEngineLaunchDeadline(game, key, armedSelection, d): it only ever holds the ONE `game` passed to armEngineLaunchDeadline. It calls stopDeadlineWatcher, d.showNotice and d.publishNotice. It has no route to any other Game object.

engineState.ts recordLaunchDecision (~line 321), current behaviour being pinned:
  inconclusive = decision.preflight?.kind === 'broken' && decision.preflight.inconclusive === true
  preflight = (inconclusive ? null : decision.preflight) ?? cachedPreflight(bottleName, now())
  launchNotice excludes sel.reason 'cx-inconclusive' → null
  compute(): with override 'automatic' and preflight null, no branch sets engine → engine null, reason null

engineState.test.ts helpers, inside describe('recordLaunchDecision and publisher') (~line 474):
  mk(preflight, over) → { deps, store, probe }
  fallback(reason, override = 'automatic') → LaunchDecision with a pinned selection (label 'Built-in', preflight null)
  setEngineStatePublisher(pub); recordLaunchDecision('1', d, 'GameLibSteamBridge-1', deps)
  The neighbouring tests 'WR-01: inconclusive pinned decision publishes no launchNotice' (~563) and 'WR-01: inconclusive preflight never publishes a cx-broken badge' (~575) show the exact shape to copy. The latter spreads `...d, preflight: { kind: 'broken', binDir: '/cx/bin', build: TESTED, detail: 'timeout', inconclusive: true }`.
  beforeEach calls __resetEngineStateForTests(), so no cached pre-flight exists unless a test seeds one.

Typecheck script: `pnpm codecheck` (tsc --noEmit for the app plus tsconfig.meta.json).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: IN-01 — make the CR-03 deadline test assert only reachable things</name>
  <files>src/backend/engine/__tests__/launchEngine.deadline.test.ts</files>
  <action>
In the test "CR-03: a deadline in a busy shared bottle never touches the neighbour" (~lines 230-250), the `other` fixture cannot be registered with anything. The ledger stores EngineKey strings only, and onEngineLaunchDeadline holds only the single Game passed to armEngineLaunchDeadline. So `other.stop` is unreachable by construction, and no ledger registration can make that assertion able to fail. Take the reviewer's alternative: delete the fixture and make the remaining assertions meaningful.

Concretely:
- Remove `const other = makeGame()` and `expect(other.stop).not.toHaveBeenCalled()`.
- Bind the armed game: `const game = makeGame()`, pass it to armEngineLaunchDeadline, and assert `game.stop` not called. Before CR-02 this was a real kill path, so the assertion is reachable.
- Register the launching key as running too: `markGameRunning('GameLib', KEY)` alongside the existing `markGameRunning('GameLib', 'gog:A')`. Replace `toContain('gog:A')` with an exact, order-independent check that the bottle still holds both keys. Sort and compare `gamesRunningIn('GameLib')` to `['gog:A', KEY]` sorted.
- Add `expect(d.publishNotice).toHaveBeenCalledTimes(1)` as a positive check that the deadline actually fired in this test. Without it, the "nothing was touched" assertions could pass vacuously because the deadline never ran. It should fire at 180 s with no watcher match, as in the expiry test above. If it does not, find out why (for example the selection or overlay setup) and fix the setup. Do not drop the check.
- Keep the existing killBottleWineServerWith, showEngineDialog and raiseMainWindow assertions.
- Update the closing comment to say what is now proven.

Meaningfulness check: reason about this and record it in the SUMMARY. Do not commit a broken implementation. If onEngineLaunchDeadline called `game.stop()`, `killBottleWineServerWith(...)`, `markGameStopped('GameLib', 'gog:A')` or cleared the bottle's ledger entry, one of the assertions would fail. The publishNotice assertion fails if the deadline never fires. Optionally prove this locally by temporarily adding `void game.stop()` in onEngineLaunchDeadline, watching the test fail, and reverting. `launchEngine.ts` must have no diff at commit time.

Commit: `test(quick-261108-mcc): IN-01 make CR-03 deadline neighbour assertions reachable`.
  </action>
  <verify>
    <automated>npx jest src/backend/engine/__tests__/launchEngine.deadline.test.ts && test -z "$(git diff --name-only src/backend/engine/launchEngine.ts)" && ! grep -n "other.stop\|const other" src/backend/engine/__tests__/launchEngine.deadline.test.ts && pnpm codecheck && npx prettier --check src/backend/engine/__tests__/launchEngine.deadline.test.ts</automated>
  </verify>
  <done>The `other` fixture is gone. The CR-03 test asserts that the armed game's stop is not called, that both ledger keys remain, that no wineserver kill happens and that publishNotice is called once. The suite and codecheck pass, launchEngine.ts is unchanged, and prettier passes on the file.</done>
</task>

<task type="auto">
  <name>Task 2: IN-02 — pin the blank badge (D-05 / v6q), then mark 61-REVIEW clean</name>
  <files>src/backend/engine/__tests__/engineState.test.ts, .planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md</files>
  <action>
Part A (test only, per the user's decision to honour D-05 and 261107-v6q's rule of no toast, notice or badge on an inconclusive pre-flight).

In engineState.test.ts, inside describe('recordLaunchDecision and publisher'), add one test next to the existing WR-01 tests. Name it so it cites the rule, for example: "IN-02 (D-05 / 261107-v6q): kept built-in engine under an inconclusive pre-flight with no cache shows no badge and no launchNotice". Add a one-line comment: the blank badge is intended; an inconclusive probe never yields a toast, notice or badge.

Setup:
- `mk(healthy(null))`. Do NOT call getSteamEngineState first, so no pre-flight is cached; beforeEach resets state.
- Set a publisher.
- Build `d = fallback('cx-inconclusive')`. It is a pinned selection, override 'automatic'. Narrow it with `if (d.kind !== 'use') throw ...` as the neighbouring test does.
- Call recordLaunchDecision with `{ ...d, preflight: <inconclusive broken probe> }` on 'GameLibSteamBridge-1'.

Assert on the single published state (`pub.mock.calls[0][0]`):
- `engine` is null, so the badge is blank;
- `reason` is null;
- `launchNotice` is null.

Also assert `pub` was called exactly once.

This passes against the current code with no production change. Confirm that by running it. If it fails, stop and report: it would mean the current behaviour differs from the review's description. Do not change production code to make it pass. Make no change to engineState.ts, common/types/engine.ts, EngineBadge, locales or the i18n baseline.

Commit: `test(quick-261108-mcc): IN-02 pin blank badge for kept built-in engine under inconclusive pre-flight (D-05, v6q)`.

Part B (docs, a separate commit after Part A). Update 61-REVIEW.md:
- Frontmatter: `status: clean`. Set findings to critical: 0, warning: 0, info: 0, total: 0, and add `resolved: 3` and a `resolved_by` list:
  - WR-01 → 88c8296b7 (quick 261107-v6q)
  - IN-01 → the Task 1 hash
  - IN-02 → the Part A hash
  Take the hashes from `git log --oneline -3`. Do not guess them.
- Change the body `**Status:** issues_found` to clean, adding "(all findings resolved, see Resolution)".
- Keep the WR-01, IN-01 and IN-02 sections verbatim as the record. Append a `**Resolved:**` line under each, naming the commit.
- Add a short `## Resolution` section before the footer with one line per finding:
  - WR-01: fixed by quick 261107-v6q in 88c8296b7. A wine-manager or retired-pin marker keeps its recorded engine; an unresolvable one takes CrossOver, never pins.current.
  - IN-01: the vacuous `other` fixture was removed rather than registered, because the ledger holds keys only and has no route to a Game. The armed game's stop, both ledger keys, no kill and a fired-deadline (publishNotice) assertion now carry the contract.
  - IN-02: resolved by the reviewer's second option. The blank badge is intended per D-05 / 261107-v6q (no toast, notice or badge on an inconclusive pre-flight) and is now pinned by a test. No production change.
  - A dated line: "Resolved 2026-11-08 by quick 261108-mcc".
- Commit: `docs(quick-261108-mcc): mark 61-REVIEW clean — WR-01, IN-01, IN-02 resolved`.
  </action>
  <verify>
    <automated>npx jest src/backend/engine/__tests__/engineState.test.ts src/backend/engine/__tests__/launchEngine.deadline.test.ts && pnpm codecheck && test -z "$(git diff --name-only HEAD~2 -- src/backend/engine/engineState.ts src/common/types/engine.ts src/frontend public/locales meta)" && grep -q 'v6q' src/backend/engine/__tests__/engineState.test.ts && grep -q '^status: clean' .planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md && grep -q '88c8296b7' .planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md && grep -q '^## Resolution' .planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md && npx prettier --check src/backend/engine/__tests__/engineState.test.ts .planning/phases/61-unified-macos-engine-for-all-stores/61-REVIEW.md</automated>
  </verify>
  <done>The IN-02 test passes on unchanged production code and asserts engine null, reason null and launchNotice null, citing D-05 / v6q. 61-REVIEW.md reads status: clean with zero open findings, lists all three resolutions with real hashes and keeps the original findings text. Both written paths pass prettier.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Test and docs changes only. No production code or payload changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-q261108-01 | Spoofing (misleading UI) | EngineState badge on inconclusive probe | mitigate | The Task 2 test pins engine null and launchNotice null, so a future change cannot quietly show a fallback badge or toast on an inconclusive probe (D-05 / v6q). |
</threat_model>

<verification>
- `npx jest src/backend/engine/__tests__/engineState.test.ts src/backend/engine/__tests__/launchEngine.deadline.test.ts`
- `pnpm codecheck`
- Scoped `npx prettier --check` over the three paths in files_modified
- No diff in src/backend/engine/engineState.ts, src/common/types/engine.ts, src/frontend, public/locales or meta
</verification>

<success_criteria>
- IN-01: there is no vacuous assertion in the CR-03 test, and every remaining assertion is reachable by the deadline path.
- IN-02: the blank-badge behaviour is pinned by a test citing D-05 / v6q, with no production change.
- 61-REVIEW.md reads `status: clean`, with all three findings resolved and cited.
</success_criteria>

<output>
Create `.planning/quick/261108-mcc-close-phase-61-review-leftovers/261108-mcc-SUMMARY.md` when done.
</output>
