---
phase: quick-261108-anw
plan: 01
tags: [steam, uninstall, notice]
key-files:
  modified:
    - src/common/types.ts
    - src/common/types/steam.ts
    - src/backend/utils/uninstaller.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/frontend/state/SteamRequestNotice.ts
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
metrics:
  completed: 2026-11-08
---

# Quick 261108-anw: Keep settings on failed Steam uninstall

A caught delete error in a Steam uninstall now returns `ExecResult.failed`. `uninstallGameCallback` keeps settings, logs, prefix and fix file, sends no notify, and sends exactly one `done`. The user sees an in-app "Couldn't finish uninstalling {{game}}..." notice.

## Commits

- c3ddef301 Task 1 (backend, tests)
- 379473402 Task 2 (frontend validator and renderer, locale key, i18n baseline)

## Notes

- Grep for other caught-delete returns in gameUninstall.ts: the only `Failed to remove` returns and `catch (error)` blocks were the five planned sites (bridge bottle, bridge install, native, bottle shared-installdir, bottle main). All now go through `failUninstall()`. The remaining `catch` hits in the file are in the refusal and check paths, not delete returns.
- rmSync throw technique: `jest.spyOn(require('node:fs'), 'rmSync').mockImplementationOnce(throw EACCES)`. `import * as` spying fails with "Cannot redefine property". Asserting the spy was called must happen BEFORE `mockRestore()`, which resets calls.
- Locale key placement: the first `"gameRunning"` in gamelib.json belongs to `steam.adoptRestart`; I corrected an initial misplacement and inserted `failed` under `steam.uninstall`. The baseline diff adds only `steam.uninstall.failed` (plus timestamp and total).

## Deviations

**[Rule 1] Existing test updated.** games.test.ts 'throw arm' (261029-l9w unadopted Mac native) asserted the route sent its own `done` on a caught rm error. By design the callback now owns `done` for `failed`, so the test now asserts `failed: true` and no route-level `done`.

## Verification

- Jest (steam + utils dirs plus frontend notice tests): all pass except the known pre-existing `macArchKnownFixRouting.test.ts` "Intel: never seeds..." failure (not touched).
- `pnpm codecheck` clean. Scoped prettier clean (gamelib.json is prettier-ignored, confirmed via --file-info). `pnpm lint-translations:gamelib` and `pnpm lint-translations`: 0 hard failures.

## Live note: NOT run

Optional operator check not run and not claimed: restart `pnpm tauri:dev`, `chmod 555` the parent of a bottle game's install folder, uninstall, expect the in-app notice, tile back to done, "Uninstall failed; keeping settings" in the log; restore permissions and retry.

## Known Stubs

None.
