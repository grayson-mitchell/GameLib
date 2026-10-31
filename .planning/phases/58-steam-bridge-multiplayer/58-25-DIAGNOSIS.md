# 58-25 Direction A host-path diagnosis

## What is measured and why

Gap 1 (M-01 FAILED). The planned fix is a GameLib friend picker served from the game's own `ActivateGameOverlayInviteDialog` call, which then calls `ISteamMatchmaking::InviteUserToLobby`. The PC receives an ordinary Steam lobby invite; accepting it with the game running delivers `GameLobbyJoinRequested_t` (333) to the PC game. Direction B proved Schedule I handles 333. The fix only helps if the Mac host is really serving a listen socket, and 58-22 item 4 recorded `CreateListenSocketP2P` 0 and `Server connection state: Started` 0 in the gate launch. This session checks that first, on the current build, with no code change.

Rejected alternative (do not re-propose): setting rich presence `connect` so the PC shows "Join Game". The PC game would receive `GameRichPresenceJoinRequested_t` (337); 58-01 measured that Schedule I's own code does not reference 337 (wrapper only), so the PC game would ignore it.

Nothing here is scored. Strict-verified rule unchanged (D-08, D-53-13, D-56-16): In-Game presence never counts. A failure never reroutes to bottled Steam.

Paths: SIDECAR = `~/Library/Logs/GameLib/gamelib.log` (helper lines `bridge helper [3205720]: ...`); PLAYERLOG = Unity `Player.log` under `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-3205720/drive_c/users/crossover/AppData/LocalLow/<company>/<product>/`. The helper logs only the FIRST call of each method, so a CALL count is 0 or 1 per helper process.

## Procedure

1. Session dir `/tmp/gamelib-diag-<UTC>/` (`mkdir -p`).
2. Before the dev restart, archive SIDECAR and SIDECAR.old into it (`cp`; a missing source is recorded, not an error).
3. Restart dev: `pnpm tauri:dev 2>&1 | tee -a <session>/terminal.log`. The current build is used as is; no rebuild. Record `stat -f %m` of `public/bin/arm64/darwin/steam-bridge-helper`, `public/bin/arm64/darwin/steam_api64.dll` and `build/main/sidecar.js`. Confirm exactly one `target/debug/gamelib-shell` and record its pid.
4. Single launch: launch Schedule I from GameLib, click Continue into the world as host, wait 30 s.
5. Press the game's '+' add-player box once; record what appeared (window, toast, nothing).
6. Open Mac Steam's friends list, right-click the peer account, record every menu entry verbatim.
7. On the PC (peer online, Schedule I at main menu or closed), right-click the Mac account; record every menu entry verbatim, and whether the Mac account shows as playing Schedule I.
8. Quit the game, then `cp SIDECAR <session>/gamelib-diag.log`.

## Measurements

Every count is over the LAST `HELLO` segment of `gamelib-diag.log`, lines prefixed `bridge helper [3205720]:`:

- `CALL SteamNetworkingSockets013.CreateListenSocketP2P`
- `CALL SteamMatchMaking009.CreateLobby`
- `CALL SteamMatchMaking009.SetLobbyJoinable`
- `CALL SteamMatchMaking009.SetLobbyType`
- `CALL SteamMatchMaking009.SetLobbyData`
- `CALL SteamFriends017.ActivateGameOverlayInviteDialog`
- `CALL SteamFriends017.SetRichPresence`
- `CBDISP iCallback=513`
- `CBDISP iCallback=504`
- `NET role=game kind=join`
- every distinct `CBQ unlisted iCallback=` id
- every distinct `STUBCALL` name

Player.log: counts only, never lines. `grep -c 'Server connection state' PLAYERLOG`, and the distinct state words via `grep -o 'Server connection state: [A-Za-z]*' PLAYERLOG | sort | uniq -c`. 58-22's literal `Server connection state: Started` may not match the game's real wording, so the distinct words decide.

## Preflight

Run by the executor on the machine side, 58-22 Section 1 commands verbatim.

