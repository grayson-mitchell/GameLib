---
phase: quick-261024-cjq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/crossoverLocation.ts
  - src/backend/storeManagers/steam/__tests__/crossoverLocation.test.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/common/types/ipc.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
  - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx
  - public/locales/*/gamelib.json
  - public/locales/*/gamelib.mt.json
  - meta/i18nCatalogPresenceBaseline.json
  - .planning/todos/pending/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md
  - .planning/todos/completed/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md
autonomous: true
requirements: [TODO-2026-10-22-no-crossover-notice]

must_haves:
  truths:
    - "With no CrossOver installed, the install dialog's wine section says CrossOver is required and offers a link to codeweavers.com; it never says GameLib will set one up"
    - "With CrossOver installed at ~/Applications/CrossOver.app (or anywhere mdfind finds com.codeweavers.CrossOver), bridge and bottled-Steam bottle creation spawn THAT install's cxbottle, not /Applications/..."
    - "With no CrossOver, pressing Install on a bridge- or bottle-routed title fails with a 'CrossOver is required' message, never a raw cxbottle ENOENT, and never logs 'Finished Installation'"
    - "A missing-CrossOver failure does not mark the appId bridge-failed-this-session: the next Install press (after CrossOver is installed) still takes the bridge route, not bottled Steam"
    - "The bottled-Steam guided setup shows 'CrossOver is required' instead of 'Failed to create CrossOver bottle ... spawn ... ENOENT'"
    - "A setup-deferred install (nothing installed) is not logged or recorded in the finished list as 'Finished install'"
  artifacts:
    - path: "src/backend/storeManagers/steam/crossoverLocation.ts"
      provides: "Single resolver for the CrossOver bin dir (selected engine -> hints -> /Applications + ~/Applications -> getCrossover() mdfind)"
      exports: ["resolveCrossoverBinDir", "resolveCrossoverBinDirAsync", "crossoverBinDirFromWineBin"]
    - path: "src/backend/storeManagers/steam/__tests__/crossoverLocation.test.ts"
      provides: "Unit tests for cxbottle path resolution"
    - path: "src/backend/storeManagers/steam/bottle.ts"
      provides: "No hard-coded CXBOTTLE_BIN; cxbottle precondition in provisionBottle + provisionBridgeBottle; isCrossoverInstalled()"
      exports: ["isCrossoverInstalled", "CROSSOVER_MISSING"]
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts install()"
      to: "bottle.ts isCrossoverInstalled()"
      via: "gate as first statement of the routeThroughBottle branch, before bridgeRoute()"
      pattern: "isCrossoverInstalled\\("
    - from: "src/backend/storeManagers/steam/bottle.ts"
      to: "crossoverLocation.ts"
      via: "every cxbottle / wineserver / wine spawn resolves through resolveCrossoverBinDir(Async)"
      pattern: "resolveCrossoverBinDir"
    - from: "src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx"
      to: "ProvisionBottleResult.errorCode"
      via: "errorCode === 'crossover-missing' maps to gamelib:steam.install.crossoverRequired"
      pattern: "crossover-missing"
---

<objective>
Close todo `2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md`, which covers five fix directions.
(1) Make the CrossOver notice tell the truth and link to codeweavers.com.
(2) Check that cxbottle exists before provisioning, on the bridge path and the bottled-Steam path.
(3) Stop logging or recording a failed or deferred provisioning as `Finished Installation`.
(4) Treat a missing CrossOver as a precondition failure: never call `markBridgeFailedThisSession` for it, and gate on it before routing.
(5) Resolve cxbottle from the CrossOver install that `getCrossover()` or the selected engine actually finds, never from the hard-coded `/Applications/...` path.

Purpose: fresh Macs without CrossOver (and per-user `~/Applications` installs) currently die on a raw ENOENT, are told something false, and get silently rerouted to bottled Steam. Per user memory "bottled Steam is a narrow fallback", a missing-CrossOver failure must never reroute to bottled Steam.

