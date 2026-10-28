# Phase 56 Live Gate (re-run): Grim Dawn (219990) in DRM mode through the steamclient layer

Gate subject: Grim Dawn 219990, a SteamStub (`.bind`) title, launched from GameLib through the macOS native Steam
bridge in DRM mode (CrossOver 26.3.0.39832, component `steamclient-layer-cx26.3.0.39832`, unchanged).
Raft 648800 and Ranch Simulator 1119730 are recorded, non-blocking comparisons (Ranch also G11).
Authored by: plan 56-25 Task 1. Run by: plan 56-26, after the 56-25 Task 2 approval. Plan 56-25 Task 4 records only the
author-side preflight (PC1-PC5, PC8-PC10) in the Run record.
`56-15-LIVE-GATE.md` is the scored record of the failed first run and is not edited by this plan.
Decision D-E: the author never runs the gate. Plan 56-25 launches no game and fills no scored `result:` line.
Plan 56-26 may fill `result:` lines, the Run record, Gaps and the Verdict placeholder, and pin observed trace call names
into item 6. It may not edit the contract otherwise.
Standing rule: strict-verified per D-15/D-16. The game process's lsteamclient `create-interface` stands in for HELLO; a
game-originated call beyond init (or a clean game-log init line) proves init. Helper lines and Mac Steam In-Game never
count. A failure never reroutes to bottled Steam.
A green test suite never closes this gate (live-gate-contract-authoring Section 4 ii).

Done-when being gated (ROADMAP, Phase 56): Grim Dawn reinstalled through the bridge reaches its interactive main menu in
DRM mode with only Mac Steam running (no Windows Steam), and the game process's trace shows a game-originated Steamworks
call, with the component fetched from the published release.

## What changed since the 56-15 run (state this contract is built on)

- No component change. 56-22, 56-23 and 56-24 were closed as superseded on 2026-10-29 (operator ruling). No live
  diagnosis ran, `56-22-LIVE-DIAGNOSIS.md` does not exist, no lsteamclient component was rebuilt or re-pinned. COMPDIR,
  tag, archive URL and the lsteamclient.so pin are the 56-15 values. There is no new archive to publish (Task 3 of 56-25
  records "publish: not needed").
- Gap 7 (Grim Dawn crash) was root-caused to the launch working directory and fixed by `98837f09b` (launch from the
  install root). Gap 9 (second-launch `drm-bottle-stage` hang) was root-caused to the trailing-backslash `SteamPath` and
  fixed by `5ff2dbd8c` (`sameSteamPath`). Both are REGRESSION checks here: item 4 (menu) and G9.
- Gap 10 (notice display) closed by `509bcb01b` (`display=confirmed` ack). G10 reads that line. The 56-18 plan's
  `[dialog-display] shown` renderer line does NOT exist and is not asserted.
- Gap 2 (install route notice for a DRM title) closed by `939ed1618`. Gap 3 (stuck 'redist' status) fixed by 56-20
  (`e2592448f`). Gap 11 (Ranch routing) fixed by 56-19/56-21 (`c592ba1eb`). Live proof of those three is G2, G3, G11.
- Known residual risk (NOT a gate item): a fresh wine session's `winedevice` (winebus.so) can abort in the macOS
  GameController path and spin, hanging `wineboot --init` so a stage `reg add` times out at 15000 ms. Todo:
  `.planning/todos/pending/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md`. If a
  `drm-bottle-stage` timeout appears, the runner captures, before killing anything: the per-launch wine log
  `<TRACEDIR>/<appId>-<n>.wine.log`, the `stageDrmBottle: appId <id> bottle processes at timeout:` line, and `ps -axo pid,pcpu,command | grep -iE 'wine|winedevice'`.
  Then records it under Gaps as the winebus risk (do not patch in this run). It fails G9 only if it happens on a repeat
  launch of an already-staged bottle; a timeout on a bottle whose `registry not staged:` line shows a real mismatch is
  recorded as the residual risk, not as a G9 regression.

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.

Paths used below:

- `<session>` = `/tmp/gamelib-gate-<ISO8601-UTC>/`, created once (by 56-25 Task 4, reused by 56-26)
- `SIDECAR` = `~/Library/Logs/GameLib/gamelib.log`
- `APPDIR` = `~/Library/Application Support/GameLib`
- `TRACEDIR` = `APPDIR/steam-bridge/drm/trace`
- `COMPDIR` = `APPDIR/steam-bridge/drm/component/steamclient-layer-cx26.3.0.39832`
- `BOTTLE(<id>)` = `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<id>`
- archive URL = `https://github.com/grayson-mitchell/GameLib/releases/download/steamclient-layer-cx26.3.0.39832/steamclient-layer-cx26.3.0.39832.tar.gz`

## 1. Preconditions

