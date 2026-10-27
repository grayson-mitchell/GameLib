# Phase 54 Live Gate: Mac Steam Friends survive GameLib

Authored by: plan 54-10. Run by: plan 54-11. Decision D-E: the author never runs the gate. The author of
this contract did not run any item; every verdict below is from reading source and the sibling
contracts, not from a live run. A green test suite never closes this gate
(live-gate-contract-authoring Section 4 ii).

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.
Precedent: `55-LIVE-GATE.md` (authored 55-06, run 55-07). Wrap behaviour and timings: spike 046b
(`.planning/spikes/046b-wrap-around-logon/README.md`).

## Done-when being gated (ROADMAP)

- **SC4:** launch, browse, game page and Play leave Mac Steam Friends signed in with status
  changeable; the anonymous session alone does not flip Friends.
- **SC6 (live half):** an explicit Refresh and a depot install with Mac Steam online leave Friends
  signed in with status changeable.

Also covered: P54-SC5 (the guided fallback and the already-offline path) and the sidecar exit contract.

Also covered: the 54-UAT.md gap (Mac Steam never left offline by GameLib): items 10-13 interrupt a live
wrap by routed quit, shell kill and `kill -9`, and prove a user's own offline choice survives.

## Oracles

1. `GAMELOG` = `~/Library/Logs/GameLib/gamelib.log`. The sidecar `logInfo`/`logWarning` sink. Every
   `[Steam] CM logon mode=...`, `CM session closed`, `CM session reused`, `go-offline wrap:` and
   `CM logon skipped` line lands here and nowhere else.
2. `CONNLOG` = `~/Library/Application Support/Steam/logs/connection_log.txt`. Mac Steam's own log
   (`user initiated logoff`, `RecvMsgClientLogOnResponse() : processing complete`,
   `[Logged On, ...]` / `[Logged Off, ...]`). Read from a byte offset recorded before each item.
3. The operator's eyes on Friends & Chat: signed in, and status changeable (set Away, then back to
   Online, and the change sticks). **Friends is judged only by the operator; logs are corroboration.**

Privacy (T-54-41): captures live in the session directory under `/tmp`, never committed. CONNLOG
lines carry `[U:1:<accountid>]`; when quoting into the UAT, quote only the state/message part and
record counts and timestamps, not raw lines.

## 1. Preconditions

| ID  | Precondition | Command / confirmation | Positive observable |
| --- | --- | --- | --- |
| PC1 | Mac Steam freshly restarted, Friends signed in, status changeable | Operator quits and reopens Mac Steam, waits for Friends, sets Away then Online | Operator confirms both. Then `tail -c 600 "$CONNLOG"` ends with a `[Logged On, ...]` state |
| PC2 | No GameLib instance and no stray sidecar | `pgrep -f 'target/debug/gamelib-shell'; pgrep -f 'build/main/sidecar.js'` | both print nothing |
| PC3 | Tree contains every Phase 54 feat commit | `git log --oneline --grep='54-0'` (and `--grep='feat(54-'`) | feat commits for 54-01 through 54-08 listed; `git status --short` shows no unstaged `src/` edits |
| PC4 | Dev restarted so the sidecar is rebuilt (`tauri dev` does not rebuild the sidecar: restart it, `pnpm tauri:dev` runs `build:sidecar` first) | `stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' build/main/sidecar.js`; `git log -1 --format=%ci --grep='feat(54-'`; `grep -c 'CM logon mode=authenticated' build/main/sidecar.js` | sidecar mtime is newer than the newest `feat(54-` commit time AND the grep count is >= 1. If not: stop, restart dev, re-check |
| PC5 | Signed in to Steam inside GameLib | Steam appears in the sign-in state of the app | the library shows Steam titles (operator records the Steam library count N0) |
| PC6 | At least one installed Steam title; record whether any is a bridge title (CrossOver bottle `GameLibSteamBridge-<appId>`) | `ls ~/Library/Application\ Support/CrossOver/Bottles/ \| grep GameLibSteamBridge` plus the library view | names recorded. A bridge title present decides whether item 4 can pass or is blocked |
| PC7 | A small not-installed Steam title for item 6 | operator picks one | name and appId recorded |
| PC8 | A game available to start from Mac Steam for item 8 | operator picks one | name recorded |
| PC9 | No owed goonline marker and Mac Steam not persisted offline, so a stale debt cannot be mistaken for this session's. `MARKER="$HOME/Library/Application Support/GameLib/mac-steam-offline-owed.json"`, `VDF="$HOME/Library/Application Support/Steam/config/loginusers.vdf"` | `test -e "$MARKER"; echo $?`; `grep -c '"WantsOfflineMode"[[:space:]]*"1"' "$VDF"` | the first prints `1` (absent) and the count is `0`. If the marker is present, stop: record it, let one GameLib launch pay it, and restart from PC1. `VDF` holds account names and SteamIDs, so it is scored only as this count, never copied or quoted (T-54-41) |

External state (Test 6): PC1 is the Mac Steam external-state premise for items 1-6 and PC8's game
must not already be running. Fresh-Steam Friends state is confirmed positively by the operator, never
inferred from GameLib's stores.

## 2. Session procedure

One session directory. Items 1-9 stay on launch ordinal 1 with no mid-run relaunch, so nothing
truncates `gamelib.log` between those items. Items 10-13 use launch ordinals 2 to 6. Before **every**
relaunch, run `cp "$GAMELOG" "$SESSION/gamelib-launch-${N}.log"`, increment `N`, and write the
`=== GATE LAUNCH ${N} — <UTC> ===` delimiter into `terminal.log`. Item 9 still copies
`gamelib-launch-1.log`.

```
SESSION=/tmp/gamelib-gate-$(date -u +%Y-%m-%dT%H-%M-%SZ); mkdir -p "$SESSION"
GAMELOG=~/Library/Logs/GameLib/gamelib.log
CONNLOG=~/Library/Application\ Support/Steam/logs/connection_log.txt
# archive any pre-existing .old on the very first pass (may hold evidence from before the session)
cp -p ~/Library/Logs/GameLib/gamelib.log.old "$SESSION/gamelib-pre-existing.old" 2>/dev/null
cp -p "$GAMELOG" "$SESSION/gamelib-pre-existing.log" 2>/dev/null
# assert zero instances (PC2), then:
N=1
echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$SESSION/terminal.log"
pnpm tauri:dev 2>&1 | tee -a "$SESSION/terminal.log"
```