Output: new `crossoverLocation.ts` resolver + tests; precondition-gated bottle.ts; install() gate; honest DM logging; truthful UI copy; todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md

<interfaces>
Current state, extracted 2026-10-24. Line numbers are approximate; grep for the identifiers.

src/backend/storeManagers/steam/bottle.ts
- L63-73: `const CXBOTTLE_BIN = '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle'`, `WINESERVER_BIN = join(dirname(CXBOTTLE_BIN),'wineserver')`, `CX_ROOT = dirname(dirname(CXBOTTLE_BIN))`. This is the ONLY hard-coded CrossOver.app path under src/ outside tests. The spawn and derive sites are:
  - `killBottleWineServer` (~L628, async; spawns WINESERVER_BIN with env CX_ROOT)
  - `provisionBottle` (~L663): the win32-recreate `--delete` at ~L748 and `--create` at ~L799
  - `resolveCrossoverWine(label)` (~L1266, SYNC; used by sync getSteamBottleSettings/getBridgeBottleSettings; returns undefined when the wine bin is missing)
  - `removePerGameBridgeBottle` `--delete` (~L1492; it already falls back to rmSync)
  - `provisionBridgeBottle` `--create` (~L1587)
- `export type ProvisionBottleResult = { status: 'done' | 'error'; error?: string }`
- `provisionBottle(opts?: { bottleName?; wineVersion?: WineInstallation })` and `provisionBridgeBottle(opts: { bottleName: string; wineVersion? })`. Both already have a non-CrossOver-engine guard placed before any side effect. The new cxbottle precondition goes next to it: after the name/engine guards, before any store write or spawn.
- `steamBottleConfigStore` (./electronStores) persists `wineVersion`.
- bottle.ts imports `runWineCommand` LAZILY (see the NOTE comment near the top) to keep unit tests light. Import `backend/utils/compatibility_layers` lazily for the same reason: dynamic `await import(...)` inside the async resolver only.

src/backend/utils/compatibility_layers.ts L308: `export async function getCrossover(): Promise<Set<WineInstallation>>`. It runs mdfind for bundle id com.codeweavers.CrossOver. Each entry's `bin` is `<App>/Contents/SharedSupport/CrossOver/bin/wine`, and it returns an empty set when not on macOS.

src/backend/storeManagers/steam/games.ts
- `markBridgeFailedThisSession(appId)` (~L203) feeds `bridgeFailedThisSession`, which feeds `resolveBridgeRoute`'s `failedThisSession` (~L2286).
- `install()` (~L1045): `const routeThroughBottle = forceWindowsViaBottle || this.isBottleEligible()`. Then `if (routeThroughBottle) { await this.removeDemotedNativeOrphan(); let bridgeRoute = this.bridgeRoute(); ...notice...; if bridge -> this.installBridgeGame(args); if (!isBottleReady()) -> steamBottleSetupRequired + deferredToSetup ... }`
- `installBridgeGame` (~L1474): on `provisionBridgeBottle` status !== 'done` it calls markBridgeFailedThisSession, sends `steamBridgeSetupRequired {reason:'bridge-bottle-provision-failed', fallbackAvailable:true}`, and returns `{status:'done', deferredToSetup:true}`.
- `import i18next from 'i18next'` is already present.

src/backend/storeManagers/steam/__tests__/games.test.ts
- L249 `jest.mock('../bottle', () => {...})` is a factory. **resetMocks is on**: a jest.fn() default is wiped before every test. Existing pattern: plain functions closing over a const jest.fn() survive (see `findBridgeInstallBottle`). Existing bridge provisioning test: ~L4832, "BLOCKER 1: bridge bottle provisioning FAILURE ...".

src/backend/downloadmanager/utils.ts
- `installQueueElement(params): Promise<{ status: DMStatus; error?: string }>` (~L118). It already computes `deferredToSetup` (~L260) from `installResult.deferredToSetup`.

