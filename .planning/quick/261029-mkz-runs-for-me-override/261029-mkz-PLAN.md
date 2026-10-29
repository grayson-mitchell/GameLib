---
phase: quick-261029-mkz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/runsForMe.ts
  - src/common/__tests__/runsForMe.test.ts
  - src/common/types/electron_store.ts
  - src/common/types/ipc.ts
  - src/backend/runsForMe/electronStores.ts
  - src/backend/runsForMe/index.ts
  - src/backend/runsForMe/__tests__/runsForMe.test.ts
  - src/backend/sidecar/storeRegistration.ts
  - src/backend/sidecar/__tests__/storeLayer.test.ts
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
  - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
  - src/backend/launcher.ts
  - src/preload/api/library.ts
  - .planning/IPC-PORT-INVENTORY.md
  - src/frontend/types.ts
  - src/frontend/state/GlobalStateV2.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/__tests__/filterEngine.test.ts
  - src/frontend/screens/Library/engineWiring.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/facetLabels.ts
  - src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx
  - src/frontend/screens/Library/components/GameCard/RunsForMeBadge.tsx
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts
  - src/frontend/screens/Library/components/InstallModal/__tests__/crossoverInstallRisk.test.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
  - src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx
  - src/frontend/screens/Game/GamePage/components/index.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - public/locales/*/gamelib.json
  - public/locales/*/gamelib.mt.json
autonomous: true
requirements: [QUICK-261029-MKZ]

must_haves:
  truths:
    - "On macOS, a game page (Info tab) shows a 'Runs for me' toggle for every non-Mac-native game; switching it on or off persists across an app restart"
    - "A game that launched and stayed running for 60 s or more is marked runs-for-me automatically; 59 s is not enough"
    - "Auto-set never overrides an explicit user 'off': a game the user switched off stays off after any number of long sessions until the user switches it on"
    - "A runs-for-me game falls in a new 'Runs for me' Runnability filter row (not 'Won't run' / 'Not yet checked' / 'Runs via bottle'); a Mac-native game stays 'Runs natively'"
    - "A runs-for-me game's library card shows a green check badge instead of the CrossOver rating dot"
    - "Installing a runs-for-me game via CrossOver shows no 'known not to work' / 'may have problems' confirm and no unrated notice"
  artifacts:
    - path: "src/common/runsForMe.ts"
      provides: "RunsForMeState type, key helper, isRunsForMeOn, auto/user transition rules, 60 s threshold"
      exports: ["RunsForMeState", "RUNS_FOR_ME_AUTO_THRESHOLD_MS", "runsForMeKey", "isRunsForMeOn", "nextRunsForMeAfterSession", "nextRunsForMeAfterUserToggle"]
    - path: "src/backend/runsForMe/index.ts"
      provides: "backend persistence, user setter, session recorder, runsForMeChanged push"
      exports: ["getRunsForMeMap", "setRunsForMeByUser", "recordPlaySession"]
    - path: "src/backend/runsForMe/electronStores.ts"
      provides: "runsForMeStore TypeCheckedStoreBackend"
      contains: "runsForMeStore"
    - path: "src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx"
      provides: "game page toggle"
    - path: "src/frontend/screens/Library/components/GameCard/RunsForMeBadge.tsx"
      provides: "green check card badge"
  key_links:
    - from: "src/backend/storeManagers/steam/bottleProcessMonitor.ts"
      to: "recordPlaySession"
      via: "the 'matched process(es) gone ... game stopped' branch"
      pattern: "recordPlaySession\\("
    - from: "src/backend/launcher.ts"
      to: "recordPlaySession"
      via: "after `await command` for non-steam runners"
      pattern: "recordPlaySession\\("
    - from: "src/backend/sidecar/enrichmentFlowRegistration.ts"
      to: "getRunsForMeMap / setRunsForMeByUser"
      via: "ipcMain.handle('getRunsForMeMap'|'setRunsForMe')"
      pattern: "'(getRunsForMeMap|setRunsForMe)'"
    - from: "src/frontend/state/GlobalState.tsx"
      to: "runsForMe slice in GlobalStateV2"
      via: "getRunsForMeMap pull on mount + handleRunsForMeChanged listener"
      pattern: "handleRunsForMeChanged"
    - from: "src/frontend/screens/Library/filterEngine.ts"
      to: "deps.runsForMe"
      via: "deriveRunnabilityTier 4th argument"
      pattern: "deps\\.runsForMe"
---

<objective>
Add a per-game "Runs for me" override for macOS games whose CrossOver rating says "Won't run" (or that have no rating): a user toggle on the game page, an automatic set after a session of 60 s or more (never overriding a user "off"), a new `runsForMe` Runnability tier with its own filter row and green check badge, and no CrossOver install-risk warning for such a game. State is backend-persisted per game (survives restarts, not localStorage).

