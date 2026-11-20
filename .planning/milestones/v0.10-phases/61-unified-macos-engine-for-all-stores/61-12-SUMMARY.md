---
phase: 61-unified-macos-engine-for-all-stores
plan: 12
subsystem: engine
tags: [launch-engine, settings-overlay, non-steam, bottle-busy]
requires: [61-07, 61-08, 61-10]
provides:
  - "backend/engine/launchEngine.ts: selectEngineForLaunch, endEngineLaunch"
  - "backend/engine/launchSettings.ts: getLaunchSettings, buildCrossoverGameSettings, setLaunchOverlayContext"
  - "backend/engine/engineDialogs.ts: showEngineDialog, notifyEngineFallback"
affects: [61-13, 61-14, 61-15, 61-16]
key-files:
  created:
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/launchSettings.ts
    - src/backend/engine/engineDialogs.ts
    - src/backend/engine/__tests__/launchEngine.test.ts
    - src/backend/engine/__tests__/launchSettings.test.ts
  modified:
    - src/backend/engine/bottlePrimitives.ts
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
key-decisions:
  - "Engine reaches the store launch only via getLaunchSettings(key, stored): in-memory registry plus overlay context, never persisted"
  - "buildFallbackGameSettings gained an optional base so a non-Steam game keeps its own launcher args, target exe and env"
  - "Dialogs are shown on every refused attempt (as Steam does), not once per session"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 12: Non-Steam launch engine step Summary

`selectEngineForLaunch(game, { offline, logWriter, purpose })` runs Phase 59's engine sequence for any non-Steam macOS game and `getLaunchSettings` hands the choice to the store launch as a per-launch overlay; `endEngineLaunch(key)` releases it.

## Commits
- 051983c6b: launchSettings.ts, base parameter on buildFallbackGameSettings, tests
- 67af8d9db: launchEngine.ts, engineDialogs.ts, tests, catalogue strings, presence baseline

## Behaviour
- Returns `skip` (native, browser, non-mac, bottle-runtime store, unusable key), `legacy` (no decision, log line `engine=legacy name="..." reason=override`), `use`, or `refused`.
- Per-game bottle provisioned via `ensureGameBottle` before the decision (not for a legacy shared bottle); offline refusal before pre-flight; unavailable / download-failed / selection-rejected / restore-failed dialogs reuse the `steam.engine.*` strings.
- `bottle-busy`, `game-running` and `shared-bottle` refuse with `engine.bottleBusy` and kill nothing (D-16); an idle shared GameLib bottle proceeds.
- Plain prefix with a pinned or Wine Manager override: no bottle, no switch, overlay keeps winePrefix and DXVK settings (D-04, D-06).
- Ledger marked on success; `endEngineLaunch` clears registry, overlay context, ledger entry and cancels any deadline.
- No bridge-failure marking, no bottled-Steam reroute, no deadline arming (61-16).

## Deviations from Plan

**1. [Rule 3 - blocking] Presence baseline regenerated.** The two new catalogue keys failed `lint-translations:gamelib` in 48 locales; `meta/i18nCatalogPresenceBaseline.json` regenerated with `LINT_TRANSLATIONS_WRITE_BASELINE=1` (only those 96 pairs added).

**2. [Rule 2] Extra string `engine.bottleCreateFailed`** for the "bottle could not be created" and invalid-identity refusals; no existing string fit.

**3. Dialogs not once-per-session.** The plan text suggested an ack Set; a silent second refusal is worse than a repeat dialog, and Steam shows every time. `showEngineDialog` takes a `key` and logs per dispatch.

**4. i18next imported as `{ t }`** to keep the lint warning total unchanged (the default-import form adds import-x warnings).

## Verification
- `jest src/backend/engine`: 414 passed. `launchEngine.test.ts` 23 cases (all behaviour rows), `launchSettings.test.ts` covers overlay and no-mutation. Steam `bottle.test.ts` only fails its known pre-existing 56-01 SUMMARY case.
- `tsc --noEmit`, `pnpm boundaries`, `pnpm lint-translations:gamelib` (0 hard failures), prettier clean. Lint totals unchanged: tests 664, src 1117.
- Greps: forbidden Steam symbols and `armLaunchDeadline` 0 in launchEngine.ts; persistence calls 0 in launchSettings.ts / launchEngine.ts; `"bottleBusy"` count 1.
- Tests mock `engineDecision` (decideLaunchEngine) since its G29 probe logic is covered by engineDecision.test.ts.

## Known Stubs
None. Not yet wired into the store launch paths (61-13).

## Self-Check: PASSED
