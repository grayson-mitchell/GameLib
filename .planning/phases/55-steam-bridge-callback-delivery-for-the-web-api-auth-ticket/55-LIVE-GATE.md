# Phase 55 Live Gate: Abiotic Factor (427410) EOS Connect login

Gate subject: Abiotic Factor 427410 launched from GameLib through the macOS native Steam bridge
(CrossOver bottle `GameLibSteamBridge-427410`).
Authored by: plan 55-06. Run by: plan 55-07. Decision D-E: the author never runs the gate.
Standing rule: strict-verified. An item counts only with HELLO in the sidecar log AND a clean
game-side Steam-init log. In-Game indicators never count. A failure never reroutes to bottled Steam.
A green test suite never closes this gate (live-gate-contract-authoring Section 4 ii).

Done-when being gated (ROADMAP): Abiotic Factor reaches an interactive main menu and its game log
shows an EOS Connect user login.

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.
Session directory: `<session>` = `/tmp/gamelib-gate-<ISO8601-UTC>/`, created once by the runner.

Paths used below:

- `GAMELOG` = `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-427410/drive_c/users/crossover/AppData/Local/AbioticFactor/Saved/Logs/AbioticFactor.log`
- `LOGDIR` = the directory holding `GAMELOG` (backups `AbioticFactor-backup-<date>.log` sit beside it)
- `SIDECAR` = `~/Library/Logs/GameLib/gamelib.log`
- Engine.ini = `<LOGDIR>/../Config/Windows/Engine.ini`

## 1. Preconditions

Each has an exact command and a positive observable.

| ID  | Precondition                                | Command                                                                                                                                                                                               | Positive observable                                                                                                           |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PC1 | Mac Steam running and signed in             | `pgrep -x steam_osx`                                                                                                                                                                                  | Non-empty before launch; confirmed in-run by helper line `INIT   SteamAPI ready (single InitFlat call, real appid=427410)`    |
| PC2 | No stale bridge helper                      | `pgrep -fl steam-bridge-helper`                                                                                                                                                                       | Empty                                                                                                                         |
| PC3 | Fresh build                                 | `pnpm gen-vtables && pnpm build-steam-bridge`; then `stat -f %z public/bin/arm64/darwin/steam_api64.dll public/bin/arm64/darwin/steam-bridge-helper`                                                  | Exit 0; both sizes recorded (55-05 recorded 500736 and 156368 at 2026-10-26 12:03; record the new values)                     |
| PC4 | Session dir with archived prior sidecar log | `mkdir -p <session> && cp ~/Library/Logs/GameLib/gamelib.log <session>/pre-session-gamelib.log; cp ~/Library/Logs/GameLib/gamelib.log.old <session>/pre-session-gamelib.log.old`                      | `ls -la <session>` shows both copies (a missing source is recorded, not an error)                                             |
| PC5 | Baseline copies of every game log           | `mkdir -p <session>/baseline && cp "$LOGDIR"/*.log <session>/baseline/`; then for each file `grep -cE 'LogEOS[A-Za-z]*:.*Connect' <file>`                                                             | Per-file counts recorded; the two VERBOSE baselines named: `AbioticFactor-backup-2026.10.25-21.26.23.log` and `AbioticFactor.log` (the 10:30 NZDT run), both copied BEFORE launch |
| PC6 | Verbose Engine.ini                          | Write Engine.ini with `[Core.Log]` and `LogEOSSDK=Verbose`, `LogEOS=Verbose`, `LogEOSSubsystem=Verbose`, `LogOnline=Verbose`, `LogOnlineIdentity=Verbose`, `LogOnlineSession=Verbose`, `LogHttp=Verbose`; then `cat` it | Content echoed into the transcript, seven categories present                                                                  |
| PC7 | Exactly one fresh dev app                   | Restart dev AFTER PC4's archive (the restart renames gamelib.log to .old), under `tee -a <session>/terminal.log`; `pgrep -f 'target/debug/gamelib-shell' \| wc -l`; `stat -f %m build/main/sidecar.js`; `git log -1 --format=%ct --grep='feat(55-03)'` | Count is 1 and PID recorded; sidecar.js mtime greater than the 55-03 feat commit time (memory: tauri dev does not rebuild the sidecar) |
| PC8 | Diagnostic trace patch not applied          | `git status --short native/steam-bridge/generated`                                                                                                                                                    | Empty                                                                                                                         |

