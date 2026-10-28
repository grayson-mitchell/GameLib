# Phase 56 Live Gate: Grim Dawn (219990) in DRM mode through the steamclient layer

Gate subject: Grim Dawn 219990, a SteamStub (`.bind`) title, launched from GameLib through the macOS
native Steam bridge in DRM mode (CrossOver 26.3.0.39832, component `steamclient-layer-cx26.3.0.39832`).
Raft 648800 and Ranch Simulator 1119730 are recorded, non-blocking comparisons.
Authored by: plan 56-15 Task 2. Run by: plan 56-16, after the 56-15 Task 3 approval. Plan 56-15 Task 4
records only the publish and the PC1-PC5, PC7-PC10 preflight in the Run record.
Decision D-E: the author never runs the gate. Plan 56-15 launches no game and fills no scored `result:` line.
Plan 56-16 may fill `result:` lines, the Run record, Gaps and the Verdict placeholder, and pin the observed trace
call names into item 6. It may not edit the contract otherwise.
Standing rule: strict-verified per D-15/D-16. The game process's lsteamclient `create-interface` stands in for
HELLO; a game-originated call beyond init (or a clean game-log init line) proves init. Helper lines and Mac Steam
In-Game never count. A failure never reroutes to bottled Steam.
A green test suite never closes this gate (live-gate-contract-authoring Section 4 ii).

Done-when being gated (ROADMAP, Phase 56): Grim Dawn reinstalled through the bridge reaches its interactive main
menu in DRM mode with only Mac Steam running (no Windows Steam), and the game process's trace shows a
game-originated Steamworks call, with the component fetched from the published release.

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.

Paths used below:

- `<session>` = `/tmp/gamelib-gate-<ISO8601-UTC>/`, created once (by 56-15 Task 4, reused by 56-16)
- `SIDECAR` = `~/Library/Logs/GameLib/gamelib.log`
- `APPDIR` = `~/Library/Application Support/GameLib`
- `TRACEDIR` = `APPDIR/steam-bridge/drm/trace`
- `COMPDIR` = `APPDIR/steam-bridge/drm/component/steamclient-layer-cx26.3.0.39832`
- `BOTTLE(<id>)` = `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<id>`
- archive URL = `https://github.com/grayson-mitchell/GameLib/releases/download/steamclient-layer-cx26.3.0.39832/steamclient-layer-cx26.3.0.39832.tar.gz`

## 1. Preconditions

| ID   | Precondition                                  | Command                                                                                                                                                                                                                                                                                              | Positive observable                                                                                                  |
| ---- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| PC1  | Mac Steam running and signed in               | `pgrep -x steam_osx`                                                                                                                                                                                                                                                                                 | Non-empty                                                                                                            |
| PC2  | No Windows Steam anywhere                     | `ps -axo pid,command \| grep -iE 'steamwebhelper\.exe\|steamservice\.exe\|Steam\\steam\.exe' \| grep -v grep`                                                                                                                                                                                         | Prints nothing                                                                                                       |
| PC3  | CrossOver is the allowlisted build            | `defaults read /Applications/CrossOver.app/Contents/Info CFBundleVersion`                                                                                                                                                                                                                            | Prints `26.3.0.39832`                                                                                                |
| PC4  | Fresh build                                   | `pnpm build-steam-bridge`, `pnpm exec vite build`, `pnpm build:sidecar-sea`                                                                                                                                                                                                                          | All exit 0 (memory: a fresh worktree needs build prep)                                                               |
| PC5  | Session dir and archived prior logs           | `mkdir -p <session>`; `cp SIDECAR <session>/pre-session-gamelib.log`; `cp SIDECAR.old <session>/pre-session-gamelib.log.old`                                                                                                                                                                         | `ls -la <session>` shows the copies (a missing source is recorded, not an error)                                     |
| PC6  | Exactly one fresh dev app                     | Operator restarts `pnpm tauri:dev` AFTER PC5, under `tee -a <session>/terminal.log`; `pgrep -f 'target/debug/gamelib-shell' \| wc -l`; `stat -f %m build/main/sidecar.js`; `git log -1 --format=%ct -- src/backend/storeManagers/steam/games.ts`; `grep -c drmLaunchSetup build/main/sidecar.js`; `grep -c setupSteamClientForwarder build/main/sidecar.js` | Count is 1 and PID recorded; sidecar.js mtime greater than the games.ts commit time; first grep at least 1; second grep 0 (memory: tauri dev does not rebuild the sidecar) |
| PC7  | Grim Dawn bottle absent before reinstall      | `test ! -d BOTTLE(219990)`                                                                                                                                                                                                                                                                           | Exit 0                                                                                                               |
| PC8  | First DRM launch on this Mac                  | `test ! -e COMPDIR`                                                                                                                                                                                                                                                                                  | Exit 0. If COMPDIR exists, its mtime is recorded: it was not installed by this run                                   |
| PC9  | Published asset reachable                     | `curl -fsSIL <archive URL>`                                                                                                                                                                                                                                                                          | HTTP 200 at the end of the redirects                                                                                 |
| PC10 | Raft and Ranch bottles present                | `ls BOTTLE(648800)/drive_c/Program\ Files\ \(x86\)/Steam/steamapps/appmanifest_648800.acf`; the same for 1119730                                                                                                                                                                                     | Both manifests exist                                                                                                 |

PC1-PC5 and PC7-PC10 are run and recorded by 56-15 Task 4. PC6 is run by 56-16 (it needs the operator to start dev).

## 2. Launch procedure

Launch ordinals:

- launch 1: Grim Dawn (219990), reinstalled first through the bridge (item 2)
- launch 2: Raft (648800)
- launch 3: Ranch Simulator (1119730)
- launch 4: Grim Dawn with the HKLM diagnostic, only if Grim Dawn failed launch 1 on item 4, 5 or 6

Before each launch:

1. Assert one app instance: `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 and the PID equals PC6's. Any other count aborts the launch (its evidence is not scorable).
2. Write the delimiter (exact text) into the transcript:
   `echo "=== GATE LAUNCH <N> — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session>/terminal.log`
   Dev runs under `tee -a <session>/terminal.log`. Never a bare `tee`, never a `>` redirect. Boundaries are found with `grep -n '^=== GATE LAUNCH' <session>/terminal.log`.

At the game menu the operator pastes:
`ps -axo pid,command | grep -iE 'steamwebhelper\.exe|steamservice\.exe|steam\.exe' | grep -v grep | tee <session>/procs-launch-<N>.txt; pgrep -x steam_osx | tee -a <session>/procs-launch-<N>.txt`
Then they quit the game from its menu.

After the game exits (the trace re-log runs after exit, per 56-12) and BEFORE any further launch or dev restart:

