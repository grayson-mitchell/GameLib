---
phase: quick-261108-eps
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/knip-baseline.txt
  - src/backend/engine/engineDecision.ts
  - src/backend/engine/engineNoticeStore.ts
  - src/backend/engine/gameKey.ts
  - src/backend/engine/launchEngine.ts
  - src/backend/engine/perGameBottle.ts
  - src/backend/engine/testedCrossoverVersions.ts
  - src/backend/engine/engineTypes.ts
  - src/backend/engine/runTool.ts
  - src/preload/api/engine.ts
  - meta/genIpcContract.ts
  - src/backend/sidecar/ipcValidation.ts
  - src/backend/testUtils/ipcDomainParse.ts
  - src/backend/testUtils/ipcSchemaFixtures.ts
  - src/common/types/ipc/channelSchemas.ts
  - src/frontend/bootErrorSurface.ts
  - src/common/types.ts
  - src/common/types/engine.ts
autonomous: true
requirements: [QUICK-261108-eps]

must_haves:
  truths:
    - "The exact `.husky/pre-push` line 2 chain (codecheck && lint && prettier && i18n --fail-on-update && find-deadcode && boundaries && steam-line-ceiling) exits 0 on main"
    - "meta/knip-baseline.txt only shrinks: the 10 stale lines are deleted and no line is added unless it is a genuine relocation of a line deleted in the same commit (same symbol or a renamed symbol from the moved module)"
    - "No ceiling raised, no knip.jsonc ignore/entry widened, no eslint-disable added, no ratchet script edited"
    - "Every `@public` tag added carries a written reason naming the consumer knip cannot see"
    - "No production behaviour change; the `*/ipc_handler.ts` modules are untouched (Phase 72 D-11 scope)"
  artifacts:
    - path: "meta/knip-baseline.txt"
      provides: "baseline with the 10 stale steam/engine + preload Steam.* lines removed, still sorted"
  key_links:
    - from: ".husky/pre-push"
      to: "meta/knipRatchet.cjs + meta/knip-baseline.txt"
      via: "pnpm find-deadcode"
      pattern: "pnpm find-deadcode && pnpm boundaries && pnpm steam-line-ceiling"
---

<objective>
Make the pre-push gate green on main (~600 commits ahead of origin) so the orchestrator can push.
The only failing step is `pnpm find-deadcode`: 31 new knip findings plus 10 stale baseline lines,
listed in full in `knip-findings-at-start.txt` in this directory. Resolve every one at source, the
way quick 261101-h8l did, then run the whole line-2 chain to exit 0.

Output: two fix commits on main. Do NOT push; the orchestrator pushes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.husky/pre-push
@.planning/quick/261108-eps-make-the-pre-push-gate-pass-so-main-can-/knip-findings-at-start.txt
@.planning/quick/261101-h8l-make-the-pre-push-gate-pass-so-main-can-/261101-h8l-SUMMARY.md
@knip.jsonc
@meta/knipRatchet.cjs

Load Skill("gamelib-conventions"), section "A formatter check belongs in every task's `<verify>`".

Measured facts (planner, 2026-11-08, HEAD 7023bdcd5):
- `pnpm boundaries` passes (1121 modules, no violations) and `pnpm steam-line-ceiling` passes
  (170 files, 0 allowlisted over 1000). They still run in Task 3; re-fix only if your edits break them.
- `meta/knip-baseline.txt` header rules: one `<type>\t<path>\t<symbol>` per line, sorted; delete
  lines in the commit that removes the dead code; never add a line to pass a new finding — use a
  JSDoc `@public` tag with a reason instead. `npx prettier --file-info meta/knip-baseline.txt`
  reports `{ "ignored": false, "inferredParser": null }` — no parser, so `prettier --check` on it
  errors instead of checking; it is left out of every prettier check below for that reason.
- `@public` precedent (copy this form, a one-line JSDoc directly above the export):
  src/backend/storeManagers/steam/stores.ts:42 `/** @public consumed only through the lazy
  require('./stores') in macSteamAdoption.ts defaultStore(), which knip cannot trace; ... */` and
  src/frontend/state/GlobalState.tsx:295 (test-consumer reason).
