# Phase 56 Live Gate (third contract): Grim Dawn (219990) on a FRESH bottle in DRM mode through the steamclient layer

Gate subject: Grim Dawn 219990, a SteamStub (`.bind`) title, reinstalled through the macOS native Steam bridge (fresh per-game
bottle) and then launched from GameLib for the first time in DRM mode (CrossOver 26.3.0.39832, component
`steamclient-layer-cx26.3.0.39832`, unchanged). Raft 648800 and Ranch Simulator 1119730 are recorded, non-blocking
comparisons. Ranch is also the vehicle for R1, the deterministic exercise of the stage timeout -> end session -> retry path.
Authored by: plan 56-33 Task 1. Run by: plan 56-34, after the 56-33 Task 2 approval. Plan 56-33 Task 3 records only the
author-side preflight (PC1-PC5, PC8-PC10) in the Run record.
`56-25-LIVE-GATE.md` is the scored record of the failed second run and is not edited. `56-15-LIVE-GATE.md` is the first.
Decision D-E: the author never runs the gate. Plan 56-33 launches no game and fills no scored `result:` line.
Plan 56-34 may fill `result:` lines, the Run record, Gaps and the Verdict placeholder, and pin observed trace call names
into item 6. It may not edit the contract otherwise.
Standing rule: strict-verified per D-15/D-16. The game process's lsteamclient `create-interface` stands in for HELLO; a
game-originated call beyond init (or a clean game-log init line) proves init. Helper lines and Mac Steam In-Game never
count. A failure never reroutes to bottled Steam.
A green test suite never closes this gate (live-gate-contract-authoring Section 4 ii).

Retry rule (binding on the runner): launch 1 is the FIRST Play of Grim Dawn on the fresh bottle and is the scored launch
(D-17). The product's own automatic stage retry inside that one Play (the `stage retry passed on attempt` path) counts as
launch 1: no user action, no dev restart. Any manual re-click of Play, any dev restart and any bottle or registry edit after a
launch-1 failure is evidence-only (label it `1b`, `evidence-only (post-FAIL)`) and cannot flip the verdict.

Done-when being gated (ROADMAP, Phase 56): Grim Dawn reinstalled through the bridge reaches its interactive main menu in
DRM mode with only Mac Steam running (no Windows Steam), and the game process's trace shows a game-originated Steamworks
call, with the component fetched from the published release.

## What changed since the 56-25 run (state this contract is built on)

The 56-25 run FAILED at item 3: launch 1 hung at the bottle-stage `reg add` (15000 ms) on a fresh bottle, twice (Grim Dawn
launch 1, Ranch launch 7). The 56-26 SUMMARY and `56-VERIFICATION.md` recorded the gaps below. This contract is built on
the work that answered them. No component change: COMPDIR, tag, archive URL and the lsteamclient.so pin are the 56-15 values.

- `61b5d14ef` (stage retry): a timed-out stage `reg add` ends the wedged stage session and retries once on a fresh session.
  It had never fired live before this gate.
- 56-27 (`3e7d63dfb`, `59f1dd9a2`): after DRM-setup progress, any failure sends a logged terminal `done` status so the card
  leaves its 'redist' label (verification gap 2, IN-01). Literal: `sent terminal status done`.
- 56-28 (`15fa338f8`): CEG signal read from the resolver's `drmExe` (CR-02, single-exe DRM signals).
- 56-29 (`0ddd86e35`): symlink-safe Shipping-exe containment in `detectLaunchDrmWrapper` (CR-01).
- 56-30 (`5fbd769a4`, `ca4cd8f2d`, `022de9cd2`, A-17 closure `61c223489`, `77ebb4e10`, `7c8bca1e6`): test-gate fixes. No
  live observable; a green suite still does not close this gate.
- 56-31 (`b0208ed8a`, `21b69f0b5`): id-grouped trace and wine-log retention (CR-03).
- 56-32 (`5028e07e7`, `6cdafa4a9`): the stage session's own wine log `<TRACEDIR>/<appId>-<id>.stage.wine.log`, the
  `bottle processes at timeout:` listing before the session is ended on every timed-out attempt, the
  `stage retry passed on attempt <n>` line, the dev-only `GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS` override (shortens attempt 0
  only), and `unref()` on the listing children.
- Quick `261029-e2t` (`fe658e1d7`): DRM-mode downloads are prefetched at the end of a bridge install, so the component fetch
  now normally happens in the launch-0 window, not at launch 1.
- Root cause of the stage hang (debug session `drm-stage-winebus-hid-spin`): a PowerA Switch 2 wired pad (USB VID 8406 /
  PID 42784) that macOS GameController does not claim is read by winebus through its raw IOHID path, which faults and spins
  `winedevice.exe`. That root cause is OUT OF SCOPE for Phase 56 (todo
  `2026-10-29-winebus-iohid-wedges-on-powera-switch2-pad`). This gate therefore treats a launch-1 wedge as a case the
  product's retry must absorb, records it (W1), and does not try to fix winebus.

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.

Paths used below:

- `<session>` = `/tmp/gamelib-gate-<ISO8601-UTC>/`, created once (by 56-33 Task 3, reused by 56-34)
- `SIDECAR` = `~/Library/Logs/GameLib/gamelib.log`
- `APPDIR` = `~/Library/Application Support/GameLib`
- `TRACEDIR` = `APPDIR/steam-bridge/drm/trace` (also the stage wine log directory: `buildDrmPaths(appFolder).traceRoot`, `drmLaunchSetup.ts:434`)
- `COMPDIR` = `APPDIR/steam-bridge/drm/component/steamclient-layer-cx26.3.0.39832`
- `BOTTLE(<id>)` = `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<id>`
- `VAULT` = `$(node -p 'require("os").tmpdir()')/gamelib-dev-secret-vault.json` (`devSecretVault.ts:82`, `getPath('temp')`)
- `DELTA(N)` = the lines of `<session>/gamelib-launch-<N>.log` after line `L`, where `L` is the number in
  `<session>/lines-before-launch-<N>.txt`: `tail -n +$((L+1)) <session>/gamelib-launch-<N>.log`
- archive URL = `https://github.com/grayson-mitchell/GameLib/releases/download/steamclient-layer-cx26.3.0.39832/steamclient-layer-cx26.3.0.39832.tar.gz`

## 1. Preconditions

