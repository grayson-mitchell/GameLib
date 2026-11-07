---
phase: 61-unified-macos-engine-for-all-stores
reviewed: 2026-11-07T00:00:00Z
depth: standard
files_reviewed: 101
files_reviewed_list:
  - meta/knip-baseline.txt
  - src/backend/appshell/appManagement.ts
  - src/backend/engine/adoptBottle.ts
  - src/backend/engine/bottleLedger.ts
  - src/backend/engine/bottlePrimitives.ts
  - src/backend/engine/crossoverLocation.ts
  - src/backend/engine/demoStatus.ts
  - src/backend/engine/engineConfig.ts
  - src/backend/engine/engineDecision.ts
  - src/backend/engine/engineDialogs.ts
  - src/backend/engine/engineEligibility.ts
  - src/backend/engine/engineIds.ts
  - src/backend/engine/engineNoticeStore.ts
  - src/backend/engine/enginePins.ts
  - src/backend/engine/engineRegistry.ts
  - src/backend/engine/engineState.ts
  - src/backend/engine/engineSwitch.ts
  - src/backend/engine/engineTypes.ts
  - src/backend/engine/fallbackEngine.ts
  - src/backend/engine/gameEngineState.ts
  - src/backend/engine/gameKey.ts
  - src/backend/engine/gamePrefix.ts
  - src/backend/engine/gameProcessWatch.ts
  - src/backend/engine/importEngineSettings.ts
  - src/backend/engine/launchDeadline.ts
  - src/backend/engine/launchEngine.ts
  - src/backend/engine/launchSettings.ts
  - src/backend/engine/offlineRefusal.ts
  - src/backend/engine/perGameBottle.ts
  - src/backend/engine/pinnedEngineProgress.ts
  - src/backend/engine/processListing.ts
  - src/backend/engine/runTool.ts
  - src/backend/engine/testedCrossoverVersions.ts
  - src/backend/engine/toolSettings.ts
  - src/backend/game_config.ts
  - src/backend/launcher.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/engineFlowRegistration.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/sidecar/settingsFlowRegistration.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/nile/setup.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
  - src/backend/storeManagers/steam/bridge/bridgeConfig.ts
  - src/backend/storeManagers/steam/bridge/drm/runnerClone.ts
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
  - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
  - src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/storeManagers/steam/gameDrmLaunch.ts
  - src/backend/storeManagers/steam/gameInstall.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameLaunchOverlay.ts
  - src/backend/storeManagers/steam/gameMaintenance.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/stores.ts
  - src/backend/storeManagers/storeManagerCommon/games.ts
  - src/backend/tools/index.ts
  - src/common/types.ts
  - src/common/types/engine.ts
  - src/common/types/ipc/engine.ts
  - src/common/types/ipc/index.ts
  - src/common/types/ipc/steam.ts
  - src/common/types/ipc/steamAuth.ts
  - src/common/types/steam.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/screens/Game/GamePage/components/EngineBadge.tsx
  - src/frontend/screens/Game/GamePage/components/EngineNotices.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/EngineSelector/index.tsx
  - src/frontend/screens/Library/components/InstallModal/ImportDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/WineSelector/engineInstallChoice.ts
  - src/frontend/screens/Library/components/InstallModal/index.tsx
  - src/frontend/screens/Settings/components/EngineOverride.tsx
  - src/frontend/screens/Settings/components/SteamOverlayOverride.tsx
  - src/frontend/screens/Settings/components/engineOverrideLogic.ts
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/state/EngineState.ts
  - src/frontend/state/GlobalState.tsx
  - src/preload/api/engine.ts
  - src/preload/api/index.ts
  - src/preload/api/steam.ts
findings:
  critical: 5
  warning: 12
  info: 5
  total: 22
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-11-07
**Depth:** standard (diff-focused, `850819137..HEAD`)
**Files Reviewed:** 101
**Status:** issues_found

## Summary

