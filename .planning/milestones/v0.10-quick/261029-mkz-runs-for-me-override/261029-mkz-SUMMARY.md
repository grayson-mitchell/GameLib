---
phase: quick-261029-mkz
plan: 01
status: complete
key-files:
  created:
    - src/common/runsForMe.ts
    - src/backend/runsForMe/index.ts
    - src/backend/runsForMe/electronStores.ts
    - src/frontend/screens/Library/components/GameCard/RunsForMeBadge.tsx
    - src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx
  modified:
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/launcher.ts
    - src/frontend/screens/Library/filterEngine.ts
    - src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts
metrics:
  completed: 2026-10-29
---

# Quick 261029-mkz: "Runs for me" per-game override

Backend-persisted tri-state (`auto | user-on | user-off`) override: game page toggle, auto-set after a 60 s session (never over user-off), a `runsForMe` Runnability tier with filter row and green check badge, and no CrossOver install-risk warning for such games.

## Commits

- d601ff705 Task 1: shared rules, store, `getRunsForMeMap`/`setRunsForMe` + `runsForMeChanged`, auto-set hooks, census 15->17, IPC inventory 232/77
- a30cda4a0 Task 2: tier (native > runsForMe > rating tiers, darwin only), filter row, GlobalState slice, card badge, install-risk skip
- 295e00db9 Task 3: game page toggle, five strings in 49 catalogs (48 mt.json stamps)

## Verification

- jest: all Task 1 suites (223), Library/NavShell/hooks (673+), Game/FilterChipRow/catalog parity (900) pass
- `pnpm codecheck`: 0 errors; `pnpm planning-gates`: 12/12 (after Task 1 commit, as the ported-channels gate requires the inventory be committed)
- prettier --check clean over all non-ignored written paths; eslint 0 errors (warnings pre-existing/style only)
- Translations: `machine-fill-gamelib` unavailable (no ANTHROPIC key), so 48 locales hand-authored; all 192 distinct (locale, string) pairs validated with the real `validateTranslation()` (0 problems; sabotage control reported 2 problems)

## Deviations from Plan

1. [Rule 3 - Blocking] Type-required `runsForMe` in `FilterEngineDeps`/`EngineDepsInputs` broke four existing test helpers; added `runsForMe: {}` to `reconcileNonAvailableGames.test.ts`, `engineWiring.test.ts`, `libraryHeaderVisibility.test.ts`, `focusRowSelectors.test.ts`.
2. [Rule 1] `FilterRunnabilityFacet.test.tsx` pinned the tier table at 4; updated to 5.
3. SteamDialog does not destructure `runner` (D-06), so it uses `gameInfo.runner`.
4. Translations hand-authored rather than machine-filled (see above).

## Known pre-existing issue (not mine)

`pnpm lint-translations:gamelib` reports 144 hard failures, all `steam.adoptRestart.{busy,gameRunning,quitTimeout}` untranslated in 48 locales (another session's keys). Zero findings mention runsForMe.

## Not done

Live manual check on macOS (restart `tauri dev` so the sidecar is rebuilt) was not run.

## Self-Check: PASSED