Purpose: CrossOver ratings are crowd evidence about other people's Macs. Once a game is shown to run on this Mac, GameLib should stop calling it "Won't run" and stop warning before an install.
Output: a shared rule module, a backend store + two invoke channels + one push channel, auto-set hooks on the bridge/bottle monitor and the generic launcher, frontend tier/filter/badge/install-risk changes, a game page toggle, and strings in all 49 gamelib catalogs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md

Locked user decisions (from the task description; referenced below as U-1..U-3):
- U-1: a human toggle on the game page labelled "Runs for me" that switches on and off.
- U-2: GameLib sets it automatically once a game launched and stayed running for 60 s or more. Auto-set NEVER overrides an explicit user "off". User-off wins until the user turns it on again.
- U-3: a NEW runnability tier `'runsForMe'` with its own Runnability filter row and a distinct badge (green check), separate from CrossOver ratings. It takes precedence over the rating-derived tier and over `'notChecked'`. Native stays native. The install "known not to work" / "may have problems" warning is skipped for a runs-for-me game.

Persistence model (locked): tri-state `'auto' | 'user-on' | 'user-off'`; an absent key means unset. Effective "on" = `'auto'` or `'user-on'`.

Discretion choices made here (executor follows these):
- Map key is `${app_name}_${runner}`, the same shape as `gameKey()` in `filterEngine.ts:76` and `favouriteKeys`. `crossoverRatings` is keyed by app_name only, but the override is a per-runner fact (the same title can be a GOG and a Steam copy).
- On darwin, `'runsForMe'` is checked right after `is_mac_native` and BEFORE the `mac_arch === '32'` bottle rule and the `rating === undefined` -> null rule. A user who says a game runs gets the row even when the rating was never looked up. Linux and win32 behaviour is unchanged: the tier is a macOS-only concept, and those hosts never return it.
- Auto-set is recorded only on darwin (`recordPlaySession` takes a `platform` argument that defaults to `process.platform`). The toggle renders only on darwin and only for games that are not `is_mac_native`.
- Steam play duration comes from `bottleProcessMonitor.ts`, the only Steam seam that observes the game's own process (bridge, including DRM mode, and bottled Steam). Generic runners (legendary/gog/nile/sideload/zoom) come from `launcher.ts`'s `launchEventCallback`, whose `await command` resolves when the game process exits. `runner === 'steam'` is skipped there: its launch promise tracks a `steam://` hand-off or a bridge spawn, not the game, so its duration is not a play signal. Native Steam (`steam://rungameid`) launches have no stop seam, and Mac-native Steam games are tier `'native'` anyway, so nothing is lost.
- Push channel `runsForMeChanged` carries the full map after every change, mirroring `metadataChanged` / `crossoverIndexChanged`.

<interfaces>
From src/frontend/screens/Library/filterEngine.ts (current, lines ~51-150):
- `const VALID_RUNNABILITY_TIERS: RunnabilityTier[] = ['native','bottle','wontRun','notChecked']`
- `export function gameKey(game: GameInfo): string` returns `${game.app_name}_${game.runner}`
- `export function deriveRunnabilityTier(game: GameInfo, ratings: Record<string, number | null>, hostPlatform: string): RunnabilityTier | null` (win32 -> null; linux -> native|null; darwin -> native, then mac_arch '32' -> bottle, then rating undefined -> null, null -> notChecked, >=3 -> bottle, else wontRun)
- `export function runnabilityRowsForHost(hostPlatform: string): RunnabilityTier[]` (darwin -> ['native','bottle','wontRun','notChecked'])
- Callers inside the file: `passesRunnability` (~L232) and `countFor` (~L422), both pass `deps.crossoverRatings, deps.hostPlatform`.

From src/frontend/types.ts:
- L463 `export type RunnabilityTier = 'native' | 'bottle' | 'wontRun' | 'notChecked'`
- L510-522 `export interface FilterEngineDeps { ...; crossoverRatings: Record<string, number | null>; hostPlatform: string }`

From src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts:
- `export function resolveCrossoverInstallRisk({ platform, installsViaCrossover, rating }: { platform: string; installsViaCrossover: boolean; rating: number | null | undefined }): CrossoverInstallRisk` with kinds `none | unrated | confirm(known-not-to-work|may-have-problems)`.
- Callers: SteamDialog/index.tsx ~L542, DownloadDialog/index.tsx ~L294, ThirdPartyDialog/index.tsx ~L97. WineSelector/index.tsx ~L187-192 computes its own `isKnownNotToWork` passive hint and ~L291 renders the unrated notice. ConsoleMode/InstallOverlay/consoleSteamTarget.ts only mentions CrossoverBadge in a comment (no risk call); confirm with grep and leave it alone if that still holds.

