---
phase: 61-unified-macos-engine-for-all-stores
plan: 19
subsystem: frontend
tags: [install-modal, engine-override, per-game-bottle, import]
requires: [61-18]
provides:
  - engineInstallChoice (usesEngineChoiceForInstall, installsViaCrossoverForEngine, initialInstallEngine, engineInstallConfig)
  - EngineSelector (install-time Engine select on EngineOverrideView)
  - importEngineSettings (backend guard plus server-computed bottle for importGame)
affects: [InstallModal dialogs, importGame, EngineOverrideView]
key-files:
  created:
    - src/frontend/screens/Library/components/InstallModal/WineSelector/engineInstallChoice.ts
    - src/frontend/screens/Library/components/InstallModal/WineSelector/__tests__/engineInstallChoice.test.ts
    - src/frontend/screens/Library/components/InstallModal/EngineSelector/index.tsx
    - src/frontend/screens/Library/components/InstallModal/__tests__/engineInstallDialogs.test.tsx
    - src/backend/engine/importEngineSettings.ts
    - src/backend/sidecar/__tests__/importGameEngine.test.ts
  modified:
    - src/frontend/screens/Library/components/InstallModal/{index,DownloadDialog/index,ImportDialog/index,ThirdPartyDialog/index,SideloadDialog/index}.tsx
    - src/frontend/screens/Settings/components/EngineOverride.tsx
    - src/common/types.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
decisions:
  - "Legacy global default starts a new install on Automatic and nothing global is written (D-20)"
  - "importGame computes the bottle name server-side; a renderer-sent name is ignored (T-61-59)"
  - "Sideload writes the engine config after the app is added and before running a setup exe (D-01 coverage)"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 19: Install-time Engine choice Summary

On macOS, non-Steam Windows installs, imports, third-party installs and sideloads now pick an engine and get a backend-computed per-game bottle name, with no Wine build or bottle picker.

## Tasks

1. `35bb11eb1`: pure gate module, `EngineSelector`, `ImportGameArgs.engineOverride`, `importEngineSettings` used by `importGame` (guarded by `isWritableEngineOverride`, bottle from `getPerGameBottleNameFor`). `EngineOverrideView` gained an optional `open` prop so the select is expanded in the dialogs.
2. `9bf6de078`: `InstallModal` swaps `WineSelector` for `EngineSelector` at the four non-Steam mounts and passes `engineOverride` to the dialogs; each dialog writes `{ engineOverride, wineCrossoverBottle }` via `engineInstallConfig` + `window.api.getPerGameBottleName`, and the CrossOver risk input follows the engine. Steam, Linux and Windows paths are unchanged.

## Deviations from Plan

- **[Rule 3]** The jest Frontend project has no jsdom, so `engineInstallDialogs.test.tsx` uses comment-stripped source gates plus behavioural tests of the pure `engineInstallConfig` helper instead of rendering the dialogs (same posture as `installModalSource.test.ts`). Render behaviour is a manual UAT item.
- **[Rule 3]** `importGameEngine.test.ts` exercises a new small module `backend/engine/importEngineSettings.ts` (the handler lives in a heavy registration file); it was added to `STRUCTURALLY_CONTAINED_SUITES` in `testContainment.test.ts`.
- Added `await` to the new `writeConfig` calls in Download/ThirdParty to avoid new floating-promise warnings; lint totals stay at baseline (src 1117, tests 662).

## Known Stubs

None.

## Threat Flags

None. T-61-58 and T-61-59 mitigated as planned.

## Verification

jest (sidecar, Library, Settings: 175 suites pass), `pnpm codecheck`, prettier clean. No new i18n keys.

## Self-Check: PASSED