- The terminal transcript is **appended** (`tee -a`), never truncated.
- Exact delimiter text: `=== GATE LAUNCH ${N} — <UTC> ===`. Find boundaries with
  `grep -n '^=== GATE LAUNCH' "$SESSION/terminal.log"`.
- `gamelib.log` rotates to `.old` at the next launch's first write (`log_writer.ts:72-74`); items 10-13
  relaunch, so the runner copies it at the end of the run and **before every further launch**: `cp "$GAMELOG" "$SESSION/gamelib-launch-${N}.log"`.
- **One instance asserted, not assumed.** Before launch: `pgrep -f 'target/debug/gamelib-shell'`
  empty. After the window appears: `pgrep -f 'target/debug/gamelib-shell' | tee -a "$SESSION/terminal.log"`
  prints exactly one PID. Record it again at teardown. A count other than 1 aborts the launch;
  its evidence is not scorable.
- **Per-item offsets.** Before each item, record both file sizes into `$SESSION/offsets.txt`:
  `echo "item <K> $(date -u +%H:%M:%S) conn=$(stat -f %z "$CONNLOG") gl=$(stat -f %z "$GAMELOG")" >> "$SESSION/offsets.txt"`.
  Slice an item's evidence with `tail -c +$((OFFSET+1)) "$CONNLOG"` and the same for `$GAMELOG`.
  Save each slice as `$SESSION/item-<K>-conn.txt` and `$SESSION/item-<K>-gl.txt`.
- **Closing inventory** after teardown (taken at the end of item 13): `ls -la "$SESSION"/` and `wc -l "$SESSION"/*`, recorded in the
  write-up, so a missing or empty capture is visible during the run.

Literal sinks: every scored literal below is a sidecar `logInfo`/`logWarning` and is scored from
`$GAMELOG` slices (or CONNLOG where stated), **never** from `terminal.log`. The sidecar's logger does
not reach the dev transcript.

## 3. Items

Each item: launch ordinal 1 unless stated (items 10-13: launches 2 to 6). "No authenticated logon" means zero lines containing
`CM logon mode=authenticated` in that item's `$GAMELOG` slice, and zero `RecvMsgClientLogOnResponse`,
`user initiated logoff` or `[Logged Off` lines in that item's CONNLOG slice that were caused by GameLib.

### Item 1. Cold launch, idle 90 s (SC4 launch)

Steps: record offsets, launch per Section 2 (after PC1-PC8), wait for the window, then leave the app
idle 90 s with Mac Steam Friends visible.
Pass: the `$GAMELOG` slice from launch has **no** `CM logon mode=authenticated`; the CONNLOG slice has
no `user initiated logoff` and its last state is still `Logged On`; the operator confirms Friends
signed in and status changeable at 90 s. An `CM logon mode=anonymous reason=` line may appear
(anonymous does not flip Friends; the operator is the judge).
Fail: any `CM logon mode=authenticated` line, a CONNLOG `user initiated logoff`, or Friends signed out.

### Item 2. Browse the library and open three game pages (SC4 browse and game page)

Steps: record offsets; scroll the Steam library; open three different Steam game pages (record
names); wait 30 s.
Pass: no `CM logon mode=authenticated` and no `go-offline wrap:` line in the slice (the wrap fires
only on an authenticated logon, so its presence means a logon attempt); CONNLOG shows no new
`user initiated logoff`; Friends signed in and changeable.
Fail: any of those lines, or Friends changed.

### Item 3. Play an installed title (SC4 Play; SC2 launch target)

Steps: record offsets; Play one installed title, a bridge title if PC6 found one; let it reach a
window or error; record which of Recorded behaviour changes (i) and (ii) the title hit; quit the game.
Pass: no `CM logon mode=authenticated` in the slice; CONNLOG no `user initiated logoff`; Friends signed
in and changeable. If a bridge title was played: `CM logon mode=anonymous reason=launch-target`
appears in the slice (it is logged when the anonymous PICS client opens; if an anonymous session was
already open from item 1 or 2 within 60 s idle, the line can be absent, so wait 70 s after the last
anonymous activity or accept `CM session closed mode=anonymous cause=idle` before the Play).
Fail: any authenticated logon, or Friends changed.

### Item 4. The anonymous session alone (SC4)

Evidence is item 3's slice. Pass: `CM logon mode=anonymous reason=launch-target` present AND no
`mode=authenticated` line AND Friends unchanged by the operator's judgment, so the anonymous session
alone did not flip Friends. **Blocked (not failed)** if PC6 found no bridge title: record that reason
and mark the item `blocked`.

### Item 5. Explicit Refresh with Mac Steam online (SC6)

Steps: record offsets (note the time `T5`); press the Refresh button in the header; wait for the sync
to finish; wait 60 s more; record the library count N5.
Pass, all of:
- CONNLOG slice has `user initiated logoff` at a position **before** GameLib's
  `CM logon mode=authenticated reason=user-refresh wrap=toggled` line in `$GAMELOG` (compare
  timestamps; the logoff precedes the logon);
- CONNLOG slice afterwards has `RecvMsgClientLogOnResponse() : processing complete` (Mac Steam is back
  online) and its last state is `Logged On`;
- Friends signed in and status changeable 60 s after the Refresh finished (operator);
- N5 equals N0 (library count unchanged).
Fail: the authenticated logon lands before the logoff, `wrap=` is not `toggled` on an online Steam,
Friends stays out, or the count changed.
If the dialog appears instead (`CM logon skipped`), record it as the item 8 outcome, mark item 5
`blocked`, and see item 8.

### Item 6. Depot install with Mac Steam online (SC6)

Steps: wait until at least 70 s after item 5's Refresh finished so the idle grace has closed the
session; confirm `CM session closed mode=authenticated cause=idle` is in `$GAMELOG` after item 5's
offset (if absent, wait and re-check; the grace is 60000 ms). Record offsets; install the PC7 title
from GameLib; wait for the install to complete; then wait at least 60 s.
Pass, all of:
- same wrap evidence as item 5 with `reason=user-install` (`CM logon mode=authenticated reason=user-install wrap=toggled`
  after CONNLOG `user initiated logoff`; afterwards `processing complete` and `Logged On`);