- `cp SIDECAR <session>/gamelib-launch-<N>.log`
- copy the newest `TRACEDIR/<appId>-*.log` to `<session>/trace-launch-<N>.log`
- copy the bottle's `system.reg` to `<session>/system-reg-launch-<N>.reg`
- 56-12-SUMMARY.md names no wine or launch log sink for the DRM launch, so there is no file to copy as `wine-launch-<N>.log`. The runner records which file, if any, carries the wine child's stderr (the terminal transcript may, if the sidecar inherits it; this is unconfirmed) and copies it under that name. If none, it records "no wine sink".

Never restart dev between launches. The restart renames gamelib.log, and the census reads the live file.
Raw captures stay in `<session>` and are never committed. The Tests quote only literals and call names, never SteamID values or persona names.
Closing inventory: `ls -la <session>/` and `wc -l <session>/*`, recorded in the Run record.

## 3. Scored items

Each item names its sink file and launch ordinal. The gate PASSES only when items 1-7 all pass. Items 8-11 never block.

- Item 1 (launch 1, sink: filesystem): COMPDIR holds exactly the six names `lsteamclient.dll`, `lsteamclient.so`, `detour-cx26.3.0.39832.bin`, `steam.exe`, `LICENSE.lsteamclient`, `NOTICE`; `shasum -a 256 COMPDIR/lsteamclient.so` equals `dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d`; `codesign -dv COMPDIR/lsteamclient.so` reports `not signed at all`.
- Item 2 (launch 1, sink: filesystem): after the reinstall, `BOTTLE(219990)` exists and its `appmanifest_219990.acf` has `"StateFlags" "4"`.
- Item 3 (launch 1, sink: `gamelib-launch-1.log`): exactly one `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` line and zero `[bridge-notice] appId=219990 reason=drm-` lines. A notice line fails the item and names the step.
- Item 4 (launch 1, sink: operator plus `procs-launch-1.txt`): the main menu is interactive; `procs-launch-1.txt` has no `steamwebhelper.exe` or `steamservice.exe` line and has a steam_osx pid. Any `steam.exe` line is the GameLib helper at `C:\Program Files (x86)\Steam\steam.exe`.
- Item 5 (launch 1, sink: `gamelib-launch-1.log`): at least one `bridge drm [219990]: [drm-trace] appId=219990 pid=<g> role=game event=create-interface` line; `<g>` equals no role=helper pid in the same file; the ifaces seen are recorded.
- Item 6 (launch 1, sinks: live `gamelib.log` via the census, and `trace-launch-1.log`): `pnpm -s bridge-census --json` filtered to appid 219990 shows evidence `verified` with an evidenceDetail starting `game call ` or equal to `game log init`. Record verbatim, in two lists, every distinct `name=` value per role from `trace-launch-1.log`. None of the counting names starts with `ISteamClient_` or matches `SetMinidumpSteamID` (a counting name list that is empty after that exclusion means the verdict rests on `game log init` only, and that is recorded). The runner pins the observed names into this item afterwards; that is the only contract edit a run task may make. Run the census BEFORE any dev restart, while SIDECAR still holds launch 1.
- Item 7 (launch 1, sinks: `system-reg-launch-1.reg`, `gamelib-launch-1.log`, the wine sink if any): zero lines matching `^\[Software\\\\(Wow6432Node\\\\)?Valve\\\\Steam` in `system-reg-launch-1.reg` (`grep -ciE`); zero `gamelib-steam-helper: refusing steam relaunch request` lines in every wine sink found (CONDITIONAL, see review); any `steamclient_init_registry unavailable` line is recorded (A8).
- Item 8 (launch 2, non-blocking): Raft 648800 scored as items 3-6. The result is `verified`, `reached menu (census <evidenceDetail>)`, or `failed at <step>` (a drm-<step>, an exit code, or a crash point). Also record whether the first DRM launch removed the Phase 52 leftovers: `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` prints nothing (56-09 cleanup exercised live).
- Item 9 (launch 3, non-blocking): Ranch Simulator 1119730, same as item 8. Record the exit code if one is logged (the spike 040 exit-53 variant).
- Item 10 (launch 1-3, non-blocking): `grep -c SteamNetworkingSocketsSerialized005` over every `<session>/*-launch-*` file, recorded per file. A hit points at 56-02's omitted `serialized005.patch` / `steamworks_sdk_165x`.
- Item 11 (launch 4, conditional, non-blocking): only if item 4, 5 or 6 failed on launch 1. Write the two F7 keys `HKLM\Software\Wow6432Node\Valve\Steam` and `HKLM\Software\Valve\Steam` (each value `InstallPath` REG_SZ `C:\Program Files (x86)\Steam`) with `reg add` using the 56-01 launch_form (`bin/wine` + `CX_BOTTLE`) under the clone runner; launch Grim Dawn; score items 3-6; delete the keys; re-check `system.reg` as in item 7. The result is `skipped` when Grim Dawn passed.

Failure diagnosis hints for the runner (record, never silently widen scope):

- DLL-not-found for `lsteamclient` or the `steamclient64` family in any wine sink: 56-12 set no WINEDLLPATH (56-01 `dllpath_channel: not-needed`), but 56-01's prose says anything outside the clone, including `steamDirHost`, must go through `CX_ENV="WINEDLLPATH=<paths>"`. The builder supports `env`/`cx_env`. Record it as the cause and file a todo; do not patch in this run.
- A launch failing at `runner-clone` or with an empty trace after the game starts: the clone path contains a space (`Application Support`) and has never been launched from; record it as the cause.
- `valve-fetch`/`valve-verify` notice: 56-07's default axios fetchers have never hit Valve's CDN (`maxRedirects: 0`); record the HTTP status.

## 4. Structural Reachability Review

Authored 2026-10-28. Verdict legend: R = REACHABLE, N/A with reason, C = CONDITIONAL. The Verdict cell gives one result per test, Test 1 to Test 7. Emitters were grepped in current source.

### 4a. Emitter and sink table (Test 3 with the SINK clause)

