---
status: ready
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
source:
  - 52-01-SUMMARY.md
  - 52-02-SUMMARY.md
  - 52-03-SUMMARY.md
  - 52-04-SUMMARY.md
  - 52-05-SUMMARY.md
  - 52-06-SUMMARY.md
  - 52-07-SUMMARY.md
  - 52-08-SUMMARY.md
  - 52-09-SUMMARY.md
started: 2026-10-24T01:41:00Z
updated: 2026-10-24T01:50:00Z
---

Authored by plan 52-10, run by 52-11 (discovery rounds, items 1-5) and 52-12 (done-when, items 6-8).
The plan that authored this contract did not run any item of it.

Done-when being gated (ROADMAP): Grim Dawn (219990) launches from GameLib through its per-game
bridge bottle, gets past SteamStub (no `steam://run` in a `--cx-log` trace), reaches its main menu,
and Mac Steam shows it In-Game, with no Windows Steam client in the bottle and the exe unmodified.

## Desk gate

Recorded 2026-10-24 by 52-10 before this contract was written. Phase base `0bef714a5`; gate HEAD
`c9f5d1d86` (includes one 52-10 fix commit, see below).

| Command | Outcome |
|---|---|
| `pnpm gen-vtables` then `git diff --exit-code native/steam-bridge/generated` | PASS, no diff ("22 interfaces, 843 vtable slots, 32 flat exports") |
| `pnpm codecheck` | PASS |
| `pnpm test:ci` | 6 tests in 4 suites failed on first run; 1 phase-52 regression fixed (below); the remainder are NOT phase 52 (below) |
| `pnpm build-steam-bridge` | PASS (steam_api.dll, steam_api64.dll, steamclient64.dll, steam-bridge-helper) |

- `stat -f %z public/bin/arm64/darwin/steam_api64.dll` = 242688 (this is SHIM64 for the preflight)
- `stat -f %z public/bin/arm64/darwin/steamclient64.dll` = 186368
- `objdump -p steamclient64.dll` exports: `CreateInterface` only (ordinal 1)
- `objdump -p steam_api64.dll` exports `GameLibBridge_CreateInterface` plus six `SteamInternal_*`
  names (`ContextInit`, `CreateInterface`, `FindOrCreateGameServerInterface`,
  `FindOrCreateUserInterface`, `GameServer_Init_V2`, `SteamAPI_Init`). The `SteamInternal_*` set
  pre-existed from quick 261024-i94; only `GameLibBridge_CreateInterface` is new in phase 52 (52-07).

Phase-52 regression found and fixed by this plan (commit `c9f5d1d86`): `meta/findDeadcode.cjs`
reported `BRIDGE_STEAMCLIENT64_FILENAME` and `SteamClientSetupResult` in `steamClientSetup.ts` as
exports used only in their own module (52-08). The `export` keyword was dropped from both; tsc and
the bridge suites stay green.

Not phase 52 (pre-existing at the phase base; logged in deferred-items.md): `testContainment`
(unclassified `steamNativeInstallDefault.test.ts`, quick 261024-exo), `findDeadcode` findings in
`delayImportPe.ts` (quick 261024-j4l) and `crossoverInstallRisk.ts`, `genI18nGateScope` A-17
(stale `meta/i18nForkTouchedFiles.json`), `machineFillGamelib` `pluralCategoriesFor` (ICU category
ordering). Separately `pnpm lint` tests-scope exceeds its warning cap at the pre-phase base.

## Preconditions

Run against the **packaged build only: `pnpm build-steam-bridge` then `pnpm tauri:dev:packaged`,
never `tauri:dev`** (a long-lived dev server runs a stale sidecar bundle). Mac Steam signed in
(operator confirms). CrossOver present at `/Applications/CrossOver.app`. Grim Dawn installed in the
bottle `GameLibSteamBridge-219990`. No GameLib instance and no 219990 helper running:
`pgrep -f 'target/debug/gamelib-shell'` and `pgrep -fl 'steam-bridge-helper --appid 219990'` must
both print nothing. NOTE: at authoring time a `gamelib-shell` process (pid 5606) was running; the
runner must quit it first, otherwise the harness refuses to start.

