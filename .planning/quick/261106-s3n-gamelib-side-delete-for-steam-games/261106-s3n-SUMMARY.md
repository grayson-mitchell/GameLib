---
phase: quick-261106-s3n
plan: 01
subsystem: steam-uninstall
tags: [steam, uninstall, bridge-helper, settings, ipc]
requires: [quick-261105-ord, spike-067]
provides:
  - "--steam-uninstallapp bridge helper subcommand"
  - "enableSteamNativeDelete setting (Delete Steam games directly in GameLib)"
  - "getSteamDeleteRoute IPC"
affects: [steam games.ts uninstall, UninstallModal, GameSubMenu, Settings > General]
key-files:
  created:
    - src/backend/storeManagers/steam/nativeDelete.ts
    - src/backend/storeManagers/steam/__tests__/nativeDelete.test.ts
    - src/frontend/screens/Settings/components/EnableSteamNativeDelete.tsx
    - src/frontend/screens/Settings/components/__tests__/EnableSteamNativeDelete.test.tsx
  modified:
    - native/steam-bridge/helper/gamelib_installapp.h
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/steamInstallApp.ts
    - src/backend/storeManagers/steam/nativeInstallSetting.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/common/types.ts
    - src/common/types/ipc.ts
    - src/preload/api/steam.ts
    - src/frontend/components/UI/UninstallModal/index.tsx
    - src/frontend/screens/Game/GameSubMenu/index.tsx
    - public/locales/en/translation.json
    - public/locales/en/gamelib.json
decisions:
  - "Operator decision (2026-11-06), confirming planner choice 3: the setting applies on all platforms. Off Apple Silicon macOS the helper is unavailable, so ON goes straight to GameLib's own file delete."
  - "UninstallApp is used whenever the delete setting is ON; not additionally gated on steamExperimentalInstallApp (separate key, D-01)."
  - "Any EAppUpdateError 18 falls back to the file delete; installedApps only changes the log wording (signed-out vs steam-not-installed)."
  - "A non-zero error other than 18 deletes nothing and reports the code to the user."
  - "ON only changes the native root; bridge-bottle and CrossOver-bottle roots keep their existing direct deletion."
  - "enableSteamNativeDelete is optional in AppSettings and absent from config.ts defaults, so an absent key means follow the downloader (D-02)."
metrics:
  tasks: 3
  completed: 2026-11-06
---

# Quick 261106-s3n: GameLib-side delete for Steam games

New setting "Delete Steam games directly in GameLib" (key `enableSteamNativeDelete`): ON uninstalls a native-root Steam game through the bridge helper's runtime-verified `UninstallApp`, falling back to GameLib's own guarded file delete, with GameLib's confirm dialog; OFF is today's `steam://uninstall` flow, unchanged.

## Commits

| Task | Commit | Summary |
| ---- | ------ | ------- |
| 1 | bde09c59a | Helper `--steam-uninstallapp` and `requestSteamUninstallApp` |
| 2 | a03d88865 | Setting accessor, `decideSteamNativeDelete`, games.ts ON route, shared guarded removal |
| 3 | 92a919314 | Settings toggle, `getSteamDeleteRoute` IPC, dialog copy, IPC inventory |
| fix | 457d82031 | Flow-registration census (8 to 9 invoke handlers) |

## What was built

- **Helper:** `--steam-uninstallapp <appId> [--dry-run]`. UninstallApp is called only when its unique 0x4505 slot equals the verified InstallApp slot + 1. GetNumInstalledApps (0xde40) is called only on its own unique slot, otherwise `installedApps` is -1. Shared appId parsing is factored into `gl_ia_parse_app_id`.
- **Wrapper:** `requestSteamUninstallApp` returns ok / unavailable / error(code, installedApps). It is darwin-only (`unsupported-platform` without spawning elsewhere). It shares one spawn/parse helper with `requestSteamInstallApp`. The runner still inherits the real HOME (named real-profile arm) and is bounded by `HELPER_TIMEOUT_MS`.
- **Routing:** `decideSteamNativeDelete` checks that the game is not running (fails closed), then calls the helper, and maps the result to refused-running / steam-uninstalled / fallback / steam-error / refused. `games.ts` runs this only when `isSteamNativeDeleteEnabled()` is true; everything after that line is untouched. The tail of `uninstallUnadoptedMacNativeDirectly()` was extracted into `removeNativeInstallDirectly()` and is shared by the ON fallback.
- **UI:** toggle below the downloader toggle, with an icon-only (i) help on the label line and no "experimental" label. `UninstallModal` and `GameSubMenu` use GameLib's confirm (game name, space freed, "Steam Cloud saves are not touched.") only when `getSteamDeleteRoute` says `gamelibDelete: true`. That is true only for setting ON, a native root, and no bridge bottle.

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing mock factories needed the new export.**
`games.test.ts` and `removeCopies.test.ts` mock `../nativeInstallSetting` with a factory containing only `isSteamNativeInstallEnabled`. The new import in `games.ts` would be undefined and throw. I added `isSteamNativeDeleteEnabled: jest.fn()` (and a `../nativeDelete` mock) to those factories. No existing assertion was edited.

