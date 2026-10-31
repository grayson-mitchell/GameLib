# Phase 58 Live Gate (re-gate): Schedule I: Free Sample (3205720) multiplayer in TCP shim mode through the macOS native Steam bridge

Gate subject: Schedule I: Free Sample 3205720 (D-14, approved in 58-01-TITLES.md, `Verdict: PROCEED`, not re-picked), installed in the per-game bottle
`GameLibSteamBridge-3205720`, launched from GameLib in TCP shim (bridge) mode, playing against the second account on the Windows/Linux
peer PC (D-04), same LAN, any connection path accepted (D-06).
Authored by: plan 58-33. Run by: plan 58-34.
Decision D-E: the author never runs the gate. Plan 58-33 launches no game and fills no scored `result:` line.
Plan 58-34 may fill `result:` lines, the Run record, Gaps and the Verdict, and pin observed literals. It may not edit the contract otherwise.
Standing rule: strict-verified per D-08 / D-53-13 / D-56-16. Only `role=game` NET lines and game-originated `CALL` lines count. Helper-originated lines
(`role=helper`, `CBQ p2p-accept src=helper`, the helper's own fallback accept), the GameLib invite plumbing (`INVITE dialog`, `INVITE friends`,
`INVITE sent`, `bridge invite [...]` lines: these are GameLib's own picker, never evidence that the game hosted or joined) and Mac Steam's In-Game status never count.
A failure never reroutes to bottled Steam.
A green test suite never closes this gate (live-gate-contract-authoring Section 4 ii).

Done-when being gated (M-01, M-04, M-05): a TCP-mode title (Schedule I) passes the D-08 bar in both directions (D-05), each from its own launch, and the relay /
incoming-session behaviour is recorded.

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.

Approval status: awaiting operator review (plan 58-33 Task 2). Plan 58-34 must not start until an approval line is added by Task 2.

## Scope decisions (stated for operator approval)

1. WINDOWED RUN. Schedule I fullscreen at 3440x1440 fails under CrossOver DX11 (`DX11 could not switch resolution (3440x1440 fs=1 hz=0/1)`, game exits after about 6 s; todo
   `.planning/todos/pending/2026-11-01-fullscreen-3440x1440-mode-switch-fails-under-crossover-dx11.md`). The bottle's Unity prefs were switched at 58-37 to Windowed 1920x1080
   (backup `user.reg.bak-58-37` in the bottle). This gate RUNS WINDOWED, in that same configuration. The runner must record the window mode and resolution actually in use (item 8) and must
   not change the prefs to fullscreen.
2. RAISE-OVER-FULLSCREEN IS OUT OF SCOPE and DEFERRED to that todo. The M-01 bar scores the host/join evidence and the invite delivery, not the window raise. A windowed raise
   (proved at 58-37, `display=confirmed` on 8 of 8 presses) is recorded in item 9 as context. The fullscreen raise is neither scored here nor implied by a pass.
3. The picker is the scored Direction A gesture. Mac Steam's friends-list "Invite to Game" worked at 58-25 but produces no GameLib `INVITE sent` line and is not the leg under test.
   If the picker fails and the operator falls back to Mac Steam, record it in item 9 and score item 2 `issue` (Gap: picker gesture not reachable), not `pass`.
4. The 58-37 operator reported "PC accept result: joined game" (unscored there). That answer is context for the PC accept step below and is not carried as evidence.
5. APPROVAL ITEM (a): MENU-PRESS BEHAVIOUR. 58-37 operator observations: the game's '+' is visible both in the main menu (no hosted session) and in-game via ESC. On the Mac, '+' in the main menu shows "no active session" (a string not in GameLib source, so likely the game's own UI; `INVITE refused reason=no-pending` was logged at 11:23:19, the press before the first successful dialog at 11:23:41, cause of the refusal unconfirmed). Pressed in-game as host it works. The operator's view: the refusal is correct, since no session exists to join. PROPOSED handling (awaiting operator approval, not decided here): the menu press is RECORD-ONLY in item 9 and NOT scored; the scored gesture is the in-game press as host after Continue (Direction A step B). The runner makes one menu press BEFORE Continue, records what appeared and whether `INVITE refused reason=no-pending` was logged, and scores nothing from it. A refusal there is expected, not a Gap. Operator alternative: score "menu press refuses cleanly" as a pass/fail sub-check.
6. APPROVAL ITEM (b): PC-INITIATED INVITE ON THE MAC. 58-37 operator observations: on Windows (native Steam) the game's '+' in the main menu DOES send an invite; on the Mac, Mac Steam then shows "invalid platform" (Schedule I has no macOS build, so Mac Steam cannot act on it). PROPOSED handling (awaiting operator approval, not decided here): Direction B in this gate stays exactly as 58-22 item 3 proved it: the PC HOSTS IN-WORLD (Continue, then the host's invite) and invites from PC Steam, and the Mac, already inside Schedule I via GameLib, accepts from Mac Steam while the game runs. The PC main-menu '+' invite landing in Mac Steam as "invalid platform" is NOT the Direction B gesture; it is recorded in item 9 if the operator tries it, and filed as a SEPARATE finding/todo (inbound invite handling on the Mac for Windows-only bridge games), out of scope for 58-34. If the operator instead wants PC to Mac join through that path scored, that is a larger scope change and needs a new plan.

## Pre-gate state (read, not measured by this plan)

Copied from 58-25 Results and 58-37; this plan launched nothing.