The engine layer moved out of `steam/engine/` cleanly. The bottle primitives in
`bottlePrimitives.ts` are a faithful move, the closed-grammar write guard on `engineOverride`
covers both `setSetting` and `writeConfig`, and the per-game bottle encoding is injective and
can never produce `..`. The adversarial pass found five defects that ship incorrect behaviour:

1. Legacy CrossOver bottles whose names have a space (common) are classed as "broken CrossOver",
   so every launch falls back and rewrites the user's own bottle.
2. The non-Steam launch deadline kills running games whose command line the matcher cannot see.
3. The deadline's kill ignores the D-16 ledger, so it takes down other games in a shared bottle.
4. Sideload "Run installer" with an engine choice runs the installer in the wrong prefix.
5. The new-game `engineOverride` default makes the UI and the launch disagree, and an unrelated
   setting edit silently persists it.

Two issues were already tracked and are not counted again: the `needsFreshBottleConfirm`
plain-only gap (engineOverrideLogic.ts:48) and the untested overlay-step guard in
gameLaunchOverlay.ts. WR-07 below is a separate consequence of the first one.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The `--demo-status` bottle-name regex rejects valid legacy bottles, so CrossOver is reported broken and the user's bottle is switched to the built-in engine

**File:** `src/backend/engine/demoStatus.ts:20,85-87`, `src/backend/engine/engineDecision.ts:309-315,512-523`, `src/backend/engine/gamePrefix.ts:48-55`
**Issue:** `probeDemoStatus` returns `failed/invalid-bottle` for any name that fails
`/^[A-Za-z0-9._-]{1,64}$/`. That covers spaces, parentheses, apostrophes, non-ASCII and names
over 64 characters. Before this phase the only names probed were GameLib's own. D-05 now routes
every legacy `wineVersion.type === 'crossover'` game through the probe on the bottle it names
(`resolveGamePrefix` accepts anything `sanitizeBottleName` passes, spaces included). CrossOver
lets users name bottles freely, and "Windows 10 Games" is a normal name.

