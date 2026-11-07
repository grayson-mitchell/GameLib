# Phase 61: Unified macOS engine for all stores - Research

**Researched:** 2026-11-07
**Domain:** In-repo refactor + feature extension (TypeScript backend, React frontend, Wine/CrossOver on macOS). No new external libraries.
**Confidence:** HIGH on the code inventory and integration points (read directly). MEDIUM on the non-Steam "game process exists" signal and shared-bottle concurrency (design gaps, not yet spiked).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01: New non-Steam Windows installs on macOS get a per-game bottle in CrossOver's Bottles directory, same layout as Steam's `GameLibSteamBridge-<appid>`, under a store-qualified name (e.g. `GameLib-<runner>-<appName>`; planner picks the exact scheme, which must be filesystem-safe and collision-free across stores). Fallback, adoption, per-bottle trial clock and notices then all work per game.
D-02: Existing games stay where they are. A game already on the shared `GameLib` bottle, another user-picked CrossOver bottle, or a plain per-game `winePrefix` keeps using it. Nothing copied or moved. On the shared bottle the trial clock and any fallback prefix update are shared by every game in it; accepted for legacy installs.
D-03: The no-CrossOver path is Phase 59's, unchanged (59 D-01..D-03): GameLib creates the per-game bottle in CrossOver's Bottles dir with the pinned engine and `USER=crossover`; when CrossOver is installed later it is adopted (`cxbottle.conf`) on the same prefix. Reuse `createFallbackBridgeBottle` / `adoptBottle.ts`, no second path.
D-04: A plain `winePrefix` cannot be routed to CrossOver. Games on one migrate to the explicit override matching their current Wine (D-06/D-07), launches unchanged, game marked Unsupported. If the user later picks Automatic or CrossOver, GameLib creates a fresh per-game bottle and warns that saves stay behind in the old prefix. It does not adopt or symlink the plain prefix.
D-05: A non-Steam game whose `wineVersion.type === 'crossover'` becomes Automatic on its existing bottle (whatever `wineCrossoverBottle` names). It gains fallback, trial notice and timeout silently while CrossOver is healthy.
D-06: A Wine Manager Wine-Staging build migrates to that build's override. If it is one of the pinned engines, it maps to that pin.
D-07: Anything outside the new option list (`toolkit`/GPTK, `proton`, custom Wine path, a Wine Manager build that isn't Wine-Staging) migrates to a read-only "Legacy: <name>" override that launches exactly as today and is marked Unsupported. Appears in the list only while selected; once the user switches away it is gone and can't be picked again.
D-08: Migration is derived at read time and written only on user save. When a game's config has no engine key, compute the engine from `wineVersion` on each read. Only an edit in the Engine control writes the engine key. `wineVersion` and `wineCrossoverBottle` are left untouched on disk (downgrade works, nothing to roll back). Do not use the `src/backend/migration/` runner; do not wait for Phase 68.
D-09: The global default becomes a global Engine control on macOS, defaulting to Automatic. The global Wine Version selector is hidden on macOS. A non-CrossOver global pick carries over as the default override for new installs, using the D-05..D-07 mapping.
D-10: One store-agnostic Engine control. Generalise `SteamEngineOverride` into a single component for every store on macOS. For non-Steam Windows games on macOS it replaces `WineVersionSelector` and `CrossoverBottle` on the Wine tab. Bottle is per game and GameLib-managed: no picker, and the prefix-path field is hidden for bottle-backed games. Linux and Windows settings unchanged.
D-11: Every store gets Steam's option list: Automatic (default), CrossOver, both pinned builds, installed Wine Manager Wine-Staging builds, plus the read-only Legacy entry when migrated (D-07). GPTK/toolkit and custom paths cannot be newly chosen ("no GPTK/-DXMT" engine rule).
D-12: Game-page surfaces identical across stores, from shared components: lift `EngineBadge`, `SteamEngineNotices` (and frontend `SteamEngineState`) into store-agnostic forms keyed by game (runner + appName), not Steam appId. Texts, thresholds, first-need download progress, fallback toast, trial notice, untested-version notice and no-CrossOver note all match Steam.
D-13: The launch log records the exact engine and version for every store (`engineLogLabel`, 59 D-14).
D-14: Same Unsupported text for every store: "Unsupported — known fixes and compatibility ratings don't apply" and the "Unsupported engine" badge, identical everywhere.
D-15: Migrated Legacy games show the same Unsupported badge straight after the update; the Engine control shows "Legacy: <name>" with the warning beneath.

Phase 59 decisions carried forward unchanged and applied to every store: per-launch fallback with no stored state (59 D-07); pinned build downloads on first need with progress in the launch flow (D-05); rollback is a release lever only (D-08); only pre-flight checks mean "broken CrossOver", with G29 two-probe corroboration (D-09); a post-pre-flight hang gives "Game didn't start" with no fallback retry (D-10); deadline stops when a game process exists (D-11); trial notice at <=7 days (D-13); untested-CrossOver notice shows once and never blocks (D-15); fallback toast and "Built-in engine (best-effort)" badge (D-06); no-CrossOver dismissible recommendation (D-04).

### Claude's Discretion
- Where the engine decision code lives once it leaves `steam/engine/`, and its API (must satisfy Phase 62 dependency-cruiser rules; a store-agnostic `src/backend/engine/` with Steam-only pieces left in `steam/` is the obvious shape, not locked).
- The per-game bottle naming scheme (D-01).
- Name and storage of the engine key in game config (reuse or generalise the Steam override key read by `readStoredEngineOverride`).
- How the "saves stay behind" warning (D-04) is presented.
- Whether `steam/engine/` stays as a thin Steam adapter or is removed entirely.

### Deferred Ideas (OUT OF SCOPE)
- A one-click "Move to its own bottle" action for legacy shared-bottle games.
- Ordering relative to Phase 65 (`bottle.ts` split) and Phase 68 (versioned stores) not discussed; D-08 removes any dependency on 68.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are assigned (Requirements: TBD). CONTEXT D-01..D-15 are the requirement set. Mapping used by this research:

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01/D-03 | Per-game bottle + Phase 59 creation path | Sections "Bottle creation hook", "Target layout" (bottle primitives) |
| D-02/D-04 | Legacy bottles/prefixes untouched; plain prefix cannot route to CX | "Engine key and read-time derivation", "Shared-bottle landmine" |
| D-05..D-09 | Read-time migration + global default | "Engine key and read-time derivation" (mapping table) |
| D-10/D-11 | One Engine control, option list | "Frontend" |
| D-12 | Shared surfaces keyed by runner+appName | "Frontend", "IPC" |
| D-13 | Launch log line | "Launch integration" |
| D-14/D-15 | Unsupported wording | "Frontend" (state derivation) |
| 59 carry-forward | Pre-flight, timeout, notices, fallback | "Launch integration", "Pitfalls" |
</phase_requirements>

## Summary

The Phase 59 engine layer (`src/backend/storeManagers/steam/engine/`, 13 files, 2,825 lines, 11 test files, 3,413 test lines) is already built on injectable deps and is mostly store-agnostic in logic, but is Steam-shaped in four ways: (1) every registry/state/deadline module is keyed by a numeric Steam `appId` (`/^[0-9]{1,10}$/` guards), (2) `engineSwitch.ts`, `engineState.ts` and `engineDecision.ts` default their deps to Steam-internal modules (`../bottle`, `../bottleProcessMonitor`, `../titleSettings`, `../stores`, `../bridge/...`), (3) `testedCrossoverVersions.ts` imports `defaultRunTool` from the Steam DRM `runnerClone`, and (4) "a game process exists" and "which bottle is this title's own" are answered by Steam machinery (`bottleProcessMonitor` matches `C:\` paths under `<bottle>/drive_c`, `bridgeBottleNameFor(appId)`).

The non-Steam launch path is the opposite shape: `launcher.ts` `runLaunchEventCallback` -> each manager's `launch()` (legendary/gog/nile directly, sideload via `storeManagerCommon/games.ts launchGame`) -> `prepareWineLaunch` -> `getWineFlags`/`runWineCommand`/`runRunnerCommand`. Settings are fetched in many places with `game.getSettings()` / `getAppSettings()`, all returning one in-memory `GameConfig` object, and the CrossOver case is a `wineVersion.type === 'crossover'` + `CX_BOTTLE=<wineCrossoverBottle>` convention. The cleanest integration is the one Steam already uses: a per-launch registered engine selection that is overlaid onto the settings used by the launch path (never written to disk), plus a new top-of-launch step that runs the same pre-flight/decision/download/prepare sequence as `selectLaunchEngine`.

Three real hazards the CONTEXT does not mention: (a) **shared-bottle concurrency**: `prepareBottleForEngine` kills the bottle's wineserver and refuses on shared bottles by consulting a Steam appId-keyed monitor, which cannot see other non-Steam games running in the same legacy `GameLib` bottle (D-02/D-05 leave many games there); (b) **launch-deadline "first match"** has no non-Steam equivalent because non-Steam games live at macOS install paths (`Z:\...`), not under `<bottle>/drive_c`, so `bottleProcessMonitor`'s prefix matching returns null; (c) **the key is already on disk** for Steam (`steamEngineOverride` in `GamesConfig/<appId>.json`), so generalising the name must keep reading the old key.

**Primary recommendation:** Create `src/backend/engine/` (store-agnostic: types, ids, pins, decision, switch, registry, state core, deadline, fallback download, tested versions, adopt, offline refusal, demo-status, plus extracted bottle primitives), keyed everywhere by a `GameKey` (`runner:appName` string), with Steam-only inputs (bridge verdict/DRM mode, bridge-bottle naming, overlay notices, monitor) injected by a thin `steam/engine/steamEngineDeps.ts` adapter. Land it as pure-move commits first (Phase 62 D-06 method), then generalise keys, then add the non-Steam launch hook, then the frontend.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Engine decision (CX pre-flight, pin, override) | Sidecar backend (`backend/engine/`) | — | Spawns `wine --demo-status`, touches bottles; renderer must never derive it (59 comment in `SteamEngineState.ts`) |
| Per-launch selection registry + settings overlay | Sidecar backend | — | In-memory, never persisted (59 D-07) |
| Read-time migration (`wineVersion` -> engine id) | Sidecar backend (config read path) | Frontend display via backend state | D-08; single implementation so UI and launch cannot disagree |
| Per-game bottle creation | Sidecar backend | — | `cxbottle --create` / wineboot; filesystem under CrossOver Bottles |
| Launch deadline / timeout | Sidecar backend | — | Timer + kill wineserver; must `unref()` (exit contract) |
| Engine control, badge, notices | Frontend (React) | Sidecar pushes state | Pure presentational; data from backend (`engineStateChanged`) |
| Global default engine | Frontend (Settings default page) | Sidecar `GlobalConfig` | D-09 |
| Known fixes / ratings applicability | Existing tier-2 (unchanged) | — | D-14 only changes wording |

## Standard Stack

No new packages. Everything is existing in-repo code. [VERIFIED: codebase read]

| Existing piece | Role in this phase |
|---|---|
| `jest` 29.7 + `ts-jest` 29.3 (`package.json`), projects Backend/Common/Frontend/Preload/Meta/Relay | All tests |
| `@testing-library/*` (frontend) | Component tests for the generalised Engine control/badge/notices |
| `dependency-cruiser` (`pnpm boundaries`) and the runner-literal ESLint ban (`meta/runnerLiteralSelectors.cjs`) | Must stay at zero |
| `i18next` namespace `gamelib` | Existing keys `steam.engine.*` carry the strings |
| zustand (`frontend/state/SteamEngineState.ts`) | Generalise the store |

### Package Legitimacy Audit
No external packages are installed or recommended. slopcheck not applicable. Packages removed: none. Packages flagged: none.

**Version/tool verification:** node v22.23.4, pnpm at /opt/homebrew/bin/pnpm [VERIFIED: shell].

## Architecture Patterns

### System Architecture Diagram

```
Play (renderer)
   |
   v
sidecar launch handler -> launcher.ts runLaunchEventCallback(runner, appName)
   |  (game.isNative()? -> skip engine; Linux/Windows -> skip engine)
   |  macOS + Windows game:
   v
engine/launchEngine.selectLaunchEngine(gameKey, game)         <-- NEW, mirrors steam gameLaunch.selectLaunchEngine
   |-- readStoredEngineOverride(gameKey)  (key, else derived from wineVersion = D-05..D-07)
   |-- resolve bottle: wineCrossoverBottle (legacy / per-game) | plain winePrefix (Legacy only)
   |-- offline refusal (offlineRefusal.ts)
   |-- decideLaunchEngine -> preflightCrossover (wine --demo-status, 2-probe G29)
   |        |- pinned/wine-manager override -> no pre-flight
   |        `- automatic/crossover -> healthy | expired | broken | missing
   |-- needsDownload -> ensurePinnedEngine (progress via gameStatusUpdate 'engine-download')
   |-- setEngineSelection(gameKey, sel)         (in-memory registry)
   |-- prepareBottleForEngine (DXVK swap, marker, wineserver kill)   [refuse if other game running in bottle]
   |-- log engineLogLabel(...) lines (D-13); recordLaunchDecision -> push engineStateChanged
   |-- toast if fell back (automatic only)
   |-- arm launch deadline (180 s) -----------------------------+
   v                                                            | first game process seen / launcher exit -> cancel
settings overlay: getLaunchSettings(game) = registry? buildFallbackGameSettings(bottle, sel) : stored settings
   |
   v
store manager launch() -> prepareWineLaunch -> getWineFlags / runWineCommand / runRunnerCommand
   |                                                            |
   `--> game runs ----------------------------------------------+--> deadline fires: kill bottle wineserver,
                                                                     abort command, "Game didn't start" dialog
   on exit: clearEngineSelection(gameKey)
```

### Recommended Project Structure (proposal; planner may adjust file names, not the dependency direction)

```
src/backend/engine/                 # store-agnostic, no runner literals (ESLint ban applies here)
├── engineTypes.ts                  # moved as-is (EngineSelection, engineLogLabel)
├── engineIds.ts                    # moved as-is (parseEngineOverride closed grammar) + 'legacy:<name>' parse for display only
├── enginePins.ts, fallbackEngine.ts, testedCrossoverVersions.ts, demoStatus.ts, offlineRefusal.ts, adoptBottle.ts
├── gameKey.ts                      # GameKey = `${runner}:${appName}`; safe-name guard (replaces digits-only appId regex)
├── engineRegistry.ts               # Map<GameKey, EngineSelection>
├── launchDeadline.ts               # Map<GameKey, LaunchDeadline>; log prefix param
├── engineDecision.ts               # deps default to generic modules; readOverride(gameKey)
├── engineSwitch.ts                 # monitorPhase/ownBottleName deps become per-bottle (see Landmine 1)
├── engineState.ts                  # generic compute(); Steam extras supplied via deps
├── engineConfig.ts                 # read-time derivation: deriveEngineFromSettings(), readStoredEngine(gameKey)
├── bottlePrimitives.ts             # getBottleDir, sanitizeBottleName, killBottleWineServerWith, buildFallbackGameSettings, createFallbackBottle (extracted from steam/bottle.ts)
├── perGameBottle.ts                # perGameBottleName(runner, appName), ensureGameBottle()
└── launchEngine.ts                 # selectLaunchEngine(game), overlay, deadline wiring
src/backend/storeManagers/steam/engine/
└── steamEngineDeps.ts              # thin adapter: bridgeInstallBottleFor, isDrmModeTitle, overlay notices, monitor phase
```

Dependency direction: `launcher.ts` and the four non-Steam managers -> `backend/engine/*` (allowed: the cruiser rule only restricts `launcher.ts` -> `storeManagers/*` other than `index.ts`, and manager -> sibling manager). `steam/*` -> `backend/engine/*`. `backend/engine/*` must NOT import `storeManagers/steam/*` (otherwise a new cycle engine <-> steam; no rule forbids it but it defeats the move). Steam-only inputs enter through the injected deps object, which the Steam adapter builds. `.dependency-cruiser.cjs` rules: `no-cross-store-manager`, `launcher-only-via-store-managers-index`, `no-depot-parent-back-edge`, `no-circular-depot`, `games-split-modules-are-leaves` — none blocks this layout. [VERIFIED: .dependency-cruiser.cjs read]

### Steam-only vs store-agnostic inventory (`steam/engine/`)

| File (lines) | Verdict | What binds it to Steam | Action |
|---|---|---|---|
| `engineTypes.ts` (58) | agnostic | none | move |
| `engineIds.ts` (32) | agnostic | none | move |
| `enginePins.ts` (73) | agnostic | none | move |
| `offlineRefusal.ts` (56) | agnostic (pure) | none | move |
| `adoptBottle.ts` (63) | agnostic | none | move |
| `demoStatus.ts` (155) | agnostic | log prefix only | move |
| `fallbackEngine.ts` (460) | agnostic | `LogPrefix.Steam` in logs; engine temp sweep wired in `sidecar/bootstrap.ts` | move; log prefix to `LogPrefix.Backend` or neutral |
| `testedCrossoverVersions.ts` (96) | agnostic except one import | `defaultRunTool` from `steam/bridge/drm/runnerClone` | move `RunTool`/`defaultRunTool` into `backend/engine` (or a generic util) and have runnerClone import it back |
| `launchDeadline.ts` (140) | keyed by digits-only appId | `APP_ID_RE`, `LogPrefix.Steam` | re-key to GameKey |
| `engineRegistry.ts` (46) | keyed by digits-only appId | regex guard, `LogPrefix.Steam` | re-key |
| `engineDecision.ts` (619) | logic agnostic | default deps: `../crossoverLocation`, `../bottle` (`persistedWineBins`, `killBottleWineServerWith`), `../bottleProcessMonitor`, `../titleSettings` (`readStoredEngineOverride` -> `steamEngineOverride`) | move; replace defaults |
| `engineSwitch.ts` (579) | logic agnostic | `bridgeBottleNameFor`, `getBridgeBottleSettings`, `getBottleProcessMonitorPhase`, "shared-bottle" refusal by appId | move; deps become bottle-scoped (Landmine 1) |
| `engineState.ts` (448) | partly Steam | `findBridgeInstallBottle`, `bridgeBottleNameFor`, `readBridgeVerdict` (DRM mode), `OVERLAY_STEPS`, `steamEngineNoticeStore`, `SteamEngineState` type with overlay/exit notices | split: generic `compute` + preflight cache + trial/untested/no-CX notices move; DRM mode, overlay/exit notices, bridge-install lookup stay Steam-side behind deps |

Steam importers to repoint (Phase 62 D-05: no façade, repoint every importer and every `jest.mock` path): `steam/bottle.ts`, `gameLaunch.ts`, `gameInstall.ts`, `gameBridgeLaunch.ts`, `gameLaunchOverlay.ts`, `gameDrmLaunch.ts`, `games.ts`, `sidecar/bootstrap.ts`, `sidecar/steamAuthFlowRegistration.ts`, and tests: `steam/__tests__/games.test.ts` (heavy: `jest.mock('../engine/engineDecision'|'engineSwitch'|'engineState'|'fallbackEngine')`, `requireMock`/`requireActual` of `engineRegistry`, `launchDeadline`, `enginePins`; ~16k-line file), `steam/__tests__/bottle.test.ts` (`adoptBottle`), `sidecar/__tests__/engineTempSweepBootWire.test.ts`, `sidecar/__tests__/steamEngineFlows.test.ts`. [VERIFIED: grep]

### Pattern 1: Per-launch selection + settings overlay (Steam precedent)
**What:** `getBridgeBottleSettings(appId)` checks (DRM runner) -> `getEngineSelection(appId)` non-CrossOver -> `buildFallbackGameSettings(bottle, sel)` -> stock. Nothing persisted.
**For non-Steam:** add `getLaunchSettings(game)` in `backend/engine/launchEngine.ts`: `registry.get(key) ? { ...stored, ...buildFallbackGameSettings(bottle, sel) } : stored`. Use it in the four `launch()` methods and `prepareWineLaunch` instead of bare `this.getSettings()` / `getAppSettings()`, and in `launcher.ts` `runLaunchEventCallback` after the engine step. Do NOT mutate `GameConfig.get(app).config` in place: `setSetting` flushes `this.config` to disk, which would persist the fallback `wineVersion`/`winePrefix`. [VERIFIED: game_config.ts `setSetting` writes `this.config`]
**Anchor:** the settings object is consumed at `legendary/games.ts:~889` (`this.getSettings()` then `getWineFlags(gameSettings, ...)` -> `--wine`, `--wine-prefix`), `gog/games.ts:~587`, `nile/games.ts:~316/594`, `storeManagerCommon/games.ts:~171` (`getAppSettings`), `launcher.ts:140` and `:829` (`prepareWineLaunch`). Missing one of these sites silently launches a fallback game with CrossOver settings (or vice versa); a unit test must assert every launch-path settings read goes through the overlay (see Validation).

### Pattern 2: Engine key and read-time derivation (D-08)
**Key name (recommended):** new `GameSettings.engineOverride?: string` (same closed grammar as `parseEngineOverride`). Reader `readStoredEngineOverride(gameKey)` returns `engineOverride` if a string, else for Steam only the legacy `steamEngineOverride`, else derives from `wineVersion`. Writes by the Engine control go to `engineOverride` only. Rationale: `steamEngineOverride` is already persisted in users' `GamesConfig/<appId>.json` (read straight from the file, `titleSettings.ts` comment: `GameConfig.get(id).config` fills asynchronously, 59-UAT G11) so a rename without a fallback reads every Steam title as Automatic. Alternative of reusing `steamEngineOverride` verbatim for all stores is zero-migration but misleading; either is acceptable, but the fallback read is mandatory. [A1]
**Read path:** must be a straight file read like `readStoredTitleConfig` (not `GameConfig.get().config`) for the pre-flight/launch decision. Generalise `readStoredTitleConfig(appId)` (digits-only guard, `GamesConfig/<id>.json`, entry keyed by id) to accept non-Steam appNames: legendary/gog/nile/sideload appNames are not numeric (Epic: hex-ish, GOG: numeric, Amazon: `amzn1.adg...`, sideload: arbitrary). Use a containment guard equivalent to `isContainedGameConfig` in `sidecar/settingsFlowRegistration.ts:109` (no `/`, `..`, NUL; resolved path inside `gamesConfigPath`). [VERIFIED: titleSettings.ts, game_config.ts]
**Derivation table (only when no engine key; run on every read):**

| Stored `wineVersion` | Derived engine | Notes |
|---|---|---|
| `type 'crossover'` | `automatic` on existing bottle `wineCrossoverBottle` (D-05) | bottle must exist; else existing "bottle not found" dialog path stays |
| `type 'wine'`, `bin` under `toolsPath/wine/<ver>` and a Wine Manager `Wine-Staging-macOS` release | `wine-manager:<ver>` (D-06) | match via `wineDownloaderInfoStore 'wine-releases'` (`installDir`) as `resolveWineManagerStaging` does |
| `type 'wine'`, `bin` equals a pin's `wineBin` (`pinnedEnginePaths`) | `pinned:<id>` (D-06) | |
| `toolkit`, `proton`, custom path, non-Staging WM build (incl. `-DXMT`, gptk) | `legacy:<name>` (D-07) | read-only; launch with stored settings exactly as today; never offered in the options list unless currently selected |
| none/missing | `automatic` | new default |

`legacy:<name>` must NOT go through `parseEngineOverride` into a launch path (it parses to `automatic` by design — that closed set is the T-59 validation point); make Legacy a separate derived variant (e.g. `{ kind: 'legacy', label }`) that bypasses `decideLaunchEngine` and launches with the stored settings. The renderer must never be able to write `legacy:*` (backend validation on the write path, see Security).
**Important subtlety:** a plain `winePrefix` game with `wine-manager`/pinned override launches on a plain prefix (not a bottle): the pinned/WM selection must use that game's `winePrefix`, not a bottle dir. `buildFallbackGameSettings(bottleName, ...)` hard-codes `winePrefix: getBottleDir(bottleName)`, so a variant taking an explicit prefix is needed for D-04/D-06 plain-prefix games. [VERIFIED: bottle.ts:1722]

### Pattern 3: Bottle identity (D-01/D-02/D-04) and creation hook
Recommended rule: **the bottle a game uses is always `settings.wineCrossoverBottle` when `wineVersion.type === 'crossover'` or the engine is bottle-backed**; new macOS installs get `wineCrossoverBottle = perGameBottleName(runner, appName)`; the engine key is independent. Writing it at install time keeps `knownFixPrefixDir` (`knownFixesRegistry.ts:540`), `InstalledInfo.tsx`, `getCrossoverBottleFolder` and `installed_games` bookkeeping working unchanged. Do not infer "per-game" from the engine key being present: that would make the first Engine-control save on a legacy shared-bottle game (D-05) silently switch it to a fresh bottle, violating D-02.
**Name scheme (proposal):** `GameLib-<runner>-<sanitized appName>`; `sanitizeBottleName` (in `steam/bottle.ts`) is the existing chokepoint — run it and verify round-trip equality. Epic appNames are 32-char ids, Amazon `amzn1.adg.product.<uuid>` contains dots, sideload appNames may be arbitrary strings: use a deterministic safe encoding (allow `[A-Za-z0-9._-]`, hex-escape the rest, cap length, fall back to a short hash suffix) and test collision-freedom across stores by including the runner. Verify against CrossOver bottle-name constraints before locking (not verified here). [ASSUMED A2]
**Where to create:**
1. Install: the install modal writes `winePrefix`/`wineVersion`/`wineCrossoverBottle` via `writeConfig` before `install()` (`DownloadDialog/index.tsx:~320`, same in `ImportDialog`, `ThirdPartyDialog`). On macOS replace this with: write `engineOverride: <chosen or 'automatic'>` and `wineCrossoverBottle: perGameBottleName(...)`, no wine picker. Backend creation should be lazy and idempotent (`ensureGameBottle(gameKey)`), called (a) at the start of GOG `setup` (the only store step that runs Wine during install, `gog/setup.ts`), and (b) from the launch engine step before pre-flight (covers imports, sideloads, Epic/Amazon where Wine first runs at launch, and any install whose creation failed or was cancelled). This is more robust than creating inside the install flow only.
2. Creation engine: `decideCreationEngine` (presence-check only: CrossOver present+executable -> `cxbottle --create --template win10_64` with `CX_CREATE_CAP_MS`; else pinned `createFallbackBridgeBottle`). Reuse `provisionBridgeBottle`/`createFallbackBridgeBottle` logic (extract the name-agnostic part: they already take `bottleName`; `provisionBridgeBottle` is documented Steam-only in comments and uses `isBridgeBottleReady`, which is just `isBottleProvisioned(bottleName)` — safe to reuse). [VERIFIED: bottle.ts:1293, 2290-2557]
3. Plain-prefix game later switched to Automatic/CrossOver (D-04): create the fresh per-game bottle at the time of the save (or lazily at next launch), set `wineCrossoverBottle`, and show the saves-left-behind warning in the Engine control (inline warning under the select before/after change; the existing pattern is `afterSelect` in `SelectField`). Not adopted, not symlinked.
**Imported games** (`importGame`, installFlowRegistration:629): writes `winePrefix`/`wineVersion`/`wineCrossoverBottle` if the renderer supplied them; macOS import UI should follow the same engine-key-instead-of-wine-picker rule.

### Anti-Patterns to Avoid
- **Overlaying by mutating `GameConfig.config`:** persists fallback wine on next `setSetting` flush.
- **Persisting the engine selection or "fell back" state:** violates 59 D-07 (nothing stored; first launch after CX recovers returns to CX).
- **Runner literals in `backend/engine/**`:** the ESLint ban (`meta/runnerLiteralSelectors.cjs`, scope `src/backend/**` except `storeManagers/**`) will fail. Use `isStore()`/`hasCapability()` from `common/storeCapabilities`. [VERIFIED: file header]
- **Re-export façades** from `steam/engine/` or `bottle.ts` (62 D-05): repoint importers and mocks instead.
- **Mixing pure moves with behaviour changes in one commit** (62 D-06): the first wave of plans should be bit-identical moves + import edits, verified by `git diff -M --stat` showing renames and by running the existing engine tests from the new location.
- **A second bottle-creation path** (D-03): extend `createFallbackBridgeBottle`/`provisionBridgeBottle`, don't write a parallel one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| CX health/trial/expiry detection | New probe | `probeDemoStatus` + `preflightCrossover` (G29 two-probe) | Timings and failure semantics measured in spikes 060, UAT G29 |
| Fallback bottle create/adopt | New wineboot sequence | `createFallbackBridgeBottle` + `writeCxbottleConf` | Spikes 056/059; `USER=crossover`, `current_dxvk-macOS`, marker file |
| Pinned engine download/verify | New downloader | `ensurePinnedEngine` | sha256 + temp sweep + progress |
| DXVK swap on engine change | Copy DLLs | `prepareBottleForEngine` | Marker `.gamelib-engine.json`, kill/restore ordering |
| Launch timeout | New timer | `armLaunchDeadline` (+`unref`) | Exit-contract compliant; supersede semantics |
| Settings write route | New IPC for the engine key | existing `setSetting` -> `applyGameSetting` (retry + `gameSettingWriteFailed`) | Engine control already uses `useSetting`; just add the key to `GameSettings` |
| Bottle-name safety | Own regex | `sanitizeBottleName` chokepoint | T-17-01/T-24-06 |

## Runtime State Inventory

This is a generalisation/migration phase for persisted per-game settings. Answers (all explicit):

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `GamesConfig/<appName>.json` per game: `wineVersion`, `winePrefix`, `wineCrossoverBottle` (non-Steam), `steamEngineOverride` (Steam, Phase 59). Global `config.json`: `wineVersion`, `wineCrossoverBottle: 'GameLib'` (`config.ts:375`). `steam_engine_notices` CacheStore (`noCrossoverNoteDismissed`, untested-build dismissals). `wineDownloaderInfoStore 'wine-releases'`. | **Code edit (read-time derivation), no data migration** (D-08). Keep the CacheStore name `steam_engine_notices` unchanged even if the module moves, or dismissals reset. Keep reading `steamEngineOverride`. |
| Live service config | None — no external service holds engine/bottle names (CrossOver bottles are local dirs). | None |
| OS-registered state | CrossOver bottle dirs `~/Library/Application Support/CrossOver/Bottles/<name>` with `cxbottle.conf`; per-bottle `.gamelib-engine.json` markers; per-bottle trial clock in `system.reg`. Existing shared `GameLib` bottle and `GameLibSteamBridge-<appid>` bottles stay. | None for existing; new per-game bottles are additive. |
| Secrets/env vars | None involve the engine key. `CX_BOTTLE` is set per launch by `setupWineEnvVars`. | None |
| Build artifacts | Sidecar SEA binary must be rebuilt for backend changes to show in `pnpm tauri:dev` (memory: tauri dev does not rebuild the sidecar). i18n catalogue (`gamelib` namespace) if strings change. | Rebuild sidecar before live UAT; run `lint-translations:gamelib` |

## Common Pitfalls

### Pitfall 1 (Landmine): shared-bottle wineserver kill and the Steam-only "running" probe
**What goes wrong:** `prepareBottleForEngine` consults `getMonitorPhase(appId)` to avoid killing a wineserver under a running game, and refuses with `shared-bottle` when `ownBottleName(appId) !== bottleName` (59-REVIEW WR-06). For non-Steam, the monitor never knows about legendary/gog/nile/sideload games, and legacy games share the `GameLib` bottle (D-02/D-05). Calling the function as-is either (a) never detects another game running in that bottle and kills its wineserver (data loss risk), or (b) refuses every legacy game with the "shared bottle" dialog (breaks D-05 "gains the fallback silently").
**Avoid:** introduce a launcher-level per-bottle "games running" ledger (`bottleName -> Set<GameKey>`), set when a launch is registered and cleared on exit/deadline/error, and make `getMonitorPhase`/`ownBottleName` bottle-scoped. Decide explicitly what a legacy shared-bottle game does when CX expires while another game in the bottle is running: recommendation is "refuse with the existing shared-bottle style dialog **only when another game is running in that bottle**; otherwise proceed" (D-02 accepts the shared consequences). Also note a Steam bridge title is never in the `GameLib` shared bottle; the legacy shared Steam bottle `GameLibSteamBridge` is separate. [VERIFIED: engineSwitch.ts:419-478]
**Warning signs:** a test that launches two games on one bottle and asserts the second launch neither kills nor flips DXVK under the first.

### Pitfall 2 (Landmine): no non-Steam "game process exists" signal
**What goes wrong:** `launchDeadline` is cancelled by `bottleProcessMonitor`'s `onFirstMatch`, which requires the install path to be under `<bottle>/drive_c` (`deriveWindowsPrefix` returns null otherwise and the monitor is a no-op). Non-Steam games live at macOS paths mapped through `Z:`. With a null monitor, `bindDeadlineToMonitor` stands the deadline down (CR-01) — so the "timeout on every CrossOver launch" would silently never arm. Arming without a match signal would kill running games at 180 s (the exact 59-REVIEW CR-01 failure).
**Avoid:** pick the first-match signal before planning. Options: (i) extend the monitor's prefix derivation to also accept `Z:\` + backslashed macOS path (needs a spike to confirm what `ps` shows for a CrossOver-launched game; unverified), (ii) match by executable basename under the bottle's wineserver (precedent: `raiseWineGameWindow({ processNames })` in `utils/wineWindowRaise.ts`, used by sideload), (iii) treat the CrossOver `wine` launcher child process exit/first stdout from the game as the signal. Whatever is chosen, keep `bindDeadlineToMonitor`'s fail-safe (no signal -> deadline stood down + log). [ASSUMED A3; LOW confidence on Z: command-line shape]
Also: for legendary/gog/nile the child is `legendary launch --wine <bin>`; killing means aborting via the runner `abortId` (`utils/aborthandler`) plus `killBottleWineServerWith`, not just killing a wine pid.

### Pitfall 3: Steam "5 s" assumptions in notices
The deadline is 180 s covering first-run prefix update, shared-redist and cold Wine-Staging start (59 comment). Non-Steam GOG/Epic first launches additionally run prerequisite installers (`installFixes`, `prepareLaunch`, Galaxy comm setup) inside `prepareWineLaunch`; arm the deadline **after** those, or the 180 s may expire during an installer. Steam deliberately armed before redist (D-11) because the redist is part of its monitored launch; decide per-store position and document.

### Pitfall 4: getSettings is read all over, including by the UI
`GameConfig.get(...).getSettings()` feeds the Settings screen (`requestGameSettings`). Do not apply read-time derivation by mutating what `getSettings()` returns for `wineVersion` — the Settings UI and `checkWineBeforeLaunch` self-heal (`launcher.ts` persists corrected `wineVersion` via `setSetting`) could write derived values to disk, violating D-08 ("`wineVersion` ... left untouched"). Derive into a **separate** field (`engineOverride` effective value returned alongside, e.g. in the engine state/IPC response and in the launch overlay), never into `wineVersion`.

### Pitfall 5: Crossover-only branches that must be audited
Every site below keys off `wineVersion.type === 'crossover'` and must behave correctly when the engine is Automatic-fallback (pinned `type: 'wine'` plus a bottle prefix) — this is the integration surface. [VERIFIED: grep]

| Site | Behaviour today | What the engine decision must drive |
|---|---|---|
| `launcher.ts:416-523` (`prepareLaunch`/settings pruning) | deletes `wineCrossoverBottle`/`winePrefix`/`autoInstallDxvk` by type | Must run on the overlay settings: pinned fallback keeps `winePrefix` (bottle dir) and `autoInstallDxvk=false` (set by `buildFallbackGameSettings`); crossover keeps `wineCrossoverBottle` and drops `winePrefix`. Check ordering so the prune sees the overlay. |
| `launcher.ts:588, 904` (`getCrossoverBottleFolder`, `installed_games`) | `wine --bottle X --verbose whoami` to find prefix | For pinned engine use the bottle dir directly (`getBottleDir`); do not call cx `wine --bottle` when CX is expired/missing (hangs behind the nag) |
| `launcher.ts:840-868` ("CrossOver bottle not found" dialog) | requires `cxbottle.conf` | Per-game bottle is created beforehand (lazy `ensureGameBottle`); for pinned fallback the dialog must not fire on a not-yet-created bottle |
| `launcher.ts:1196` (`setupWineEnvVars` `CX_BOTTLE`) | env | Fallback path uses `wine` type: sets `WINEPREFIX` (+ `USER=crossover`, from the settings env options) |
| `launcher.ts:1461` (`verifyWinePrefix`) | skips for crossover | For pinned fallback it would run `wineboot --init` on the bottle dir: harmless when the bottle exists, but must not create a stray prefix if the bottle was removed |
| `launcher.ts:1526` (`runWineCommand` prefix check) | skips for crossover | same |
| `knownFixesRegistry.ts:540` (`knownFixPrefixDir`) | bottle dir for crossover | for pinned type returns `winePrefix` — equal to bottle dir, fine |
| Frontend `GamesSettings/index.tsx:86` `isCrossover` | hides DXVK toggles, winetricks tab | For engine-controlled games derive from backend engine state, not `wineVersion` (Winetricks gating via `visibility.ts` needs the effective engine) |
| Frontend `WinePrefix.tsx:20`, `PreferSystemLibs.tsx:22`, install `DownloadDialog:302`, `ThirdPartyDialog:105`, `SteamDialog:575`, `WineSelector/index.tsx:166` | `wineVersion.type` UI gating, CrossOver install-risk dialog (`installsViaCrossover`) | On macOS the install-risk dialog still applies when the effective engine is CX/automatic; derive from engine, not `wineVersion` |

### Pitfall 6: Frontend state keyed by Steam appId collides across stores
`useSteamEngineState.byAppId[appName]` and the `steamEngineStateChanged` payload (`appId: string` guarded `/^[0-9]{1,10}$/`, line `handleSteamEngineStateChangedSignal`) ignore non-numeric ids. Epic/Amazon/sideload ids fail the guard. GamesConfig itself is keyed by appName only, so `appName` collisions across runners are theoretically possible (existing behaviour); the engine state must still key by `runner:appName`.

### Pitfall 7: trial clock is per bottle
Per-game bottles each have their own demo clock (spike 060); the clock is stamped into the bottle's `system.reg` at creation (`InstallTime`, spike 060), so a brand-new per-game bottle may get its own trial window while the old shared bottle is already expired [ASSUMED, spike 060 did not run the create case]. This is expected; but the "N days remaining" notice for legacy games reflects the shared bottle, and a user with CX expired in the shared bottle but a fresh per-game bottle will see games differ (one on CX, one on fallback). Document in the notices test matrix; no code needed. [CITED: spike 060 README, `.planning/spikes/060-crossover-trial-expiry/`]

## Code Examples

### Existing deps-injected decision (move as-is, change defaults only)
```typescript
// Source: src/backend/storeManagers/steam/engine/engineDecision.ts (current)
export async function decideLaunchEngine(
  args: { appId: string; bottleName: string },
  deps?: Partial<EngineDecisionDeps>
): Promise<LaunchDecision>
```
Target: `args: { gameKey: GameKey; bottleName: string }`; `deps.readOverride(gameKey)`, `deps.monitorPhase(gameKey)`.

### Pattern for a store-agnostic IPC trio (replace Steam-named channels)
Current channels: `getSteamEngineState(appId)`, `listSteamEngineOptions()`, `dismissSteamEngineNotice(args)`, push `steamEngineStateChanged` (registered in `steamAuthFlowRegistration.ts:372-397`; typed in `common/types/ipc/steamAuth.ts:76-78` and `ipc/steam.ts:68`; preload `api/steam.ts:31-36`). Proposed: new domain `common/types/ipc/engine.ts` + `backend/sidecar/engineFlowRegistration.ts` + `preload/api/engine.ts` with `getEngineState({ runner, appName })`, `listEngineOptions({ runner, appName })` (needs the game to include the Legacy entry), `dismissEngineNotice`, push `engineStateChanged`. The Phase 62 census tests require the new domain file be paired with a FlowRegistration and included in the `ipc/index.ts` intersections (`ipcDomainCensus.test.ts`), and `flowRegistrationCensus.test.ts` lists registrations. Keep the old Steam channels only if something else still uses them; otherwise remove (no façade). [VERIFIED: file reads]

### Sidecar exit contract for any new timer
```typescript
// Source: src/backend/storeManagers/steam/engine/launchDeadline.ts
handle = setTimer(() => { /* ... */ }, timeoutMs)
handle.unref?.()          // required (CLAUDE.md convention)
```
The registry map must be empty at module load; `engineState`'s caches likewise. No new boot-time work.

## State of the Art

| Old (Phase 59) | New (Phase 61) | Impact |
|---|---|---|
| Engine decision keyed by Steam appId, in `steam/engine/` | Keyed by `runner:appName` in `backend/engine/` | All stores share decision + notices |
| Non-Steam: Wine Version selector + CrossOver bottle picker, no trial/timeout protection | One Engine control; protections applied | Expired-trial hang no longer possible on non-Steam CX |
| Steam override key `steamEngineOverride` | `engineOverride` (+ legacy fallback) | No data migration |

**Deprecated:** global Wine Version selector on macOS (hidden); per-game `WineVersionSelector`/`CrossoverBottle` on macOS non-Steam Wine tab.

## Frontend

- `GamesSettings/index.tsx:94` `isMacSteamTitle = !isDefault && isMac && hasCapability(runner,'usesBottleRuntime')`. The Engine branch should widen to "macOS Windows game (not native, not browser)". `usesBottleRuntime` is Steam-only ("bottle runtime with CrossOver-first selection", `storeCapabilities.ts`); do not set it true for all stores (it also drives `resolveCrossoverOnly` for the install modal and Steam's bridge flows). Add a new capability only if a per-store difference exists; otherwise the gate is platform + `!isNative` (`showWineTab` already computes this, line 96). The DXVK/esync/etc. toggles block is currently hidden for `isMacSteamTitle` (`{!isMacSteamTitle && (...)}`): decide for non-Steam macOS games whether those toggles stay (they write the per-game file and non-Steam launches do read them, unlike Steam) — recommendation: keep them for non-Steam; the fallback engine sets `autoInstallDxvk=false` because DXVK is managed by the engine switch, so hide **AutoDXVK** when the effective engine is bottle-managed.
- Default (global) settings page: `isDefault` branch must show the global Engine control on macOS (D-09) and hide the global Wine selector; "carry over" non-CX global pick as default override for new installs with D-05..D-07 mapping (derived at read, same function; global config key `engineOverride` default `automatic`). Config default for new games: `GameConfigV0.readSettings` copies `wineVersion`/`wineCrossoverBottle` from global; add `engineOverride` from global there.
- `SteamEngineOverride.tsx`: keep `optionLabel`, `selectValue`, `storedExtraOption`; replace `useSetting('steamEngineOverride')` with `useSetting('engineOverride', 'automatic')`; `appName` + runner from `SettingsContext`; the `<details>` summary text "Engine (advanced)" -> keep; add the Legacy entry (read-only, disabled MenuItem shown only while selected) and the D-04 warning slot. Test files exist: `SteamEngineOverride.test.tsx`, `.save.test.tsx`, `steamEnginePlacement.test.ts`, `useSettingsContext.setSetting.test.ts`.
- Eligibility: Steam sets `overrideEligible` on the backend (own bottle & not DRM). For non-Steam: eligible when macOS, Windows game, effective engine is not Legacy-locked (Legacy shows read-only entry + warning, switching away allowed).
- `EngineBadge`, `SteamEngineNotices`, `SteamEngineState` store: rename to `Engine*`, key `byGame[`${runner}:${appName}`]`; payload gets `runner` + `appName` instead of `appId`; remove digits-only guard in favour of a safe-name guard; `GamePage/index.tsx:225-246` fetch effect currently gated on `hasCapability(runner,'usesBottleRuntime') && isMac` — widen to macOS non-native Windows games.
- i18n: keys `steam.engine.*` in the `gamelib` namespace can be kept (text identical, D-12) to avoid churn, but `steam.engine.wineTabHint` ("GameLib chooses the Wine engine and bottle for Steam games.") and `sharedBottle` dialog text mention Steam and need neutral variants. Run `pnpm lint-translations:gamelib`.
- `EngineBadge` Unsupported tooltip: "This game uses an engine chosen in its Wine settings ({{engine}})" — for Legacy engines `engineLabel` should be "Legacy: <name>".

## Existing tests and how to move them

- `src/backend/storeManagers/steam/engine/__tests__/` : 11 files, 3,413 lines + `fixtures/stub-wine.sh`: `adoptBottle`, `demoStatus`, `engineDecision`, `engineIds`, `engineState`, `engineSwitch`, `fallbackEngine`, `launchDeadline`, `offlineRefusal`, `readStoredEngineOverride`, `testedCrossoverVersions`. Move with their sources (`git mv`), then repoint relative imports; they are written against injected deps so most need only path edits. `engineState.test.ts` and `engineSwitch.test.ts` need the key/dep changes.
- Frontend: `state/__tests__/SteamEngineState.test.ts`, `Settings/components/__tests__/SteamEngineOverride*.test.tsx`, `GamePage/components/__tests__/EngineBadge.test.tsx`, `SteamEngineNotices.test.tsx`, `GamesSettings/__tests__/steamEnginePlacement.test.ts`, `components/UI/SteamEngineLaunchNotice/__tests__`, `NoticeStack`.
- Backend integration: `steam/__tests__/games.test.ts` (16k lines, ~15 mock/requireMock sites for the engine modules) — the single most expensive repoint; do it in the pure-move wave.
- Sidecar: `steamEngineFlows.test.ts`, `engineTempSweepBootWire.test.ts`, `ipcDomainCensus.test.ts`, `flowRegistrationCensus.test.ts`, `gameConfigFirstWrite.test.ts`, `gameSettingWrite.test.ts`, `testContainment.test.ts`.
- Infra: Jest 29 / ts-jest projects (Backend, Common, Frontend, Preload, Meta, Relay); `createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile.ts` for any spawn (fakeHomeIsolation gate scans `src/` and `meta/`); stub wine script `fixtures/stub-wine.sh` is the model for any new spawn test. [VERIFIED: file reads]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node | tests/build | yes | v22.23.4 | — |
| pnpm | scripts | yes | /opt/homebrew/bin/pnpm | — |
| CrossOver | live UAT (pre-flight, trial) | yes | /Applications/CrossOver.app (wine present; many GameLibSteamBridge-* bottles) | pinned engine path testable by `sandbox-exec` licence denial per spike 060 |
| Pinned Wine-Staging + DXVK | live UAT of fallback | not checked (tools/ has dxmt, game-porting-toolkit, proton dirs; pin download is on first need) | — | download on first need |
| A non-Steam Windows game installed (Epic/GOG/Amazon/sideload) | live UAT | unknown | — | sideload a small PE (spike probes exist) |

Missing with no fallback: none identified for automated work; live UAT needs the operator's Mac.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Jest 29.7 + ts-jest 29.3 (projects: Backend, Common, Frontend, Preload, Meta, Relay) |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` (+ per-project configs) |
| Quick run command | `pnpm exec jest src/backend/engine src/backend/sidecar/__tests__/engineFlows.test.ts --silent` (adjust to new paths) |
| Full suite command | `pnpm test:ci` |
| Gates | `pnpm boundaries` (zero), `pnpm lint` (runner-literal ban zero), `pnpm planning-gates`, `pnpm lint-translations:gamelib`, `npx prettier --check <paths>` per task |