**2. [Rule 3 - Blocking] IPC inventory and planning gate.**
`pnpm planning-gates` failed because the new preload channel `getSteamDeleteRoute` was in no bucket of `.planning/IPC-PORT-INVENTORY.md`. I added it to the "Already ported" line and moved the Totals to 239 unique / 84 ported. This file is committed with Task 3 (the gate also requires it to be committed).

**3. [Rule 1 - Bug] Census test.**
`flowRegistrationCensus.test.ts` counts registrations in `installFlowRegistration.ts`. I updated the table (8 to 9) and the two "eight" docstrings to "nine" (commit 457d82031).

**4. Test expectation adjusted for absolute installdir.**
`join(common, '/etc')` is `common/etc`, which stays inside the library, so `removeSteamInstallCopy` deletes that contained path rather than refusing it. The test asserts that `/etc` itself is never deleted and every target stays under the library. `../../..` is refused as planned.

**5. i18n baseline regenerated** (`LINT_TRANSLATIONS_WRITE_BASELINE=1`) for the new gamelib keys. The diff adds only this plan's keys across locales (new keys record as not yet localised).

removeCopies coverage: none of the non-default-library, `../../..`, absolute and symlink cases existed, so all four were added. The symlink case runs the real `rmSync` on a real temp tree. The link is removed and the outside target's file survives. T-s3n-01 holds.

## Verification

- Helper compiles for arm64 and x86_64 (`-Werror=uninitialized`; only the existing `-Wpointer-sign` warnings from generated dispatch code).
- Task 1 jest set, Task 2 jest set, Task 3 jest set: all pass. `pnpm codecheck` is clean. ESLint has 0 errors. `lint-translations:gamelib` and `lint-translations` show 0 hard failures. Scoped prettier is clean. `pnpm planning-gates` passes 12/12.
- Broader run (`src/backend/storeManagers`, `src/backend/sidecar`, `src/frontend/screens/Settings`): 252 suites pass. 1 fails, a pre-existing failure.
- Success criteria: `isSteamNativeDeleteEnabled` is defined once in `nativeInstallSetting.ts` and read only by `games.ts` and `installFlowRegistration.ts`. `enableSteamNativeDelete` is optional in `types.ts` and absent from `config.ts`.

## Deferred / pre-existing

- `src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts` "Intel: never seeds and does not take the bottle-branch result" fails (expects `steam://install/63000`, 0 openExternal calls). It fails identically at the parent of the first commit (`bde09c59a~1`), so it is not caused by this plan. It last changed in `1e6e50894` (quick-261102-dkw). It is not fixed here.

## Pending operator live gate (NOT run, NOT claimed)

The todo `.planning/todos/pending/2026-11-05-gamelib-native-steam-game-delete.md` stays in `pending/` with `ready: live-gate`. Before the gate, restart `pnpm tauri:dev` (it does not rebuild the sidecar) and run `pnpm build-steam-bridge` so the installed helper carries `--steam-uninstallapp`. Then check:

- ON, signed in: UninstallApp path, no Steam UI, Steam shows not installed.
- ON, signed out: fallback deletes the files and the tile clears. After sign-in, Steam shows not installed.
- ON, Steam not running: fallback. No "Files Missing" ghost entry when Steam starts.
- ON, game running: refused with a message.
- ON, a GameLib download Steam never adopted: fallback (expect UninstallApp 18).
- Non-default library folder, both paths.
- OFF: byte-identical to today.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (new IPC `getSteamDeleteRoute` shape-checks the renderer `appName` and never rejects; it is the T-s3n-04-style boundary already covered).

## Self-Check: PASSED

Created files exist and commits bde09c59a, a03d88865, 92a919314, 457d82031 are on main.
