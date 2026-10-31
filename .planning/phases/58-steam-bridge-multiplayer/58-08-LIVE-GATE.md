# Phase 58 Live Gate: Raft (648800) multiplayer in DRM mode through the steamclient layer

Gate subject: Raft 648800 (SteamStub-wrapped), launched from GameLib through the macOS native Steam bridge in DRM mode
(CrossOver 26.3.0.39832, component `steamclient-layer-cx26.3.0.39832`, asset `steamclient-layer-cx26.3.0.39832-p58.tar.gz`),
playing against the second account on the Windows/Linux peer PC (D-04, D-15), same LAN, any path accepted (D-06).
Authored by: plan 58-08. Run by: plan 58-09.
Decision D-E: the author never runs the gate. Plan 58-08 launches no game and fills no scored `result:` line.
Plan 58-09 may fill `result:` lines, the Run record, Gaps and the Verdict, and pin observed call names. It may not edit the contract otherwise.
Standing rule: strict-verified per D-08 / D-53-13 / D-56-16. Only `role=game` trace lines count. Helper lines (`role=helper`,
steam.exe) and Mac Steam In-Game status never count. A failure never reroutes to bottled Steam.
A green test suite never closes this gate (live-gate-contract-authoring Section 4 ii).

## Pre-gate measurement

Measured 2026-10-31 by plan 58-08 Task 1. Read-only: `strings -a` and a Python byte count (UTF-8 and UTF-16LE) over
`BOTTLE(648800)/.../Raft/Raft_Data/Managed/Assembly-CSharp.dll` (3211776 bytes). `com.rlabrecque.steamworks.net.dll` is excluded
(it names every type). macOS `strings` has no `-e`, so UTF-16 user strings were counted with Python; every UTF-16 count is 0.

