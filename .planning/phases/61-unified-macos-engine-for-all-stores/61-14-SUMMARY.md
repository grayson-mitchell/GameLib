---
phase: 61-unified-macos-engine-for-all-stores
plan: 14
subsystem: engine
tags: [launcher, engine-step, settings-overlay, winetricks, tool-settings]
requires: [61-12]
provides:
  - "launcher.ts: engine step in runLaunchEventCallback, overlay in prepareWineLaunch"
  - "backend/engine/toolSettings.ts: resolveToolSettings"
  - "backend/engine/engineEligibility.ts: engineKeyIfEligible"
  - "launchSettings.ts: buildPlainPrefixSettings"
affects: [61-15, 61-16]
key-files:
  created:
    - src/backend/engine/toolSettings.ts
    - src/backend/engine/engineEligibility.ts
    - src/backend/__tests__/launcher.engineStep.test.ts
    - src/backend/engine/__tests__/launcherOverlayCensus.test.ts
    - src/backend/engine/__tests__/legacyBottleUntouched.test.ts
    - src/backend/engine/__tests__/toolSettings.test.ts
    - src/backend/tools/__tests__/toolSettingsWiring.test.ts
  modified:
    - src/backend/launcher.ts
    - src/backend/tools/index.ts
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/launchSettings.ts
    - src/backend/tools/__tests__/winetricksListAvailable.test.ts
    - src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts
    - src/backend/tools/__tests__/winetricksQueue.test.ts
key-decisions:
  - "Engine-controlled launches skip checkWineBeforeLaunch and its persist hook entirely, so no derived or fallback engine reaches wineVersion (D-08)"
  - "A tool run never creates a bottle on a read (listInstalled), never runs the pre-flight and never flips a bottle's engine"
  - "One eligibility helper (engineEligibility.ts) serves the launch step and the tools resolver"
metrics:
  tasks: 3
  completed: 2026-11-07
---

# Phase 61 Plan 14: Engine step in the shared launcher Summary

Every non-Steam macOS Windows launch now runs `selectEngineForLaunch` after the log writer and before any Wine check, and the Wine tools (Winetricks run/installed-list, Run EXE) act on the game's real bottle and engine through the new `resolveToolSettings`.

## Commits
- 87355ce9a: launcher engine step, overlay in prepareWineLaunch, launcher test, census
- 33331d0b6: D-02/D-04 filesystem snapshot test
- 9d9c1a90c: resolveToolSettings, tools wiring, shared eligibility, tools census (also carries a one-line type fix to the snapshot test: override ids are `pinned:<id>`)

## Behaviour
- `refused`: sends `done`, closes the log, returns `abort`; `game.launch` never runs. `legacy`/`skip`: unchanged flow including the Wine check. `use`: settings become `getLaunchSettings(key, stored)` for the before/after scripts and the rest of the callback, the Wine check and `persistBottleWineVersion` are skipped.
- The selection is released in the launch `.finally` (after the after-script and log close, in a `finally`) and in a catch around the pre-launch work, so a launch that never starts does not leak it.
- `prepareWineLaunch` reads `getLaunchSettings(engineKeyFor(...), await game.getSettings())`. Every `wineVersion.type === 'crossover'` branch in launcher.ts already takes the right path with the overlay (fallback = type `wine` + bottle as `winePrefix`), so no branch was changed (Pitfall 5).
- `resolveToolSettings`: stored for ineligible/legacy games; live launch selection wins; plain prefix keeps its `winePrefix` with the pinned/Wine Manager Wine; per-game bottle uses its marker kind (non-crossover -> fallback settings, crossover/none -> CrossOver for that bottle, falling back to the pin when CrossOver is unresolvable); `ensureBottle` only for running a verb or EXE; a missing legacy shared bottle is never created.
- Steam bridge `gameSettingsOverride` path is untouched.

## Deviations from Plan

**1. [Rule 3 - blocking] Static import of toolSettings in tools/index.ts.** The plan allowed lazy import only if boundaries reported a cycle; it does not (cycle rules are scoped), so the import is static. A lazy import added microtask turns that broke the 20-tick flushes in existing Winetricks tests.

**2. [Rule 3 - blocking] Three existing Winetricks tests edited** (`winetricksListAvailable`, `winetricksInstallLifecycle`, `winetricksQueue`): their fake game had no `isNative`, so the real resolver threw. Each fake now returns `isNative: () => true` (resolver skips, stored settings used, behaviour under test unchanged).

**3. [Rule 2] Extra module `engineEligibility.ts`** and `buildPlainPrefixSettings` in launchSettings.ts, as the plan directed for sharing (plan suggested exporting from launchEngine.ts; a leaf module avoids launchEngine -> engineSwitch -> tools -> toolSettings cycle weight).

**4. Extra test file** `tools/__tests__/toolSettingsWiring.test.ts` covers the tools' 'unavailable' handling and `ensureBottle` flags (the plan's behavior list named these but no file).

**5. `resolvePrefix` added as an injectable dep** so the `invalid-prefix` result is testable (a clean engine key makes `resolveGamePrefix` return `invalid` unreachable otherwise).

## Verification
- `tsc --noEmit` clean; `pnpm boundaries` clean; prettier clean.
- Jest over `src/backend/__tests__`, `engine`, `tools`, `storeManagers`: only the four known pre-existing failures.
- Lint totals unchanged: tests 664, src 1117. `grep -c selectEngineForLaunch( launcher.ts` = 1, `endEngineLaunch(` present; toolSettings.ts has 0 persistence/pre-flight symbols.
- Key links checked by grep (not `verify.key-links`).
- `.planning/REQUIREMENTS.md` does not exist; requirements mark-complete was skipped.

## Known Stubs
None.

## Notes for 61-15
Store `launch()` bodies still call `this.getSettings()` and hand that to `prepareLaunch`; 61-15 wraps those in `getLaunchSettings`. Until then `prepareLaunch`'s crossover-folder branch (third-party apps) sees stored settings, while prepareWineLaunch and the scripts see the overlay.

## Self-Check: PASSED
Files and commits 87355ce9a, 33331d0b6, 9d9c1a90c verified present.
