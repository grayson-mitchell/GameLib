---
status: complete
quick: 261026-c7r
commits: [fea65fd3b, c4c239570]
---

# Quick 261026-c7r: Steam Desktop/Applications shortcuts

SteamGame.addShortcuts/removeShortcuts now delegate to the shared `shortcuts.ts` writer. The shortcut target is `gamelib://launch?appName={appId}&runner=steam`, which `protocol.ts` routes to `dispatchSteamLaunch`. The `addNonSteamGame` side effect is skipped for runner `steam`. The Add/Remove shortcuts menu item is back for Steam, and the todo is closed.

## Commits
- fea65fd3b: delegation, guard, tests
- c4c239570: menu exclusion removed, todo moved to completed/ with a Closed section

## Verification (real output)
- `npx jest src/backend` (before final prettier): 285 of 286 suites pass. The one failure, `sidecar/__tests__/testContainment.test.ts` (T-34.2-83), reports `steamNativeInstallDefault.test.ts` as unclassified. That file came from commit 934ae58b8 (quick-261024-exo), not from this task. It is pre-existing and was not fixed here.
- After final changes: `jest src/backend/shortcuts src/backend/storeManagers/steam sidecar/shortcutsFlows`: 73 suites, 2671 tests passed. GameSubMenu tests: 4 suites, 39 passed.
- `tsc --noEmit -p .`: clean. eslint: 0 errors (warnings only). prettier --check: clean on all written source paths.
- `pnpm planning-gates`: 12/12 passed.
- `graphify update .` run.

## Deviations
- [Rule 3] The plan said not to add a top-level `jest.mock` of the shortcuts module to `games.test.ts`. That was not workable. `steam/games.ts` now imports the shortcuts module, whose import graph (fs-extra, online_monitor) fails to load under several steam suites' mocks. I added a factory mock of `shortcuts/shortcuts/shortcuts` to `games.test.ts`, `library.test.ts`, `removeCopies.test.ts` and `steamStartupKeyringDeferral.test.ts`. The delegation tests live in `games.test.ts` and use that mock.
- I briefly ran `git stash` / `git stash pop` once while checking for a pre-existing failure. Nothing was lost (the stash list held only that entry and it was popped and dropped), but this was a slip against project git rules.

## Operator gate (pending, not done)
Live Mac check: restart `pnpm tauri:dev` (sidecar is not rebuilt, check the sidecar.js mtime). On an installed Steam game (230070 or 206020), Add shortcut should create `~/Applications/<Title>.app` and the item should flip to Remove shortcuts. Double-clicking the `.app` should launch via the Play route. Remove shortcuts should delete the `.app` and flip the item back.

## Known gaps
- A Steam uninstall does not remove the shortcut, and Steam install does not create one (F-2, recorded in the todo).
- Windows `.lnk` for Steam uses the default shell icon.