- Title facts (58-01-TITLES.md): Unity/Mono, FishNet with an embedded FishySteamworks transport, Steamworks.NET 2024.8.0 on SDK 1.60, `steam_api64.dll` is the GameLib shim (genuine DLL kept as `steam_api64.dll.gamelib-orig`), launch exe `Schedule I Free Sample.exe` has no `.bind`, x86-64, no anti-cheat.
- 58-25 diagnosis (decision: proceed, 2026-11-01): the Mac host serves. `CALL SteamNetworkingSockets013.CreateListenSocketP2P` 1, Player.log `Server connection state` reached Started, `CALL SteamNetworkingSockets012.AcceptConnection` 1, Sockets send 28 and recv 2 after a Mac Steam "Invite to Game" join. The transport is SteamNetworkingSockets, so send/recv NET lines are expected on `iface=Sockets`.
- 58-22 recorded Gap 1 (no GameLib gesture for Direction A), Gap 2 (recv labelled `iface=Messages` for a Sockets title; fixed by 58-26 CR-01), Gap 3 (census could not separate directions; 58-27 added `--log`, `host=` and `client=`), Gap 4 (a single 32-line NET cap starved join/recv; 58-28 segmented the budgets) and Gap 5 (callback 1298 unlisted).
- 58-35 multiplexed the helper (one `poll()` loop, `GL_MAX_CONNS` 16) so the picker's control slots and the game connection coexist; 58-36 raises the real window (`app.raiseMainWindow()`) with a display acknowledgement.
- 58-37 live (windowed): eight '+' presses, `raise requested` 8, `display=confirmed` 8, `display=unconfirmed` 0, `list result=error` 0, `INVITE sent ok=1` 1, `connection table full` 0. Operator: `raised: yes; picker: yes friends listed: yes; sent shown: yes; PC saw invite: yes; PC accept result: joined game`.
- Log-format carry-forward from 58-25: the helper pads log lines with runs of spaces (`CALL   X`, `NET    role=...`). Every grep below is whitespace-tolerant (`grep -E` with ` +`). A single-space literal returns a false 0.
- Join signal for scoring: Direction A uses `NET role=game kind=join iface=Sockets cb=1221` plus the game-originated `AcceptConnection` call (host), not 504. Direction B uses 333, `JoinLobby`, `ConnectP2P` and 504 / 1221. D-08a does not apply (the game references 504).

Lessons from 58-17 that bind the operator instructions:

1. The Mac counts as in-game only while Schedule I runs via GameLib (the helper holds the app id).
2. Accepting a Steam invite for Schedule I while the Mac game is NOT running gives Mac Steam's "wrong platform" error (no Mac build). On Direction B the Mac must already be inside Schedule I before accepting. A "wrong platform" error is an operator-error launch, recorded as unscored and repeated, never a product failure.
3. Direction A and Direction B are never mixed in one launch (D-05).
4. The bottle's Unity `Player.log` contains lobby ids and SteamIDs. It is never copied into a committed artifact. Only fixed-literal grep counts are recorded.

## Gesture surfaces (Test 7 input)

