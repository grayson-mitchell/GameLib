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
result: pending

### 2. Reinstall through the bridge

expected: BOTTLE(219990) exists and appmanifest_219990.acf has `"StateFlags" "4"` (sink: filesystem, launch 1)
result: pending

### 3. DRM-mode setup completed (D-12/D-13)

expected: gamelib-launch-1.log has one `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` line and zero `[bridge-notice] appId=219990 reason=drm-` lines (sink: SIDECAR copy, launch 1)
result: pending

### 4. Menu with only Mac Steam (D-17)

expected: operator confirms the main menu is interactive; procs-launch-1.txt has a steam_osx pid and no steamwebhelper.exe or steamservice.exe line (sink: operator plus procs-launch-1.txt, launch 1)
result: pending

### 5. D-15 game-process attach

expected: gamelib-launch-1.log has at least one `bridge drm [219990]: [drm-trace] appId=219990 pid=<g> role=game event=create-interface` line and <g> equals no role=helper pid (sink: SIDECAR copy, launch 1)
result: pending

### 6. D-16 game-originated call (census)

expected: `pnpm -s bridge-census --json` for appid 219990 gives evidence verified with evidenceDetail starting `game call ` or equal to `game log init`, and no counting name starts with ISteamClient_ or matches SetMinidumpSteamID; every distinct name= per role from trace-launch-1.log recorded verbatim (sinks: live SIDECAR and trace-launch-1.log, launch 1)
result: pending

### 7. D-21 no local-machine Steam keys

expected: zero `^\[Software\\\\(Wow6432Node\\\\)?Valve\\\\Steam` lines in system-reg-launch-1.reg, zero `gamelib-steam-helper: refusing steam relaunch request` lines in any wine sink found (CONDITIONAL sink), any `steamclient_init_registry unavailable` line recorded (sinks: system-reg copy and wine sink, launch 1)
result: pending

### 8. Raft 648800 (recorded, non-blocking)

expected: items 3-6 applied to launch 2 recorded as verified, reached menu (census detail) or failed at a step; `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` prints nothing (sink: SIDECAR copy and filesystem, launch 2)
result: pending

### 9. Ranch Simulator 1119730 (recorded, non-blocking)

expected: items 3-6 applied to launch 3 recorded as verified, reached menu (census detail) or failed at a step, with the logged exit code if any (sink: SIDECAR copy, launch 3)
result: pending

### 10. Networking lead (56-02)

expected: `grep -c SteamNetworkingSocketsSerialized005` over every session launch capture recorded per file (sink: all gamelib-launch-N.log and trace files, launches 1 to 3)
result: pending

### 11. HKLM diagnostic (D-21, conditional)

expected: only if item 4, 5 or 6 failed on launch 1: the two F7 keys added with reg add, launch 4 scored as items 3-6, keys deleted and system.reg re-checked; otherwise skipped (sinks: SIDECAR copy and system-reg copy, launch 4)
result: pending

## Run record

(Plan 56-15 Task 4 appends the publish record and the PC1-PC5, PC7-PC10 observed values here. Plan 56-16 appends the rest.)

## Gaps

(empty until 56-16 runs the gate)

## Verdict

Verdict: pending