## 2. Launch procedure (one launch, ordinal 1)

1. Write the delimiter (exact text) into the transcript:
   `echo "=== GATE LAUNCH 1 — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session>/terminal.log`
2. Dev runs under `tee -a <session>/terminal.log`. Never a bare `tee`, never a `>` redirect.
   The runner finds each launch boundary with `grep -n '^=== GATE LAUNCH' <session>/terminal.log`.
3. The operator clicks Play on the Abiotic Factor card in GameLib, waits until the main menu is
   interactive or 5 minutes pass, then quits the game from its menu.
4. THEN, before any further dev restart or launch:
   `cp ~/Library/Logs/GameLib/gamelib.log <session>/gamelib-launch-1.log` and
   `cp "$GAMELOG" <session>/AbioticFactor-launch-1.log`. Record the bottle steam_api64.dll size.

Raw captures stay in `<session>` and are never committed. UAT results quote only the scored literals.
The helper never logs ticket bytes (55-03 pins), so captures hold no credential.

## 3. Scored items

Every item covers launch ordinal 1. Its sink file is named.

Item 1, bridge attach (strict-verified: HELLO plus a clean game-side Steam-init log):

- 1a: `gamelib-launch-1.log` contains a `HELLO` line with `shim attached appid=427410`.
- 1b: the bottle steam_api64.dll size equals the PC3 built size.
- 1c: `AbioticFactor-launch-1.log` contains `LogOnline: STEAM: [AppId: 427410] Client API initialized 1`
  (literal from `AbioticFactor-backup-2026.10.25-21.26.23.log`, 1 occurrence, the bridged run where init succeeded)
  AND zero of `LogSteamShared: Warning: SteamAPI failed to initialize, conditions not met.` and
  `LogOnline: Warning: STEAM: Steam API failed to initialize!` (both from
  `AbioticFactor-backup-2026.10.23-21.35.54.log`, 261 occurrences each; re-confirmed with `grep -c` at authoring time).
- Item 1 passes only if 1a, 1b and 1c all hold. HELLO alone, or an In-Game indicator, never passes it.

Item 2, forward reached: `gamelib-launch-1.log` contains a `CALL` line `SteamUser023.GetAuthTicketForWebApi`.

Item 3, helper queued 168: `gamelib-launch-1.log` contains a `CBQ` line `queued iCallback=168 result=1 cub=2572`
(result 1 is k_EResultOK), and an `INIT` line `manual dispatch ready`. Any other result value is an issue, with the value recorded.

Item 4, EOS Connect user login: `AbioticFactor-launch-1.log` contains at least one line matching `LogEOS[A-Za-z]*:`
that names Connect and a login success, and the same literal (timestamps stripped) appears in neither VERBOSE
baseline from PC5. The exact literal is unknown until observed; 55-07 pins it into this contract and into
55-UAT.md after the first run. The client-credentials `ConnectClientAuthTask Success` line already present in the
verbose baselines does NOT count.

Item 5, retry loop gone: `AbioticFactor-launch-1.log` does not contain three consecutive
`LogOnlineIdentity: STEAM: Obtained steam authticket` lines with gaps of 8 to 12 s each.

Item 6, operator: the main menu is interactive (the Loading indicator is gone and menu buttons take focus and
clicks). The only judgement a log cannot make.

Verdict: PASS only if items 1 to 6 all pass.

## 4. Fallback branches (record, never silently widen scope)