src/backend/downloadmanager/downloadqueue.ts
- The loop (~L157) does `const { status } = element.type === 'install' ? await installQueueElement(...) : await updateQueueElement(...)`, then `processNotification(element, status)` and `addToFinished(element, status)`.
- `processNotification` (~L446): `logInfo(['Finished', action, 'of', appName])` when status === 'done'.

src/common/types/ipc.ts L313: `steamBottleProvision: (args?) => Promise<{ status: 'done' | 'error'; error?: string }>`. Its result is passed through verbatim by src/backend/sidecar/steamAuthFlowRegistration.ts:245.

src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
- L164 `showNoCrossoverEngineNotice = effectiveCrossoverOnly && engineOptions.length === 0`
- L262-269 renders `tGamelib('gamelib:steam.install.noCrossoverEngine', 'No CrossOver installation was found. GameLib will set one up when the install starts.')` inside `<span className="smallInputInfo">`.
- External-link pattern in the repo: `window.api.openExternalUrl(url)` (e.g. Settings/components/NvidiaPrime.tsx:56).

src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx
- `handleConfirm` (~L325) does `const result = await window.api.steamBottleProvision(...)`, then `if (result.status === 'error') { setProvisionError(result.error); setPhase('error') }`.
- The error phase renders `t('...errorMessage', { error, defaultValue: 'Steam setup could not start: {{error}}' })` (~L448).
- The comment at ~L334 repeats the false "GameLib will set one up when the install starts" promise.

i18n convention for CHANGED English copy, from quick 261012-f25 (commit 35561176e):
- Edit the en string.
- Remove the now-stale key IN PLACE from every non-en `public/locales/<lc>/gamelib.json` and its `gamelib.mt.json` key list. This is key-presence-only invalidation: no translation is written by hand or by model.
- Re-record the presence baseline with the lint's own writer: `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`.
- NEW keys go into en only. The baseline regeneration covers their absence elsewhere, as quick 261024-br4 did for `steam.bridge.setup.drmCeg`.

Todo-close convention, from quick 261024-br4 (commit 1fea8427e):
- `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/`.
- Append a `## Closed` section: "2026-10-24, quick 261024-cjq: ..." followed by a numbered list of what changed and any deviation.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Single CrossOver-location resolver; cxbottle precondition in both provisioners (fix directions 2 and 5)</name>
  <files>src/backend/storeManagers/steam/crossoverLocation.ts, src/backend/storeManagers/steam/__tests__/crossoverLocation.test.ts, src/backend/storeManagers/steam/bottle.ts, src/backend/storeManagers/steam/__tests__/bottle.test.ts, src/common/types/ipc.ts</files>
  <behavior>
    crossoverLocation.test.ts (mock graceful-fs existsSync path-aware; mock backend/utils/compatibility_layers getCrossover; mock backend/constants/paths userHome to a fixed fake dir like '/Users/test'; reset the module cache between tests):
    - crossoverBinDirFromWineBin('/X/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine') returns '/X/CrossOver.app/Contents/SharedSupport/CrossOver/bin'. A wine bin not under SharedSupport/CrossOver/bin (e.g. a GPTK/toolkit path) returns undefined.
    - resolveCrossoverBinDir(): only `<userHome>/Applications/CrossOver.app/.../bin/cxbottle` exists. It returns the ~/Applications bin dir (the live 20:00:07 case in the todo).
    - resolveCrossoverBinDir({ wineVersion }) with a crossover engine whose sibling cxbottle exists returns that engine's bin dir, ahead of the /Applications candidate even when both exist.
    - resolveCrossoverBinDir() when nothing exists returns undefined.
    - resolveCrossoverBinDirAsync(): no candidate exists, and getCrossover resolves one entry at '/Volumes/Apps/CrossOver.app/...' whose cxbottle exists. It returns that bin dir. A later SYNC resolveCrossoverBinDir() call returns it too (memoised), and returns undefined again once existsSync says it is gone.
    - resolveCrossoverBinDirAsync() when getCrossover rejects or returns an empty set returns undefined and never throws.
    bottle.test.ts additions:
    - provisionBridgeBottle({bottleName}) when no cxbottle resolves returns { status:'error', errorCode:'crossover-missing', error matching /CrossOver is required/ }. spawnAsync is never called and no store write happens.
    - provisionBottle() the same. It returns before steamBottleConfigStore.set is called and before spawnAsync.
    - When the cxbottle resolves under ~/Applications, provisionBridgeBottle's spawnAsync first argument is `<userHome>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle`, never the /Applications path.
  </behavior>
  <action>
