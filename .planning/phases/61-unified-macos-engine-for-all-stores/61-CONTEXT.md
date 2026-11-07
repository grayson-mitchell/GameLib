# Phase 61: Unified macOS engine for all stores - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Every Windows game GameLib runs under Wine on macOS, from any store (Epic/legendary, GOG,
Amazon/nile, sideload, Steam), gets one per-game **Engine** control: Automatic (CrossOver
first, then GameLib's pinned Wine-Staging + DXVK build), CrossOver, the pinned builds, or a
Wine Manager Wine-Staging build. For non-Steam games it replaces the Wine Version selector
and the CrossOver bottle picker on macOS. Behind it, Phase 59's engine decision moves out of
`src/backend/storeManagers/steam/engine/`, so non-Steam launches get the same protection:
trial-expiry pre-flight plus the "N days remaining" notice, the launch timeout,
broken-CrossOver detection, and creation of a fallback bottle.

Linux and Windows behaviour are unchanged. DRM-mode and bottled-Steam titles keep Phase 59's
treatment, which is out of scope for the fallback.

**Phase 59 decisions carried forward unchanged and applied to every store:** per-launch
fallback with no stored state (59 D-07); the pinned build downloads on first need, with
progress in the launch flow (D-05); rollback is a release lever only (D-08); only pre-flight
checks mean "broken CrossOver", with the G29 two-probe corroboration (D-09); a post-pre-flight
hang gives "Game didn't start" with no fallback retry (D-10); the deadline stops when a game
process exists (D-11); the trial notice shows at ≤7 days (D-13); the untested-CrossOver
notice shows once and never blocks (D-15); the fallback toast and "Built-in engine
(best-effort)" badge (D-06); the no-CrossOver dismissible recommendation (D-04).

</domain>

<decisions>
## Implementation Decisions

### Bottle / prefix model
- **D-01: New non-Steam Windows installs on macOS get a per-game bottle** in CrossOver's
  Bottles directory, the same layout as Steam's `GameLibSteamBridge-<appid>`, under a
  store-qualified name (for example `GameLib-<runner>-<appName>`; the planner picks the
  exact scheme, which must be filesystem-safe and collision-free across stores). Fallback,
  adoption, the per-bottle trial clock and the notices then all work per game, as they do for
  Steam.
- **D-02: Existing games stay where they are.** A game already on the shared `GameLib`
  bottle, another user-picked CrossOver bottle, or a plain per-game `winePrefix` keeps using
  it. Nothing is copied or moved, so no saves are at risk. On the shared bottle the trial
  clock and any fallback prefix update are shared by every game in it. That is accepted for
  legacy installs.
- **D-03: The no-CrossOver path is Phase 59's, unchanged** (59 D-01..D-03): GameLib creates
  the per-game bottle in CrossOver's Bottles dir with the pinned engine and `USER=crossover`,
  and when CrossOver is installed later it is adopted (`cxbottle.conf`) on the same prefix.
  Reuse `createFallbackBridgeBottle` / `adoptBottle.ts` rather than writing a second path.
- **D-04: A plain `winePrefix` cannot be routed to CrossOver.** Games on one migrate to the
  explicit override matching their current Wine (see D-06/D-07), so launches are unchanged
  and the game is marked Unsupported. If the user later picks Automatic or CrossOver, GameLib
  creates a fresh per-game bottle and warns that saves stay behind in the old prefix. It does
  not adopt or symlink the plain prefix as a bottle.

### Migrating existing `wineVersion` choices
- **D-05: A non-Steam game whose `wineVersion.type === 'crossover'` becomes Automatic on
  its existing bottle** (whatever `wineCrossoverBottle` names). It gains the fallback, trial
  notice and timeout silently while CrossOver is healthy.
- **D-06: A Wine Manager Wine-Staging build migrates to that build's override.** If the build
  is one of the pinned engines, it maps to that pin.
- **D-07: Anything outside the new option list** (`toolkit`/GPTK, `proton`, a custom Wine
  path, a Wine Manager build that isn't Wine-Staging) migrates to a read-only
  **"Legacy: \<name\>"** override that launches exactly as today and is marked Unsupported.
  It appears in the list only while selected. Once the user switches away it is gone and
  can't be picked again.
- **D-08: Migration is derived at read time and written only on user save.** When a game's
  config has no engine key, compute the engine from `wineVersion` on each read. Only an edit
  in the Engine control writes the engine key. `wineVersion` and `wineCrossoverBottle` are
  left untouched on disk, so a downgrade still works and there is nothing to roll back. Do
  not use the `src/backend/migration/` runner and do not wait for Phase 68.
- **D-09: The global default becomes a global Engine control on macOS, defaulting to
  Automatic.** The global Wine Version selector is hidden on macOS. If the user had a
  non-CrossOver global pick, it carries over as the default override for new installs, using
  the same D-05..D-07 mapping.

### Control shape and options
- **D-10: One store-agnostic Engine control.** Generalise `SteamEngineOverride` into a
  single component used for every store on macOS. For non-Steam Windows games on macOS it
  replaces `WineVersionSelector` and `CrossoverBottle` on the Wine tab. The bottle is per game
  and managed by GameLib, so there is no picker, and the prefix-path field is hidden for
  bottle-backed games. Linux and Windows settings are unchanged.
- **D-11: Every store gets Steam's option list:** Automatic (default), CrossOver, both pinned
  builds, installed Wine Manager Wine-Staging builds, plus the read-only Legacy entry when a
  game migrated from something else (D-07). GPTK/toolkit and custom paths cannot be newly
  chosen, in line with the "no GPTK/-DXMT" engine rule.
- **D-12: Game-page surfaces are identical across stores** and come from shared components:
  lift `EngineBadge` and `SteamEngineNotices` (and the frontend `SteamEngineState`) into
  store-agnostic forms keyed by game (runner + appName), not by Steam appId. The texts,
  thresholds, first-need download progress, fallback toast, trial notice, untested-version
  notice and no-CrossOver note all match Steam.
- **D-13: The launch log records the exact engine and version for every store**
  (`engineLogLabel`, 59 D-14).

### Unsupported wording
- **D-14: Same text for every store.** "Unsupported — known fixes and compatibility ratings
  don't apply" and the "Unsupported engine" badge, identical everywhere. The text holds
  because known fixes already apply to every store (tier-2, `knownFixesRegistry.ts`, decision
  1 of `per-game-compat-fixes-architecture.md`), and fixes and ratings are tuned against
  Automatic's engines whatever the store. The roadmap's premise that non-Steam stores have
  "no Steam-keyed fixes" was only partly true.
- **D-15: Migrated Legacy games show the same Unsupported badge straight after the
  update.** The Engine control shows "Legacy: \<name\>" with the warning beneath it, so the
  user can see why and switch.

### Decided at plan-phase (after research, 2026-11-07)
- **D-16: Shared-bottle fallback proceeds unless another game is running in that bottle.**
  A per-bottle running-games ledger (keyed by bottle, covering every store) lets the engine
  step see concurrent games. When the bottle is idle, fallback behaves as it does for Steam.
  When another game is running in it, GameLib refuses with a message instead of killing that
  game's wineserver or flipping the bottle underneath it.
- **D-17: The Install, Import and ThirdParty dialogs on macOS use the Engine control** for
  non-Steam Windows installs. It replaces the Wine selector and bottle picker, defaults to
  Automatic, and writes the per-game bottle name (D-01). Linux and Windows dialogs are
  unchanged.
- **D-18: A short spike comes first and settles the non-Steam "game process exists" signal.**
  Capture `ps` output for a CrossOver-launched game at a macOS (`Z:`) install path, then
  generalise the first-match matcher. Arming the launch deadline for non-Steam games depends
  on the spike's result.
- **D-19: Extract only the `bottle.ts` primitives this phase needs** (`getBottleDir`,
  `sanitizeBottleName`, `killBottleWineServerWith`, `buildFallbackGameSettings`,
  `createFallbackBottle`, `isBottleProvisioned`) into `src/backend/engine/` as a pure move,
  and repoint importers with no re-exports. Do not wait for Phase 65. Phase 65's scope
  shrinks accordingly.
- **D-20: A Legacy global default does not carry into new installs.** (User decision at plan
  check, 2026-11-07.) When the macOS global default engine is Legacy, new non-Steam Windows
  installs on macOS get Automatic, because Legacy cannot be chosen for a new game (D-07, D-11).
  The global Engine control keeps showing the Legacy entry until the user changes it (D-09).

### Claude's Discretion
- Where the engine decision code lives once it leaves `steam/engine/`, and its API. It must
  satisfy Phase 62's dependency-cruiser rules (no cross-manager imports; `launcher.ts` reaches
  store code only through `storeManagers/index`). A store-agnostic `src/backend/engine/`
  with Steam-only pieces (bridge bottle naming, DRM runner) left in `steam/` is the obvious
  shape, but this is not locked.
- The per-game bottle naming scheme (D-01), within the constraints stated there.
- The name and storage of the engine key in game config (reuse or generalise the Steam
  override key read by `readStoredEngineOverride`).
- How the "saves stay behind" warning (D-04) is presented.
- Whether `steam/engine/` stays as a thin Steam adapter or is removed entirely.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Engine decision (the design this phase generalises)
- `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-CONTEXT.md`: D-01..D-15, every engine, fallback, notice and override decision this phase extends to all stores
- `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/` (plans and summaries 59-01..59-50): how it was built, including the G29 two-probe amendment
- `.planning/quick/261104-tm6-move-steam-engine-override-to-wine-tab/`: the override moved to the Wine tab (supersedes 59 D-14's "Advanced" placement)

### Spikes
- `.planning/spikes/056-plain-prefix-bridge-handshake/`: the wineboot path GameLib uses to create a bottle with no CrossOver
- `.planning/spikes/059-reuse-cx-bottle-vs-fresh-prefix/`: the CrossOver⇄fallback round trip on one prefix is safe
- `.planning/spikes/060-crossover-trial-expiry/`: the trial clock is per bottle, `--demo-status` output and timings

### Known fixes
- `.planning/notes/per-game-compat-fixes-architecture.md`: decision 1 (tier-2 applies to every store), the basis for D-14

### Boundaries
- `.planning/phases/62-module-boundaries-and-decomposition/62-CONTEXT.md`: D-01/D-02 capability flags and the `isStore` identity helper, D-05 no façades, D-13/D-14 dependency-cruiser rules and their shrink-only ceilings (all must stay at zero)

### Project rules
- `CLAUDE.md` Conventions: fake-HOME isolation for any new spawn, the sidecar exit contract for any new timer (launch deadline, `--demo-status` probe), the `<verify>` prettier check

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/engine/` (2,825 lines): `engineDecision.ts` (`decideLaunchEngine`, `decideCreationEngine`, `preflightCrossover`, `listEngineOverrideOptions`, `resolveWineManagerStaging`), `demoStatus.ts`, `launchDeadline.ts` (`LAUNCH_DEADLINE_MS`, `armLaunchDeadline`), `adoptBottle.ts` (`writeCxbottleConf`), `enginePins.ts`, `fallbackEngine.ts`, `testedCrossoverVersions.ts`, `engineTypes.ts` (`EngineSelection`, `engineLogLabel`), `engineRegistry.ts` (keyed by Steam appId and needs a game key), `offlineRefusal.ts`
- `src/backend/storeManagers/steam/bottle.ts`: `createFallbackBridgeBottle`, `provisionBridgeBottle`, `getBottleDir`, `killBottleWineServerWith`, which hold the bottle-creation and wineserver-kill logic to share
- Frontend: `screens/Settings/components/SteamEngineOverride.tsx` (`optionLabel`, `selectValue`), `screens/Game/GamePage/components/EngineBadge.tsx`, `SteamEngineNotices.tsx`, `state/SteamEngineState`

### Established Patterns
- Non-Steam Wine launch on macOS goes through `src/backend/launcher.ts` `prepareWineLaunch` (line ~814) and `wineVersion.type === 'crossover'` branches (around lines 486, 588, 840, 904, 1196, 1461, 1526). These are the integration points the engine decision has to drive.
- `config.ts:375` defaults `wineCrossoverBottle: 'GameLib'`; `game_config.ts` copies it per game. This is the shared bottle that D-02 leaves alone.
- `WineInstallation.type` is `'wine' | 'proton' | 'crossover' | 'toolkit'` (`common/types.ts:493`), the input to the D-05..D-07 mapping.
- `GamesSettings/index.tsx` already branches on `isMacSteamTitle` (`hasCapability(runner, 'usesBottleRuntime')`) to show `SteamEngineOverride` instead of `WineVersionSelector` + `CrossoverBottle`. D-10 widens that branch to every macOS Windows game.
- Phase 62's capability table (`storeCapabilities`) and the runner-literal ESLint ban apply: new store-specific branches go through a capability or `isStore`.

### Integration Points
- `launcher.ts` → engine decision (through `storeManagers/index` or a top-level module, per the Phase 62 rules)
- The install flow for non-Steam stores on macOS: new installs create the per-game bottle (D-01/D-03)
- Game config read path: derive the engine from `wineVersion` when no engine key is present (D-08)

</code_context>

<specifics>
## Specific Ideas

- The user consistently chose "nothing breaks on update": existing games keep their bottle or
  prefix, migration is computed rather than written, `wineVersion` stays on disk, and unknown
  Wines keep launching as Legacy.
- Parity with Steam is the goal: same layout, same option list, same components, same text.

</specifics>

<deferred>
## Deferred Ideas

- A one-click "Move to its own bottle" action for legacy shared-bottle games: considered,
  not chosen (D-02). Could be its own small phase if the shared trial clock causes trouble.
- Ordering relative to Phase 65 (the `bottle.ts` split) and Phase 68 (versioned stores) was
  not discussed. D-08 removes any dependency on 68. Phase 65's roadmap entry suggests
  splitting `bottle.ts` first to shrink this phase's diff, which is a roadmap call.

</deferred>

---

*Phase: 61-unified-macos-engine-for-all-stores*
*Context gathered: 2026-11-07*