The Steam overlay is NOT available inside the bridged game (Schedule I under Wine with the GameLib shim; Mac Steam's overlay is not injected). Any gesture that needs an overlay (Shift+Tab, an overlay invite dialog) is IMPOSSIBLE and is not asked of the operator.

Direction A (launch 1), in order:

- A. The Mac operator launches Schedule I from GameLib (Library, Schedule I: Free Sample, Play) and clicks Continue into the world as host. The PC sits at the Schedule I main menu.
- B. On the Mac the operator presses the game's '+' (add another player). GameLib's friend picker comes to the front. The operator clicks Invite on the PC account. Record the wall-clock time of the Invite click.
- C. The PC operator accepts the Steam invite in PC Steam's chat/notification with Schedule I running (58-37: this joined the game).
- D. Both operators confirm they are in the same world and each sees the other move.

Direction B (launch 2), separate and clean:

- B1. The PC hosts in Schedule I (Continue, then the host's own invite control) and invites the Mac account from PC Steam ("Invite to Game"). The Mac, already inside Schedule I (launched through GameLib), accepts from Mac Steam's chat/notification, never a browser link opened while the game is closed.
- B2. If B1 produces nothing, record what Mac Steam showed; the operator MAY try the game's own join menu and record it.

## Paths used below

- `<session>` = `/tmp/gamelib-gate-<ISO8601-UTC>/`, created once (PC5), reused by 58-34
- `SIDECAR` = `~/Library/Logs/GameLib/gamelib.log` (helper lines `bridge helper [3205720]: ...`; picker lines `bridge invite [3205720]: ...`)
- `APPDIR` = `~/Library/Application Support/GameLib`
- `BOTTLE(3205720)` = `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-3205720`
- `GAMEDIR` = `BOTTLE(3205720)/drive_c/Program Files (x86)/Steam/steamapps/common/Schedule I Demo`
- `INSTALLED_SHIM` = `GAMEDIR/Schedule I Free Sample_Data/Plugins/x86_64/steam_api64.dll`
- `BUILT_SHIM` = `public/bin/arm64/darwin/steam_api64.dll`; `BUILT_HELPER` = `public/bin/arm64/darwin/steam-bridge-helper`; `SIDECAR_JS` = `build/main/sidecar.js`
- `PLAYERLOG` = the Unity `Player.log` under `BOTTLE(3205720)/drive_c/users/crossover/AppData/LocalLow/<company>/<product>/`

## 1. Preconditions

| ID   | Precondition | Command | Positive observable |
| ---- | ------------ | ------- | ------------------- |
| PC1  | Mac Steam signed in | `pgrep -x steam_osx` | Prints a pid |
| PC2  | No Windows Steam running in any bottle | `ps -axo pid,command \| grep -iE 'steamwebhelper\.exe\|steamservice\.exe\|Steam\\\\steam\.exe' \| grep -v grep` | Prints nothing |
| PC3  | CrossOver build allowlisted | `defaults read /Applications/CrossOver.app/Contents/Info CFBundleVersion` | Prints `26.3.0.39832` |
| PC4  | Fresh build, in this order, newer than the last fix | `pnpm gen-vtables && pnpm build-steam-bridge`, then `pnpm exec vite build`, then `pnpm build:sidecar-sea`; then `stat -f %m BUILT_HELPER BUILT_SHIM SIDECAR_JS`; then `strings BUILT_HELPER \| grep -c 'connection table full'`; then `grep -c 'raise requested' build/main/sidecar.js` | All builds exit 0; all three mtimes are newer than the newest commit of plans 58-26..58-36 (`git log -1 --format=%ct bc73e6ee4`, the 58-36 display-ack commit, epoch 1793483489; confirm it is still the newest with `git log --format='%h %ct %s' --grep='58-3[0-9]' -3`); the `strings` count prints 1 (the 58-35 string) and the sidecar grep prints at least 1 (the 58-36 raise); mtimes recorded |
| PC5  | Session dir and archived prior logs | `mkdir -p <session>`; `cp SIDECAR <session>/pre-session-gamelib.log`; `cp SIDECAR.old <session>/pre-session-gamelib.log.old` | `ls -la <session>` shows the copies (a missing source is recorded, not an error) |
| PC6  | Exactly one fresh dev app, started AFTER PC4 and PC5, under an append-only tee | Operator runs: `pnpm tauri:dev 2>&1 \| tee -a <session>/terminal.log` (the restart is what loads `build/main/sidecar.js`; `tauri dev` does not rebuild the sidecar), then `pgrep -f 'target/debug/gamelib-shell' \| wc -l` | Prints 1; the pid is recorded; `stat -f %m SIDECAR_JS` is older than the app start and newer than PC4's helper mtime |
| PC7  | The title's bottle is shim-routed with the freshly built shim | `shasum -a 256 BUILT_SHIM INSTALLED_SHIM`; `ls "GAMEDIR/Schedule I Free Sample_Data/Plugins/x86_64/" \| grep gamelib-orig` | The two hashes are equal (first launch may re-stage the shim: if they differ before launch 1, record, launch once to completion of staging, and re-compare; a difference after launch 1 is a FAIL of this precondition); the `.gamelib-orig` file exists |
| PC8  | BLOCKING, before launch 1: peer PC ready | Operator statement, verbatim | The second account is online, is a friend of the main account, and Schedule I: Free Sample is installed and sitting at its main menu on the peer. Launch 1 does not start without this statement |
| PC9  | BLOCKING record, before launch 1: Local Network permission state | Operator reads System Settings, Privacy and Security, Local Network | The grant state of Steam, Wine and CrossOver, each recorded verbatim. The state is recorded, not required to be on; launch 1 does not start until it is recorded |
| PC10 | Launch exe has no `.bind` (58-01, re-checked) | `objdump -h "GAMEDIR/Schedule I Free Sample.exe" \| grep -c '\.bind'` | Prints 0 |
| PC11 | The census CLI accepts `--log` and prints direction | `pnpm bridge-census --multiplayer 3205720 --log <session>/pre-session-gamelib.log` | Exit 0 and the printed line contains ` host=` and ` client=` (any status, `unverified` is fine here: this only proves the flag and the fields exist) |
| PC12 | Windowed prefs unchanged (scope decision 1) | Record the bottle's Screenmanager values for Schedule I from `user.reg` by fixed-literal grep counts, not by copying the registry | The recorded mode is Windowed 1920x1080 as left at 58-37; if the prefs were reset to fullscreen, set them back to the 58-37 values before launch 1 and record that |

PC1-PC5, PC7, PC10, PC11 and PC12 are run by 58-34 (automatable). PC6, PC8 and PC9 need the operator. PC8 and PC9 are statements the operator types; the runner copies them verbatim.

## 2. Launch procedure

Launch ordinals:

- launch 1: Direction A ONLY. GameLib (Mac) hosts, the peer PC joins through the GameLib picker invite.
- launch 2: Direction B ONLY, a separate clean launch. The PC hosts, the Mac joins.
- Between the launches BOTH machines quit Schedule I completely (no stale lobby, no leftover process on either). Do NOT restart the dev app between the launches (a restart renames `gamelib.log` to `.old` and ends the single-instance assertion). The helper is stopped when the game stops (games.ts stopBridgeHelper), so each launch has its own helper process.

Dual-sink capture standard. Before each launch:

1. Assert one app instance: `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 and the pid equals PC6's. Any other count aborts the launch (its evidence is not scorable).
2. Record the pre-launch HELLO count: `grep -cE 'HELLO +shim attached appid=3205720' SIDECAR` (call it H<sub>before</sub>).
3. Write the delimiter (exact text) into the transcript:
   `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session>/terminal.log`
   Dev runs under `tee -a <session>/terminal.log`. Never a bare `tee`, never a `>` redirect. Boundaries are found with `grep -n '^=== GATE LAUNCH' <session>/terminal.log`.
4. The operator launches Schedule I from GameLib (Library, Schedule I: Free Sample, Play) and performs that launch's gestures (Direction A for launch 1, Direction B for launch 2).

While BOTH players are in the same session (before quitting), capture the transport path (record-only, D-06):

- `pgrep -f steam-bridge-helper` gives the helper pid, resolved fresh each launch. The helper holds Mac Steam's session, and Mac Steam (not the Wine game) owns the real sockets, so capture both, exactly (two files):
  `lsof -nP -iUDP -a -p <helper pid> | tee <session>/lsof-helper-launch-${N}.txt` and `lsof -nP -iUDP -a -p $(pgrep -x steam_osx) | tee <session>/lsof-steam-launch-${N}.txt`.
- `ps -axo pid,command | grep -iE 'steam-bridge-helper|steam_osx|Schedule I Free Sample' | grep -v grep | tee <session>/procs-launch-${N}.txt`.
- The operator then quits the game (and the peer quits its game).

After the game exits and BEFORE any further launch or dev restart:

- `cp SIDECAR <session>/gamelib-launch-${N}.log`. This is the sink for every `bridge helper [3205720]:` and `bridge invite [3205720]:` literal (helperProcess.ts relays helper stdout via logInfo and stderr via logWarning, both into SIDECAR, live as the helper emits).
- HELLO assertion: `grep -cE 'HELLO +shim attached appid=3205720' <session>/gamelib-launch-${N}.log` minus H<sub>before</sub> must be exactly 1. Record the count. If it is not 1 the launch is not scorable (T-58-113).
- The census reads this launch's own file, never the newest default segment: `pnpm bridge-census --multiplayer 3205720 --log <session>/gamelib-launch-${N}.log | tee <session>/census-launch-${N}.txt`. Because the log is cumulative, launch 2's archive still contains launch 1's segment; the census and every grep for launch 2 take only the lines after the LAST `HELLO` in that file (launch 1's lines are scored from `gamelib-launch-1.log` only).
- Fixed-literal greps of PLAYERLOG, counts only: `grep -c 'Server connection state: Started' PLAYERLOG`, `grep -c 'Starting FishySteamworks client connection' PLAYERLOG`, `grep -c 'Entered lobby' PLAYERLOG`. If a copy of PLAYERLOG is kept in `<session>`, redact it first (`sed -E 's/[0-9]{16,}/<id>/g'`) and never commit it. PLAYERLOG accumulates across launches in the bottle, so record the count before launch 1, after launch 1 and after launch 2, and score the differences.
- Single-instance assertion again (count 1, same pid).
- After launch 2: closing inventory `ls -la <session>` and `wc -l <session>/*` into `<session>/inventory.txt`.

Captures are never committed. After 58-34 records its results the operator deletes `<session>` (T-58-28). 58-34 copies only literals, counts and the census line into this file, records lsof results as direct / relayed / unknown (a word only, never an address), and never copies a persona name, SteamID, lobby id or address (T-58-61, T-58-111).

## 3. Structural Reachability Review

Tests applied (live-gate-contract-authoring Section 2): Test 1 URL/route exists; Test 2 concurrency reachability; Test 3 literal is emitted and its sink is named; Test 4 absence-observability; Test 5 requirement-interaction (pairs); Test 6 external state and a positive observable; Test 7 UI-level gesture reachability. Authored 2026-11-01 against the tree at HEAD `55bd51270` (helper last changed in `da4c7476d`, 58-35). Verdict legend: R = REACHABLE, N/A with reason, C = CONDITIONAL, I = IMPOSSIBLE. Findings count at authoring: 0 structural impossibilities after the Test 7 replacements below; 6 conditionals are recorded as external premises or ordering premises.

### Review part a. Emitter and sink table (Test 3 with the SINK clause)

Every row names the sink: the helper writes to stderr/stdout, `helperProcess.ts` relays it with logInfo/logWarning, and both go into SIDECAR (`gamelib.log`). Sidecar `logInfo`/`logWarning` never reach the tee'd `terminal.log`, so no `bridge helper [...]` or `bridge invite [...]` literal is demanded of `terminal.log`. File:line values are current at HEAD `55bd51270` and replace 58-22's stale numbers.

| Literal | Emitter (file:line) | Sink | Captured by |
| ------- | ------------------- | ---- | ----------- |
| `HELLO shim attached appid=3205720` | `native/steam-bridge/helper/bridge_helper.c:2339` | SIDECAR (`bridge helper [3205720]:`) | `gamelib-launch-N.log`, HELLO count assertion |
| `NET role=game kind=join iface=Matchmaking cb=504 n=<k> path=...` and `... iface=Sockets cb=1221 ...` | built by `gl_net_evidence` `bridge_helper.c:600-655`; join promoted to `role=game` only when the shim dispatched to >= 1 target, `:2601-2604` | SIDECAR | `gamelib-launch-N.log`, census |
| `NET role=game kind=send iface=Networking\|Sockets\|Messages` | `native/steam-bridge/generated/bridge_dispatch.h:6680` (Networking), `:9842`, `:10489` (Sockets), `:10277` (Messages) | SIDECAR | same |
| `NET role=game kind=recv iface=...` | `bridge_helper.c:720` (Networking), `:1202` (Sockets / Messages) | SIDECAR | same |
| `NET ... kind=path ...` (direct / relayed marker) | `bridge_helper.c:756`, `:1252`, `:1266` | SIDECAR | same (record-only) |
| `NET role=game kind=oversize` | `bridge_helper.c:712`, `:1067`, `:1080`, `:1176`, `:1190`; `bridge_dispatch.h:4849`, `:6668`, `:6800`, `:9831`, `:10265`, `:10478` | SIDECAR | same (item 5) |
| `NET cap kind=join reached; later lines are not logged` and `NET cap kind=<send\|recv\|oversize> iface=<Matchmaking\|Networking\|Sockets\|Messages> reached; later lines are not logged` (the 58-28 segmented budgets: join 16, each kind/iface 8; replaces 58-22's single `NET cap of 32 reached`) | `bridge_helper.c:608-632` (`GL_NET_JOIN_MAX` `:304`, `GL_NET_KIND_IFACE_MAX` `:305`) | SIDECAR | grep in `gamelib-launch-N.log` (item 5) |
| `CALL <Iface>.<Method>` (e.g. `SteamNetworkingSockets013.AcceptConnection`, `SteamNetworkingSockets013.ConnectP2P`, `SteamMatchMaking009.JoinLobby`, `SteamNetworkingUtils004.InitRelayNetworkAccess`); first successful call per method per helper process only | `bridge_helper.c:2766` (`logts("CALL", bd_call_name(ci))`) | SIDECAR | same |
| `CBDISP iCallback=<id> targets=<n> held=<h>` (333, 504, 1202, 1221, 1281) | `bridge_helper.c:2613-2615`, cap line `:2608` | SIDECAR | same |
| `CBQ unlisted iCallback=<id> action=drop callresult=<0\|1>` | `bridge_helper.c:1631-1635` | SIDECAR | same (item 7) |
| `CBQ p2p-accept src=helper` | `bridge_helper.c:1515` | SIDECAR | same (explicitly NOT evidence) |
| `MMS lobby op=create type=<t> max=<m>`, `op=set-type`, `op=set-joinable` (at most 4 each) | `bridge_helper.c:2179-2203` (the call at `:2763`) | SIDECAR | same (item 9) |
| `INVITE dialog appid=3205720`, `INVITE friends n=<k>`, `INVITE sent ok=<0\|1>`, `INVITE refused reason=...` | `bridge_helper.c:2171`, `:2263`, `:2290`, `:2275-2283` | SIDECAR | same (GameLib plumbing, NOT evidence; used only as the ordering anchor) |
| `bridge invite [3205720]: raise requested`, `display=confirmed elapsedMs=<n>` / `display=unconfirmed timeout=<n>` | `src/backend/storeManagers/steam/bridge/helperProcess.ts:451`, `:456-457` | SIDECAR (sidecar logInfo; not helper stdout) | same (item 9) |
| `ABORT connection table full -- closing new connection` | `bridge_helper.c:2907` | SIDECAR | same (item 5 side check; expected 0) |
| `pnpm bridge-census --multiplayer 3205720 --log <file>` line: `... : <status> join=<0\|1> send=<0\|1> recv=<0\|1> path=<w> oversize=<n> host=<0\|1> client=<0\|1> - <detail>` | `meta/bridgeCensus.ts:2578` (verdict `classifyMultiplayerEvidence`, `:2372`; `--log` parse `:2502-2523`; direction `NET_DIRECTION_CALL_RE` `:2319`) | terminal stdout | `census-launch-N.txt` (tee) |
| Unity `Server connection state` / `Entered lobby` lines | the game | PLAYERLOG | counts only |
| UDP endpoints | `lsof` | terminal stdout | `lsof-*-launch-N.txt` |
| `=== GATE LAUNCH N ===` | the capture instruction | `terminal.log` | `grep -n '^=== GATE LAUNCH'` |

Census direction semantics (read from `meta/bridgeCensus.ts:2462-2470`): `host=1` is set by a helper-attributed `CALL ...AcceptConnection` or `...AcceptP2PSessionWithUser`; `client=1` is set by `...ConnectP2P` or `...JoinLobby`. Both fields are report-only and never widen `status`. Because the CALL line is logged only for a successful call and only on the first call per process, `host=1` is a game-originated acceptance of an incoming connection (the helper's own fallback accept logs `CBQ p2p-accept src=helper`, a different literal that does not set `host`).

### Review part b. Item, sub-check and precondition table

| Row | Surface it names | What it asks for | Verdict (Test 1 to Test 7) | Evidence |
| --- | ---------------- | ---------------- | -------------------------- | -------- |
| PC1 | Mac Steam process | pid exists | T1-T4 N/A; T5 R; T6 R positive observable is the pid; T7 N/A | `pgrep -x steam_osx` |
| PC2 | bottle Steam processes | none running | T4 R (a running Windows Steam prints a line); T5 R; T6 R external process surface checked; T7 N/A | `ps` grep |
| PC3 | CrossOver bundle | 26.3.0.39832 | T1-T4 N/A; T5 R; T6 R reads the installed bundle; T7 N/A | `defaults read` |
| PC4 | build tooling, mtimes, 58-35 string, 58-36 sidecar string | exit 0, mtimes newer than `bc73e6ee4`, counts 1 and >= 1 | T4 R falsifiable (a stale artifact fails the compare, a pre-58-35 helper has `strings` count 0); T5 C pair {PC4 rebuild, PC6 restart}: PC4 must precede PC6, enforced by the numbering; T6 N/A | `meta/buildSteamBridgeShims.ts`, `bridge_helper.c:2907`, `helperProcess.ts:451` |
| PC5 | SIDECAR and .old copies | archived | T3 R reads SIDECAR; T5 C pair {PC5 archive, PC6 dev restart}: archive must precede the restart (log_writer renames gamelib.log to .old on first write); T6 N/A | `src/backend/logger/log_writer.ts:72-74` |
| PC6 | dev restart, single instance | count 1 | T4 R falsifiable (count 2 aborts); T5 C pairs in part c; T6 R covers a pre-existing instance (F-34.4.2-18) by asserting count 1; T7 N/A | memory: tauri dev does not rebuild the sidecar |
| PC7 | installed vs built shim | equal sha256 | T4 R falsifiable; T5 C pair {first launch re-stage, PC7 compare}: one re-compare allowed; T6 R positive observable is the equal hash plus the `.gamelib-orig` file; T7 N/A | 58-01 Install section |
| PC8 | peer PC state | online, friend, installed, at menu | T6 C external state (58-01 never recorded the peer reaching its own main menu); the operator statement is the positive observable; T7 N/A | operator statement |
| PC9 | Local Network grant | recorded verbatim for Steam, Wine, CrossOver | T4 N/A; T6 C an OS permission grant affecting LAN reachability (58-22 recorded Steam/Wine but not CrossOver); recorded, not scored | System Settings |
| PC10 | `.bind` section | 0 | T4 R falsifiable (a stub prints >= 1); T5 R; T6 R; T7 N/A | 58-01 Launch exe section |
| PC11 | census `--log` and fields | ` host=` and ` client=` in the output | T3 R sink stdout; T4 R falsifiable (a build without 58-27 prints `usage:` or no fields); T5 R; T6 R reads a file the runner created in PC5 (a missing source from PC5 means the check is run against any existing regular file); T7 N/A | `meta/bridgeCensus.ts:2502-2523`, `:2578` |
| PC12 | windowed prefs | Windowed 1920x1080 | T4 R falsifiable (fullscreen values are visible); T6 C the prefs are external state in the bottle's `user.reg`, rewritten by the game on exit (the 58-32 scored launch wrote the fullscreen values that broke the next launches); recorded before launch 1 and again after launch 2; T7 N/A | todo `2026-11-01-fullscreen-3440x1440-...`, 58-37 Deviation 1 |
| Item 1 | build freshness, shim routing, PC8/PC9/PC11 | PC4 + PC7 + PC8 + PC9 + PC11 outcomes | T3 R filesystem and stat; T4 R; T5 C see part c; T6 R; T7 N/A | commands in PC4, PC7, PC11 |
| Item 2 (a) | game-originated host acceptance after the picker invite | `CALL ...AcceptConnection` and `NET role=game kind=join iface=Sockets cb=1221` after `INVITE sent ok=1` | T3 R sink SIDECAR; T4 R falsifiable and host-specific: an AcceptConnection and a 1221 delivered to a game target need a connecting peer, and the host's 504 self-join (lobby create, 58-22/58-17) is explicitly NOT accepted; a build that never accepts prints neither line, so the absence of the pair is observable (the CALL line is emitted for any successful first call, `:2766`); T5 C part c; T6 C peer session is external; T7 C part e | `bridge_helper.c:2601-2604`, `:2766`, `:2290` |
| Item 2 (b) | game send/recv after the invite | role=game `kind=send` and `kind=recv` on `iface=Sockets` after the (a) lines | T3 R; T4 R no peer means no Sockets traffic (the `__ret > 0` / `n > 0` emitters fire only for real messages); T5 C; T6 C peer; T7 C | `bridge_dispatch.h:9842`, `:10489`; `bridge_helper.c:1202` |
| Item 2 (c) | operator confirmation | same world, mutual movement, verbatim | T3 N/A not a log claim; T4 R operator can answer no; T6 C external: peer PC, friendship, Local Network, stale lobby (both machines quit Schedule I before each launch); T7 C part e | operator statement |
| Item 2 (d) | census over launch 1's own log | `verified` with `host=1` | T3 R stdout teed; T4 R (`unverified` names a missing leg; `host=0` is visible); T5 R; T6 C inherits (a)/(b); T7 N/A | `meta/bridgeCensus.ts:2462-2470`, `:2578` |
| Item 2 path | NET `path=` and lsof | direct / relayed / unknown | T4 N/A record-only; T5 R; T6 C both players in session at capture time; T7 N/A | `lsof` files, `NET ... path=` |
| Item 3 (a)-(d) | Direction B in its own launch | 333 relayed, JoinLobby, ConnectP2P, role=game send/recv, census `client=1` | T3 R; T4 R (the CR-01 recv count is falsifiable against a regression that relabels Sockets traffic); T5 C part c; T6 C peer hosts, Mac already in game; T7 C part e | as item 2; `bridge_helper.c:1202` |
| Item 3 CR-01 | recv iface label | `kind=recv iface=Sockets` > 0 and `kind=recv iface=Messages` = 0 | T4 R both counts observable from the same emitter; a Messages recv would be a real regression of 58-26 | `bridge_helper.c:1202` |
| Item 4 | relay / incoming-session observations | counts per launch | T3 R sink SIDECAR; T4 N/A record-only; T5 C part c; T6 R; T7 N/A | `bridge_helper.c:2766`, `:2613` |
| Item 5 | NET budget cap notes, oversize, table-full | counts per launch | T3 R; T4 R presence observable (cap notes are emitted once per segment by the same writer); T5 C; T6 R; T7 N/A | `bridge_helper.c:608-632`, `:2907` |
| Item 6 | stub notice D-13 | whether the notice fires | T3 R operator-observed UI; T4 N/A record-only; T6 C depends on registry state at launch; T7 R the notice is shown on the game page by the existing UI | operator statement |
| Item 7 | unlisted callbacks, 1298 | list of `CBQ unlisted` ids per launch | T3 R sink SIDECAR; T4 N/A record-only; T5 C; T6 R; T7 N/A | `bridge_helper.c:1631-1635` |
| Item 8 | responsiveness, window mode | operator note | T3 N/A; T4 N/A record-only; T6 N/A; T7 R | operator statement |
| Item 9 | lobby shape, picker, window raise context | greps and operator note | T3 R sink SIDECAR; T4 N/A record-only; T5 C; T6 C Mac Steam menu entries depend on Mac Steam; T7 R | `bridge_helper.c:2179-2203`, `helperProcess.ts:451-457` |
| Capture instruction | tee, delimiters, per-launch copies, HELLO assertion, census `--log`, lsof | present | T3 R each literal names its sink in part a; T5 C pairs in part c are the reductions applied; T7 N/A | Section 2 |

### Review part c. Pairing pass (Test 5)

Reduction applied: every state-mutating requirement against every evidence-bearing requirement (M x N, not the full cross product).
State-mutators considered (4): {PC4 rebuild, PC6 dev restart, quit-between-launches, launch 2}. Evidence-bearing requirements considered (4): {the `gamelib.log` archives, the census runs, the lsof captures, the `terminal.log` transcript}.
Pairs examined: 16 (4 x 4). Flagged: 7, each with a reduction.

- {PC4 rebuild, PC6 restart} x {gamelib.log archive}: the app start renames `gamelib.log` to `.old` on first write. Reduction: PC5 archives both before PC6; a rebuild alone writes no log.
- {PC6 restart} x {terminal.log}: a bare `tee` would truncate. Reduction: `tee -a` only; the delimiter is appended after the restart.
- {PC6 restart, mid-gate} x {gamelib.log archive, HELLO count}: a dev restart between the launches would rename `gamelib.log` and lose launch 1's segment from the live file. Reduction: no restart between launches; `gamelib-launch-1.log` is archived before launch 2 starts; if the app restarts anyway, the launch in progress is marked unscorable.
- {quit-between-launches} x {gamelib.log archive}: the log is cumulative across game quits, so launch 2's archive contains launch 1. Reduction: the HELLO delta (exactly 1 new HELLO per launch) and the census `--log` on that launch's own file, with launch 2 read only after the LAST HELLO. Launch 1 is scored from `gamelib-launch-1.log` only.
- {quit-between-launches} x {census runs, NET budgets}: the helper stops with the game, so the `GL_NET_*` budgets (`bridge_helper.c:304-305`, per process) restart for launch 2 and cannot be starved by launch 1. This is why the quit between launches is mandatory rather than optional; a reused game session would also share the budgets and the lobby.
- {launch 2} x {lsof captures}: the helper pid changes per launch. Reduction: resolved fresh in each launch's capture step, never reused.
- {launch 2} x {PLAYERLOG counts}: PLAYERLOG accumulates in the bottle. Reduction: counts recorded before launch 1, after launch 1, after launch 2; differences are scored.
- Not flagged (9): the other combinations touch no shared file or process.
"Found nothing" is distinguishable from "did not look" by this list.

### Review part d. External state (Test 6)

Peer PC session online (PC8); friendship accepted; Schedule I: Free Sample installed on the peer and launchable (58-01 never recorded it); the second account is limited (A4, open in 58-01: whether a limited account can join; 58-37 and 58-25 show it joined, so this is expected fine); Local Network permission for Steam, Wine and CrossOver (PC9); the PC accepting the invite through its Steam chat/notification while its game is running (58-37: "joined game"); a stale lobby or a Schedule I process still running on either machine from an earlier attempt (quit both between launches); Mac Steam signed in; the bottle's windowed prefs (PC12; the game rewrites them on exit); the CrossOver DX11 fullscreen failure (out of scope, scope decision 2).
Positive observables: PC1 pid, PC8 and PC9 operator statements, the HELLO delta of exactly 1, the lsof captures showing live sockets while both players are in session, the Player.log count differences.

### Review part e. Gesture trace (Test 7)

| Gesture | Surface it names | Reachable? | Evidence |
| ------- | ---------------- | ---------- | -------- |
| Launch Schedule I from GameLib | GameLib Library, game page, Play | R: 58-01 / 58-17 / 58-22 / 58-25 / 58-37 launched the title this way | 58-01-TITLES.md; 58-37-SUMMARY.md |
| "Continue" into the world as host (Direction A) | the game's own menu | R: 58-17 operator note; 58-25 "worked in game and can interact" | 58-01-TITLES.md; 58-25-DIAGNOSIS.md |
| The game's '+' add-player control, then GameLib's picker | the game's UI calling `SteamFriends017.ActivateGameOverlayInviteDialog` (helper `INVITE dialog`, `bridge_helper.c:2171`), then the sidecar raise (`helperProcess.ts:451`) and the picker listing friends (`INVITE friends n=`, `:2263`) | R: proved live at 58-37 (windowed): the operator answered `raised: yes; picker: yes friends listed: yes; sent shown: yes`; log counts raise 8, `display=confirmed` 8, `list result=error` 0, `INVITE sent ok=1` 1. At 58-22 and 58-25 the same '+' did nothing visible (no picker existed); the picker is what 58-29..58-36 added. Windowed only: the raise over a fullscreen game is deferred | 58-37-SUMMARY.md |
| Click Invite on the PC account in the picker | the GameLib picker | R: 58-37 `sent shown: yes`, `PC saw invite: yes` | 58-37-SUMMARY.md |
| PC accepts the invite through PC Steam chat/notification with Schedule I running | PC Steam | R: 58-37 `PC accept result: joined game`. C only on the peer's side being at its menu with the game running (PC8) | 58-37-SUMMARY.md |
| Steam overlay (Shift+Tab, overlay friends dialog) | Steam overlay | I: not available in the bridged game. Replaced by the GameLib picker (Direction A) and PC Steam chat (Direction B). Not asked of the operator | spike findings; 58-01 Join flow |
| Mac Steam friends list "Invite to Game" | Mac Steam window | C: worked at 58-25 but is not the gesture under test (scope decision 3); recorded only if the picker fails | 58-25-DIAGNOSIS.md |
| PC hosts, invites the Mac; Mac accepts from Mac Steam while the game runs (B1) | Mac Steam chat/notification | R: proved at 58-22 item 3 (333 relayed, `CBDISP iCallback=333 targets=1 held=0`). C only on Mac Steam delivering the notification | 58-22-LIVE-GATE.md |
| Clicking a Steam invite LINK with the game closed, or accepting before the Mac is in Schedule I | Mac Steam / browser | I: "wrong platform" error (no Mac build). Never asked of the operator | 58-17 operator note |
| Operator confirms same world and mutual movement | the game | R: the operator sees both avatars (58-22 item 3, 58-25) | operator |

Each described gesture is traced to a UI the shipped game, Steam or GameLib offers; the overlay and link-with-game-closed gestures are removed from the instructions, not left as steps.

## 4. Tests

Every item names its sink and launch ordinal. All results are pending; plan 58-34 fills them. All greps use `grep -E` with ` +` between a literal's words (the helper pads its lines).

### 1. Build freshness, shim routing, PC8, PC9, PC11
expected: PC4, PC7, PC8, PC9, PC10, PC11 and PC12 held before launch 1. Mtimes of `public/bin/arm64/darwin/steam-bridge-helper`, `public/bin/arm64/darwin/steam_api64.dll` and `build/main/sidecar.js` are recorded and each is newer than commit `bc73e6ee4` (epoch 1793483489); `strings` on the helper prints 1 for `connection table full`; the built shim sha256 equals the installed shim and the `.gamelib-orig` file exists; `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 at PC6 and the dev restart (pid recorded) happened after the builds; the operator's verbatim PC8 statement (peer online, friend, installed, at its main menu) and verbatim PC9 grant states for Steam, Wine and CrossOver were recorded BEFORE launch 1; the census `--log` check printed ` host=` and ` client=`; the windowed prefs were confirmed. Sinks: filesystem, terminal.log, operator statements. Before launch 1.
result: pending

### 2. Direction A (launch 1): GameLib hosts through the picker, the PC joins
expected: all four sub-checks plus the path record, against `gamelib-launch-1.log`, taking only lines after the launch-1 HELLO (the HELLO delta was exactly 1), and only `bridge helper [3205720]:` lines. (a) HOST-SPECIFIC evidence, because the 504 line alone is the host's own lobby-create self-join and does NOT count: after the `INVITE sent ok=1` line (the line number in the file is greater than that line's) there is a game-originated `CALL +SteamNetworkingSockets0[0-9]{2}\.AcceptConnection` line, AND a `NET role=game kind=join iface=Sockets cb=1221` line; record the picker Invite-click time and the line times to show the order. (b) after those lines, at least one `NET role=game kind=send iface=Sockets` and one `NET role=game kind=recv iface=Sockets` line with `n` > 0; `role=helper` lines, `CBQ p2p-accept src=helper` and `INVITE` lines are not used. (c) the operator's typed answer, verbatim: both players are in the same world and each sees the other move. (d) `pnpm bridge-census --multiplayer 3205720 --log <session>/gamelib-launch-1.log | tee <session>/census-launch-1.txt` prints a line containing `verified` and ` host=1`; `host=0` is a FAIL of (a) even if the status reads `verified`. Path record (not scored, D-06): the NET `path=` value of the first `role=game` join/recv line that is not `unknown`, and from the two lsof files whether the peer was a LAN address (direct), a Valve relay address (relayed) or not visible (unknown), recorded as the word only, never the address. PLAYERLOG count differences for `Server connection state: Started`, `Starting FishySteamworks client connection`, `Entered lobby`. Launch 1.
result: pending

### 3. Direction B (launch 2): the PC hosts, GameLib joins
expected: all four sub-checks plus the CR-01 re-check and the path record, against `gamelib-launch-2.log` taking only the lines after its LAST HELLO (the HELLO delta was exactly 1), a launch separate from launch 1 with both games quit between them. (a) `CBDISP +iCallback=333` (relayed to the game; record `targets=` and `held=`; no `CBQ unlisted iCallback=333`), then `CALL +SteamMatchMaking009.JoinLobby`, `NET role=game kind=join iface=Matchmaking cb=504`, `NET role=game kind=join iface=Sockets cb=1221`, and `CALL +SteamNetworkingSockets0[0-9]{2}\.ConnectP2P`, in that order after the operator's invite acceptance. (b) after the join, at least one `NET role=game kind=send` and one `NET role=game kind=recv` with `n` > 0, role=game only. (c) the operator's typed answer, verbatim: same world and mutual movement, and which gesture (B1 or the game's own join menu) delivered the invite. (d) `pnpm bridge-census --multiplayer 3205720 --log <session>/gamelib-launch-2.log | tee <session>/census-launch-2.txt` prints `verified` and ` client=1`. CR-01 re-check (Gap 2): the count of `NET +role=game kind=recv iface=Sockets` lines is above 0 and the count of `NET +role=game kind=recv iface=Messages` lines is 0 for this Sockets title; any Messages recv is recorded as a Gap. Path record as item 2. A "wrong platform" error with the Mac game closed is an unscored operator-error launch to be repeated; the same outcome with the game running is a Gap, not a retry loop. Launch 2.
result: pending

### 4. Relay and incoming-session observations (M-04)
expected: record-only, from each launch's own segment (launch 2 only after its last HELLO). Counts and literals only, no ids. (i) counts of `CALL +SteamNetworkingUtils004\.InitRelayNetworkAccess` and `CALL +SteamNetworkingUtils004\.CheckPingDataUpToDate`; (ii) counts of `CBDISP iCallback=1281` and of `iCallback=1202`, `iCallback=1221` (with `targets=` and `held=`); (iii) per launch, the `CALL` names `AcceptConnection`, `CreateListenSocketP2P`, `ConnectP2P`, `JoinLobby` that appear (the first call per method per process only, so a presence is 0 or 1); (iv) in launch 1 which incoming-session path occurred (`1221` plus `AcceptConnection`, or `1202`), and in the host's launch 1 whether `CreateListenSocketP2P` appeared before the invite. Launches 1 and 2.
result: pending

### 5. NET budgets
expected: for each launch segment, list every `NET cap kind=... reached; later lines are not logged` note verbatim (these are the 58-28 per-(kind, iface) cap notes; the join budget is 16 and each send/recv/oversize per iface budget is 8) and the count of the retired single-budget literal `NET cap of 32 reached` (expected 0). Pass criteria: no `NET cap kind=join` note appeared AND the sub-check (a) join line and the (b) send/recv lines exist in that launch. A send or recv cap note is recorded (the 8-line budget was reached after the first lines, so absence of later traffic is inconclusive, not failing). Also record the counts of `NET role=game kind=oversize` (above 0 is a Gap: a message above 61440 bytes was refused) and of `ABORT connection table full` (expected 0; above 0 is a Gap against 58-35). Launches 1 and 2.
result: pending

### 6. D-13 stub notice
expected: record-only operator observation. Whether the game page showed the "multiplayer not yet verified / stubbed" notice for Schedule I at launch 1 and launch 2, and the verbatim text of any notice that fired with the launch ordinal; also whether the backend emitted `[bridge-notice] appId=3205720 reason=stubbed:...` (a count from SIDECAR). The notice is not expected to carry a blocking message for this title. Launches 1 and 2.
result: pending

### 7. Unlisted callbacks, with 1298 named
expected: record-only. The distinct ids from `CBQ +unlisted iCallback=<id> action=drop` lines in each launch's segment, and which ids are new against the 58-22 list (304, 336, 348, 1040011, 1040015, 1298, 1270003 in its launch segment; 1270006, 1040044, 1270009 before its HELLO). Callback 1298 is identified by name from the SDK headers: it is `k_iSteamNetworkingUtilsCallbacks` (1280, `steam_api_internal.h` in `build/lsteamclient-work/proton-extract/steamworks_sdk_*`) + 18, i.e. a SteamNetworkingUtils-range callback; across all the bundled SDK trees (099u through 165) the only header-defined Utils callback is `k_iSteamNetworkingUtilsCallbacks + 1` (SteamRelayNetworkStatus_t, 1281, delivered and counted in item 4), so 1298 has NO struct name in any bundled header. The runner records "1298 = Utils range + 18, unnamed in the SDK headers" and does not invent a name. Its recurrence is recorded per launch (count of distinct appearances and whether it appears at all), and it is placed on or off the host/join path by whether its line sits between the `INVITE sent ok=1` (or `CBDISP iCallback=333`) line and the first role=game send/recv line of that launch; a D-09 follow-up is filed only if it is on that path. Launches 1 and 2.
result: pending

### 8. Responsiveness and window mode
expected: record-only operator note, verbatim: frame-time or input responsiveness during each session ("smooth", "slow", "stuttering"), the long initial load duration if any (58-22 saw about 81 s from Play to the game process), and the settings used. The window mode and resolution actually used are recorded: the expected value is Windowed 1920x1080 (scope decision 1), and a fullscreen result is recorded as a deviation. Anything that looked wrong that the logs would not show. Launches 1 and 2.
result: pending

### 9. Lobby shape, picker and window-raise context
expected: record-only. From launch 1: the `MMS lobby op=` lines verbatim (create type/max, set-type, set-joinable), whether Mac Steam "Invite to Game" and the PC "Join Game" entries appeared (operator note, verbatim menu entries if seen, otherwise "not observed"), and the picker context counts: `bridge invite [3205720]: raise requested`, `display=confirmed`, `display=unconfirmed`, `list result=error`, `INVITE friends n=`, `INVITE sent ok=1`, `INVITE refused` (with reason words). The window raise is recorded for a WINDOWED game only; the fullscreen raise is deferred to the CrossOver DX11 todo (scope decision 2) and a pass here does not imply it. If the picker gesture failed and Mac Steam "Invite to Game" was used instead, that is recorded here and item 2 is scored `issue`. The operator's verbatim description of the picker (came to front: yes/no; friends listed: yes/no; Invite clicked: time). Menu-press observation (scope decision 5, record-only, unscored): one '+' press at the main menu before Continue on the Mac, what appeared verbatim, and whether `INVITE refused reason=no-pending` was logged. If the operator tries the PC main-menu '+' invite (scope decision 6), what Mac Steam showed verbatim (expected "invalid platform"); this is not the Direction B gesture. Launch 1 (menu press) and launch 2 (PC menu '+' if tried).
result: pending

## 5. Gaps

(none yet)

## 6. Verdict

Verdict: pending

Verdict rule: items 1, 2 and 3 must all be `pass` for `Verdict: PASS`. Any of items 1-3 not `pass` gives `Verdict: FAIL`, which routes to `/gsd-plan-phase 58 --gaps`; the phase is not marked done. Items 4-9 are record-only and never block, except that the Gaps they name are listed.

## 7. Run record

(empty: filled by plan 58-34)