| ID   | Precondition                                  | Command                                                                                                                                                                                                                                                                                                                                  | Positive observable                                                                                                                   | Run by |
| ---- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PC1  | Mac Steam running and signed in               | `pgrep -x steam_osx`                                                                                                                                                                                                                                                                                                                     | Non-empty                                                                                                                             | 56-25  |
| PC2  | No Windows Steam anywhere                     | `ps -axo pid,command \| grep -iE 'steamwebhelper\.exe\|steamservice\.exe\|Steam\\steam\.exe' \| grep -v grep`                                                                                                                                                                                                                             | Prints nothing                                                                                                                        | 56-25  |
| PC3  | CrossOver is the allowlisted build            | `defaults read /Applications/CrossOver.app/Contents/Info CFBundleVersion`                                                                                                                                                                                                                                                                | Prints `26.3.0.39832`                                                                                                                 | 56-25  |
| PC4  | Fresh build                                   | `pnpm build-steam-bridge`, `pnpm exec vite build`, `pnpm build:sidecar-sea`                                                                                                                                                                                                                                                              | All exit 0 (memory: a fresh worktree needs build prep). Measured at authoring: `build/main/sidecar.js` was 32 s OLDER than the newest `src/backend` commit, so this rebuild is mandatory | 56-25  |
| PC5  | Session dir and archived prior logs           | `mkdir -p <session>`; `cp SIDECAR <session>/pre-session-gamelib.log`; `cp SIDECAR.old <session>/pre-session-gamelib.log.old`                                                                                                                                                                                                             | `ls -la <session>` shows the copies (a missing source is recorded, not an error)                                                      | 56-25  |
| PC6  | Exactly one fresh dev app, sidecar rebuilt    | Operator restarts `pnpm tauri:dev` AFTER PC4 and PC5, under `tee -a <session>/terminal.log`. The runner waits until the GameLib window is VISIBLE (operator says so), THEN: `pgrep -f 'target/debug/gamelib-shell' \| tee <session>/pc6-pid.txt \| wc -l`; `stat -f %m build/main/sidecar.js`; `git log -1 --format=%ct -- src/backend`; `grep -c drmLaunchSetup build/main/sidecar.js`; `grep -c setupSteamClientForwarder build/main/sidecar.js` | Count is 1 and the pid file is non-empty (Gap 8: never capture before the window is up); sidecar.js mtime greater than the `src/backend` commit time; first grep at least 1; second grep 0 (memory: tauri dev does not rebuild the sidecar) | 56-26  |
| PC7  | Grim Dawn bottle absent before reinstall      | After the operator uninstalls Grim Dawn through GameLib (launch 0): `test ! -d BOTTLE(219990)`                                                                                                                                                                                                                                           | Exit 0                                                                                                                                | 56-26  |
| PC8  | First DRM launch on this Mac (COMPDIR absent) | `test ! -e COMPDIR`. If COMPDIR exists, the author moves it: `mv COMPDIR <session>/compdir-prior/` and records its mtime (COMPDIR is GameLib's cache; moving it is the only way item 1 can re-prove the fetch)                                                                                                                              | Exit 0 after the move; the moved directory and its mtime are recorded                                                                 | 56-25  |
| PC9  | Published asset reachable                     | `curl -fsSIL <archive URL>`                                                                                                                                                                                                                                                                                                              | HTTP 200 at the end of the redirects                                                                                                  | 56-25  |
| PC10 | Raft and Ranch bottles present                | `ls BOTTLE(648800)/drive_c/Program\ Files\ \(x86\)/Steam/steamapps/appmanifest_648800.acf`; the same for 1119730                                                                                                                                                                                                                         | Both manifests exist                                                                                                                  | 56-25  |
| PC11 | Grim Dawn not installed anywhere else (Gap 1) | `test ! -e ~/Library/Application\ Support/Steam/steamapps/appmanifest_219990.acf`; `find ~/Library/Application\ Support/CrossOver/Bottles -path '*/drive_c/*' -name appmanifest_219990.acf -not -path '*/GameLibSteamBridge-219990/*'`                                                                                                  | The `test` exits 0 and the `find` prints nothing. 56-16 found a Mac Steam copy and an old `GameLibGate52GD` bottle; either one makes the library card show Play and blocks the reinstall gesture | 56-26  |

PC1-PC5, PC8-PC10 are run and recorded by 56-25 Task 4. PC6, PC7, PC11 are run by 56-26 (they need the operator's dev
start and uninstall). PC7 and PC11 run after the operator's uninstall and before the reinstall.

## 2. Launch procedure

Launch ordinals (Grim Dawn is launched three times and Raft three times so that G9 can observe launches 2 and 3 in the
same bottle in one dev session; this is a deliberate extension of the 56-25 plan text, recorded in the SUMMARY):

- launch 0: not a game launch. The operator uninstalls Grim Dawn through GameLib (library card, Uninstall), PC7 and PC11
  are read, then the operator reinstalls it through the bridge (card Install; item 2, G2, G3). Delimiter
  `=== GATE LAUNCH 0 ...` is written before the uninstall click.
- launch 1: Grim Dawn (219990), first Play after the reinstall (items 1, 3-7, G3)
- launch 2: Grim Dawn again (G9)
- launch 3: Grim Dawn again (G9)
- launch 4: Raft (648800), first (item 8)
- launch 5: Raft again (G9)
- launch 6: Raft again (G9)
- launch 7: Ranch Simulator (1119730) (item 9, G11)
- launch 8: Grim Dawn with the HKLM diagnostic, only if Grim Dawn failed launch 1 on item 4, 5 or 6 (item 11)

Before each launch (including launch 0):

1. Assert one app instance: `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 and the PID equals PC6's. Any other
   count aborts the launch (its evidence is not scorable).
2. Write the delimiter (exact text) into the transcript, for EVERY launch including Ranch's:
   `echo "=== GATE LAUNCH <N> — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session>/terminal.log`
   Dev runs under `tee -a <session>/terminal.log`. Never a bare `tee`, never a `>` redirect. Boundaries are found with
   `grep -n '^=== GATE LAUNCH' <session>/terminal.log`. A launch with no delimiter is aligned by timestamp and recorded as such.
3. Record the anchor count before the launch: `grep -c '\[bridge-drm\] appId=<id> mode=steamclient-layer' SIDECAR`
   into `<session>/anchors-before-launch-<N>.txt` (the sidecar log is cumulative, so a launch is scored by the delta).

At the game menu the operator pastes:
`ps -axo pid,command | grep -iE 'steamwebhelper\.exe|steamservice\.exe|steam\.exe' | grep -v grep | tee <session>/procs-launch-<N>.txt; pgrep -x steam_osx | tee -a <session>/procs-launch-<N>.txt`
Then they quit the game from its menu.

After the game exits (the trace re-log runs after exit, per 56-12) and BEFORE any further launch or dev restart:

- `cp SIDECAR <session>/gamelib-launch-<N>.log` (cumulative; score by delta against the previous copy)
- copy the newest `TRACEDIR/<appId>-*.log` to `<session>/trace-launch-<N>.log`
- copy the matching per-launch wine log `TRACEDIR/<appId>-<n>.wine.log` (path printed by the
  `SteamGame: drm launch appId <id>: wine log <path>` line) to `<session>/wine-launch-<N>.log`
- copy the bottle's `system.reg` to `<session>/system-reg-launch-<N>.reg`

Never restart dev between launches. The restart renames gamelib.log, and the census reads the live file. If dev dies or
must be restarted, copy SIDECAR first, and every later launch is scored against the new session log only.
Raw captures stay in `<session>` and are never committed. The Tests quote only literals and call names, never SteamID
values or persona names.
Closing inventory: `ls -la <session>/` and `wc -l <session>/*`, recorded in the Run record.

## 3. Scored items

Each item names its sink file and launch ordinal. The gate PASSES only when items 1-7, G3 and G9 all pass. Items 8-11, G2,
G10 and G11 never block.

- Item 1 (launch 1, sink: filesystem): COMPDIR holds exactly the six names `lsteamclient.dll`, `lsteamclient.so`, `detour-cx26.3.0.39832.bin`, `steam.exe`, `LICENSE.lsteamclient`, `NOTICE`; `shasum -a 256 COMPDIR/lsteamclient.so` equals `dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d`; `codesign -dv COMPDIR/lsteamclient.so` reports `not signed at all`. Proves a fetch only if PC8 found COMPDIR absent (after the author's move) and the launch-1 log shows `component=download`.
- Item 2 (launch 0 reinstall, sink: filesystem): after the reinstall, `BOTTLE(219990)` exists and its `appmanifest_219990.acf` has `"StateFlags" "4"`.
- Item 3 (launch 1, sink: `gamelib-launch-1.log`): exactly one `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` line (delta against `anchors-before-launch-1.txt`) and zero `[bridge-notice] appId=219990 reason=drm-` lines. A notice line fails the item and names the step.
- Item 4 (launch 1, sink: operator plus `procs-launch-1.txt`): the main menu is interactive (REGRESSION check for Gap 7: Grim Dawn is now started from the install root); `procs-launch-1.txt` has no `steamwebhelper.exe` or `steamservice.exe` line and has a steam_osx pid. Any `steam.exe` line is the GameLib helper at `C:\Program Files (x86)\Steam\steam.exe`.
- Item 5 (launch 1, sink: `gamelib-launch-1.log`): at least one `bridge drm [219990]: [drm-trace] appId=219990 pid=<g> role=game event=create-interface` line; `<g>` equals no role=helper pid in the same file; the ifaces seen are recorded.
- Item 6 (launch 1, sinks: live `gamelib.log` via the census, and `trace-launch-1.log`): `pnpm -s bridge-census --json` filtered to appid 219990 shows evidence `verified` with an evidenceDetail starting `game call ` or equal to `game log init`. Record verbatim, in two lists, every distinct `name=` value per role from `trace-launch-1.log`. None of the counting names starts with `ISteamClient_` or matches `SetMinidumpSteamID` (a counting name list that is empty after that exclusion means the verdict rests on `game log init` only, and that is recorded). The runner pins the observed names into this item afterwards; that is the only contract edit a run task may make. Run the census BEFORE any dev restart, while SIDECAR still holds launch 1.
- Item 7 (launch 1, sinks: `system-reg-launch-1.reg`, `wine-launch-1.log`):
  - 7a (Gap 5 fix): the count of `"InstallPath"=` value lines inside a section whose header is exactly `[Software\\Valve\\Steam]` or `[Software\\Wow6432Node\\Valve\\Steam]` is 0. Command (an awk section scan, not a prefix regex; `Apps\\CommonRedist` sections and every other section never count):
    `awk '/^\[/{h=$0; sub(/\] [0-9]+$/,"]",h); insec=(h=="[Software\\\\Valve\\\\Steam]"||h=="[Software\\\\Wow6432Node\\\\Valve\\\\Steam]"); next} insec && /^"InstallPath"=/{n++} END{print n+0}' <session>/system-reg-launch-1.reg`
    The `Apps\\CommonRedist` HasRun marks written at install time are expected and recorded (count of headers beginning `[Software\\Wow6432Node\\Valve\\Steam\\Apps\\CommonRedist`), never failed.
  - 7b (CONDITIONAL, see review): zero `gamelib-steam-helper: refusing steam relaunch request` lines in `wine-launch-1.log`, scorable only if 4a shows the sink carries helper stderr; otherwise recorded as "no sink, unscored".
  - 7c: any `steamclient_init_registry unavailable` line is recorded (A8), never fails the item.
- Item 8 (launch 4, non-blocking): Raft 648800 scored as items 3-6. The result is `verified`, `reached menu (census <evidenceDetail>)`, or `failed at <step>` (a drm-<step>, an exit code, or a crash point). Also record whether the first DRM launch removed the Phase 52 leftovers: `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` prints nothing (56-09 cleanup; already confirmed once in the 56-15 run, so this is a re-check).
- Item 9 (launch 7, non-blocking): Ranch Simulator 1119730, same as item 8. Record the exit code if one is logged (the spike 040 exit-53 variant). The routing question itself is G11.
- Item 10 (launches 0-8, non-blocking): `grep -c SteamNetworkingSocketsSerialized005` over every `<session>/*-launch-*` file, recorded per file. A hit points at 56-02's omitted `serialized005.patch` / `steamworks_sdk_165x`.
- Item 11 (launch 8, conditional, non-blocking): only if item 4, 5 or 6 failed on launch 1 (D-21, once). Write the two F7 keys `HKLM\Software\Wow6432Node\Valve\Steam` and `HKLM\Software\Valve\Steam` (each value `InstallPath` REG_SZ `C:\Program Files (x86)\Steam`) with `reg add` using the 56-01 launch_form (`bin/wine` + `CX_BOTTLE`) under the clone runner; launch Grim Dawn; score items 3-6; remove the keys (Gap 12 fix): for each key run `reg delete "<key>" /v InstallPath /f`, then `reg query "<key>"`, and delete the key itself (`reg delete "<key>" /f`) ONLY if the query shows no values and no subkeys. NEVER run `reg delete` on a key whose query shows subkeys (the Wow6432Node key holds `Apps\CommonRedist`). Record the CommonRedist header count (item 7a's second awk) in the system.reg copy before the add and after the removal; the two must be equal. Re-check 7a on the live system.reg. The result is `skipped` when Grim Dawn passed. (Launch 8 does not use `drm-bottle-stage` workarounds; a stage timeout is recorded with the winebus-risk captures from the header.)
- G2 (launch 0, non-blocking, Gap 2): zero lines containing `requires a user notice before any install` and `appId 219990` in the SIDECAR copy covering the install window (after the launch-0 delimiter, before launch 1). The operator also records whether any route-notice dialog appeared during the reinstall.
- G3 (launch 0 then launch 1, BLOCKING, Gap 3): after the reinstall finishes, WITHOUT any dev restart (the PC6 pid is unchanged): the operator reports Play is enabled on the Grim Dawn card/page (not "Installing DirectX Jun2010"/redist), and clicking Play reaches the backend: the SIDECAR copy has `drm setup: appId 219990` lines and then the `[bridge-drm] appId=219990` anchor after the launch-1 delimiter. The status update itself is not logged, so the operator observation is the primary observable and the backend lines are the corroboration; the check fails if the click produces no `drm setup: appId 219990` line within 30 s, or the pid changed.
- G9 (launches 2, 3, 5, 6, BLOCKING, Gap 9): each of Grim Dawn launches 2 and 3 and Raft launches 5 and 6 (all in the same dev session and the same bottle as launch 1 / launch 4) logs one anchor (anchor delta against `anchors-before-launch-<N>.txt` is exactly 1) and the new log lines since the previous copy contain zero `reason=drm-bottle-stage`. Also record, per launch, whether `registry not staged:` appeared (it should not on a repeat launch) and whether the game reached its menu (operator).
- G10 (every launch where a notice fires, non-blocking, Gap 10): every `[bridge-notice] appId=<id> dispatched=` line has a following `[bridge-notice] appId=<id> display=confirmed elapsedMs=` line within 10 s, and no `display=unconfirmed`. N/A when no notice fires in the whole run (expected if everything passes; a notice only fires on a failure).
- G11 (launch 7, non-blocking, Gap 11): the Ranch launch logs `[bridge-drm] appId=1119730 mode=steamclient-layer` (routed to DRM mode via the UE Shipping exe) and the outcome is recorded: verified, menu reached, or failed at a step with any exit code. A missing anchor and an ordinary-bridge-path `reason=stubbed:` notice means Gap 11 stands.

Failure diagnosis hints for the runner (record, never silently widen scope):

- DLL-not-found for `lsteamclient` or the `steamclient64` family in `wine-launch-<N>.log`: 56-12 set no WINEDLLPATH (56-01 `dllpath_channel: not-needed`), but 56-01's prose says anything outside the clone, including `steamDirHost`, must go through `CX_ENV="WINEDLLPATH=<paths>"`. Record it as the cause and file a todo; do not patch in this run.
- A launch failing at `runner-clone` or with an empty trace after the game starts: the clone path contains a space (`Application Support`); record it as the cause.
- `valve-fetch`/`valve-verify` notice: record the HTTP status.
- For deeper wine tracing the dev app may be started with `GAMELIB_DRM_WINEDEBUG=<channels>` (allowlisted); this is a diagnostic aid only and is recorded if used (it changes the run, so a gate-scoring run should not use it).
- Grim Dawn failing item 4 again: first check the wine log for a missing `database.arz` (the Gap 7 cause) before assuming a Steam-layer defect.

## 4. Structural Reachability Review

Authored 2026-10-29 by 56-25. Verdict legend: R = REACHABLE, N/A with reason, C = CONDITIONAL. The Verdict cell gives one result per test, Test 1 to Test 7. Emitters were grepped in current source on 2026-10-29 (`grep -rnF` over `src` and `native`).

### 4a. Emitter and sink table (Test 3 with the SINK clause)

| Literal | Emitter (file:line) | Sink | Captured by |
| --- | --- | --- | --- |
| `[bridge-drm] appId=... mode=steamclient-layer ...` | `formatBridgeDrmAnchor` (`steamclientLayerMode.ts:149`), built at `games.ts:3591`, logged by `logInfo(drm.anchorLine, ...)` at `games.ts:4268` | SIDECAR (`logInfo`); never terminal.log | `gamelib-launch-<N>.log` |
| `drm setup: appId <id> ready ... component=` / `stopped at <stage>` | `drmLaunchSetup.ts:380` and `:248` | SIDECAR | `gamelib-launch-<N>.log` |
| `bridge drm [<id>]: [drm-trace] ...` re-log | `relogDrmTrace` `games.ts:1018`, prefix `drmRelogPrefix` `drmTrace.ts:143`, called from `relogOnce` `games.ts:4050-4053` (invoked at `:4256`, `:4323`) | SIDECAR | `gamelib-launch-<N>.log` |
| `[drm-trace] ... event=create-interface` / `event=call name=` (raw) | `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:193` and `:248` | TRACEDIR file | `trace-launch-<N>.log` |
| `[bridge-notice] appId=... reason=drm-<step> cause=...` | `maybeNotifyDrmModeFailed` logs `formatDrmNoticeLine` at `games.ts:3480` (defined in `steamclientLayerMode.ts` near :115) | SIDECAR | `gamelib-launch-<N>.log` |
| `[bridge-notice] appId=<id> dispatched=in-app-dialog+notify dialog-frame-sent=... display=pending` | `games.ts:3517` | SIDECAR | `gamelib-launch-<N>.log` |
| `[bridge-notice] appId=<id> display=confirmed elapsedMs=` / `display=unconfirmed timeout=` | `games.ts:3505` / `:3506` (callback of `trackDialogDisplay`; ack sent by `DialogHandler/index.tsx:119`) | SIDECAR | `gamelib-launch-<N>.log` |
| `[dialog-display] shown` | NO EMITTER (56-18 superseded by the ack mechanism; grep finds nothing). Not asserted anywhere in this contract | n/a | n/a |
| `SteamGame: drm launch appId <id>: wine log <path>` | `games.ts:4295` (path from `drmWineLogPathFor`, `games.ts:900`) | SIDECAR | `gamelib-launch-<N>.log` |
| `SteamGame: drm launch appId <id>: WINEDEBUG=...` | `games.ts:4195` | SIDECAR | recorded only when `GAMELIB_DRM_WINEDEBUG` is set |
| per-launch wine log file content | `createDrmWineLogAppender` `games.ts:914`, fed by `options.onOutput` at `games.ts:4313`, closed on settle | `<TRACEDIR>/<appId>-<n>.wine.log` | `wine-launch-<N>.log` |
| `stageDrmBottle: appId <id> registry not staged:` | `stageDrmBottle.ts:711` | SIDECAR | `gamelib-launch-<N>.log` |
| `stageDrmBottle: appId <id> reg add ... timed out after ... ms` | `stageDrmBottle.ts:544` (message), surfaced at `:747` | SIDECAR | `gamelib-launch-<N>.log` |
| `stageDrmBottle: appId <id> bottle processes at timeout:` | `stageDrmBottle.ts:753` | SIDECAR | `gamelib-launch-<N>.log` |
| `SteamGame: appId <id> <route> route (...) requires a user notice before any install` | `games.ts:1802` | SIDECAR (emitted before the frontend message) | `gamelib-launch-0` copy |
| final `done` status after the redist step (Gap 3) | `sendGameStatusUpdate({... status:'done'})` in the `finally` at `games.ts:2421-2425`; `backend/utils.ts:1588` | frontend message + `backendEvents`; NOT logged | operator observation of Play (see G3) |
| `gamelib-steam-helper: refusing steam relaunch request` | `native/steam-bridge/steamclient-layer/helper/steam.c:135` (`fail(...)`, exit 3) | the helper's stderr inside the Wine process | `wine-launch-<N>.log` ONLY IF Wine's stderr reaches `runWineCommand`'s `onOutput` for `wait:false` (unconfirmed, CONDITIONAL) |
| `gamelib-steam-helper: steamclient_init_registry unavailable` | `helper/steam.c:171` (`fprintf(stderr, ...)`) | same | same, CONDITIONAL |
| `"StateFlags" "4"` | appmanifest written by the depot install engine | filesystem | direct read |
| `"InstallPath"=` under `[Software\\...\\Valve\\Steam]` | the registry hive `system.reg` | filesystem | `system-reg-launch-<N>.reg` |

Consequence for item 7b: the new per-launch wine log (56-20) is the best candidate sink for the helper's stderr, but no plan has shown the helper's stderr reaches `onOutput`. 7b is CONDITIONAL: scorable only if the runner finds ANY `gamelib-steam-helper:` line, or any helper stderr text, in `wine-launch-1.log` (positive proof the sink carries helper output). With no such line the sink is unproven, the absence proves nothing (Test 4), and 7b is recorded "no sink, unscored". The structural backstop is unchanged: a refused relaunch is exit 3, the game never starts, and items 4-6 would fail.

### 4b. Item, sub-check and precondition table

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict (Test 1 to Test 7) | Evidence |
| --- | --- | --- | --- | --- |
| PC1 Mac Steam running | external process steam_osx | running | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R positive observable is a non-empty pgrep; T7 N/A | `pgrep -x steam_osx` |
| PC2 no Windows Steam | process table | empty ps grep | T1 N/A; T2 N/A; T3 N/A; T4 R falsifiable, a running Windows Steam appears in ps; T5 R; T6 R positive observable is the ps output itself; T7 N/A | ps command in Section 1 |
| PC3 CrossOver build | /Applications/CrossOver.app | `26.3.0.39832` | T1-T4 N/A; T5 R; T6 R reads the installed bundle; T7 N/A | `defaults read` |
| PC4 fresh build | build tooling | exit 0 | T1-T4 N/A; T5 C flagged pair 1 (rebuild precedes the dev restart); T6 N/A; T7 N/A | package.json scripts `build-steam-bridge`, `build:sidecar-sea`; sidecar.js measured stale at authoring |
| PC5 session archive | SIDECAR and .old | copies | T1 N/A; T2 N/A; T3 R reads SIDECAR; T4 N/A; T5 C flagged pair 1; T6 N/A; T7 N/A | `src/backend/logger/log_writer.ts:72-74` renames gamelib.log to .old on first write |
| PC6 one fresh dev app | dev app, sidecar.js | single PID, fresh sidecar | T1-T4 N/A; T5 C flagged pair 1; T6 R already-running instance checked by count 1, pid captured only after the window is visible (Gap 8); T7 N/A operator starts dev from a shell | `pgrep`, `stat -f %m build/main/sidecar.js` vs `git log -1 --format=%ct -- src/backend`, `grep -c drmLaunchSetup` |
| PC7 Grim Dawn bottle absent | filesystem | dir absent after uninstall | T1-T3 N/A; T4 R falsifiable, a present bottle fails `test ! -d`; T5 C flagged pair 3 (uninstall x PC7, reinstall x PC7); T6 R positive observable is item 2's new manifest after the reinstall; T7 R uninstall gesture in 4f | `test ! -d` |
| PC8 COMPDIR absent | COMPDIR | absent after the author's move | T1-T4 N/A; T5 C flagged pair 4; T6 R a moved prior COMPDIR is recorded with mtime, so item 1 proves the fetch; T7 N/A | `test ! -e COMPDIR`, `mv` to `<session>/compdir-prior/` |
| PC9 asset reachable | GitHub releases CDN | HTTP 200 | T1 R https URL; T2-T4 N/A; T5 R; T6 R positive observable is the 200; T7 N/A | `curl -fsSIL` |
| PC10 Raft/Ranch bottles | filesystem | manifests exist | T1-T4 N/A; T5 R; T6 R positive observable is the manifest file; T7 N/A | manifest paths in Section 1 |
| PC11 Grim Dawn not elsewhere (Gap 1) | Mac Steam steamapps, all CrossOver bottles | manifest absent everywhere except the target | T1-T3 N/A; T4 R falsifiable, a found manifest prints a path; T5 C flagged pair 3; T6 R this PC IS the external-state check for the Gap 1 premise; positive observable is item 2's manifest and the card showing Install, not Play; T7 R card state in 4f | `test ! -e`, `find ... -name appmanifest_219990.acf` |
| Item 1 component fetched | COMPDIR, codesign | six names, pinned sha, unsigned | T1 R fetched over https; T2 N/A; T3 R filesystem sink read directly; T4 N/A presence assertion; T5 C flagged pair 4; T6 C depends on PC8 and on the network reaching github.com and Valve's CDN; T7 N/A | catalogue pin in `src/common/steamclientLayerCatalogue.ts`; unchanged by 56-24 |
| Item 2 reinstall | bottle manifest | StateFlags 4 | T1 N/A; T2 N/A; T3 N/A filesystem; T4 N/A; T5 C flagged pair 3; T6 C depends on Grim Dawn being owned by the signed-in account and on the native-install setting (see 4f); T7 see 4f | `appmanifest_219990.acf` |
| Item 3 anchor, zero notices | SIDECAR | one anchor (delta), zero notices | T1 N/A; T2 N/A; T3 R emitters in 4a, sink SIDECAR copy; T4 R the notice path logs on every step failure (`games.ts:3480`), so a failure would show; T5 C flagged pair 2 (cumulative copy: score by delta); T6 N/A; T7 N/A | 4a rows 1 and 5 |
| Item 4 menu, only Mac Steam | operator, ps output | interactive menu, process list | T1-T3 N/A; T4 R falsifiable (Windows Steam processes appear in ps); T5 R; T6 R positive observable is the steam_osx pid in the same file; T7 R operator observes the game window, a judgement no log makes | procs-launch-1.txt |
| Item 5 game attach | SIDECAR re-log | role=game create-interface, pid not a helper pid | T1-T2 N/A; T3 R emitter `steamclient_main.c:193`, relay `games.ts:1018`, sink SIDECAR; the re-log runs after the game exits so the copy must be taken after exit; T4 N/A presence assertion; T5 C flagged pair 2; T6-T7 N/A | 4a rows 3 and 4 |
| Item 6 census verified | census over live SIDECAR, raw trace | verified, call name lists | T1-T2 N/A; T3 R emitter `steamclient_main.c:248`, census `classifyBridgeEvidence` DRM branch in `meta/bridgeCensus.ts`, sink SIDECAR plus TRACEDIR; T4 N/A; T5 C flagged pair 1 (census reads the live file, no restart before it); T6 C needs launch 1 still in the live SIDECAR; T7 N/A | `pnpm -s bridge-census --json`; counting-call rule in 56-05-SUMMARY.md |
| Item 7a no InstallPath under bare Valve\Steam keys | bottle system.reg | awk section count 0 | T1-T3 N/A filesystem; T4 R falsifiable, an `InstallPath` written into either bare key appears in the awk count (the awk was run against a synthetic hive on 2026-10-29: it counted the Wow6432Node and bare key InstallPath values, 2, and ignored a CommonRedist section and an unrelated section); T5 C flagged pair 5; T6 R the bottle is new (PC7), so no stale key; T7 N/A | awk command in item 7a |
| Item 7b no relaunch refusal | helper stderr via wine log | zero refusal lines | T1-T2 N/A; T3 C sink unproven (4a); T4 C absence in an unproven sink proves nothing; backstop is items 4-6; T5 C flagged pair 6; T6-T7 N/A | helper/steam.c:135; games.ts:4313 `onOutput`. Scorable once any helper stderr line is seen in the wine log |
| Item 7c init_registry line | helper stderr | recorded if present | T3 C same sink gap; recording only, never fails the item | helper/steam.c:171 |
| Item 8 Raft | as items 3-6 | recorded | T1-T4 as items 3-6; T5 C flagged pair 2; T6 C the Raft bottle holds Phase 52 leftovers (cleanup already confirmed in 56-15); T7 R launch gesture in 4f | `find ... -name gamelib_bridge.cfg` |
| Item 9 Ranch | as items 3-6 | recorded | as item 8 | spike 040 exit-53 variant |
| Item 10 networking lead | all launch captures | grep counts | T3 R reads each captured file; T4 N/A recorded count, any value; T5 R; T6-T7 N/A | 56-02-SUMMARY.md |
| Item 11 HKLM diagnostic | reg add / delete under the clone runner | conditional launch, safe removal | T3 N/A; T4 R falsifiable, equal CommonRedist counts before and after; T5 C flagged pair 5 and 7; T6 N/A; T7 N/A operator and runner drive reg from a shell | 56-01 launch_form `bin/wine+CX_BOTTLE`; Gap 12 |
| G2 route notice absent | SIDECAR install window | zero `requires a user notice` lines for 219990 | T1-T2 N/A; T3 R emitter `games.ts:1802`, sink SIDECAR; T4 R falsifiable, the line is logged BEFORE the frontend message on every notice route, so a reintroduced notice would show; T5 C flagged pair 3 (uninstall/reinstall x G2: the window is bounded by the launch-0 and launch-1 delimiters); T6 C depends on native install being ON and on the DRM scan resolving the title as DRM (the Gap 2 fix); T7 R install gesture in 4f | games.ts:1802 |
| G3 Play enabled, no restart | frontend status, SIDECAR | Play enabled; click reaches backend | T1 N/A; T2 N/A; T3 R the backend lines `drm setup: appId 219990` (`drmLaunchSetup.ts:380`) are in SIDECAR; the status update itself has no log line (4a), so the operator observation is the primary observable; T4 R falsifiable, the pre-fix state was Play disabled and no backend line; T5 C flagged pair 8 (a dev restart would mask the bug; pid check guards it); T6 R positive observable is the operator seeing Play enabled; T7 R Play gesture in 4f | `games.ts:2421-2425` |
| G9 repeat launches | SIDECAR deltas, operator | one anchor, zero bottle-stage notices | T1-T2 N/A; T3 R emitters in 4a; T4 R falsifiable, the pre-fix hang logged `reason=drm-bottle-stage` (`games.ts:3480`) and a `timed out after` line (`stageDrmBottle.ts:544`); T5 C flagged pairs 2 and 9 (cumulative copy; each launch alters bottle session state); T6 C the winebus residual risk (header): a timeout on an unstaged bottle is classed as residual risk; T7 R Play gesture | `sameSteamPath` `stageDrmBottle.ts:128` |
| G10 notice display | SIDECAR | confirmed within 10 s of dispatch | T3 R emitters `games.ts:3517`, `:3505`; T4 R falsifiable, `display=unconfirmed` is logged on timeout (`:3506`); T5 R; T6 C N/A when no notice fires (a notice fires only on a failure); T7 N/A | 56-18-SUMMARY.md |
| G11 Ranch routed to DRM | SIDECAR | anchor for 1119730 | T3 R anchor emitter `games.ts:4268`; T4 R falsifiable, pre-fix the log had the `reason=stubbed:` notice and no anchor; T5 R; T6 C Ranch bottle state; T7 R launch gesture in 4f | 56-21-SUMMARY.md |
| Launch gesture | Library card Play button | click Play on the game's card | T1 N/A; T2 N/A one gesture, no modal sheet; T3-T6 N/A; T7 R card renders and wires Play (`src/frontend/screens/Library/components/GameCard/index.tsx`, `handlePlay`) | 4f |
| Capture instruction | terminal.log, per-launch copies | `tee -a`, delimiter, per-launch copies and deltas, one instance | T1-T2 N/A; T3 R each scored line is read from the sink that carries it (SIDECAR copy, TRACEDIR copy, wine log copy, system.reg copy), none from terminal.log; T4 N/A; T5 R no truncation, append only; T6 R single instance asserted by count; T7 N/A | `grep -n '^=== GATE LAUNCH' <session>/terminal.log` |

### 4b2. Test 1 and Test 2

- Test 1 (origin/scheme): the only URLs are the https archive URL (PC9, item 1) and Valve's CDN, fetched by the sidecar. No http fixture. REACHABLE.
- Test 2 (concurrency): each launch is one Play click and a quit from the game menu; the uninstall and reinstall are one gesture each, and no second gesture is driven while a modal is up. The route-notice dialog (if G2 fails) is handled by the operator clicking through it before the next gesture. REACHABLE.

### 4c. Test 4 (absence-observability)

- Item 3's zero notices: falsifiable (`games.ts:3480` logs on every drm step failure).
- Item 7a's zero InstallPath values: falsifiable (a key written into the prefix shows in `system.reg`; the awk was exercised on a synthetic hive).
- Item 7b's zero refusal lines: NOT falsifiable until the wine log is shown to carry helper stderr. CONDITIONAL.
- G2's zero route notices: falsifiable (the line is logged before the message is sent, `games.ts:1802`).
- G9's zero `reason=drm-bottle-stage`: falsifiable (the same notice line fires on every failure; the timeout line is also logged).
- G10: a structural pairing (`dispatched` always followed by confirmed or unconfirmed, `games.ts:3505-3517`); the absence of `display=unconfirmed` is meaningful because the timeout path logs it.
- PC2: falsifiable.
- Item 4's absence of Windows Steam processes: falsifiable (ps).

### 4d. Test 5 pairing pass

Reduction applied: every state-mutating requirement {dev restart, Grim Dawn uninstall, Grim Dawn reinstall, three Grim Dawn launches and three Raft launches (each mutates the bottle's wine session and registry), HKLM add, HKLM delete, trace retention of 8 files, component fetch into COMPDIR, the author's COMPDIR move, first-DRM-launch forwarder cleanup} considered against every evidence-bearing requirement {items 1-7, G2, G3, G9, G10, G11, the census read, PC6, PC7, PC8, PC11}. 10 mutating x 16 evidence-bearing = 160 pairs considered, 9 flagged:

1. {dev restart, PC4 rebuild} x {census reading the live gamelib.log, PC5 archive, PC6 pid}: the restart renames gamelib.log to .old. Mitigated by building (PC4) and archiving (PC5) before the restart, never restarting between launches, and running the census before any restart.
2. {per-launch SIDECAR copy, cumulative log} x {items 3, 5, 8, G9}: launch N+1 appends to the same file, so each copy is cumulative. Mitigated by the pre-launch anchor-count file and scoring every anchor/notice by delta against the previous copy (item 3's "exactly one anchor" is the delta for launch 1).
3. {Grim Dawn uninstall, reinstall} x {PC7, PC11, item 2, G2}: the uninstall deliberately removes the bottle and the reinstall deliberately makes it. PC7 and PC11 are read after the uninstall and before the reinstall; item 2 after; G2's window is bounded by the launch-0 and launch-1 delimiters.
4. {component fetch, author's COMPDIR move} x {PC8, item 1}: launch 1 creates COMPDIR. PC8 is read before launch 1, item 1 after.
5. {HKLM add} x {item 7a}: item 7a is scored from launch 1's system.reg copy before any add (launch 8 only runs afterward).
6. {the wine log being created per launch} x {item 7b}: the sink exists but is unproven for helper stderr; handled by the 7b conditional rule above.
7. {HKLM delete} x {the CommonRedist marks}: a plain `reg delete /f` on the Wow6432Node key removes the CommonRedist subtree (Gap 12). Mitigated by the `/v InstallPath` removal and the equal-count check in item 11.
8. {dev restart after the reinstall} x {G3}: a restart would clear a stuck 'redist' status and mask the bug. Mitigated by the unchanged-pid check in G3 and PC6 pid recorded at the start.
9. {repeat launches 2/3/5/6} x {G9}: each launch changes the bottle's wine session; G9 is exactly the observation of that. Trace retention (8 files) cannot prune scored traces because every trace is copied right after its exit, and there are 7 game launches, so the cap is not reached for any single appId in a normal run.

### 4e. Test 6 (external state)

- Mac Steam signed in (PC1, items 4 to 6): the positive observable is the steam_osx pid in the same procs file.
- Grim Dawn present in Mac Steam or an old bottle (item 2 premise, Gap 1): covered by PC11 (a `find` over every bottle plus the Mac Steam manifest) and by the card showing Install, not Play, before the reinstall gesture.
- A pre-existing COMPDIR or Valve client cache (item 1, PC8): PC8 moves a prior COMPDIR aside and records it; a Valve client cache that survives is recorded by item 1's `component=download` line (a `component=cache` line means the fetch was not re-proved and is recorded).
- Raft and Ranch bottles with Phase 52 leftovers or a stale registry state (items 8, 9, G9, G11): recorded.
- Grim Dawn account ownership and cloud saves (item 2): the owning account must be signed in; recorded.
- The native-install setting (item 2): defaults ON (`enableSteamNativeInstall ?? true`); the runner records the value.
- A stale GameLibSteam-bottle Steam (56-16 found one): PC2 is the check, and item 4's procs file is the in-run confirmation.
- The winebus/GameController abort-spin (header): an external macOS framework condition. Not preflight-able; captured only if it happens.

### 4f. Test 7 (gesture sequence)

- Uninstall gesture (launch 0): the library card for an installed Steam title offers Uninstall through the game page or card menu in `src/frontend/screens/Library/components/GameCard/index.tsx`; the runner confirms at run time which control is rendered for Grim Dawn and records it. This is the one gesture this contract has not traced to a component with a file:line, so it is CONDITIONAL on the control being present; if it is not, the operator removes the bottle through GameLib's game page and the path is recorded.
- Reinstall gesture: on the library card for a not-installed Steam title (`!isInstalled && !isQueued && !isDelisted && runner === 'steam'`) the click path calls `openInstallGameModal` (`GameCard/index.tsx:700-704`), which short-circuits `runner === 'steam' && action === 'install'` to `startSteamQuickInstall` (`src/frontend/state/InstallGameModal.ts`). The backend then branches on `isSteamNativeInstallEnabled()` (`games.ts:1772`, `nativeInstallSetting.ts`), default ON. Windows-only Grim Dawn goes to `installBottleNative`. If the operator has the setting OFF the install is delegated to `steam://install` on Mac Steam and item 2 cannot pass until it is turned back ON. The runner records the setting value.
- Play gesture: click Play on the card (`GameCard/index.tsx`, `handlePlay`); for G3 the card must render Play enabled after the final `done` status. One gesture, no modal sheet.
- Menu gesture: the operator plays to the game's main menu, pastes the ps command, then quits from the game menu.

## 5. Tests

### 1. Component published and fetched (D-18)

expected: COMPDIR holds exactly the six names, lsteamclient.so sha256 equals dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d, codesign -dv reports `not signed at all`; proves a fetch only after PC8's move (sink: filesystem, launch 1)
result: pending

### 2. Reinstall through the bridge

expected: BOTTLE(219990) exists and appmanifest_219990.acf has `"StateFlags" "4"` after PC7 and PC11 passed (sink: filesystem, launch 0)
result: pending

### 3. DRM-mode setup completed (D-12/D-13)

expected: gamelib-launch-1.log has exactly one new `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` line (anchor delta 1) and zero `[bridge-notice] appId=219990 reason=drm-` lines (sink: SIDECAR copy, launch 1)
result: pending

### 4. Menu with only Mac Steam (D-17)

expected: operator confirms the main menu is interactive (Gap 7 regression check); procs-launch-1.txt has a steam_osx pid and no steamwebhelper.exe or steamservice.exe line (sink: operator plus procs-launch-1.txt, launch 1)
result: pending

### 5. D-15 game-process attach

expected: gamelib-launch-1.log has at least one `bridge drm [219990]: [drm-trace] appId=219990 pid=<g> role=game event=create-interface` line and <g> equals no role=helper pid (sink: SIDECAR copy, launch 1)
result: pending

### 6. D-16 game-originated call (census)

expected: `pnpm -s bridge-census --json` for appid 219990 gives evidence verified with evidenceDetail starting `game call ` or equal to `game log init`, and no counting name starts with ISteamClient_ or matches SetMinidumpSteamID; every distinct name= per role from trace-launch-1.log recorded verbatim (sinks: live SIDECAR and trace-launch-1.log, launch 1)
result: pending

### 7. D-21 no local-machine Steam InstallPath keys

expected: awk section count of `"InstallPath"=` values under `[Software\\Valve\\Steam]` and `[Software\\Wow6432Node\\Valve\\Steam]` in system-reg-launch-1.reg is 0 (CommonRedist sections excluded and their header count recorded); zero `gamelib-steam-helper: refusing steam relaunch request` lines in wine-launch-1.log (CONDITIONAL sink, unscored if the sink is unproven); any `steamclient_init_registry unavailable` line recorded (sinks: system-reg copy and wine log copy, launch 1)
result: pending

### 8. Raft 648800 (recorded, non-blocking)

expected: items 3-6 applied to launch 4 recorded as verified, reached menu (census detail) or failed at a step; `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` prints nothing (sink: SIDECAR copy and filesystem, launch 4)
result: pending

### 9. Ranch Simulator 1119730 (recorded, non-blocking)

expected: items 3-6 applied to launch 7 recorded as verified, reached menu (census detail) or failed at a step, with the logged exit code if any (sink: SIDECAR copy, launch 7)
result: pending

### 10. Networking lead (56-02)

expected: `grep -c SteamNetworkingSocketsSerialized005` over every session launch capture recorded per file (sink: all gamelib-launch-N.log, trace and wine-launch files, launches 0 to 8)
result: pending

### 11. HKLM diagnostic (D-21, conditional)

expected: only if item 4, 5 or 6 failed on launch 1: the two F7 keys added with reg add, launch 8 scored as items 3-6, each key's InstallPath value removed with `reg delete <key> /v InstallPath /f`, a key deleted only if `reg query` shows it empty, CommonRedist header counts equal before and after; otherwise skipped (sinks: SIDECAR copy and system-reg copy, launch 8)
result: pending

### 12. G2 route notice absent for the DRM title (Gap 2, non-blocking)

expected: zero SIDECAR lines containing `requires a user notice before any install` for appId 219990 between the launch-0 and launch-1 delimiters; operator records whether a route-notice dialog appeared (sink: SIDECAR copy, launch 0)
result: pending

### 13. G3 Play enabled after install, no restart (Gap 3, BLOCKING)

expected: after the reinstall finishes with the dev app pid unchanged, the operator sees Play enabled (not stuck on redist) and the click is followed by `drm setup: appId 219990` lines and the `[bridge-drm] appId=219990` anchor within 30 s (sinks: operator and SIDECAR copy, launch 0 then launch 1)
result: pending

### 14. G9 repeat DRM launches pass bottle-stage (Gap 9, BLOCKING)

expected: Grim Dawn launches 2 and 3 and Raft launches 5 and 6 each log exactly one new anchor and zero `reason=drm-bottle-stage` lines since the previous copy; `registry not staged:` presence and menu reached recorded per launch (sinks: SIDECAR copies by delta and operator, launches 2, 3, 5, 6)
result: pending

### 15. G10 notice display confirmed (Gap 10, non-blocking)

expected: every `[bridge-notice] appId=<id> dispatched=` line has a `[bridge-notice] appId=<id> display=confirmed elapsedMs=` line within 10 s and no `display=unconfirmed`; N/A when no notice fires (sink: SIDECAR copy, any launch)
result: pending

### 16. G11 Ranch routed to DRM mode (Gap 11, non-blocking)

expected: the Ranch launch logs `[bridge-drm] appId=1119730 mode=steamclient-layer` and its outcome is recorded (sink: SIDECAR copy, launch 7)
result: pending

## Run record

## Gaps

## Verdict

Verdict: pending