Create `src/backend/storeManagers/steam/crossoverLocation.ts`. Its only imports are path, graceful-fs, `userHome` from backend/constants/paths, the WineInstallation type and the logger. It exports:
- `CROSSOVER_BIN_SUBPATH = 'Contents/SharedSupport/CrossOver/bin'`.
- `crossoverBinDirFromWineBin(wineBin: string): string | undefined`. Accept only a path ending in `/SharedSupport/CrossOver/bin/wine` and return its dirname.
- `resolveCrossoverBinDir(opts?: { wineVersion?: WineInstallation; hintWineBins?: string[] }): string | undefined`. This one is SYNC. Probe in this order: the opts.wineVersion bin dir (only when type === 'crossover'), then each hintWineBins entry's bin dir, then the memoised last async result, then `/Applications/CrossOver.app/<subpath>`, then `join(userHome, 'Applications/CrossOver.app', <subpath>)`. Return the first dir where `existsSync(join(dir, 'cxbottle'))` holds.
- `resolveCrossoverBinDirAsync(opts?)`. Try the sync resolver first. Otherwise lazily `await import('backend/utils/compatibility_layers')`, call `getCrossover()`, and map each entry's bin through crossoverBinDirFromWineBin. Take the first dir with an existing cxbottle, memoise it in a module-level variable, and return it. Wrap the call in try/catch so it never throws.
- `__resetCrossoverLocationForTests()`, which clears the memo. This mirrors the repo's `__reset...ForTests` convention.

The `/Applications/CrossOver.app` literal in the candidate list is a probe candidate, not a hard-code: it is the first of two default locations. Add a one-line comment saying so.

Edit bottle.ts (per fix direction 5):
- Delete `CXBOTTLE_BIN`, `WINESERVER_BIN` and `CX_ROOT`, and update the GAP-17-CEF-RECREATE-RUNNING comment block to describe the resolver.
- Add small private helpers that take a resolved binDir: `cxbottleIn(binDir)`, `wineserverIn(binDir)`, and `cxRootFrom(binDir) = dirname(binDir)`.
- Pass the persisted `steamBottleConfigStore.get('wineVersion')?.bin` as a hintWineBins entry wherever a store read is already in scope.
- `killBottleWineServer`: resolve async. If nothing resolves, log a warning and return. It stays best-effort.
- `resolveCrossoverWine`: resolve with the SYNC resolver and return undefined when unresolved. That return already exists for the dev/CI case.
- `removePerGameBridgeBottle`: resolve async. If nothing resolves, skip the cxbottle --delete with a warning; the existing rmSync fallback still runs.
- Add `export const CROSSOVER_MISSING = 'crossover-missing' as const`. Widen `ProvisionBottleResult` to `{ status: 'done' | 'error'; error?: string; errorCode?: typeof CROSSOVER_MISSING }`.
- In BOTH `provisionBottle` and `provisionBridgeBottle` (per fix direction 2), add the precondition immediately after the existing non-CrossOver-engine guard and before any store write, idempotent short-circuit or spawn. Call `const binDir = await resolveCrossoverBinDirAsync({ wineVersion: opts?.wineVersion, hintWineBins })`. If binDir is undefined, `logWarning` a plain line naming the bottle and return `{ status: 'error', errorCode: CROSSOVER_MISSING, error: 'CrossOver is required. Install CrossOver from https://www.codeweavers.com/crossover, then try again.' }`.
  - Pass the resolved binDir down to every cxbottle spawn in that function, including the win32-recreate delete.
  - Do NOT put the precondition ahead of the bridge `isBridgeBottleReady` short-circuit in a way that changes the existing-bottle fast path's result. A ready bottle with CrossOver later uninstalled still returns 'done', as today.
  - So in provisionBridgeBottle the order is: name guard, engine guard, ready short-circuit, then the precondition, then create.
  - In provisionBottle the same applies to the `isBottleReady` short-circuit: put the precondition after the win32-recreate block only if that block is also guarded. The simplest correct order is to resolve binDir right after the engine guard and return crossover-missing only when `!isBottleReady(bottleName)` or a recreate is needed. Document the chosen order in a comment.