| ID   | Command (abridged)                                   | Observed                                                                                           | Result |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| PC1  | `pgrep -x steam_osx`                                 | a pid is printed (Mac Steam running)                                                               | held   |
| PC2  | `ps` grep for bottle Steam processes                 | printed nothing (0 lines)                                                                          | held   |
| PC3  | `defaults read ... CFBundleVersion`                  | `26.3.0.39832`                                                                                     | held   |
| PC7  | `shasum -a 256` built vs installed shim; `.gamelib-orig` | both `77abbe763e12...` (equal); `steam_api64.dll.gamelib-orig` exists                          | held   |
| PC10 | `objdump -h "Schedule I Free Sample.exe" \| grep -c '\.bind'` | 0                                                                                         | held   |

Build mtimes at preflight (epoch): helper 1793477487, shim 1793477488, sidecar.js 1793477706. Re-record at the dev restart (Procedure step 3).

## Results

Session: `/tmp/gamelib-diag-20261031T203126Z` (kept under /tmp, never committed). Dev restart: one `gamelib-shell` (pid 97371). `build/main/sidecar.js` mtime at restart 1793478702 (was 1793477706 at preflight; the dev restart rebuilt the sidecar; helper and shim were not rebuilt). The snapshot was taken while the game was still running, after the invite/join.

### Procedure defect (carry-forward for the 58-33 re-gate contract)

The helper pads log lines with multiple spaces (`CALL   X`, `NET    role=...`), so the single-space literals in the Measurements list return 0. The counts below used `grep -cE 'CALL +X\b'`. The 58-33 contract must use whitespace-tolerant patterns.

### Counts (last HELLO segment, helper [3205720])

| Literal | Count |
| ------- | ----- |
| CALL SteamNetworkingSockets013.CreateListenSocketP2P | 1 (20:33:09Z) |
| CALL SteamMatchMaking009.CreateLobby | 1 |
| CALL SteamMatchMaking009.SetLobbyJoinable | 0 |
| CALL SteamMatchMaking009.SetLobbyType | 0 |
| CALL SteamMatchMaking009.SetLobbyData | 1 |
| CALL SteamFriends017.ActivateGameOverlayInviteDialog | 1 (20:32:54Z) |
| CALL SteamFriends017.SetRichPresence | 0 |
| CBDISP iCallback=513 | 2 |
| CBDISP iCallback=504 | 1 |
| NET role=game kind=join | 2 (iface=Matchmaking cb=504; iface=Sockets cb=1221) |
| CBQ unlisted iCallback ids | none |
| STUBCALL names | SteamClient021.SetWarningMessageHook, SteamFriends017.GetMediumFriendAvatar, SteamUtils010.GetImageSize (1 each) |

Other: `SteamNetworkingSockets012.AcceptConnection` 1 (20:35:26Z), ReceiveMessagesOnConnection and SendMessageToConnection seen; NET Sockets send 28, recv 2; "NET cap of 32 reached" at 20:35:31Z (WR-06, about 3 s into the session; fixed by 58-28).

CBDISP histogram: 1101 x1, 1221 x3, 1222 x2, 1281 x4, 504 x1, 505 x4, 506 x1, 507 x2, 513 x2.

Player.log: `Server connection state` count 2; distinct words: Starting x1, Started x1.

### Operator answers (verbatim, 2026-11-01)

- Step 3: '+' (in the in-game menu) pressed, no response on the Mac.
- Steps 4/5: the operator did not list menu entries. Their words: "in steam friends invited to game. worked in game and can interact".

Observation (unscored, not a gate result; strict-verified rule unchanged): Mac Steam friends-list "invite to game" already produced a working Direction A join on this build, and both players could interact. The 58-34 re-gate can score both gestures. The Mac and PC menu entries were not captured, so 58-33 has no verbatim menu text to cite.

### Assessment

The host is serving: CreateListenSocketP2P CALL is 1 and Player.log reached `Started`. Recommendation: proceed. The game's own '+' call reached ActivateGameOverlayInviteDialog but showed nothing, which is the gap the friend picker (58-29, 58-31, 58-32) closes.

Decision: proceed (operator's choice, 2026-11-01)
