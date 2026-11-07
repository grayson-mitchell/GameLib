---
phase: quick-261107-mr0
plan: 01
subsystem: console-mode / steam
tags: [console, steam, platform-row, forced-windows, bridge]
requirements: [TODO-2026-11-07-console-mode-steam-platform-row]
key-files:
  modified:
    - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
    - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
    - src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts
    - src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
metrics:
  completed: 2026-11-07
---

# Quick 261107-mr0: Console Mode Steam Platform row

Console's install overlay now shows a Platform row (macOS default, Windows alternative) for dual-build Steam games on macOS, only when the forced-Windows bridge verdict is `bridge`; Windows installs call `installSteamGame(app, game, undefined, true)`. No Wine row for Steam.

## Commit

- `25839cfe6` feat(quick-261107-mr0): single code commit covering plan Tasks 1 and 2 (the lifted D13 gate in the test file depends on the overlay wiring, so the two were not separable into green commits). Task 3 (sweep) produced no code.

## Design calls as built

- DC-1/DC-2: `isConsoleSteamDualBuild` reuses `resolveDepotAvailability` / `resolveSteamSectionGating` / `selectSteamPlatformOptions`; hook `useSteamBottleEligibility` is called in the overlay. False off-darwin and while pending.
- DC-3: one `getSteamBridgeRoute(game.app_name, true)` fetch when dual-build; rejection leaves the verdict undefined (no row).
- DC-4 pending UX: row hidden until both the eligibility probe and the bridge verdict resolve, then appears above Install-to with focus unchanged (stays on `install`). Install keeps the existing `steamReady` gate and installs the macOS default meanwhile; Windows cannot be chosen until the row exists.
- DC-5: not offered gives an empty option list and `showPlatform` false.
- DC-6: with Windows chosen, Install-to reads new en-only key `consoleMode.steamInstallTargetBridgeBottle` ("Its own Windows bottle").
- DC-7 library probe call (recorded as decided): `probeSteamQuickInstallTarget` still gates both platforms. Its free-space check measures the Steam library drive, so for a Windows/bridge install it is only an approximation; a blocked verdict replaces the whole form so Windows is unreachable, and library-missing/client-setup causes apply to the bridge too. No new verdict or card.
- DC-8: single call `installSteamGame(game.app_name, game, undefined, steamWindowsChosen)`; overlay never names `forceWindowsViaBottle`.
- DC-9: A4 census widened to any `from '...steamEligibilityProbe'` import; expects exactly InstallModal/index.tsx and the Console overlay. A3 untouched.

## Deviations from Plan

1. **[Rule 3 - test harness] Whitespace-normalised overlay reader.** Prettier wraps the new multi-line declarations/calls, which broke the textual gates. `readStrippedOverlay()` now collapses whitespace and paren padding; gates match one canonical spelling. Existing D-series gates still pass.
2. **eslint-disable on the `availablePlatforms` useMemo deps** (`react-hooks/exhaustive-deps`): `steamOffer.options` is a fresh array each render and derives only from `steamOffer.offered`, which is in the deps. Comment explains it.
3. Single commit instead of two (see above).

## Verification

- Frontend jest, full project: 297 suites, 5163 tests passed (consoleSteamTarget + steamEligibilityWiring: 149 passed). New: P1-P6, D13 + RED a-f, I3, A4/A4 non-vacuity.
- `pnpm codecheck`: clean. eslint on touched TS files: 0 errors, 0 warnings (after the disable comment).
- `pnpm lint-translations:gamelib`: 6384 findings, 0 hard failures (baseline regenerated; diff is the new key across locales plus generatedAt/totalPairs).
- `npx prettier --check` over the six exact paths: all pass. Re-checked by the orchestrator with `--file-info` per path: the one ignored path is `public/locales/en/gamelib.json` (so the check proves nothing for it); all five others, including `consoleSteamTarget.ts`, are seen by prettier and pass. (The executor had attributed the ignored path to `consoleSteamTarget.ts` by output order, which was wrong.)
- `pnpm planning-gates`: 12/12 passed.
- `graphify update .` run.

## Known Stubs

None.

## Optional live check (non-blocking, operator)

Restart with `pnpm tauri:dev` (the sidecar is not rebuilt by dev, though no backend change here). Open Console Mode on macOS, select Undertale (391540) Install, wait for the Platform row (macOS shown), press Right to Windows, confirm Install to reads "Its own Windows bottle", press Install, and confirm the log line `forced-Windows install of appId 391540 routed by the bridge verdict: bridge/...`.

## Self-Check: PASSED

Commit 25839cfe6 exists; all six modified files committed; source todo not moved; SUMMARY/STATE/PLAN not committed.