| Literal                                                                              | Emitter (file:line)                                                                                                  | Sink                                                                                                | Captured by                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `[bridge-drm] appId=... mode=steamclient-layer ...`                                  | `formatBridgeDrmAnchor` logged via `logInfo` in the DRM branch of `launchBridgeGame`, `src/backend/storeManagers/steam/games.ts` (launch body from :3535; `logInfo` in `maybeNotifyDrmModeFailed` at :3396 uses the same sink) | SIDECAR (`logInfo`); never terminal.log                                                              | `gamelib-launch-1.log`                           |
| `bridge drm [<id>]: [drm-trace] ...` re-log                                          | `relogDrmTrace` games.ts:945, prefix `drmTrace.ts:145`, called from `relogOnce` games.ts:3938-3943                   | SIDECAR                                                                                             | `gamelib-launch-1.log`                           |
| `[drm-trace] ... event=create-interface` / `event=call name=` (raw)                  | `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:193` and `:248`                                | TRACEDIR file                                                                                       | `trace-launch-1.log`                             |
| `[bridge-notice] appId=... reason=drm-<step>`                                        | `maybeNotifyDrmModeFailed` games.ts:3395-3396 (`formatDrmNoticeLine`, defined in steamclientLayerMode.ts near :115)    | SIDECAR                                                                                             | `gamelib-launch-1.log`                           |
| `gamelib-steam-helper: refusing steam relaunch request`                              | `native/steam-bridge/steamclient-layer/helper/steam.c:135` (`fail(...)`, exit 3)                                      | The helper's stderr inside the Wine process. `runWineCommand({wait:false})` (games.ts:4153) and 56-12 name no capture of it | NONE named. CONDITIONAL                          |
| `gamelib-steam-helper: steamclient_init_registry unavailable`                        | `helper/steam.c:171` (`fprintf(stderr, ...)`)                                                                        | Same as above                                                                                       | NONE named. CONDITIONAL                          |
| `"StateFlags" "4"`                                                                   | appmanifest written by the depot install engine                                                                      | Filesystem                                                                                          | direct read                                      |

Consequence for item 7's second sub-check: no plan routes the helper's stderr to a captured sink, so it is CONDITIONAL. It is scorable only if the runner finds a sink (the terminal transcript if the Wine child inherits stderr). Absence of the refusal line in a sink that cannot carry it proves nothing (Section 4 i). The structural backstop is that a refused relaunch is exit 3, the game never starts, and items 4 to 6 would fail; the refusal can therefore only matter to the verdict through those items.

### 4b. Item, sub-check and precondition table

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict (Test 1 to Test 7) | Evidence |
| --- | --- | --- | --- | --- |
| PC1 Mac Steam running | external process steam_osx | running | T1 N/A no URL; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R positive observable is a non-empty pgrep, not app state; T7 N/A | `pgrep -x steam_osx` |
| PC2 no Windows Steam | process table | empty ps grep | T1 N/A; T2 N/A; T3 N/A; T4 R falsifiable, a running Windows Steam appears in ps; T5 R; T6 R positive observable is the empty ps output; T7 N/A | the ps command in Section 1 |
| PC3 CrossOver build | /Applications/CrossOver.app | `26.3.0.39832` | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R reads the installed bundle; T7 N/A | `defaults read` (measured 26.3.0.39832 on 2026-10-28) |
| PC4 fresh build | build tooling | exit 0 | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 N/A; T7 N/A | package.json scripts `build-steam-bridge`, `build:sidecar-sea` |
| PC5 session archive | SIDECAR and .old | copies | T1 N/A; T2 N/A; T3 R reads SIDECAR; T4 N/A; T5 C flagged pair 1 (archive must precede dev restart); T6 N/A; T7 N/A | `src/backend/logger/log_writer.ts:72-74` renames gamelib.log to .old on first write |
| PC6 one fresh dev app | dev app, sidecar.js | single PID, fresh sidecar | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 C flagged pair 1; T6 R already-running instance checked by count 1; T7 N/A operator starts dev from a shell | `pgrep`, `stat -f %m build/main/sidecar.js`, `grep -c drmLaunchSetup` |
| PC7 Grim Dawn bottle absent | filesystem | dir absent | T1 N/A; T2 N/A; T3 N/A; T4 R falsifiable, a present bottle fails `test ! -d`; T5 C flagged pair 3 (reinstall creates it); T6 R positive observable is the absence test, and item 2 then positively observes the new manifest; T7 N/A | `test ! -d` (measured absent 2026-10-28) |
| PC8 first DRM launch | COMPDIR | absent | T1 N/A; T2 N/A; T3 N/A; T4 R falsifiable; T5 C flagged pair 4 (launch 1 creates COMPDIR); T6 R a pre-existing COMPDIR is recorded with mtime and item 1 then proves the fetch only if absent; T7 N/A | `test ! -e COMPDIR` |
| PC9 asset reachable | GitHub releases CDN | HTTP 200 | T1 R https URL; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R positive observable is the 200; T7 N/A | `curl -fsSIL` |
| PC10 Raft/Ranch bottles | filesystem | manifests exist | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R positive observable is the manifest file; T7 N/A | measured present 2026-10-28 |
| Item 1 component fetched | COMPDIR, codesign | six names, pinned sha, unsigned | T1 R fetched over https; T2 N/A; T3 R filesystem sink, read directly; T4 N/A presence assertion; T5 C flagged pair 4; T6 C depends on PC8 and on network reaching github.com and Valve's CDN; T7 N/A | catalogue pin in `src/common/steamclientLayerCatalogue.ts`; `steamclientLayerInstall.ts` strips the signature under a fake HOME |
| Item 2 reinstall | bottle manifest | StateFlags 4 | T1 N/A; T2 N/A; T3 N/A filesystem; T4 N/A; T5 C flagged pair 3; T6 C depends on Grim Dawn being owned by the signed-in account and on the "Steam direct download" setting (see Test 7 row); T7 see Test 7 row | `appmanifest_219990.acf` |
| Item 3 anchor, zero notices | SIDECAR | one anchor, zero notices | T1 N/A; T2 N/A; T3 R emitters in 4a, sink SIDECAR copy, never terminal.log; T4 R the notice path logs on every step failure (games.ts:3396), so a failure would show; T5 C flagged pair 2 (copy before restart); T6 N/A; T7 N/A | 4a rows 1 and 4 |
| Item 4 menu, only Mac Steam | operator, ps output | interactive menu, process list | T1 N/A; T2 N/A; T3 N/A; T4 R falsifiable (Windows Steam processes appear in ps); T5 R; T6 R positive observable is the steam_osx pid in the same file; T7 R operator observes the game window, a judgement no log makes | procs-launch-1.txt |
| Item 5 game attach | SIDECAR re-log | role=game create-interface line, pid not a helper pid | T1 N/A; T2 N/A; T3 R emitter steamclient_main.c:193, relay games.ts:945, sink SIDECAR; the re-log runs after the game exits (games.ts:3938-3943), so the copy must be taken after exit; T4 N/A presence assertion; T5 C flagged pair 2; T6 N/A; T7 N/A | 4a rows 2 and 3 |
| Item 6 census verified | census over live SIDECAR, raw trace | verified, call name lists | T1 N/A; T2 N/A; T3 R emitter steamclient_main.c:248, census `classifyBridgeEvidence` DRM branch in meta/bridgeCensus.ts, sink SIDECAR plus TRACEDIR; T4 N/A; T5 C flagged pair 2 (census reads the live file, so no restart before it); T6 C needs launch 1 still in the live SIDECAR; T7 N/A | `pnpm -s bridge-census --json`; counting-call rule in 56-05-SUMMARY.md |
| Item 7a no HKLM Steam keys | bottle system.reg | zero matching key lines | T1 N/A; T2 N/A; T3 N/A filesystem; T4 R falsifiable, an HKLM key written by a launch would show in system.reg; T5 C flagged pair 5 (score from launch 1 copy before any HKLM add); T6 R the bottle is new for Grim Dawn (PC7), so no stale key; T7 N/A | `grep -ciE` over the system.reg copy |
| Item 7b no relaunch refusal | helper stderr | zero refusal lines | T1 N/A; T2 N/A; T3 C no captured sink named in 4a; T4 C absence in an uncaptured sink proves nothing; backstop is items 4-6; T5 R; T6 N/A; T7 N/A | helper/steam.c:135; games.ts:4153 `wait:false` |
| Item 7c init_registry line | helper stderr | recorded if present | T3 C same sink gap; recording only, never fails the item | helper/steam.c:171 |
| Item 8 Raft | as items 3-6 | recorded | T1-T4 as items 3-6; T5 C flagged pair 6 (first DRM launch of a Phase 52 forwarder bottle exercises 56-09 cleanup live); T6 C bottle holds Phase 52 forwarder leftovers; T7 R launch gesture below | `find ... -name gamelib_bridge.cfg` |
| Item 9 Ranch | as items 3-6 | recorded | as item 8 | spike 040 exit-53 variant |
| Item 10 networking lead | all launch captures | grep counts | T3 R reads each captured file; T4 N/A recorded count, any value; T5 R; T6 N/A; T7 N/A | 56-02-SUMMARY.md: `serialized005.patch` omitted |
| Item 11 HKLM diagnostic | reg add under clone runner | conditional launch | T3 N/A; T4 N/A; T5 C flagged pair 5; T6 N/A; T7 N/A operator and runner drive reg add from a shell | 56-01 launch_form `bin/wine+CX_BOTTLE`; F7 key list in 56-RESEARCH.md |
| Launch gesture | Library card Play button | click Play on the Grim Dawn card | T1 N/A; T2 N/A one gesture, no modal sheet; T3 N/A; T4 N/A; T5 R; T6 N/A; T7 R card renders and wires Play (`src/frontend/screens/Library/components/GameCard/index.tsx`, `handlePlay`) | same file as Test 7 reinstall row |
| Capture instruction | terminal.log and per-launch copies | `tee -a`, delimiter, per-launch copies, one instance | T1 N/A; T2 N/A; T3 R each scored line is read from the sink that carries it (SIDECAR copy, TRACEDIR copy, system.reg copy), none from terminal.log; T4 N/A; T5 R no truncation, append only; T6 R single instance asserted by count; T7 N/A | `grep -n '^=== GATE LAUNCH' <session>/terminal.log` |