### Phase Requirements -> Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| move | engine tests pass from new location, zero cruiser/ESLint violations | unit + gate | `pnpm exec jest src/backend/engine` ; `pnpm boundaries` | existing tests move (Wave 0 = the move) |
| D-01 | `perGameBottleName` is safe, deterministic, collision-free across runners incl. dotted/odd appNames; round-trips `sanitizeBottleName` | unit (property-style table) | `jest src/backend/engine/__tests__/perGameBottle.test.ts` | Wave 0 |
| D-01/D-03 | `ensureGameBottle` picks CX create vs `createFallbackBottle` via `decideCreationEngine`; idempotent; cleans up on abort | unit with stub wine (`fixtures/stub-wine.sh`) + fake HOME | same | Wave 0 |
| D-02 | legacy `GameLib`/user bottle and plain prefix never moved/copied/written by engine step (fs snapshot before/after) | unit | `jest .../legacyBottleUntouched.test.ts` | Wave 0 |
| D-04 | plain-prefix + Automatic selection creates a fresh bottle, leaves old prefix byte-identical, surfaces warning flag | unit | engine + state tests | Wave 0 |
| D-05..D-07 | `deriveEngineFromSettings` table: crossover->automatic(bottle), WM staging->wine-manager, pin bin->pinned, toolkit/proton/custom/DXMT->legacy | unit (table) | `jest .../engineConfig.test.ts` | Wave 0 |
| D-08 | read with no key never writes file; save writes only `engineOverride`; `wineVersion`/`wineCrossoverBottle` bytes unchanged; `checkWineBeforeLaunch` self-heal does not persist derived values | unit (fs snapshot) | `jest .../engineConfig.test.ts` + `launcher` test | Wave 0 |
| D-08 compat | Steam titles with only `steamEngineOverride` still resolve the same engine | unit | `readStoredEngineOverride.test.ts` (moved, extended) | exists (extend) |
| D-09 | global default `engineOverride` copied into new game config; global Wine selector hidden on mac | unit + RTL | Settings tests | Wave 0 |
| D-10/D-11 | option list per store = Steam list; Legacy only while selected; GPTK/custom not offered; `legacy:` write rejected by backend | unit + RTL | `SteamEngineOverride*.test.tsx` (renamed) | extend |
| D-12 | state store keyed `runner:appName`; non-numeric Epic/Amazon ids accepted; push for game A does not touch B | unit | `EngineState.test.ts` | extend |
| D-13 | launch log contains `engine=... reason=...` line for each store | unit (spy logger) | launch-engine test | Wave 0 |
| D-14/D-15 | Unsupported badge + text identical for pinned/WM/Legacy on any runner | RTL | `EngineBadge.test.tsx` | extend |
| 59 pre-flight/timeout | expired/broken CX -> fallback selection + toast (automatic only); `crossover` override + broken -> unavailable dialog; deadline armed, fires `onDeadline` once, cancelled on first match, stood down on no monitor; `unref` called; registries empty at load | unit with fake timers | `launchDeadline.test.ts` (moved) + `launchEngine.test.ts` | extend/Wave 0 |
| settings overlay | every launch-path settings read in legendary/gog/nile/sideload uses the overlay (call-site census test grepping source for bare `this.getSettings()` inside `launch()`/`prepareWineLaunch`) | source-census unit | `jest .../launchOverlayCensus.test.ts` | Wave 0 |
| Landmine 1 | two games, one bottle: second launch does not kill/flip under the first | unit with injected ledger | `engineSwitch.test.ts` extension | Wave 0 |
| IPC | new engine domain paired with FlowRegistration; census green | existing census tests | `jest src/backend/sidecar/__tests__/ipcDomainCensus.test.ts flowRegistrationCensus.test.ts` | exists |
| exit contract | sidecar still exits by event-loop drain | smoke | `pnpm smoke:sidecar` (note: misses slow exit; reason by inspection for timers) | exists |
| live | CX expired (sandbox-exec licence denial) non-Steam game: fallback bottle, toast, badge; hang case shows "Game didn't start" | manual UAT on operator's Mac | `pnpm tauri:dev` (not `tauri:dev:run`), sidecar rebuilt first | manual-only: needs real CrossOver, GUI, real Wine |

