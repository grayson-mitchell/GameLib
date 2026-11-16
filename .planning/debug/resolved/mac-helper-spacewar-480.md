---
status: resolved
trigger: 'Mac Steam helper shows "playing Spacewar" (AppID 480) in Friends; fix via /gsd-debug (todo 2026-11-15-mac-steam-path-shows-playing-spacewar.md)'
created: 2026-11-16
updated: 2026-11-17
---

## Symptoms

- **Expected:** `steam-bridge-helper --steam-owned-apps`, `--steam-installapp` and `--steam-uninstallapp` talk to the running Mac Steam client without Steam treating the helper as a running game. Friends shows no game; `~/Library/Application Support/Steam/logs/gameprocess_log.txt` gains no `AppID 480 adding PID` line.
- **Actual:** each helper run logs `AppID 480 adding PID <helper pid> as a tracked process`, then `Remove 480 from running list` ~1-2 s later. Friends briefly shows "playing Spacewar".
- **Errors:** none; the helper calls succeed.
- **Timeline:** seen in Phase 79 UAT-B item 14 (Refresh via Mac path, 2026-11-15) and 79-UAT part C item 23 (InstallApp/UninstallApp, 2026-11-16). Mitigation: Mac path off by default (`3b7417c05`, `macSteamPathFlag.ts`).
- **Reproduction:** with Mac Steam running and signed in, run the helper's owned-apps mode from its packaged directory.

## Current Focus

hypothesis: steamclient.dylib reads `steam_appid.txt` from the helper EXECUTABLE's directory; `meta/buildSteamBridgeShims.ts` stages `steam_appid.txt`=480 beside the built helper (finding #4, Phase 24), so every steamclient-only helper mode registers as AppID 480.
test: (done, see Evidence) A/B with the file present/absent beside an identical binary.
expecting: n/a — hypothesis confirmed live.
next_action: verify whether bridge mode (normal / identity-only, `helperSpawn.ts`) still depends on the beside-binary copy now that Phase 51 stages a per-appId cwd with its own steam_appid.txt; then fix (stop staging the beside-binary copy, or give steamclient-only modes a clean exe dir), re-verify 0 AppID 480 lines for owned-apps AND install/uninstall, flip `macSteamPathEnabled()` default on, update the todo.

## Evidence

- timestamp: 2026-11-16T12:37 (local). Probe harness: `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/7d99f747-b6ad-402a-8a06-edc78e85ee97/scratchpad/spacewar-probe/run.sh <with|without> [real]` — copies of `public/bin/arm64/darwin/steam-bridge-helper` (Nov 15 build, has `--steam-owned-apps`) in `with/` (plus `steam_appid.txt`=480) and `without/`; runs from an empty `cwd/`; counts new `AppID 480 adding PID` lines in gameprocess_log.txt after 4 s. The permission rule in `.claude/settings.local.json` allows exactly this script.
  - `without` guard path (`--expect-steamid 1`: attach, BLoggedOn, GetSteamID, account-mismatch exit 2): **0** new log lines.
  - `with` guard path, same binary/cwd: **1** `AppID 480 adding PID 64629`, then `Remove 480 from running list` 1 s later.
  - `without real` (stored userData.steamId): match true, `GetSubscribedApps` count 1140, exit 0: **0** AppID 480 lines.
- `build/bin/arm64/darwin/steam-bridge-helper` (Nov 14) is STALE (no `--steam-owned-apps`, exits 6 "missing --appid"); `public/bin/arm64/darwin/` is current. Both dirs carry `steam_appid.txt`=480.
- `meta/buildSteamBridgeShims.ts:52` stages the file "next to the built helper (finding #4) -- the helper's runtime cwd (set by Plan 24-06 to that directory) resolves the D-04 identity-only AppID from this file." `helperSpawn.ts:~98` (Phase 51): bridge helper cwd is now a per-appId staging dir under `steamBridgeHelperStateDir`, identity-only gets `<stateDir>/<appId>/identity` with its own steam_appid.txt=480.

## Eliminated

- hypothesis: the first IClientUser IPC call (BLoggedOn/GetSteamID) makes Steam default an unidentified pipe to 480 (todo's inference). Eliminated: the same calls register nothing when no steam_appid.txt is beside the executable.
- hypothesis: cwd or SteamAppId/SteamGameId env (todo probe runs 2026-11-15). Those runs kept the beside-binary file; the file, not cwd/env, is the trigger.

## Resolution

root_cause: meta/buildSteamBridgeShims.ts staged steam_appid.txt=480 beside steam-bridge-helper; steamclient reads it from the executable's directory, so --steam-owned-apps / --steam-installapp / --steam-uninstallapp registered as AppID 480 ("playing Spacewar").
fix: 537df457d — build no longer stages the file (removeStaleSteamAppId() deletes leftovers); macSteamPathEnabled() default on (GAMELIB_STEAM_MAC_PATH=off opts out). Unused native/steam-bridge/steam_appid.txt removed (landed in bc7f60246).
verification: live probe (owned-apps, 1140 apps, 0 AppID 480 lines); operator UAT 2026-11-17 — Mac-path Refresh, two UninstallApp runs and an InstallApp adoption of 264160, 0 AppID 480 lines in gameprocess_log.txt.
files_changed: meta/buildSteamBridgeShims.ts, meta/__tests__/buildSteamBridgeShims.test.ts, src/backend/storeManagers/steam/library/macSteamPathFlag.ts, src/backend/storeManagers/steam/__tests__/macSteamPathFlag.test.ts, library.macSteamRefresh.test.ts, CLAUDE.md
