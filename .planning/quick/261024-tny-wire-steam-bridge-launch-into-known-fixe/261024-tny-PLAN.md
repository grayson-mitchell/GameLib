---
phase: quick-261024-tny
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/utils.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/utils/uninstaller.ts
  - src/backend/wiki_game_info/gamesdb/utils.ts
  - src/backend/__tests__/knownFixes.test.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/wiki_game_info/gamesdb/__tests__/utils.test.ts
  - .planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md
  - src/backend/tools/index.ts
  - src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-10-23-wire-steam-bridge-launch-into-known-fixes.md (moved to .planning/todos/completed/)
autonomous: true
requirements: [QUICK-261024-tny]

must_haves:
  truths:
    - "readKnownFixes('<appId>', 'steam') reads fixes/<appId>-steam.json. It no longer reads <appId>-undefined.json."
    - "Installing a Steam game never fetches anything from Heroic's known-fixes feed (D1). GOG, Epic and Amazon installs still fetch it exactly as before."
    - "Changing storeMap.steam to 'steam' changes nothing else. Steam uninstall still does not delete a fixes file, and getInfoFromGamesDB still returns { steamID: '' } for runner 'steam' without a network call."
    - "On a Steam bridge launch, the envVariables in fixes/<appId>-steam.json reach the runWineCommand that starts the game. They travel as gameSettings.enviromentOptions on a per-launch copy of bridgeBottleSettings."
    - "On a Steam bridge launch, every winetricks verb in the fixes file runs against the bridge bottle GameLibSteamBridge-<appId>: CX_BOTTLE comes from wineCrossoverBottle, and winePrefix is getBottleDir(that bottle). It never runs against the SteamGame's own settings."
    - "On a Steam bridge launch, every runInPrefix entry runs through runWineCommand with wait:true, protonVerb 'run' and the bridge bottle settings. Its path is resolved under the game's install root, and an entry that escapes the root is skipped with a warning."
    - "The applier runs before startBottleProcessMonitor and before runWineCommand starts the game. It sends 'winetricks' and then 'redist' (context 'FIXES') status updates, the same as installFixes. Any failure logs a LogPrefix.Steam warning and the launch continues; it never marks the bridge failed."
    - "When there is no fixes file, the applier does nothing. It sends no status, runs no winetricks or wine command, and runWineCommand receives the same bridgeBottleSettings object as before."
    - "A new pending todo records that GameLib will have its own fixes repo for Steam and for the complex keys. It carries severity/platform/ready in that order and passes pnpm planning-gates."
  artifacts:
    - path: "src/common/utils.ts"
      provides: "storeMap.steam = 'steam'"
      contains: "steam: 'steam'"
    - path: "src/backend/storeManagers/steam/bridgeKnownFixes.ts"
      provides: "applySteamBridgeKnownFixes(appId, bridgeBottleSettings, installRoot): Promise<GameSettings>"
      contains: "export async function applySteamBridgeKnownFixes"
    - path: "src/backend/tools/index.ts"
      provides: "Winetricks.install / runWithArgs accept an explicit trailing GameSettings"
      contains: "gameSettingsOverride"
    - path: "src/backend/__tests__/steamBridgeKnownFixes.test.ts"
      provides: "applier tests: -steam file, bottle targeting, env merge, containment, no-op, failure tolerance"
  key_links:
    - from: "steam/games.ts fireBridgeWineLaunch"
      to: "bridgeKnownFixes.ts applySteamBridgeKnownFixes"
      via: "lazy import, awaited before startBottleProcessMonitor; its result is runWineCommand's gameSettings"
      pattern: "applySteamBridgeKnownFixes\\("
    - from: "bridgeKnownFixes.ts"
      to: "Winetricks.install(..., gameSettings)"
      via: "explicit bridge-bottle settings, so libraryManagerMap.steam is never consulted"
      pattern: "Winetricks\\.install\\("
    - from: "downloadmanager/utils.ts downloadFixesFor"
      to: "runner === 'steam' early return"
      via: "D1 guard"
      pattern: "runner === 'steam'"
---