### Sampling Rate
- **Per task commit:** the targeted Jest files for the touched module + `npx prettier --check <exact paths>` (check `--file-info` first; omit if all ignored) + `pnpm boundaries` when imports change.
- **Per wave merge:** `pnpm test:ci` scoped to Backend+Frontend+Common projects, `pnpm lint`, `pnpm boundaries`.
- **Phase gate:** full `pnpm test:ci`, `pnpm lint`, `pnpm boundaries`, `pnpm planning-gates`, `pnpm lint-translations:gamelib`, then live UAT (UAT items must follow the `### N.` / `expected:` / `result:` shape).

### Wave 0 Gaps
- [ ] `src/backend/engine/__tests__/perGameBottle.test.ts` (D-01)
- [ ] `engineConfig.test.ts` (D-05..D-08 derivation + no-write)
- [ ] `launchEngine.test.ts` (selection, overlay, deadline wiring, log lines, toasts)
- [ ] `launchOverlayCensus.test.ts` (every launch-path settings read overlaid)
- [ ] `legacyBottleUntouched.test.ts` (D-02/D-04 fs snapshots)
- [ ] Per-bottle running-games ledger test (Landmine 1)
- [ ] First-match signal spike or test double for non-Steam (Landmine 2)
- No new framework needed.

## Security Domain