- install completes (the title shows Installed / Play);
- Friends signed in and status changeable;
- at least 60 s after the install completes, `CM session closed mode=authenticated cause=idle`
  appears in `$GAMELOG`.
Fail: any of the above missing, or the session never closes.

### Item 7. Mac Steam offline by hand, then Refresh

Precondition: item 6's `CM session closed mode=authenticated cause=idle` is already seen, so Refresh
opens a cold session. Steps: operator sets Mac Steam offline (Steam > Go Offline > Go Offline, wait for
`[Logged Off` in CONNLOG); record offsets; press Refresh in GameLib; wait for it to finish; wait 60 s.
Pass: `$GAMELOG` slice has `go-offline wrap: Mac Steam state=Logged Off, no toggle needed` and
`CM logon mode=authenticated reason=user-refresh wrap=already-offline`; the CONNLOG slice has **no**
new `user initiated logoff` and no `processing complete` caused by GameLib's action; Steam stays
offline (last state `Logged Off`).
Fail: `wrap=toggled`, a GameLib-caused `goonline`, or Steam comes back online.
After the item: the operator restores Steam online by hand (Steam > Go Online) and waits for Friends
and a `[Logged On` state before item 8.

### Item 8. Guided fallback (conditional)

Conditional on Mac Steam's behaviour with a game running (not measured in spike 046; an open
question). Steps: wait until any open authenticated session has closed; start the PC8 game from Mac
Steam; with it running, press Refresh in GameLib; record offsets before.
Pass if EITHER:
- (a) the wrap succeeds: `wrap=toggled` with the logoff before the logon. Record that the URL verb
  works with a game running; or
- (b) the dialog appears: `CM logon skipped: Mac Steam did not go offline` is in `$GAMELOG` and there is
  **no** `mode=authenticated` line before it. Then the operator clicks Steam > Go Offline, presses
  Continue in the dialog, and the refresh logs on with `wrap=guided-restore`, and Mac Steam comes back
  online afterwards (`processing complete`, `Logged On`).
Fail only if a `CM logon mode=authenticated` line lands while CONNLOG's last state is `Logged On`
(an authenticated logon without the wrap), or in (b) Steam does not return online.
Quit the Mac Steam game afterwards.

### Item 9. Sidecar exit

Steps: quit GameLib (Cmd+Q). Within 10 s: `pgrep -f 'build/main/sidecar.js'` is empty and
`pgrep -f 'target/debug/gamelib-shell'` is empty. (The sidecar exits by event-loop drain at stdin EOF;
`smoke:sidecar` misses slow exit, so this live check is the measurement.) Then
`cp "$GAMELOG" "$SESSION/gamelib-launch-1.log"`. (The closing inventory is now taken at the end of item 13.)
Pass: both empty by 10 s. Fail: an orphan sidecar remains (record its PID and kill it).

### Item 10. Routed quit mid-wrap (layer 1, handleExit)

Launch 2. Wait for Mac Steam `Logged On` and Friends signed in. Record offsets. Press Refresh, then
press Cmd+Q within about 1 s. The wrap window is about 3-5 s: LogOff within 0.25 s, the logon, then a
2 s settle before goonline. Wait 20 s, then `cp "$GAMELOG" "$SESSION/gamelib-launch-2.log"`.