<objective>
Wire the Steam bridge launch into known-fixes. A fixes/<appId>-steam.json should apply its
envVariables, winetricks verbs and runInPrefix entries to the per-app bridge bottle
GameLibSteamBridge-<appId>, the same way GOG, Epic and Amazon launches apply theirs.

Purpose: today a Steam fixes file is silently ignored. storeMap.steam is undefined, so the reader
looks for <appId>-undefined.json, and fireBridgeWineLaunch never calls into known-fixes. This is
step one of .planning/notes/per-game-compat-fixes-architecture.md and needs no format change.

Output: storeMap.steam = 'steam', with every other storeMap consumer kept behaviour-neutral. A
Steam-side applier module, and a Winetricks entry point that takes explicit GameSettings. The
applier is wired into fireBridgeWineLaunch, and there are tests for all of it. A new todo covers
GameLib's own fixes repo (D1), and the source todo is closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-10-23-wire-steam-bridge-launch-into-known-fixes.md
@.planning/notes/per-game-compat-fixes-architecture.md

Load `Skill("gamelib-conventions")` before you start. Two of its sections apply: the todo triage
frontmatter rule (Task 1 writes a pending todo) and the `<verify>` formatter rule (every task). No
task here spawns a real child process. Every test mocks spawn, runWineCommand or Winetricks, so the
fake-HOME rule does not arm. If you do add a real spawn, use `createFakeHomeProfile()`.

Locked decisions:
- D1: downloadFixesFor must not fetch Steam fixes from Heroic's feed. GameLib will build its own
  fixes repo, for Steam and for the complex keys (registry, dllOverrides, overlays, shimFeatures).
  Record that as a new pending todo.
- D2: winetricks verbs re-run on every launch, as they do for other stores. Do not add an
  applied-fix ledger.
- Applier contract. It runs before the wine launch and before the process monitor starts. It runs
  winetricks verbs, then runInPrefix (wait:true, protonVerb 'run', paths joined under the install
  root and never allowed to escape it), against bridgeBottleSettings. It sends the same 'winetricks'
  and 'redist' (context 'FIXES') sendGameStatusUpdate events as installFixes. Any failure logs a
  warning with LogPrefix.Steam, and the launch continues. Winetricks must target the bridge bottle
  through an entry point that takes explicit GameSettings, and its single-flight guard must keep
  working the way it does now.
- Do not touch the runner==='steam' guard in runWineCommandOnGame (tools/index.ts, Pitfall 5).
  Do not reuse installFixes or prepareWineLaunch for Steam (both resolve the wrong settings or run
  prefix/DXVK work the bridge deliberately skips).

<interfaces>
src/common/utils.ts:3-10. `export const storeMap: { [key in Runner]: string | undefined }` maps
legendary to 'epic', gog to 'gog', nile to 'amazon', sideload to undefined, zoom to 'zoom' and
steam to undefined. This plan changes steam to 'steam'.

storeMap consumers, the complete list from grepping src and meta (the frontend has none):
- src/backend/knownFixes.ts:40 `readKnownFixes(appName, runner): KnowFixesInfo | null` resolves
  `${appName}-${storeMap[runner]}.json` under fixesPath, with resolve+relative containment. It
  needs no edit.
- src/backend/downloadmanager/utils.ts:506 `async function downloadFixesFor(appName, runner)`. It is
  not exported and is called unawaited at :238 inside installQueueElement. It builds the Heroic URL
  `.../known-fixes/main/${storeMap[runner]}/${appName}-${storeMap[runner]}.json` and calls
  `downloadFile({ url, dest, ignoreFailure: true })`.
- src/backend/utils/uninstaller.ts:74 `removeFixFile(appName, runner)` rmSyncs
  `${appName}-${storeMap[runner]}.json` and is called unconditionally at :135 after an uninstall.
- src/backend/wiki_game_info/gamesdb/utils.ts:14 `if (!storeName) return { steamID: '' }`.
  Otherwise it calls the GOG gamesdb API with storeName.
- src/backend/wiki_game_info/umu/utils.ts uses its own storeMapping and is unaffected.