Applicable ASVS categories (local desktop app; the renderer is a semi-trusted boundary):

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V5 Input validation | yes | `parseEngineOverride` closed grammar is the backend validation point for the renderer-supplied override (T-59-52); extend, don't loosen. `legacy:*` must never be accepted from the renderer. Reject runner/appName with path separators or `..` before building `GamesConfig/<appName>.json` or bottle names (mirror `isContainedGameConfig`, `sanitizeBottleName`). |
| V12 Files/paths | yes | No filesystem path from the renderer is ever used as an engine bin (59 T-59-70); Wine Manager version regex `WM_VERSION_RE`, `..` rejection stays. |
| V4 Access control | n/a | single-user local |
| V6 Cryptography | yes (existing) | pinned-engine sha256 verification in `fallbackEngine.ts` stays; don't alter. |

| Threat | STRIDE | Mitigation |
|---|---|---|
| Renderer writes crafted `engineOverride` pointing to arbitrary binary | Tampering/EoP | closed id grammar; ids resolved only against pins / installed Wine Manager releases |
| appName with `../` building bottle or config path | Tampering | safe-name guard + containment check + sanitize chokepoint |
| Killing wineserver of a different game's bottle | DoS/data loss | bottle-scoped ledger + marker checks (Pitfall 1) |
| Leaking real HOME in tests that spawn | Info disclosure | `createFakeHomeProfile()` default plus declared real-profile arm only if justified |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | New `engineOverride` key with legacy `steamEngineOverride` fallback is the right generalisation (vs reusing the old name) | Pattern 2 | Low; either works if the fallback read exists. Needs user/planner confirmation of naming. |
| A2 | CrossOver accepts bottle names of the proposed `GameLib-<runner>-<encoded appName>` shape incl. dots/length | Pattern 3 | Medium; creation fails for some appNames (Amazon ids). Verify with one `cxbottle --create` before locking the scheme. |
| A3 | Non-Steam CrossOver game processes can be matched via `ps` (Z: path or exe name) for first-match | Pitfall 2 | High; if not matchable the 180 s timeout cannot be armed safely and needs another signal. Requires a short spike. |
| A4 | Keeping DXVK/esync toggles visible for non-Steam macOS games is correct | Frontend | Low; UI-only. |
| A5 | Arming the deadline after `prepareWineLaunch` prerequisites (not before) for non-Steam | Pitfall 3 | Medium; a prerequisite installer could still hang behind a nag. |