- F1: item 2 absent. Stale shim or deploy failure. The launch is NOT scorable. Fix deploy and re-run as launch 2 with the same capture rules.
- F2: items 1 and 2 pass but no CBQ line. Callback 168 never reached the helper (RESEARCH assumption A2 false). Verdict FAIL-mechanism. Record the INIT manual-dispatch line state. 55-07 files a todo (severity major, platform macos, ready code) for the helper-side fallback (fake CCallbackBase registered in the dylib, RESEARCH alternatives table); not built in this phase.
- F3: CBQ present but items 4 or 6 fail. Either the shim dispatch is wrong (A5) or a further blocker exists (A3). Record the last 40 game-log lines. The trace patch (`.planning/debug/abiotic-factor-loading-hang.trace.patch`) may be applied only AFTER the gate verdict is recorded, as diagnosis. 55-07 files a todo.
- F4: game crash in or after RunCallbacks. Slot or offset wrong (A5). Record crash evidence. Todo.

## 5. Structural Reachability Review

Columns: item/sub-check/precondition, surface it names, what it asks for, verdict, evidence. The verdict cell gives
one result per test, T1 to T7 (R = REACHABLE, N/A with reason, C = CONDITIONAL). Evidence is a current file:line
(grepped at authoring time, 2026-10-26) or a command.