src/common/types.ts:
- `KnowFixesInfo { title: string; notes?; winetricks?: string[]; runInPrefix?: string[]; envVariables?: Record<string, string>; wikiLink? }` (:1112)
- `EnviromentVariable { key: string; value: string }` (:584). `GameSettings.enviromentOptions: EnviromentVariable[]` (:316)
- `WineCommandArgs { commandParts; wait?; protonVerb?; gameSettings?; gameInstallPath?; installFolderName?; options?: CallRunnerOptions; startFolder?; skipPrefixCheckIKnowWhatImDoing?; ignoreLogging? }` (:793)
- `WinetricksInstallOutcome = 'installed' | 'failed' | 'refused'` (:935)

src/backend/launcher.ts:
- `installFixes(appName, runner)` (:993) is the reference shape. When knownFixes.winetricks is
  present it sends status 'winetricks' and loops `Winetricks.install(runner, appName, pkg)`. When
  runInPrefix is present it sends status 'redist' with context 'FIXES' and loops
  `runWineCommandOnGame(runner, appName, { commandParts: [join(install_path, file)], wait: true, protonVerb: 'run' })`.
- `runWineCommand(args: WineCommandArgs)` (:1453). It builds env as process.env, then
  options.env, then setupEnvVars(settings), then setupWineEnvVars(settings), then PROTON_VERB, each
  overriding the last. setupEnvVars (:1042) writes every `gameSettings.enviromentOptions` entry as
  `ret[key] = value`. setupWineEnvVars (:1118) sets CX_BOTTLE = wineCrossoverBottle for crossover
  and wins over both. The prefix check is skipped for crossover, or when
  skipPrefixCheckIKnowWhatImDoing is set.
- GOG (gog/games.ts:597-603) merges `...getKnownFixesEnvVariables(id,'gog')` after
  setupEnvVars, so fixes win over the user's settings env.

src/backend/tools/index.ts, `export const Winetricks = { ... }` (:596):
- `runWithArgs(runner, appName, args, returnOutput = false, envOverrides?, component = '', onDone?, onLine?)`
  (:626). It lazily imports libraryManagerMap and resolves
  `await libraryManagerMap[runner].getGame(appName).getSettings()` (:651). It then calls
  validWine, getWineFromProton(gameSettings) (which returns gameSettings.winePrefix unchanged for
  non-proton), builds macEnvs/linuxEnvs from setupEnvVars, setupWineEnvVars and
  WINEPREFIX: winePrefix, and spawns winetricks.
- `install(runner, appName, component, onLine?): Promise<WinetricksInstallOutcome>` (:1054). This
  is the single-flight guard on the module-global `installingComponent`: 'refused' if busy. It
  calls runWithArgs(runner, appName, ['-q', component], false, undefined, component, onDone, onLine).
- Other callers: launcher.ts:1006, tools/index.ts:949 (list), tools/winetricksQueue.ts:113.

src/backend/storeManagers/steam/bottle.ts:
- `getBridgeBottleSettings(appId): GameSettings` (:1380) returns
  `{ ...globalSettings, wineCrossoverBottle: 'GameLibSteamBridge-<appId>' (or the legacy shared name), wineVersion: CrossOver ?? global }`.
  Its winePrefix is the GLOBAL prefix, which is why the applier sets winePrefix to the bottle dir
  for winetricks.
- `getBottleDir(bottleName): string` (:98) returns `~/Library/Application Support/CrossOver/Bottles/<bottleName>`.

src/backend/storeManagers/steam/games.ts, `private async fireBridgeWineLaunch(exePath, bridgeBottleSettings: GameSettings): Promise<boolean>` (~:3036):
inside try, it lazily imports `runWineCommand` from 'backend/launcher' and
`startBottleProcessMonitor` from './bottleProcessMonitor'. It computes
`installRoot = this.resolveBridgeGameInstallRoot(exePath, bridgeBottleSettings.wineCrossoverBottle)`
(string | undefined, of the form <bottle>/…/steamapps/common/<installdir>). If installRoot is set
it starts the monitor, then calls
`runWineCommand({ commandParts: [exePath], gameSettings: bridgeBottleSettings, wait: false, protonVerb: 'run', startFolder: dirname(exePath), skipPrefixCheckIKnowWhatImDoing: true })`
unawaited. The catch calls reportLaunchFailure, which runs markBridgeFailedThisSession, so the
applier must never reject into it. The monitor sends 'launching' on start
(bottleProcessMonitor.ts:490).

