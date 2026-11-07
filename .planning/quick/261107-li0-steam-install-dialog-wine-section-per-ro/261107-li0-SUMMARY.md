---
phase: quick-261107-li0
plan: 01
subsystem: steam-install-dialog
tags: [steam, install-dialog, bridge, console-mode]
key-files:
  modified:
    - src/frontend/screens/Library/components/InstallModal/steamBridgeRouteLine.ts
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
    - src/frontend/screens/Library/components/InstallModal/index.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
completed: 2026-11-07
---

# Quick 261107-li0: Steam install dialog Wine section per route

The desktop Steam install dialog now shows the shared Wine selector and shared-bottle warning only when the install goes to the bottled Windows Steam client. On the native-bridge route (verdict native, force-bottle toggle OFF) it hides both, skips `persistBottleWineVersion`, and shows a one-line engine hint pointing at Engine (advanced).

## Commits
- 833cbd387 feat: `resolveBridgeOwnsEngine` pure helper with 7 cases
- 21d62f1b3 feat: SteamDialog `wineSectionEffective`, parent `onBridgeOwnsEngineChange`, en `bridgeEngineNotice`, presence baseline, source gates
- c9136deb3 test: Console D13 gate and comment fix

## Part B outcome
Console Mode offers no Platform or Wine row for Steam, and that is unchanged. A forced-Windows install of a dual-build game is `not-eligible` for the bridge, so it lands on the shared bottled client. Only the comment above `showPlatform` and `hasWine` changed. The D13 gate pins the absence of `forceWindowsViaBottle`, the two-argument `installSteamGame` call, and `!isSteam` on both declarations.

## Verification
- Frontend jest: steamBridgeRouteLine (23), steamDialogSource (99), steamEligibilityWiring, installModalSource, installModalBottleSeeding, crossoverRatingConfirmWiring, consoleSteamTarget (74): all pass.
- `pnpm codecheck`: pass. eslint on touched files: clean.
- `pnpm lint-translations:gamelib`: 0 hard failures. `pnpm i18n-churn-guard`: clean. Baseline diff is only the new key (en-missing pairs for other locales, plus the generatedAt and totalPairs fields).
- prettier `--check` passes on all touched files. `public/locales/en/gamelib.json` is prettier-ignored (`--file-info`), so that check proves nothing for it.
- `graphify update .` run.

## Deviations
- Task 1 TDD: tests and helper were written in one step, so the RED run was not observed separately. The tests do exercise the helper, and all pass.
- The persist-guard gate regex excludes `wineVersion?.` (the crossover-risk term) so it only matches the persist branches.
- No live UI check was done (optional step in the plan).

## Known Stubs
None.

## Self-Check: PASSED