| Item                      | Surface                                  | Asks for                                             | Verdict (Test 1 to Test 7)                                                                                                                              | Evidence                                                                                                                                                          |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PC1 Steam signed in       | external process steam_osx               | running, signed in                                   | T1 N/A no URL; T2 N/A; T3 R (helper `INIT` line, bridge_helper.c:419, relayed to SIDECAR); T4 N/A; T5 R; T6 R positive observable is the INIT ready line, not app state; T7 N/A | `pgrep -x steam_osx`; bridge_helper.c:419                                                                                                                         |
| PC2 no stale helper       | process table                            | empty pgrep                                          | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R positive observable is the empty pgrep output; T7 N/A                                                        | `pgrep -fl steam-bridge-helper`                                                                                                                                   |
| PC3 fresh build           | build tooling                            | exit 0, sizes                                        | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 N/A; T7 N/A                                                                                                    | `pnpm build-steam-bridge`; 55-05-SUMMARY.md lists the artifacts                                                                                                   |
| PC4 session archive       | SIDECAR and .old                         | copies in session dir                                | T1 N/A; T2 N/A; T3 R reads SIDECAR; T4 N/A; T5 C flagged pair 1 (archive must precede dev restart); T6 N/A; T7 N/A                                      | `src/backend/logger/log_writer.ts:146` `renameSync(this.logFilePath, this.oldLogFilePath)`                                                                        |
| PC5 baselines             | LOGDIR                                   | copies and per-file Connect counts                   | T1 N/A; T2 N/A; T3 R reads game log; T4 R presence-case comparison needs the copies; T5 C flagged pair 2 (copy precedes launch); T6 R positive observable is the recorded counts; T7 N/A | `ls "$LOGDIR"` shows backups 2026.10.23-21.35.54 to 2026.10.25-21.26.23 plus AbioticFactor.log                                                                    |
| PC6 Engine.ini            | game config                              | seven Verbose categories                             | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 C flagged pair 3 (changes game verbosity vs baselines); T6 R Engine.ini confirmed absent 2026-10-26 (`ls <LOGDIR>/../Config/Windows`), so the write is a known mutation; T7 N/A | `ls "$LOGDIR/../Config/Windows/"` listed only GameUserSettings.ini and Settings.ini                                                                               |
| PC7 one fresh dev app     | dev app, sidecar.js                      | single PID, sidecar newer than 55-03                 | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 C flagged pair 1; T6 R already-running instance checked by pgrep count 1; T7 N/A (operator starts dev from a shell)  | `pgrep -f 'target/debug/gamelib-shell'`; `stat -f %m build/main/sidecar.js`; protocol.ts changed by 55-03 (55-03-SUMMARY.md)                                      |
| PC8 no trace patch        | generated shim sources                   | empty git status                                     | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 N/A; T7 N/A                                                                                                    | `git status --short native/steam-bridge/generated`                                                                                                                |
| Item 1a HELLO             | helper stderr to SIDECAR                 | HELLO `shim attached appid=427410` in launch-1 copy  | T1 N/A; T2 N/A; T3 R emitter bridge_helper.c:592 `logts("HELLO", msg)`; relay helperProcess.ts:362 `logWarning("bridge helper [<appId>]: <line>")`; sink SIDECAR; line can never appear in terminal.log; T4 N/A presence assertion; T5 R; T6 N/A; T7 N/A | bridge_helper.c:248 logts format `[ts] CAT msg` on stderr; helperProcess.ts:356/362; `grep 'HELLO' <session>/gamelib-launch-1.log`                                   |
| Item 1b shim size         | bottle file                              | size equals built size                               | T1 N/A; T2 N/A; T3 N/A no log line; T4 N/A; T5 R; T6 R positive observable is the size comparison; T7 N/A                                               | `stat -f %z` on bottle and `public/bin/arm64/darwin/steam_api64.dll`; placeShimForGame shimGenerate.ts:371 redeploys on byte mismatch                              |
| Item 1c game init         | LOGDIR file                              | success line present, two failure lines absent       | T1 N/A; T2 N/A; T3 R literals taken from real game logs; sink is the copied game log, which the capture reads; T4 R failure lines logged 261 times in the failing baseline, so presence would show; T5 C flagged pair 2; T6 N/A; T7 N/A | `grep -c "Client API initialized 1" AbioticFactor-backup-2026.10.25-21.26.23.log` gave 1; `grep -c "SteamAPI failed to initialize, conditions not met" AbioticFactor-backup-2026.10.23-21.35.54.log` gave 261; `grep -c "Steam API failed to initialize!"` gave 261 |
| Item 2 forward            | helper stderr to SIDECAR                 | `CALL` line for GetAuthTicketForWebApi               | T1 N/A; T2 N/A; T3 R emitter bridge_helper.c:747 `logts("CALL", bd_call_name(ci))`, relay helperProcess.ts:362, sink SIDECAR, never terminal.log; T4 N/A; T5 R; T6 N/A; T7 N/A | bridge_helper.c:747; helperProcess.ts:362; `grep CALL <session>/gamelib-launch-1.log`                                                                            |
| Item 3 CBQ and INIT       | helper stderr to SIDECAR                 | `CBQ queued iCallback=168 result=1 cub=2572`, `manual dispatch ready` | T1 N/A; T2 N/A; T3 R emitters bridge_helper.c:453 (queued), :457 (dropped), :406 (INIT manual dispatch ready); relay helperProcess.ts:362; sink SIDECAR; never terminal.log; T4 N/A; T5 R; T6 N/A; T7 N/A | bridge_helper.c:406, :453, :457; helperProcess.ts:362; `grep -E 'CBQ|manual dispatch' <session>/gamelib-launch-1.log`                                              |
| Item 4 EOS Connect login  | game log                                 | new LogEOS Connect login-success line, not in verbose baselines | T1 N/A; T2 N/A; T3 R sink is the game log copy; emitter is UE LogEOS under the Verbose Engine.ini (PC6); exact literal pinned after run 1; T4 R presence case observable under Verbose (baselines show ConnectClientAuthTask lines), so absence in baselines is meaningful only against the two VERBOSE baselines; T5 C flagged pair 3; T6 C EOS may need a first-time account link or cached product user, the run records which happened; T7 N/A | `grep -cE 'LogEOS[A-Za-z]*:.*Connect' <file>` per baseline (PC5); .planning/debug/abiotic-factor-loading-hang.md line 70                                           |
| Item 5 retry loop gone    | game log                                 | no three consecutive authticket lines 8 to 12 s apart | T1 N/A; T2 N/A; T3 R literal `LogOnlineIdentity: STEAM: Obtained steam authticket` in game logs; T4 R presence case observable: verbose baseline AbioticFactor.log has the pair at 21.30.49 and 21.30.59 (10 s apart), lines 876 and 878; T5 C flagged pair 2 (score only the current file); T6 N/A; T7 N/A | `grep -n "Obtained steam authticket" AbioticFactor.log` gave lines 876 and 878; .planning/debug/abiotic-factor-loading-hang.md line 77                                |
| Item 6 operator menu      | operator, game window                    | interactive main menu                                | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 N/A; T7 R operator observes and clicks the game window, a judgement no log makes                                | Gesture in launch step 3                                                                                                                                          |
| Launch gesture            | GameLib library card Play button         | click Play on the Abiotic Factor card                | T1 N/A; T2 N/A one gesture, no modal sheet; T3 N/A; T4 N/A; T5 C flagged pair 2; T6 N/A; T7 R button rendered and wired by the card component         | `src/frontend/screens/Library/components/GameCard/index.tsx:287` `onClick={async () => handlePlay(runner)}` with `PlayIcon` at :291                                |
| Capture instruction       | terminal.log, launch-1 copies            | `tee -a`, delimiter, per-launch copies, one instance | T1 N/A; T2 N/A; T3 R each scored line is read from the sink that carries it (SIDECAR copy or game log copy), none from terminal.log; T4 N/A; T5 R no truncation (append only, single launch); T6 R single instance asserted by pgrep count; T7 N/A | `grep -n '^=== GATE LAUNCH' <session>/terminal.log`; `pgrep -f 'target/debug/gamelib-shell'`                                                                      |