`sendGameStatusUpdate` comes from 'backend/utils'. `logWarning` and `LogPrefix` (LogPrefix.Steam
exists) come from 'backend/logger'.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: storeMap.steam = 'steam', keep every other consumer behaviour-neutral, D1 skip in downloadFixesFor, and the GameLib-fixes-repo todo</name>
  <files>src/common/utils.ts, src/backend/downloadmanager/utils.ts, src/backend/utils/uninstaller.ts, src/backend/wiki_game_info/gamesdb/utils.ts, src/backend/__tests__/knownFixes.test.ts, src/backend/downloadmanager/__tests__/utils.test.ts, src/backend/wiki_game_info/gamesdb/__tests__/utils.test.ts, .planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md</files>
  <behavior>
    - knownFixes.test.ts: a file named `<id>-steam.json` written under fixesPath is returned by readKnownFixes('<id>', 'steam'). A file named `<id>-undefined.json` is NOT returned for runner 'steam'. This is the regression the old map produced.
    - downloadmanager utils.test.ts: installQueueElement(makeParams()) with the default runner 'steam' never calls the mocked downloadFile with a known-fixes URL. Anti-vacuity: with runner 'gog' it IS called with a url containing 'Heroic-Games-Launcher/known-fixes/main/gog/' and the appName. For the gog arm, extend the existing libraryManagerMap mock or the params only as far as installQueueElement needs, and keep every pre-existing test unedited.
    - gamesdb utils.test.ts: getInfoFromGamesDB('X', '220', 'steam') resolves { steamID: '' } and never calls axiosClient.get (spy like the existing 'skip not supported runner' case).
  </behavior>
  <action>
RED first: add the three test behaviours above and run them. The -steam knownFixes case, the
downloadFile-not-called-for-steam case and the gamesdb steam case must fail or show the defect
before the fix. Then make these edits.

(a) src/common/utils.ts: set `steam: 'steam'`.

(b) downloadmanager/utils.ts downloadFixesFor: add an early return when runner is 'steam', before
mkdirSync and downloadFile. Add a short comment (D1, quick 261024-tny) saying that Steam fixes come
only from bundled or local GameLib sources and never from Heroic's feed, per decision 6 of
.planning/notes/per-game-compat-fixes-architecture.md, and that GameLib's own fixes repo is tracked
in the new todo. Leave the sideload/undefined behaviour exactly as it is.

(c) uninstaller.ts removeFixFile: return early for runner 'steam'. Comment why. Before this change
the steam path resolved `<appId>-undefined.json`, so a Steam uninstall never deleted a fixes file.
Steam fixes are hand-placed or GameLib-sourced and never re-downloaded at install (D1), so deleting
them would destroy the only copy.

(d) gamesdb/utils.ts: keep the old result for steam with
`if (!storeName || runner === 'steam') return { steamID: '' }` plus a one-line comment. A Steam
title's own appId already is its Steam ID, and this keeps the change from adding a GOG gamesdb
network call to every Steam extra-info fetch.

(e) Write the new todo with the Write tool:
.planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md.
Copy the frontmatter shape of the source todo exactly: created: 2026-10-24, title, source
(quick 261024-tny, D1), area: steam-launch, files (src/backend/downloadmanager/utils.ts,
src/backend/knownFixes.ts), then `severity: minor`, `platform: any`, `ready: human`. Those three are
bare, lowercase, in that order. ready is human because it needs the operator to create the repo and
decide its trust and signing model. The body says:
- GameLib needs its own known-fixes repo, both for Steam profiles and for the complex keys
  (registry, dllOverrides, overlays, shimFeatures).
- downloadFixesFor now skips 'steam' on purpose (quick 261024-tny). Until this repo exists, Steam
  fixes come only from a hand-placed fixes/<appId>-steam.json.