From src/backend/storeManagers/steam/bottleProcessMonitor.ts:
- The "gone" branch (~L364-376): `const elapsedSeconds = Math.round((Date.now() - entry.matchedAt) / 1000)`, logs `matched process(es) gone after ${elapsedSeconds}s of play — game stopped`, then `sendTerminalDoneOnce`, `fireStoppedOnce`, `clearEntry`. The give-up branch (~L349-356) and `stopBottleProcessMonitor()` cancellation must NOT record a session.

From src/backend/launcher.ts `launchEventCallback` (starts L114):
- L154 `const startPlayingDate = new Date()` (set BEFORE pre-launch work; do not use it for the play signal)
- L264 `const command = game.launch(logWriter, launchArguments, args, skipVersionCheck)`
- L276 `const launchResult = await command.catch(... return false)` ; L362 `return { status: launchResult ? 'done' : 'error' }`

From src/backend/electron_store.ts: `TypeCheckedStoreBackend<Name extends ValidStoreName>(name, options)` with `get(key, default)`, `get_nodefault(key)`, `set(key, value)`, `delete(key)`, `has(key)`. Construction self-registers by name; `StoreStructure` lives in src/common/types/electron_store.ts (`gameOverridesStore` at ~L174 is the shape to mirror). Precedent store module: src/backend/game_overrides/electronStores.ts (`cwd: join(userDataPath, 'store'), name: 'game-overrides', clearInvalidConfig: true`).

From src/backend/sidecar/enrichmentFlowRegistration.ts: `registerEnrichmentFlows()` registers via `ipcMain.handle(channel, async (_event: unknown, ...args: unknown[]) => ...)`; `getGamelibFixStatus` (L215-220) is the newest precedent. Docstring header lists every channel and says "Registers the 15 enrichment channels".

From src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts: `'enrichmentFlowRegistration.ts': { invoke: 15, send: 0 }` with a dated comment line per change.

From src/backend/ipc.ts: `sendFrontendMessage<ChannelName extends keyof FrontendMessages>(channel, ...args)` (exported L80); typed by `FrontendMessages` in src/common/types/ipc.ts (L743; `crossoverIndexChanged` at ~L877). Invoke types live in `AsyncIPCFunctions` (L195; `getGamelibFixStatus` at ~L587).

From src/preload/api/library.ts: `makeHandlerInvoker(channel)` and `frontendListenerSlot(channel)` (e.g. L22 `export const handleCrossoverIndexChanged = frontendListenerSlot('crossoverIndexChanged')`).

From src/frontend/state/GlobalStateV2.ts: slice pattern `crossoverRatings: {}` + `setCrossoverRatings: (crossoverRatings) => set({ crossoverRatings })` (L46-47 interface, L93-94 impl). GlobalState.tsx L1749-1760: `window.api.handleCrossoverIndexChanged(...)` listener then a one-time `window.api.getCrossoverIndex()` pull.