- Add `export async function isCrossoverInstalled(): Promise<boolean>`, returning `(await resolveCrossoverBinDirAsync({ hintWineBins })) !== undefined`. Task 2's install gate uses it.

In `src/common/types/ipc.ts`, widen `steamBottleProvision`'s return to include `errorCode?: 'crossover-missing'`.

Update bottle.test.ts:
- Add `jest.mock('backend/utils/compatibility_layers', () => ({ getCrossover: jest.fn() }))`. This ensures no real mdfind ever runs.
- Every existing path-aware existsSync double that drives a provisioning/create/delete test must now ALSO return true for a path ending in '/bin/cxbottle'. The existing fixtures use '/Applications/CrossOver.app/...', so keep that.
- Call `__resetCrossoverLocationForTests()` in beforeEach.
- Any existing assertion on the exact spawnAsync binary path stays on '/Applications/CrossOver.app/.../cxbottle', because that is the first candidate.

No child process is spawned for real anywhere in these tests: spawnAsync is mocked, so the fake-HOME rule has no new spawn site here.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/crossoverLocation.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts && test "$(grep -Ev '^[[:space:]]*(//|\*)' src/backend/storeManagers/steam/bottle.ts | grep -c 'CXBOTTLE_BIN\|CrossOver.app')" = "0" && test "$(grep -rl 'CrossOver.app' src --exclude-dir=__tests__ | grep -v 'steam/crossoverLocation.ts$' | wc -l | tr -d ' ')" = "0" && npx tsc --noEmit -p . && npx prettier --check src/backend/storeManagers/steam/crossoverLocation.ts src/backend/storeManagers/steam/__tests__/crossoverLocation.test.ts src/backend/storeManagers/steam/bottle.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts src/common/types/ipc.ts</automated>
  </verify>
  <done>
    - The resolver tests pass, including the ~/Applications and mdfind-only cases.
    - Both provisioners return errorCode 'crossover-missing' with the "CrossOver is required" message and no spawn when CrossOver is absent.
    - bottle.ts has no CXBOTTLE_BIN and no CrossOver.app literal in code.
    - The only non-test CrossOver.app literal under src/ is the candidate in crossoverLocation.ts.
    - tsc is clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Gate install() on CrossOver before routing, keep markBridgeFailed for real bridge failures only, and stop logging deferrals as Finished (fix directions 3 and 4)</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/downloadmanager/utils.ts, src/backend/downloadmanager/downloadqueue.ts, src/backend/downloadmanager/__tests__/downloadqueue.test.ts</files>
  <behavior>
    games.test.ts (new describe 'quick 261024-cjq: missing CrossOver is a precondition, not a bridge failure', inside or beside the Phase 24 Plan 08 bridge-routing install describe at ~L3800, reusing its setup):
    - CrossOver absent: a bridge-eligible title (bridgeAllowlist.has true, isBridgeBottleReady false). install() resolves `{ status: 'error', error: <string containing 'CrossOver'> }`. provisionBridgeBottle, tellBottledSteamToInstall and downloadSteamDepots are NOT called. sendFrontendMessage is NOT called with 'steamBridgeSetupRequired' or 'steamBottleSetupRequired'.
    - No markBridgeFailed: after that failed install, flip CrossOver to present. A second install() on the SAME SteamGame/appId calls provisionBridgeBottle, i.e. it routes to the bridge, not to bottled Steam (the 19:45:12 reroute in the todo).
    - Belt and braces: CrossOver reported present but provisionBridgeBottle resolves `{ status:'error', errorCode:'crossover-missing', error:'CrossOver is required...' }` (a race). install() returns `{ status:'error', error }` with no steamBridgeSetupRequired. A following install() still calls provisionBridgeBottle again (not marked failed).
    - The existing BLOCKER 1 generic provisioning-failure test (no errorCode) is unchanged: it still marks failed and defers with reason 'bridge-bottle-provision-failed'.
    - CrossOver absent on a bottle-routed, NOT bridge-eligible title. install() returns the same error and does not send steamBottleSetupRequired (no reroute into bottled-Steam setup).
    downloadqueue.test.ts:
    - When installQueueElement resolves `{ status: 'done', deferredToSetup: true }`, the queue logs no 'Finished' line for that appName, does not add it to the finished list (downloadManager.set('finished', ...) not called with it), still removes it from the queue, and logs a line containing 'deferred'.
    - A plain `{ status:'done' }` still logs 'Finished install of <app>' (regression guard).
  </behavior>
  <action>