- Decision 6 of .planning/notes/per-game-compat-fixes-architecture.md applies: the new keys are
  honoured only from bundled or local sources, and any remote feed needs signed, sha-pinned
  components from a source GameLib controls.
- Done-when: the repo exists with a documented layout, downloadFixesFor (or a GameLib-specific
  fetcher) pulls Steam profiles from it, and its trust rule is enforced in code.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/knownFixes.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/wiki_game_info && pnpm codecheck && pnpm planning-gates && grep -n "steam: 'steam'" src/common/utils.ts && for f in src/common/utils.ts src/backend/downloadmanager/utils.ts src/backend/utils/uninstaller.ts src/backend/wiki_game_info/gamesdb/utils.ts src/backend/__tests__/knownFixes.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/wiki_game_info/gamesdb/__tests__/utils.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/common/utils.ts src/backend/downloadmanager/utils.ts src/backend/utils/uninstaller.ts src/backend/wiki_game_info/gamesdb/utils.ts src/backend/__tests__/knownFixes.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/wiki_game_info/gamesdb/__tests__/utils.test.ts</automated>
    The new todo is under .planning, which prettier ignores, so it gets no prettier check.
    `pnpm planning-gates` is its gate.
  </verify>
  <done>All three suites pass and no pre-existing assertion was edited. codecheck reports 0
  errors. planning-gates passes with the new todo present. All seven source and test paths are
  prettier-seen (no IGNORED line) and prettier-clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Winetricks explicit-settings entry point and the Steam bridge known-fixes applier</name>
  <files>src/backend/tools/index.ts, src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts, src/backend/storeManagers/steam/bridgeKnownFixes.ts, src/backend/__tests__/steamBridgeKnownFixes.test.ts</files>
  <behavior>
    winetricksInstallLifecycle.test.ts (one new case, reusing that file's spawn and getWineFromProton mocks):
    - Winetricks.install('steam', '480', 'vcrun2019', undefined, explicitSettings) spawns winetricks, and mockGetWineFromProton is called with explicitSettings. The file's storeManagers mock has no 'steam' key, so a library lookup would throw; the case passes only if the override bypasses it. The single-flight guard still applies: a second install with explicit settings while the first runs returns 'refused'.

    steamBridgeKnownFixes.test.ts (new). Copy knownFixes.test.ts's os.homedir tmp redirect and its fixesPath setup and teardown. Use the REAL readKnownFixes, so the -steam filename is proven end to end. Mock 'backend/tools' (Winetricks.install), 'backend/launcher' (runWineCommand), 'backend/utils' (sendGameStatusUpdate), 'backend/logger' (logWarning, LogPrefix) and the applier's bottle import (getBottleDir returns `/mock/Bottles/${name}`). resetMocks is on, so assign return values in beforeEach. BRIDGE is `{ wineCrossoverBottle: 'GameLibSteamBridge-480', winePrefix: '/global/prefix', enviromentOptions: [{ key: 'USER', value: 'x' }], wineVersion: { type: 'crossover' } }` cast as GameSettings.
    - No fixes file: the result is the SAME object (toBe BRIDGE). Winetricks.install, runWineCommand and sendGameStatusUpdate are not called.
    - winetricks ['vcrun2019','d3dx9']: status 'winetricks' is sent once, before the installs. Winetricks.install is called twice with ('steam','480',verb, undefined, settings), where settings.wineCrossoverBottle is 'GameLibSteamBridge-480' and settings.winePrefix is '/mock/Bottles/GameLibSteamBridge-480'. A verb starting with '-' is skipped with a warning.
    - runInPrefix ['redist/vc_redist.x64.exe'] with installRoot '/mock/Bottles/GameLibSteamBridge-480/drive_c/steamapps/common/Game': status 'redist' with context 'FIXES' is sent. runWineCommand gets commandParts [installRoot + '/redist/vc_redist.x64.exe'], gameSettings BRIDGE, wait true, protonVerb 'run' and skipPrefixCheckIKnowWhatImDoing true.
    - runInPrefix ['../../../evil.exe'] is skipped with a warning and runWineCommand is not called. runInPrefix with installRoot undefined is skipped with a warning.
    - envVariables { DXVK_ASYNC: '1' }: the result is a NEW object (not toBe BRIDGE) whose enviromentOptions equal [{USER,x},{DXVK_ASYNC,'1'}], with every other field equal to BRIDGE. BRIDGE.enviromentOptions itself is unmutated.
    - Failure tolerance: Winetricks.install rejecting, Winetricks.install resolving 'failed' or 'refused', and runWineCommand rejecting each log a warning. The applier still resolves, and still returns the env-merged settings when the file also has envVariables.
  </behavior>
  <action>
RED first: write both test changes and run them so they fail. The applier module does not exist
yet, and install ignores a 5th argument.

(a) tools/index.ts. Add a trailing optional parameter `gameSettingsOverride?: GameSettings` to
Winetricks.runWithArgs, after onLine. When it is set, use it as gameSettings and skip both the
lazy storeManagers import and the getGame lookup. When it is not set, behaviour is byte-identical.
Add a trailing optional `gameSettings?: GameSettings` to Winetricks.install and pass it through as
runWithArgs' new last argument. Do not change the single-flight guard, installingComponent, the
sendFrontendMessage events or the outcome logic. Every existing call site stays untouched. Comment
the parameter in the file's style: quick 261024-tny, the Steam bridge applier passes the per-app
bridge bottle's settings because SteamGame.getSettings() is not the bottle the game runs in.
Import GameSettings as a type if it is not already imported. Do not touch runWineCommandOnGame's
steam guard.

(b) New src/backend/storeManagers/steam/bridgeKnownFixes.ts, exporting
`async function applySteamBridgeKnownFixes(appId: string, bridgeBottleSettings: GameSettings, installRoot: string | undefined): Promise<GameSettings>`.
Give it a header docstring in the surrounding steam-module style. It should say:
- this is the Steam-side counterpart of launcher.ts installFixes plus getKnownFixesEnvVariables;
- why installFixes cannot be reused: Winetricks resolves SteamGame settings rather than the bridge
  bottle, runWineCommandOnGame refuses steam, and prepareWineLaunch does prefix and DXVK work the
  bridge skips;
- D2: verbs re-run on every launch, with no ledger;
- the function never rejects.

The body:
1. `const fixes = readKnownFixes(appId, 'steam')`, imported statically from 'backend/knownFixes'.
   If it is null, return bridgeBottleSettings as the same reference.
2. Lazily import Winetricks from 'backend/tools' and runWineCommand from 'backend/launcher'. This
   mirrors games.ts's lazy launcher import and avoids the cycle.
3. If fixes.winetricks is truthy, call
   sendGameStatusUpdate({ appName: appId, runner: 'steam', status: 'winetricks' }). Build
   `winetricksSettings = { ...bridgeBottleSettings, winePrefix: getBottleDir(bridgeBottleSettings.wineCrossoverBottle) }`.
   For each verb, skip it with a warning if it is not a non-empty string or starts with '-'.
   Otherwise call `await Winetricks.install('steam', appId, verb, undefined, winetricksSettings)`
   in try/catch. A rejection, or an outcome other than 'installed', gets a logWarning naming the
   verb and the outcome or error.
4. If fixes.runInPrefix is truthy and installRoot is undefined, log a warning and skip. Otherwise
   send status 'redist' with context 'FIXES'. For each entry, compute
   `fullPath = resolve(installRoot, entry)`. Use the knownFixes.ts containment idiom: relative()
   must not start with '..', must not be absolute and must not be empty. If the check fails, warn
   and skip. Otherwise, in try/catch, await
   runWineCommand({ commandParts: [fullPath], gameSettings: bridgeBottleSettings, wait: true, protonVerb: 'run', skipPrefixCheckIKnowWhatImDoing: true }).
   skipPrefixCheck is set to match the bridge launch, so a non-CrossOver fallback can never trigger
   verifyWinePrefix on the global prefix. Warn when it rejects or resolves with a non-zero code.
5. If fixes.envVariables has entries, return
   `{ ...bridgeBottleSettings, enviromentOptions: [...(bridgeBottleSettings.enviromentOptions ?? []), ...entries mapped to { key, value: String(value) }] }`.
   Otherwise return bridgeBottleSettings. Comment the mechanism choice. enviromentOptions is the
   channel runWineCommand already applies through setupEnvVars, and appending puts fix vars after
   the user's own vars, which matches GOG's fixes-win precedence. setupWineEnvVars (CX_BOTTLE)
   still wins, so a fix can never redirect the bottle. The alternative, options.env, would be
   overridden by setupEnvVars.
6. Wrap the whole body after step 1 in an outer try/catch that logs a warning and returns
   bridgeBottleSettings. Every warning uses LogPrefix.Steam and names the appId.

Then GREEN: make both test files pass.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/tools && pnpm codecheck && npx eslint src/backend/tools/index.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts && for f in src/backend/tools/index.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/backend/tools/index.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts</automated>
  </verify>
  <done>The new applier suite and the whole tools suite pass, and no pre-existing tools assertion
  was edited. codecheck and eslint report 0 errors. All four paths are prettier-seen and
  prettier-clean. There are two commits: test, then feat.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Call the applier from fireBridgeWineLaunch, cover it in games.test.ts, close the todo</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, .planning/todos/pending/2026-10-23-wire-steam-bridge-launch-into-known-fixes.md</files>
  <behavior>
    - games.test.ts mocks '../bridgeKnownFixes' with `applySteamBridgeKnownFixes: jest.fn()`. Because of resetMocks, every describe whose tests reach fireBridgeWineLaunch sets a passthrough implementation, `async (_id, settings) => settings`, in its beforeEach. That covers at least the 'Phase 24 Plan 08 bridge routing' describe (~1661) and the describe containing the runWineCommand assertion near line 9183. Grep `runWineCommand).toHaveBeenCalled` to find them all. Every pre-existing assertion, including `gameSettings: { wineCrossoverBottle: 'GameLibSteamBridge' }`, passes unedited.
    - New case: the applier is called with (APP_ID, the getBridgeBottleSettings result, `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4`). Its invocationCallOrder is lower than startBottleProcessMonitor's and lower than runWineCommand's.
    - New case: the applier resolves a distinct object carrying enviromentOptions [{ key: 'DXVK_ASYNC', value: '1' }]. runWineCommand's gameSettings is THAT object, and startBottleProcessMonitor's bottleDir is still derived from the original bottle.
    - New case: the applier rejects. runWineCommand is still called with the original bridge settings, a LogPrefix.Steam warning is logged, the launch returns true, and steamBridgeSetupRequired is NOT sent.
  </behavior>
  <action>
RED: add the mock, the passthrough defaults and the three cases, and run them to confirm they fail.

Then, in fireBridgeWineLaunch, lazily import `applySteamBridgeKnownFixes` from './bridgeKnownFixes'
next to the existing lazy imports. After installRoot is computed and BEFORE
startBottleProcessMonitor, add
`const launchSettings = await applySteamBridgeKnownFixes(this.appId, bridgeBottleSettings, installRoot).catch(...)`.
The catch handler logs a LogPrefix.Steam warning and falls back to bridgeBottleSettings. The applier
contract says it never rejects, but this is a belt-and-braces guard: a rejection must never reach
the outer catch, whose reportLaunchFailure would mark the bridge failed for the session. Pass
launchSettings as runWineCommand's gameSettings. Keep getBottleDir(bridgeBottleSettings.wineCrossoverBottle)
for the monitor unchanged.

Add a comment in the file's style covering:
- quick 261024-tny: the known-fixes hook for the bridge path;
- why it sits before the monitor: the monitor's start sends 'launching', which supersedes the
  fix-application statuses, and the monitor must still start before the wine child is awaited, as
  Plan 51-23 requires;
- that it runs on every launch (D2).

Then GREEN: run the whole games.test.ts.

Housekeeping, in its own commit `chore(quick-261024-tny): close todo`. Run
`git mv .planning/todos/pending/2026-10-23-wire-steam-bridge-launch-into-known-fixes.md .planning/todos/completed/`.
Then append a `## Closed 2026-10-24: Steam bridge launch applies known-fixes` section, in the style
of e9994cfd1's close note. Write it as short plain-prose paragraphs:
- what landed: storeMap.steam, the applier, Winetricks' explicit-settings parameter, env passed
  through enviromentOptions;
- the D1 decision and a pointer to the new todo;
- D2, verbs re-run every launch with no ledger;
- what is not done: the applied-fix ledger, the complex keys, local and bundled layers, and a live
  check on the Mac with a real fixes file.
Finally run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/__tests__/knownFixes.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/steam/games.ts && test -f .planning/todos/completed/2026-10-23-wire-steam-bridge-launch-into-known-fixes.md && test ! -f .planning/todos/pending/2026-10-23-wire-steam-bridge-launch-into-known-fixes.md && pnpm planning-gates && for f in src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
    The moved todo is under .planning, which prettier ignores, so it gets no prettier check.
  </verify>
  <done>The whole steam jest tree passes with no pre-existing assertion edited. codecheck and
  eslint report 0 errors. Both source paths are prettier-clean. The todo is in completed/ with a
  close note, planning-gates is green, and graphify has been updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| fixes/<appId>-steam.json -> launch | Hand-placed local file. Its content picks winetricks verbs, executables run in the bottle, and env vars |
| Heroic known-fixes feed -> fixesPath | Remote content. After this plan it is never fetched for Steam (D1) |
| renderer -> readKnownFixes(appName) | Unchanged; containment already enforced (WR-06) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tny-01 | Tampering | downloadFixesFor | mitigate | Early return for runner 'steam' (D1), so no remote content lands as a Steam fixes file. A Task 1 test pins it, and its gog arm proves the guard is not vacuous. |
| T-tny-02 | Elevation | runInPrefix path | mitigate | resolve plus relative containment under installRoot, skipping any entry that escapes. installRoot undefined means skip. Task 2 tests a '../../../evil.exe' entry. |
| T-tny-03 | Tampering | winetricks verb as argv | mitigate | spawn uses argv with no shell. Verbs that are empty or start with '-' are skipped, so a verb cannot become a winetricks flag. |
| T-tny-04 | Spoofing | env var redirecting the bottle | mitigate | Fix env travels through enviromentOptions, which setupWineEnvVars (CX_BOTTLE) overrides, so the bottle is always GameLibSteamBridge-<appId>. |
| T-tny-05 | DoS | launch blocked or bridge marked failed by a fix error | mitigate | The applier catches everything internally, and games.ts adds a .catch fallback. A Task 3 test asserts no steamBridgeSetupRequired and a true return on rejection. |
| T-tny-06 | DoS | repeated Play during a long winetricks run | accept | No monitor exists yet, so a second click could start a second launch. Winetricks single-flight refuses the second run's verbs and the frontend shows the 'winetricks' status. This matches other stores' installFixes behaviour. |
| T-tny-07 | Information disclosure | removeFixFile on Steam uninstall | mitigate | Skipped for steam, so hand-placed fixes are not destroyed (Task 1). |
</threat_model>

<verification>
- `npx jest src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/downloadmanager src/backend/wiki_game_info src/backend/tools src/backend/storeManagers/steam` is green.
- `pnpm codecheck` and `pnpm planning-gates` are green.
- `grep -rn "storeMap\[" src` lists only the four consumers, and each one is either handled or
  correct for steam.
</verification>

<success_criteria>
A fixes/<appId>-steam.json is read under that exact name. On a bridge launch its winetricks verbs
and runInPrefix entries run against GameLibSteamBridge-<appId> before the monitor and game start,
and its envVariables reach the game's runWineCommand. With no file, the launch is unchanged. Steam
never pulls fixes from Heroic's feed. The GameLib fixes-repo todo exists, and the source todo is
closed.
</success_criteria>

<output>
Create `.planning/quick/261024-tny-wire-steam-bridge-launch-into-known-fixe/261024-tny-SUMMARY.md` when done.
</output>
