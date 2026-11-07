---
phase: quick-261107-td5
plan: 01
subsystem: steam-uninstall
tags: [steam, uninstall, running-check, notices]
requires: [quick-261106-s3n]
completed: 2026-11-07
---

# Quick 261107-td5: Fix the three live-gate-D defects of the Steam delete route

## Commits

| Task | Commit | Summary |
| ---- | ------ | ------- |
| 1 | 3cbb8add2 | `runningFromFolder.ts` (ps-based folder check); `decideSteamNativeDelete(appId, installFolder, deps)`; error 16 -> refused-running |
| 2 | 3c0f4f12e | `ExecResult.refused`; `uninstallGameCallback` honours it; refusal routes flagged; refusals pushed as `steamRequestNotice` |
| 3 | 015befa7d | Three new notice kinds validated and rendered in-app; `steam.uninstall.checkFailed` string + i18n baseline |

## What changed

- **Defect 1:** on non-Windows the delete route also refuses when any process in `ps -A -ww -o args=` runs from `<install folder>/` (trailing-separator needle, so `WazHack2` does not match `WazHack`). Empty/relative/root folders throw; a missing install folder, a ps failure, or a timeout (2 s, SIGKILL, unref'd) all fail closed as `refused{running-check-failed}`. Spawn goes through `createFakeHomeProfile`. Windows keeps the registry read only. `readRunningAppId`, `macOsRunningAppId` and `pollRunningOnce` are untouched.
- **Error 16** from `UninstallApp` now returns `refused-running`; 18 still falls back; other codes remain `steam-error`.
- **Defect 2:** `uninstallGameCallback` returns early on `result.refused` (logs, sends `done`, no cleanup, no notify). Success and throw paths unchanged.
- **Defect 3:** the running / steam-error / check-failed refusals (check-failed was silent before) push `steamRequestNotice` instead of `notify()`. Added `nextSteamRequestNoticeSeq()` in `library.ts` (values unchanged for the two existing pushes).

## Tests and checks

- Task 1 set (runningFromFolder, nativeDelete, fakeHomeIsolation): 30/30 pass, including the real-`ps` arm.
- Task 2 set (uninstaller, games, nativeDelete, removeCopies): 773/774; the one failure is pre-existing (below).
- Task 3 set (SteamRequestNotice, SteamEngineLaunchNotice): 49/49 pass.
- `pnpm codecheck` clean. `pnpm lint-translations:gamelib` and `pnpm lint-translations`: 0 hard failures. Baseline diff adds only `checkFailed` per locale (plus timestamp/total). Scoped prettier clean (gamelib.json is prettier-ignored).
- Wider run over `src/backend/storeManagers/steam src/backend/utils src/frontend/state ...`: 3 failures, none from this plan:
  - `macArchKnownFixRouting.test.ts` "Intel: never seeds and does not take the bottle-branch result" (known, not fixed).
  - `games.test.ts` "channel constants equal the 56-01 SUMMARY values" and `bottle.test.ts` "DRM_LAUNCH_FORM equals launch_form in 56-01-SUMMARY.md": ENOENT, `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-01-SUMMARY.md` is absent from this tree. Pre-existing, not touched.

## Deviations from Plan

- None of substance. `psOutputHasFolder` checks `isAbsolute(folder)` before `resolve()` (resolve would otherwise make a relative path absolute and defeat the guard).

## Known remaining case

`removeNativeInstallDirectly` still returns the `Failed to remove native install: ...` result (a caught rm error, where a partial delete is possible) WITHOUT `refused`, so `uninstallGameCallback` treats it as it did before. Same for `Failed to remove bridge bottle/install` and `Failed to remove bottle install` returns.

## Pending operator live gate (NOT run, NOT claimed)

Restart `pnpm tauri:dev` (does not rebuild the sidecar). With the setting ON, Steam signed in and WazHack 264160 running natively, press Uninstall. Expect the in-app notice "WazHack is running. Quit it, then uninstall again.", no OS notification, tile stays installed with status done, `gamelib.log` showing the folder check refusing before any `UninstallApp` line and no "Removing 264160.json", and `264160.json` still present. Quit the game and uninstall again: succeeds. The todo `.planning/todos/pending/2026-11-05-gamelib-native-steam-game-delete.md` stays `ready: live-gate`.

## Known Stubs

None.

## Self-Check: PASSED

Commits 3cbb8add2, 3c0f4f12e, 015befa7d exist on main; new module present.