games.ts (per fix direction 4):
- Import `isCrossoverInstalled` and `CROSSOVER_MISSING` from './bottle'.
- Add a private helper `crossoverRequiredError(): InstallResult`. It returns `{ status: 'error', error: i18next.t('gamelib:steam.install.crossoverRequired', 'CrossOver is required to install Windows games on macOS. Install it from codeweavers.com, then try again.') }`. Task 3 adds the key to en.
- In `install()`, make the FIRST statement inside `if (routeThroughBottle) {`, before removeDemotedNativeOrphan and before `this.bridgeRoute()`: `if (isMac && !(await isCrossoverInstalled())) { logWarning(...precondition, not a bridge failure...); return this.crossoverRequiredError() }`.
  - Add a comment citing the todo: a missing CrossOver is a precondition failure, so it must NOT call markBridgeFailedThisSession. Doing so flips resolveBridgeRoute to 'failed-this-session' and silently reroutes the next Install to bottled Steam, which needs the same CrossOver. Bottled Steam is a narrow fallback and is never the answer to a missing engine.
- In `installBridgeGame`'s provisioning-failure branch, check `provisionResult.errorCode === CROSSOVER_MISSING` first. In that case log, return `this.crossoverRequiredError()`, and do NOT call markBridgeFailedThisSession or send steamBridgeSetupRequired. Leave the generic failure branch exactly as it is.
- Update installBridgeGame's JSDoc sentence "Any terminal failure ... marks this appId bridge-failed-this-session" to name the crossover-missing exception.
- Returning status 'error' means the download manager shows its existing failure dialog ("The installation of {{title}} failed: {{error}}"), logs "Install of X failed!", and does not log "Finished".

games.test.ts: extend the `jest.mock('../bottle')` factory. Declare `const crossoverInstalled = jest.fn()` next to `isBridgeBottleReady`. Add `isCrossoverInstalled: async () => crossoverInstalled() !== false` and `CROSSOVER_MISSING: 'crossover-missing'`. This plain-function-over-jest.fn shape is the one the file already uses for `findBridgeInstallBottle`, so it survives resetMocks: after reset crossoverInstalled() returns undefined, which reads as installed, and every existing routing test keeps passing unchanged. Tests needing absence call `crossoverInstalled.mockReturnValue(false)`. Expose the jest.fn through the mocked module (e.g. `__crossoverInstalled`) or via `jest.requireMock('../bottle')`. Also ensure `isMac` is true in the new tests the same way the surrounding describe already does.