### 4b2. Test 1 and Test 2

- Test 1 (origin/scheme): the only URLs are the https archive URL (PC9, item 1) and Valve's CDN, fetched by the sidecar. No http fixture is used. REACHABLE.
- Test 2 (concurrency): each launch is one Play click and a quit from the game menu; no second gesture is driven while a modal is up. No sub-check needs two things at once. REACHABLE.

### 4c. Test 4 (absence-observability)

- Item 3's zero notices: falsifiable. The notice path logs on every step failure (games.ts:3396).
- Item 7a's zero HKLM keys: falsifiable. A key written into the prefix would show in `system.reg`.
- PC2: falsifiable. A running Windows Steam shows in ps.
- Item 7b's zero refusal lines: NOT falsifiable in an uncaptured sink. Recorded as CONDITIONAL.

### 4d. Test 5 pairing pass

Reduction applied: every state-mutating requirement {dev restart, reinstall, HKLM add, HKLM delete, trace retention of 8 files, component fetch into COMPDIR, first-DRM-launch forwarder cleanup} considered against every evidence-bearing requirement {items 1-7, the census read, PC7, PC8}. 7 mutating x 9 evidence-bearing = 63 pairs considered, 6 flagged:

1. {dev restart} x {census reading the live gamelib.log, and the PC5 archive}: the restart renames gamelib.log to .old. Mitigated by never restarting between launches, by archiving in PC5 first, and by running the census before any restart.
2. {per-launch SIDECAR copy} x {later launches}: launch N+1 appends to the same file, so each copy is cumulative and item 3's "exactly one anchor" is scored on launch 1's copy only. Mitigated by copying right after each exit and scoring from the matching ordinal.
3. {reinstall} x {PC7 bottle absent, item 2}: the reinstall deliberately makes the bottle. PC7 is read before it, item 2 after it.
4. {component fetch into COMPDIR} x {PC8, item 1}: launch 1 creates COMPDIR. PC8 is read before launch 1, item 1 after.
5. {HKLM add} x {item 7a}: item 7a is scored from launch 1's system.reg copy before any add (launch 4 only runs afterward).
6. {first DRM launch cleanup of Phase 52 forwarder files} x {item 8}: the cleanup is the thing item 8 observes; the find runs after launch 2.

Trace retention of 8 files per appId: the runner copies the newest trace right after each exit, so pruning cannot remove a scored trace.

### 4e. Test 6 (external state)

- Mac Steam signed in (PC1, items 4 to 6): the positive observable is the steam_osx pid in the same procs file.
- Raft and Ranch bottles holding Phase 52 forwarder leftovers (item 8, 9): recorded in item 8.
- A pre-existing COMPDIR or Valve client cache (item 1, PC8): PC8 records it; a pre-existing COMPDIR means item 1 does not prove a fetch.
- Grim Dawn's Steam cloud saves and account ownership (item 2): the install requires the owning account to be signed in; recorded.
- A leftover Phase 52 forwarder in the new Grim Dawn bottle cannot exist (PC7 shows the bottle is absent).

### 4f. Test 7 (gesture sequence)

Reinstall gesture: on the library card for a not-installed Steam title (`!isInstalled && !isQueued && !isDelisted && runner === 'steam'`) the click path calls `openInstallGameModal` (`src/frontend/screens/Library/components/GameCard/index.tsx:700-704`), which short-circuits `runner === 'steam' && action === 'install'` to `startSteamQuickInstall` (`src/frontend/state/InstallGameModal.ts`). The backend then branches on `isSteamNativeInstallEnabled()` (`src/backend/storeManagers/steam/games.ts:1772`, `nativeInstallSetting.ts`), which defaults ON (`enableSteamNativeInstall ?? true`). Windows-only Grim Dawn then goes to `installBottleNative` (games.ts:1780). The setting only has to be checked, not turned on; if the operator has set it OFF, the install is delegated to `steam://install` on Mac Steam (the Phase 51 Hoard detour) and item 2 cannot pass until it is turned back ON. The runner records the setting value.

## 5. Tests

### 1. Component published and fetched (D-18)

