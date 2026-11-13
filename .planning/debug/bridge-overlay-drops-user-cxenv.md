---
status: resolved
trigger: "from todo .planning/todos/pending/2026-11-13-bridge-overlay-launch-drops-user-cx-env.md — bridge overlay launch drops the user's per-game CX_ENV value"
created: 2026-11-13
updated: 2026-11-13
---

# Debug: bridge overlay launch drops the user's per-game CX_ENV value

## Symptoms

DATA_START
- **Expected:** A per-game env var `CX_ENV=<user tokens>` set in a game's settings reaches the game process on a bridge launch with the overlay on (CrossOver overlay runner, cx-env overlay branch). The overlay's own tokens (`DYLD_INSERT_LIBRARIES='…'` etc.) are appended after the user value: `appendCxEnvTokens()` keeps an existing `CX_ENV` value first.
- **Actual:** Dungeons of Dredmor (98800), 2026-11-13. The operator set `CX_ENV=STEAM_OVERLAY_LOGGING=1 STEAM_OVERLAY_LOGGING_FLUSH=1`. GameLib logged `98800: Setting enviromentOptions to [{"key":"CX_ENV",...}]` at 19:45:01. A passive probe dylib inside the game process (pids 80509, 83280) saw `CX_ENV` beginning directly with the overlay's `DYLD_INSERT_LIBRARIES='…'` token, with the user prefix gone. `STEAM_OVERLAY_LOGGING` and `STEAM_OVERLAY_LOGGING_FLUSH` were unset; `SteamGameId`/`SteamOverlayGameId`=98800 were set.
- **Errors:** none; the value is silently dropped.
- **Timeline:** found 2026-11-13 during the (closed) Dredmor overlay debug, `.planning/debug/resolved/opengl-bridge-overlay-no-attach.md`. Unknown whether it ever worked.
- **Reproduction:** set per-game env `CX_ENV=FOO=1` on a bridge title with overlay on, launch, and inspect the game process env (probe dylib, or `/tmp/gameoverlayrenderer.<pid>.log` appearing when `STEAM_OVERLAY_LOGGING=1` is set).
- **Already checked:** `appendCxEnvTokens()` and its call site in `src/backend/storeManagers/steam/gameBridgeWineLaunch.ts` (cx-env branch, ~L362-385) pass `launchSettings.enviromentOptions` and look correct. So the loss is elsewhere: either `launchSettings.enviromentOptions` lacks the per-game entry at that point, or something downstream rebuilds `CX_ENV` from overlay tokens alone (wine spawn env builder, DRM/known-fix env paths, `bridge/overlay/overlayLaunch.ts` L43-60).
- **Required deliverables:** fix; a unit test that a user `CX_ENV` value survives the cx-env overlay merge into the final spawn env. Follow repo conventions (`Skill("gamelib-conventions")`): fake-HOME isolation for any spawn in tests; `npx prettier --check` scoped to changed paths. Do NOT live-launch games; a live check is left to the operator.
DATA_END

## Current Focus

hypothesis: confirmed - the per-game env never enters the bridge launch settings
test: traced bridgeBottleSettings origin (getBridgeBottleSettings -> stockBridgeBottleSettings)
expecting: n/a
next_action: none (fixed; operator live check pending)

## Evidence

- stockBridgeBottleSettings (bridgeBottle.ts) builds `{...deps.config.getSettings(), wineCrossoverBottle, wineVersion}`: GLOBAL settings only. fireBridgeWineLaunch, known fixes, DLL overrides and the cx-env overlay merge all start from it, so the per-game `enviromentOptions` (GameConfig, read by SteamGame.getSettings) was never consulted. appendCxEnvTokens and its call site were correct; there was simply no user CX_ENV to keep.

## Eliminated

- appendCxEnvTokens / cx-env call site dropping the value (unit-tested: user value stays first).

## Resolution

root_cause: bridge launch settings derive from global config, never the title's per-game GameConfig, so per-game env vars (CX_ENV included) were silently ignored on every bridge launch.
fix: gameBridgeWineLaunch.ts reads the per-game enviromentOptions (deps.gameConfigs) at the top of fireBridgeWineLaunch and folds them in via withUserGameEnv (per-game key replaces a same-named global key, case-insensitive), before known fixes, DRM env and the overlay merge.
verification: new __tests__/bridgeUserGameEnv.test.ts (user CX_ENV survives the overlay merge into the final env); full steam jest dir passes (160 suites); tsc clean for touched files; prettier clean. No live launch; operator should re-run Dredmor with CX_ENV=STEAM_OVERLAY_LOGGING=1 and look for /tmp/gameoverlayrenderer.<pid>.log.
files_changed: src/backend/storeManagers/steam/gameBridgeWineLaunch.ts, src/backend/storeManagers/steam/__tests__/bridgeUserGameEnv.test.ts