- Grep of src/ and meta/ (*.ts, *.tsx) per symbol — files containing the word:
  - Only in their own file: buildContract, pascal, rendererChannelNames, snake (meta/genIpcContract.ts);
    describeEngineKey (gameKey.ts); testedCrossoverBuilds; sanitiseChannel; DETECT_ORDER;
    mergeChannelEntries; EngineReason; RunnerTool; EngineKind; RunWineCommandArgs, SaveSyncArgs,
    ToolArgs (common/types.ts:868/875/911).
  - `Tools` (common/types.ts:808): the word also appears in frontend Settings files and two tests, but
    likely as a component/section name — confirm with `grep -rn "Tools" ... | grep import` whether any
    file imports the type from common/types before deleting.
  - `TRANSPORT` and `Fixtures`: the word appears elsewhere but as unrelated local identifiers; knip says
    the export from ipcDomainParse.ts / ipcSchemaFixtures.ts is unused.
  - defaultEngineDecisionDeps: consumed by engineConfig.ts:41 through a lazy
    `(require('./engineDecision') as typeof import(...)).defaultEngineDecisionDeps()` — knip cannot
    trace it. Same for engineNoticeStore via engineState.ts:117-118.
  - getLaunchSettings: launchEngine.ts:581 is a pure re-export `export { getLaunchSettings } from
    './launchSettings'`; all consumers appear to import from launchSettings.
  - CROSSOVER_CREATE_FAILED / CROSSOVER_CREATE_TIMEOUT / PROVISION_ABORTED: used across
    storeManagers/steam/*, so perGameBottle.ts likely re-exports or duplicates a definition consumers
    import from elsewhere (PROVISION_ABORTED also in engine/bottlePrimitives.ts).
  - classifyBootError: only other user is src/frontend/__tests__/bootErrorSurface.test.ts.
  - src/preload/api/engine.ts: all six exports (getEngineState, listEngineOptions, getDefaultEngine,
    getPerGameBottleName, dismissEngineNotice, handleEngineStateChanged) are flagged as
    `Engine.<name>` members. The renderer reaches them via `window.api.<name>` (e.g.
    GlobalState.tsx:1693, EngineOverride.tsx:235), which knip cannot trace — the same false-positive
    class as the ~200 baselined `src/preload/api/*` members. c84e0a57c (61-13) moved four of them
    here from preload/api/steam.ts (renamed from `*SteamEngine*`); those four steam.ts lines are among
    the 10 stale baseline lines.
- The 10 stale baseline lines are exactly the "baseline line no longer found" entries in
  knip-findings-at-start.txt (baseline lines 46, 47, 60, 272, 274, 284, 291, 376, 377 plus
  `types src/backend/storeManagers/steam/bridge/drm/runnerClone.ts RunnerTool`).
- Known pre-existing jest failures on baseline (not a push gate, do not fix, list in SUMMARY):
  tauriShellSource, macArchKnownFixRouting, genI18nGateScope, logSecretGate, x86CallbackWineHarness.
- Unrelated dirty/untracked files are in the tree (.planning/spikes/*, a completed todo, worktrees,
  a .dxvk-cache). Never stage them: `git add` explicit paths only.

Triage rule for each finding (in this order, first match wins):
1. Referenced nowhere, including its own file -> delete the declaration (and any now-unused import).
2. Referenced only inside its own file -> drop the `export` keyword.
3. A pure re-export/duplicate whose consumers import from the canonical module -> delete the
   re-export (verify with grep that no file imports that name from the re-exporting module).
4. Has a real consumer knip cannot see (lazy require, window.api bridge, a test that reads source
   text, a test-only seam) -> one-line `/** @public <reason naming the consumer and why knip cannot
   see it> */` above the export.
5. Only if `@public` demonstrably does not suppress a finding (try it first, re-run find-deadcode):
   relocate the matching stale baseline line to the new path/name in the same commit. Allowed only for
   a finding whose stale line is among the 10 being deleted (a moved or renamed symbol). Anything else
   that still fails after 1-4: stop and report it in the SUMMARY rather than add a baseline line.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Resolve the engine-move findings and drop the 10 stale baseline lines</name>
  <files>meta/knip-baseline.txt, src/backend/engine/engineDecision.ts, src/backend/engine/engineNoticeStore.ts, src/backend/engine/gameKey.ts, src/backend/engine/launchEngine.ts, src/backend/engine/perGameBottle.ts, src/backend/engine/testedCrossoverVersions.ts, src/backend/engine/engineTypes.ts, src/backend/engine/runTool.ts, src/preload/api/engine.ts</files>
  <action>
Delete the 10 stale lines from meta/knip-baseline.txt (keep the file sorted, change nothing else).

Then clear every new finding under src/backend/engine/ and src/preload/api/engine.ts using the
triage rule in context:
- defaultEngineDecisionDeps (engineDecision.ts), engineNoticeStore (engineNoticeStore.ts): rule 4,
  reason names the lazy require in engineConfig.ts / engineState.ts.
- getLaunchSettings (launchEngine.ts:581): rule 3 — confirm no file imports getLaunchSettings from
  './launchEngine' or 'backend/engine/launchEngine' (check jest.mock paths too), then delete the
  re-export line; if the module doc comment at line 10 still reads correctly, leave it.
- CROSSOVER_CREATE_FAILED, CROSSOVER_CREATE_TIMEOUT, PROVISION_ABORTED (perGameBottle.ts): find where
  each consumer imports them from. If perGameBottle.ts only re-exports, delete the re-export (rule 3);
  if it defines them and uses them internally, drop `export` (rule 2). Do not change error string
  values.
- describeEngineKey, testedCrossoverBuilds, EngineReason, RunnerTool: rule 1 or 2 per what the file
  shows.
- preload/api/engine.ts six members: rule 4 on each export, reason along the lines of "reached only as
  window.api.<name> through the preload api bundle, which knip cannot trace". Re-run
  `pnpm find-deadcode` and confirm the six `Engine.*` findings are gone; if they persist, apply rule 5
  for the four renamed members (relocate their deleted steam.ts lines to
  `exports	src/preload/api/engine.ts	Engine.<newName>`, sorted) and report the outcome for
  getDefaultEngine and getPerGameBottleName in the SUMMARY.

Commit: `fix(quick-261108-eps): resolve knip findings from the engine module move` staging only the
files in this task.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && ! (pnpm find-deadcode 2>&1 | grep FAIL | grep -E 'src/backend/engine/|src/preload/api/(engine|steam)\.ts|storeManagers/steam/(engine/|stores\.ts|bridge/drm/runnerClone)') && npx jest --findRelatedTests src/backend/engine/engineDecision.ts src/backend/engine/engineNoticeStore.ts src/backend/engine/gameKey.ts src/backend/engine/launchEngine.ts src/backend/engine/perGameBottle.ts src/backend/engine/testedCrossoverVersions.ts src/backend/engine/runTool.ts src/preload/api/engine.ts && npx prettier --check src/backend/engine/engineDecision.ts src/backend/engine/engineNoticeStore.ts src/backend/engine/gameKey.ts src/backend/engine/launchEngine.ts src/backend/engine/perGameBottle.ts src/backend/engine/testedCrossoverVersions.ts src/backend/engine/engineTypes.ts src/backend/engine/runTool.ts src/preload/api/engine.ts</automated>
  </verify>
  <done>No find-deadcode FAIL line mentions src/backend/engine/, preload/api/engine.ts or the old steam/engine paths; the 10 stale lines are gone; codecheck passes; related jest suites pass apart from the five known baseline failures; prettier clean over exactly the edited source files (drop any untouched file from the prettier and jest lists; meta/knip-baseline.txt omitted because prettier infers no parser for it).</done>
</task>

<task type="auto">
  <name>Task 2: Resolve the Phase 67 IPC exports and the orphaned common types</name>
  <files>meta/genIpcContract.ts, src/backend/sidecar/ipcValidation.ts, src/backend/testUtils/ipcDomainParse.ts, src/backend/testUtils/ipcSchemaFixtures.ts, src/common/types/ipc/channelSchemas.ts, src/frontend/bootErrorSurface.ts, src/common/types.ts, src/common/types/engine.ts</files>
  <action>
Apply the triage rule to the remaining 13 findings:
- meta/genIpcContract.ts buildContract, pascal, rendererChannelNames, snake; ipcValidation.ts
  sanitiseChannel; ipcDomainParse.ts DETECT_ORDER, TRANSPORT; ipcSchemaFixtures.ts Fixtures;
  channelSchemas.ts mergeChannelEntries: grep says each is used only in its own file, so rule 2
  (drop `export`). Before dropping, check whether any test reads that file's source text or imports
  the name via a dynamic path (grep the symbol across meta/__tests__ and src/**/__tests__ including
  string literals); if one does, use rule 4 with that test named.
- bootErrorSurface.ts classifyBootError: its only other user is bootErrorSurface.test.ts. Rule 4 with
  the reason naming that test as the consumer (knip in this config does not count it). Do not
  restructure the module.
- common/types.ts RunWineCommandArgs, SaveSyncArgs, ToolArgs, Tools and common/types/engine.ts
  EngineKind: rule 1 if truly unreferenced (for Tools, confirm no file imports the type — the bare word
  in Settings files is a different identifier). Use `git log -S'<Name>' --oneline -3 -- src` to note in
  the SUMMARY which change orphaned each. If any is referenced only by a `*/ipc_handler.ts` module,
  deleting the type is still fine only if codecheck passes; do NOT edit or delete any ipc_handler.ts
  module (Phase 72 D-11 owns that). If deleting a type would require touching an ipc_handler.ts, keep
  the type with a rule-4 `@public` reason "consumed by <file>, deleted in Phase 72 D-11" instead.

Commit: `fix(quick-261108-eps): resolve knip findings from phase 67 IPC work and orphaned common types`
staging only the files in this task.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm find-deadcode && npx jest --findRelatedTests meta/genIpcContract.ts src/backend/sidecar/ipcValidation.ts src/backend/testUtils/ipcDomainParse.ts src/backend/testUtils/ipcSchemaFixtures.ts src/common/types/ipc/channelSchemas.ts src/frontend/bootErrorSurface.ts && npx prettier --check meta/genIpcContract.ts src/backend/sidecar/ipcValidation.ts src/backend/testUtils/ipcDomainParse.ts src/backend/testUtils/ipcSchemaFixtures.ts src/common/types/ipc/channelSchemas.ts src/frontend/bootErrorSurface.ts src/common/types.ts src/common/types/engine.ts</automated>
  </verify>
  <done>`pnpm find-deadcode` exits 0 with no FAIL lines; codecheck passes; related jest suites pass apart from the five known baseline failures (common/types.ts and types/engine.ts are left out of findRelatedTests because they fan out to most of the suite and the edit is type-only, covered by codecheck); prettier clean over exactly the edited files; no ipc_handler.ts module in the diff.</done>
</task>

<task type="auto">
  <name>Task 3: Run the full pre-push line-2 chain to exit 0</name>
  <files>(none unless a later step fails)</files>
  <action>Run the exact `.husky/pre-push` line 2 chain from the repo root. If any step fails (boundaries and steam-line-ceiling passed before this work but could be tripped by an edit), fix at source under the same rules — never raise a ceiling, widen knip.jsonc, add a baseline line outside rule 5, add an eslint-disable, or use `--no-verify` — and commit the fix as `fix(quick-261108-eps): ...` with explicit paths, then re-run the whole chain. Confirm `git diff --quiet HEAD -- knip.jsonc meta/knipRatchet.cjs meta/steamLineCeiling.cjs .dependency-cruiser.cjs eslint.config.mjs meta/lintScoped.cjs` and that `git diff origin/main..HEAD -- meta/knip-baseline.txt` from this task's commits only removes lines (plus any rule-5 relocations, each listed in the SUMMARY). Confirm `git status --short` shows only the pre-existing unrelated files. Do NOT push.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode && pnpm boundaries && pnpm steam-line-ceiling; echo "exit=$?"; git diff --quiet HEAD -- knip.jsonc meta/knipRatchet.cjs meta/steamLineCeiling.cjs .dependency-cruiser.cjs eslint.config.mjs meta/lintScoped.cjs && echo gates-untouched</automated>
  </verify>
  <done>Chain prints exit=0 and gates-untouched; git log shows the Task 1 and Task 2 commits (plus any Task 3 fix commit) on main; SUMMARY records each of the 41 findings with the rule applied, every `@public` reason, any rule-5 relocation, the five known jest failures, and that nothing was pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Dead-code hygiene only; no input handling, IPC payload, or network surface changes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-eps-01 | Tampering | quality gates (knip baseline, knip.jsonc, ratchet, ceilings) | mitigate | Task 3 asserts gate configs unchanged via `git diff --quiet`; baseline may only shrink except rule-5 relocations listed in SUMMARY |
| T-eps-02 | Tampering | IPC validation (ipcValidation.ts sanitiseChannel) | mitigate | Only the `export` keyword may change; function body and call sites untouched; related jest suites must pass |
| T-eps-03 | Repudiation | `@public` used to hide real dead code | mitigate | Every tag must name a concrete consumer knip cannot see; SUMMARY lists each |
</threat_model>

<verification>
`.husky/pre-push` line 2 chain exits 0; touched-module jest suites pass (bar the five known failures); gate configs untouched; baseline only shrinks.
</verification>

<success_criteria>
main passes the pre-push gate and is ready for the orchestrator to push.
</success_criteria>

<output>
Create `.planning/quick/261108-eps-make-the-pre-push-gate-pass-so-main-can-/261108-eps-SUMMARY.md` when done
</output>