- **Mid-wrap discriminator** (otherwise the run is VOID): the launch-2 log has
  `go-offline wrap: Mac Steam state=<word>, firing gooffline` AND
  `go-offline restore trigger=shutdown: firing goonline`. The restore logs that line only when the
  marker is present at quit time, and the marker is cleared after the wrap's own goonline, so the line
  proves the quit landed between gooffline and goonline. The wrap's own `go-offline wrap: firing
  goonline` line **may also be present** and does not void the run: `releaseForShutdown`'s `logOff`
  aborts the in-flight logon, so the wrap's `finally` normally fires too, through a transport that may
  already be gone.
- **VOID cap:** at most 3 attempts. After 3 VOID runs record the item as
  `blocked — unscorable: quit never landed mid-wrap in 3 attempts`, with each attempt's timestamps.
  Do not record it as a pass or as an issue.
- **Pass:** the CONNLOG slice has `user initiated logoff`, then `processing complete`, and its last
  state is `Logged On` within 20 s of the quit. `test -e "$MARKER"` prints `1`. The `VDF` count (`grep -c '"WantsOfflineMode"[[:space:]]*"1"' "$VDF"`) is 0.
  The operator confirms Friends signed in and status changeable.
- **Fail:** the discriminator holds but Steam's last state is `Logged Off`, or the `VDF` count is 1,
  or the marker remains.
- **Caveat:** gamelib.log is written with async `appendFile`, and `app.exit()` is followed by a group
  SIGTERM, so the restore line can be lost. A missing line makes the attempt VOID (it counts toward
  the cap), never a pass on CONNLOG alone. In CONNLOG, a quit that landed after the wrap's own goonline
  looks the same as one that landed mid-wrap.

Read `VDF` at least 15 s after the event (Mac Steam rewrites it on a state change; logon completes in
about 1.5 s, spike 046a).

### Item 11. Shell killed mid-wrap (layer 2, stdin EOF)

Launch 3. Record offsets. Arm the watcher in a second terminal:
`tail -n0 -F "$GAMELOG" | grep -m1 -q 'firing gooffline' && sleep 1 && pkill -9 -f 'target/debug/gamelib-shell'`.
The `sleep 1` puts the kill after the LogOff (0.25 s) and before goonline (logon plus a 2 s settle).
Then press Refresh. Within 10 s `pgrep -f 'build/main/sidecar.js'` must be empty (exit by drain). Wait
20 s, then `cp "$GAMELOG" "$SESSION/gamelib-launch-3.log"`. The sidecar lives until drain, so its log is
flushed.

- **Discriminator:** as item 10 (the wrap's own goonline line is allowed; the same 3-attempt VOID cap
  applies), plus the stdin-EOF line `[sidecar] stdin closed:` is present.
- **Pass:** as item 10's oracles, plus the sidecar is gone within 10 s.
- **Fail:** Steam left `Logged Off`, the `VDF` count is 1, the marker remains, or an orphan sidecar
  remains (record its PID and kill it).

### Item 12. kill -9 of shell and sidecar mid-wrap (layer 3, boot)

Launch 4. Record offsets. Arm:
`tail -n0 -F "$GAMELOG" | grep -m1 -q 'firing gooffline' && sleep 1 && pkill -STOP -f 'build/main/sidecar.js'; pkill -STOP -f 'target/debug/gamelib-shell'; pkill -9 -f 'build/main/sidecar.js'; pkill -9 -f 'target/debug/gamelib-shell'`.
Stopping both first means the sidecar can neither see stdin EOF nor be respawned before it dies, so no
in-process restore can run. This is the `kill -9` case the gap names. Press Refresh. Wait 20 s. Then
record the **interrupted state**, the evidence that the item reproduces the defect: CONNLOG last state
`Logged Off`, `test -e "$MARKER"` prints `0` (present), and the `VDF` count (`grep -c '"WantsOfflineMode"[[:space:]]*"1"' "$VDF"`) is 1. If Steam is already
online the run is VOID (a restore ran); repeat under the same 3-attempt cap as item 10. Copy
`gamelib-launch-4.log`. Relaunch (launch 5), record offsets, and wait 30 s.

- **Pass:** the launch-5 log has `go-offline restore trigger=boot: firing goonline` and
  `go-offline restore trigger=boot: Mac Steam back online, marker cleared`. CONNLOG after the launch-5
  offset has `processing complete` and last state `Logged On`. The marker is absent. The `VDF` count is
  0 (same `WantsOfflineMode` count). The operator confirms Friends signed in and status changeable.
- **Fail:** any of those missing. `restore-unconfirmed` (`online not confirmed within 10000ms`) is an
  issue, not a pass, even if Steam later comes online.

### Item 13. The user's own offline choice survives quit and relaunch

Never fire when GameLib did not take Steam offline. In launch 5, after item 12, the operator sets Mac
Steam offline by hand (Steam > Go Offline) and waits for `[Logged Off` in CONNLOG. Confirm
`test -e "$MARKER"` prints `1`. Record offsets. Cmd+Q GameLib. Copy `gamelib-launch-5.log`. Relaunch
(launch 6) and wait 30 s.

- **Pass:** neither the launch-5 log slice after item 13's recorded `gl=` offset (item 12's boot
  restore lines sit before it) nor the launch-6 log contains any `go-offline restore trigger=` line.
  CONNLOG after the offset has no `processing complete` and its last state is still `Logged Off`. The
  `VDF` count (`grep -c '"WantsOfflineMode"[[:space:]]*"1"' "$VDF"`) is 1 (the user's choice, persisted by Steam).
- **Fail:** any restore line, or Steam comes back online.
- **Afterwards:** the operator restores Steam online by hand and waits for `[Logged On`. Quit GameLib,
  `cp "$GAMELOG" "$SESSION/gamelib-launch-6.log"`, and take the closing inventory
  (`ls -la "$SESSION"/` and `wc -l "$SESSION"/*`).

## 4. Recorded behaviour changes (not items to pass or fail)

(i) A bridge title installed before Phase 54 with an unsettled shared-redist ledger logs
`shared redists: Steam client offline, skipping for <appId> (no open session and logon not allowed here)`
at Play (`depot.ts:1355`, plans 05/08) and launches without the redists until a Play follows a
session-holding action. Not a failure.

(ii) A pre-Phase-54, license-gated bridge title Played before any Refresh shows the SteamBridgeSetup
dialog with `Reason: launch-exe-not-resolved` (`games.ts:1712`, `games.ts:3026`); one Refresh backfills
its launch target (plans 06/08). Item 3 records which of these the operator's titles hit.

(iii) A kept marker can outlive a manual goonline in one narrow case: (1) GameLib quits while Mac Steam
is not running (`kept-not-running`); (2) the user starts Steam, which starts offline, and brings it
online by hand; (3) the user later deliberately goes offline; (4) GameLib's next boot then fires
goonline and undoes that later choice. The marker records only that GameLib owes a goonline, not
whether the user has since paid it. The window closes at the first boot or wrap that finds Steam
running, so a stale marker is paid at most once.

## 5. Structural Reachability Review

All seven tests applied by the author before publishing. Verdicts: REACHABLE, IMPOSSIBLE, CONDITIONAL.

Sinks confirmed by the author (Test 3): the scored literals are all `logInfo`/`logWarning` calls in
sidecar code, so they reach `~/Library/Logs/GameLib/gamelib.log` and never the dev transcript.

| Item / sub-check / precondition | Surface it names | What it asks for | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| T1 origin/scheme, all items | steam:// URL verbs, local files | no https-only origin gate sits on these routes; `STEAM_GO_OFFLINE_URL = 'steam://open/gooffline'` is opened through the shell, not a webview | REACHABLE | `macSteamOffline.ts:9-10`; no `login_window_url_arg` in any route |
| T2 concurrency, items 1-9 | one window, sequential gestures | no item drives two UI gestures at once; item 8's dialog is a sequential step after Refresh | REACHABLE | no concurrent gesture in Section 3; dialog is `Dialog` in `SteamGoOfflineNotice.tsx` |
| T3 `CM logon mode=anonymous reason=launch-target` (items 3, 4) | gamelib.log | emitted at `anonymousClient.ts:131` via `logInfo`, called with reason `launch-target` at `launchTarget.ts:175` from Play at `games.ts:1703/3017/3570/3825` | CONDITIONAL | emitter exists; fires only when no anonymous client is cached (`getAnonymousPicsClient` returns the cache silently while idle < 60 s, `anonymousClient.ts:139-142`) and only for a bridge title. Contract waits for the 60 s idle close (`ANON_IDLE_CLOSE_MS = 60000`) before item 3 |
| T3 `CM logon mode=authenticated reason=<r> wrap=<w>` (items 5-8) | gamelib.log | emitted at `user.ts:930`, one site, pinned by Rule K of `steamAuthSessionPolicy.test.ts` | REACHABLE | `grep -n 'CM logon mode=authenticated' src/backend/storeManagers/steam/user.ts` -> 930; `reason=user-refresh` from `library.ts:979` grant; `reason=user-install` from `depot.ts:797` default |
| T3 `CM session closed mode=authenticated cause=idle` (items 6, 7) | gamelib.log | emitted at `user.ts:620`, `endSession('idle')` from the idle timer at `user.ts:410-413` after the last lease release | REACHABLE | `AUTH_SESSION_IDLE_GRACE_MS = 60000` (`user.ts:59`); refresh and install both hold leases (`library.ts:979`, `depot.ts:796`) so release arms the timer |
| T3 `CM session reused mode=authenticated` | gamelib.log | `user.ts:383` | REACHABLE (not scored; informational) | `acquireOpenAuthenticated` |
| T3 `CM logon skipped` (item 8b) | gamelib.log | `user.ts:596` `logWarning` on `GuidedOfflineRequiredError` | REACHABLE | `macSteamOffline.ts:214,266` throw it; `user.ts:594-600` logs it |
| T3 `go-offline wrap:` lines (items 2, 7) | gamelib.log | `macSteamOffline.ts:214-289` | REACHABLE | `logInfo/logWarning` at those lines |
| T3 `wrap=toggled / already-offline / guided-restore` | gamelib.log | `MacSteamWrapKind` values in the `user.ts:930` interpolation | REACHABLE | `macSteamOffline.ts:35-39` |
| T3 CONNLOG literals `user initiated logoff`, `processing complete`, `[Logged On/Off` | Mac Steam's file | written by Mac Steam, not GameLib; `LOGOFF_EVIDENCE_RE = /user initiated logoff/` is the same literal GameLib's wrap reads | REACHABLE | `macSteamOffline.ts:14-15`; spike 046b README |
| T3 `shared redists: Steam client offline ... logon not allowed here` (note i) | gamelib.log | `depot.ts:1355` | REACHABLE | `logInfo` |
| T4 absence: "no `mode=authenticated`" (items 1-4) | gamelib.log | an authenticated logon always logs this line (single site `user.ts:930`), and the source gate counts that site once, so a regression opening a logon elsewhere trips the gate; absence in this sink is observable. CONNLOG is a second, independent oracle | REACHABLE (falsifiable absence) | Rule K of `steamAuthSessionPolicy.test.ts` (54-09); CONNLOG `user initiated logoff` would also show an unwrapped toggle |
| T4 absence: "no new `user initiated logoff` from GameLib" (item 7) | CONNLOG | Mac Steam logs the logoff on presence; the sink would show it | REACHABLE (falsifiable) | spike 046b |
| T4 absence: `go-offline wrap:` absent in item 2 | gamelib.log | the wrap runs only inside an authenticated logon (`user.ts:586`); its lines would be present if it ran. This is a structural guarantee of the same fact as the authenticated-logon absence, recorded as confirmation of an existing guarantee, not a novel discovery | REACHABLE (structural) | `user.ts:582-600` |
| T5 pair pass | whole contract | reduction applied: every state-mutating requirement against every evidence-bearing requirement. Mutating: M1 launch (rotates `.old`), M2 Refresh/install (toggles Mac Steam), M3 operator sets Steam offline (item 7), M4 start a Steam game (item 8), M5 quit (item 9). Evidence-bearing: E1 `terminal.log`, E2 `gamelib.log`, E3 CONNLOG offsets, E4 Friends state, E5 session-closed lines. 5 x 5 = 25 pairs considered | CONDITIONAL, 3 flagged and fixed in the contract | see the three rows below |
| T5 pair M1 x E1/E2 | launch vs transcript / log | one launch only, `tee -a`, copy at end; no truncation, no `.old` rotation mid-run | REACHABLE | Section 2 |
| T5 pair M2 (item 5) x E4/E5 (item 6) | Refresh toggles Steam; item 6 needs Friends recovered and the session closed | item 6 waits >= 70 s and confirms `cause=idle`; Friends re-judged | REACHABLE | Item 6 steps |
| T5 pair M3 (item 7 leaves Steam offline) x item 8 premise | item 8 assumes Steam online | item 7 ends with the operator restoring Steam online and waiting for `[Logged On` | REACHABLE | Item 7 closing step |
| T5 pair M4 x E4 | a running Steam game vs Friends judgement | item 8 does not score Friends; it scores logs and the dialog | REACHABLE | Item 8 |
| T5 pair M5 (quit) x E2 | quit vs archived log | copy taken after quit; session dir keeps it | REACHABLE | Item 9 |
| T6 PC1 Friends premise | Mac Steam external state | positive observable: operator sets Away then Online; CONNLOG `Logged On`. App-side stores are never used as the premise | REACHABLE | PC1 |
| T6 item 3/4 premise "no anonymous session cached" | process-internal state | idle close line `CM session closed mode=anonymous cause=idle` is the positive observable | CONDITIONAL | `anonymousClient.ts:105,168` |
| T6 item 7 premise "Steam offline" | Mac Steam external state | positive observable: CONNLOG last state `Logged Off` | REACHABLE | `readMacSteamCmState` regex `macSteamOffline.ts:13` |
| T6 PC5 / PC8 | keychain / running game | PC5: library visible; PC8 game must not already be running | REACHABLE | PC5, PC8 |
| T7 Refresh button | `Header/index.tsx` | `refreshLibrary({ origin: 'action-icons-refresh-button' })`; origin maps to `user-refresh` | REACHABLE | `Header/index.tsx:407`; `authTrigger.ts:75` |
| T7 Install button | game page / library | Install gesture for a not-installed Steam title opens the install modal; the install path reaches `acquireAuthenticated` with `guidedAction: 'install'` | REACHABLE | `depot.ts:796-800`; `InstallGameModal` import in `SteamGoOfflineNotice.tsx` |
| T7 Go Offline dialog (item 8b) | `SteamGoOfflineNotice` | mounted in `App.tsx` at the app root, opened by the backend push `steamGoOfflineRequired`; Continue calls `steamGoOfflineRetry` then re-runs `refreshLibrary` with origin `steam-go-offline-retry` (maps to `user-refresh`) | REACHABLE | `App.tsx:38,134`; `SteamGoOfflineNotice.tsx:41-60`; `authTrigger.ts:83` |
| T7 Play button / game pages | library UI | standard Play and card gestures | REACHABLE | existing screens |
| T7 quit gesture (item 9) | OS menu | Cmd+Q | REACHABLE | OS |
| Item 1 | cold launch | no new gesture | REACHABLE | Section 2 |
| Item 2 | browse, three pages | `getExtraInfo` opens no session (`games.ts:1022-1030`) | REACHABLE | `games.ts` |
| Item 3 | Play | `launch()` bridge branch passes no `allowLogon` (`games.ts:3471`) | REACHABLE | `games.ts` |
| Item 4 | anonymous alone | blocked if no bridge title | CONDITIONAL | PC6 |
| Item 5 | Refresh online | wrap `toggled` path | REACHABLE | `macSteamOffline.ts:253-273` |
| Item 6 | depot install | 70 s spacing, lease release arms the idle timer | REACHABLE | `user.ts:398-414` |
| Item 7 | already-offline | `macSteamOffline.ts:230-240` | REACHABLE | state read |
| Item 8 | guided fallback | Mac Steam's behaviour with a game running was not measured in spike 046 | CONDITIONAL | contract accepts both outcomes (wrap succeeds, or dialog + `guided-restore`) |
| Item 9 | sidecar exit | exit by stdin EOF drain (`releaseOnStdinEof`) | REACHABLE | CLAUDE.md sidecar exit contract |
| PC1-PC9 | preconditions | each has a command or operator confirmation | REACHABLE | Section 1 |
| PC4 | stale sidecar | mtime vs newest feat commit and a literal grep of `build/main/sidecar.js` (author checked at authoring: sidecar mtime 2026-10-27 22:44, newest feat commit 22:18, so it passes now; the runner re-checks) | REACHABLE | Section 1 |
| Evidence capture | whole pipeline | dual sink, session dir, appended transcript, delimiter, per-item offsets, one-instance assertion, closing inventory | REACHABLE | Section 2 |
| T3 `go-offline wrap: Mac Steam state=<word>, firing gooffline` (items 10-12) | gamelib.log | `logInfo` at `macSteamOffline.ts:462` | REACHABLE | `sed -n 462p` shows the literal |
| T3 `go-offline wrap: firing goonline` (items 10, 11, allowed not required) | gamelib.log | `logInfo` at `macSteamOffline.ts:500` | REACHABLE | line 500 |
| T3 `go-offline restore trigger=shutdown: firing goonline` (items 10, 11) | gamelib.log | template `go-offline restore trigger=${trigger}: firing goonline` at `macSteamOffline.ts:550`; `'shutdown'` passed at `user.ts:826` from `releaseForShutdown`, reached by `await SteamUser.releaseForShutdown()` at `utils.ts:329` | REACHABLE | lines 550, 826, 329 |
| T3 `go-offline restore trigger=boot: firing goonline` (items 12, 13 absence) | gamelib.log | same template, line 550, `'boot'` passed by `restoreMacSteamOnlineIfOwed('boot')` at `bootstrap.ts:1104` | REACHABLE | lines 550, 1104 |
| T3 `go-offline restore trigger=boot: Mac Steam back online, marker cleared` (item 12) | gamelib.log | `logInfo` at `macSteamOffline.ts:565` | REACHABLE | line 565 |
| T3 `go-offline restore trigger=boot: online not confirmed within ...ms, marker kept` (item 12 fail) | gamelib.log | `logWarning` at `macSteamOffline.ts:571`, outcome `restore-unconfirmed` (line 574) | REACHABLE | line 571 |
| T3 `[sidecar] stdin closed:` (item 11) | gamelib.log | `stdinEofRelease.ts:40`, in `releaseOnStdinEof` (line 34) | REACHABLE | line 40 |
| T7 Cmd+Q through the sidecar `quit` handler (items 10, 13) | OS menu | `route_app_menu_quit_through_sidecar` (`src-tauri/src/main.rs:1227`, called at 13192); `ipcMain.on('quit'` (`appShellFlowRegistration.ts:325`); `handleExit` awaits `SteamUser.releaseForShutdown()` (`utils.ts:329`) | REACHABLE | those lines |
| T7 `pkill -9` of the shell (item 11) | shell process | stdin EOF reaches `releaseOnStdinEof` (`stdinEofRelease.ts:34`) | REACHABLE | CLAUDE.md sidecar exit contract |
| T7 STOP plus KILL of both processes (item 12) | both processes | no JS runs after STOP, so no in-process restore; only the boot layer can pay | REACHABLE | Item 12 steps |
| T7 relaunch (items 12, 13) | `pnpm tauri:dev` | `init()` reaches `restoreMacSteamOnlineIfOwed('boot')` at `bootstrap.ts:1104` | REACHABLE | line 1104 |
| T4 absence: "no `go-offline restore trigger=` line" (item 13) | gamelib.log | every non-`not-owed` outcome logs a restore line (`macSteamOffline.ts:516-574`), so a fire would always leave one; falsifiable | REACHABLE (falsifiable absence) | `macSteamOffline.ts:516,526,533,550` |
| T4 items 10, 11 | gamelib.log | use a positive discriminator (the `trigger=shutdown` restore line, logged only when the marker exists at quit), not an absence. The wrap's own goonline line is expected under a correct build (`logOff` aborts the logon and the `finally` runs), so its absence is never required | CONDITIONAL (timing; VOID-and-repeat, cap 3) | Item 10 text |
| T5 each relaunch x E2 (`.old` rotation) | launch vs archived log | the copy `gamelib-launch-${N}.log` is taken before every relaunch | REACHABLE | Section 2 |
| T5 item 12 interrupted Steam-offline state x item 13 premise | item 12 leaves Steam offline | item 12's pass restores `Logged On` before item 13 starts | REACHABLE | Item 12 pass |
| T5 item 13 hand-set offline x end of session | item 13 leaves Steam offline | the operator restores Steam online by hand and waits for `[Logged On` | REACHABLE | Item 13 Afterwards |
| T6 PC9 marker and VDF premise | on-disk state | positive observables `test -e "$MARKER"` and the `grep -c` count | REACHABLE | PC9 |
| T6 item 12 interrupted state | Mac Steam and marker | positive observable (CONNLOG `Logged Off`, marker present, VDF count 1), not inferred | REACHABLE | Item 12 |
| Item 10 | routed quit mid-wrap | timing-dependent landing | CONDITIONAL | VOID cap 3 |
| Items 11, 12, 13 | shell kill, kill -9, own offline choice | deterministic watcher or operator gesture | REACHABLE | Section 3 |

IMPOSSIBLE verdicts: none. CONDITIONAL rows (item 3/4 anonymous line, item 4 bridge title, item 8, item 10) each
state the condition and what the runner records if it does not hold. Count of structural impossibilities
and unresolved requirement interactions found at authoring: 0 unresolved (3 interactions flagged and
resolved in the contract text).

## Run record — 2026-10-28 (plan 54-11)

Result: all 13 items of 54-UAT.md passed on the operator's Mac. Evidence stayed in `/tmp/gamelib-gate-20261027T094938Z/` (not committed); this record carries counts, state words and timestamps only. The UAT gap "Mac Steam is never left offline by GameLib" is resolved (items 10-13).

### Deviations from the contract

- PC1: Mac Steam was not freshly restarted before launch 1. CONNLOG showed it continuously Logged On since 22:58 the previous night with no GameLib-caused events. The launch-1 delimiter and the item-1 offsets were written retroactively (dev was already running).
- Launch ordinals shifted against the contract. Item 10 attempt 1 = launch 2 (VOID: the operator's Cmd+Q went to Mac Steam, which the gooffline URL had brought to the foreground, so Steam itself quit; steam_osx was absent afterwards). Item 10 attempt 2 = launch 3 (scored; triggered before offsets were recorded, so sliced by timestamp, launch-3 log begins 08:51:18). Item 11 = launch 4. Item 12 = launches 5 (interrupt) and 6 (boot restore). Item 13 = launch 6 (manual offline and quit) and launch 7 (relaunch).
- Item 7 first attempt VOID: the operator pressed Refresh before Steam was actually offline (Steam was Logged On, so the wrap toggled normally). Re-armed after a confirmed CONNLOG Logged Off at 08:27:38.
- Items 9 and 11: sidecar exit confirmed within 10 s, exact second not resolved.
- Contract note: CONNLOG's "Shutdown" token also appears in a normal gooffline; it does not by itself indicate Steam quit. Item 10 attempt 1's VOID rests on steam_osx being absent afterwards.

### Scores

| Item | Launch | Result | Key counts / timestamps |
|------|--------|--------|-------------------------|
| 1 | 1 | pass | 0 authenticated, 0 logoff; Friends ok |
| 2 | 1 | pass | 0 authenticated, 0 wrap lines, 0 logoff |
| 3 | 1 | pass | 1 anonymous launch-target (08:09:03), 0 authenticated, 0 logoff; Avernum 6; neither behaviour change hit |
| 4 | 1 | pass | same slice as item 3 |
| 5 | 1 | pass | logoff and wrap=toggled 08:10:23, Logged On 08:10:27, idle close 08:11:31; N0=N5=385 |
| 6 | 1 | pass | user-install wrap=toggled 08:19:04, Logged On 08:19:08, idle close 08:20:32; World of Goo |
| 7 | 1 | pass | 1 wrap=already-offline (08:29:13), 0 logoff, 0 processing complete |
| 8 | 1 | pass, outcome (b) | 1 CM logon skipped (08:39:39), 1 guided-restore (08:43:42), Logged On 08:43:46 |
| 9 | 1 | pass | shell and sidecar gone by 08:45:01 |
| 10 | 3 (attempt 2) | pass | restore trigger=shutdown 08:51:49, Logged On 08:51:51, marker absent, VDF count 0 |
| 11 | 4 | pass | stdin closed and restore trigger=shutdown 08:55:17, Logged On 08:55:18, marker absent, VDF count 0 |
| 12 | 5, 6 | pass | interrupted state reproduced (Logged Off, marker present, VDF count 1); boot restore 08:58:28 to 08:58:30, Logged On, marker absent, count 0 |
| 13 | 6, 7 | pass | 0 restore lines in both logs, 0 processing complete, last state Logged Off, VDF count 1 |

Operator Friends verdicts: items 1-3 signed in and status changeable; item 5 friends dropped and came back, status works, 385 unchanged; item 6 same; item 7 Steam stayed offline; item 8 Steam came back online, Friends signed in, status works; items 10, 11, 12 signed in and status works; item 13 Steam stayed offline.

### Findings / follow-ups

Observations, not failures; no item failed and no todo was created.

1. After a wrap, Mac Steam's UI can believe it is offline while the CM is Logged On and Friends works: at about 08:24 the Steam menu offered "Go Online" and the operator's click logged a "go online" UI request with no CONNLOG change. steamui_login shows "Ignoring success response due to current state" after every wrap's goonline.
2. Mac Steam ignores Go Offline (the URL and its own menu) while a game is running, so the guided dialog asks for something impossible until the game quits. The dialog copy should say to quit the game first.
3. `steam://open/gooffline` brings Mac Steam to the foreground (focus steal). This caused item 10's VOID attempt.
4. `runThenGoOnline` (macSteamOffline.ts, about line 500) clears the owed marker right after firing goonline via `shell.openExternal`, without confirming Steam came back. Not observed to fail in this run.
5. A no-logon Refresh path (research option B1, MobileApp token plus Web API GetOwnedGames) was considered and explicitly declined for now; to be reassessed after use.

The session directory is left in place for the operator to remove once satisfied.

## Run record — 2026-10-28 (plan 54-11), post-review-fix re-run of items 5-13

Result: all 13 items of 54-UAT.md pass in the final state. Items 5-13 were re-run on the build that includes the code-review fixes (CR-01 and WR-01..WR-09, commits `84c2a046e`..`9135c2c50`, report `0c19eabdd`). Items 1-4 were not re-run; they exercise the launch, browse and Play paths the review fixes did not touch. Evidence stayed in `/tmp/gamelib-gate-rerun-20261027T205952Z/` (not committed); this record carries counts, state words and timestamps only. Item 11 FAILED on the first post-fix build, was fixed in `95a89d8d3`, and passed on the rebuilt sidecar.

### Builds

| Build | HEAD | Sidecar rebuilt | Used for |
|-------|------|-----------------|----------|
| A: review fixes | `20c1fe9d5` (contains `84c2a046e`..`9135c2c50`) | 10:02:50 | items 5-9, item 10 attempts 1-2, item 11 first run (FAIL) |
| B: mid-connect logon fix | `95a89d8d3` (debug session `eb445bd56`) | 10:38:05 | item 10 repeat, item 11 retry, items 12-13 |

### Scores

Launch ordinals count GameLib launches in this session, 1-9.

| Item | Launch | Result | Key counts / timestamps |
|------|--------|--------|-------------------------|
| 5 | 1 | pass | wrap=toggled 10:03:39, 1 user-initiated logoff, 1 `processing complete`, `Logged On` and `go-offline wrap: Mac Steam back online, marker cleared` 10:03:44, authenticated idle close 10:04:46; N=385 unchanged; operator: Friends dropped and came back, status works, Steam menu says Go Offline |
| 6 | 1 | pass | install of Avadon 2 (233310): `reason=user-install` wrap=toggled 10:05:48, marker cleared 10:05:53, installed 10:06:16, authenticated idle close 10:07:19 (install finished earlier); operator Friends ok |
| 7 | 1 | pass | `Mac Steam state=Logged Off, no toggle needed` and `wrap=already-offline` 10:09:10, 0 `wrap=toggled`; connection_log slice 0 `user initiated logoff`, 0 `processing complete`; Steam restored online by the operator afterwards. An Epic 504 Gateway Timeout appeared in this Refresh; an Epic server error, not a Phase 54 issue |
| 8a | 1 | pass | Refresh with Wazhack running: gooffline 10:11:56, no user-initiated logoff within 5000 ms, `CM logon skipped` 10:12:01, 0 authenticated logons; dialog copy now tells the user to quit the game first (WR-06, operator-confirmed); Cancel left Steam online; marker kept as toggled-unconfirmed |
| 8b | 1 | pass | CR-01: Isaac (113200), platform Windows, install 10:15:47 -> dialog (logon skipped 10:15:52); operator quit the game, Go Offline 10:16:31, Continue -> `wrap=guided-restore` 10:16:35, goonline 10:16:38, marker cleared 10:16:39; install logged `source bottle` and `persisted forced Windows-via-bottle verdict` 10:16:49, so the forced-Windows verdict survives the guided Continue |
| 9 | 1 | pass | Cmd+Q 10:18:31; shell and sidecar gone in the same second |
| 10 | 2 (attempt 1, VOID), 3 (attempt 2, superseded), 5 (repeat, scored) | pass | See deviations. Repeat on build B: gooffline 10:38:52, logon 10:38:53, quit 10:38:54 during the settle, `go-offline restore trigger=shutdown` and wrap goonline 10:38:54, `Logged On` 10:38:55, no sync after quit, sidecar gone, marker absent, WantsOfflineMode count 0; operator Friends ok. Attempt 2 on build A had also passed (restore 10:22:36, Logged On 10:22:38) |
| 11 | 4 (build A, FAIL), 6 (build B, scored) | pass | First run FAIL, see below. Retry on build B: shell kill 10:40:49, the logon had already landed so the session closed `cause=disconnected`, `restore trigger=shutdown` goonline 10:40:49, `Logged On` 10:40:50, sidecar gone within 4 s, no `loggedOn` or sync after EOF over 60 s, marker absent, count 0; operator Friends ok |
| 12 | 7 (interrupt), 8 (boot) | pass | Interrupt: gooffline 10:43:37, STOP+KILL 10:43:38; at +20 s `Logged Off`, marker present, count 1, 0 processes. Boot (launch 8) restore firing goonline 10:44:32, back online and marker cleared 10:44:34, `Logged On` 10:44:34, marker absent, count 0; operator Friends ok |
| 13 | 8 (manual offline + quit), 9 (relaunch 10:46:12) | pass | 0 restore lines in both logs, 0 authenticated logons, 0 `processing complete`, last state `Logged Off`, marker absent, count 1; operator: Steam stayed offline |

New confirmation line seen after every wrap on both builds: `go-offline wrap: Mac Steam back online, marker cleared` (WR-01).

### Item 11 failure on build A, and the fix

Launch 4. The shell was killed with `kill -9` at 10:24:20 and the shutdown restore fired goonline at once (`Logged On` 10:24:22). But the CM connect was slow (7.9 s cold connect), so the kill landed mid-connect. steam-user's 5 s `_logonMsgTimeout` re-sent the logon about 6 s later, outside the wrap and while Mac Steam was online: `loggedOn` 10:24:27, an authenticated session next to a signed-in Mac Steam, exactly what Phase 54 forbids. The refresh then ran to completion (385 owned, sync complete 10:24:29). The wrap's own goonline fired at 10:24:27 and its confirm poll saw no new logon, logging `online not confirmed within 10000ms, marker kept` at 10:24:37 (a false negative; marker file was absent afterwards). The sidecar was orphaned for more than 107 s, breaking the exit contract; the orchestrator killed it per the contract. Operator: Steam online, Friends signed in.

Fix `95a89d8d3` ("stop a mid-connect Steam logon from completing after stdin EOF"), debug session `eb445bd56` (`.planning/debug/shutdown-mid-connect-logon-survives.md`): a shutdown now aborts an in-flight logon so steam-user's retry cannot complete after stdin EOF.

Honest caveat: the passing item 11 retry (launch 6) did NOT reproduce the slow mid-connect path live. The logon had already landed before the kill, so that run exercised the ordinary restore and clean-exit path only. The mid-connect abort is covered by unit tests in `95a89d8d3`, including one against the real steam-user library, not by a live pass. The live failure on build A is the only live evidence of the slow path.

### Deviations from the contract

- Item 10 attempt 1 (launch 2) VOID: the wrap had completed (online confirmed 10:19:56) before the quit at 10:20:11, so no shutdown restore line; the quit was too late. Attempt 2 (launch 3, build A) passed, then was superseded by the repeat on build B (launch 5), which is the scored run. The repeat passed first try.
- Launch numbering 1-9 (item 10: 2, 3; item 11 first run: 4; item 10 repeat: 5; item 11 retry: 6; item 12: 7, 8; item 13: 8, 9), shifted against the contract because of the extra attempts.
- Before launch 1 the shell terminal failed on a working-directory problem; environmental, no GameLib code involved.
- Item 8 was extended into 8a (game running, dialog copy, Cancel) and 8b (CR-01 via the guided Continue). The install-folder half of CR-01 could not be tested live: the operator has one Steam library, so there is no folder dropdown.
- Item 7: the operator verdict line for the offline Refresh was not logged in the session notes; the pass rests on the log and connection_log counts above.