expected: COMPDIR holds exactly the six names, lsteamclient.so sha256 equals dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d, codesign -dv reports `not signed at all` (sink: filesystem, launch 1)
result: pass — launch 1: COMPDIR holds exactly LICENSE.lsteamclient, NOTICE, detour-cx26.3.0.39832.bin, lsteamclient.dll, lsteamclient.so, steam.exe; lsteamclient.so sha256 dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d; codesign -dv: `code object is not signed at all`; PC8 showed COMPDIR absent before launch 1, and launch-1 log shows `component=download` (installed 22:35 by this run)

### 2. Reinstall through the bridge

expected: BOTTLE(219990) exists and appmanifest_219990.acf has `"StateFlags" "4"` (sink: filesystem, launch 1)
result: pass — launch 1: BOTTLE(219990) exists, appmanifest_219990.acf `"StateFlags"		"4"`. Install routed to the bridge (native install ON) after an operator click-through of a route-notice dialog (Gaps 1, 2); the post-install 'redist' status stuck and needed a dev restart (Gap 3)

### 3. DRM-mode setup completed (D-12/D-13)

expected: gamelib-launch-1.log has one `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` line and zero `[bridge-notice] appId=219990 reason=drm-` lines (sink: SIDECAR copy, launch 1)
result: pass — launch 1 (second delimiter, 09:35:33Z; the 09:28:26Z delimiter is VOID, Gap 3): `grep -c` of the anchor line = 1 (`[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=1792618285 trace=.../219990-1793180177200.log`), `[bridge-notice] appId=219990 reason=drm-` count 0; setup line `drm setup: appId 219990 ready crossover=26.3.0.39832 client=1792618285 component=download runner=clone valve=download`; no `FWD CreateInterface` line

### 4. Menu with only Mac Steam (D-17)

expected: operator confirms the main menu is interactive; procs-launch-1.txt has a steam_osx pid and no steamwebhelper.exe or steamservice.exe line (sink: operator plus procs-launch-1.txt, launch 1)
result: issue — launch 1: menu NOT reached. Operator: Grim Dawn crashed after Steam init; the black window was the game's crash reporter. Crash files in <session>/launch-1-crash/: exception c0000005 at grim dawn.exe+0x1d10a, read of 0x18 (null deref), thread 244, right after the last traced call ISteamController_SteamController008_GetActionSetHandle. The game ran 182s per bottleProcessMonitor (matched pid 3802, stopped 22:39:30). No procs-launch-1.txt exists (no menu, so the snapshot was never taken); the only process evidence is the logs: bottleProcessMonitor matched only `grim dawn.exe`, no steamwebhelper/steamservice line in the launch-1 log or transcript, and the PC2 ps grep printed nothing when re-run after the crash (it is not a menu-time snapshot). Claude found a stale GameLibSteam-bottle Steam running during pre-Task-1 prep and told the operator to close it; the launch-1 transcript and log show no steamwebhelper/steamservice line. The absence of procs-launch-1.txt is recorded, not scored as pass

### 5. D-15 game-process attach

expected: gamelib-launch-1.log has at least one `bridge drm [219990]: [drm-trace] appId=219990 pid=<g> role=game event=create-interface` line and <g> equals no role=helper pid (sink: SIDECAR copy, launch 1)
result: pass — launch 1: 1 re-logged `role=game event=create-interface iface=SteamClient017` line for 219990, pid=240; role=helper line count is 0 in both gamelib-launch-1.log and trace-launch-1.log, so pid 240 equals no helper pid (vacuous: the helper never traced). Ifaces seen: SteamClient017 only. Re-log reported `relogged events=24 rejected=0`

### 6. D-16 game-originated call (census)

expected: `pnpm -s bridge-census --json` for appid 219990 gives evidence verified with evidenceDetail starting `game call ` or equal to `game log init`, and no counting name starts with ISteamClient_ or matches SetMinidumpSteamID; every distinct name= per role from trace-launch-1.log recorded verbatim (sinks: live SIDECAR and trace-launch-1.log, launch 1)
result: pass — launch 1: `pnpm -s bridge-census --json` row 219990: evidence `verified`, evidenceDetail `game call ISteamUser_SteamUser017_GetSteamID` (class unknown-version; detail includes `SteamStub .bind: routed to DRM mode (steamclient-layer)`). Pinned names from trace-launch-1.log (24 lines: 1 create-interface + 23 calls, all pid=240). role=game iface= values: SteamClient017. role=game name= values (sorted): ISteamAppTicket_STEAMAPPTICKET_INTERFACE_VERSION001_GetAppOwnershipTicketData; ISteamApps_STEAMAPPS_INTERFACE_VERSION009_BIsSubscribedApp; ISteamClient_SteamClient014_BReleaseSteamPipe; ISteamClient_SteamClient014_ConnectToGlobalUser; ISteamClient_SteamClient014_CreateSteamPipe; ISteamClient_SteamClient014_GetISteamGenericInterface; ISteamClient_SteamClient014_GetISteamUser; ISteamClient_SteamClient014_GetISteamUtils; ISteamClient_SteamClient014_ReleaseUser; ISteamClient_SteamClient023_ConnectToGlobalUser; ISteamClient_SteamClient023_CreateSteamPipe; ISteamClient_SteamClient023_GetISteamGenericInterface; ISteamClient_SteamClient023_GetISteamUser; ISteamClient_SteamClient023_Set_SteamAPI_CCheckCallbackRegisteredInProcess; ISteamClient_SteamClient023_SetWarningMessageHook; ISteamController_SteamController008_GetActionSetHandle; ISteamController_SteamController008_Init; ISteamMatchmakingServers_SteamMatchMakingServers003_RequestLANServerList; ISteamUser_SteamUser017_GetSteamID; ISteamUser_SteamUser023_GetSteamID; ISteamUtils_SteamUtils007_GetAppID; ISteamUtils_SteamUtils007_GetConnectedUniverse; ISteamUtils_SteamUtils011_GetAppID. role=helper iface= and name= values: none (no role=helper lines). Counting names (not ISteamClient_*, no SetMinidumpSteamID): the ISteamAppTicket, ISteamApps, ISteamController, ISteamMatchmakingServers, ISteamUser and ISteamUtils names above; none matches SetMinidumpSteamID

### 7. D-21 no local-machine Steam keys