## Open Questions

1. **First-match signal for non-Steam (A3).** What does `ps` show for a CrossOver-launched game at a macOS install path? Recommendation: a 1-hour spike (launch a sideloaded probe PE in a per-game bottle, capture `ps -axo pid=,command=`), then generalise `deriveWindowsPrefix`. Until then, the plan must mark deadline arming as dependent on this.
2. **Shared-bottle behaviour when CX expires (Pitfall 1).** Recommendation above (proceed unless another game is running in that bottle); confirm with the user in plan-check since D-02 accepted shared consequences but did not address concurrent games.
3. **Install modal on macOS.** CONTEXT D-10 covers the Wine tab; the Install/Import modals also have `WineSelector`/bottle UI (`InstallModal/WineSelector`, `DownloadDialog`, `ImportDialog`, `ThirdPartyDialog`). Recommendation: on macOS non-Steam Windows installs, replace the Wine selector with the same Engine option (default Automatic) and write `engineOverride` + `wineCrossoverBottle` instead; confirm scope.
4. **Phase 65 ordering.** Not discussed. `bottle.ts` is 2,557 lines. Recommendation: do not wait for Phase 65 (it depends only on 62); instead extract only the primitives this phase needs (`getBottleDir`, `sanitizeBottleName`, `killBottleWineServerWith`, `buildFallbackGameSettings`, `createFallbackBottle`, `isBottleProvisioned`) into `backend/engine/bottlePrimitives.ts` as a pure-move commit, and repoint `bottle.ts` importers (no re-export). Tell Phase 65 that those are gone. If the user prefers 65 first, 61's diff shrinks but 61 slips.
5. **Native macOS games and Windows Epic/GOG "Mac" builds.** `isNative()` true -> no engine. Confirm Browser/native games get no Engine control (assumed from `showWineTab`).
6. **Global default carry-over (D-09).** Where the global derived default is computed (config read) and whether it writes `engineOverride` into global config only on user save (consistent with D-08). Recommendation: derive, never write.

