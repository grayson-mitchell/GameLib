---
created: 2026-10-27
title: "Bridge HELLO launch secret is unverified on a live Phase 55 web-API ticket title"
severity: medium
platform: macos
ready: live-gate
area: steam-bridge
found_by: "quick 261027-9vr execution, 2026-10-27"
files:
  - native/steam-bridge/helper/bridge_helper.c
  - meta/gen_vtables.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/bridgeConfig.ts
---

## Problem

Quick `261027-9vr` gated the bridge helper's CONTROL and interface slots behind a per-spawn HELLO
secret. Jest covers it against the real compiled helper, but no game has run through it yet.

## Live gate

Restart `tauri dev` first, because it does not rebuild the sidecar. Then launch a Phase 55 live-gate
title that calls GetAuthTicketForWebApi, and check:

1. The game receives callback 168 (`GetTicketForWebApiResponse_t`), including after the helper's 5 s
   idle timeout forces a reconnect.
2. A second, unauthenticated loopback client sending CONTROL slot 6 (DRAIN) gets STATUS_ERR, and the
   helper logs `AUTH refused`.
3. `gamelib_bridge.cfg` is mode 600, and `ps` shows no secret in the helper's argv.
4. The helper log shows `HELLO shim attached` for the game, but not for the backend's readiness probe.

## Live result, 2026-10-27 (Manor Lords, appId 1363080)

Abiotic Factor (427410) is not installed: its bridge bottle holds only partial game files and no
`steam_api64.dll`. Operator decision: run checks 2-4 on Manor Lords, which do not depend on the
title, and leave check 1 open until Abiotic Factor is reinstalled. `tauri dev` was restarted at
12:42 and `sidecar.js` was rebuilt then, after the `261027-9vr` commits.

- Check 1 **not exercised**. Manor Lords never calls GetAuthTicketForWebApi, so callback 168 needs
  Abiotic Factor.
- Check 2 **passed**. A scratchpad Node client connected to 127.0.0.1:56419 with no HELLO and sent
  CONTROL (`0xffff`) slot 6. It got `len=5 id=0x5eed status=1`, which is STATUS_ERR. The helper
  logged `AUTH   refused unauthenticated frame ordinal=65535 slot=6 secret=required` at 12:53:51.
  The helper is single-threaded (`bridge_helper.c:1023-1041`), so the probe sat in the listen
  backlog, unanswered, while the game held its connection; it was served only after the game quit.
  Three AUTH lines appear because two earlier probe attempts timed out but were still in the
  backlog, and the helper read those too.
- Check 3 **passed as written**. Both `gamelib_bridge.cfg` copies (beside `ManorLords.exe` and in
  `Steamv157/Win64`) are `-rw-------` (600), each with a 64-hex `secret=` line. The helper's argv is
  `steam-bridge-helper --appid 1363080 --port 0`. However, `ps eww` shows
  `GAMELIB_BRIDGE_SECRET=` in the helper's environment, and the value matches the cfg secret.
  `unsetenv()` does not scrub the original env block that macOS serves to `ps`. Filed as
  `2026-10-27-bridge-helper-secret-readable-via-ps-env.md`.
- Check 4 **passed**. There is one `HELLO  shim attached appid=1363080` (12:50:03), followed by
  `GINIT ... ok=1`. There is no HELLO line between `LISTEN` and `READY init=ok` (both 12:50:00), so
  the readiness probe's HELLO carried the role byte and was not logged as a shim attach.

Check 1 was left for Abiotic Factor; see below.

## Check 1, Abiotic Factor (appId 427410), 2026-10-27

Abiotic Factor was reinstalled. On a first launch at default verbosity, the helper logged `CALL
SteamUser023.GetAuthTicketForWebApi` (12:58:23) and then `CBQ    queued iCallback=168 result=1
cub=2572` (12:58:24). The game reached `MainMenu` with one `Obtained steam authticket` line, so the
retry loop did not run. The reinstall replaced the bottle, and with it the Phase 55 diagnostic
`Engine.ini`, so the game's Verbose lines were missing. The game also never idled 5 s, so no
reconnect happened: there was one HELLO and one socket.

The second launch forced a reconnect. A Verbose `Saved/Config/Windows/Engine.ini` was written into
the bottle (LogEOSSDK, LogEOS, LogEOSSubsystem, LogOnline, LogOnlineIdentity, LogOnlineSession,
LogHttp; delete the file to revert). A scratchpad watcher sent SIGSTOP to the game process holding
the helper socket as soon as the first HELLO appeared. It held the pause for 7 s, then sent SIGCONT.

- 13:01:02: `HELLO  shim attached appid=427410` (first socket).
- 13:01:03 to 13:01:10: game stopped. The helper's 5 s `SO_RCVTIMEO` closed its end, and `lsof`
  showed the game's socket in `CLOSE_WAIT`.
- 13:01:10: a second `HELLO  shim attached appid=427410`, right after SIGCONT, so the shim
  re-authenticated on its new socket. No `AUTH` line was logged at any point in the launch.
- 13:01:28: `CALL   SteamUser023.GetAuthTicketForWebApi`, then at 13:01:30
  `CBQ    queued iCallback=168 result=1 cub=2572`, both on the reconnected socket.
- The game log (opened 13:01:02) shows `LogOnline: STEAM: [AppId: 427410] Client API initialized 1`,
  one `Obtained steam authticket` (00.01.28:694), `FOnlineAsyncEventSteamGetTicketForWebApiResponse
  Received code 1.` (00.01.30:221), a second `TokenGrant` success, and
  `LogEOSMessaging: Successfully connected to Stomp` (00.01.31:855).

Check 1 **passed**, including the case after the reconnect.

## Resolution

All four live checks passed on 2026-10-27. Check 1 ran on Abiotic Factor, with a forced reconnect
before the ticket request. Checks 2-4 ran on Manor Lords. Quick `261027-9vr` is live-verified. One
gap the gate found, that the secret is still readable with `ps eww`, is filed separately as
`2026-10-27-bridge-helper-secret-readable-via-ps-env.md`.
