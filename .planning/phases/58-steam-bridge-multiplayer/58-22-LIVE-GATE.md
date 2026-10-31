# Phase 58 Live Gate: Schedule I: Free Sample (3205720) multiplayer in TCP shim mode through the macOS native Steam bridge

Gate subject: Schedule I: Free Sample 3205720 (D-14, approved in 58-01-TITLES.md, `Verdict: PROCEED`, not re-picked), installed in the per-game bottle
`GameLibSteamBridge-3205720`, launched from GameLib in TCP shim (bridge) mode, playing against the second account on the Windows/Linux
peer PC (D-04), same LAN, any connection path accepted (D-06).
Authored by: plan 58-22. Run by: plan 58-23.
Decision D-E: the author never runs the gate. Plan 58-22 launches no game and fills no scored `result:` line.
Plan 58-23 may fill `result:` lines, the Run record, Gaps and the Verdict, and pin observed literals. It may not edit the contract otherwise.
Standing rule: strict-verified per D-08 / D-53-13 / D-56-16. Only `role=game` NET lines count. Helper-originated lines (`role=helper`,
`CBQ p2p-accept src=helper`, the helper's own fallback accept) and Mac Steam's In-Game status never count. A failure never reroutes to bottled Steam.
A green test suite never closes this gate (live-gate-contract-authoring Section 4 ii).

Done-when being gated (M-01, M-04, M-05): a TCP-mode title (Schedule I) passes the D-08 bar in both directions (D-05), and the relay / incoming-session
behaviour is recorded.

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.

## Pre-gate state (read, not measured by this plan)

Everything below is copied from existing planning artifacts; this plan launched nothing.

- Title facts (58-01-TITLES.md): Unity/Mono, FishNet with an embedded FishySteamworks transport, Steamworks.NET 2024.8.0 on SDK 1.60, `steam_api64.dll` is the GameLib shim (genuine DLL kept as `steam_api64.dll.gamelib-orig`), launch exe `Schedule I Free Sample.exe` has no `.bind`, x86-64, no anti-cheat.
- Runtime calls observed on the wired bridge (58-17): Matchmaking009 lobby calls plus `SendLobbyChatMsg`, `SteamNetworkingUtils004.CheckPingDataUpToDate` (S1, S2); `NET role=game kind=join iface=Matchmaking cb=504 n=1` once per session. Stubs then: `ActivateGameOverlayInviteDialog` (since wired by 58-18), `GetMediumFriendAvatar`, `GetImageSize`, `SetWarningMessageHook`.
- After 58-18..58-21 (quick host check 2026-10-31 ~20:27, not a gate run): Player.log `Server connection state: Starting`, then `Started and transport index: 1`, then `Starting FishySteamworks client connection`; helper `CALL SteamNetworkingSockets013.CreateListenSocketP2P`, `CALL SteamFriends017.ActivateGameOverlayInviteDialog`, `NET role=game kind=join iface=Matchmaking cb=504`. The listen-server failure is fixed (todo closed in `c3e0a8aef`; fix is 58-18's SteamNetworkingSockets012 serving). The transport therefore uses SteamNetworkingSockets (Sockets), so send/recv NET lines are expected on `iface=Sockets`.
- 333 (GameLobbyJoinRequested_t) is relayed to the game since 58-18 (`hold:true`); that relay is UNPROVEN LIVE until Direction B.
- 337 (GameRichPresenceJoinRequested_t) is not relayed and was never observed; rich presence is not set by the game.
- Join signal for scoring: `504` (LobbyEnter_t) on `iface=Matchmaking`. D-08a does not apply (the game references 504).

Lessons from 58-17 that bind the operator instructions:

1. "Invite to Game" requires the INVITER to be in-game. The Mac counts as in-game only while Schedule I runs via GameLib (helper holds the app id).
2. Clicking a Steam invite link while the Mac game is NOT running gives Mac Steam's "wrong platform" error (the title has no Mac build). The Mac must already be inside Schedule I (main menu or better) before accepting. A "wrong platform" error is an operator-error launch, recorded as unscored, never as a product failure.
3. Direction A is GameLib (Mac) hosts, PC joins. Direction B is PC hosts, Mac (already in game) joins. Do not mix them in one launch.
4. The bottle's Unity `Player.log` contains lobby ids and SteamIDs. It is never copied into a committed artifact. If it is captured into the session dir it is redacted there (see Capture) or only grepped for fixed literals.

## Gesture surfaces (Test 7 input, from 58-01 Join flow and 58-17)

The Steam overlay is NOT available inside the bridged game: Schedule I runs under Wine with the GameLib shim, and Mac Steam's overlay is not injected into it. Any gesture
that needs an overlay (Shift+Tab, an overlay invite dialog) is IMPOSSIBLE and is not asked of the operator. The game's own "add another player" control calls the now-wired
`SteamFriends017.ActivateGameOverlayInviteDialog`; whether Mac Steam shows ANY dialog for that call is unobserved, so it is tried and recorded but never relied on.

Direction A invite gestures, tried in this order until the PC account is in the lobby (record which one worked):

- A1. In Schedule I, press the game's own "add another player" / invite control (calls ActivateGameOverlayInviteDialog). Record whether any Mac Steam dialog or toast appears.
- A2. In the Mac Steam friends list (Mac Steam window, outside the game), right-click the peer account and choose "Invite to Game" (the Mac is in-game as 3205720 while Schedule I runs). The PC account accepts in its Steam chat/notification.
- A3. On the PC, in the friends list, right-click the Mac account and choose "Join Game" (works only if Mac Steam offers it; the game sets no rich presence, so this is expected to be unavailable; record it).

Direction B gestures (58-01 Join flow: Steam friend invite arriving as 333):

- B1. On the PC, host in Schedule I (Continue, then the host's own invite control), invite the Mac account from the PC Steam friends list ("Invite to Game"). The Mac, already inside Schedule I, accepts the invite from Mac Steam's chat/notification (not a browser link opened while the game is closed).
- B2. If B1 produces nothing, the operator records what Mac Steam showed. No other join route (lobby browser, code) was observed in 58-01; the operator MAY try the game's own join menu and record it.

## Paths used below

- `<session>` = `/tmp/gamelib-gate-<ISO8601-UTC>/`, created once (PC5), reused by 58-23
- `SIDECAR` = `~/Library/Logs/GameLib/gamelib.log` (helper lines `bridge helper [3205720]: ...`)
- `APPDIR` = `~/Library/Application Support/GameLib`
- `BOTTLE(3205720)` = `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-3205720`
- `GAMEDIR` = `BOTTLE(3205720)/drive_c/Program Files (x86)/Steam/steamapps/common/Schedule I Demo`
- `INSTALLED_SHIM` = `GAMEDIR/Schedule I Free Sample_Data/Plugins/x86_64/steam_api64.dll`
- `BUILT_SHIM` = `public/bin/arm64/darwin/steam_api64.dll`; `BUILT_HELPER` = `public/bin/arm64/darwin/steam-bridge-helper`; `SIDECAR_JS` = `build/main/sidecar.js` (paths: `meta/buildSteamBridgeShims.ts` `shim64OutputPath` and its header comment)
- `PLAYERLOG` = the Unity `Player.log` under `BOTTLE(3205720)/drive_c/users/crossover/AppData/LocalLow/<company>/<product>/` (`findUnityPlayerLogs`, `meta/bridgeCensus.ts:1534`)

## 1. Preconditions

| ID   | Precondition | Command | Positive observable |
| ---- | ------------ | ------- | ------------------- |
| PC1  | Mac Steam signed in | `pgrep -x steam_osx` | Prints a pid |
| PC2  | No Windows Steam running in any bottle | `ps -axo pid,command \| grep -iE 'steamwebhelper\.exe\|steamservice\.exe\|Steam\\\\steam\.exe' \| grep -v grep` | Prints nothing |
| PC3  | CrossOver build allowlisted | `defaults read /Applications/CrossOver.app/Contents/Info CFBundleVersion` | Prints `26.3.0.39832` |
| PC4  | Fresh build, in this order | `pnpm gen-vtables && pnpm build-steam-bridge`, then `pnpm exec vite build`, then `pnpm build:sidecar-sea`; then `stat -f %m BUILT_HELPER BUILT_SHIM SIDECAR_JS` | All exit 0, and all three mtimes are newer than the 58-21 commit time (`git log -1 --format=%ct c683b8fc8`); mtimes recorded |
| PC5  | Session dir and archived prior logs | `mkdir -p <session>`; `cp SIDECAR <session>/pre-session-gamelib.log`; `cp SIDECAR.old <session>/pre-session-gamelib.log.old` | `ls -la <session>` shows the copies (a missing source is recorded, not an error) |
| PC6  | Exactly one fresh dev app, started AFTER PC4 and after PC5, under an append-only tee | Operator runs, in a terminal: `pnpm gen-vtables && pnpm build-steam-bridge && pnpm tauri:dev 2>&1 \| tee -a <session>/terminal.log` (the first two are PC4's builds; the restart is what loads `build/main/sidecar.js`, since `tauri dev` does not rebuild the sidecar), then `pgrep -f 'target/debug/gamelib-shell' \| wc -l` | Prints 1; the pid is recorded; `stat -f %m SIDECAR_JS` is older than the app's start time and newer than PC4's helper mtime |
| PC7  | The title's bottle is shim-routed with the freshly built shim | `shasum -a 256 BUILT_SHIM INSTALLED_SHIM`; `ls "GAMEDIR/Schedule I Free Sample_Data/Plugins/x86_64/" \| grep gamelib-orig` | The two hashes are equal (first launch may re-stage the shim: if they differ before launch 1, record, launch once to completion of staging, and re-compare; a difference after launch 1 is a FAIL of this precondition); the `.gamelib-orig` file exists |
| PC8  | Peer PC ready | Operator statement | Second account online, friends with the main account, Schedule I: Free Sample installed and sitting at its main menu on the peer (the 58-01 outstanding confirmation is closed here) |
| PC9  | Local Network permission state (record-only) | Operator reads System Settings, Privacy, Local Network | Wine / CrossOver / Steam grant states recorded verbatim |
| PC10 | Launch exe has no `.bind` (58-01, re-checked) | `objdump -h "GAMEDIR/Schedule I Free Sample.exe" \| grep -c '\.bind'` | Prints 0 |

PC1-PC5, PC7, PC9 and PC10 are run by 58-23 (automatable). PC6 and PC8 need the operator.

## 2. Launch procedure

Launch ordinals:

- launch 1: Direction A. GameLib (Mac) hosts Schedule I, the peer PC joins (gestures A1..A3).
- launch 2: Direction B. The peer PC hosts, the Mac is already inside Schedule I (launched through GameLib, at least at the main menu) and accepts the invite (gestures B1..B2).

Dual-sink capture standard. Before each launch:

1. Assert one app instance: `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 and the pid equals PC6's. Any other count aborts the launch (its evidence is not scorable).
2. Write the delimiter (exact text) into the transcript:
   `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session>/terminal.log`
   Dev runs under `tee -a <session>/terminal.log`. Never a bare `tee`, never a `>` redirect. Boundaries are found with `grep -n '^=== GATE LAUNCH' <session>/terminal.log`.
3. The operator launches Schedule I from GameLib (Library, Schedule I: Free Sample, Play).

While BOTH players are in the same session (before quitting), capture the transport path (record-only, D-06):

- `pgrep -f steam-bridge-helper` gives the helper pid. The helper holds Mac Steam's session, and Mac Steam (not the Wine game) owns the real sockets, so capture both:
  `lsof -nP -iUDP -a -p <helper pid> | tee <session>/lsof-helper-launch-${N}.txt` and `lsof -nP -iUDP -a -p $(pgrep -x steam_osx) | tee <session>/lsof-steam-launch-${N}.txt`.
- `ps -axo pid,command | grep -iE 'steam-bridge-helper|steam_osx|Schedule I Free Sample' | grep -v grep | tee <session>/procs-launch-${N}.txt`.
- The operator then quits the game.

After the game exits and BEFORE any further launch or dev restart:

- `cp SIDECAR <session>/gamelib-launch-${N}.log` (this is the sink for every `bridge helper [3205720]:` literal; helperProcess.ts relays helper stdout via logInfo and stderr via logWarning, both into SIDECAR, live as the helper emits, not deferred to exit)
- `pnpm bridge-census --multiplayer 3205720 | tee <session>/census-launch-${N}.txt` (reads the newest HELLO segment of SIDECAR; run it per launch, before the next launch writes a new HELLO)
- record fixed-literal greps of PLAYERLOG only (counts, never lines): `grep -c 'Server connection state: Started' PLAYERLOG`, `grep -c 'Starting FishySteamworks client connection' PLAYERLOG`, `grep -c 'Entered lobby' PLAYERLOG`. If a copy of PLAYERLOG is kept in `<session>`, redact it first (`sed -E 's/[0-9]{16,}/<id>/g'`) and never commit it.
- single-instance assertion again (count 1, same pid)
- after launch 2: closing inventory `ls -la <session>` and `wc -l <session>/*` into `<session>/inventory.txt`

Captures are never committed. After 58-23 records its results the operator deletes `<session>` (T-58-28, the same deletion 58-09 did). 58-23 copies only literals, counts and the census line into this file, and records lsof results as direct / relayed / unknown, never the address (T-58-61).

## 3. Structural Reachability Review

Tests applied (live-gate-contract-authoring Section 2): Test 1 URL/route exists; Test 2 concurrency reachability; Test 3 literal is emitted and its sink is named; Test 4 absence-observability; Test 5 requirement-interaction (pairs); Test 6 external state and a positive observable; Test 7 UI-level gesture reachability. Authored 2026-10-31. Verdict legend: R = REACHABLE, N/A with reason, C = CONDITIONAL, I = IMPOSSIBLE. Findings count at authoring: 0 structural impossibilities remain after the Test 7 replacement below; 2 conditionals are recorded as external premises.

### Review part a. Emitter and sink table (Test 3 with the SINK clause)

| Literal | Emitter (file:line) | Sink | Captured by |
| ------- | ------------------- | ---- | ----------- |
| `NET role=game kind=join iface=Matchmaking cb=504 n=<k> path=...` | `native/steam-bridge/helper/bridge_helper.c:2275-2280` (join promoted to `role=game` only when the shim dispatched to >= 1 target) via `gl_net_evidence` `:578-608` | helper stderr, then sidecar logWarning `bridge helper [3205720]: ...` (`helperProcess.ts:510`), then SIDECAR | `gamelib-launch-N.log`, census |
| `NET role=game kind=send iface=Networking\|Sockets\|Messages` | `bridge_dispatch.h:6665` (Networking), `:9851`, `:10523` (Sockets), `:10290` (Messages) | same | same |
| `NET role=game kind=recv iface=...` | `bridge_helper.c:666` (Networking), `:1141` (Sockets / Messages) | same | same |
| `NET ... kind=path ...` (direct / relayed marker) | `bridge_helper.c:702`, `:1191`, `:1205` | same | same (record-only) |
| `NET role=game kind=oversize` | `bridge_dispatch.h:4834`, `:6653`, `:6785`, `:9840`, `:10278`, `:10512`; `bridge_helper.c:658`, `:1019`, `:1115`, `:1129` | same | same (item 5) |
| `NET cap of 32 reached; later lines are not logged` | `bridge_helper.c:587-589` | same | grep in `gamelib-launch-N.log` (a cap hit is recorded; NET lines are limited to 32 per helper session) |
| `CALL <Iface>.<Method>` (e.g. `SteamNetworkingUtils004.InitRelayNetworkAccess`, `CheckPingDataUpToDate`, `SteamNetworkingSockets013.AcceptConnection`) | `bridge_helper.c:2414` | same | same |
| `CBDISP iCallback=<id> targets=<n> held=<h>` (1202, 1221, 1281, 333, 504) | `bridge_helper.c:2288-2290` | same | same |
| `CBQ unlisted iCallback=<id> action=drop` | `bridge_helper.c:1513`, `:1515` | same | same (item 7) |
| `STUBCALL <Iface>.<Method>` | `bridge_helper.c:2200` | same | same |
| `pnpm bridge-census --multiplayer 3205720` verdict line | `meta/bridgeCensus.ts:2493-2516` (grammar `NET_LINE_RE` `:2288`) | terminal stdout; reads SIDECAR and its rotated copies (`findAppLogs`, `:1594`) | `census-launch-N.txt` (tee) |
| Unity `Server connection state` / `Entered lobby` lines | the game (Unity Player.log) | PLAYERLOG | counts only (item 2 and 3 corroboration) |
| UDP endpoints | `lsof` | terminal stdout | `lsof-*-launch-N.txt` |
| `=== GATE LAUNCH N ===` | the capture instruction | `terminal.log` | `grep -n '^=== GATE LAUNCH'` |

None of the `bridge helper [...]` literals is demanded of `terminal.log` (Section 3 sink partition: sidecar `logInfo`/`logWarning` never reach the transcript). Every one is read from `gamelib-launch-N.log`.

### Review part b. Item, sub-check and precondition table

| Row | Surface it names | What it asks for | Verdict (Test 1 to Test 7) | Evidence |
| --- | ---------------- | ---------------- | -------------------------- | -------- |
| PC1 | Mac Steam process | pid exists | T1-T4 N/A; T5 R; T6 R positive observable is the pid; T7 N/A | `pgrep -x steam_osx` |
| PC2 | bottle Steam processes | none running | T4 R (a running Windows Steam would print a line); T5 R; T6 R external process surface checked; T7 N/A | `ps` grep |
| PC3 | CrossOver bundle | 26.3.0.39832 | T1-T4 N/A; T5 R; T6 R reads the installed bundle; T7 N/A | `defaults read` |
| PC4 | build tooling and mtimes | exit 0 and mtimes newer than the 58-21 commit | T4 R (stale artifact fails the compare); T5 C pair {PC4 rebuild, PC6 restart}: PC4 must precede PC6, enforced by the numbering; T6 N/A | `meta/buildSteamBridgeShims.ts:214-222`, package.json scripts |
| PC5 | SIDECAR and .old copies | archived | T3 R reads SIDECAR; T5 C pair {PC5 archive, PC6 dev restart}: archive must precede the restart (log_writer renames gamelib.log to .old on first write); T6 N/A | `src/backend/logger/log_writer.ts:72-74` |
| PC6 | dev restart, single instance | count 1 | T4 R falsifiable (count 2 aborts); T5 C pairs listed in part c; T6 R covers a pre-existing instance (F-34.4.2-18) by asserting count 1; T7 N/A | memory: tauri dev does not rebuild the sidecar; `pgrep` |
| PC7 | installed vs built shim | equal sha256 | T4 R falsifiable; T5 C pair {first launch re-stage, PC7 compare}: a restage on first launch is allowed for exactly one re-compare; T6 R positive observable is the equal hash plus the `.gamelib-orig` file; T7 N/A | 58-01 Install section (shim in `Plugins/x86_64/`) |
| PC8 | peer PC state | online, friends, installed, at menu | T6 C external state: the 58-01 note says the second account's own launch to the main menu was never separately confirmed, so the operator states it here; T7 N/A | operator statement |
| PC9 | Local Network grant | record-only | T4 N/A; T6 C an OS permission grant affecting LAN reachability; recorded not scored | System Settings |
| PC10 | `.bind` section | 0 | T4 R falsifiable (a stub would print >= 1); T5 R; T6 R; T7 N/A | 58-01 Launch exe section |
| Item 1 | build freshness and shim routing | PC4 + PC7 outcomes | T3 R filesystem and stat; T4 R; T5 C see part c; T6 R; T7 N/A | commands in PC4, PC7 |
| Item 2 (a) | NET join line (role=game) | `kind=join iface=Matchmaking cb=504` | T3 R sink SIDECAR; T4 C the host's own lobby-create produces this line without any peer (58-17 saw it once per session with no peer), so (a) alone does not prove a peer joined; falsifiability comes from (b) and (c) (a send/recv pair on Sockets needs a connected peer) and from the operator timestamp ordering in item 2; T5 C part c; T6 C peer session is external; T7 C see part e | `bridge_helper.c:2275-2280` |
| Item 2 (b) | NET send and recv (role=game) | both kinds on Networking/Sockets/Messages | T3 R sink SIDECAR; T4 R no peer means no send/recv (Matchmaking has no send/recv emitter, `bridge_dispatch.h` has none for Matchmaking); T5 C; T6 C peer session; T7 C | `bridge_dispatch.h:9851, 10523`, `bridge_helper.c:1141` |
| Item 2 (c) | operator confirmation | same world, mutual movement, verbatim | T3 N/A not a log claim; T4 R operator can answer no; T6 C external: peer PC, friendship, Local Network grant, a stale lobby from an earlier attempt (quit all Schedule I instances on both machines before each launch); T7 C part e | operator statement |
| Item 2 (d) | census verdict | `verified` | T3 R stdout teed; T4 R (`unverified` with a named missing leg); T5 R; T6 C inherits (a)/(b); T7 N/A | `meta/bridgeCensus.ts:2493` |
| Item 2 path | NET path field and lsof | direct / relayed / unknown | T4 N/A record-only; T5 R; T6 C both players in session at capture time; T7 N/A | `lsof` files, `NET ... path=` |
| Item 3 | Direction B, same sub-checks | as item 2 | as item 2; T7 C part e (the invite must arrive as 333 while the game runs) | as item 2 |
| Item 4 | relay / incoming-session observations | greps and counts | T3 R sink SIDECAR; T4 N/A record-only; T5 C part c; T6 R; T7 N/A | `bridge_helper.c:2414, 2288` |
| Item 5 | oversize and NET cap | counts | T3 R; T4 R presence observable (oversize lines are emitted by the same writer, and the cap line exists); T5 C; T6 R; T7 N/A | part a |
| Item 6 | stub notice D-13 | whether the notice fires | T3 R operator-observed UI; T4 N/A record-only; T6 C depends on the title's registry state at launch; T7 R the notice is shown on the game page by the existing Phase 56/58 UI; the operator reports what appeared | operator statement |
| Item 7 | unlisted callbacks | list of `CBQ unlisted` ids | T3 R sink SIDECAR; T4 N/A record-only; T5 C; T6 R; T7 N/A | `bridge_helper.c:1513, 1515` |
| Item 8 | responsiveness | operator note | T3 N/A; T4 N/A record-only; T6 N/A; T7 R | operator statement |
| Capture instruction | tee, delimiters, per-launch copies, census, lsof | present | T3 R each literal names its sink in part a; T5 C pairs in part c are the reductions applied; T7 N/A | Section 2 |

### Review part c. Pairing pass (Test 5)

Reduction applied: every state-mutating requirement against every evidence-bearing requirement (M x N, not the full cross product).
State-mutators considered (3): {PC4 rebuild, PC6 dev restart, launch 2}. Evidence-bearing requirements considered (3): {the `gamelib.log` archives, the census runs, the lsof captures}; the `terminal.log` transcript is a fourth sink checked against the same three mutators.
Pairs examined: 12 (3 x 4). Flagged: 4, each with a reduction.

- {PC4 rebuild, PC6 restart} x {SIDECAR archive}: the app start renames `gamelib.log` to `.old` on first write. Reduction: PC5 archives both before PC6; PC4 precedes PC5 only in that nothing running writes the log during a build.
- {PC6 restart} x {terminal.log}: a bare `tee` would truncate. Reduction: `tee -a` only, and the delimiter is appended after the restart.
- {launch 2} x {gamelib.log archive, census}: launch 2's HELLO starts a new helper segment and further log writes; the census reads the newest segment, so launch 1's census would silently describe launch 2. Reduction: `gamelib-launch-1.log` and `census-launch-1.txt` are produced BEFORE launch 2 starts, and the file is cumulative (58-09 saw the same), so launch 2's archive contains launch 1's segment and 58-23 reads the LAST HELLO segment of it.
- {launch 2} x {lsof captures}: the helper pid changes per launch. Reduction: the helper pid is resolved fresh in each launch's capture step, never reused.
- Not flagged (8): the other combinations touch no shared file or process.
"Found nothing" is distinguishable from "did not look" by this list.

### Review part d. External state (Test 6)

Peer PC session online; friendship accepted; Schedule I: Free Sample installed on the peer and launchable (58-01 never recorded the second account's own launch to its main menu); second account is limited (A4, open in 58-01: whether a limited account can join); Local Network permission for Wine/CrossOver/Steam; a stale lobby from an earlier attempt (58-17 left two lobbies open); a Schedule I process still running on either machine from a prior attempt; Mac Steam signed in and in a state where it shows "In-Game" for the helper; Mac Steam's own session may offer "Invite to Game" only while the game process is running.
Positive observables: PC1 pid, PC8 operator statement, the lsof capture showing live sockets while both players are in session, and the Player.log counts.

### Review part e. Gesture trace (Test 7)

| Gesture | Surface it names | Reachable? | Evidence |
| ------- | ---------------- | ---------- | -------- |
| Launch Schedule I from GameLib | GameLib Library, the game page, Play | R: the 58-01 / 58-17 runs launched the title this way | 58-01-TITLES.md Install, Runtime calls |
| "Continue" to host (Direction A) | the game's own menu | R: 58-17 operator note "got to main menu then clicked continue" | 58-01-TITLES.md |
| Game's own "add another player" (A1) | the game's UI, which calls ActivateGameOverlayInviteDialog | C: the call is wired by 58-18 but the OVERLAY IS NOT AVAILABLE inside the bridged game, so a dialog may never appear. The step is "press it, record what appeared"; nothing is scored from it | 58-18-SUMMARY.md |
| Steam overlay (Shift+Tab, overlay friends dialog) | Steam overlay | I: not available in the bridged game. Replaced by A2 / B1 (Mac Steam friends list outside the game) | spike findings; 58-01 Join flow |
| Mac Steam friends list "Invite to Game" (A2) | Mac Steam window | C: depends on Mac Steam offering it while the helper is in-game as 3205720; the game set no rich presence | 58-17 lessons |
| PC friends list "Join Game" (A3) | PC Steam | C: expected unavailable (no rich presence); recorded | 58-01 D-09 table |
| PC host invites, Mac accepts from Mac Steam while the game runs (B1) | Mac Steam chat/notification | C: this is the exact flow 58-17 could not complete. The 333 relay (58-18, `hold:true`) is not proven live; a failure here is a PRODUCT result (Gap), not an operator error, provided the game was running | 58-17 Open Question 4 |
| Clicking a Steam invite LINK with the game closed | Mac Steam / browser | I: gives the "wrong platform" error (no Mac build). Never asked of the operator | 58-17 operator note 2 |
| Accepting the invite while the Mac game is not yet in Schedule I | Mac Steam | I: same cause. The Mac must be inside Schedule I first | 58-17 lesson 2 |
| Operator confirms same world and mutual movement | the game | R: the operator sees both avatars | operator |

Each described gesture is traced to a UI the shipped game or Steam client offers; the three unreachable ones (overlay, link-with-game-closed, accept-before-launch) are removed from the instructions, not left as steps.

## 4. Tests

Every item names its sink and launch ordinal. All results are pending; plan 58-23 fills them.

### 1. Build freshness and shim routing
expected: PC4 and PC7 held before launch 1: the mtimes of `public/bin/arm64/darwin/steam-bridge-helper`, `public/bin/arm64/darwin/steam_api64.dll` and `build/main/sidecar.js` are recorded and each is newer than the 58-21 commit time; the sha256 of the freshly built `steam_api64.dll` equals the installed `Plugins/x86_64/steam_api64.dll`, the `.gamelib-orig` file exists, `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 at PC6, and the dev restart (pid recorded) happened after the builds. Sinks: filesystem, terminal.log. Before launch 1.
result: pending

### 2. Direction A: GameLib hosts, peer joins
expected: all four sub-checks from launch 1 plus the path record, against `gamelib-launch-1.log` (the sink for every `bridge helper [3205720]:` literal), taking only lines after the launch-1 HELLO. (a) a `bridge helper [3205720]: ... NET role=game kind=join iface=Matchmaking cb=504 n=<k> path=...` line exists; because the host's own lobby-create also yields this line (58-17), the operator records the wall-clock moment the peer joined and 58-23 records whether a `kind=send` or `kind=recv` line appears AFTER the join line and after that moment. (b) at least one `NET role=game kind=send` and one `NET role=game kind=recv` line with `n` > 0 on `iface=Networking`, `iface=Sockets` or `iface=Messages` (not Matchmaking, which has no send/recv emitter); `role=helper` lines and `CBQ p2p-accept src=helper` are not used. (c) the operator's typed answer, verbatim, that both players are in the same world and each sees the other move, plus which of A1, A2, A3 invited the peer. (d) `pnpm bridge-census --multiplayer 3205720 | tee <session>/census-launch-1.txt` prints `multiplayer 3205720 tcp: verified join=1 send=1 recv=1 ...`; a printed `unverified` naming a missing leg is a FAIL of the matching sub-check. Path record (not scored, D-06): the NET `path=` value of the first `role=game` join/recv line that is not `unknown`, and from the two lsof files whether the peer was a LAN address (direct), a Valve relay address (relayed) or not visible (unknown), recorded as the word only, never the address. Player.log counts: `Server connection state: Started` and `Entered lobby`. Launch 1.
result: pending

### 3. Direction B: peer hosts, GameLib joins
expected: as item 2 from launch 2 (sinks `gamelib-launch-2.log` taking the LAST HELLO segment, `lsof-*-launch-2.txt`, `census-launch-2.txt`). The Mac was already inside Schedule I when it accepted, via B1. (a) `NET role=game kind=join iface=Matchmaking cb=504` in the launch-2 segment; for the joiner it should follow the operator's invite acceptance, and 58-23 also records `CBDISP iCallback=333` (relayed, `held=` value) and whether a `CBQ unlisted iCallback=333` appears (it must not now). (b) `NET role=game kind=send` and `kind=recv` with `n` > 0 on a networking interface, `role=game` only. (c) the operator's typed answer, verbatim: same world, mutual movement, and which gesture (B1 or the game's own join menu) delivered the invite. (d) `census-launch-2.txt` prints `verified join=1 send=1 recv=1`. Path record as item 2. A "wrong platform" error with the Mac game closed is an unscored operator-error launch to be repeated; the same outcome with the game running is a Gap, not a retry loop. Launch 2.
result: pending

### 4. Relay and incoming-session observations (M-04)
expected: record-only, from `gamelib-launch-N.log` for each launch. (i) whether a `CALL SteamNetworkingUtils004.InitRelayNetworkAccess` line exists and whether a `CALL SteamNetworkingUtils004.CheckPingDataUpToDate` line exists (count each); (ii) whether `CBDISP iCallback=1281` appeared (relay network status reached the game; count, `targets=`, `held=`); (iii) in launch 1 (Direction A), the incoming-session path observed: `CBDISP iCallback=1202` (P2P session request; targets) or `CBDISP iCallback=1221` plus a `CALL SteamNetworkingSockets013.AcceptConnection` (or `...012.AcceptConnection`) line, and which of the two occurred; (iv) the `CALL` names ending `CreateListenSocketP2P` and `ConnectP2P` seen, per launch. Counts and literals only, no ids. Launches 1 and 2.
result: pending

### 5. Oversize and NET cap
expected: record-only. `grep -c 'NET role=game kind=oversize'` and `grep -c 'NET cap of 32 reached'` over each `gamelib-launch-N.log` segment. Any oversize count above 0 is recorded as a Gap under `## 5. Gaps` (a message above 61440 bytes was refused). A cap line means later NET lines were not logged, so an absent send/recv in that segment is inconclusive, not failing; record it. Launches 1 and 2.
result: pending

### 6. D-13 stub notice
expected: record-only operator observation. Whether the game page showed the "multiplayer not yet verified / stubbed" notice for Schedule I at launch 1 and launch 2, and whether the import was of a still-stubbed version (record which build / state it was). The notice is not expected to fire for this title (its coverage is wired); a notice that fires is recorded verbatim with the launch ordinal. Launches 1 and 2.
result: pending

### 7. Unlisted callback ids
expected: record-only. The distinct ids from `CBQ unlisted iCallback=<id> action=drop` lines in each launch's segment (58-17 saw 304, 336, 348, 1040011, 1040015, 1040044, 1270003, 1270006, 1270009, and 333 before 58-18). New ids not in that list are flagged for a D-09 follow-up. Counts and ids only. Launches 1 and 2.
result: pending

### 8. Responsiveness note
expected: record-only operator note, verbatim: frame-time or input responsiveness during each session ("smooth", "slow", "stuttering"), the settings used (window mode, resolution), and anything that looked wrong that the logs would not show. Launches 1 and 2.
result: pending

## 5. Gaps

(none)

## 6. Verdict

Verdict: pending

## 7. Run record

(empty; plan 58-23 fills it)