downloadmanager (per fix direction 3):
- `installQueueElement`: widen its return type to `{ status: DMStatus; error?: string; deferredToSetup?: boolean }` and include `deferredToSetup` in the try-block's success return. The catch paths are unchanged.
- downloadqueue.ts loop: destructure `deferredToSetup` (undefined for updates) and pass it to `processNotification(element, status, deferredToSetup)`.
- When status === 'done' && deferredToSetup, processNotification logs `logInfo([action, 'of', appName, 'deferred to setup — nothing was installed'], LogPrefix.DownloadManager)` instead of 'Finished'. No notification change is needed, because the Steam toast is already suppressed.
- In the loop, skip `addToFinished` when deferredToSetup is true. `removeFromQueue` and advancing to the next element must still happen.
- Keep the change minimal. Do not touch the `finally` badge-clear logic in utils.ts, which already handles deferredToSetup.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/__tests__ && npx tsc --noEmit -p . && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/utils.ts src/backend/downloadmanager/downloadqueue.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts</automated>
  </verify>
  <done>
    - The new tests prove that a missing CrossOver returns a 'CrossOver is required' error, reaches no provisioner, opens no setup dialog, and leaves the next install routed to the bridge.
    - The generic provisioning failure behaves as before.
    - Deferred installs are logged as deferred, not Finished, and are not added to the finished list.
    - Full games.test.ts and downloadmanager suites are green; tsc is clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Truthful notice with a codeweavers.com link, a CrossOver-required message in bottled-Steam setup, i18n invalidation, and closing the todo (fix directions 1 and 2, UI half)</name>
  <files>src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx, src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx, public/locales/*/gamelib.json, public/locales/*/gamelib.mt.json, meta/i18nCatalogPresenceBaseline.json, .planning/todos/completed/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md</files>
  <action>
WineSelector/index.tsx (per fix direction 1):
- Change the `noCrossoverEngine` defaultValue to 'No CrossOver installation was found. CrossOver is required to install this game. Install it from codeweavers.com, then reopen this dialog.'
- After that text, inside the same `smallInputInfo` span, render a link-styled button (an `<a href="#">` or `<button className="linkButton">`, whichever pattern a sibling component in this folder or Settings uses; check NvidiaPrime.tsx). Its label is `tGamelib('gamelib:steam.install.getCrossover', 'Get CrossOver')`, and its onClick calls `window.api.openExternalUrl('https://www.codeweavers.com/crossover')`. Call preventDefault if you use an anchor.
- The wording must not promise that GameLib installs anything.

SteamBottleSetup.tsx (per fix direction 2, UI half):
- In handleConfirm's `result.status === 'error'` branch, when `result.errorCode === 'crossover-missing'`, set provisionError to `tGamelib('gamelib:steam.install.crossoverRequired', 'CrossOver is required to install Windows games on macOS. Install it from codeweavers.com, then try again.')`. That is the same key and default as games.ts in Task 2. Use the component's existing gamelib-namespace `t`, or add `useTranslation('gamelib')` the way WineSelector does.
- Otherwise keep `result.error`.
- Rewrite the ~L334 comment so it no longer quotes the false "GameLib will set one up" promise. It should say instead that `undefined` lets provisionBottle resolve CrossOver itself and fail with crossover-missing if none is installed.
- Optionally, when the error is crossover-missing, also render the same 'Get CrossOver' link button in the error phase.

Locales, per the 261012-f25 convention described in the interfaces block:
- In `public/locales/en/gamelib.json` under `steam.install`, set `noCrossoverEngine` to the new English text. Add `crossoverRequired` and `getCrossover` with the default strings above, keeping keys alphabetical within the object as the file does.
- For every OTHER locale directory carrying the key, remove `steam.install.noCrossoverEngine` IN PLACE from `gamelib.json`, and remove the `"steam.install.noCrossoverEngine",` line from `gamelib.mt.json`'s keys array. Those are the 48 listed by `grep -rln noCrossoverEngine public/locales`.
  - Do this with a small scratchpad Node script that parses and re-serialises with the file's existing indentation (4 spaces in gamelib.json; check the mt.json indentation). Assert that each file's diff is a single removed line.
  - If removing the last key in an object would leave a trailing comma, fix that. See hr/gamelib.json, where noCrossoverEngine is the last entry.
  - Write no translations, by hand or by model.