expected: zero `^\[Software\\\\(Wow6432Node\\\\)?Valve\\\\Steam` lines in system-reg-launch-1.reg, zero `gamelib-steam-helper: refusing steam relaunch request` lines in any wine sink found (CONDITIONAL sink), any `steamclient_init_registry unavailable` line recorded (sinks: system-reg copy and wine sink, launch 1)
result: issue — launch 1: `grep -ciE '^\[Software\\\\(Wow6432Node\\\\)?Valve\\\\Steam'` over system-reg-launch-1.reg = 5, so the literal check fails. All 5 are shared-redist HasRun marks, not D-21 InstallPath keys: Software\\Wow6432Node\\Valve\\Steam\\Apps\\CommonRedist\\DirectX\\Jun2010 and ...\\vcredist\\2010, 2012, 2013, 2015 (Gap 5, contract defect); `grep -c InstallPath` over the same file = 0, so no bare Valve\\Steam key and no InstallPath existed at launch 1. Wine sink: none named by 56-12; <session>/terminal.log carries only sidecar log lines. Refusal lines: `refusing steam relaunch request` 0 across gamelib-launch-1.log, terminal.log, trace-launch-1.log, system-reg-launch-1.reg, crash files (the sink cannot carry helper stderr, so this proves nothing). `steamclient_init_registry unavailable`: 0 in the same files (same caveat)

### 8. Raft 648800 (recorded, non-blocking)

expected: items 3-6 applied to launch 2 recorded as verified, reached menu (census detail) or failed at a step; `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` prints nothing (sink: SIDECAR copy and filesystem, launch 2)
result: pass — launch 2 (delimiter 09:44:35Z; sink gamelib-launch-4.log, the cumulative session log): Raft ran in DRM mode. Setup `drm setup: appId 648800 ready crossover=26.3.0.39832 client=1792618285 component=cache runner=cache valve=cache`; one anchor line with trace=.../648800-1793180705467.log; zero drm- notices for this launch; menu reached (operator); census row 648800 evidence `verified`, evidenceDetail `game call ISteamUser_SteamUser017_GetSteamID`; trace: 56 events, relogged 22:47:02, rejected=0, role=game pid 240 only, iface SteamClient017, role=helper lines 0. procs-launch-2.txt: Raft.exe, the DRM clone's winewrapper, steam_osx pid, no steamwebhelper/steamservice line. `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` printed nothing (count 0): 56-09 cleanup confirmed. Game ran 116s

### 9. Ranch Simulator 1119730 (recorded, non-blocking)

expected: items 3-6 applied to launch 3 recorded as verified, reached menu (census detail) or failed at a step, with the logged exit code if any (sink: SIDECAR copy, launch 3)
result: issue — launch 3 (no GATE LAUNCH 3 delimiter; aligned by timestamp 22:47:21-22:47:59): Ranch Simulator was NOT routed to DRM mode. It took the ordinary bridge path (`SteamGame: launching appId 1119730 via the Steam bridge`) with a `[bridge-notice] appId=1119730 reason=stubbed:SteamHTMLSurface,SteamHTTP,SteamInventory,...` line. The game exited after 3s (22:47:21-25), and again after 2s on a second try (22:47:56-59); `bridge helper [1119730] exited (code=null signal=SIGTERM)` both times, no game exit code logged. No trace file, no anchor. Census row 1119730: evidence `unverified`, evidenceDetail `no HELLO`. raiseWineGameWindow: no matching process after 12 attempts (Ranch_Simulator.exe, Ranch_Simulator-Win64-Shipping.exe). Non-blocking

### 10. Networking lead (56-02)

expected: `grep -c SteamNetworkingSocketsSerialized005` over every session launch capture recorded per file (sink: all gamelib-launch-N.log and trace files, launches 1 to 3)
result: pass — recorded, `grep -c SteamNetworkingSocketsSerialized005`: gamelib-launch-1.log 0, trace-launch-1.log 0, system-reg-launch-1.reg 0, terminal.log 0, launch-1-crash/crash.xml 0, launch-1-crash/log.html 0, gamelib-launch-4.log (cumulative, covers launches 2-4) 0, gamelib-launch-2.log 0, gamelib-launch-3.log 0 (copies of the cumulative log), gamelib-after-launches-2-5.log 0, trace-launch-2.log 0. All zero: the networking lead gives no signal

### 11. HKLM diagnostic (D-21, conditional)

expected: only if item 4, 5 or 6 failed on launch 1: the two F7 keys added with reg add, launch 4 scored as items 3-6, keys deleted and system.reg re-checked; otherwise skipped (sinks: SIDECAR copy and system-reg copy, launch 4)
result: issue — launch 4 (HKLM keys armed) never reached the game. Two attempts, both failed at `drm-bottle-stage`: (a) 22:49:14, no delimiter, `stageDrmBottle: appId 219990 reg add SteamClientDll64 timed out after 15000 ms`, `[bridge-notice] appId=219990 reason=drm-bottle-stage cause=reg-add-SteamClientDll64-timed-out-after-15000-ms`, `dispatched=in-app-dialog+notify dialog-frame-sent=true display=unconfirmed` (operator saw nothing); (b) the retry with delimiter 09:55:04Z, 22:55:16-43: first three reg adds took about 4s each, the 4th (`HKCU\\Software\\Valve\\Steam /v SteamPath`) timed out after 15000 ms, notice `reason=drm-bottle-stage cause=reg-add-SteamPath-timed-out-after-15000-ms`. The HKLM diagnostic gave no D-21 signal. Keys removed afterwards: both `reg delete "HKLM\\Software\\Valve\\Steam" /f` and `...\\Wow6432Node\\Valve\\Steam` /f via the clone runner, exit 0 each, wineserver -w; live system.reg then has 0 `InstallPath` lines and 0 bare `[Software\\...Valve\\Steam]` lines (Gap 12 on the collateral CommonRedist deletion and restore)

## Run record

### Publish record (plan 56-15 Task 4, 2026-10-28)