Preflight (read-only on the product bottle; record every value in `terminal.log`):

- `SHIM64 = 242688` (the built `steam_api64.dll` size; re-`stat` after any rebuild in the loop).
  The product bottle's `x64/steam_api64.dll` was 223744 bytes at authoring (a stale shim): item 6
  must find it replaced by the current shim (size == current SHIM64), which is placed by
  `placeShimForGame` because the byte-identity guard (`shimGenerate.ts:1267`) fails.
- `shasum -a 256 "<game dir>/x64/Grim Dawn.exe"` (item 8 compares against this)
- `grep -c 'Valve\\\\Steam\\\\ActiveProcess' "<bottle>/user.reg"` (expected 0; a non-zero value is
  recorded as pre-existing state and item 8 is scored on the before/after delta)
- `grep -cE '^\[Software\\\\(Wow6432Node\\\\)?Valve' "<bottle>/system.reg"` (expected 0)
- `ls "<bottle>/drive_c/Program Files (x86)/Steam"` for `steam.exe` / `steamclient*.dll` (expected none)
- Run `WINEPREFIX=<bottle> wineserver -k` before reading `user.reg`/`system.reg`, so the registry
  is flushed to disk.

Session dir `/tmp/gamelib-gate-52-<UTC>/` is created ONCE; archive any existing
`~/Library/Logs/GameLib/gamelib.log` and `gamelib.log.old` into it before the first launch.

Pair-test notes carried from the authoring review: (1) item 1 is item 7's positive control and runs
first; (2) **item 7 must run after item 6** (it needs the registry and forwarder state GameLib wrote)
and must not relaunch GameLib in between; (3) item 8 reads the product bottle after item 7 and
must be preceded by `wineserver -k` of the product bottle.

## Capture standard

- `terminal.log` is APPENDED, never truncated: every write goes through `tee -a $SESSION/terminal.log`.
  No bare `tee`, no `>` redirect.
- Delimiters, exact text, written by a command that cannot be confused with app output:
  - harness rounds write `=== GATE ROUND <n> MODE=<m> — <UTC> ===` (done by `gate/scratch-run.sh`);
  - GameLib launches are preceded by
    `echo "=== GATE LAUNCH <n> — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a $SESSION/terminal.log`.
  Grep with `grep -n '^=== GATE' $SESSION/terminal.log`.
