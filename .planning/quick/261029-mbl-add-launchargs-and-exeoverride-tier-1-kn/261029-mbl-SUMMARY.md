---
status: complete
quick: 261029-mbl
requirements: [TODO-2026-10-29-known-fix-launchargs-exeoverride-keys]
commits: [108c408e9, 2c93c4901, e19f24c8c, 8f7f138ae]
---

# Quick 261029-mbl: launchArgs and exeOverride as tier-1 known-fix keys

Both keys are in `TIER1_KNOWN_FIX_KEYS` (not routing keys, so they count for the GameLib row), validated at every layer, and wired into GOG, Amazon, Epic, Zoom and the non-DRM Steam bridge.

## Commits
- 108c408e9 feat: keys, validator guards, `isValidExeOverrideShape`, `knownFixLaunch.ts` (containment)
- 2c93c4901 feat: GOG / nile / legendary / zoom wiring, `runnerLaunchArgv.ts`
- e19f24c8c feat: Steam bridge wiring, architecture notes, todo moved to completed
- 8f7f138ae docs: todo Resolution section

## Decisions
**Ordering / safety per runner**
- legendary + nile: known-fix args go after the `--` marker, before passthrough `args` (marker emitted when either is non-empty); never in `extraArguments`.
- gogdl: forwards a literal `--`, so no marker. Entries starting with `--` are dropped with a warning (all gogdl launch options are `--` long options, abbreviations allowed, no short options). The rest go immediately before the user's `launcherArgs`.
- zoom: no runner parser; known-fix args go immediately before `launcherArgs`.
- Steam bridge (non-DRM): `[exe, ...launchArgs]`; no user launcherArgs exists there.

**Exe precedence:** per-launch altExe > user `targetExe` > known-fix `exeOverride` > default. Honoured only where `targetExe` is honoured (zoom: wine branch only). When the user's setting shadows an override, an info line is logged (not on legendary, which silently takes the first branch).

**Sideload not wired:** `storeMap.sideload` is undefined (`common/utils.ts`), so no `<appName>-<store>.json` can match a sideloaded game.

## Steam gaps (not faked)
1. DRM mode: the helper starts the game from a Windows path; whether it forwards extra argv is unverified, so neither key is applied there.
2. `steam://rungameid` launches (Mac/Windows native Steam, bottled Steam): the Steam client owns the command line; nothing applies.
3. Shim placement vs exeOverride in another folder: the bridge shim sits beside the PICS launch exe at install, so an exeOverride in a different directory may run without the shim beside it.
4. No Steam user launcher-args: the bridge has no `launcherArgs` setting, so no ordering question arises.

## Deviations
- [Rule 3] `src/backend/storeManagers/steam/__tests__/games.test.ts` was not in the plan's file list, but it mocks `../bridgeKnownFixes` wholesale; 38 tests failed (`steamBridgeLaunchCommandParts` undefined). Added the mock export plus a passthrough in the file-scope beforeEach. Committed in e19f24c8c.
- Task 3's `knownFixes.ts` docstring edits were made in Task 1's commit (same file already being edited).
- `.planning/notes/per-game-compat-fixes-architecture.md` is prettier-ignored, so it is not in the prettier checks.

## Verification (commands run)
- `npx jest src/backend/__tests__/knownFixes.test.ts .../knownFixesGamelibStatus.test.ts .../knownFixLaunch.test.ts .../knownFixesLayered.test.ts .../knownFixesFetcher.test.ts`: 5 suites, 119 tests pass.
- `npx jest src/backend/storeManagers/__tests__/runnerLaunchArgv.test.ts src/backend/storeManagers/{gog,nile,legendary,zoom}`: 20 suites, 207 tests pass.
- `npx jest src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts`: 2 suites, 565 tests pass.
- `npx jest src/backend/__tests__/knownFix* steamBridgeKnownFixes`: 14 suites, 364 tests pass.
- `npx tsc --noEmit`: clean. `npx prettier --check` on all touched source/test paths: clean (the `.planning/` files are prettier-ignored and left out).
- `pnpm planning-gates`: 12/12 pass.
- `pnpm lint`: 0 errors, 1128 warnings (pre-existing warnings); the command exits 1, which is the warning count rather than an error. I did not compare against a pre-change baseline.
- `graphify update .` run.

## Self-Check: PASSED