- Approval: on 2026-10-28 the operator answered "Push main, then publish" to the orchestrator's question about pushing main and publishing the pre-release; they then chose "Fix the blockers, then push" for the pre-push hook failures. Resume signal after publishing: "done release resume 56-15".
- Contract: contract not separately reviewed by operator; proceeding on the publish approval.
- The operator ran `gh release create` themselves (the agent's attempt was denied by the permission system and not retried). No agent ran any `gh release` write command.
- Release: https://github.com/grayson-mitchell/GameLib/releases/tag/steamclient-layer-cx26.3.0.39832, isPrerelease true, target 94fc98d7a9ebb09b54edd16bbe75b48594a9a2f2 (origin/main; holds the 11 files under native/steam-bridge/steamclient-layer).
- Asset digests (gh release view), each equal to its SHA256SUMS line or to the staged file:
  - steamclient-layer-cx26.3.0.39832.tar.gz sha256 c58a40c67c5d9093970227327bcceb5c2e457bc81b0a58559d9cb65777aeb187, 5359548 bytes
  - COPYING sha256 3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986, 35149 bytes
  - LICENSE sha256 3df3b1723e04307176b7ffe1f424514d5f871d03d2c2f668652bc8b6dfcd72af, 1511 bytes
  - SHA256SUMS sha256 9d9233f66332fd370342bb460faf38f1a5e4f1f288cfed8ae380a1c44230a00a, 254 bytes (equals the staged file)
- Fresh-directory download of the archive URL: sha256 and size (5359548) equal `archiveSha256` and `archiveSize` in src/common/steamclientLayerCatalogue.ts. Pins were not re-pinned (`pinned: match` re-run on 94fc98d7a).
- Session dir: `/tmp/gamelib-gate-20261028T081115Z/` (contains pre-session-gamelib.log and pre-session-gamelib.log.old; terminal.log started with the PC5 listing). 56-16 reuses it.

### Preflight (PC1-PC5, PC7-PC10; PC6 is left to 56-16)

| ID   | Observed                                                                                          | Result |
| ---- | ------------------------------------------------------------------------------------------------- | ------ |
| PC1  | `pgrep -x steam_osx` printed pid 74207                                                            | pass   |
| PC2  | ps grep for Windows Steam processes printed nothing                                               | pass   |
| PC3  | CFBundleVersion `26.3.0.39832`                                                                    | pass   |
| PC4  | `pnpm build-steam-bridge`, `pnpm exec vite build`, `pnpm build:sidecar-sea` all exit 0            | pass   |
| PC5  | session dir created; both prior sidecar logs copied (56106 and 6507 bytes)                        | pass   |
| PC7  | BOTTLE(219990) absent                                                                             | pass   |
| PC8  | COMPDIR absent                                                                                    | pass   |
| PC9  | archive URL ends at HTTP/2 200                                                                    | pass   |
| PC10 | appmanifest_648800.acf and appmanifest_1119730.acf both present                                   | pass   |

Note for 56-16: PC4 rebuilt build/main/sidecar.js; PC6 requires the operator to restart `pnpm tauri:dev` AFTER this point under `tee -a <session>/terminal.log`.

### Gate run record (plan 56-16, Task 2)

- Task 1 signal: "failed: Grim Dawn crashed after Steam init - black window was the game's crash reporter; closed it".
- PC6: dev was restarted once BEFORE any launch (allowed). The pre-restart install-session log is `<session>/install-session-gamelib.log`; the current gamelib.log is the launch-1 session. `pc6-pid.txt` was empty (operator ran pgrep before the window was up); the orchestrator rewrote it to 3189 (the single gamelib-shell) at about 22:37 local, AFTER launch 1 started. Claude confirmed `pgrep -f target/debug/gamelib-shell` still returns 3189 at Task 2. Pre-restart sidecar.js checks at prep time: mtime 1793175292 > games.ts commit 1793169519; drmLaunchSetup 7; setupSteamClientForwarder 0.
- Launch delimiters: two `=== GATE LAUNCH 1` lines in terminal.log. 09:28:26Z (line 126) is VOID: the Play click never reached the backend (Gap 3). 09:35:33Z (line 187) is the real launch 1. Only the second is scored.
- Launch 1 timeline (local): 22:35:51 valve client fetched and verified; 22:35 component installed; 22:36:17 drm setup ready; 22:36:25 anchor; 22:36:28 game pid 3802 started; 22:39:30 game gone after 182s, trace re-logged (24 events, 0 rejected).
- Crash: exception c0000005 at grim dawn.exe+0x1d10a, read of 0x18 (null deref), after the last traced call ISteamController_SteamController008_GetActionSetHandle. Files in `<session>/launch-1-crash/` (crash.xml, minidump.dmp, log.html, zip). No analysis beyond this was done in Task 2; the on-disk exe is SteamStub-encrypted so only the minidump memory is usable.
- Wine sink: none. 56-12 names none; `<session>/terminal.log` carries only sidecar log lines (no wine stderr). Recorded as "no wine sink".
- Machine state: Grim Dawn was installed in Mac Steam (appmanifest 5.1 GB) and in an old GameLibGate52GD bottle at gate start; the operator uninstalled the Mac Steam copy before the reinstall. GameLibGate52GD left in place.
- Census rows (live gamelib.log = launch 1): 219990 evidence verified / `game call ISteamUser_SteamUser017_GetSteamID`; 648800 unverified / `no DRM-mode anchor`; 1119730 unverified / `no HELLO`.
- D-21 arming: item 4 failed, so the HKLM diagnostic is armed. Claude added both F7 keys with the clone runner (see item 11); launch 4 not yet run.
- Session inventory after Task 2: install-session-gamelib.log, launch-1-crash/, pc6-pid.txt, pre-restart-gamelib.log(.old), pre-session-gamelib.log(.old), terminal.log, gamelib-launch-1.log, trace-launch-1.log, system-reg-launch-1.reg. No procs-launch-1.txt (no menu).

### Gate run record (plan 56-16, Task 4)

- Task 3 signal: "2: menu reached; 3: failed: exits silently in 2-3s (ran twice); 4: failed: drm-bottle-stage reg add timeout, game never started (attempted twice)".
- Delimiters in terminal.log: LAUNCH 2 09:44:35Z; no LAUNCH 3 delimiter (operator skipped it; Ranch aligned by timestamp); LAUNCH 4 09:55:04Z (the retry). The first launch-4 attempt (22:49:14 local) had no delimiter. Session log files: `gamelib-launch-4.log` is the full current session log (covers launches 2-4) and `gamelib-after-launches-2-5.log` is an earlier copy of it. `gamelib-launch-2.log` and `gamelib-launch-3.log` did not exist; Claude created them as copies of the cumulative `gamelib-launch-4.log` so the Task 3 check can see them, so they are not per-launch captures. `trace-launch-2.log` is the Raft trace; no trace exists for launch 3 or 4.
- Extra unscripted runs outside the contract: Grim Dawn at 22:49:14 (drm-bottle-stage, see item 11) and Raft at 22:52:09 (`stageDrmBottle: appId 648800 reg add SteamPath timed out after 15000 ms`, `reason=drm-bottle-stage`, the operator saw the dialog).
- Hang pattern (orchestrator observation): during each hang the bottle's wine session under the DRM clone runner was running `wineboot.exe --init` with a `winedevice.exe` at about 100% CPU that did not exit. The first DRM launch in a bottle this session worked (Grim Dawn launch 1, Raft launch 2); every later DRM launch in the same bottle hung at bottle-stage. The orchestrator killed the Raft bottle session with `wineserver -k` (22:53) and the Grim Dawn one by pid, kill -9 on winedevice (22:57); `wineserver -k` with CX_BOTTLE alone did not work. Zero wine processes remained.
- Archives: gamelib-after-launches-2-5.log, gamelib-launch-4.log, system-reg-after-2-5-{648800,1119730,219990}.reg, system-reg-launch-4.reg, system-reg-after-keyremoval.reg.
- Census rows at teardown: 219990 verified / `game call ISteamUser_SteamUser017_GetSteamID`; 648800 verified / `game call ISteamUser_SteamUser017_GetSteamID`; 1119730 unverified / `no HELLO`.
- PC6 pid at teardown: dev gamelib-shell pid 3189 (same as pc6-pid.txt).
- Key removal: after the launch-4 attempts, Claude ran `reg delete` for the two F7 keys under the clone runner with `CX_BOTTLE=GameLibSteamBridge-219990` (a declared real-profile arm). The first attempt deleted only the `InstallPath` value (exit 0, key left). The second deleted the keys with /f. Deleting `HKLM\Software\Wow6432Node\Valve\Steam` also removed its `Apps\CommonRedist` subtree (the 5 shared-redist HasRun marks, Gap 5). Claude re-added them with `reg add` from the launch-4 system.reg copy (DirectX Jun2010 dxsetup; vcredist 2010 x64/x86; 2012 `x64 update 4`/`x86 update 4`; 2013 `x64 12.0.30501`/`x86 12.0.30501`; 2015 `x64 update 3 14.0.24215.0`/`x86 update 3 14.0.24215.0`, all dword 1). Live system.reg after: `grep -c InstallPath` 0; bare `^\[Software\\\\(Wow6432Node\\\\)?Valve\\\\Steam\]` count 0; the item 7 prefix regex count is 5 (the restored CommonRedist marks, Gap 5, unchanged from launch 1). The plan's Task 4 verify regex has no closing `]`, so its "= 0" check cannot be satisfied for the reason in Gap 5.
- Closing inventory: see `ls -la /tmp/gamelib-gate-20261028T081115Z`; install-session-gamelib.log, launch-1-crash/, pc6-pid.txt, pre-*, procs-launch-2.txt, terminal.log, gamelib-launch-{1,2,3,4}.log, gamelib-after-launches-2-5.log, trace-launch-{1,2}.log, the system-reg copies above. No procs-launch-3.txt or procs-launch-4.txt (no menu).

## Gaps

1. (non-blocking, contract defect) Preflight never checked that Grim Dawn was uninstalled elsewhere. A Mac Steam copy made the library card show Play, blocking the reinstall gesture. Next: add a PC for "not installed in Mac Steam or any other bottle".
2. (non-blocking, product) The install route notice showed the scan-miss "may not work with the native Steam bridge ... probably not run" dialog for a DRM-mode title: a stale scan-miss verdict; the route notice is unaware of DRM mode. The operator clicked through and the install went to GameLibSteamBridge-219990 correctly. Next: make the route notice consult the DRM routing.
3. (blocking for install UX, product bug) After a bridge install, the shared-redist step (games.ts ~2327-2341, sharedRedistInstall.ts sends status 'redist') leaves the game stuck in 'redist' ("Installing DirectX Jun2010"): the Steam download-queue 'done' is suppressed (downloadqueue.ts ~312) and nothing sends a final status after the redists. Play was disabled and a dev restart was needed. The first launch-1 delimiter (09:28:26Z) is VOID because the Play click never reached the backend. Next: send a final status after the redist step.
4. (non-blocking, product) Cmd+R window reload is a no-op under Tauri (terminal.log: `fakeWindow.reload(): logged no-op`).
5. (non-blocking, contract defect) Item 7's regex counts the shared-redist HasRun marks under Software\\Wow6432Node\\Valve\\Steam\\Apps\\CommonRedist\\... (DirectX Jun2010, vcredist 2010/2012/2013/2015) written at install time. They are not the D-21 InstallPath keys. Item 7 was scored literally (issue, count 5). Those keys were NOT deleted. Next: anchor the item 7 regex on the bare key line with an InstallPath value, or exclude \\Apps\\CommonRedist.
6. (non-blocking) Install-time warning "could not restore the Wine display driver" (22:19:52); restored at launch 1 (22:36:17, "a previous run left the Wine display driver switched, restoring it first").
7. (BLOCKING, gate item 4) Grim Dawn does not reach its menu: it crashes with c0000005 (null read 0x18) at grim dawn.exe+0x1d10a immediately after the last traced call ISteamController_SteamController008_GetActionSetHandle, following ISteamController_SteamController008_Init. Observed in the trace: no role=helper lines at all, and the game opened two client generations (SteamClient014 then SteamClient023). Next diagnostics: the HKLM launch 4 (armed), a minidump-memory look at what +0x1d10a dereferences, and whether the layer returns a null ISteamController interface.
8. (non-blocking, process) PC6's pid capture ran before the window was up, so pc6-pid.txt was empty and was rewritten after launch 1 started.
9. (BLOCKING for DRM mode, product bug) A second or later DRM launch in the same bottle hangs at `drm-bottle-stage`: a `reg add` under the clone runner times out after 15000 ms while the bottle's wine session runs `wineboot.exe --init` and a `winedevice.exe` spins near 100% CPU and never exits. Seen for Grim Dawn (22:49:14, 22:55:43) and Raft (22:52:09) after each had a successful first DRM launch. `wineserver -k` with CX_BOTTLE alone did not stop the Grim Dawn session; it needed a pid kill and kill -9 of winedevice. Next diagnostic: sample the winedevice process, check whether the stock and clone wineservers share the bottle, and test whether killing the bottle session after game exit (D-11) fixes the second launch.
10. (non-blocking, product) The `[bridge-notice] ... display=unconfirmed` dialog: for the 22:49:14 Grim Dawn failure the notice was dispatched (`dialog-frame-sent=true`) but the operator saw nothing; for the Raft failure at 22:52:09 the operator did see the dialog.
11. (non-blocking, routing) Ranch Simulator 1119730 took the ordinary bridge path, not DRM mode, with a `reason=stubbed:SteamHTMLSurface,SteamHTTP,...` notice, and exited in 2-3 s twice with the helper ending on SIGTERM. Census `unverified / no HELLO`. Next: check the Ranch routing, and whether the game exits because the stubbed families are missing (the spike 040 exit-53 variant).
12. (non-blocking, process) Removing the item 11 key `HKLM\Software\Wow6432Node\Valve\Steam` with `reg delete /f` deletes the whole subtree, including the shared-redist HasRun marks that Gap 5 said not to delete. Claude restored them from the launch-4 copy (see Run record). The contract's key-removal step should use `/v InstallPath` plus deleting only empty keys, or exclude Apps\CommonRedist.
13. (blocking, gate item 4) Gap 7 stands: the gate fails at item 4, since Grim Dawn never reaches its menu. Launch 4 gave no D-21 signal, so the HKLM keys remain untested as a fix.

## Verdict

Verdict: FAIL — item 4: Grim Dawn 219990 never reached its main menu; it crashed (c0000005, null read after ISteamController_SteamController008_GetActionSetHandle) although the D-15/D-16 criterion held (census verified, game call ISteamUser_SteamUser017_GetSteamID); the launch-4 HKLM diagnostic failed at drm-bottle-stage and gave no signal