- After EVERY GameLib launch and before the next, archive:
  `cp ~/Library/Logs/GameLib/gamelib.log $SESSION/gamelib-launch-<n>.log`
  (`log_writer.ts:72-74` renames the log to `.old` on the next launch's first write).
- Exactly ONE app instance, asserted: `pgrep -f 'target/debug/gamelib-shell'` is empty before each
  GameLib launch, shows one pid after the window appears (recorded in terminal.log), and one pid
  again at teardown. Any other count aborts the launch; its evidence is not scorable.
- Closing inventory: `ls -la $SESSION/` and `wc -l $SESSION/*` recorded at session end.
- Every item records the launch or round ordinal that covered it.
- Sink for every scored line (Test 3):
  - `LISTEN`, `HELLO`, `FWD ...` lines: harness rounds find them in `round-<n>.helper.log`; GameLib
    launches find them in `gamelib.log` with the prefix `bridge helper [219990]:`
    (`helperProcess.ts:297-303`). They are never in `terminal.log` except the harness's own summary.
  - `placeShimForGame ... drmWrapper=steamstub`, `[bridge-steamstub]`, `[bridge-notice]`: sidecar
    `logInfo`/`logWarning`, so `gamelib.log` only (never the transcript).
  - `steam://run`, `ActiveProcess`, `steamclient64.dll` load lines: the `--cx-log` file
    (`round-<n>.cxlog`), written by the harness only.

## Iteration protocol (run by 52-11)

Cap: after round 0, **at most 3 discovery rounds** (rounds 1-3, `MODE=probe REG=1`). After each round
classify the evidence and apply ONLY these permitted changes, each through the normal code path with
tests, then `pnpm gen-vtables` (no diff), `pnpm build-steam-bridge`, and a fresh `SHIM64` stat:

- (a) FWD `GetISteam<X> ver=<V> native=present` where V is not in `SHIM64_SERVED_INTERFACE_VERSIONS`:
  add V via `pnpm extract-proton-inventory --versions <V>` + helperInterface + arches x64 +
  gen-vtables + coverage pins (precedent e9519488d / 8628ea5a7).
- (b) FWD `<Method> unresolved` immediately before exit: find the real flat name with `nm -gU` on the
  installed `libsteam_api.dylib` and fix the policy row; if none exists, record as a gap.
- (c) Shim-local ISteamClient calls (slots 7, 21, 31, 32, 33) are unobservable: their stub bodies are
  silent and no cx-log channel shows them. A round that ends in a stub exit with no new FWD line
  after the last forwarded call (and no (a)/(b)/(d)/(e)/(f) evidence) escalates to adding the
  deferred log-only CONTROL "note" slot as that round's permitted change: the shim's local stubs send
  the helper the name of the local method that ran, the helper logs `FWD-LOCAL <Interface>.<Method>`,
  and the reply is ignored (a log, never an answer). It counts against the 3-round cap.
- (d) `No implementation for steam_api64.dll.<X>` that is called: add the export following the 52-07
  pattern.
- (e) cx-log shows the stub reading `ActiveProcess` value `pid` before its exit or `steam://run`:
  STOP and raise the decision checkpoint (decision 1). No pid writer without the user.
- (f) FWD `CreateInterface ver=SteamClient017 native=NULL` and `ver=SteamClient014 native=NULL`:
  native does not accept these names via `SteamInternal_CreateInterface` (assumption A1). Stop and
  record an issue.

Forbidden in every round (locked boundary): any stand-in or logging fake client; any local answer on
the ISteamClient path; returning the null object from a forwarded `GetISteam*` or
`GameLibBridge_CreateInterface`; disassembly or reverse engineering of the SteamStub wrapper or CEG;
HKLM writes; hand edits to the product bottle.

Stop on pass (scratch main menu + operator-confirmed In-Game) or at the cap. At the cap without a
pass, record `issue` and write a pending todo with the evidence (carrying `severity:`, `platform:`,
`ready:` per the todo convention).

Facts the runner must not trip over (from earlier plans):

- The five `SteamInternal_*` exports pre-existed from quick 261024-i94. `FindOrCreateGameServerInterface`
  falls back to the null object and `ContextInit` uses a global counter; that is NOT the plan-07
  behavior (52-07 summary). It is not a forbidden "null object from a forwarded GetISteam*", but if a
  round's evidence implicates it, say so rather than assuming plan-07 semantics.
- The helper's CREATE_INTERFACE slot against a real populated profile (native present) is untested
  (52-02 deferred it to this gate); round 1 is its first real exercise.
- `steamclient64.dll` has never been loaded in a Wine bottle (52-03); round 1 is its first load.
- A SteamStub title whose shim verdict is `withheld` carries no `drmWrapper`, takes the direct-launch
  branch with no forwarder and no notice (52-08/52-09). If item 6 shows neither `drmWrapper=steamstub`
  nor `steamstub-unforwarded`, check for a `withheld` verdict in `gamelib.log` before concluding
  anything else.

## Current Test

item 6 in progress (52-12): packaged GameLib launched, awaiting operator play; items 7-8 pending

## Tests

### 1. Round 0 — positive control (MODE=probe REG=0)

expected: `SESSION=... ROUND=0 MODE=probe REG=0 WATCH=30 gate/scratch-run.sh`: round-0.helper.log has `LISTEN`; round-0.cxlog contains `steam://run/219990` (proves the trace channel shows the fallback when it happens, so item 7's zero count is meaningful); the game exits within about 5 seconds.
result: pass — round 0 (REG=0, session /tmp/gamelib-gate-52-20261024T015232Z, 2026-10-24T01:52:37Z): round-0.helper.log has `LISTEN 127.0.0.1:50644 appid=219990 mode=full` and `INIT   SteamAPI ready`; round-0.cxlog `grep -c 'steam://run/219990'` = 4 (summary count `steam://run` = 4); game not alive at 31 s (exited within the watch). The trace channel shows the fallback, so item 7's zero count will be evidence. Mac Steam signed in (SteamAPI ready). Harness ordinal: GATE ROUND 0.

### 2. Discovery round 1 (MODE=probe REG=1)

expected: `ROUND=1 MODE=probe REG=1`: round-1.cxlog shows the stub opening `ActiveProcess` and loading `steamclient64.dll`; round-1.helper.log shows `HELLO` and `FWD CreateInterface ver=SteamClient017 native=present`; record every FWD line, the outcome (exit code, runtime, main menu), and the change made per the protocol, or `pass` if main menu plus operator-confirmed In-Game.
result: pending — pass candidate only (operator correction 2026-10-24: expected requires main menu, which this headless round never observed, and the game's Steam init logged `[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.` at round-1.cxlog:6226 before `Loaded '...\x64\steamclient64.dll' OK.` at :6392 — not a clean init log under the strict bridge-verified rule; 52-12 item 6 decides). First forwarded run (round 1, MODE=probe REG=1, WATCH=60, 2026-10-24T01:53:13Z, no code change needed; protocol classification: none of (a)-(f) fired). Helper log: `LISTEN 127.0.0.1:50646`, `INIT SteamAPI ready`, `HELLO  shim attached appid=219990`, `FWD CreateInterface ver=SteamClient017 native=present`, `FWD CreateInterface ver=SteamClient014 native=present` (only two FWD lines; no GetISteam* forwarded). cxlog: `steam://run` count 0; ActiveProcess key opened three times; `RegQueryValueExW ... L"pid"` twice (lines 6216, 6224 of round-1.cxlog) with no value present, after which the stub read `SteamClientDll64` and `Loaded L"...\\Grim Dawn\\x64\\steamclient64.dll" ... native`. wine.log `No implementation for steam_api64.dll` count 0. Grim Dawn alive at 60 s (runtime=60s). Mac Steam process still running after the round. Main menu and Mac Steam In-Game NOT operator-observed here (headless round; the product-bottle confirmation is item 6 in 52-12). Evidence sink: /tmp/gamelib-gate-52-20261024T015232Z/round-1.{helper.log,cxlog,wine.log}, terminal.log has two `=== GATE ROUND` delimiters.

### 3. Discovery round 2

expected: `ROUND=2 MODE=probe REG=1` after round 1's permitted change: same observations as item 2; `result: skipped — not needed` if an earlier round passed.
result: skipped — round 1 passed

### 4. Discovery round 3

expected: `ROUND=3 MODE=probe REG=1` after round 2's permitted change: same observations as item 2; `result: skipped — not needed` if an earlier round passed. Round 3 is the cap.
result: skipped — round 1 passed

### 5. pid decision (decision 1)

expected: `skipped — no pid read observed` unless protocol (e) fired, in which case the user's decision and its evidence are recorded.
result: pass — operator decision recorded 2026-10-24: no pid writer for now; 52-12 decides. The skip condition did NOT hold (the stub queried ActiveProcess `pid` twice, absent, round-1.cxlog:6216 and :6224), so the decision was put to the operator. Evidence shown: after the second read the game's SteamAPI_Init logged `SteamAPI_IsSteamRunning() did not locate a running instance of Steam.` (:6226) but continued — read SteamClientDll64, loaded steamclient64.dll native (:6385), `Loaded ... steamclient64.dll OK.` (:6392); helper logged HELLO and FWD SteamClient017/014 native=present; no `steam://run`; alive at 60 s. Options a/b/c not taken. If 52-12's product-bottle launch fails to reach main menu or its Steam init fails on IsSteamRunning, a pid writer becomes a gap-closure plan (`/gsd-plan-phase 52 --gaps`). No pid writer exists in the repo.

### 6. Done-when — GameLib launch of Grim Dawn (product bottle)

expected: GameLib launch 1 (`=== GATE LAUNCH 1 ===`): Play from the packaged build; the archived gamelib-launch-1.log has `drmWrapper=steamstub`, `[bridge-steamstub] appId=219990 forwarder placed`, `bridge helper [219990]:` lines with `HELLO shim attached appid=219990` and `FWD CreateInterface ver=SteamClient017 native=present` (or 014); no `steamstub-unforwarded`; the product `x64/steam_api64.dll` size equals the current SHIM64; the game stays up past 60 s; operator confirms main menu and Mac Steam In-Game Grim Dawn; quitting clears In-Game.
result: pending

### 7. Done-when — cx-log trace of GameLib's own setup (MODE=trace)

expected: after item 6 with GameLib quit and no 219990 helper left, `ROUND=7 MODE=trace WATCH=90` on a fresh clone of the post-item-6 product bottle: round-7.cxlog `grep -c 'steam://run'` prints 0, the cxlog shows `steamclient64.dll` loaded, and the game process is still alive at 90 s (the main menu itself was operator-confirmed in item 6 on identical state).
result: pending

### 8. Done-when — bottle hygiene

expected: after `wineserver -k` of the product bottle, its `user.reg` has `SteamClientDll64` under ActiveProcess and no `pid` value; `system.reg` has no `Software\Valve` or `Wow6432Node\Valve` key; no `steam.exe` or Windows Steam client in the bottle; `x64/Grim Dawn.exe` sha256 equals the preflight value.
result: pending

## Structural Reachability Review

Applied by 52-10 against all seven tests of `live-gate-contract-authoring.md`.

Pairing pass (Test 5), reduction stated: every state-mutating requirement against every
evidence-bearing requirement, not the full cross product. State-mutating (M=6): harness fresh
clone (`rm -rf` + `cp -cR`) per round; harness `wineserver -k` of the source and clone; GameLib
launch in item 6 (writes product registry, shim, cfg); GameLib quit; code change + rebuild between
rounds; `gamelib.log` rotation on next launch. Evidence-bearing (N=7): `terminal.log`, round
helper/cx/wine logs, `gamelib-launch-<n>.log`, product `user.reg`/`system.reg`, exe sha256,
product shim size, closing inventory. 42 pairs considered, 4 flagged and resolved:
(1) rotation x gamelib.log, resolved by the per-launch `cp` before the next launch;
(2) harness clone `rm -rf` x round logs, resolved because the clone lives in the bottles dir and the
logs in the session dir (and round logs are appended with `>>`, label per round);
(3) GameLib launch x item 1/7 positive control, resolved by ordering (rounds, then item 6, then 7);
(4) rebuild x preflight SHIM64, resolved by re-`stat` after each rebuild.

| Item / sub-check / precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|
| Item 1 round 0 | harness, cx-log | `LISTEN` in helper log, `steam://run/219990` in cxlog, exit in ~5 s | REACHABLE | `.planning/spikes/038-steamstub-grimdawn-probe/evidence.txt:7` shows the exact string in a cx-log; helper `LISTEN` at `bridge_helper.c:698`; absence-observability: this IS the positive control (Test 4) |
| Item 1 as item 7's positive control | cx-log channel | same flags `+process,+reg,+loaddll,+seh` in both | REACHABLE | both use the same single flag string in `gate/scratch-run.sh`; a 0 in item 7 would have been a non-zero if the fallback ran (Test 4) |
| Item 2 | harness, helper log, cx-log | `HELLO`, `FWD CreateInterface ver=SteamClient017 native=present`, `ActiveProcess` open, `steamclient64.dll` load | REACHABLE (CONDITIONAL on native accepting the name, A1, handled by protocol (f)) | `bridge_helper.c:479` (HELLO), `:513` (FWD); sink is `round-<n>.helper.log` via `>>` in the harness |
| Items 3, 4 | harness | repeat after permitted change | REACHABLE | same harness; fresh clone per run (`rm -rf` then `cp -cR`) |
| Item 5 | decision | skipped unless protocol (e) | REACHABLE | no emitter needed; (e) detection is `grep ActiveProcess` + word `pid` in summary block |
| Item 6, Play gesture | packaged UI | click Play on Grim Dawn | REACHABLE | `src/frontend/screens/Library/components/GameCard/index.tsx:253,273,287` render Play wired to `handlePlay(runner)`; Grim Dawn is installed in the bridge bottle (precondition) (Test 7) |
| Item 6 `drmWrapper=steamstub` | gamelib.log | line present | REACHABLE (CONDITIONAL on a non-withheld verdict) | emitter `shimGenerate.ts:703` (`logInfo`, sidecar sink, gamelib.log); a `withheld` verdict has no drmWrapper (52-08/09), covered by the withheld fact above |
| Item 6 `[bridge-steamstub] ... forwarder placed` | gamelib.log | line present | REACHABLE | emitter `games.ts:2974` (`logInfo`), gamelib.log only |
| Item 6 `HELLO` / `FWD` | gamelib.log | prefixed `bridge helper [219990]:` | REACHABLE | sink differs from harness rounds: helper stderr is forwarded by `helperProcess.ts:297-303` into gamelib.log; the Capture standard states both sinks |
| Item 6 no `steamstub-unforwarded` | gamelib.log | absence | REACHABLE; absence is falsifiable | emitter `games.ts:2708` would log on any unavailable/setup-error cause (Test 4) |
| Item 6 shim size == SHIM64 | product bottle | placed shim replaced | REACHABLE | product shim was 223744 at authoring (stale); `shimGenerate.ts:1267` byte-identity guard fails so it is replaced (Test 6, pre-existing state recorded in preflight) |
| Item 6 operator confirms main menu / In-Game | human, Mac Steam | observation | REACHABLE | no automation claimed; operator is the instrument |
| Item 7 | harness MODE=trace | `steam://run` count 0, `steamclient64.dll` loaded, alive at 90 s | REACHABLE; absence is falsifiable via item 1 | harness trace mode makes no copies or registry writes; pgrep guard needs GameLib quit (precondition) |
| Item 6 -> item 7 ordering | pair | item 7 needs GameLib's state | REACHABLE | stated in Preconditions; no relaunch between, so gamelib-launch-1.log stays intact (Test 5) |
| Item 8 | product bottle | `SteamClientDll64` present, no `pid`, no Valve keys, exe sha unchanged | REACHABLE (CONDITIONAL on a flushed registry) | `wineserver -k` before reading; Test 6: preflight records the pre-existing counts so a non-zero baseline is explicit |
| Precondition: packaged build | build | `tauri:dev:packaged` | REACHABLE | repo rule: never `tauri:dev` |
| Precondition: Mac Steam signed in | external process | operator confirms | REACHABLE (Test 6) | external state outside any preflight command; confirmed by the operator and positively by FWD `native=present` |
| Precondition: no GameLib instance / no 219990 helper | process | pgrep empty | REACHABLE; was NOT satisfied at authoring (pid 5606) | harness guards `pgrep` lines in `gate/scratch-run.sh`; runner must quit it |
| Precondition: Grim Dawn installed in the bottle | product bottle | files exist | REACHABLE | `x64/Grim Dawn.exe`, `x64/steam_api64.dll`, `gamelib_bridge.cfg` observed at authoring |
| Pre-existing shims in `compat/` and bottle root (Test 6) | product bottle | `compat/` holds game-original files; root has `gamelib_bridge.cfg` and `steam_api.dll` | REACHABLE | the harness writes the x64 cfg and the root cfg and replaces only `x64/steam_api64.dll`; item 8 does not assert about `compat/` or root shims |
| Capture instruction | session dir | append-only logs, per-launch archive, single instance, inventory | REACHABLE | `tee -a` and `>>` throughout `gate/scratch-run.sh`; nothing truncates `terminal.log`; harness round logs are per-label |
| Harness cannot write the product bottle | scratch harness | clone-only writes | REACHABLE | dry run prints no mutating command under the product bottle's `drive_c`; guards refuse CLONE==SRC |

Count of IMPOSSIBLE verdicts after review: 0. CONDITIONAL rows: item 2 (A1), item 6 drmWrapper
(withheld), item 8 (registry flush); the first precondition row was not met at authoring and is a
runner action, not a contract defect.

## Summary

total: 8
passed: 2
issues: 0
pending: 4
skipped: 2
blocked: 0

## Gaps

[none yet]