Test legend: Test 1 origin/scheme reachability (no URL is required anywhere; the launch is a local Play click).
Test 2 concurrency reachability (one gesture, no modal sheet). Test 3 emitter plus sink clause (items 1a, 2, 3 are
sidecar-relayed helper stderr, so SIDECAR only). Test 4 absence-observability (items 1c, 4, 5). Test 5
requirement-interaction pairing pass (below). Test 6 pre-existing external state (Steam session, EOS account link).
Test 7 UI-level reachability (Play button, operator menu judgement).

### Test 5 pairing pass

Reduction applied: every state-mutator against every evidence-bearing requirement (M x N, not the full cross
product). State-mutators (M = 5): PC6 Engine.ini creation, PC7 dev restart, the game launch (rotates
AbioticFactor.log), helper spawn, game quit. Evidence (N = 4): SIDECAR gamelib.log, AbioticFactor.log,
terminal.log, baseline copies. Pairs considered: 20. Pairs flagged: 3 (plus the helper spawn x SIDECAR pair,
which is the intended evidence source and not a conflict, and game quit x AbioticFactor.log, resolved by copying
after quit).

Flagged pairs and resolutions:

1. Dev restart x gamelib.log: the first write of a new sidecar renames gamelib.log to gamelib.log.old
   (`src/backend/logger/log_writer.ts:146`). Resolution: archive in PC4 before the PC7 restart, and copy
   `gamelib-launch-1.log` after the launch and before any further restart.
2. Launch x AbioticFactor.log: each launch rotates the previous file to `AbioticFactor-backup-<date>.log`.
   Resolution: baselines copied in PC5 before launch; only the CURRENT file after the run is scored for items 1c, 4, 5.
3. Engine.ini x item-4 baseline comparison: the Verbose categories change what the game logs, so a default-verbosity
   baseline cannot show a Connect line even if one happened. Resolution: compare only against the two VERBOSE
   baselines. If neither VERBOSE baseline is present at run time, item 4's absence clause becomes CONDITIONAL and that
   is recorded, not waived.

Unresolved interactions at authoring time: 0.

## 6. Closing inventory

At session end the runner records in the transcript: `ls -la <session>/` and `wc -l <session>/*`, plus the count of
structural impossibilities and unresolved interactions encountered during the run (target 0, recorded whatever it is).