From src/frontend/components/UI/ToggleSwitch/index.tsx: `ToggleSwitch({ htmlId, handleChange, value, title, disabled?, extraClass?, description?, fading? })`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shared rules, backend store, IPC channels, push and auto-set hooks</name>
  <files>src/common/runsForMe.ts, src/common/__tests__/runsForMe.test.ts, src/common/types/electron_store.ts, src/common/types/ipc.ts, src/backend/runsForMe/electronStores.ts, src/backend/runsForMe/index.ts, src/backend/runsForMe/__tests__/runsForMe.test.ts, src/backend/sidecar/storeRegistration.ts, src/backend/sidecar/__tests__/storeLayer.test.ts, src/backend/sidecar/enrichmentFlowRegistration.ts, src/backend/sidecar/__tests__/enrichmentFlows.test.ts, src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts, src/backend/storeManagers/steam/bottleProcessMonitor.ts, src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts, src/backend/launcher.ts, src/preload/api/library.ts, .planning/IPC-PORT-INVENTORY.md</files>
  <behavior>
    - runsForMe.test.ts (common): `nextRunsForMeAfterSession(undefined, 59_000)` -> undefined (no change); `(undefined, 59_999)` -> undefined; `(undefined, 60_000)` -> 'auto'; `('user-off', 3_600_000)` -> 'user-off' (user-off wins); `('user-on', 60_000)` -> 'user-on'; `('auto', 60_000)` -> 'auto'. `nextRunsForMeAfterUserToggle(true)` -> 'user-on', `(false)` -> 'user-off'. `isRunsForMeOn`: 'auto' and 'user-on' true; 'user-off' and undefined false. `runsForMeKey('Foo.Bar', 'gog')` -> 'Foo.Bar_gog'.
    - runsForMe.test.ts (backend, store mocked with an in-memory fake, `backend/ipc` mocked): `recordPlaySession('a', 'gog', 60_000, 'darwin')` stores 'auto' and pushes `runsForMeChanged` once with the full map; `59_000` stores nothing and pushes nothing; after `setRunsForMeByUser('a','gog',false)` a later `recordPlaySession('a','gog',600_000,'darwin')` leaves 'user-off' and does not push; then `setRunsForMeByUser('a','gog',true)` -> 'user-on'; `recordPlaySession(..., 'linux')` and `'win32'` store nothing; an appName containing dots round-trips intact (no dot-path keys).
    - enrichmentFlows.test.ts (real sidecar RPC, real fileStore under the suite's tmp home): invoke `setRunsForMe` with `{ appName: 'rfm.game', runner: 'steam', on: true }` then `getRunsForMeMap` returns `{ 'rfm.game_steam': 'user-on' }`; a payload with a non-string appName, an unknown runner, or a non-boolean `on` rejects/returns without writing.
    - storeLayer.test.ts: 'runsForMeStore' added to `ALL_VALID_STORE_NAMES` round-trips.
    - bottleProcessMonitor.test.ts: the gone branch calls the (mocked) `recordPlaySession` exactly once with `('<appId>', 'steam', elapsedMs)` where elapsedMs = now - matchedAt (use the suite's existing fake-timer / fake-ps pattern); the give-up branch and `stopBottleProcessMonitor()` do not call it.
  </behavior>
  <action>
1. Create `src/common/runsForMe.ts` (pure, no imports beyond `type { Runner } from 'common/types'`): export `type RunsForMeState = 'auto' | 'user-on' | 'user-off'`, `RUNS_FOR_ME_AUTO_THRESHOLD_MS = 60_000` (U-2), `runsForMeKey(appName, runner)` returning `${appName}_${runner}`, `isRunsForMeOn(state: RunsForMeState | undefined): boolean`, `nextRunsForMeAfterSession(current, elapsedMs): RunsForMeState | undefined` (returns 'auto' only when current is undefined AND elapsedMs >= threshold; otherwise returns current unchanged, so 'user-off' is never overwritten per U-2), and `nextRunsForMeAfterUserToggle(on: boolean)`. Doc comment states U-2's user-off-wins rule. Write its test first (RED), then implement.

2. Add `runsForMeStore: { games: Record<string, RunsForMeState> }` to `StoreStructure` in `src/common/types/electron_store.ts` (import the type from `common/runsForMe`). Create `src/backend/runsForMe/electronStores.ts` mirroring `game_overrides/electronStores.ts`: `new TypeCheckedStoreBackend('runsForMeStore', { cwd: join(userDataPath, 'store'), name: 'runs-for-me', clearInvalidConfig: true })`. Import it for side effect in `src/backend/sidecar/storeRegistration.ts` exactly like `_gameOverridesStore` (import alias + add to the `touched` array) and add `'runsForMeStore'` to `storeLayer.test.ts`'s `ALL_VALID_STORE_NAMES`.

3. Create `src/backend/runsForMe/index.ts`:
   - `getRunsForMeMap(): Record<string, RunsForMeState>` reads `runsForMeStore.get('games', {})` and returns a copy, dropping any value not in the three-state set (a hand-edited store must not leak garbage to the UI).
   - `setRunsForMeByUser(appName, runner, on): Record<string, RunsForMeState>` writes `nextRunsForMeAfterUserToggle(on)` (U-1), then pushes and returns the map.
   - `recordPlaySession(appName, runner, elapsedMs, platform = process.platform): void` returns early unless `platform === 'darwin'`; computes `nextRunsForMeAfterSession`; writes and pushes ONLY when the value changed; logs one `logInfo` line with LogPrefix.Backend naming the game and seconds when it auto-sets. It is wrapped so it never throws to its caller (log via logWarning on failure): a store write error must not break a game-stop path.
   - ALWAYS read and write the whole `games` record (`get('games', {})` / `set('games', next)`). Never `get('games.' + key)`: electron-store treats dots as path separators, and appNames contain dots.
   - Push with `sendFrontendMessage('runsForMeChanged', map)` from `backend/ipc`.
   - No timers, watchers or sockets are created (sidecar exit contract: nothing to unref).

4. IPC types in `src/common/types/ipc.ts`: in `AsyncIPCFunctions` add `getRunsForMeMap: () => Promise<Record<string, RunsForMeState>>` and `setRunsForMe: (args: { appName: string; runner: Runner; on: boolean }) => Promise<Record<string, RunsForMeState>>`; in `FrontendMessages` add `runsForMeChanged: (map: Record<string, RunsForMeState>) => void` with a one-line comment (quick 261029-mkz). Preload `src/preload/api/library.ts`: `export const getRunsForMeMap = makeHandlerInvoker('getRunsForMeMap')`, `export const setRunsForMe = makeHandlerInvoker('setRunsForMe')`, `export const handleRunsForMeChanged = frontendListenerSlot('runsForMeChanged')`.

5. Register in `registerEnrichmentFlows()` after `getGamelibFixStatus`: `ipcMain.handle('getRunsForMeMap', async () => getRunsForMeMap())` and `ipcMain.handle('setRunsForMe', async (_event, ...args) => ...)` that validates `args[0]` is an object with string non-empty `appName`, `runner` in the six-member Runner set ('legendary','gog','sideload','nile','zoom','steam'), and boolean `on`; on invalid input it logs a `logWarning` naming the rejection and returns `getRunsForMeMap()` unchanged (mirrors the T-51-30 validation in `installFormIpc.ts` `handleSetSteamBridgeUserRoute`). Update the module docstring channel list and the "Registers the 15" count to 17. In `flowRegistrationCensus.test.ts` change enrichment to `{ invoke: 17, send: 0 }` with a dated comment `// Quick 261029-mkz (2026-10-29): invoke 15 -> 17 -- getRunsForMeMap, setRunsForMe`. Add the round-trip and rejection cases to `enrichmentFlows.test.ts` using that suite's existing tmp-home containment (do not add a new spawn; the suite runs in-process).

6. Auto-set hooks (U-2):
   - `bottleProcessMonitor.ts` gone branch only: compute `elapsedMs = Date.now() - entry.matchedAt` once (derive the existing `elapsedSeconds` log value from it), then call `recordPlaySession(appId, 'steam', elapsedMs)` before `sendTerminalDoneOnce`, inside its own try/catch so cleanup always runs. Static import from `backend/runsForMe`. In `bottleProcessMonitor.test.ts` `jest.mock('backend/runsForMe')` and add the three assertions above.
   - `launcher.ts` `launchEventCallback`: capture `const launchedAt = Date.now()` immediately before `const command = game.launch(...)` (L264). After `const launchResult = await command...` resolves, add: if `runner !== 'steam' && launchResult` then `recordPlaySession(appName, runner, Date.now() - launchedAt)`. Comment why steam is skipped (its launch promise tracks the hand-off, not the game; bottleProcessMonitor records Steam sessions). Do not touch the existing tsStore playtime code.

7. `.planning/IPC-PORT-INVENTORY.md`: add a section before `## Not an IPC channel, but blocks Phase 35` titled `## Quick 261029-mkz — Runs for me override (2 channels) — **PORTED**`, following the `getGamelibFixStatus` / `steamGoOfflineCancel` precedent text: brand-new invoke-kind channels via `makeHandlerInvoker` in `src/preload/api/library.ts`, registered only in `enrichmentFlowRegistration.ts`, no Electron leg; the push channel `runsForMeChanged` is out of tally per `## Method`. Raise the Totals table `Unique channels` 230 -> 232 and `Ported to sidecar` 75 -> 77 (read the live numbers first; if they differ, add 2 to whatever is there), Unported unchanged, with the bold "raised" sentence, then the backticked names `getRunsForMeMap`, `setRunsForMe`. This file is prettier-ignored: hand-match the surrounding wrap.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/common/__tests__/runsForMe.test.ts src/backend/runsForMe/__tests__/runsForMe.test.ts src/backend/sidecar/__tests__/enrichmentFlows.test.ts src/backend/sidecar/__tests__/storeLayer.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm codecheck && pnpm planning-gates && F="src/common/runsForMe.ts src/common/__tests__/runsForMe.test.ts src/common/types/electron_store.ts src/common/types/ipc.ts src/backend/runsForMe/electronStores.ts src/backend/runsForMe/index.ts src/backend/runsForMe/__tests__/runsForMe.test.ts src/backend/sidecar/storeRegistration.ts src/backend/sidecar/__tests__/storeLayer.test.ts src/backend/sidecar/enrichmentFlowRegistration.ts src/backend/sidecar/__tests__/enrichmentFlows.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/storeManagers/steam/bottleProcessMonitor.ts src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/launcher.ts src/preload/api/library.ts" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "unexpectedly ignored: $f"; exit 1; }; done && npx prettier --check $F && npx eslint $F</automated>
    Note: `.planning/IPC-PORT-INVENTORY.md` is prettier-ignored (`{ "ignored": true }`), so no formatter check covers it; `pnpm planning-gates` (which runs preload-surface-gate.py) is its real gate.
  </verify>
  <done>Shared rule module and backend store exist; `getRunsForMeMap`/`setRunsForMe` are registered, typed, exposed in preload, censused (17) and bucketed in the inventory; `runsForMeChanged` is pushed on every change; bridge/bottle and generic-runner stops record sessions, 60 s sets 'auto', 59 s does not, user-off is never overwritten; all listed tests, codecheck, planning-gates, prettier and eslint pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Frontend runsForMe tier, filter row, card badge and install-risk skip</name>
  <files>src/frontend/types.ts, src/frontend/state/GlobalStateV2.ts, src/frontend/state/GlobalState.tsx, src/frontend/screens/Library/filterEngine.ts, src/frontend/screens/Library/__tests__/filterEngine.test.ts, src/frontend/screens/Library/engineWiring.ts, src/frontend/screens/Library/index.tsx, src/frontend/screens/Library/facetLabels.ts, src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx, src/frontend/screens/Library/components/GameCard/RunsForMeBadge.tsx, src/frontend/screens/Library/components/GameCard/index.tsx, src/frontend/screens/Library/components/GameCard/index.css, src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts, src/frontend/screens/Library/components/InstallModal/__tests__/crossoverInstallRisk.test.ts, src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx</files>
  <behavior>
    - filterEngine.test.ts, `deriveRunnabilityTier(game, ratings, 'darwin', runsForMe)`: rating 1 + 'user-on' -> 'runsForMe'; rating 1 + 'auto' -> 'runsForMe'; rating 1 + 'user-off' -> 'wontRun'; rating null + 'auto' -> 'runsForMe' (beats notChecked); rating undefined + 'user-on' -> 'runsForMe' (not null); rating 5 + 'user-on' -> 'runsForMe'; `is_mac_native: true` + 'user-on' -> 'native'; mac_arch '32' + 'user-on' -> 'runsForMe'; key is `${app_name}_${runner}` (a 'user-on' under a different runner does not apply); 'linux' and 'win32' ignore runsForMe entirely; omitted 4th argument behaves exactly as today (existing cases unchanged). `runnabilityRowsForHost('darwin')` -> ['native','runsForMe','bottle','wontRun','notChecked']; linux/win32 unchanged. `migrateRunnabilityFacetSelection` accepts a stored 'runsForMe'. A `countFor(... 'runnability', 'runsForMe')` case counts a runs-for-me game there and not under 'wontRun'.
    - crossoverInstallRisk.test.ts: `resolveCrossoverInstallRisk({ platform: 'darwin', installsViaCrossover: true, rating: 1, runsForMe: true })` -> `{ kind: 'none' }`; rating 3 + runsForMe -> none; rating null + runsForMe -> none (no unrated notice); `runsForMe: false` or omitted -> today's results unchanged.
  </behavior>
  <action>
Per U-3:
1. `src/frontend/types.ts`: `RunnabilityTier` gains `'runsForMe'` (update the comment: user-asserted, wins over every rating-derived tier, never over native). `FilterEngineDeps` gains `runsForMe: Record<string, RunsForMeState>` keyed by gameKey().
2. `filterEngine.ts`: add `'runsForMe'` to `VALID_RUNNABILITY_TIERS`; `deriveRunnabilityTier` gains an optional 4th param `runsForMe: Record<string, RunsForMeState> = {}`; on darwin, after the `is_mac_native` return, `if (isRunsForMeOn(runsForMe[gameKey(game)])) return 'runsForMe'` (before the mac_arch '32' rule and the undefined-rating null). Update the doc comment with the precedence. Pass `deps.runsForMe` at both internal call sites (`passesRunnability`, `countFor`). `runnabilityRowsForHost('darwin')` returns `['native','runsForMe','bottle','wontRun','notChecked']`. Write the new tests first.
3. Wire the deps: `engineWiring.ts` inputs + output gain `runsForMe`; `Library/index.tsx` reads `const { runsForMe } = useGlobalState.keys('runsForMe')` next to `crossoverRatings` (~L368) and passes it into the deps factory and its memo dependency list (~L785-806).
4. Labels: `facetLabels.ts` `RUNNABILITY_LABELS.runsForMe = ['gamelib:library.filterPanel.runsForMe', 'Runs for me']`; `FilterRunnabilityFacet/index.tsx` `runnabilityLabel` gains the matching `case 'runsForMe'` (the literal must equal the facetLabels pair, the WR-06 drift test checks this). Run `pnpm codecheck` and fix every other exhaustive `Record<RunnabilityTier, ...>` / switch it reports (grep `RunnabilityTier` across FilterChipRow, FocusRowStrip/focusRowSelectors, FilterFocusRow).
5. State: `GlobalStateV2.ts` adds `runsForMe: Record<string, RunsForMeState>` (initial `{}`) and `setRunsForMe` setter next to `crossoverRatings`. `GlobalState.tsx` componentDidMount, right after the crossover listener/pull (~L1749-1760): `window.api.handleRunsForMeChanged((e, map) => useGlobalState.getState().setRunsForMe(map))` and a one-time `window.api.getRunsForMeMap().then(...).catch((error) => window.api.logError(...))`.
6. Badge: new `GameCard/RunsForMeBadge.tsx` mirroring `CrossoverBadge.tsx` (empty span, label in `title`/`aria-label`, `pointerEvents: 'none'`) with class `gameCardRunsForMeBadge`, label `t('gamelib:library.runsForMeBadge', 'Runs for me on this Mac')`, rendering a green check glyph (an inline check icon or CSS check mark, not a text tick). `GameCard/index.tsx`: read `runsForMe` from `useGlobalState.keys`, compute `const runsForMeOn = platform === 'darwin' && !gameInfo.is_mac_native && isRunsForMeOn(runsForMe[runsForMeKey(appName, runner)])` (use whatever `platform` source the card already has in ContextProvider), and at ~L568 render `<RunsForMeBadge />` INSTEAD of `<CrossoverBadge ... />` when on. `index.css`: add `.gameCardRunsForMeBadge` reusing the `.gameCardCrossoverBadge` position/size rules, green background (use an existing green theme variable if one exists, e.g. the one the GameLib fix CheckCircle uses; otherwise a literal green).
7. Install-risk skip: `resolveCrossoverInstallRisk` gains optional `runsForMe?: boolean`; when true return `{ kind: 'none' }` right after the platform/installsViaCrossover guard (before the null/unrated check). SteamDialog, DownloadDialog and ThirdPartyDialog each read `runsForMe` from `useGlobalState.keys` (alongside `crossoverRatings`) and pass `runsForMe: isRunsForMeOn(runsForMe[runsForMeKey(appName, runner)])` (add `runsForMe` to any memo/callback dependency array that lists `crossoverRatings`). WineSelector: AND `isKnownNotToWork` and the unrated-notice condition (~L291) with `!runsForMeOn` computed the same way. Re-grep `resolveCrossoverInstallRisk` and `crossoverRating` under `src/frontend/screens/ConsoleMode` to confirm there is still no console-mode warning to skip; if one exists, apply the same flag.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/screens/Library src/frontend/components/UI/NavShell && pnpm codecheck && F="src/frontend/types.ts src/frontend/state/GlobalStateV2.ts src/frontend/state/GlobalState.tsx src/frontend/screens/Library/filterEngine.ts src/frontend/screens/Library/__tests__/filterEngine.test.ts src/frontend/screens/Library/engineWiring.ts src/frontend/screens/Library/index.tsx src/frontend/screens/Library/facetLabels.ts src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx src/frontend/screens/Library/components/GameCard/RunsForMeBadge.tsx src/frontend/screens/Library/components/GameCard/index.tsx src/frontend/screens/Library/components/GameCard/index.css src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts src/frontend/screens/Library/components/InstallModal/__tests__/crossoverInstallRisk.test.ts src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "unexpectedly ignored: $f"; exit 1; }; done && npx prettier --check $F && npx eslint $(echo $F | tr ' ' '\n' | grep -v '\.css$')</automated>
    Add any extra file codecheck forced you to touch (step 4) to both the prettier and eslint lists. If `chipLabels.realI18next.test.ts` or another real-catalog test fails only because the new en keys are missing, that is expected until Task 3; note it and re-run it in Task 3's verify.
  </verify>
  <done>`'runsForMe'` is a Runnability tier with its own darwin filter row, wins over every rating-derived tier and notChecked, never over native; the card shows a green check badge instead of the CrossOver dot for such a game; Steam/Download/ThirdParty confirms and the WineSelector hint/notice are skipped for it; the frontend state pulls on mount and follows `runsForMeChanged`; tests, codecheck, prettier and eslint pass.</done>
</task>

<task type="auto">
  <name>Task 3: Game page "Runs for me" toggle and strings in all 49 gamelib catalogs</name>
  <files>src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx, src/frontend/screens/Game/GamePage/components/index.tsx, src/frontend/screens/Game/GamePage/index.tsx, public/locales/*/gamelib.json, public/locales/*/gamelib.mt.json</files>
  <action>
1. Per U-1, create `RunsForMeToggle.tsx` taking `{ gameInfo: GameInfo }`. Returns null unless `platform === 'darwin'` (ContextProvider) and `gameInfo.is_mac_native !== true`. Reads `runsForMe` from `useGlobalState.keys('runsForMe')`, state = `runsForMe[runsForMeKey(gameInfo.app_name, gameInfo.runner)]`. Renders `ToggleSwitch` with `htmlId="runsForMeToggle"`, `value={isRunsForMeOn(state)}`, `title={t('gamelib:info.runsForMe.label', 'Runs for me')}`, `description={t('gamelib:info.runsForMe.description', ...)}`; when `state === 'auto'` also render a small line `t('gamelib:info.runsForMe.autoSet', 'Turned on automatically after a play session of a minute or more')`. `handleChange` calls `window.api.setRunsForMe({ appName, runner, on: event.target.checked })` and writes the returned map into the slice with `useGlobalState.getState().setRunsForMe(map)` (the push also arrives; both are idempotent); a rejected promise is logged via `window.api.logError`. Export it from `GamePage/components/index.tsx` and render `<RunsForMeToggle gameInfo={gameInfo} />` in the Info `TabPanel` directly after `<AppleWikiInfo gameInfo={gameInfo} />` (`GamePage/index.tsx` ~L633).

2. Strings (gamelib namespace, nested JSON, indent 4, keys sorted, hand-matched since `public/locales/` is prettier-ignored). en values:
   - `library.filterPanel.runsForMe`: "Runs for me"
   - `library.runsForMeBadge`: "Runs for me on this Mac"
   - `info.runsForMe.label`: "Runs for me"
   - `info.runsForMe.description`: "Mark this game as working on this Mac, whatever its CrossOver rating says. GameLib turns this on by itself after the game has run for a minute, unless you have turned it off."
   - `info.runsForMe.autoSet`: "Turned on automatically after a play session of a minute or more"
   Follow the quick 261027-ch9 Task 3 flow exactly (`.planning/quick/261027-ch9-*/261027-ch9-PLAN.md`, commit `b78a7ee37`): for the 48 non-English locales try `pnpm machine-fill-gamelib` first; if it fails (no key / 401), hand-author translations. Keep `GameLib` and `CrossOver` literal (check `meta/i18nGlossary.json` for do-not-translate terms). Validate every (locale, key) pair with the real `validateTranslation()` from `meta/machineFillGamelib.ts` via a scratchpad script (under `JEST_WORKER_ID`, as c4g/b9r/ch9 did), plus one sabotage control that must report problems. Add all five flat key paths to each of the 48 `gamelib.mt.json` `keys` arrays at sorted position (indent 2). Commit locale files by explicit path only, never `git add -A`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/machineFillGamelib.test.ts src/frontend/screens/Library/components/FilterChipRow src/frontend/screens/Game && pnpm lint-translations:gamelib && pnpm i18n-churn-guard && pnpm codecheck && test "$(grep -l '"runsForMe"' public/locales/*/gamelib.json | wc -l | tr -d ' ')" = 49 && test "$(grep -l 'info.runsForMe.autoSet' public/locales/*/gamelib.mt.json | wc -l | tr -d ' ')" = 48 && F="src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx src/frontend/screens/Game/GamePage/components/index.tsx src/frontend/screens/Game/GamePage/index.tsx" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "unexpectedly ignored: $f"; exit 1; }; done && npx prettier --check $F && npx eslint $F && echo OK</automated>
    `public/locales/*/gamelib.json` and `gamelib.mt.json` report `{ "ignored": true }` under `npx prettier --file-info`, so no prettier check is written for them; catalog parity, lint-translations:gamelib and i18n-churn-guard are their gates.
  </verify>
  <done>On macOS the Info tab of every non-Mac-native game shows a "Runs for me" toggle that reflects auto/user state, persists through the backend and updates the library tier/badge live; all five strings exist in 49 gamelib catalogs with 48 mt.json stamps; parity, translation lint, churn guard, codecheck, prettier and eslint pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar (`setRunsForMe`) | untrusted payload crosses into a backend store write |
