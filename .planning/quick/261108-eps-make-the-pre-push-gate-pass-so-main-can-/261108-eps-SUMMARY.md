# Quick 261108-eps Summary

Pre-push gate green on main: the exact `.husky/pre-push` line-2 chain (codecheck, lint, prettier, i18n --fail-on-update, find-deadcode, boundaries, steam-line-ceiling) exits **0**. Nothing pushed.

Commits (HEAD was ef5d9303d):
- bf4c6b0ee fix(quick-261108-eps): resolve knip findings from the engine module move
- 9509a10c9 fix(quick-261108-eps): resolve knip findings from phase 67 IPC work and orphaned common types

Live `pnpm find-deadcode` at start matched the saved snapshot (31 new + 10 stale). `meta/knip-baseline.txt` only shrank (10 lines deleted, none added, no rule-5 relocation needed). `knip.jsonc`, `meta/knipRatchet.cjs`, `meta/steamLineCeiling.cjs`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `meta/lintScoped.cjs` untouched. No ceiling raised, no eslint-disable, no ipc_handler.ts touched.

## Dispositions

Stale baseline lines (10): deleted defaultEngineDecisionDeps, testedCrossoverBuilds, steamEngineNoticeStore, four preload `Steam.*EngineState/Options/Notice/StateChanged`, runnerClone RunnerTool, engineDecision WineManagerRelease, engineTypes EngineReason.

New findings:
- engineDecision.ts defaultEngineDecisionDeps: rule 4 `@public` (lazy require in engineConfig.ts).
- engineNoticeStore.ts engineNoticeStore: rule 4 `@public` (lazy require in engineState.ts).
- gameKey.ts describeEngineKey: rule 1, deleted (no references).
- testedCrossoverVersions.ts testedCrossoverBuilds: rule 1, deleted.
- engineTypes.ts EngineReason: rule 1, deleted (unreferenced even locally).
- runTool.ts RunnerTool: rule 2, export dropped (used locally).
- launchEngine.ts getLaunchSettings: rule 3, re-export deleted (launcher.ts and tests import from launchSettings; the mock of launchEngine in launcher.engineStep.test.ts is unaffected).
- perGameBottle.ts CROSSOVER_CREATE_FAILED / CROSSOVER_CREATE_TIMEOUT / PROVISION_ABORTED: rule 2, export dropped (consumers import from steam/bottle.ts; string values unchanged).
- preload/api/engine.ts six `Engine.*` members: rule 4 `@public` each, "reached only as window.api.<name> through the preload api bundle". `@public` suppressed all six, so no baseline relocation for getDefaultEngine / getPerGameBottleName or the renamed four.
- meta/genIpcContract.ts buildContract, pascal, snake, rendererChannelNames; ipcValidation.ts sanitiseChannel; ipcDomainParse.ts DETECT_ORDER, TRANSPORT; ipcSchemaFixtures.ts Fixtures; channelSchemas.ts mergeChannelEntries: rule 2, export dropped (grep and tests confirmed file-local use; genIpcContract.test.ts imports other names only).
- bootErrorSurface.ts classifyBootError: rule 4 `@public` (bootErrorSurface.test.ts via require()).
- common/types.ts Tools, SaveSyncArgs, RunWineCommandArgs, ToolArgs: rule 1, deleted (codecheck confirms no importer).
- common/types/engine.ts EngineKind: rule 2, export dropped.

`@public` tags added: defaultEngineDecisionDeps, engineNoticeStore, classifyBootError, six preload engine members.

## Deviations
None of substance. I did not run `git log -S` archaeology for the orphaned types' originating changes.

## Known pre-existing jest failures (recorded, not fixed)
tauriShellSource, macArchKnownFixRouting (seen failing in both related-test runs), genI18nGateScope, logSecretGate, x86CallbackWineHarness. In the Task 2 related-tests run `dxvkInstallRemove.test.ts` also failed once under load but passed 25/25 when rerun alone (flaky, unrelated to these edits).

## Self-Check: PASSED
Both commits exist; chain exit=0; gates-untouched printed; `git status` shows only pre-existing unrelated files.