| ID | Precondition | Command | Positive observable | Run by |
| --- | --- | --- | --- | --- |
| PC1 | Mac Steam running | `pgrep -x steam_osx` | Non-empty | 56-33 |
| PC2 | No Windows Steam anywhere | `ps -axo pid,command \| grep -iE 'steamwebhelper\.exe\|steamservice\.exe\|Steam\\steam\.exe' \| grep -v grep` | Prints nothing | 56-33 |
| PC3 | CrossOver is the allowlisted build | `defaults read /Applications/CrossOver.app/Contents/Info CFBundleVersion` | Prints `26.3.0.39832` | 56-33 |
| PC4 | Fresh build | `pnpm build-steam-bridge`, `pnpm exec vite build`, `pnpm build:sidecar-sea` | All exit 0. Measured at authoring: `build/main/sidecar.js` (mtime 1793227938) was OLDER than the newest `src/backend` commit (1793232633) and `grep -c 'stage retry passed on attempt'` on it was 0, so this rebuild is mandatory (memory: tauri dev does not rebuild the sidecar) | 56-33 |
| PC5 | Session dir and archived prior logs | `mkdir -p <session>`; `cp SIDECAR <session>/pre-session-gamelib.log`; `cp SIDECAR.old <session>/pre-session-gamelib.log.old` | `ls -la <session>` shows the copies (a missing source is recorded, not an error) | 56-33 |
| PC6 | Exactly one fresh dev app, sidecar carries the 56-27..56-32 literals | Operator restarts `pnpm tauri:dev` AFTER PC4 and PC5 under `tee -a <session>/terminal.log` (a dev restart after the rebuild is mandatory before launch 0). Once the operator says the window is VISIBLE: `pgrep -f 'target/debug/gamelib-shell' \| tee <session>/pc6-pid.txt \| wc -l`; `stat -f %m build/main/sidecar.js`; `git log -1 --format=%ct -- src/backend`; then for each literal `grep -c '<lit>' build/main/sidecar.js` with `<lit>` in `stage retry passed on attempt`, `stage wine log`, `GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS`, `sent terminal status done`; also `grep -c drmLaunchSetup build/main/sidecar.js` and `grep -c setupSteamClientForwarder build/main/sidecar.js`. Run again after the segment-B restart (Section 2) | pid count 1 and pid file non-empty (never capture before the window is up); sidecar.js mtime greater than the `src/backend` commit time; each of the four literal greps and the `drmLaunchSetup` grep at least 1; `setupSteamClientForwarder` grep 0 | 56-34 |
| PC7 | Grim Dawn bottle absent before reinstall | After the operator uninstalls Grim Dawn through GameLib (launch 0): `test ! -d BOTTLE(219990)` | Exit 0 | 56-34 |
| PC8 | COMPDIR absent so item 1 re-proves the fetch | `test ! -e COMPDIR`. If COMPDIR exists, the author moves it: `mv COMPDIR <session>/compdir-prior/` and records its mtime (COMPDIR is GameLib's cache; moving it is the only way item 1 can re-prove the fetch) | Exit 0 after the move; the moved directory and its mtime are recorded | 56-33 |
| PC9 | Published asset reachable | `curl -fsSIL <archive URL>` | HTTP 200 at the end of the redirects | 56-33 |
| PC10 | Raft and Ranch bottles present | `ls BOTTLE(648800)/drive_c/Program\ Files\ \(x86\)/Steam/steamapps/appmanifest_648800.acf`; the same for 1119730 | Both manifests exist | 56-33 |
| PC11 | Grim Dawn not installed anywhere else | `test ! -e ~/Library/Application\ Support/Steam/steamapps/appmanifest_219990.acf`; `find ~/Library/Application\ Support/CrossOver/Bottles -path '*/drive_c/*' -name appmanifest_219990.acf -not -path '*/GameLibSteamBridge-219990/*'`. Run after the operator's uninstall and before the reinstall | The `test` exits 0 and the `find` prints nothing. The old `GameLibGate52GD` bottle's manifest is expected to be ALREADY moved (56-26 record: moved to `gate52gd-prior/` of the earlier session). If the `find` prints `GameLibGate52GD/.../appmanifest_219990.acf` again, the fix is the same option-1 move: only that manifest into `<session>/gate52gd-prior/` with an `ORIGINAL_PATH.txt`, the bottle otherwise untouched, then re-run the `find` | 56-34 |
| PC12 | GameLib's own Steam session can install | `node -e 'const p=require("path").join(require("os").tmpdir(),"gamelib-dev-secret-vault.json");try{const v=JSON.parse(require("fs").readFileSync(p,"utf8"))["steam-refresh-token"];console.log(typeof v==="string"&&v.length>0?"present":"absent")}catch(e){console.log("no-file")}'` (prints only the word `present`, `absent` or `no-file`; never a value). Valid only for a dev app started by `pnpm tauri:dev` (dev vault, `package.json:32`) | Prints `present`. If `absent` or `no-file`: the operator does a QR re-login through GameLib before launch 0 and says "signed in", then the check is re-run and must print `present` (56-25 Gap 4: the UI showed Steam signed in while the vault held no token and the first Install was refused with `token-absent`) | 56-34 |
| PC13 | Controller (PowerA, VID 8406) state | `ioreg -p IOUSB -l -w0 \| grep -c '"idVendor" = 8406'`, recorded before launch 0 and again before launch 5 | Before launch 0: the count is recorded. Before launch 1: PAD STATE FOR LAUNCH 1 = CONNECTED (count 1; operator-approved 2026-10-29). Before launch 5: count 0 (pad unplugged, so R1 proves the retry mechanics without a second winebus wedge) | 56-34 |
| PC14 | Ranch registry reset for R1 (segment B only) | Run after the segment-A dev app is quit and launch 4 is archived: (1) `pgrep -fl GameLibSteamBridge-1119730` prints nothing and `ps -axwwE -o pid=,command= \| grep -c 'GameLibSteamBridge-1119730'` prints 0 (the ps line itself is excluded by `grep -v grep` if used; the count must be 0); (2) `cp BOTTLE(1119730)/user.reg <session>/ranch-user.reg.bak`; (3) reset: `awk '<RESET>' BOTTLE(1119730)/user.reg > <session>/ranch-user.reg.new && mv <session>/ranch-user.reg.new BOTTLE(1119730)/user.reg`; (4) count: `awk '<COUNT>' BOTTLE(1119730)/user.reg`; (5) `find BOTTLE(1119730)/drive_c -name gamelib_bridge.cfg` listed and left alone (the stage cleans it; 56-26 Gap 7). RESET removes ONLY `SteamClientDll64`, `Universe`, `SteamPath` under `[Software\\Valve\\Steam\\ActiveProcess]` and `SteamPath` under `[Software\\Valve\\Steam]`, i.e. the four values of `buildDrmRegistryCommands` (`stageDrmBottle.ts:113-127`). RESET = `/^\[/{h=$0; sub(/\] [0-9]+$/,"]",h); act=(h=="[Software\\\\Valve\\\\Steam\\\\ActiveProcess]"); stm=(h=="[Software\\\\Valve\\\\Steam]")} (act && /^"(SteamClientDll64\|Universe\|SteamPath)"=/) {next} (stm && /^"SteamPath"=/) {next} {print}`. COUNT = the same header block, then `(act && /^"(SteamClientDll64\|Universe\|SteamPath)"=/) {n++} (stm && /^"SteamPath"=/) {n++} END{print n+0}`. Both were exercised on a synthetic hive on 2026-10-29: COUNT 4 before, 0 after, and the diff removed exactly those four lines (an `[Software\\Other]` section with the same value names was untouched) | Step 1 prints nothing and 0; step 3 backup exists; step 4 prints `0` (and printed 4 on the pre-reset file if the Ranch bottle was staged; any other pre-reset value is recorded) | 56-34 |

PC1-PC5, PC8-PC10 are run and recorded by 56-33 Task 3. PC6, PC7, PC11-PC14 are run by 56-34 (they need the operator's dev
start, the uninstall, the pad and the segment-B restart). PC7 and PC11 run after the operator's uninstall and before the
reinstall. PC12 and PC13 (first reading) run before launch 0.

## 2. Launch procedure

Two dev segments. Segment A is one dev session; segment B is a second dev session started with the forced-timeout override.

Segment A (plain `pnpm tauri:dev`, no override):

- launch 0: not a game launch. The operator uninstalls Grim Dawn through GameLib (game page menu or card, Uninstall), PC7 and
  PC11 are read, then the operator reinstalls it through the bridge (card Install). Items 2, G2, G3 and (if present) the
  prefetch line are read from this window. This creates the FRESH bottle (Section 4e). Delimiter `=== GATE LAUNCH 0 ...`
  is written before the uninstall click.
- launch 1: Grim Dawn (219990), the FIRST Play after the reinstall. SCORED. Items 1, 3-7, S1, G3, W1, C1.
- launch 2: Grim Dawn again (G9, a repeat launch on the now-staged bottle).
- launch 3: Raft (648800) (item 8).
- launch 4: Ranch Simulator (1119730) (item 9, G11). Ranch's own first-run stage behaviour is recorded here.

Then: copy SIDECAR to `<session>/gamelib-segmentA-final.log`, quit the dev app, run PC14, and start segment B.

Segment B (new dev session, new `gamelib.log`; the restart renames the old one to `gamelib.log.old`):

`GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS=300 pnpm tauri:dev 2>&1 | tee -a <session>/terminal.log`

- Run PC6 again (the pid is a NEW pid; record it as the segment-B pid) and PC13's second reading.
- launch 5: Ranch Simulator (1119730), first Play after the registry reset (R1).
- launch 6: Grim Dawn with the HKLM diagnostic, only if Grim Dawn failed launch 1 on item 4, 5 or 6 (item 11). The forced-timeout
  override is harmless here: the Grim Dawn bottle is already staged, so no stage runs.

Before each launch (including launch 0 and launch 5):

1. Assert one app instance: `pgrep -f 'target/debug/gamelib-shell' | wc -l` is 1 and the PID equals PC6's for the current
   segment. Any other count aborts the launch (its evidence is not scorable).
2. Write the delimiter (exact text) into the transcript, for EVERY launch:
   `echo "=== GATE LAUNCH <N> — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session>/terminal.log`
   Dev runs under `tee -a <session>/terminal.log`. Never a bare `tee`, never a `>` redirect. Boundaries are found with
   `grep -n '^=== GATE LAUNCH' <session>/terminal.log`. A launch with no delimiter is aligned by timestamp and recorded as such.
3. Record the line count and anchor count before the launch (the sidecar log is cumulative within a segment, so a launch is
   scored by DELTA(N)): `wc -l < SIDECAR | tee <session>/lines-before-launch-<N>.txt`;
   `grep -c '\[bridge-drm\] appId=<id> mode=steamclient-layer' SIDECAR | tee <session>/anchors-before-launch-<N>.txt`.
   For the first launch of segment B the line count is whatever the new log holds (normally under 50).
4. Pad state: read PC13 and write the count into `<session>/pad-before-launch-<N>.txt`.

At the game menu the operator pastes:
`ps -axo pid,command | grep -iE 'steamwebhelper\.exe|steamservice\.exe|steam\.exe' | grep -v grep | tee <session>/procs-launch-<N>.txt; pgrep -x steam_osx | tee -a <session>/procs-launch-<N>.txt`
Then they quit the game from its menu.

After the game exits (the trace re-log runs after exit, per 56-12) and BEFORE any further launch or dev restart:

- `cp SIDECAR <session>/gamelib-launch-<N>.log` (cumulative within the segment; score by DELTA(N))
- copy the newest `TRACEDIR/<appId>-*.log` that is not a `.wine.log` to `<session>/trace-launch-<N>.log`
- copy the matching per-launch wine log `TRACEDIR/<appId>-<n>.wine.log` (path printed by the
  `SteamGame: drm launch appId <id>: wine log <path>` line) to `<session>/wine-launch-<N>.log`
- copy the stage wine log (path printed by the `stageDrmBottle: appId <id> stage wine log <path>` line in DELTA(N);
  `TRACEDIR/<appId>-<id>.stage.wine.log`) to `<session>/stage-wine-launch-<N>.log`. It exists only if a stage ran. A stage that
  ended in failure leaves no game launch, so the stage log copy is taken as soon as the failure notice is dismissed.
- copy the bottle's `system.reg` to `<session>/system-reg-launch-<N>.reg`

Run the census (`pnpm -s bridge-census --json`) right after launch 1 is archived, in segment A, before any dev restart.
Never restart dev between launches within a segment. The restart renames gamelib.log, and the census reads the live file. If
dev dies or must be restarted, copy SIDECAR first, and every later launch is scored against the new session log only.
Raw captures stay in `<session>` and are never committed. The Tests quote only literals and call names, never SteamID
values or persona names.
Closing inventory: `ls -la <session>/` and `wc -l <session>/*`, recorded in the Run record.

## 3. Scored items

Each item names its sink file and launch ordinal. The gate PASSES only when items 1-7, G3, G9, S1 and R1 all pass. Items 8-11,
G2, G10, G11, C1 and W1 never block.

- Item 1 (launch 0 window or launch 1, sink: filesystem plus SIDECAR): COMPDIR holds exactly the six names `lsteamclient.dll`, `lsteamclient.so`, `detour-cx26.3.0.39832.bin`, `steam.exe`, `LICENSE.lsteamclient`, `NOTICE`; `shasum -a 256 COMPDIR/lsteamclient.so` equals `dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d`; `codesign -dv COMPDIR/lsteamclient.so` reports `not signed at all`. The fetch is proven only if PC8 found COMPDIR absent after the author's move AND one of these two lines carries `component=download`: `drm prefetch: appId 219990 ready ... component=download` in DELTA(0) (the install-time prefetch, `drmLaunchSetup.ts:602`, quick 261029-e2t), OR `drm setup: appId 219990 ready ... component=download` in DELTA(1) (`drmLaunchSetup.ts:455`). Commands: `grep -E 'drm prefetch: appId 219990 ready .* component=download' <DELTA(0)>`; `grep -E 'drm setup: appId 219990 ready .* component=download' <DELTA(1)>`. The line `steamclient-layer: steamclient-layer-cx26.3.0.39832 downloaded and verified` (`steamclientLayerInstall.ts:451`) is recorded as corroboration. If neither `component=download` line exists but the filesystem checks pass, record "component present, fetch not re-proved" and score item 1 FAIL only on the filesystem checks; the fetch proof is then recorded in Gaps (a `component=cache` line means the prefetch ran against a cache the PC8 move should have removed; record it). Item 1 never depends on a line that cannot print after an early stop: either of the two lines suffices, and the `downloaded and verified` line stands in as the third corroboration.
- Item 2 (launch 0 reinstall, sink: filesystem plus SIDECAR): after the reinstall, `BOTTLE(219990)` exists and its `appmanifest_219990.acf` has `"StateFlags" "4"`. Fresh-bottle provenance (D-17), both read from DELTA(0): `grep -c 'SteamGame: bridge bottle "GameLibSteamBridge-219990" not yet provisioned for appId 219990'` at least 1 AND `grep -c 'provisionBridgeBottle: bridge bottle "GameLibSteamBridge-219990" created'` at least 1. If either line is missing the bottle was not created by this reinstall and the item FAILS (the scored launch would not be on a fresh bottle).
- Item 3 (launch 1, sink: `gamelib-launch-1.log`, DELTA(1)): exactly one `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` line (anchor delta against `anchors-before-launch-1.txt` is 1) and zero `[bridge-notice] appId=219990 reason=drm-` lines, AND at least one `stageDrmBottle: appId 219990 registry not staged:` line (proves the fresh-bottle stage path ran in launch 1). If DELTA(1) also contains `stage retry passed on attempt`, item 3 still passes (the in-product retry is launch 1) and W1 records a natural wedge recovered. A notice line fails the item and names the step.
- Item 4 (launch 1, sink: operator plus `procs-launch-1.txt`): the main menu is interactive (Gap 7 regression check: Grim Dawn started from the install root); `procs-launch-1.txt` has no `steamwebhelper.exe` or `steamservice.exe` line and has a steam_osx pid. Any `steam.exe` line is the GameLib helper at `C:\Program Files (x86)\Steam\steam.exe`. The result depends on the operator's report and the procs file only; no log line is required to print.
- Item 5 (launch 1, sink: `gamelib-launch-1.log` DELTA(1)): at least one `bridge drm [219990]: [drm-trace] appId=219990 pid=<g> role=game event=create-interface` line; `<g>` equals no role=helper pid in the same file; the ifaces seen are recorded.
- Item 6 (launch 1, sinks: live `gamelib.log` via the census, and `trace-launch-1.log`): `pnpm -s bridge-census --json` filtered to appid 219990 shows evidence `verified` with an evidenceDetail starting `game call ` or equal to `game log init`. Record verbatim, in two lists, every distinct `name=` value per role from `trace-launch-1.log`. None of the counting names starts with `ISteamClient_` or matches `SetMinidumpSteamID` (a counting name list that is empty after that exclusion means the verdict rests on `game log init` only, and that is recorded). The runner pins the observed names into this item afterwards; that is the only contract edit a run task may make. Run the census BEFORE any dev restart, while SIDECAR still holds launch 1 (segment A).
- Item 7 (launch 1, sinks: `system-reg-launch-1.reg`, `wine-launch-1.log`):
  - 7a: the count of `"InstallPath"=` value lines inside a section whose header is exactly `[Software\\Valve\\Steam]` or `[Software\\Wow6432Node\\Valve\\Steam]` is 0. Command (an awk section scan, not a prefix regex; `Apps\\CommonRedist` sections and every other section never count):
    `awk '/^\[/{h=$0; sub(/\] [0-9]+$/,"]",h); insec=(h=="[Software\\\\Valve\\\\Steam]"||h=="[Software\\\\Wow6432Node\\\\Valve\\\\Steam]"); next} insec && /^"InstallPath"=/{n++} END{print n+0}' <session>/system-reg-launch-1.reg`
    The `Apps\\CommonRedist` HasRun marks written at install time are expected and recorded (count of headers beginning `[Software\\Wow6432Node\\Valve\\Steam\\Apps\\CommonRedist`), never failed.
  - 7b (CONDITIONAL, see review): zero `gamelib-steam-helper: refusing steam relaunch request` lines in `wine-launch-1.log`, scorable only if 4a shows the sink carries helper stderr; otherwise recorded as "no sink, unscored".
  - 7c: any `steamclient_init_registry unavailable` line is recorded (A8), never fails the item.
- Item 8 (launch 3, non-blocking): Raft 648800 scored as items 3-6 (item 3's `registry not staged:` clause is not required, the Raft bottle is already staged). The result is `verified`, `reached menu (census <evidenceDetail>)`, or `failed at <step>`. Also record whether the first DRM launch removed the Phase 52 leftovers: `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` prints nothing, and the G9 measures for this launch (anchor delta, zero `reason=drm-bottle-stage`, whether `registry not staged:` appeared).
- Item 9 (launch 4, non-blocking): Ranch Simulator 1119730, same as item 8. Record the exit code if one is logged (the spike 040 exit-53 variant), and whether the stage ran (`registry not staged:`) and how it ended. The routing question itself is G11.
- Item 10 (launches 0-6, non-blocking): `grep -c SteamNetworkingSocketsSerialized005` over every `<session>/*-launch-*` file, recorded per file. A hit points at 56-02's omitted `serialized005.patch` / `steamworks_sdk_165x`.
- Item 11 (launch 6, conditional, non-blocking): only if item 4, 5 or 6 failed on launch 1 (D-21, once). Write the two F7 keys `HKLM\Software\Wow6432Node\Valve\Steam` and `HKLM\Software\Valve\Steam` (each value `InstallPath` REG_SZ `C:\Program Files (x86)\Steam`) with `reg add` using the 56-01 launch_form (`bin/wine` + `CX_BOTTLE`) under the clone runner; launch Grim Dawn; score items 3-6; remove the keys: for each key run `reg delete "<key>" /v InstallPath /f`, then `reg query "<key>"`, and delete the key itself (`reg delete "<key>" /f`) ONLY if the query shows no values and no subkeys. NEVER run `reg delete` on a key whose query shows subkeys (the Wow6432Node key holds `Apps\CommonRedist`). Record the CommonRedist header count (item 7a's second awk) in the system.reg copy before the add and after the removal; the two must be equal. Re-check 7a on the live system.reg. The result is `skipped` when Grim Dawn passed. A stage timeout here is recorded with the winebus captures (Section 4e).
- G2 (launch 0, non-blocking): zero lines containing `requires a user notice before any install` and `appId 219990` in DELTA(0) (the window after the launch-0 delimiter, before launch 1). The operator also records whether any route-notice dialog appeared during the reinstall.
- G3 (launch 0 then launch 1, BLOCKING): after the reinstall finishes, WITHOUT any dev restart (the segment-A PC6 pid is unchanged): the operator reports Play is enabled on the Grim Dawn card/page (not "Installing DirectX Jun2010"/redist), and clicking Play reaches the backend: DELTA(1) has `drm setup: appId 219990` lines within 30 s of the click and the check fails if the click produces none or the pid changed. The status update itself is not logged, so the operator observation is the primary observable and the backend lines are the corroboration. The `[bridge-drm] appId=219990` anchor is item 3's job, not G3's (an early stop must not fail G3 on a line that cannot print).
- G9 (launch 2, BLOCKING, Gap 9): the Grim Dawn repeat launch in the same dev session and the same bottle logs one anchor (anchor delta against `anchors-before-launch-2.txt` is exactly 1) and DELTA(2) contains zero `reason=drm-bottle-stage`. Also record whether `registry not staged:` appeared (it should not on a repeat launch of a staged bottle) and whether the game reached its menu (operator). The winebus carve-out of 56-25 is retained only as a recorded classification: a `timed out after` on a repeat launch of an already-staged bottle fails G9; a timeout whose `registry not staged:` line shows a real mismatch is recorded as a residual risk with the PC13 pad state.
- G10 (every launch where a notice fires, non-blocking): every `[bridge-notice] appId=<id> dispatched=` line has a following `[bridge-notice] appId=<id> display=confirmed elapsedMs=` line within 10 s, and no `display=unconfirmed`. N/A when no notice fires in the whole run (expected if everything passes; a notice only fires on a failure).
- G11 (launch 4, non-blocking): the Ranch launch routes to DRM mode. Primary observable: `SteamGame: appId 1119730 SteamStub .bind found on` (UE runtime exe, `games.ts:3768`) AND `bottle: appId 1119730 uses DRM runner` in DELTA(4); when the stage and launch complete the anchor `[bridge-drm] appId=1119730 mode=steamclient-layer` is also present. The outcome is recorded: verified, menu reached, or failed at a step with any exit code. An ordinary-bridge-path `reason=stubbed:` notice and no `.bind found` line means Gap 11 stands. G11 does not depend on the anchor line, which cannot print after an early stop.
- S1 (launch 1, BLOCKING, sink: DELTA(1) and the stage wine log file): the stage session wrote its log. All of: DELTA(1) contains `stageDrmBottle: appId 219990 stage wine log <path>`; that `<path>` exists (`test -f`) and is also copied to `stage-wine-launch-1.log`; the first line of the file starts `[gamelib] stage session appId=219990`; the file contains `[gamelib] stage attempt 0`. Commands: `P=$(grep -m1 -o 'stage wine log .*' <DELTA(1)> | sed 's/^stage wine log //')`; `test -f "$P"`; `head -1 "$P" | grep -c '^\[gamelib\] stage session appId=219990'`; `grep -c '\[gamelib\] stage attempt 0' "$P"`.
- R1 (launch 5, BLOCKING, sink: the segment-B `gamelib-launch-5.log` DELTA(5) and `stage-wine-launch-5.log`): the forced first timeout drives the whole retry path, in this ORDER, all for appId 1119730 (PC14 made the bottle unstaged and the pad is unplugged per PC13): (1) `first stage attempt timeout forced to 300 ms`, (2) `timed out after 300 ms; ending the stage session and retrying`, (3) `bottle processes at timeout:`, (4) `ended stage session, killed ` (prefix only), (5) `stage retry passed on attempt 1`, (6) the `[bridge-drm] appId=1119730 mode=steamclient-layer` anchor; AND zero `reason=drm-bottle-stage` lines in DELTA(5); AND `stage-wine-launch-5.log` contains `[gamelib] stage attempt 0` and `[gamelib] stage attempt 1` and the `bottle processes at timeout:` listing. R1 passes on the ORDER of those six literals, the zero-notice count and the stage-log markers ONLY. The N in `killed <N> leftover process(es)` is recorded in the Run record as informational and does NOT score (see 4c). The operator reports Ranch's outcome (menu or the known non-blocking Ranch result); that outcome is recorded and never scored by R1. Order command: `awk '/appId 1119730 first stage attempt timeout forced to 300 ms/&&!a{a=NR} /appId 1119730 .*timed out after 300 ms; ending the stage session and retrying/&&a&&!b{b=NR} /appId 1119730 bottle processes at timeout:/&&b&&!c{c=NR} /appId 1119730 ended stage session, killed /&&c&&!d{d=NR} /appId 1119730 stage retry passed on attempt 1/&&d&&!e{e=NR} /\[bridge-drm\] appId=1119730 mode=steamclient-layer/&&e&&!f{f=NR} END{print (f>0)?"ORDER-OK":"ORDER-BROKEN",a+0,b+0,c+0,d+0,e+0,f+0}' <DELTA(5)>`. If the `forced to 300 ms` line is absent the override did not reach the sidecar (segment B was not started with it, or PC6's `GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS` grep failed): R1 FAILS and the cause is recorded.
- C1 (any DRM-setup failure in the run, non-blocking): for each `drm setup: appId <id> stopped at <stage>` line in any DELTA, a `drm setup: appId <id> sent terminal status done after <stage>` line follows it (`drmLaunchSetup.ts:336` then `:352`), or, for a failed `launchDrmModeGame` after progress, `SteamGame: drm launch appId <id> sent terminal status done after launch failure` (`games.ts:3833`). The operator confirms the card shows Play with no dev restart. N/A if the run has no `stopped at` line. A `stopped at` line with no following `sent terminal status done` is recorded with the operator's card report (the status is sent only when progress was sent, `drmLaunchSetup.ts:311-317`).
- W1 (launch 1, recorded, non-blocking): the PowerA pad count at launch 1 (`pad-before-launch-1.txt`), whether `timed out after 15000 ms` occurred in DELTA(1), whether `stage retry passed on attempt` occurred, and the retry outcome (recovered, second wedge, or no wedge). A natural wedge recovered is the open falsification test of the debug session: the retry's fresh session also enumerates the pad.

Failure diagnosis hints for the runner (record, never silently widen scope):

- DLL-not-found for `lsteamclient` or the `steamclient64` family in `wine-launch-<N>.log`: 56-12 set no WINEDLLPATH (56-01 `dllpath_channel: not-needed`), but 56-01's prose says anything outside the clone, including `steamDirHost`, must go through `CX_ENV="WINEDLLPATH=<paths>"`. Record it as the cause and file a todo; do not patch in this run.
- A launch failing at `runner-clone` or with an empty trace after the game starts: the clone path contains a space (`Application Support`); record it as the cause.
- `valve-fetch`/`valve-verify` notice: record the HTTP status.
- A launch-1 stage timeout: the stage wine log, the `bottle processes at timeout:` line and `ps -axo pid,pcpu,command | grep -iE 'wine|winedevice'` are captured BEFORE anything is killed by hand. Record under Gaps as the winebus risk; do not patch in this run.
- Grim Dawn failing item 4 again: first check the wine log for a missing `database.arz` (the Gap 7 cause) before assuming a Steam-layer defect.
- `GAMELIB_DRM_WINEDEBUG=<channels>` is a diagnostic aid only; a gate-scoring run does not use it.

## 4. Structural Reachability Review

Authored 2026-10-29 by 56-33. Verdict legend: R = REACHABLE, N/A with reason, C = CONDITIONAL. The Verdict cell gives one result per test, Test 1 to Test 7. Emitters were grepped in current source on 2026-10-29 (`grep -rnF` over `src` and `native`, test files excluded).

### 4a. Emitter and sink table (Test 3 with the SINK clause)

| Literal | Emitter (file:line) | Sink | Captured by |
| --- | --- | --- | --- |
| `[bridge-drm] appId=... mode=steamclient-layer ...` | `formatBridgeDrmAnchor` (`bridge/drm/steamclientLayerMode.ts:149`), built at `games.ts:3666`, logged by `logInfo(drm.anchorLine, ...)` at `games.ts:4361` | SIDECAR (`logInfo`); never terminal.log | `gamelib-launch-<N>.log` |
| `drm setup: appId <id> ready ... component=` | `drmLaunchSetup.ts:455` | SIDECAR | `gamelib-launch-<N>.log` |
| `drm prefetch: appId <id> ready ... component=` | `drmLaunchSetup.ts:602` (prefetch at install, called from `prefetchBridgeDrmDownloads`, `games.ts:3585-3595`) | SIDECAR | `gamelib-launch-<N>.log` (DELTA(0)) |
| `drm setup: appId <id> stopped at <stage>` | `drmLaunchSetup.ts:336` | SIDECAR | `gamelib-launch-<N>.log` |
| `drm setup: appId <id> sent terminal status done after <stage>` (NEW, 56-27) | `drmLaunchSetup.ts:352` | SIDECAR | `gamelib-launch-<N>.log` |
| `SteamGame: drm launch appId <id> sent terminal status done after launch failure` (NEW, 56-27) | `games.ts:3833` | SIDECAR | `gamelib-launch-<N>.log` |
| `steamclient-layer: <id> downloaded and verified` | `steamclientLayerInstall.ts:451` | SIDECAR | `gamelib-launch-<N>.log` |
| `bridge drm [<id>]: [drm-trace] ...` re-log | `relogDrmTrace` `games.ts:1032`, relog line at `games.ts:1059`, prefix `drmRelogPrefix` `drmTrace.ts:143`, called from `relogOnce` `games.ts:4143` (invoked at `:4349`, `:4416`, `:4422`) | SIDECAR | `gamelib-launch-<N>.log` |
| `[drm-trace] ... event=create-interface` / `event=call name=` (raw) | `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:193` and `:248` | TRACEDIR file | `trace-launch-<N>.log` |
| `[bridge-notice] appId=... reason=drm-<step> cause=...` | `maybeNotifyDrmModeFailed` logs `formatDrmNoticeLine` at `games.ts:3533` (defined `steamclientLayerMode.ts:120`) | SIDECAR | `gamelib-launch-<N>.log` |
| `[bridge-notice] appId=<id> dispatched=in-app-dialog+notify ... display=pending` | `games.ts:3570` | SIDECAR | `gamelib-launch-<N>.log` |
| `[bridge-notice] appId=<id> display=confirmed elapsedMs=` / `display=unconfirmed timeout=` | `games.ts:3558` / `:3559` (ack sent by `DialogHandler/index.tsx:119`) | SIDECAR | `gamelib-launch-<N>.log` |
| `SteamGame: drm launch appId <id>: wine log <path>` | `games.ts:4388` (path from `drmWineLogPathFor`, `games.ts:902`) | SIDECAR | `gamelib-launch-<N>.log` |
| per-launch wine log file content | `createDrmWineLogAppender` `games.ts:~916-941`, fed by `onOutput` in the launch | `<TRACEDIR>/<appId>-<n>.wine.log` | `wine-launch-<N>.log` |
| `bottle: appId <id> uses DRM runner crossover-<build>` | `bottle.ts:1568` | SIDECAR | `gamelib-launch-<N>.log` |
| `SteamGame: appId <id> SteamStub .bind found on <exe> (UE runtime exe)` | `games.ts:3768` | SIDECAR | `gamelib-launch-<N>.log` |
| `stageDrmBottle: appId <id> registry not staged:` | `stageDrmBottle.ts:890` (inside `if (regStat && regStat.isFile())`; the 56-25 run printed it on a freshly reinstalled Grim Dawn bottle, so a fresh bottle has a `user.reg`) | SIDECAR | `gamelib-launch-<N>.log` |
| `stageDrmBottle: appId <id> stage wine log <path>` (NEW, 56-32) | `stageDrmBottle.ts:915` (only when the registry is not staged and `input.stageLogDir` is set, `drmLaunchSetup.ts:434,447`) | SIDECAR | `gamelib-launch-<N>.log` |
| stage log header `[gamelib] stage session appId=<id> bottle=<name> started=` (NEW) | `stageWineLog.ts:115`; file name `${appId}-${id}.stage.wine.log` at `stageWineLog.ts:85` | `<TRACEDIR>/<appId>-<id>.stage.wine.log` (0600, 2 MiB cap, keep 8) | `stage-wine-launch-<N>.log` |
| `[gamelib] stage attempt 0` / `[gamelib] stage attempt <n>` (NEW) | `stageDrmBottle.ts:962` / `:983` | stage wine log | `stage-wine-launch-<N>.log` |
| `stageDrmBottle: appId <id> first stage attempt timeout forced to <ms> ms (GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS, dev only)` (NEW) | `stageDrmBottle.ts:944`; override parsed at `:694-703` (3-5 digits, ignored by a packaged sidecar) | SIDECAR | segment-B `gamelib-launch-5.log` |
| `stageDrmBottle: appId <id> reg add <value> timed out after <ms> ms; ending the stage session and retrying` | message built at `runRegArgv` (`stageDrmBottle.ts:723`), logged at `:973` | SIDECAR | `gamelib-launch-<N>.log` |
| `stageDrmBottle: appId <id> bottle processes at timeout:` (now before the session is ended, also in the stage log) | `stageDrmBottle.ts:955` (`logWarning` plus `sink.write`) | SIDECAR and stage wine log | `gamelib-launch-<N>.log`, `stage-wine-launch-<N>.log` |
| `stageDrmBottle: appId <id> ended stage session, killed <N> leftover process(es)` | `defaultEndStageSession` `stageDrmBottle.ts:685` | SIDECAR | `gamelib-launch-<N>.log` |
| `stageDrmBottle: appId <id> stage retry passed on attempt <n>` (NEW) | `stageDrmBottle.ts:988` | SIDECAR | `gamelib-launch-<N>.log` |
| `SteamGame: appId <id> <route> route (...) requires a user notice before any install` | `games.ts:1816` | SIDECAR (emitted before the frontend message) | `gamelib-launch-0.log` |
| `SteamGame: bridge bottle "<name>" not yet provisioned for appId <id>` | `games.ts:2159` (branch `!isBridgeBottleReady` at `games.ts:2156`) | SIDECAR | `gamelib-launch-0.log` |
| `provisionBridgeBottle: bridge bottle "<name>" created (no Windows Steam client installed` | `bottle.ts:2040` | SIDECAR | `gamelib-launch-0.log` |
| final `done` status after the redist step (G3) | `sendGameStatusUpdate({... status:'done'})` in the install `finally`; not logged | frontend message; NOT logged | operator observation of Play (see G3) |
| `gamelib-steam-helper: refusing steam relaunch request` | `native/steam-bridge/steamclient-layer/helper/steam.c:135` (`fail("refusing steam relaunch request", 3)`, prefix added by `fail`) | the helper's stderr inside the Wine process | `wine-launch-<N>.log` ONLY IF Wine's stderr reaches `onOutput` for `wait:false` (unconfirmed, CONDITIONAL) |
| `gamelib-steam-helper: steamclient_init_registry unavailable` | `helper/steam.c:171` | same | same, CONDITIONAL |
| `"StateFlags" "4"` | appmanifest written by the depot install engine | filesystem | direct read |
| `"InstallPath"=` under `[Software\\...\\Valve\\Steam]` | the registry hive `system.reg` | filesystem | `system-reg-launch-<N>.reg` |
| the four DRM `user.reg` values | `buildDrmRegistryCommands` `stageDrmBottle.ts:113-127`; mismatch reader `drmRegistryMismatches` `:~160-185` | filesystem (`user.reg`) | PC14 COUNT awk |
| `[dev-secret-vault]` token slot | `devSecretVault.ts:82,90,95` (`steam-refresh-token`) | `VAULT` file | PC12 (presence word only) |

Consequence for item 7b: unchanged from 56-25. The per-launch wine log is the best candidate sink for the helper's stderr, but no run has shown the helper's stderr reaches `onOutput`. 7b is CONDITIONAL: scorable only if the runner finds ANY `gamelib-steam-helper:` line, or any helper stderr text, in `wine-launch-1.log`. With no such line the sink is unproven, the absence proves nothing (Test 4), and 7b is recorded "no sink, unscored". The structural backstop is unchanged: a refused relaunch is exit 3, the game never starts, and items 4-6 would fail.

### 4b. Item, sub-check and precondition table

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict (Test 1 to Test 7) | Evidence |
| --- | --- | --- | --- | --- |
| PC1 Mac Steam running | external process steam_osx | running | T1 N/A; T2 N/A; T3 N/A; T4 N/A; T5 R; T6 R positive observable is a non-empty pgrep; T7 N/A | `pgrep -x steam_osx` |
| PC2 no Windows Steam | process table | empty ps grep | T1 N/A; T2 N/A; T3 N/A; T4 R falsifiable, a running Windows Steam appears in ps; T5 R; T6 R positive observable is the ps output itself; T7 N/A | ps command in Section 1 |
| PC3 CrossOver build | /Applications/CrossOver.app | `26.3.0.39832` | T1-T4 N/A; T5 R; T6 R reads the installed bundle; T7 N/A | `defaults read` |
| PC4 fresh build | build tooling | exit 0 | T1-T4 N/A; T5 C flagged pair 1 (rebuild precedes the dev restart); T6 N/A; T7 N/A | package.json scripts; sidecar.js measured stale at authoring (grep for the new literal returned 0) |
| PC5 session archive | SIDECAR and .old | copies | T1 N/A; T2 N/A; T3 R reads SIDECAR; T4 N/A; T5 C flagged pair 1; T6 N/A; T7 N/A | `src/backend/logger/log_writer.ts:72-74` renames gamelib.log to .old on first write |
| PC6 one fresh dev app, sidecar carries the new literals | dev app, sidecar.js | single PID, fresh sidecar, four literals present | T1-T4 N/A; T5 C flagged pairs 1 and 6 (also re-run after the segment-B restart); T6 R already-running instance checked by count 1, pid captured only after the window is visible, literal greps are positive observables (>= 1) on a file measured stale at authoring; T7 N/A operator starts dev from a shell | `pgrep`, `stat -f %m`, `git log -1 --format=%ct -- src/backend`, `grep -c <lit>` |
| PC7 Grim Dawn bottle absent | filesystem | dir absent after uninstall | T1-T3 N/A; T4 R falsifiable, a present bottle fails `test ! -d`; T5 C flagged pair 3; T6 R positive observable is item 2's new manifest after the reinstall; T7 R uninstall gesture in 4f | `test ! -d` |
| PC8 COMPDIR absent | COMPDIR | absent after the author's move | T1-T4 N/A; T5 C flagged pair 4; T6 R a moved prior COMPDIR is recorded with mtime, so item 1 proves the fetch; T7 N/A | `test ! -e COMPDIR`, `mv` to `<session>/compdir-prior/` |
| PC9 asset reachable | GitHub releases CDN | HTTP 200 | T1 R https URL; T2-T4 N/A; T5 R; T6 R positive observable is the 200; T7 N/A | `curl -fsSIL` |
| PC10 Raft/Ranch bottles | filesystem | manifests exist | T1-T4 N/A; T5 R; T6 R positive observable is the manifest file; T7 N/A | manifest paths in Section 1 |
| PC11 Grim Dawn not elsewhere | Mac Steam steamapps, all CrossOver bottles | manifest absent everywhere except the target | T1-T3 N/A; T4 R falsifiable, a found manifest prints a path; T5 C flagged pair 3; T6 R this PC IS the external-state check; the old `GameLibGate52GD` manifest is expected already moved, with the same move as the fix if it reappears; T7 R card state in 4f | `test ! -e`, `find ... -name appmanifest_219990.acf` |
| PC12 GameLib Steam session | `VAULT` file | `present` | T1-T3 N/A; T4 R falsifiable, `absent`/`no-file` is a distinct printed word; T5 N/A; T6 R this PC IS the external-state check for 56-25 Gap 4; it checks the vault slot only, never a value, and does not prove the token is still valid (the Install attempt in item 2 does); the QR re-login is the fallback; T7 R QR login is an operator gesture in GameLib | the node one-liner |
| PC13 pad state | USB bus | count 1 or 0 | T1-T3 N/A; T4 R falsifiable, `grep -c` prints 0 or 1; T5 C flagged pair 13; T6 R this PC IS the external-state check for the winebus defect; positive observable is the printed count and the operator's physical state; T7 R plug/unplug is an operator physical gesture | `ioreg` command |
| PC14 Ranch registry reset | Ranch bottle `user.reg` | no live bottle process, backup, four values gone | T1-T3 N/A; T4 R falsifiable, the COUNT awk prints 4 on a staged hive and 0 after; T5 C flagged pairs 8 and 9; T6 R positive observable is COUNT 0 and the backup file; T7 R reset is a shell step after the dev app is quit | RESET/COUNT awks (exercised on a synthetic hive) |
| Item 1 component fetched | COMPDIR, codesign, SIDECAR | six names, pinned sha, unsigned, fetch line | T1 R fetched over https; T2 N/A; T3 R filesystem sink read directly; the `component=download` line has two emitters (`drmLaunchSetup.ts:602` in DELTA(0), `:455` in DELTA(1)) so an early stop at launch 1 cannot erase the evidence; T4 N/A presence assertion; T5 C flagged pair 4; T6 C depends on PC8 and on the network reaching github.com and Valve's CDN; T7 N/A | catalogue pin in `src/common/steamclientLayerCatalogue.ts`; CONDITIONAL on PC8 and network: scorable once COMPDIR is absent at the launch-0 delimiter |
| Item 2 reinstall, fresh bottle | bottle manifest, SIDECAR | StateFlags 4 plus the two provenance lines | T1-T2 N/A; T3 R emitters `games.ts:2159`, `bottle.ts:2040`, sink SIDECAR DELTA(0); T4 R falsifiable, a reused bottle would lack the `not yet provisioned` line; T5 C flagged pair 3; T6 C depends on Grim Dawn being owned by the signed-in account (PC12) and the native-install setting (4f); T7 see 4f | `appmanifest_219990.acf`, DELTA(0) greps |
| Item 3 anchor, zero notices, fresh-bottle path | SIDECAR | one anchor (delta), zero notices, `registry not staged:` >= 1 | T1 N/A; T2 N/A; T3 R emitters in 4a, sink SIDECAR copy; T4 R the notice path logs on every step failure (`games.ts:3533`) and `registry not staged:` is a presence assertion with a stage-log corroboration (S1); T5 C flagged pair 2 (cumulative copy: score by DELTA); T6 C the `registry not staged:` line prints only if the fresh bottle has a `user.reg` (the 56-25 run printed it on a reinstalled bottle; if it does not print, S1's stage log is the fallback proof the stage path ran and is recorded); T7 N/A | 4a rows |
| Item 4 menu, only Mac Steam | operator, ps output | interactive menu, process list | T1-T3 N/A; T4 R falsifiable (Windows Steam processes appear in ps); T5 R; T6 R positive observable is the steam_osx pid in the same file; T7 R operator observes the game window, a judgement no log makes | procs-launch-1.txt |
| Item 5 game attach | SIDECAR re-log | role=game create-interface, pid not a helper pid | T1-T2 N/A; T3 R emitter `steamclient_main.c:193`, relay `games.ts:1059`, sink SIDECAR; the re-log runs after the game exits so the copy is taken after exit; T4 N/A presence assertion; T5 C flagged pair 2; T6-T7 N/A | 4a rows |
| Item 6 census verified | census over live SIDECAR, raw trace | verified, call name lists | T1-T2 N/A; T3 R emitter `steamclient_main.c:248`, census `classifyBridgeEvidence` DRM branch in `meta/bridgeCensus.ts`, sink SIDECAR plus TRACEDIR; T4 N/A; T5 C flagged pairs 1 and 6 (census reads the live file, run in segment A before any restart); T6 C needs launch 1 still in the live SIDECAR; T7 N/A | `pnpm -s bridge-census --json`; counting-call rule in 56-05-SUMMARY.md |
| Item 7a no InstallPath under bare Valve\Steam keys | bottle system.reg | awk section count 0 | T1-T3 N/A filesystem; T4 R falsifiable (the awk was exercised on a synthetic hive in 56-25: it counted the bare-key InstallPath values and ignored a CommonRedist section and an unrelated section); T5 C flagged pair 12; T6 R the bottle is new (PC7), so no stale key; T7 N/A | awk command in item 7a |
| Item 7b no relaunch refusal | helper stderr via wine log | zero refusal lines | T1-T2 N/A; T3 C sink unproven (4a); T4 C absence in an unproven sink proves nothing; backstop is items 4-6; T5 C; T6-T7 N/A | helper/steam.c:135. CONDITIONAL: scorable once any helper stderr line is seen in `wine-launch-1.log`; until then "no sink, unscored" |
| Item 7c init_registry line | helper stderr | recorded if present | T3 C same sink gap; recording only, never fails the item | helper/steam.c:171 |
| Item 8 Raft | as items 3-6 | recorded | T1-T4 as items 3-6; T5 C flagged pair 2; T6 C the Raft bottle holds Phase 52 leftovers or a stale registry state; T7 R launch gesture in 4f | `find ... -name gamelib_bridge.cfg` |
| Item 9 Ranch | as items 3-6 | recorded | as item 8; T6 C Ranch bottle state is unknown before launch 4 (recorded: staged or not) | spike 040 exit-53 variant |
| Item 10 networking lead | all launch captures | grep counts | T3 R reads each captured file; T4 N/A recorded count, any value; T5 R; T6-T7 N/A | 56-02-SUMMARY.md |
| Item 11 HKLM diagnostic | reg add / delete under the clone runner | conditional launch, safe removal | T3 N/A; T4 R falsifiable, equal CommonRedist counts before and after; T5 C flagged pair 12; T6 N/A; T7 N/A operator and runner drive reg from a shell | 56-01 launch_form `bin/wine+CX_BOTTLE`. CONDITIONAL: runs only when launch 1 fails item 4, 5 or 6 |
| G2 route notice absent | SIDECAR install window | zero `requires a user notice` lines for 219990 | T1-T2 N/A; T3 R emitter `games.ts:1816`, sink SIDECAR; T4 R falsifiable, the line is logged BEFORE the frontend message on every notice route; T5 C flagged pair 3 (window bounded by the launch-0 and launch-1 delimiters); T6 C depends on native install being ON and the DRM scan resolving the title as DRM; T7 R install gesture in 4f | games.ts:1816 |
| G3 Play enabled, no restart | frontend status, SIDECAR | Play enabled; click reaches backend | T1 N/A; T2 N/A; T3 R backend lines `drm setup: appId 219990` (`drmLaunchSetup.ts:336,455`) are in SIDECAR; the status update has no log line (4a), so the operator observation is the primary observable; the anchor is NOT required here; T4 R falsifiable, the pre-fix state was Play disabled and no backend line; T5 C flagged pair 5 (a dev restart would mask the bug; pid check guards it); T6 R positive observable is the operator seeing Play enabled; T7 R Play gesture in 4f | `drmLaunchSetup.ts` |
| G9 repeat launch (launch 2) | SIDECAR delta, operator | one anchor, zero bottle-stage notices | T1-T2 N/A; T3 R emitters in 4a; T4 R falsifiable, the pre-fix hang logged `reason=drm-bottle-stage` (`games.ts:3533`) and a `timed out after` line; T5 C flagged pairs 2 and 5; T6 C winebus residual risk, classified by the recorded `registry not staged:` line and PC13; T7 R Play gesture | `sameSteamPath` `stageDrmBottle.ts:140` |
| G10 notice display | SIDECAR | confirmed within 10 s of dispatch | T3 R emitters `games.ts:3570`, `:3558`; T4 R falsifiable, `display=unconfirmed` is logged on timeout (`:3559`); T5 R; T6 C N/A when no notice fires; T7 N/A | 56-18-SUMMARY.md |
| G11 Ranch routed to DRM | SIDECAR | `.bind found` plus DRM runner line (anchor if reached) | T3 R emitter `games.ts:3768` and the runner line (`bottle: appId <id> uses DRM runner`), anchor `games.ts:4361`; T4 R falsifiable, pre-fix the log had the `reason=stubbed:` notice and no `.bind found` line; T5 C flagged pair 8; T6 C Ranch bottle state; T7 R launch gesture in 4f | 56-21-SUMMARY.md; the anchor is not required |
| S1 stage wine log written | SIDECAR, stage wine log file | path line, file exists, header, attempt 0 marker | T1-T2 N/A; T3 R emitters `stageDrmBottle.ts:915`, `stageWineLog.ts:115`, `stageDrmBottle.ts:962`, sinks SIDECAR and the file; T4 R falsifiable, the file is checked by `test -f` and header text, and a stage that did not run prints no `stage wine log` line; T5 C flagged pairs 2 and 14 (retention keeps 8 per app, so the copy is taken right after launch 1); T6 C the log opens only when the registry is not staged, which launch 1 guarantees on a fresh bottle; T7 N/A | 4a rows |
| R1 forced timeout, retry passes | SIDECAR segment B, stage wine log | six ordered literals, zero notices, stage-log markers | T1-T2 N/A; T3 R every emitter in 4a with file:line; T4 R falsifiable, the zero-notice count is meaningful because the notice logs on every stage failure (`games.ts:3533`) and the ORDER check yields `ORDER-BROKEN` if any literal is missing; T5 C flagged pairs 7, 8, 9, 10 and 13; T6 C needs PC14 (unstaged Ranch bottle, no live process), the pad unplugged (PC13) and the override reaching the sidecar (the `forced to 300 ms` line is the in-run proof); T7 R segment-B restart and Play in 4f. The killed-process count N is NOT scored (4c) | the awk order command in R1 |
| C1 terminal status done | SIDECAR, operator | `sent terminal status done` after each `stopped at` | T3 R emitters `drmLaunchSetup.ts:336,352`, `games.ts:3833`; T4 R falsifiable per failure; N/A if no failure; T5 R; T6 C requires a DRM-setup failure to occur; T7 N/A | recorded, non-blocking |
| W1 natural wedge | SIDECAR, PC13 | recorded | T3 R `timed out after 15000 ms`, `stage retry passed on attempt`; T4 N/A recording only; T5 C flagged pair 13; T6 C depends on the pad; T7 N/A | recorded, non-blocking |
| Launch gesture | Library card Play button | click Play on the game's card | T1 N/A; T2 N/A one gesture, no modal sheet; T3-T6 N/A; T7 R card renders and wires Play (`src/frontend/screens/Library/components/GameCard/index.tsx`, `handlePlay`) | 4f |
| Capture instruction | terminal.log, per-launch copies | `tee -a`, delimiter, per-launch copies and deltas, one instance per segment | T1-T2 N/A; T3 R each scored line is read from the sink that carries it (SIDECAR copy, TRACEDIR copy, wine log copy, stage log copy, system.reg copy), none from terminal.log; T4 N/A; T5 R no truncation, append only, segment-A SIDECAR copied before the quit; T6 R single instance asserted by count; T7 N/A | `grep -n '^=== GATE LAUNCH' <session>/terminal.log` |

### 4b2. Test 1 and Test 2

- Test 1 (origin/scheme): the only URLs are the https archive URL (PC9, item 1) and Valve's CDN, fetched by the sidecar. No http fixture. REACHABLE.
- Test 2 (concurrency): each launch is one Play click and a quit from the game menu; the uninstall and reinstall are one gesture each, and no second gesture is driven while a modal is up. The route-notice dialog or the failure dialog (if one appears) is dismissed by the operator before the next gesture. The forced timeout in launch 5 is driven by the product, not by a second operator gesture. REACHABLE.

### 4c. Test 4 (absence-observability)

- Item 3's zero notices: falsifiable (`games.ts:3533` logs on every drm step failure).
- Item 7a's zero InstallPath values: falsifiable (the awk was exercised on a synthetic hive).
- Item 7b's zero refusal lines: NOT falsifiable until the wine log is shown to carry helper stderr. CONDITIONAL.
- G2's zero route notices: falsifiable (the line is logged before the message is sent, `games.ts:1816`).
- G9's zero `reason=drm-bottle-stage`: falsifiable (the same notice line fires on every failure; the timeout line is also logged).
- R1's zero `reason=drm-bottle-stage`: falsifiable for the same reason, and the presence literals in the ORDER check (`stage retry passed on attempt 1`, the anchor) are positive observables that a failed stage cannot print.
- R1's killed-process count N is NOT scored and no test may use it. `defaultEndStageSession` (`stageDrmBottle.ts:~640-690`) runs `endPerGameBridgeBottleSession` (the clone runner's `wineserver -k`, `:656`) BEFORE it lists and SIGKILLs survivors, so after a forced 300 ms timeout `killed 0 leftover process(es)` is a legitimate result of a clean `wineserver -k` and a working retry. The test for R1 asserts the line's prefix `ended stage session, killed ` only. N is recorded in the Run record as informational.
- G10: a structural pairing (`dispatched` always followed by confirmed or unconfirmed, `games.ts:3558-3570`); the absence of `display=unconfirmed` is meaningful because the timeout path logs it.
- C1: a `stopped at` line without a following `sent terminal status done` is observable (the line is logged on the success of the send; `terminal status send failed` is logged on failure, `drmLaunchSetup.ts:357`).
- PC2 and item 4's absence of Windows Steam processes: falsifiable (ps).
- PC14 step 1 (no live bottle process): falsifiable, the counts print 0 only when no process env or arg carries the bottle name.

### 4d. Test 5 pairing pass

Reduction applied: every state-mutating requirement {segment-A dev start (rebuild precedes it), segment-B dev restart, Grim Dawn uninstall, Grim Dawn reinstall, COMPDIR move, game launches (each mutates the bottle's wine session and registry), Ranch registry reset, forced-timeout env, in-product end-stage-session kill, HKLM add/delete, pad connect/disconnect, trace/wine/stage log retention} (12) considered against every evidence-bearing requirement {PC1-PC14, items 1-11, G2, G3, G9, G10, G11, S1, R1, C1, W1} (34). 12 x 34 = 408 pairs considered, 14 flagged:

1. {segment-A dev start, PC4 rebuild} x {PC5 archive, PC6 pid, census}: the dev start renames gamelib.log to .old. Mitigated by building (PC4) and archiving (PC5) before the start and never restarting between launches within a segment.
2. {cumulative SIDECAR copy, launches} x {items 3, 5, 8, 9, G9, G11, S1, R1, C1}: launch N+1 appends to the same file, so each copy is cumulative. Mitigated by `lines-before-launch-<N>.txt` and `anchors-before-launch-<N>.txt` and scoring every line by DELTA(N).
3. {Grim Dawn uninstall, reinstall} x {PC7, PC11, item 2, G2, item 3 `registry not staged:`}: the uninstall deliberately removes the bottle and the reinstall deliberately makes it. PC7 and PC11 are read after the uninstall and before the reinstall; item 2 after; G2's window is DELTA(0).
4. {COMPDIR move, install-time prefetch} x {PC8, item 1}: the prefetch at reinstall re-populates COMPDIR during launch 0. PC8 is read before launch 0 and item 1's filesystem read happens after launch 0; the fetch evidence is a log line in DELTA(0) or DELTA(1), not the directory's presence.
5. {launch 1 and the dev app} x {G3, G9}: a dev restart between the reinstall and the Play click would clear a stuck status and mask G3. Mitigated by the unchanged-pid check. Launch 2 mutates the bottle's session state; G9 is exactly the observation of that.
6. {segment-B dev restart} x {census, item 6, PC6}: the restart renames gamelib.log. Mitigated by running the census in segment A right after launch 1 is archived, and by re-running PC6 with a new segment-B pid.
7. {segment-B dev restart} x {R1 sink}: R1 reads segment B's new `gamelib.log`; the segment-A copy was taken before the quit and is never used for R1.
8. {Ranch registry reset} x {item 9, G11}: the reset happens after launch 4 is archived, so launch 4's evidence is unaffected. The reset is the precondition R1 needs.
9. {Ranch registry reset} x {PC14, R1}: the reset is the point of PC14. If the Ranch bottle was never staged (launch 4 failed before staging), COUNT already prints the pre-reset value and is recorded; R1 still needs it unstaged, which `registry not staged:` in DELTA(5) proves.
10. {forced-timeout env} x {items 1-7, G9, S1}: the env exists only in segment B, where items 1-7, G9 and S1 are not scored. It shortens attempt 0 only and is ignored by a packaged sidecar. Launch 6 (item 11) in segment B runs on a staged bottle, so the override is inert.
11. {in-product end-stage-session kill} x {Grim Dawn and Raft bottles}: the kill selects processes by the Ranch bottle's name and cwd only; no other bottle's session is live at that time.
12. {HKLM add, delete} x {item 7a, the CommonRedist marks}: item 7a is scored from launch 1's system.reg copy before any add (launch 6 only runs afterward); a plain `reg delete /f` on the Wow6432Node key removes the CommonRedist subtree, mitigated by the `/v InstallPath` removal and the equal-count check in item 11.
13. {pad connect/disconnect} x {launch 1, W1, R1}: the pad state changes what a wedge can do. Launch 1 runs with the operator-approved pad state (PC13) and W1 records it; launch 5 runs with the pad unplugged so R1 proves the mechanics without a second wedge.
14. {log retention (keep 8 per app)} x {S1, per-launch copies}: the stage log, wine log and trace are copied right after each launch, before any later launch could prune them; Grim Dawn has two launches and Raft one in segment A, below the cap.

### 4e. Test 6 (external state)

- Fresh-bottle provenance (D-17): the per-game bottle is created by INSTALL, not by the first Play's stage. Uninstall removes it (`uninstallBridgeGame` calls `removePerGameBridgeBottle(this.appId)` at `games.ts:4688`; other callers of the same function sit at `:2320` and `:2373`). Reinstall re-provisions it inline (`games.ts:2156-2162`: `isBridgeBottleReady` false -> `provisionBridgeBottle`, logging `SteamGame: bridge bottle "<name>" not yet provisioned for appId <id>` at `games.ts:2159`), and `bottle.ts:2040` logs `provisionBridgeBottle: bridge bottle "<name>" created (no Windows Steam client installed`. `stageDrmBottle` requires the bottle to exist already (exe and install root must sit under `drive_c`, `stageDrmBottle.ts:753-766`, and a 64-bit prefix with `Program Files (x86)` must exist, `:774`, else `fail`). So `BOTTLE(219990)` exists after launch 0 and before launch 1, and DELTA(0) carries both lines for 219990 (item 2 asserts them).
- Mac Steam signed in (PC1, items 4 to 6): the positive observable is the steam_osx pid in the same procs file.
- GameLib's own Steam sign-in (PC12, 56-25 Gap 4): the dev vault slot `steam-refresh-token` must be present; the UI can show Steam as signed in while the vault holds no token. The check prints a word only. QR re-login is the fallback.
- The PowerA pad (PC13): physical external state, state recorded before launch 0, before launch 1 (operator choice) and before launch 5 (unplugged). It is not preflight-fixable; it is recorded.
- The old `GameLibGate52GD` manifest (PC11): expected already moved; if it reappears the option-1 manifest-only move is the fix.
- A pre-existing COMPDIR or Valve client cache (item 1, PC8): PC8 moves a prior COMPDIR aside and records it; a Valve client cache that survives is recorded by item 1's `component=` value (a `component=cache` line means the fetch was not re-proved).
- Ranch bottle state (items 9, G11, R1): its Phase 52 `gamelib_bridge.cfg` leftovers are listed in PC14 and left for the stage to clean; its registry state before launch 4 is unknown and recorded.
- Grim Dawn account ownership and cloud saves (item 2): the owning account must be signed in; recorded.
- The native-install setting (item 2): defaults ON (`enableSteamNativeInstall ?? true`); the runner records the value.
- A stale GameLibSteam-bottle Steam: PC2 is the check, and item 4's procs file is the in-run confirmation.
- The winebus/IOHID wedge (header): an external macOS framework condition tied to the pad; captured only if it happens.

### 4f. Test 7 (gesture sequence)

- Uninstall gesture (launch 0): the 56-26 run used the game page menu to uninstall Grim Dawn; the runner confirms at run time which control is rendered and records it. CONDITIONAL on the control being present; if it is not, the operator removes the bottle through GameLib's game page and the path is recorded.
- Reinstall gesture: on the library card for a not-installed Steam title (`!isInstalled && !isQueued && !isDelisted && runner === 'steam'`) the click path calls `openInstallGameModal` (`GameCard/index.tsx:700-704`), which short-circuits `runner === 'steam' && action === 'install'` to `startSteamQuickInstall` (`src/frontend/state/InstallGameModal.ts`). The backend then branches on `isSteamNativeInstallEnabled()` (`nativeInstallSetting.ts`), default ON. Windows-only Grim Dawn goes to `installBottleNative`. If the operator has the setting OFF the install is delegated to `steam://install` on Mac Steam and item 2 cannot pass until it is turned back ON. The runner records the setting value. If the install is refused with `token-absent`, PC12's QR re-login applies.
- Play gesture: click Play on the card (`GameCard/index.tsx`, `handlePlay`); for G3 the card must render Play enabled after the final `done` status. One gesture, no modal sheet. In launch 1 this single Play click is the whole scored launch, including any in-product retry.
- Menu gesture: the operator plays to the game's main menu, pastes the ps command, then quits from the game menu.
- Segment-B restart: the operator quits the segment-A dev app (after the runner has copied SIDECAR), the runner performs PC14 from a shell, then the operator runs the segment-B command from a shell and says when the window is visible. Launch 5 is a single Play click on the Ranch card.
- Pad gesture (PC13): the operator physically unplugs or plugs the controller; the runner reads the count after.

## 5. Tests

### 1. Component published and fetched (D-18)

expected: COMPDIR holds exactly the six names, lsteamclient.so sha256 equals dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d, codesign -dv reports `not signed at all`; the fetch is proven by a `component=download` line in the launch-0 prefetch line or the launch-1 setup line after PC8's move (sinks: filesystem and SIDECAR copies, launch 0 or launch 1)
result: pass. COMPDIR holds exactly the six names (LICENSE.lsteamclient, NOTICE, detour-cx26.3.0.39832.bin, lsteamclient.dll, lsteamclient.so, steam.exe); lsteamclient.so sha256 equals dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d; codesign reports `not signed at all`. Fetch proven after PC8's move by DELTA(0) `drm prefetch: appId 219990 ready crossover=26.3.0.39832 ... component=download runner=cache valve=cache` (14:27:10), corroborated by `steamclient-layer: steamclient-layer-cx26.3.0.39832 downloaded and verified`. Launch 1's own setup line says component=cache, as expected after the prefetch.

### 2. Reinstall through the bridge, fresh bottle (D-17)

expected: BOTTLE(219990) exists and appmanifest_219990.acf has `"StateFlags" "4"`, and DELTA(0) holds both `bridge bottle "GameLibSteamBridge-219990" not yet provisioned for appId 219990` and `provisionBridgeBottle: bridge bottle "GameLibSteamBridge-219990" created`, after PC7 and PC11 passed (sinks: filesystem and SIDECAR copy, launch 0)
result: pass. BOTTLE(219990) exists after the reinstall and appmanifest_219990.acf has `"StateFlags" "4"`; DELTA(0) holds `SteamGame: bridge bottle "GameLibSteamBridge-219990" not yet provisioned for appId 219990` (14:20:09) and `provisionBridgeBottle: bridge bottle "GameLibSteamBridge-219990" created (no Windows Steam client installed` (14:20:21); PC7 and PC11 passed beforehand.

### 3. DRM-mode setup completed on the fresh bottle (D-12/D-13)

expected: DELTA(1) of gamelib-launch-1.log has exactly one new `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` line (anchor delta 1), zero `[bridge-notice] appId=219990 reason=drm-` lines, and at least one `stageDrmBottle: appId 219990 registry not staged:` line; a `stage retry passed on attempt` line in the same delta does not fail the item (sink: SIDECAR copy, launch 1)
result: pass. Scored on run 1's sub-window (DELTA(1) from the launch-1 delimiter up to run 1b's `drm setup` line, 83 lines, `delta1a.txt`): `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=` x1 (14:28:47), `[bridge-notice] appId=219990 reason=drm-` x0, `stageDrmBottle: appId 219990 registry not staged:` x1, no `timed out after`, no `stage retry passed`. The whole-DELTA anchor count is 2 only because run 1b (the operator's re-click) added one; see the Launch 1 note in the Run record.

### 4. Menu with only Mac Steam (D-17)

expected: operator confirms the main menu is interactive; procs-launch-1.txt has a steam_osx pid and no steamwebhelper.exe or steamservice.exe line (sink: operator plus procs-launch-1.txt, launch 1)
result: pass, with a caveat on the procs clause. Menu clause: the operator reported run 1 (14:28:42, game pid 89531) reached the interactive main menu and quit it from the menu (verbatim, see the Run record). Procs clause: `procs-launch-1.txt` was captured during run 1b (the re-click, game pid 89772), not run 1: it holds a steam_osx pid, no `steamwebhelper.exe` line and no `steamservice.exe` line, and one `steam.exe` line that is the GameLib helper at `C:\Program Files (x86)\Steam\steam.exe`. Run 1 itself has no process snapshot; the no-Windows-Steam evidence for run 1 is PC2 (clean immediately before the install), the helper-only `steam.exe` in the launch command, and `wine-launch-1a.log` holding no steamwebhelper or steamservice text. The procs clause is therefore evidenced by a re-click run (evidence-only, `1b`), not by run 1.

### 5. D-15 game-process attach

expected: DELTA(1) has at least one `bridge drm [219990]: [drm-trace] appId=219990 pid=<g> role=game event=create-interface` line and <g> equals no role=helper pid (sink: SIDECAR copy, launch 1)
result: pass. DELTA(1) holds `bridge drm [219990]: [drm-trace] appId=219990 pid=356 role=game event=create-interface iface=SteamClient017` (run 1) and the same with pid=240 (run 1b); no role=helper line in either trace, so <g> equals no helper pid. Ifaces seen: SteamClient017 only.

### 6. D-16 game-originated call (census)

expected: `pnpm -s bridge-census --json` for appid 219990 gives evidence verified with evidenceDetail starting `game call ` or equal to `game log init`, and no counting name starts with ISteamClient_ or matches SetMinidumpSteamID; every distinct name= per role from trace-launch-1.log recorded verbatim (sinks: live SIDECAR and trace-launch-1.log, launch 1, census run in segment A)
result: pass. `pnpm -s bridge-census --json` row 219990 (run in segment A before any restart, SIDECAR holding runs 1 and 1b): evidence `verified`, evidenceDetail `game call ISteamUser_SteamUser017_GetSteamID`. Distinct names, role=game (union of both runs, 40 names, `names-launch-1.txt`; run 1 alone has the same 41-line trace shape; role=helper: none): ISteamClient_SteamClient014_{CreateSteamPipe,GetISteamUtils,ConnectToGlobalUser,GetISteamUser,GetISteamGenericInterface,ReleaseUser,BReleaseSteamPipe}; ISteamClient_SteamClient023_{CreateSteamPipe,GetISteamUser,Set_SteamAPI_CCheckCallbackRegisteredInProcess,GetISteamGenericInterface,SetWarningMessageHook,ConnectToGlobalUser,BShutdownIfAllPipesClosed,ReleaseUser,BReleaseSteamPipe}; non-ISteamClient_ names (the counting set): ISteamAppTicket_STEAMAPPTICKET_INTERFACE_VERSION001_GetAppOwnershipTicketData, ISteamApps_STEAMAPPS_INTERFACE_VERSION009_BIsSubscribedApp, ISteamController_SteamController008_{GetActionSetHandle,GetConnectedControllers,Init,RunFrame,Shutdown}, ISteamInput_SteamInput007_RunFrame, ISteamMatchmakingServers_SteamMatchMakingServers003_{ReleaseRequest,RequestLANServerList}, ISteamRemoteStorage_STEAMREMOTESTORAGE_INTERFACE_VERSION016_{FileRead,FileWrite,GetFileCount,GetFileNameAndSize,GetFileSize,GetQuota}, ISteamUserStats_STEAMUSERSTATS_INTERFACE_VERSION013_{GetAchievement,GetNumAchievements}, ISteamUser_SteamUser017_GetSteamID, ISteamUser_SteamUser023_GetSteamID, ISteamUtils_SteamUtils007_{GetAppID,GetConnectedUniverse}, ISteamUtils_SteamUtils011_{GetAppID,RunFrame}. Helper list: empty. No counting name matches SetMinidumpSteamID.

### 7. D-21 no local-machine Steam InstallPath keys

expected: awk section count of `"InstallPath"=` values under `[Software\\Valve\\Steam]` and `[Software\\Wow6432Node\\Valve\\Steam]` in system-reg-launch-1.reg is 0 (CommonRedist sections excluded and their header count recorded); zero `gamelib-steam-helper: refusing steam relaunch request` lines in wine-launch-1.log (CONDITIONAL sink, unscored if the sink is unproven); any `steamclient_init_registry unavailable` line recorded (sinks: system-reg copy and wine log copy, launch 1)
result: pass. 7a: awk count of `"InstallPath"=` under [Software\\Valve\\Steam] and [Software\\Wow6432Node\\Valve\\Steam] in system-reg-launch-1.reg is 0; CommonRedist header count recorded: 5. 7b: zero `gamelib-steam-helper` lines in both wine logs, so no helper stderr line was seen in the sink: no sink, unscored. 7c: zero `steamclient_init_registry unavailable` lines.

### 8. Raft 648800 (recorded, non-blocking)

expected: items 3-6 applied to launch 3 recorded as verified, reached menu (census detail) or failed at a step; `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` prints nothing (sink: SIDECAR copy and filesystem, launch 3)
verified (census `game call ISteamUser_SteamUser017_GetSteamID`), reached menu per the operator. Launch 3 (Raft) DELTA(3): anchor `[bridge-drm] appId=648800 mode=steamclient-layer` x1 (14:45:05; baseline 0), `reason=drm-` x0, `[bridge-notice]` x0, `registry not staged:` x0 (the bottle was already staged; the clause is not required for Raft), `timed out after` x0, no stage wine log line; one `role=game create-interface` (pid=240, SteamClient017), no role=helper line; 56 call events, counting names include ISteamUser_SteamUser017_GetSteamID, ISteamUser_SteamUser023_GetAuthSessionTicket, ISteamAppTicket_STEAMAPPTICKET_INTERFACE_VERSION001_GetAppOwnershipTicketData, ISteamUserStats_STEAMUSERSTATS_INTERFACE_VERSION012_RequestCurrentStats, ISteamApps_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId. `procs-launch-3.txt` (taken at the menu, before the quit): steam_osx pid present, no steamwebhelper.exe or steamservice.exe line, one helper `steam.exe` line. `find BOTTLE(648800)/drive_c -name gamelib_bridge.cfg` printed nothing. Exit behaviour: see the launch 3 note in the Run record (hang on quit, force-quit by the operator).

### 9. Ranch Simulator 1119730 (recorded, non-blocking)

expected: items 3-6 applied to launch 4 recorded as verified, reached menu (census detail) or failed at a step, with the logged exit code if any, and whether the stage ran and how it ended (sink: SIDECAR copy, launch 4)
result: pending

### 10. Networking lead (56-02)

expected: `grep -c SteamNetworkingSocketsSerialized005` over every session launch capture recorded per file (sink: all gamelib-launch-N.log, trace, wine-launch and stage-wine-launch files, launches 0 to 6)
result: pending

### 11. HKLM diagnostic (D-21, conditional)

expected: only if item 4, 5 or 6 failed on launch 1: the two F7 keys added with reg add, launch 6 scored as items 3-6, each key's InstallPath value removed with `reg delete <key> /v InstallPath /f`, a key deleted only if `reg query` shows it empty, CommonRedist header counts equal before and after; otherwise skipped (sinks: SIDECAR copy and system-reg copy, launch 6)
result: pending

### 12. G2 route notice absent for the DRM title (non-blocking)

expected: zero DELTA(0) lines containing `requires a user notice before any install` for appId 219990; operator records whether a route-notice dialog appeared (sink: SIDECAR copy, launch 0)
result: pass. Zero DELTA(0) lines containing `requires a user notice before any install` for appId 219990; operator reported no dialogs during the reinstall.

### 13. G3 Play enabled after install, no restart (BLOCKING)

expected: after the reinstall finishes with the segment-A dev app pid unchanged, the operator sees Play enabled (not stuck on redist) and the click is followed by `drm setup: appId 219990` lines in DELTA(1) within 30 s (sinks: operator and SIDECAR copy, launch 0 then launch 1)
result: pass. Segment-A pid 86847 unchanged from PC6 through the install and the click. Operator: after the install the card showed Play enabled (final state, after the "installing redistributables" step). The click reaches the backend: the first `drm setup: appId 219990` line in run 1's window is 14:28:47, within seconds of the delimiter and the click at about 14:28:42 (well inside 30 s). The transient "[play now]" flash during install is not covered by this item and is recorded as an observation.

### 14. G9 repeat DRM launch passes bottle-stage (BLOCKING)

expected: Grim Dawn launch 2 logs exactly one new anchor and zero `reason=drm-bottle-stage` lines in DELTA(2); `registry not staged:` presence and menu reached recorded (sinks: SIDECAR copy by delta and operator, launch 2)
pass. Scored on the reconstructed launch-2 window (`gamelib-launch-2.log` lines 419-end, `delta2-real.txt`; 14:38:38 to 14:42:09): exactly one new `[bridge-drm] appId=219990 mode=steamclient-layer` anchor (14:38:39; whole-log anchor count 3 = runs 1, 1b and 2, so 2 before the click and +1), `reason=drm-bottle-stage` x0, `[bridge-notice]` x0, `timed out after` x0, `registry not staged:` x0 (as expected on a staged bottle). Operator: "launch 2: menu, no notices"; the monitor logged game started pid 93627 and `game stopped after 209s of play`. Run on pad count 1 (connected). `procs-launch-2.txt` does not exist (the snapshot was not taken); it is not a G9 clause, and it is recorded as missing, not fabricated.

### 15. G10 notice display confirmed (non-blocking)

expected: every `[bridge-notice] appId=<id> dispatched=` line has a `[bridge-notice] appId=<id> display=confirmed elapsedMs=` line within 10 s and no `display=unconfirmed`; N/A when no notice fires (sink: SIDECAR copy, any launch)
result: pending

### 16. G11 Ranch routed to DRM mode (non-blocking)

expected: DELTA(4) holds `SteamGame: appId 1119730 SteamStub .bind found on` and `bottle: appId 1119730 uses DRM runner`, and the outcome is recorded (anchor `[bridge-drm] appId=1119730 mode=steamclient-layer` recorded when reached, not required) (sink: SIDECAR copy, launch 4)
result: pending

### 17. S1 stage wine log written (BLOCKING)

expected: DELTA(1) contains `stageDrmBottle: appId 219990 stage wine log <path>`, the file at <path> exists, its first line starts `[gamelib] stage session appId=219990`, and it contains `[gamelib] stage attempt 0` (sinks: SIDECAR copy and the stage wine log, launch 1)
result: pass. DELTA(1) has `stageDrmBottle: appId 219990 stage wine log /Users/graysonmitchell/Library/Application Support/GameLib/steam-bridge/drm/trace/219990-1793237324709.stage.wine.log` (14:28:44); the file exists, its first line starts `[gamelib] stage session appId=219990 bottle=GameLibSteamBridge-219990`, it contains `[gamelib] stage attempt 0`, and it ends in four `reg: The operation completed successfully` lines (copied to stage-wine-launch-1.log).

### 18. R1 forced timeout drives end-session and a passing retry (BLOCKING)

expected: in segment-B DELTA(5), in order for appId 1119730: `first stage attempt timeout forced to 300 ms`, `timed out after 300 ms; ending the stage session and retrying`, `bottle processes at timeout:`, `ended stage session, killed ` (prefix only), `stage retry passed on attempt 1`, then the `[bridge-drm] appId=1119730 mode=steamclient-layer` anchor; zero `reason=drm-bottle-stage` lines; stage-wine-launch-5.log holds `[gamelib] stage attempt 0`, `[gamelib] stage attempt 1` and the `bottle processes at timeout:` listing; the killed-process count N is recorded and not scored; Ranch's outcome is recorded and not scored (sinks: segment-B SIDECAR copy and the stage wine log, launch 5)
result: pending

### 19. C1 card settles after any DRM-setup failure (recorded, non-blocking)

expected: for each `drm setup: appId <id> stopped at <stage>` line in the run, a `sent terminal status done` line for that appId follows it and the operator confirms the card shows Play with no dev restart; N/A if no failure (sinks: SIDECAR copies and operator, any launch)
result: pending

### 20. W1 natural winebus wedge observed or not (recorded, non-blocking)

expected: the PowerA pad count at launch 1, whether `timed out after 15000 ms` occurred in DELTA(1), whether `stage retry passed on attempt` occurred, and the retry outcome are recorded (sinks: pad-before-launch-1.txt and SIDECAR copy, launch 1)
result: pending

## Run record

### Approval

- Operator reply: "approved: connected" on 2026-10-29. Approves the contract as authored; launch-1 PowerA pad state = CONNECTED; the pad is unplugged for launch 5 (R1) regardless; G9 blocks only on launch 2; item 11 runs at launch 6 in segment B.

### Preflight

Author-side run, 2026-10-29. Session dir (for 56-34): `/tmp/gamelib-gate-20261029T002925Z/`. Publish: not needed (the steamclient-layer component did not change in 56-27..56-32; PC9 shows the existing asset is live).

| ID | Observed | Result |
| --- | --- | --- |
| PC1 | `pgrep -x steam_osx` printed pid 50647 | PASS |
| PC2 | NOT EMPTY. A Windows Steam is running in the legacy `GameLibSteam` bottle (wineserver pid 49653, `CX_BOTTLE=GameLibSteam`, up about 1h05m): `steam.exe -silent -applaunch 113200` (pid 49667), `steamservice.exe /RunAsService` (49740) and five `steamwebhelper.exe` processes (7 lines in all). Not killed by the author (operator machine state). | FAIL: the operator must quit it (or approve a kill) before 56-34 launch 0 |
| PC3 | `CFBundleVersion` = `26.3.0.39832` | PASS |
| PC4 | `pnpm build-steam-bridge` exit 0, `pnpm exec vite build` exit 0, `pnpm build:sidecar-sea` exit 0. `build/main/sidecar.js` mtime 1793233790 vs newest `src/backend` commit 1793232633 (newer); `grep -c 'stage retry passed on attempt'` = 1 (was 0 at authoring). Logs in the session dir (`pc4-*.log`). | PASS |
| PC5 | Session dir created; `pre-session-gamelib.log` (127078 bytes) and `pre-session-gamelib.log.old` (224064 bytes) copied | PASS |
| PC6 | run by 56-34 | n/a |
| PC7 | run by 56-34 | n/a |
| PC8 | COMPDIR existed (mtime 1793223536, 2026-10-29 10:38 local; six names). Moved to `<session>/compdir-prior/`; mtime in `compdir-prior/MTIME.txt`. `test ! -e COMPDIR` then exit 0. | PASS (after the move) |
| PC9 | `curl -fsSIL` ended at HTTP 200 (after one 302) | PASS |
| PC10 | `appmanifest_648800.acf` and `appmanifest_1119730.acf` both exist in their bottles | PASS |
| PC11-PC14 | run by 56-34 | n/a |

### 56-34 pre-run re-check

Run by 56-34 on 2026-10-29 before segment A. The Preflight table above is left as authored.

| ID | Observed | Result |
| --- | --- | --- |
| PC2 (re-check) | the PC2 `ps -axo pid,command \| grep -iE 'steamwebhelper\.exe\|steamservice\.exe\|Steam\\steam\.exe' \| grep -v grep` printed nothing (0 lines); `pgrep -fl wineserver` printed nothing | PASS on re-check (the earlier FAIL was a Windows Steam in the GameLibSteam bottle, since quit) |
| PC1 (re-check) | `pgrep -x steam_osx` printed one pid | PASS |
| PC12 | vault slot word: `present` | PASS (no dev app of this segment is up yet; re-confirm after the segment-A start) |
| PC13 (first reading, before launch 0) | `ioreg ... grep -c '"idVendor" = 8406'` = 1 (pad connected, as approved for launch 1) | recorded |
| sidecar freshness (pre-dev) | `build/main/sidecar.js` mtime 1793233790 > newest `src/backend` commit 1793232633; `git status` shows no `src/backend` change since PC4 | no rebuild needed |
| stale dev app | one `target/debug/gamelib-shell` was already running (not under this session's tee); the operator must quit it and restart under `tee -a <session>/terminal.log` | action for the operator |

### 56-34 segment A start (PC6)

Run by 56-34 after the operator said "window up" (dev started under `tee -a <session>/terminal.log`, no timeout override).

| ID | Observed | Result |
| --- | --- | --- |
| PC6 | `pgrep -f 'target/debug/gamelib-shell'` count 1, segment-A pid 76294 (in `pc6-pid.txt`); `build/main/sidecar.js` mtime 1793234781 > newest `src/backend` commit time 1793234732 (the dev start rebuilt the sidecar; an `src/backend` commit landed after PC4); literal greps on sidecar.js: `stage retry passed on attempt` 1, `stage wine log` 2, `GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS` 2, `sent terminal status done` 2, `drmLaunchSetup` 7, `setupSteamClientForwarder` 0 | PASS |
| PC12 (re-run) | `present` | PASS |
| PC13 (before launch 0) | count 1 (connected) | recorded |
| launch 0 | delimiter written; `lines-before-launch-0.txt` = 58, `anchors-before-launch-0.txt` = 0 | in progress |

### 56-34 launch 0 uninstall (segment A)

- Uninstall gesture: the game page menu (operator report), recorded per Section 4f.
- PC7: `test ! -d BOTTLE(219990)` exit 0. PC11: `test ! -e` Mac Steam manifest exit 0; `find ... appmanifest_219990.acf` outside the 219990 bottle printed nothing. Both PASS.
- PROCESS DEVIATION (instance count): after the uninstall the running `gamelib-shell` was pid 78673 (parent shell `ttys004`, started about 00:52Z), not PC6's pid 76294. `terminal.log` shows `[shell] quit (Dock Quit)` at line 80, after the launch-0 delimiter at line 57, so the tee'd instance was quit and a second dev app was started from another terminal, outside `tee -a <session>/terminal.log`. The uninstall is therefore not captured by terminal.log and PC6's pid no longer holds. The pre-restart sidecar log is saved as `gamelib-segmentA-pre-restart.log`. Remediation: quit the app, restart under tee, re-run PC6 (new segment-A pid) before the reinstall. No reinstall or launch has run yet, so nothing scored is affected.

### 56-34 segment A restart (PC6 re-run)

After the instance-count deviation, the operator restarted dev from one terminal under `tee -a <session>/terminal.log`. The first PC6 pid (76294) is kept in `pc6-pid-first.txt`; the segment-A pid is now 86847.

| ID | Observed | Result |
| --- | --- | --- |
| PC6 (re-run) | `gamelib-shell` count 1, pid 86847 (`pc6-pid.txt`); sidecar.js mtime 1793236743 > newest `src/backend` commit time 1793236527; literals: `stage retry passed on attempt` 1, `stage wine log` 2, `GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS` 2, `sent terminal status done` 2, `drmLaunchSetup` 11, `setupSteamClientForwarder` 0 | PASS |
| PC12 | `present` | PASS |
| PC13 (before launch 0) | 1 (connected) | recorded |
| PC7 | `test ! -d BOTTLE(219990)` exit 0 | PASS |
| launch 0 (second delimiter) | `terminal.log` now holds 2 `=== GATE LAUNCH 0` delimiters (00:46:49Z for the abandoned first attempt, 01:19:42Z for the reinstall); `lines-before-launch-0.txt` = 59, `anchors-before-launch-0.txt` = 0 (fresh `gamelib.log` after the restart) | reinstall window starts here |

Note: DELTA(0) is the reinstall window of the current segment-A `gamelib.log` after line 59.

### 56-34 launch 0 reinstall observations

- Operator report: "installed, play enabled, no dialogs". G2 operator side: no route-notice dialog appeared.
- Card states seen during the install, in the operator's words: "installing" -> "processing files please wait" -> "[play now]" (for a few seconds) -> "installing redistributables" -> final state "Play" enabled. The operator did not click Play during the brief "[play now]" flash.
- OBSERVATION (not scored, no contract item covers it): a transient premature Play state ("[play now]") appeared before the redistributables step during install. G3 asks only about the state after the install finishes (Play enabled, not stuck on redist), which was met; this flash is recorded for the Gaps list as a non-blocking finding.
- Launch-0 sinks read: `gamelib-launch-0.log` (DELTA(0) = lines after 59). Recorded only; scoring happens in Task 2.
- Segment-A pid still 86847 before the launch-1 click. Launch-1 delimiter written; baselines in `lines-before-launch-1.txt`, `anchors-before-launch-1.txt`, `pad-before-launch-1.txt`.

### 56-34 launch 1 evidence read

- Archived to the session dir after the game exited: `gamelib-launch-1.log`, `delta1.txt` (whole window), `delta1a.txt` (run 1 only), `trace-launch-1a.log`/`trace-launch-1b.log`, `wine-launch-1a.log`/`wine-launch-1b.log`, `stage-wine-launch-1.log`, `system-reg-launch-1.reg`, `census-launch-1.json`, `names-launch-1.txt`, `procs-launch-1.txt`.
- Operator report on launch 1: "game launches to main menu". No hang was reported. The operator did not state controller or other detail; nothing further is recorded.
- Launch 1 stage: ran once on the fresh bottle, `registry not staged:` x1, stage attempt 0 only, no `timed out after` line, no `stage retry passed` line, four successful `reg add`s. W1 data: pad count 1 at launch 1, no 15000 ms timeout, no retry: no natural wedge.
- DEVIATION (two game runs in DELTA(1)): run 1 at 14:28:42 (stage ran, anchor, game pid 89531, 14 s of play) and run 1b at 14:29:22 (a manual re-click, game pid 89772, 34 s of play, no stage). Operator, verbatim: "yes, I quit it before i added the log file command, so restarted to do that... this is a pass". Reading: run 1 reached an interactive main menu and was quit from the menu (the 14 s clean shutdown was operator-initiated, not a crash); run 1b was a manual re-click made to take the procs snapshot. Per the retry rule run 1b is evidence-only (`1b`, `evidence-only (post-FAIL)` by analogy: it is a re-click, not a retry the product did) and cannot change the verdict. Items 3 and 13 are scored on run 1's sub-window only; item 4's procs clause and part of item 5/6's trace evidence come from run 1b as well as run 1 and are labelled as such. The operator's "this is a pass" is verdict input only; each item above is scored from evidence.
- Lesson recorded: the procs snapshot command must be pasted at the menu BEFORE quitting, in the same Play; the operator quit first. From launch 2 on, `gate-launch.sh` prints the snapshot command before the click.
- Observation on the "[play now]" flash during install: recorded above; unscored.

### 56-34 launch 2 (G9) archive deviation

- The operator ran `gate-launch.sh 2 219990` four times (the first three were Ctrl-C'd): `terminal.log` has four `=== GATE LAUNCH 2` delimiters, at 01:36:25Z, 01:37:19Z, 01:39:00Z and 01:40:50Z. The Play click (about 14:38:39 local) came before the last run's baseline (14:40:50), so the script's `lines-before-launch-2.txt` (488) and `delta2.txt` start after the anchor and its "anchors in delta" output is wrong for this launch. The real launch-2 window is `gamelib-launch-2.log` lines 419-end, saved as `delta2-real.txt`; the wine log `219990-1793237919158.wine.log` was copied by hand to `wine-launch-2.log` (the script's wine-log grep had run on the misaligned delta); `trace-launch-2.log` and `system-reg-launch-2.reg` were copied by the script from the right files. Run 1b's stop is at line 418 of the same file, so lines 419-end contain run 2 only.
- No snapshot for launch 2 (`procs-launch-2.txt` missing).

### 56-34 launch 3 (Raft) observations

- Operator: clicked Play once, Raft reached its menu, snapshot taken at the menu, then quit from the game menu; the operator said "might of crashed on exit".
- EXIT HANG: after the quit the game process did not exit. Orchestrator-observed at about 14:48: Raft.exe pid 96938 still alive (state S, 1.5% CPU, 2:59 elapsed), with steam.exe 96932 (the helper) and UnityCrashHandler64.exe 96977 (`--attach`) alive; no crash dump found. Raft's `Player.log` (bottle `drive_c/users/crossover/AppData/LocalLow/Redbeet Interactive/Raft/Player.log`) ends with `Steam auth ticket validated, logging into PlayFab...`, a successful API call, then `Saving settings ...` as the last line: a hang after saving settings on exit, not a crash.
- FORCE-QUIT: the operator force-quit Raft.exe with Activity Monitor. The `bottleProcessMonitor [648800]: matched process(es) gone after 254s of play — game stopped` line (14:49:21) therefore reflects the operator's force-quit, not a natural exit; the archive ran after it.
- No contract item covers exit behaviour; recorded here and as a non-blocking Gaps candidate. Whether it is a DRM-layer defect (a pipe/shutdown call left unanswered) or Raft's own exit path is unknown and not diagnosed in this run.
- Census row 648800 (run in segment A): evidence `verified`, evidenceDetail `game call ISteamUser_SteamUser017_GetSteamID`.

## Gaps

- PC2 failed at authoring time: a Windows Steam was running in the `GameLibSteam` bottle (see Preflight). RESOLVED before 56-34 launch 0: re-checked by 56-34 on 2026-10-29, the PC2 ps grep printed nothing (0 lines) and `pgrep -fl wineserver` printed nothing (see `### 56-34 pre-run re-check`).

## Verdict

Verdict: pending
