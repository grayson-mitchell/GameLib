# Quick 261024-g3m: Raise Wine/CrossOver game window on macOS

## One-liner
Shared pid-then-name targeted `osascript`/System Events raise helper (`raiseWineGameWindow`), fired at `bottleProcessMonitor.recordFirstMatch` (bridge + bottled-steam) and in the sideload Wine launch.

## Commits
- 9dfa1631d: helper + unit tests (`src/backend/utils/wineWindowRaise.ts`, `__tests__/wineWindowRaise.test.ts`)
- 7ada31352: wiring (`bottleProcessMonitor.ts`, its test, `storeManagerCommon/games.ts`)

## Design notes
- Constant `on run argv` AppleScript; pids (filtered `/^\d+$/`) and names travel only as argv (T-g3m-01).
- First attempt runs immediately (pid already known), then up to 12 attempts at 1500ms, one 2500ms settle re-raise. Timers tracked and `unref?.()`'d; no `app.hide()` fallback. `__stopWineWindowRaises()` test hook.
- `raiseBottledGameWindow` in `bottle.ts` untouched. GOG/Epic/Amazon Wine paths untouched.

## Verification (actual results)
- `npx jest` wineWindowRaise + bottleProcessMonitor + steam games.test: 3 suites, 385 tests pass.
- `npx tsc --noEmit`: clean. `npx prettier --check` over the 5 written paths: clean.
- Wiring grep: exactly 1 `raiseWineGameWindow(` call in each of games.ts and bottleProcessMonitor.ts.
- `pnpm lint`: exit 0 (ceiling PASS lines were not visible in my filtered output; exit code is the evidence). `graphify update .` run.
- NOT live-verified. No real osascript/Wine launch was exercised.

## Deviations
None. (Test-only note: after `__stopWineWindowRaises()` the raise promise never resolves because its timer is cleared, so tests do not await it.)

## Human-verify (pending, todo left in `.planning/todos/pending/`)
- Live check (packaged debug bundle, macOS): launch Avernum 6 (206060) via the bridge route and press Play. Expected: pre-game settings window (or the game window with bypass ticked) comes to front without clicking the Dock icon; sidecar log shows `raiseWineGameWindow [bridge:206060]: raised ...`. If not, record whether the log shows a miss (pid/name lookup problem) or a hit while the window stays behind (GameLib re-taking focus / cooperative-activation refusal); next options are the `minimizeOnLaunch` path in `launcher.ts` (~L150/L185, unverified under Tauri) and a native `NSRunningApplication` route.
- Secondary: one bottled-Steam launch and one sideloaded Wine launch.
- A first run may show the macOS "GameLib wants to control System Events" Automation prompt, the same consent the bottled path's existing raise uses.