- Re-record the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`, then run `pnpm lint-translations:gamelib` without the env var. It must pass.

Close the todo:
- `git mv .planning/todos/pending/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md .planning/todos/completed/`.
- Append `## Closed` with "2026-10-24, quick 261024-cjq:" and a numbered list. Cover: the resolver (selected engine, then /Applications, then ~/Applications, then mdfind via getCrossover); the precondition in both provisioners (errorCode crossover-missing); the install() gate ahead of routing with no markBridgeFailedThisSession; deferred installs no longer logged as Finished; and the notice copy plus the link and locale invalidation.
- Note any deviation, e.g. a ready bottle with CrossOver later uninstalled still short-circuits 'done'.

Finally, run `graphify update .` (per CLAUDE.md) and `pnpm find-deadcode`. quick 261024-br4 had to fix module-local type exports flagged by find-deadcode, so do not export types or consts that only one module uses.

Prettier note per the conventions skill: `public/locales/` and `.planning/` are prettier-ignored, so the check below covers only the two .tsx files and the meta baseline. Confirm with `npx prettier --file-info meta/i18nCatalogPresenceBaseline.json` first. If it reports `"ignored": true`, drop it from the --check list and say so in the SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && ! grep -rn "will set one up" src public/locales/en && test "$(grep -rl noCrossoverEngine public/locales | grep -v '/en/' | wc -l | tr -d ' ')" = "0" && pnpm lint-translations:gamelib && test -f .planning/todos/completed/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md && test ! -f .planning/todos/pending/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md && grep -q '^## Closed' .planning/todos/completed/2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md && pnpm planning-gates && npx tsc --noEmit -p . && pnpm find-deadcode && npx prettier --check src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx</automated>
  </verify>
  <done>
    - No "will set one up" copy remains in src/ or the en catalogue.
    - The notice links to codeweavers.com.
    - Bottled-Steam setup shows "CrossOver is required" for errorCode crossover-missing.
    - Stale translations are invalidated in all non-en catalogues and the baseline is re-recorded; lint-translations passes.
    - The todo is in completed/ with a Closed note; planning-gates, tsc and find-deadcode are green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| mdfind output -> spawn path | getCrossover() returns filesystem paths that become the cxbottle binary spawned by provisioning |
| renderer -> backend steamBottleProvision | wineVersion supplied by the renderer selects the CrossOver bin dir |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cjq-01 | Elevation/Tampering | crossoverLocation.resolveCrossoverBinDir with renderer wineVersion | mitigate | Accept a wineVersion only when type === 'crossover' AND its bin path ends in `/SharedSupport/CrossOver/bin/wine` (crossoverBinDirFromWineBin) AND the sibling `cxbottle` exists. Spawn stays argv-form via spawnAsync, never shell-interpolated. |
| T-cjq-02 | Denial of Service | install() gate | mitigate | The missing-CrossOver gate never writes bridgeFailedThisSession, so installing CrossOver mid-session restores the bridge route without a restart. |
| T-cjq-03 | Information Disclosure | logWarning lines | accept | They log only bottle names and CrossOver paths under the user's own Applications folders. No credentials. |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__ src/backend/downloadmanager/__tests__` is green.
- `npx tsc --noEmit -p .` is clean, and `pnpm find-deadcode`, `pnpm lint-translations:gamelib` and `pnpm planning-gates` are green.
- `grep -rn "CrossOver.app" src --exclude-dir=__tests__` shows only the candidate in crossoverLocation.ts.
</verification>

<success_criteria>
All five fix directions in the todo are implemented and tested. CrossOver is resolved from the same install getCrossover() finds (including ~/Applications), and a missing CrossOver produces a truthful "CrossOver is required" message on both paths. It never marks the bridge failed or reroutes to bottled Steam. No failed or deferred install is logged as Finished. The todo is closed in completed/.
</success_criteria>

<output>
Create `.planning/quick/261024-cjq-fix-false-crossover-setup-notice-and-raw/261024-cjq-SUMMARY.md` when done
</output>
