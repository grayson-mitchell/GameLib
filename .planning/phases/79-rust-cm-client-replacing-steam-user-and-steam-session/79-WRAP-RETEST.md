# 79 Wrap Retest: does an unwrapped Refresh sign Mac Steam's Friends out?

## Purpose

D-09: run the first retest arm early, against today's TS code. Does GameLib's full
unwrapped Refresh sign Mac Steam's Friends out? The answer decides D-10: the Rust wrap
port (plans 79-12 / 79-13) happens, or the wrap is deleted. The CM-fallback Refresh arm
in Rust is retested later in UAT-B (authored by 79-37, run by 79-38).

## Preconditions

- Network on.
- Mac Steam signed in with Friends visible.
- GameLib's Steam account signed in.
- No other GameLib instance running: `pgrep -fl 'GameLib|sidecar.js'` is empty.
- `git diff --quiet HEAD -- src/backend/storeManagers/steam/user.ts` exits 0 before the bypass.

## Procedure

1. Quit Mac Steam fully (Steam menu, Quit Steam) and relaunch it fresh, so it is the
   "freshly started" client D-09 names. Wait until Friends shows online.
2. Apply the bypass. `arm-b-nowrap.patch` (spike 075) no longer applies to HEAD, because
   the call is now `this.deps.macSteamOffline.withMacSteamOffline(...)` in
   `wrappedConnectNow`. Hand-make the equivalent edit there: replace the
   `withMacSteamOffline` call with
   `await this.connectSteamUserClient(token, { reason, wrap: 'not-darwin', generation })`
   plus `void this.deps.macSteamOffline.withMacSteamOffline`, with a
   `// SPIKE-075 TEMP: wrap bypassed (unwrapped real-app logon). REVERT.` marker.
   Never commit the bypass.
3. Run `pnpm build:sidecar` (confirm `build/main/sidecar.js` is newer than user.ts), then
   `pnpm tauri:dev` (never `tauri:dev:run`).
4. The operator presses Refresh in the Steam library.
5. The operator watches the Friends list for at least 90 s and says whether it ever
   showed signed out or offline.
6. Quit GameLib, then revert: `git checkout -- src/backend/storeManagers/steam/user.ts`
   and `pnpm build:sidecar`.

## Evidence lines

- In `~/Library/Logs/GameLib/gamelib.log`: the line
  `CM logon mode=authenticated reason=user-refresh wrap=not-darwin` must appear, and NO
  `steam://open/gooffline` may appear.
- Tail of `~/Library/Application Support/Steam/logs/connection_log.txt` for `LogOff` /
  `LogOn` lines in the window.
- Quote only the mode/reason/wrap fields in this file. No account name, SteamID or token.

## Verdict rule

PASS = Friends never showed signed out AND connection_log shows no user logoff in the
window. FAIL = any sign-out.

The verdict line (column 0, exactly one) is written in the Result section below.

## Structural Reachability Review

- The Refresh button in the Steam library is reachable in the running app.
- Today's app does not log on to the CM at launch, so Refresh is the trigger for the
  authenticated logon. Pressing it exercises the same `wrappedConnectNow` path the
  wrap normally covers, with the wrap bypassed.
- With the bypass the logon reports `wrap=not-darwin`, which is what makes the evidence
  line distinguish this run from a wrapped one.

## Result

Pending (filled in by the Task 2 live run).