`preflightCrossover` does not retry `invalid-bottle`. It falls through to
`if (probe.kind === 'failed') return { kind: 'broken', ... }` without `inconclusive`. Under
Automatic, which is the derived engine for every migrated CrossOver game, `decideLaunchEngine`
then picks the pinned engine with reason `cx-broken`. `prepareBottleForEngine` then kills the
bottle's CrossOver wineserver, installs DXVK-macOS into the user's bottle and writes
`.gamelib-engine.json`. All of this happens on a perfectly healthy CrossOver, on every launch,
with a "CrossOver isn't working" toast. That breaks D-05 ("gains the fallback ... silently while
CrossOver is healthy") and D-09/G29 (only a real pre-flight failure means broken). Under a forced
CrossOver override the same game gets "override unavailable" and never launches.
**Fix:** Validate with the same chokepoint the rest of the layer uses. Treat a name the probe
cannot carry as no evidence, never as broken:
```ts
// demoStatus.ts
import { sanitizeBottleName } from './bottlePrimitives'
if (sanitizeBottleName(bottleName) !== bottleName || bottleName.length > 255) {
  return fail('invalid-bottle', 'bottle name rejected')
}
// CX_BOTTLE goes through env, not argv, so spaces are safe here.

// engineDecision.ts, before the generic failed -> broken return:
if (probe.kind === 'failed' && probe.reason === 'invalid-bottle') {
  return { kind: 'broken', binDir, build, inconclusive: true, detail: probe.detail }
}
```
Also add an Automatic rule: an inconclusive `broken` must not trigger a fallback that switches
engines.

### CR-02: The launch deadline kills running games whose process the matcher cannot see; the "stand down" the comment promises never happens

**File:** `src/backend/engine/gameProcessWatch.ts:9-10,37-54,107-108`, `src/backend/engine/launchEngine.ts:524-556`
**Issue:** The header says that for a bare-basename launch "the caller then has no signal and the
deadline stands down (CR-01)". The code does not do that. `watchForGameProcess` returns `null`
(which is what makes `bindDeadlineToMonitor` stand the deadline down) only when
`deriveGameProcessPrefixes(installPath)` is empty, meaning the install path is empty or relative.
For every real install it returns a live watcher. If no `ps` line ever matches, the 180 s
deadline fires, `onEngineLaunchDeadline` runs `wineserver -k` and `game.stop()`, and a game that
is running gets "Game didn't start".

Shapes the matcher cannot see:
- Games installed inside the bottle's `drive_c`. Sideload "Run installer" puts them there, and so
  do GOG/Amazon installers pointed at `C:\`. Wine maps such a path to the deepest drive root, so
  the exe shows as `C:\Program Files\...`. The derived forms are unix, `Z:\Users\...\drive_c\...`
  and `Y:\Library\...\drive_c\...`, and none of them matches `C:\`. The unix form lives about
  1-2 s under CrossOver (spike 068), against a 1.5 s first poll that starts before the spawn, so
  it is a coin flip.
- Spike 068 S4, cwd plus bare `Game.exe`: documented as unmatchable, but not handled.
- Any game whose real process runs from outside its install dir (a launcher exe that execs from
  `%LOCALAPPDATA%`, for example).

59-REVIEW CR-01 exists to prevent exactly this: a deadline without a proven match kills running
games.
**Fix:** Arm only when a match is provable for this launch, and add the `C:` form for installs
under the bottle:
```ts
// deriveGameProcessPrefixes(installPath, home, bottleDir?)
if (bottleDir && trimmed.startsWith(`${bottleDir}/drive_c/`)) {
  const rel = trimmed.slice(bottleDir.length + '/drive_c/'.length)
  forms.push(`C:\\${withTrailingSep(rel.split('/').join('\\'), '\\')}`)
}
```
Separately, turn the deadline into a no-kill notice when no match was ever seen and the launcher
process is still alive. Do not kill a bottle on the absence of a `ps` hit.

### CR-03: The deadline's kill ignores the D-16 ledger and stops every game in a shared bottle

**File:** `src/backend/engine/launchEngine.ts:471-502`
**Issue:** `onEngineLaunchDeadline` calls `killWineserver(bottleName, ...)` unconditionally. On
the legacy shared `GameLib` bottle (D-02), or any user bottle shared by several migrated games,
game A can be running (and recorded in the ledger) while game B's deadline fires. B's watcher
matches only B's install path. The `wineserver -k` then stops A as well. D-16 says GameLib must
never kill another game's wineserver in a shared bottle. `prepareBottleForEngine` honours that
through `busyRefusal`, but the deadline path skips the check. Combined with CR-02, a running
game B can take down a running game A.
**Fix:**
```ts
const others = otherGamesRunning(bottleName, key)
if (sel !== undefined && others.length === 0) {
  await d.killWineserver(...)
} else if (others.length > 0) {
  logWarning(`Engine: ${key} deadline fired in busy bottle "${bottleName}" (${others.join(',')}); not stopping the wineserver`, LogPrefix.Backend)
}
```
Stop only this game's runner (`game.stop(false)`) when the bottle is shared and busy.

### CR-04: Sideload "Run installer" with an engine choice runs the installer in the stored prefix and Wine, not in the game's bottle

**File:** `src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:269-294`
**Issue:** When `engineOverride` is set, `handleRunExe` passes
`{ ...gameSettings, ...engineConfig }` straight to `window.api.runWineCommand`. `engineConfig`
holds only `engineOverride` and `wineCrossoverBottle`. `wineVersion` and `winePrefix` keep the
stored defaults: the global Wine (possibly GPTK or a plain Wine) and the shared default prefix.
The `runWineCommand` IPC forwards its argument by identity
(`wineToolsFlowRegistration.ts:137`) and never goes through `resolveToolSettings`, and the
per-game bottle has not been created yet. So the installer runs in the wrong prefix, or with
`type: 'crossover'` against a bottle that does not exist. The game's registry entries and
redistributables land somewhere the launch, which uses the per-game bottle, never looks.
D-01 and D-17 are both violated, and the game will often fail to run.
**Fix:** Route through the game-aware path, which resolves and creates the bottle:
```ts
await window.api.runWineCommandForGame({ appName: app_name, runner: 'sideload',
  commandParts: [exeToRun], wait: true, protonVerb: 'runinprefix' })
```
`runWineCommandOnGame` already calls `resolveToolSettings(..., { ensureBottle: true })`.
Alternatively, have the backend resolve tool settings whenever `runWineCommand` receives a
config that carries `engineOverride`.

### CR-05: The new-game `engineOverride` default splits the UI from the launch, and an unrelated setting edit silently persists it

**File:** `src/backend/game_config.ts:304-312`, `src/backend/engine/engineConfig.ts:183-203`
**Issue:** `readSettings()` injects `defaultSettings.engineOverride = globalEngineOverride` for
any game without a config file. Two problems follow.

1. **UI and launch disagree.** The Engine control's `stored` comes from
   `useSetting('engineOverride')`, which goes through `requestGameSettings` and
   `GameConfig.getSettings()`, so it shows the global pick (for example `pinned:X`). The launch
   uses `readEngineForGame`, which reads the file directly (`readStoredGameConfig`), finds no
   entry and derives from the global `wineVersion`. It runs Automatic, or Legacy for a GPTK
   global, while the settings page shows something else and hides the Legacy warning (D-15).
   Steam titles hit the same split through `readSteamEngineOverride`.
2. **Silent persistence, against D-08.** `setSetting` on such a game sets
   `this.config = this.readSettings()` (defaults included) and flushes in explicit mode. Any
   unrelated toggle therefore writes `engineOverride = <global>` to disk. The game's engine
   changes without an Engine edit. A plain-prefix game whose derived engine was Legacy or pinned
   flips to Automatic. Through `resolveGamePrefix` rule (4) it then moves to a fresh per-game
   bottle, with no D-04 warning, and its saves are stranded in the old prefix.
   `requestGameSettings` followed by `writeConfig` in the Console Mode install does the same.

Preconditions: the user has set the global Engine, and the game has no per-game config file
(older or CLI-imported installs, or a new install made through a path that writes no config).
`readEngineForGame` also ignores the global `engineOverride` for games that follow the global
`wineVersion`, which conflicts with D-09.
**Fix:** Pick one source of truth. Either drop the `game_config.ts` default (new installs already
write `engineOverride` explicitly through the dialogs), or make `readEngineForGame` treat a
missing entry as "inherit the global engine":
```ts
const entry = readStoredGameConfig(args.appName, d)
if (entry === undefined) return resolveGlobalEngine(d.globalSettings(), d)
```
In either case, exclude `engineOverride` from the defaults that `setSetting` flushes.

## Warnings

### WR-01: A watcher that gives up leaves the deadline armed

**File:** `src/backend/engine/launchEngine.ts:544-552`, `src/backend/engine/gameProcessWatch.ts:167-170`
**Issue:** After 20 consecutive listing failures (about 30 s; both `ps` and `pgrep` failing, for
example under a sandbox profile) the watcher calls `onGiveUp`. That callback only removes the map
entry. The deadline stays armed with no signal source and kills the game at 180 s, which is the
CR-01 pattern again.
**Fix:** `onGiveUp: () => { deadlineWatchers.delete(key); cancelLaunchDeadline(key, 'monitor-unavailable') }`.

### WR-02: The unix-path form matches the Wine wrapper, so a CrossOver hang after the pre-flight never trips the deadline

**File:** `src/backend/engine/gameProcessWatch.ts:45`
**Issue:** The first prefix is the unix install path. Under CrossOver, the `wine "<unix>/Game.exe"`
wrapper line carries it for 1-2 s right after spawn, before any game code runs. A poll in that
window cancels the deadline as `first-match`. A launch stuck behind CrossOver's Expired dialog or
a wedged wineserver (the D-10 target) is then never reported as "Game didn't start". Steam's
monitor deliberately matched only the Windows `C:\` form.
**Fix:** For CrossOver selections, accept only the Windows-drive forms (`Z:`, `Y:`, `C:`). Keep
the unix form only for Wine-Staging and Wine Manager, where the preloader line is the game
process.

### WR-03: `selectEngineForLaunch` has no try/finally, so a throw leaks the registry, the overlay context and possibly the ledger into later launches

**File:** `src/backend/engine/launchEngine.ts:317-441`, `src/backend/launcher.ts:217-240`
**Issue:** `setEngineSelection` and `setLaunchOverlayContext` run before `await d.prepare(...)`.
If `prepare`, `recordDecision` or `notifyFallback` throws, the function rejects. The launcher
calls it outside its `try`, and `engineKey` is never assigned, so `releaseEngine` cannot run.
The stale selection then persists for the session:
- `getLaunchSettings` overlays it onto later launches, including Legacy and skip launches
  through `prepareWineLaunch` and `game.stop()`.
- `armEngineLaunchDeadline` arms a deadline on a later Legacy launch.
- `resolveToolSettings` targets it because `hasLiveSelection` is true.

A throw after line 425 also leaves a ledger entry, and every later engine switch in that bottle
is refused as "bottle busy".
**Fix:** Wrap everything after the first `setEngineSelection` in try/catch that calls
`endEngineLaunch(key)` before rethrowing. In `launcher.ts`, put the `selectEngineForLaunch` call
inside a try that sends the `done` status and closes the log writer.

### WR-04: An `invalid-bottle` refusal is silent; a deleted legacy bottle used to show "CrossOver bottle not found"

**File:** `src/backend/engine/launchEngine.ts:417-423`
**Issue:** Take a legacy-crossover game whose shared bottle was deleted. It is never created
(D-02), so it reaches `prepare`, which returns `invalid-bottle`. The `else` branch logs and
refuses with no dialog. The user presses Play and nothing happens. Before this phase,
`prepareWineLaunch` showed the "CrossOver bottle not found" dialog. engineDialogs.ts states the
intended behaviour: the in-app dialog is shown on every refused attempt.
**Fix:** Show a dialog in the `else` branch, reusing `box.error.cx-bottle-not-found.*` with
`{ bottle_name: bottleName }`.

### WR-05: The install dialogs can submit before the EngineSelector loads and fall back to the old Wine path

**File:** `src/frontend/screens/Library/components/InstallModal/index.tsx:149,775-784`, `.../EngineSelector/index.tsx:31-55`
**Issue:** `engineChoice` starts as `undefined` and is set only after both IPC calls resolve.
Pressing Install in that window sends `engineOverride={undefined}`. DownloadDialog and
ThirdPartyDialog then take the `else if (wineVersion)` branch with the hidden picker's defaults:
shared `GameLib` bottle, global Wine, possibly GPTK. That breaks D-01, D-11 and D-17.
**Fix:** Initialise `engineChoice` to `'automatic'` whenever `useEngineChoice` is true, or
disable Install until the selector reports `loaded`. Never fall through to the `wineVersion`
branch while `useEngineChoice` is true.

### WR-06: The Console Mode install still writes `wineVersion` and bypasses the Engine choice

**File:** `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx:328-335`
**Issue:** A non-Steam Windows install from Console Mode on macOS writes the Console Wine pick
and no `wineCrossoverBottle`. A CrossOver pick lands the new game on the shared `GameLib` bottle
(against D-01). A GPTK pick makes a brand-new game Legacy, which D-11 forbids. The per-game bottle
is never named.
**Fix:** On macOS, replace the Wine row with the engine id and write `engineInstallConfig(...)`
exactly as DownloadDialog does.

### WR-07: Plain to Automatic without the confirm does not persist the bottle, so a later pinned pick silently returns to the old prefix

**File:** `src/frontend/screens/Settings/components/EngineOverride.tsx:270-306`, `src/backend/engine/gamePrefix.ts:56-73`
**Issue:** This is related to the tracked `needsFreshBottleConfirm` gap, but it is a separate
data-loss consequence. On the no-confirm path (a Legacy plain-prefix game), only `setOverride` is
written. `wineCrossoverBottle` stays `GameLib`, and the per-game bottle is reached only through
rule (4) while the engine is Automatic or CrossOver. If the user later picks `pinned:` or
`wine-manager:`, rule (3) fails (stored bottle is not the per-game name) and rule (4) does not
apply. The game jumps back to its old plain prefix, and everything saved in the per-game bottle
since the switch is left behind, with no warning in either direction.
**Fix:** Whenever the target prefix becomes the per-game bottle, call
`setBottle(state.perGameBottleName)` together with `setOverride`, whatever the confirm path. When
the tracked gap is fixed, include `prefixKind === 'legacy'` with a non-bottle legacy prefix.

### WR-08: The setup engine step shares its key with a running launch and clobbers it

**File:** `src/backend/storeManagers/gog/setup.ts:112-134`, `src/backend/storeManagers/nile/setup.ts:88-114`
**Issue:** `setup()` calls `selectEngineForLaunch` and then, in `finally`, `endEngineLaunch(key)`,
both keyed `${runner}:${appName}`. If setup runs while the game is running or starting (a
post-update setup, or a repair), it overwrites the live registry entry and overlay context,
possibly with a different engine. `endEngineLaunch` then clears the running game's selection,
overlay, ledger entry and deadline watcher. After that, `stop()` and the tools see stored
settings, and D-16 no longer sees the game in the bottle.
**Fix:** Refuse setup while `getEngineSelection(key)` is set, or give setup a distinct key such as
`setup:` so it never touches launch state.

### WR-09: `sanitizeBottleName` accepts `.`, which resolves to the Bottles root; the switch path has no relative-path fence

**File:** `src/backend/engine/bottlePrimitives.ts:47-60`, `src/backend/engine/engineSwitch.ts:418-425`, `src/backend/engine/gamePrefix.ts:49`
**Issue:** `sanitizeBottleName('.')` returns `'.'` (and `'. '` trims to `'.'`), and
`getBottleDir('.')` is the CrossOver Bottles directory itself. `killBottleWineServerWith` and
`removeCreatedBottleDir` reject it through their `relative(...) !== bottleName` check.
`prepareBottleForEngine` checks only sanitize plus `existsSync`, so a stored
`wineCrossoverBottle: "."` on a crossover-type game makes it write `.gamelib-engine.json` into the
Bottles root and run the DXVK install with `WINEPREFIX=<Bottles root>`. The renderer's
`writeConfig` does not validate `wineCrossoverBottle`.
**Fix:** Reject `.` and any name whose `relative(bottlesRoot, getBottleDir(name)) !== name` inside
`sanitizeBottleName`, so every caller gets the fence. Also validate `wineCrossoverBottle` in the
`writeConfig` and `setSetting` IPC guards.

### WR-10: GOG uninstall and the post-update setup use the stored prefix and Wine for bottle-backed games

**File:** `src/backend/storeManagers/gog/games.ts:1047-1071,1330-1338`
**Issue:** The "overlay census" comments mark these reads as stored on purpose. For a per-game
bottle game, though, the stored `winePrefix` is the shared default and the stored `wineVersion`
is whatever the global held, not the bottle or engine the game runs on. The update path checks
`existsSync(gameSettings.winePrefix)` to decide whether to run `setup()`, so redistributables are
silently skipped after an update. Uninstall runs `unins000.exe` with stored settings, or skips it.
Every new macOS install is now bottle-backed (D-01), so this is no longer an edge case.
**Fix:** Use `resolveToolSettings(game, stored, { ensureBottle: false })` for both. Run setup when
the result is `engine` and the bottle is provisioned. Use the resolved settings for the
uninstaller.

### WR-11: The non-Steam first-need pinned download and bottle creation cannot be cancelled

**File:** `src/backend/engine/launchEngine.ts:223-228,297-302`
**Issue:** `ensureGameBottle` and `ensurePinned` get no `AbortSignal`. A first launch with no
CrossOver downloads the pinned engine (hundreds of MB) and runs `wineboot` for up to 180 s, and
neither Stop nor quitting can abort it. Steam passes a signal (59-REVIEW WR-01). The `aborted`
branches in launchEngine are unreachable in production.
**Fix:** Thread the launch abort controller (the one `game.stop` uses) through `opts.signal` into
both calls.

### WR-12: The ledger is released when the store launcher exits, not when the game does

**File:** `src/backend/launcher.ts:323-330`, `src/backend/engine/launchEngine.ts:559-569`
**Issue:** For non-Steam games the D-16 ledger entry lives until `game.launch()` resolves. A game
whose exe hands off to a child and exits (common launcher stubs) is gone from the ledger while it
still runs in the bottle. Another game's engine switch, or a probe-timeout wineserver stop, can
then kill it. Steam ties the entry to its bottle process monitor.
**Fix:** Release the ledger entry from the first-match watcher's process going away (poll the
matched pid), or keep it until `wineserver -w` returns for the bottle. At minimum, document the
gap next to D-16.

## Info

### IN-01: Per-game bottle names can collide on case-insensitive APFS

**File:** `src/backend/engine/perGameBottle.ts:54-69`
**Issue:** The encoding keeps `[A-Za-z]` as is, so app names that differ only in case map to the
same directory on the default case-insensitive volume. Short-uuid sideload ids are mixed-case
base58, so a collision is astronomically unlikely, but D-01 asks for collision-free names.
**Fix:** Escape uppercase letters, or append a short hash whenever the name contains uppercase
letters.

### IN-02: The install dialogs trust a renderer round-tripped bottle name; import computes it server-side

**File:** `src/frontend/screens/Library/components/InstallModal/WineSelector/engineInstallChoice.ts:39-54`
**Issue:** T-61-58/59 hold for `importGame`, but Download, ThirdParty and Sideload write
`wineCrossoverBottle` through `writeConfig` from a value the renderer holds. This is
inconsistent; see WR-09 for the missing write guard.
**Fix:** Have the backend `writeConfig` guard recompute `wineCrossoverBottle` whenever
`engineOverride` is present.

### IN-03: A redundant condition in toolSettings

**File:** `src/backend/engine/toolSettings.ts:163-167`
**Issue:** `wantsNonCrossover` already includes `marker === 'non-crossover'`, so
`marker !== 'non-crossover' && !wantsNonCrossover` reduces to `!wantsNonCrossover`. Separately, an
Automatic game with an expired CrossOver and no marker gets CrossOver tool settings, so Winetricks
blocks behind the Expired dialog (59-UAT G10).
**Fix:** Simplify the condition. Consider using the cached preflight (`engineState`) to pick the
built-in engine for tools when CrossOver is known to be expired.

### IN-04: `describeEngineKey` is an identity function with no value

**File:** `src/backend/engine/gameKey.ts:57-59`
**Fix:** Remove it, or give it a real description such as `runner/appName`.

### IN-05: Production code imports `backend/testUtils`

**File:** `src/backend/engine/runTool.ts:10`
**Issue:** `createFakeHomeProfile` is imported from a `testUtils` path in shipping code. This is
deliberate under the fake-HOME convention, but the path name invites a later "strip test utils
from the bundle" change that would break production.
**Fix:** Move the profile helper to a non-test path (for example `backend/process/fakeHomeProfile`)
and re-point the tests.

---

_Reviewed: 2026-11-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