Archive (not uploaded), REBUILT 2026-10-31 by plan 58-08 under the operator's "Extend the trace" decision (D-08a trace fields; see Review part e):
`build/steamclient-layer-cx26.3.0.39832-p58.tar.gz`, sha256 `4390a08746f70f6d6a47235b86a968396290e239b87a3538f32222e233c2f3b1`, size 5365254 (rebuilt again for ordinal peers; supersedes the interim 0dd202aa... archive, size 5364395, which traced raw SteamID64s and must not be published).
It REPLACES the 58-04 archive (sha256 `53780308f648eff14f6f162721a1446ee9af0a208cb52e9e31eff51cff06e8c5`, size 5360143), which is superseded and must not be published.
Built with `pnpm build:lsteamclient --base wine` then `pnpm build:steamclient-layer-archive --out ...` (the CrossOver base cannot build; PINS.md D-19). Seven
`GAMELIB-DRM-TRACE BEGIN` blocks in steamclient_main.c (extended in place). Members (the builder's per-file output): LICENSE.lsteamclient, detour-cx26.3.0.39832.bin,
lsteamclient.so and steam.exe are byte-equal to 58-04-SUMMARY; NOTICE is now sha256 `289a650147ae83aff4f8412ac98323ab30720810b84349c37d10503a2c4995a9` size 4129 and
lsteamclient.dll is now sha256 `ef252a424d13130ba504d55957ab81961a34873e357899171d0a71dc5128df70` size 33934643. The builder printed `pinned: MISMATCH (file NOTICE)` and exit 3, as
for 58-04: the catalogue (`src/common/steamclientLayerCatalogue.ts`) still pins the Phase 56 archive until Task 4. Publish target: asset
`steamclient-layer-cx26.3.0.39832-p58.tar.gz` added to the existing tag `steamclient-layer-cx26.3.0.39832` in grayson-mitchell/GameLib, no `--clobber`.

| Name                                      | Count in Assembly-CSharp |
| ----------------------------------------- | ------------------------ |
| LobbyEnter_t                              | 0                        |
| LobbyCreated_t                            | 0                        |
| CreateLobby                               | 0                        |
| JoinLobby                                 | 0                        |
| GameLobbyJoinRequested_t                  | 0                        |
| GameRichPresenceJoinRequested_t           | 1                        |
| P2PSessionRequest_t                       | 1                        |
| AcceptP2PSessionWithUser                  | 1                        |
| SendP2PPacket                             | 1                        |
| ReadP2PPacket                             | 1                        |
| IsP2PPacketAvailable                      | 1                        |
| SteamNetConnectionStatusChangedCallback_t | 0                        |
| ConnectP2P                                | 0                        |
| CreateListenSocketP2P                     | 0                        |
| SendMessageToConnection                   | 0                        |
| SteamMatchmaking                          | 0                        |
| SteamNetworkingSockets                    | 0                        |

Other Raft game-code names: `SteamNetworking`, `SteamFriends`, `cheat_joinGameSteamID`, `JoinGameSteamIDBOX`, `Message_InitiateConnectionResultSteam`,
`SendInitiateResultSteam`, `get_CurrentSteamHost`. The game also ships `Unity.Netcode.*` and `Unity.Networking.Transport.dll`.
56-15's Raft captures recorded no lobby or networking `event=call name=` entries (item 8 was a launch-to-menu comparison only).

Reading: Raft is a legacy Steam P2P title (SendP2PPacket / ReadP2PPacket / AcceptP2PSessionWithUser / P2PSessionRequest_t) joined by
Steam friend "Join Game" (GameRichPresenceJoinRequested_t, id 337). It references no lobby type and no Sockets
connection-status type, so the D-08 item 1 callbacks (LobbyEnter_t 504, SteamNetConnectionStatusChangedCallback_t 1221)
are not expected from Raft.

join signal: 1202-only

Done-when being gated (M-02, M-06): a DRM-mode title (Raft) passes the D-08 bar in both directions, and the serialized005 patch
decision is made from live evidence.

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.

D-08 bar per scored direction (all three required):

- (a) [Raft: scored per D-08a below] a `role=game` `event=callback id=504 resp=1` (LobbyEnter_t success) or `id=1221 state=3` (connection Connected) line;
- (b) at least one `role=game` send and one `role=game` receive `event=call name=` line;
- (c) the operator confirms both players are in the same world and each sees the other move.

Join-callback applicability: see `## Pre-gate measurement` (`join signal: 1202-only`). Raft's assemblies reference neither 504 nor 1221, so
the operator amended D-08 as **D-08a** at the 58-08 Task 3 checkpoint (2026-10-31; verbatim text in `58-CONTEXT.md`). For Raft, sub-check (a) of
items 2 and 3 is scored against D-08a, not against 504 / 1221. D-08a, verbatim:

> D-08a (legacy-P2P DRM title): for a title whose game assemblies reference neither LobbyEnter_t (504) nor SteamNetConnectionStatusChangedCallback_t (1221), D-08 item 1's join signal is met by ALL of:
> (1) host: a role=game delivery of P2PSessionRequest_t (1202) naming the joiner's SteamID, followed by the game's own AcceptP2PSessionWithUser call for that SteamID;
> (2) both sides: game-originated SendP2PPacket and ReadP2PPacket calls with nonzero payload addressed to / received from the peer's SteamID.
> The joiner's entry route (GameRichPresenceJoinRequested_t 337) is recorded but not scored. No other D-08 bar is widened; In-Game presence still never counts.

Sub-checks (b) and (c) are unchanged. Sub-check (d) (census) can print `verified` for Raft in Direction A only, via the D-08a path added by the trace extension: see Review part e. In Direction B it prints `unverified` by design.

Paths used below:

- `<session>` = `/tmp/gamelib-gate-<ISO8601-UTC>/`, created once by 58-08 Task 4, reused by 58-09
- `SIDECAR` = `~/Library/Logs/GameLib/gamelib.log`
- `APPDIR` = `~/Library/Application Support/GameLib`
- `TRACEDIR` = `APPDIR/steam-bridge/drm/trace`
- `COMPDIR` = `APPDIR/steam-bridge/drm/component/steamclient-layer-cx26.3.0.39832`
- `BOTTLE(<id>)` = `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<id>`
- `WINELOG` = `TRACEDIR/<appId>-<launchId>.wine.log` (the wine child's output; path is logged in SIDECAR as `SteamGame: drm launch appId <id>: wine log <path>`, games.ts:4514; bottle-stage output is `<appId>-<launchId>.stage.wine.log`, stageWineLog.ts)
- asset URL = `https://github.com/grayson-mitchell/GameLib/releases/download/steamclient-layer-cx26.3.0.39832/steamclient-layer-cx26.3.0.39832-p58.tar.gz`

## 1. Preconditions

| ID   | Precondition                                  | Command                                                                                                                                                                                                                                                                                                                       | Positive observable                                                                                                                                                             |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PC1  | Mac Steam running and signed in               | `pgrep -x steam_osx`                                                                                                                                                                                                                                                                                                          | Non-empty                                                                                                                                                                       |
| PC2  | No Windows Steam anywhere on the Mac          | `ps -axo pid,command \| grep -iE 'steamwebhelper\.exe\|steamservice\.exe\|Steam\\steam\.exe' \| grep -v grep`                                                                                                                                                                                                                  | Prints nothing                                                                                                                                                                  |
| PC3  | CrossOver is the allowlisted build            | `defaults read /Applications/CrossOver.app/Contents/Info CFBundleVersion`                                                                                                                                                                                                                                                     | Prints `26.3.0.39832`                                                                                                                                                           |
| PC4  | Fresh build                                   | `pnpm build-steam-bridge`, `pnpm exec vite build`, `pnpm build:sidecar-sea`                                                                                                                                                                                                                                                   | All exit 0                                                                                                                                                                      |
| PC5  | Session dir and archived prior logs           | `mkdir -p <session>`; `cp SIDECAR <session>/pre-session-gamelib.log`; `cp SIDECAR.old <session>/pre-session-gamelib.log.old`                                                                                                                                                                                                  | `ls -la <session>` shows the copies (a missing source is recorded, not an error)                                                                                                |
| PC6  | Exactly one fresh dev app                     | Operator restarts `pnpm tauri:dev` AFTER PC5 under `tee -a <session>/terminal.log`; `pgrep -f 'target/debug/gamelib-shell' \| wc -l`; `stat -f %m build/main/sidecar.js`; `git log -1 --format=%ct -- src/backend/storeManagers/steam/bridge/drm/drmTrace.ts`; `grep -c 'event=p2p' build/main/sidecar.js`     | Count is 1 and PID recorded; sidecar.js mtime greater than the drmTrace.ts commit time; grep at least 1 (tauri dev does not rebuild the sidecar)                                |
| PC7  | Old COMPDIR moved aside                       | `mkdir -p <session>/compdir-prior`; `stat -f %m COMPDIR`; `mv COMPDIR <session>/compdir-prior/` (skipped, recorded, if COMPDIR is absent)                                                                                                                                                                                       | `test ! -e COMPDIR` exits 0 and the mtime is recorded; the p58 asset is then fetched and verified at first launch                                                                |
| PC8  | Raft bottle and manifest present              | `ls BOTTLE(648800)/drive_c/Program\ Files\ \(x86\)/Steam/steamapps/appmanifest_648800.acf`                                                                                                                                                                                                                                    | Manifest exists                                                                                                                                                                 |
| PC9  | p58 asset reachable                           | `curl -fsSIL <asset URL>`                                                                                                                                                                                                                                                                                                     | HTTP 200 at the end of the redirects                                                                                                                                            |
| PC10 | Peer PC ready                                 | Operator confirms in chat and 58-01-TITLES.md `## Account preflight` is cited: second account signed in and online, friends with the main account, Raft installed and launchable on the PC                                                                                                                                    | Operator statement recorded with date                                                                                                                                           |
| PC11 | Local Network permission state recorded       | System Settings > Privacy & Security > Local Network: state of CrossOver / Wine entries                                                                                                                                                                                                                                       | Record-only: state noted (granted / denied / absent)                                                                                                                            |

PC1-PC5 and PC7-PC11 are run and recorded by 58-08 Task 4. PC6 is run by 58-09 (it needs the operator to start dev).

## 2. Launch procedure

Launch ordinals:

- launch 1: Direction A. GameLib hosts Raft, the peer joins. Operator opens a world in Raft and invites the peer from Raft's own invite UI or the Steam friends list; the peer accepts on the PC.
- launch 2: Direction B. The peer hosts on the PC and invites the main account; the operator joins from Raft through GameLib (the Mac accepts the Steam friend invite / Join Game).

Join route (D-08a): Raft's entry route is Steam friend "Join Game", delivered to the joiner as `GameRichPresenceJoinRequested_t` (337). On each
launch's joiner side, the operator uses the Steam friends "Join Game" gesture where available and records whether
`grep 'role=game event=callback id=337' trace-launch-N.log` is non-empty. Record-only, never scored (D-08a). D-08a (1) is scored on the HOST's
trace only: launch 1 for Direction A (the Mac hosts); for Direction B the host is the peer PC, whose trace is not captured, so Direction B scores
only D-08a (2) from the Mac plus the operator's (c). See Review part e.

Dual-sink capture standard. Before each launch:

1. Assert one app instance: `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 and the PID equals PC6's. Any other count aborts the launch (its evidence is not scorable).
2. Write the delimiter (exact text) into the transcript:
   `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session>/terminal.log`
   Dev runs under `tee -a <session>/terminal.log`. Never a bare `tee`, never a `>` redirect. Boundaries are found with `grep -n '^=== GATE LAUNCH' <session>/terminal.log`.

While BOTH players are in the session (before quitting), capture the transport path:
`lsof -nP -iUDP -a -p <Raft wine pid> | tee <session>/lsof-launch-${N}.txt` (find the pid with `pgrep -f 'Raft.exe'`). Also
`ps -axo pid,command | grep -iE 'steamwebhelper\.exe|steamservice\.exe|steam\.exe' | grep -v grep | tee <session>/procs-launch-${N}.txt; pgrep -x steam_osx | tee -a <session>/procs-launch-${N}.txt`.
Then the operator quits the game.

After the game exits (the trace re-log runs after exit, per 56-12) and BEFORE any further launch or dev restart:

- `cp SIDECAR <session>/gamelib-launch-${N}.log`
- copy the newest `TRACEDIR/<appId>-*.log` to `<session>/trace-launch-${N}.log`
- copy the newest `TRACEDIR/648800-*.wine.log` to `<session>/wine-launch-${N}.log` (WINELOG), and any `*.stage.wine.log` to `<session>/stage-wine-launch-${N}.log`
- single-instance assertion again (count 1, same PID)
- after launch 2: closing inventory `ls -la <session>` and `wc -l <session>/*` into `<session>/inventory.txt`

Captures are never committed. After 58-09 records its results the operator deletes `<session>` (T-58-28).

## 3. Structural Reachability Review

Tests applied (live-gate-contract-authoring Section 2): Test 1 URL/route exists; Test 2 control exists on the surface; Test 3 literal is emitted and its sink is named; Test 4 falsifiable; Test 5 ordering/pairing of destructive steps and captures; Test 6 external state and a positive observable; Test 7 the gesture is the real user surface.

Authored 2026-10-31. Verdict legend: R = REACHABLE, N/A with reason, C = CONDITIONAL. One result per test, Test 1 to Test 7.

### Review part a. Emitter and sink table (Test 3 with the SINK clause)

| Literal | Emitter (file:line) | Sink | Captured by |
| ------- | ------------------- | ---- | ----------- |
| `[drm-trace] ... role=game event=callback id=504 resp=<n>` | `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:311` (trace block 7) | TRACEDIR raw file `<appId>-<id>.log`; SIDECAR re-log `bridge drm [648800]: [drm-trace] ...` | `trace-launch-N.log`, `gamelib-launch-N.log` |
| `... event=callback id=1221 state=<n>` | `steamclient_main.c:314` | same | same |
| `... event=callback id=1202` (P2PSessionRequest_t, no detail) | `steamclient_main.c:317` | same | same |
| `... event=callback id=1281` (relay status) | `steamclient_main.c:317` | same | same |
| `... role=game event=call name=<ISteam..._Method>` (send / receive / InitRelayNetworkAccess) | `steamclient_main.c:248` | same | same |
| `Don't recognize interface name` | Wine / lsteamclient stderr in the wine child | WINELOG (`<appId>-<id>.wine.log`, games.ts:919-922, written via `onOutput` games.ts:4531) | `wine-launch-N.log` |
| `SteamNetworkingSocketsSerialized005` | Wine child stderr or the trace `name=` field | WINELOG and TRACEDIR | `wine-launch-N.log`, `trace-launch-N.log` |
| `pnpm bridge-census --multiplayer 648800 --drm` verdict `verified` | `meta/bridgeCensus.ts` (58-05) | terminal stdout; reads TRACEDIR | `<session>/census-launch-N.txt` (tee) |
| UDP endpoints | `lsof` | terminal stdout | `lsof-launch-N.txt` |

The trace writer dedups by hash and caps at GAMELIB_TRACE_MAX_LINES, so each distinct line appears once per launch; "at least one" is the bar, not a count.

### Review part b. Item, sub-check and precondition table

| Row | Surface it names | What it asks for | Verdict (Test 1 to Test 7) | Evidence |
| --- | ---------------- | ---------------- | -------------------------- | -------- |
| PC1 | steam_osx process | running | T1 N/A no URL; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R positive observable is a non-empty pgrep; T7 N/A | `pgrep -x steam_osx` |
| PC2 | process table | empty ps grep | T1-T3 N/A; T4 R falsifiable, a running Windows Steam shows in ps; T5 R; T6 R; T7 N/A | ps command in Section 1 |
| PC3 | CrossOver bundle | 26.3.0.39832 | T1-T4 N/A; T5 R; T6 R reads the installed bundle; T7 N/A | `defaults read` |
| PC4 | build tooling | exit 0 | T1-T4 N/A; T5 R; T6 N/A; T7 N/A | package.json scripts |
| PC5 | SIDECAR and .old | copies | T3 R reads SIDECAR; T5 C pair {PC5 archive, PC6 dev restart}: archive must precede the restart (log_writer renames gamelib.log to .old on first write); T6 N/A | `src/backend/logger/log_writer.ts:72-74` |
| PC6 | dev app, sidecar.js | one instance, fresh sidecar | T3 R; T4 R falsifiable (count and mtime); T5 R; T6 C depends on a stale dev app not being left running from a prior run; T7 R operator restarts dev | commands in Section 1 |
| PC7 | COMPDIR | absent after move | T4 R `test ! -e`; T5 C pair {PC7 COMPDIR move, launch 1 first install}: a move after launch 1 invalidates item 1; T6 R positive observable is the absence then the fresh install in item 1; T7 N/A | verifyComponentDir rejects a dir whose sums differ from the catalogue (steamclientLayerInstall.ts) |
| PC8 | Raft bottle manifest | file exists | T5 R; T6 R positive observable is the manifest file; others N/A | `ls` |
| PC9 | release asset | HTTP 200 | T1 N/A; T4 R a missing asset gives 404; T5 R (58-08 Task 4 publishes before PC9 runs); T6 R | `curl -fsSIL` |
| PC10 | peer PC | account online, friend, Raft installed | T6 C depends on external state: peer PC session, friendship, Raft installed; recorded as operator statement; T7 R operator gestures on the PC | 58-01-TITLES.md `## Account preflight` |
| PC11 | System Settings Local Network | state recorded | T6 C external state (permission grant); record-only so no pass/fail depends on it | System Settings |
| Item 1 component | COMPDIR files | sums equal catalogue p58 pins | T3 R filesystem; T4 R falsifiable, a Phase 56 dir fails; T5 C pair {PC7 move, launch 1}: item 1 is read after launch 1's first install; T6 R positive observable is a present dir with matching sums; T7 N/A | `shasum -a 256` of the six files against steamclientLayerCatalogue.ts |
| Item 2 / 3 (a) | trace `role=game` 504 / 1221 | callback line | T3 R sink TRACEDIR + SIDECAR; T4 R falsifiable, no line = issue; T5 C pair {launch 2 relaunch, trace capture}: launch 2 gets its own TRACEDIR file and gamelib log copy before relaunch; T6 C depends on external state only (peer session); the 504/1221 gap is resolved by D-08a, see Review part e for what the trace can and cannot show; T7 R | `grep 'role=game event=callback id=504 resp=1'` etc. |
| Item 2 / 3 (b) | trace `role=game` calls | send and receive names | T3 R sink as above; T4 R; T5 C same pair as (a); T6 C requires the game reaching in-session traffic, external state: peer PC session; T7 R | `grep 'role=game event=call name='` |
| Item 2 / 3 (c) | operator observation | same world, mutual movement | T3 N/A not a log claim; T4 R operator can answer no; T6 C external state: peer PC, friendship, Raft save worlds, Local Network grant, a Raft session still open from a prior run (quit all before each launch); T7 R the invite and join gestures are Raft's own invite UI / Steam friends "Join Game" on both machines, which are the real surfaces | operator statement |
| Item 2 / 3 (d) | census verdict | `verified` | T3 R stdout teed; T4 R falsifiable (`failed`/`unverified`); T5 R; T6 C census reads the same trace as (a)/(b) so it inherits (a)'s conditionality; T7 N/A | `pnpm bridge-census --multiplayer 648800 --drm` (58-05) |
| Item 2 / 3 path | lsof | peer address or Valve relay | T3 R sink lsof file; T4 N/A record-only; T5 R; T6 C requires both players in session at capture time; T7 R | `lsof -nP -iUDP -a -p <pid>` |
| Item 4 serialized005 | WINELOG, TRACEDIR | grep counts | T3 R named sinks WINELOG and TRACEDIR; T4 R a hit is observable; T5 C pair {PC7 move, WINELOG}: the log is per launch, so both launches' WINELOG copies are required; T6 R zero is meaningful only because the WINELOG copy is non-empty (item records line counts); T7 N/A | `grep -c` per capture |
| Item 5 relay | trace | InitRelayNetworkAccess or id=1281 | T3 R; T4 N/A record-only; T5 C same pair as (a); T6 R; T7 N/A | grep |
| Item 6 consistency | Pre-gate measurement vs scored callback | matches classification and is scored per D-08a | T3 N/A reading; T4 R falsifiable; T5 N/A; T6 R; T7 N/A | file text |
| Capture instruction | tee, delimiters, copies | present | T3 R each literal names its sink in 3a; T5 C pairs listed above are the reductions applied; T7 N/A | Section 2 |

### Review part c. Pairing pass (Test 5)

Pairs examined: {PC7 COMPDIR move, launch 1 install}, {PC7 COMPDIR move, trace capture}, {PC7 COMPDIR move, gamelib.log archive}, {PC7 COMPDIR move, WINELOG},
{launch 2 relaunch, trace capture}, {launch 2 relaunch, gamelib.log archive}, {launch 2 relaunch, WINELOG}. Reduction applied: every per-launch copy
(`gamelib-launch-N.log`, `trace-launch-N.log`, `wine-launch-N.log`) is taken before the next launch and before any dev restart; COMPDIR is moved only in PC7, before launch 1.

### Review part d. External state (Test 6)

Peer PC session online; friendship accepted; Raft installed and launchable on the peer; Raft save worlds on both machines; Local Network permission for CrossOver/Wine;
no Raft session left open from a prior run on either machine.

### Review part e. D-08a signals vs the extended DRM trace (Test 3 / Test 6)

First read 2026-10-31 against the 58-04 trace (gaps found), then CLOSED the same day by the operator-approved scope extension "Extend the trace"
(commits f3df38704 layer, 063041e8b parser and census). New trace lines, all `role=game`-scoped by the same role tag as every other line:
`event=callback id=1202 peer=<ordinal>` (P2PSessionRequest_t.m_steamIDRemote), `event=p2p op=accept peer=<ordinal> ok=0|1`,
`event=p2p op=send peer=<ordinal> bytes=<n>` (send returned true), `event=p2p op=read peer=<ordinal> bytes=<n>` (read returned true).
Volume scheme: one line per distinct key (1202 per peer; accept per peer and result; send and read per peer and zero/nonzero size), at most 32 such lines per launch,
so the first nonzero send and read per peer is always kept even if zero-length packets arrive first. `peer=` is a per-launch ORDINAL (1, 2, ... assigned on first sight of each distinct SteamID64, table of 16; a full table writes `peer=overflow`, which never
matches). The raw SteamID64 is read only to look up the ordinal and is written nowhere, so the SIDECAR re-log and uploaded logs carry no real peer ID (operator
decision 2026-10-31; D-08 "no SteamID in the trace" restored). Ordinals are per launch and per process: X means the same peer only within one trace file.

| D-08a clause | Observable on the Mac by the extended trace? | Detail |
| ------------ | -------------------------------------------- | ------ |
| (1) host: `role=game` delivery of 1202 | YES | `event=callback id=1202`. |
| (1) "naming the joiner's SteamID" | YES | `id=1202 peer=X` carries the peer's per-launch ordinal (mapped from the payload SteamID64, which is not written). |
| (1) followed by the game's own `AcceptP2PSessionWithUser` for that SteamID | YES | `event=p2p op=accept peer=X` on a LATER line than `id=1202 peer=X`; `ok=` records whether Steam had a pending request. D-08a asks for the call, so `ok=0` still satisfies the clause. |
| (2) game `SendP2PPacket` with nonzero payload addressed to the peer | YES | `op=send peer=X bytes=N`, N > 0, logged only when the send returned true. |
| (2) game `ReadP2PPacket` with nonzero payload received from the peer | YES | `op=read peer=X bytes=N`, N > 0, logged only when the read returned true; the peer is the `*psteamIDRemote` out-param. |
| "both sides" | PARTLY, NOT FIXABLE HERE | The Mac side is traced in both directions. The peer PC (Windows / Linux) is not instrumented, so in Direction B (peer hosts) the host-side clause (1) and the peer's own send/read are NOT observable. Direction B scores only (2) from the Mac plus the operator's (c). This is a physical limitation, not a trace gap, and stays unscored. |
| 337 entry route | YES | In the closed id set; recorded, not scored. |
| census `verified` | YES for Direction A | `classifyMultiplayerEvidence` verifies `join` under D-08a when no 504 or 1221 was delivered and ONE peer X has: 1202(X), a later Accept(X), a nonzero send to X, a nonzero read from X. The 504 resp=1 / 1221 state=3 path is unchanged. The census cannot see assemblies, so D-08a's precondition ("neither 504 nor 1221 referenced") stays the pre-gate measurement's job; the census only requires that neither was delivered. Direction B prints `unverified` ("no 1202 naming a peer"), by design. |

Consequence: every D-08a clause the Mac can see is now trace-backed; nothing rests on the operator's statement except (c) (same world, mutual movement) and the
unobservable peer-PC half in Direction B. Fail-closed notes: a trace from the superseded 58-04 archive has bare `id=1202` and no `p2p` lines, and a trace from the superseded f3df38704 archive carries raw SteamID64 `peer=` values (the parser rejects them), so neither can satisfy these
sub-checks; a peer whose first read/send is zero-length is still recorded once as `bytes=0` and does not count.

## 4. Tests

Every item names its sink and launch ordinal. All results are pending; plan 58-09 fills them.

### 1. Component p58 installed
expected: after launch 1 starts, `COMPDIR` exists and the sha256 of its six files (LICENSE.lsteamclient, NOTICE, detour-cx26.3.0.39832.bin, lsteamclient.dll, lsteamclient.so, steam.exe) equal the `files[]` pins of entry `26.3.0.39832` in `src/common/steamclientLayerCatalogue.ts` (the p58 values). Sink: filesystem. Launch 1.
result: pending

### 2. Direction A: GameLib hosts, peer joins
expected: sub-checks, all from launch 1. (a) scored per D-08a (Raft is `1202-only`), on `trace-launch-1.log` (Mac is host; sink TRACEDIR raw file, cross-checked in SIDECAR re-log), with X = the `peer=` value of the first `role=game` `event=callback id=1202 peer=` line: (a1) that line exists; (a2) `grep -n 'role=game event=p2p op=accept peer=X'` is non-empty with a line number greater than the `id=1202 peer=X` line (the `ok=` value is recorded, not scored); (a3) `role=game event=p2p op=send peer=X bytes=N` with N > 0 AND `role=game event=p2p op=read peer=X bytes=N` with N > 0 (X identical on all four lines; also `role=game event=call name=` lines ending `_SendP2PPacket` and `_ReadP2PPacket`). The operator additionally confirms in (c) that the peer's account is the one that joined (X is only an ordinal, 1 for the first peer seen). Also record `id=337` presence (not scored). (b) `trace-launch-1.log` holds at least one `role=game event=call name=` for a send (e.g. SendP2PPacket / SendMessages) and one for a receive (e.g. ReadP2PPacket / ReceiveMessages), and no helper line is used. (c) The operator confirms both players are in the same world and each sees the other move. (d) run `pnpm bridge-census --multiplayer 648800 --drm | tee <session>/census-launch-1.txt` and record the output. It is expected to print `verified` with detail `game join (D-08a legacy P2P), send and receive observed`, and `join`, `send`, `recv` true; that output corroborates (a1)-(a3) and is scored with them (a census `unverified` here with a D-08a clause named is a FAIL of the matching sub-check). Path: from `lsof-launch-1.txt`, a LAN peer address means direct, a Valve relay address means relayed; the path is recorded, not scored (D-06).
result: pending

### 3. Direction B: peer hosts, GameLib joins
expected: as item 2 from launch 2 (sinks `trace-launch-2.log`, `gamelib-launch-2.log`, `lsof-launch-2.txt`, `census-launch-2.txt`), joiner side only because the peer PC is the host and its trace is not captured: (a) scored per D-08a (2) only: in `trace-launch-2.log`, `role=game event=p2p op=send peer=X bytes=N` with N > 0 AND `role=game event=p2p op=read peer=X bytes=N` with N > 0, X identical on both lines (and `_SendP2PPacket` / `_ReadP2PPacket` call names). D-08a (1) is NOT observable from the Mac in this direction (the host is the peer PC) and stays UNSCORED here; it is covered by item 2 from launch 1 and by the operator's statement in (c) that the peer's session request was accepted. Record `id=337` presence (not scored). (b) one role=game send and one role=game receive call name. (c) operator confirms same world, mutual movement, and that the join succeeded via Join Game / invite on the Mac. (d) census output recorded, not scored: expected `unverified` with `no game-originated join` and `D-08a: no 1202 naming a peer` (the joiner has no 1202 to show), because (1) is host-side; `send` and `recv` should read true. Path recorded, not scored.
result: pending

### 4. serialized005 decision (M-06)
expected: `grep -c "Don't recognize interface name"` and `grep -c SteamNetworkingSocketsSerialized005` over every Raft capture (`wine-launch-1.log`, `wine-launch-2.log`, `trace-launch-1.log`, `trace-launch-2.log`, and each `gamelib-launch-N.log`), reported per file with each file's line count. Decision rule: zero hits in all captures AND items 2 and 3 pass = `not needed`; any hit during a join (a hit in a launch whose item 2 or 3 failed or whose hit line follows the join) = `carry serialized005.patch in a follow-up plan`. Items 2/3 failing for another reason with zero hits = `inconclusive`. Sinks: WINELOG and TRACEDIR. Launches 1 and 2.
result: pending

### 5. Relay status observed
expected: record whether the trace holds `event=call name=` containing `InitRelayNetworkAccess` or `event=callback id=1281`, per launch. Record-only. Sink TRACEDIR. Launches 1 and 2.
result: pending

### 6. Join-signal consistency
expected: the join signal scored in items 2(a) and 3(a) is the one named by `## Pre-gate measurement` (`join signal: 1202-only`) and is scored against D-08a (adopted 2026-10-31, verbatim in `58-CONTEXT.md` and in the D-08 bar section above), not against 504 / 1221. Confirm from `trace-launch-N.log` that no `id=504` or `id=1221` line appears (the census applies D-08a only in that case) (if one does, record it: the measurement was wrong, and the standard D-08 item 1 then also applies as a cross-check). Confirm that every `peer=` value used in items 2 and 3 is the same single value per launch where D-08a requires it (compare, do not copy), and that nothing outside D-08a was widened: only `role=game` lines were used, `role=helper` lines and Mac Steam In-Game status were not. Sink: this file plus `trace-launch-N.log`. Launches 1 and 2.
result: pending

## 5. Gaps

(none)

## 6. Verdict

Verdict: pending

## 7. Run record

(empty)