| on-disk `runs-for-me.json` -> renderer | a hand-edited or corrupt store is read and pushed to the UI |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mkz-01 | Tampering | `setRunsForMe` handler | mitigate | validate object shape, non-empty string appName, Runner in the six-member set, boolean `on`; reject with logWarning and no write (Task 1 step 5) |
| T-mkz-02 | Tampering | `runsForMeStore` read | mitigate | `getRunsForMeMap` drops values outside the three-state set; `clearInvalidConfig: true` on the store |
| T-mkz-03 | Denial of service | game-stop paths (`bottleProcessMonitor`, `launcher.ts`) | mitigate | `recordPlaySession` never throws; monitor call sits in its own try/catch so `clearEntry` always runs |
| T-mkz-04 | Information disclosure | store contents | accept | appName/runner plus a three-state flag; no credentials or PII |
</threat_model>

<verification>
- All three tasks' automated blocks pass.
- `pnpm planning-gates` green (preload-surface coverage includes the two new invoke channels).
- Manual (optional, live): on macOS, open a "Won't run" game's Info tab, switch "Runs for me" on, return to the library: the card shows the green check, the Runnability panel has a "Runs for me" row counting it, and installing it shows no CrossOver confirm. Restart GameLib (restart `tauri dev` so the sidecar is rebuilt) and the state is still there.
</verification>

<success_criteria>
- Tier precedence: native > runsForMe > every rating-derived tier and notChecked (darwin only).
- Auto-set at >= 60 000 ms, not at 59 000 ms; user-off is never overwritten by auto.
- Install-risk confirm and unrated notice skipped for runs-for-me games.
- Persistence round trip proven through the real sidecar RPC and fileStore (enrichmentFlows.test.ts) and the store-layer census.
- No new timers/handles in the sidecar.
</success_criteria>

<output>
Create `.planning/quick/261029-mkz-runs-for-me-override/261029-mkz-SUMMARY.md` when done
</output>