## Sources

### Primary (HIGH confidence — direct code reads this session)
- `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/steam/engine/*.ts` (all 13 files listed; decision, state, switch, registry, deadline read in full or in relevant part)
- `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/steam/{bottle.ts, gameLaunch.ts, titleSettings.ts, games.ts, bottleProcessMonitor.ts, stores.ts}`
- `/Users/graysonmitchell/Projects/GameLib/src/backend/{launcher.ts, game_config.ts, config.ts, knownFixesRegistry.ts}`, `storeManagers/{legendary,gog,nile}/games.ts`, `storeManagers/storeManagerCommon/games.ts`, `sidecar/{installFlowRegistration,steamAuthFlowRegistration,gameSettingWrite}.ts`
- `/Users/graysonmitchell/Projects/GameLib/.dependency-cruiser.cjs`, `meta/runnerLiteralSelectors.cjs`, `src/common/storeCapabilities.ts`, `jest.config.js`, `package.json`
- Frontend: `Settings/components/SteamEngineOverride.tsx`, `Settings/sections/GamesSettings/index.tsx`, `GamePage/components/{EngineBadge,SteamEngineNotices}.tsx`, `GamePage/index.tsx`, `state/SteamEngineState.ts`, `InstallModal/*`
- `.planning/phases/61-.../61-CONTEXT.md`, `.planning/ROADMAP.md` (Phases 61, 65, 66, 68), `.planning/phases/62-.../62-CONTEXT.md`, spikes 056 and 060 READMEs, `.claude/skills/gamelib-conventions/SKILL.md`

### Not read in full (flagged)
- Phase 59 `59-CONTEXT/RESEARCH/PATTERNS` and the 50 plan summaries under `.planning/milestones/v0.9-phases/59-*`: not opened this session; the Phase 59 decisions were taken from the carry-forward list in 61-CONTEXT and from comments in the code. The planner should skim 59-PATTERNS.md for the Steam analogues of the new files.
- `spike-findings-gamelib` skill and spike 059: not opened.
- graphify queries were not run (direct grep/reads were sufficient).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new packages)
- Code inventory/integration points: HIGH (direct reads)
- Non-Steam first-match signal and shared-bottle policy: LOW-MEDIUM (design gaps, flagged)
- Pitfalls: MEDIUM-HIGH

**Research date:** 2026-11-07
**Valid until:** ~2026-11-21 (fast-moving: Phases 62 and 65 touch the same files; re-check import paths and `bottle.ts` line numbers before planning)
