---
status: testing
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
updated: 2026-10-24T06:30:00Z
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

item 26: re-gate 3 ELEX no-regression (conditional); scored by 52-28

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
result: issue — GameLib launch 1 (pid 13630, packaged debug bundle; archive /tmp/gamelib-gate-52-20261024T015232Z/gamelib-launch-1.log). Operator: "grim dawn not launching, failing silently"; main menu NO, In-Game NO (not reached), In-Game cleared n/a. Three Play attempts (gamelib-launch-1.log lines 114-122, 178-186, 228-236), each: `placeShimForGame: appId 219990 withheld the shim -- importer evidence names gaps the shim cannot serve (... unservable interface versions: STEAMREMOTESTORAGE_INTERFACE_VERSION016, SteamNetworking006, SteamUser023); launching with the game's own steam_api, no helper (quick 261024-j4l)`, then `.bind section present ... (informational, no routing change)`, `launching appId 219990 via the Steam bridge bottle directly (shim withheld: ...)`, then `bottleProcessMonitor [219990]: matched process(es) gone after 2s of play` (lines 122, 186, 236). Every required log check failed: no `drmWrapper=steamstub`, no `[bridge-steamstub] ... forwarder placed`, no `bridge helper [219990]:` HELLO or FWD lines, no `steamstub-unforwarded` notice (the withheld path carries no drmWrapper), runtime 2 s not >= 60 s. Lines 115/180/229 also warn `the original steam_api64.dll is gone (no .gamelib-orig backup) -- leaving the GameLib shim in place`: the product x64/steam_api64.dll is still the stale 223744-byte shim (SHIM64 is 242688), so the "game's own steam_api" log claim is false and the game ran the stale shim with no helper. Not scorable as bridge-verified (no game Steam-init log). See Gaps 1-4.

### 7. Done-when — cx-log trace of GameLib's own setup (MODE=trace)

expected: after item 6 with GameLib quit and no 219990 helper left, `ROUND=7 MODE=trace WATCH=90` on a fresh clone of the post-item-6 product bottle: round-7.cxlog `grep -c 'steam://run'` prints 0, the cxlog shows `steamclient64.dll` loaded, and the game process is still alive at 90 s (the main menu itself was operator-confirmed in item 6 on identical state).
result: issue — ROUND=trace MODE=trace WATCH=90 (2026-10-24T02:44:17Z, GameLib quit, no 219990 helper, pair rule satisfied; clone-only). round-trace.cxlog `grep -c 'steam://run'` = 4 (expected 0); the game was not alive at 90 s (alive=no); helper HELLO 0, FWD 0; ActiveProcess opened three times with no `pid` value read. State inherited was GameLib's: because launch 1 took the withheld path, GameLib wrote no SteamClientDll64, no steamclient64.dll and no refreshed shim, so the trace shows the unforwarded fallback (the same signature item 1 proved the channel can see). Caveat: scratch-run.sh bypasses placeShimForGame and its withhold guard, so a pass here would not have covered the product launch path; this failure instead reflects the product's withheld state. Evidence: /tmp/gamelib-gate-52-20261024T015232Z/round-trace.cxlog, round-trace.helper.log.

### 8. Done-when — bottle hygiene

expected: after `wineserver -k` of the product bottle, its `user.reg` has `SteamClientDll64` under ActiveProcess and no `pid` value; `system.reg` has no `Software\Valve` or `Wow6432Node\Valve` key; no `steam.exe` or Windows Steam client in the bottle; `x64/Grim Dawn.exe` sha256 equals the preflight value.
result: issue — read-only on the product bottle after `wineserver -k` (2026-10-24): `user.reg` has no `Valve\\Steam\\ActiveProcess` key at all (count 0), so `SteamClientDll64` is absent (expected present; GameLib's SteamStub setup never ran because launch 1 was withheld); no `pid` value (fine); `grep -cE '^\[Software\\(Wow6432Node\\)?Valve' system.reg` = 0 (pass); no `steam.exe` or `steamclient*.dll` in the Steam root (pass); `x64/Grim Dawn.exe` sha256 d3915e2599317b6670cc088ba958afb2b2f4fa8141cfd1d777ee02f9ea1fc4c4 equals the preflight value (pass); x64/steam_api64.dll is still 223744 bytes, the stale shim (not SHIM64 242688), x64 holds gamelib_bridge.cfg (24 bytes) and no steamclient64.dll. Hygiene is clean but the expected SteamClientDll64 line is not met, so not a pass. Closing inventory: see 52-12-SUMMARY.md.

### 9. Re-gate — GameLib launch of Grim Dawn after 52-13..16
expected: no `withheld the shim` line for 219990; `drmWrapper=steamstub`; `[bridge-steamstub] appId=219990 forwarder placed`; `bridge helper [219990]:` with `HELLO shim attached appid=219990` and `FWD CreateInterface ver=SteamClient017 native=present` (or 014); no `steamstub-unforwarded`; product x64/steam_api64.dll size equals the new SHIM64; runtime >= 60 s; operator confirms main menu; In-Game recorded but not counted.
result: issue — every log check passed but the operator saw the SteamStub failure, not the main menu (GameLib pid 40483, debug bundle; log /tmp/gamelib-gate-52r-20261024T033525Z/gamelib-relaunch-1.log, 173 lines, captured while GameLib was still running). Operator, verbatim: "1. yes  2. get a error "application load error 3:... (tried twice same result)"". Q1 (a "Steam DRM check may fail" notice shown) = NO, as expected: the operator later corrected the first answer, verbatim "no notice, closed gameelib", so the "1. yes" above was a misread; Q2 main menu = NO; In-Game and In-Game-cleared not reported (not inferred). Log checks, play attempt 1 (16:43) and 2 (16:43:59): no `withheld the shim` (grep count 0); `drmWrapper=steamstub` at :105 and :141; `[bridge-steamstub] appId=219990 forwarder placed at ...\x64\steamclient64.dll` at :118 and :154; `HELLO  shim attached appid=219990` at :123 and :158 with `FWD CreateInterface ver=SteamClient017 native=present` (:124, :159) and SteamClient014 (:125, :160); `reg add ... SteamClientDll64` at :113 and :150 and `reg add ... Universe` at :116, `setupSteamClientForwarder ... registered ... under HKCU ActiveProcess` at :117 and :153; `placeShimForGame: shim already present and byte-identical` at :139 on the second attempt (the first attempt logs no refresh line, but the file went from the 223744-B stale shim to 251392 B with mtime 16:43, so it was replaced); product x64/steam_api64.dll = 251392 B == SHIM64 and x64/steamclient64.dll = 186368 B == built forwarder (stat, public/bin/arm64/darwin), both mtime 16:43. Runtime: attempt 1 `matched process(es) gone after 31s of play` (:127, short of the 60 s bar), attempt 2 `gone after 3s of play` (:164). The `steamstub-unforwarded` check: the log has no `steamstub-unforwarded` line (grep count 0), consistent with the corrected notice answer (no notice shown). The product path did everything the plan asked of it (forwarder placed, registry set, helper HELLO, SteamClient017/014 forwarded natively) and Grim Dawn still ended in Application Load Error 3; the helper log has nothing after the two FWD lines (no further FWD, no GetISteam* forwarded, no error line), so the helper log does not say why the stub rejected the Steam state. Item 9 is not a pass; the diagnosis of why SteamStub still fails after a clean HELLO/FWD is open (item 10's cx-log trace is the next evidence). Bridge-verified: NOT verified (no game Steam-init log, In-Game never counts).

### 10. Re-gate — cx-log trace and strict Steam-init check (MODE=trace)
expected: clone taken AFTER item 9 (GameLib quit, no 219990 helper), `ROUND=regate MODE=trace WATCH=90`; clone holds product-written state (x64/steam_api64.dll size equals SHIM64 and is byte-identical to the product copy; x64/steamclient64.dll byte-identical to the product's; clone user.reg SteamClientDll64 under ActiveProcess equals the product's); cxlog `grep -c 'steam://run'` is 0, steamclient64.dll loaded, game alive at 90 s, at least one `[S_API]` line and no `SteamAPI_IsSteamRunning() did not locate a running instance of Steam`. Harness-placed state is `issue — harness-flow init evidence only`; no game Steam-init log is `issue — unverified (no game Steam-init log)`.
result: issue — strict Steam-init check FAILED: IsSteamRunning warning present. Session /tmp/gamelib-gate-52r-20261024T033525Z, `ROUND=regate MODE=trace WATCH=90` (DRY_RUN=1 first: no cp of the shim or forwarder and no `reg add` in the printout), clone GameLibGate52GD taken after item 9 with GameLib and the 219990 helper gone. Clone state (asserted after the run; trace mode never rewrites these): x64/steam_api64.dll 251392 B == SHIM64 251392 B and `cmp` identical to the product bottle; x64/steamclient64.dll `cmp` identical to the product's; clone user.reg ActiveProcess holds `"SteamClientDll64"="C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grim Dawn\\x64\\steamclient64.dll"` and `"Universe"="Public"`, identical to the product user.reg. The one harness-written file is gamelib_bridge.cfg (its own helper port). So the init evidence is product-written state, not harness-flow. Trace: `steam://run` count 0; steamclient64.dll loaded from the Grim Dawn x64 dir (round-regate.cxlog:23472 `Loaded ... steamclient64.dll ... native`); helper log HELLO x1 and FWD CreateInterface SteamClient017 and SteamClient014 native=present at 03:48:10Z, nothing after. `[S_API]` lines: 2 (cxlog:23313 `SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.` and :23479 `SteamAPI_Init(): Loaded '...\Grim Dawn\x64\steamclient64.dll' OK.`). IsSteamRunning warning count = 1 (not clean); `RegQueryValueExW L"pid"` reads = 2 (:23303, :23311), the same pattern as the round-1 baseline; ActiveProcess value-name pid lines = 0 (the harness counter) because the value is absent. After the Loaded-OK line the game process (pid 00d0) looks up `Steam_ReleaseThreadLocalMemory` in Grim Dawn.exe (not found, :cxlog 186295.671), loads winemac.drv at 186296.167, and its last cxlog line is 186296.487 (user32 resource loads). The harness summary said alive=yes at 90 s, but that is a pgrep on the process name and the cxlog ends at 186301.167, ~7 s after launch; no screenshot or operator view exists, so whether the game was at a main menu, a dialog or a hung window is NOT established. A modal Application Load Error 3 box would fit the log (a window is created, then silence), but that is inference, not observed. No game-written log files found (find under the clone's drive_c/users newer than launch-marker: none). Bridge-verified: NOT verified (warning present). What the trace shows about the Load Error 3 cause: SteamStub did reach steamclient64.dll (via the forwarder) and the helper answered both CreateInterface calls, and nothing in the log shows a later failing call; the cause of Load Error 3 remains unknown. The 2 pid reads precede the warning, so the missing ActiveProcess `pid` value is the only Steam-state gap visible in this trace (item 13).

### 11. Re-gate — bottle hygiene
expected: after `wineserver -k` on the product bottle, user.reg has `SteamClientDll64` under ActiveProcess and no `pid`; no HKLM Valve key in system.reg; no steam.exe or steamclient*.dll in the Steam root; x64 steamclient64.dll byte-identical to the built forwarder; exe sha256 equals the preflight value.
result: pass — read-only after `wineserver -k` on GameLibSteamBridge-219990 (terminal.log `--- item11`): user.reg ActiveProcess has `"SteamClientDll64"` (and `"Universe"="Public"`), 0 `"pid"` values; system.reg Valve keys 0; no steam.exe or steamclient*.dll in the Steam root; x64/steamclient64.dll `cmp` identical to public/bin/arm64/darwin/steamclient64.dll; Grim Dawn.exe sha256 d3915e25...a1fc4c4 equals the preflight (d3915e2599317b6670cc088ba958afb2b2f4fa8141cfd1d777ee02f9ea1fc4c4); no .gamelib-orig beside the shim.

### 12. Re-gate — ELEX (411300) no-regression after CR-01
expected: GameLib launch of ELEX through GameLibSteamBridge-411300; gamelib.log has `HELLO shim attached appid=411300` and no `[bridge-steamstub]` line for 411300; no "not subscribed" error and ELEX reaches at least its loading screen (51-UAT item 15 baseline, knownBad does-not-run); any game log checked for Steam-init failures; pass means no regression, bridge-verified recorded separately and expected to stay unverified.
result: issue — all three plan pass conditions held but the operator reports a Mac Steam side effect the baseline never recorded, and it is not explained (GameLib pid 42642, debug bundle, GATE LAUNCH R2 2026-10-24T03:51:42Z; log /tmp/gamelib-gate-52r-20261024T033525Z/gamelib-relaunch-2.log, 99 lines, copied after quit). Operator, verbatim: "opened elex, steam signed me out of friends... I did check before I launched ELEX and again when writing this update.  gets to the loading screen and hangs there as expected.  quit game and gamelib". Error dialog: none reported. Furthest screen: loading screen, hangs (matches the 51-UAT item 15 baseline). In-Game: not reported (never counts). Log checks: `HELLO  shim attached appid=411300` at 17:34:02 (:81, local clock; helper stamp 04:34:02Z); `placeShimForGame: overwrote steam_api64.dll for appId 411300 ... (10 imported symbol(s) covered)` at :69; `[bridge-steamstub]` count 0 and no `drmWrapper=steamstub` (CR-01 gating held: ELEX did not take the forwarder path); helper log for 411300 has only LISTEN (`127.0.0.1:51593 appid=411300 mode=full`), `INIT   SteamAPI ready (single InitFlat call, real appid=411300)` and HELLO, so there are no FWD, CreateInterface or GetISteam* lines; `bottleProcessMonitor [411300]: matched process(es) gone after 155s of play` (:88). No game-written log files under the 411300 bottle newer than elex-marker (find: none), so no game Steam-init log exists. Friends sign-out: the log contains no line that names Friends, persona, logoff, kicked or LoggedInElsewhere. The only account-session events in the run are (a) GameLib's own steam-user `SteamUser.loggedOn: cellID=22` and `cold-connect path took 1146ms` at 17:33:59 (:65, :67), logged on from the keyring refresh token one second after the Play click (`keyring_get ok present=true ... trigger=user-play`, :60-62), and (b) the helper's `SteamAPI_Init` against the Mac `steamclient.dylib` at 17:34:00 (:72-75). The same steam-user logon happened before the Grim Dawn launches (R1 `SteamUser.loggedOn` at 16:37:31), but the operator was not asked about Friends then, so there is no comparison. CAUSE UNKNOWN: the evidence does not show which of (a), (b) or something outside GameLib signed Friends out, and it is not established that CR-01 or the bridge path is involved. Scored issue because "no worse than the baseline" cannot be shown when a visible Steam sign-out happened and the baseline recorded none. Bridge-verified: no (HELLO present, no game Steam-init log; In-Game never counts). See Gaps 5.

### 13. Re-gate — pid decision (revisits decision 1)
expected: `skipped — no IsSteamRunning warning` if item 10 is clean; otherwise the operator's decision and its evidence.
result: pass — operator chose option-c (investigate first, no pid writer yet), recorded 2026-10-24. Evidence shown: item 10 IsSteamRunning warning count 1 (round-regate.cxlog:23313), two `RegQueryValueExW L"pid"` reads (:23303, :23311) before it, item 9 Application Load Error 3 after a clean HELLO/FWD with nothing logged after the two FWD lines, main menu never observed. Investigation scope per operator: what the SteamStub check does with the ActiveProcess `pid` value, AND the ELEX Mac Steam Friends sign-out (item 12). Next step: run /gsd-plan-phase 52 --gaps. No pid writer exists in the repo.

### 14. Gap 5 diagnosis — relay trace of the SteamStub check window (MODE=trace)
expected: the clone holds the product-written state (x64/steam_api64.dll and x64/steamclient64.dll `cmp` identical to the product's, clone SteamClientDll64 equal to the product's); the window between the SteamClient014 CreateInterface and the MSGBOX is captured with relay lines (GetProcAddress, GetModuleFileName, OpenProcess, CreateFileW, ReadFile and their kernelbase/ntdll counterparts); Q1-Q6 are each answered observed-or-not-observed with cxlog line refs; the genuine Win64, forwarder and native Mac export tables are recorded side by side. No fix is chosen.
result: pass — session /tmp/gamelib-gate-52d-20261024T053624Z, `ROUND=diag1 MODE=trace WATCH=45`, one round (fallback diag2 not needed). DRY_RUN printout first: RelayInclude `reg add` targets `CX_BOTTLE=GameLibGate52GD` only, no cp of steam_api64.dll or steamclient64.dll, no `Software\Valve` write. Clone state asserted after the run: both DLLs `cmp` identical to the product's, clone user.reg SteamClientDll64 count 1 and the ActiveProcess key equal to the product's. Product bottle re-read after `wineserver -k`, before and after: exe sha256 d3915e2599317b6670cc088ba958afb2b2f4fa8141cfd1d777ee02f9ea1fc4c4, shim 251392 B sha256 41b74555...b8051be, forwarder 186368 B sha256 d84cb744...aac849, ActiveProcess lines (SteamClientDll64, Universe=Public, no pid) all unchanged. Relay worked: 852 `Call` lines in a 11964-line cxlog; first MSGBOX at cxlog:7186. The window, from the SteamClient014 recvs (cxlog:7166-7167) to MSGBOX: the stub resolves CreateInterface on the forwarder (7168), looks up `Steam_ReleaseThreadLocalMemory` with module handle 0 (searched in Grim Dawn.exe, not found, 7163-7165), calls GetModuleFileNameW on the forwarder (7170), opens it with CreateFileW (7174) and reads all 186368 bytes with ReadFile (7178), then resolves user32 MessageBoxA (7184). The same stub code read the whole Grim Dawn.exe earlier (6810-6820). No OpenProcess/NtOpenProcess call (the one `OpenProcess` relay match is an import-name GetProcAddress at 6651), no image-name queries, no registry read in the window. Export tables in 52-19-DIAGNOSIS.md `## Gap 5: export tables`: genuine 41 names, forwarder 1 (CreateInterface), native Mac 33; spike 038 exports64.txt equals the genuine table. Full answers and candidate inputs: 52-19-DIAGNOSIS.md. Bridge-verified: NOT verified (the IsSteamRunning warning at cxlog:6840 and Load Error 3 persist). Closing inventory: see terminal.log in the session dir.

### 15. Gap 6 attribution — Friends state across the arms (non-ELEX)
expected: Friends is recorded before and after the idle control and arms c, b, a and d, and the attribution names only an arm that flipped while the control held.
result: pass — session /tmp/gamelib-gate-52d-20261024T053624Z, T_bridge = Age of Decadence (230070). 0a signed in, 0b (3 min idle) signed in, arm c (helper alone) signed in to signed in, arm b (steam-user logon alone, no Play) signed in to SIGNED OUT in F1 (loggedOn 05:52:03Z, flip seen ~05:52:35Z) and again in the pre-committed repeat F2 (loggedOn 05:55:45Z, flip ~05:56:05Z, no Play). Arm a not exercised (no bridge toggle, no non-bridge title installed). Arm d (F3, bridge Play, helper and shim hashes equal the trace snapshots) held ONLINE through INIT, HELLO and 63 s of play once Friends was restored by a Mac Steam restart; it was offline after the F3 logon before the restart. Mac Steam logs show no displacement or remote logoff (only the two operator restarts). Attribution: the GameLib steam-user logon, not the helper, shim or bridge Play. classification: outside-phase-52. Deviation: F2 became the arm b repeat, so arm d ran in F3. Pending todo 2026-10-24-friends-sign-out-steam-user-logon.md. See 52-19-DIAGNOSIS.md `## Gap 6`.

### 16. Gap 5 fix decision (52-22)
expected: the operator chooses one boundary-reviewed option built from 52-19 evidence, or no change.
result: pass — operator chose option-other (marked Recommended); operator's words verbatim: "option-other (Recommended)" (a multiple-choice selection, no free-text words). It rested on the 52-19-DIAGNOSIS.md `## Gap 5: candidate inputs` row `content of the file at the forwarder path` (cxlog:7170-7181 and 6810-6820): direct that the stub reads all 186368 bytes of the forwarder immediately before the MessageBox, indirect on what it checks in them (never inspected or disassembled); no listed code option targets that input. Boundary review (six lines): who answers n/a (no change); stand-in risk none; HKLM untouched; exe not modified; no Windows Steam client in the bottle; hygiene unchanged. Options not chosen: option-flat (export-surface row indirect; `Steam_ReleaseThreadLocalMemory` was looked up with module handle 0, so it searched Grim Dawn.exe and a forwarder export would not answer it), option-path (module-path row: path read at 6830 and 7170-7174, no evidence it is rejected; a Steam-root location breaks item-11 "no steamclient*.dll in the Steam root"), option-none; option-pid was withheld (no OpenProcess/NtOpenProcess or image-name query in the trace, so no evidence the window depends on pid). Hygiene delta for 52-23 item 19: no hygiene delta. Next step: another planning round (`/gsd-plan-phase 52 --gaps`) to establish what the stub checks in the forwarder bytes. — not implemented by decision

### 17. Re-gate 2 — GameLib launch of Grim Dawn after 52-20..22
expected: everything item 9 expected; plus, for option-flat, a `FWD Steam_<name>` helper line for each name the stub resolves; the operator sees no Application Load Error dialog, confirms the main menu and stays in it at least 60 s; In-Game is recorded but not counted. `pass` only if every log check holds AND the operator confirmed the main menu.
result: skipped — no Gap 5 change implemented (item 16 option-other); no Grim Dawn launch made by 52-23

### 18. Re-gate 2 — cx-log trace and strict Steam-init check (MODE=trace)
expected: everything item 10 expected (clone after item 17 with the product-written state asserted by cmp; `steam://run` 0; steamclient64.dll loaded; alive at 90 s; helper HELLO count >= 1; the `[S_API]` line `SteamAPI_Init(): Loaded '...steamclient64.dll' OK.` present; zero `[S_API]` lines matching failed, error, not logged on or unable, case-insensitive; IsSteamRunning count 0); plus a `MSGBOX` count of 0 in the game process. Harness-placed state is `issue — harness-flow init evidence only`. No Steam-init line anywhere is `issue — unverified (no game Steam-init log)`.
result: skipped — no Gap 5 change implemented (item 16 option-other); no item 17 launch to trace

### 19. Re-gate 2 — bottle hygiene
expected: item 11's text with item 16's hygiene delta applied verbatim (item 16 recorded no hygiene delta, so unchanged): user.reg has `SteamClientDll64` under ActiveProcess and no `pid`; no HKLM Valve key in system.reg; no steam.exe or steamclient*.dll in the Steam root; x64 steamclient64.dll byte-identical to the built forwarder; exe sha256 equals the preflight value (d3915e2599317b6670cc088ba958afb2b2f4fa8141cfd1d777ee02f9ea1fc4c4).
result: skipped — no Gap 5 change implemented (item 16 option-other); no item 17 launch whose hygiene could be read

### 20. Re-gate 2 — ELEX (411300) no-regression after WR-09, Friends before/after
expected: everything item 12 expected; plus no `FWD` line for 411300 at all (WR-09: the non-lookup SteamClient methods stay local off the SteamStub path); the operator records Mac Steam Friends as signed in before Play and still signed in after quitting. A sign-out is `issue` only when 52-19's attribution is classified phase-52 or inconclusive. When it is outside-phase-52 (item 15 classified it so), item 20 is scored on ELEX no-regression alone and the Friends outcome goes to the Friends pending todo. Bridge-verified is recorded separately and expected to stay unverified.
result: pass — ELEX (411300) no-regression after WR-09 (GATE LAUNCH S2 2026-10-24T06:11:23Z, session /tmp/gamelib-gate-52s-20261024T060847Z, log gamelib-s2.log, 91 lines, copied after quit; archived also as gamelib-regate2-2.log). Log checks: `placeShimForGame: overwrote steam_api64.dll for appId 411300` at 19:13:06 (:56 local); `launching appId 411300 via the Steam bridge` (:63); `HELLO  shim attached appid=411300` at 06:13:08Z (:83); `[bridge-steamstub]` count 0; `FWD` count 0 (WR-09 held: the helper log for 411300 has only LISTEN, INIT `SteamAPI ready (single InitFlat call, real appid=411300)` and HELLO); `bottleProcessMonitor [411300]: matched process(es) gone after 88s of play` (:90, operator quit); no game-written log files under the 411300 bottle newer than elex-marker (find: none). Bridge-notice line present, no not-subscribed or other error dialog (operator: no notice or message about ELEX not working; none in the log). Furthest screen: loading screen, as every other time (matches the 51-UAT item 15 baseline). Operator, verbatim: "reached loading screen (as every other time)"; "I quit it"; In-Game "yes" (not counted). Friends: signed in before GameLib launch (~06:11Z, "friends is signeed in") / after GameLib's steam-user logon it dropped offline ("yes as per instructions") and the operator restarted Mac Steam before Play (52-19 arm d method, so the after-state measures the bridge run, not the logon) / still signed in at step 6 (~06:14-06:15Z, "reached step 6, friends still logged in"). Friends: signed-in/signed-in-after-restart, outside phase 52 per 52-19 (item 15, classification: outside-phase-52); the logon-induced drop is routed to pending todo 2026-10-24-friends-sign-out-steam-user-logon.md and did not fail this item. Scored on ELEX no-regression alone. Bridge-verified: no (HELLO present, no game Steam-init log; In-Game never counts).
### 21. Gap 5 diagnosis 3 — what the stub checks in the forwarder bytes (static + relay diag3)
expected: the static comparison of the genuine steamclient64.dll, the forwarder and Grim Dawn.exe is recorded; the genuine and forwarder export tables are re-recorded with equality to the 52-19 table stated; the clone holds the product-written state (cmp); R1-R6 are answered observed-or-not-observed with cxlog lines; the check classification has strength and boundary columns; no fix is chosen.
result: pass — session /tmp/gamelib-gate-52e-20261024T065250Z, plan 52-25, evidence in 52-25-DIAGNOSIS.md. Static comparison G/F/E recorded (size, CheckSum stored/recomputed, Security Directory, signer Valve Corp. via DigiCert, resource and version strings, exports, imports, sections, overlay, Rich header); the genuine export table is 41 names, identical to the 52-19 table, forwarder 1, dylib 33. Round `ROUND=diag3 MODE=trace WATCH=45` (2026-10-24T06:55:04Z), DRY_RUN first (RelayInclude only to GameLibGate52GD, no DLL cp, no Software\Valve write); 523 relay Call lines, fallback not needed; clone `x64/steam_api64.dll` and `x64/steamclient64.dll` cmp identical to the product's, SteamClientDll64 count 1 equal, product bottle unchanged after. Answers: R1 observed, `Application load error 3:0000065432` caption `Steam Error` (cxlog:6654); R2 not observed (no trust or certificate API in the game process); R3 not observed in the game process (the five advapi32 Crypt calls are CrossOver's launcher licence check in process 00e0, cxlog:2651-2743); R4 observed, one GetFileSize and one whole-file ReadFile of 0x2d800 bytes, no seek or mapping (6646-6648); R5 observed, the exe read (6308-6316) and the forwarder read (6640-6648) use the same return addresses, so the same stub routine; R6 observed (6640-6650). Classification rows A-D recorded; no row is direct evidence of what is checked, the check itself is not observable without disassembly. No fix chosen; 52-26 decides.

### 22. Gap 5 fix decision 3 (52-26)
expected: the operator chooses one boundary-reviewed option built from 52-25 evidence, or no change.
result: pass — operator chose option-versioninfo. Operator verbatim: "versioninfo (GameLib) (Recommended)". Label: boundary-compliant (GameLib's own strings, no Valve identity: CompanyName "GameLib", FileDescription "GameLib steamclient forwarder"; no BOUNDARY EXCEPTION, no ROADMAP amendment). Rests on 52-25-DIAGNOSIS.md `## Check classification` row C (strength indirect) and `### Differences` item 4 (the exe has a resource directory with version strings, the forwarder has none). Excluded and not offered: genuine Valve DLL in a bottle, Grim Dawn.exe modification, bottled-Steam reroute, pid writer. option-sign blocked (no signing tool), option-flat not offered (no forwarder-base Steam_* lookup). Risk rule: if the pinned zig cannot compile .rc through zig cc, stop as `blocked; replan`, no new tool downloaded.
files allowed: native/steam-bridge/steamclient/steamclient_fwd.rc, meta/buildSteamBridgeShims.ts, meta/__tests__/buildSteamBridgeShims.test.ts
implemented: commit 979c3b0e3 (decision record cad85dd11). files: native/steam-bridge/steamclient/steamclient_fwd.rc, meta/buildSteamBridgeShims.ts, meta/__tests__/buildSteamBridgeShims.test.ts. Built (pinned zig 0.16.0 compiled the .rc through zig cc, no new tool): SHIM64 251904 B, forwarder 187392 B (was 186368), exports: CreateInterface only. Property re-measured on the built file: resource directory .rsrc present (objdump Entry 2 Resource Directory, RVA 0x33000) with VS_VERSIONINFO CompanyName "GameLib", FileDescription "GameLib steamclient forwarder", FileVersion/ProductVersion 1.0.0.0, InternalName steamclient_fwd, OriginalFilename steamclient64.dll, ProductName "GameLib"; no "Valve" string. Boundary checks: no HKLM in native/steam-bridge/steamclient/ (steamClientSetup.ts line 9 is a pre-existing comment saying HKLM must not be used); no Grim Dawn.exe in the diff; no .dll tracked in the diff (public/bin/arm64/darwin/steamclient64.dll is git-ignored); built forwarder differs from the genuine DLL (187392 B, not 26547864). Not yet shown: that the stub accepts it; that needs the packaged-build Grim Dawn run (52-27).
hygiene delta for 52-27 (item 25): forwarder byte-identical to the new build (size 187392).

### 23. Re-gate 3 — GameLib launch of Grim Dawn after 52-26
expected: everything item 9 expected (no `withheld the shim` line for 219990; `drmWrapper=steamstub`; `[bridge-steamstub] appId=219990 forwarder placed`; `bridge helper [219990]:` with `HELLO shim attached appid=219990` and `FWD CreateInterface ver=SteamClient017 native=present` (or 014); no `steamstub-unforwarded`; product x64/steam_api64.dll size equals SHIM64 251904; runtime >= 60 s); plus the product x64/steamclient64.dll `cmp`-identical to the new build (187392 B) and carrying item 22's property (resource directory with GameLib VS_VERSIONINFO, no "Valve" string), re-measured; the operator sees no Application Load Error dialog, confirms the main menu and stays in it at least 60 s; Mac Steam shows Grim Dawn In-Game during the run and In-Game clears after quit (the done-when's In-Game conjunct, recorded as `In-Game: yes|no, cleared: yes|no`; it is not an input to bridge-verified, which item 24 alone scores). `pass` only if every log check holds AND the operator confirmed the main menu AND In-Game was observed AND it cleared after quit.
result: issue — Application Load Error; the done-when is not met. Session /tmp/gamelib-gate-52t-20261024T070522Z, GameLib pid 80846 (the gate's own instance, debug bundle), archive /tmp/gamelib-gate-52t-20261024T070522Z/gamelib-regate3-1.log (131 lines, archived right after the run while GameLib was still running). Log checks (archive line numbers): `withheld the shim` 0; `steamstub-unforwarded` 0; line 106 `drmWrapper=steamstub`; line 118 `setupSteamClientForwarder: appId 219990 registered ... x64\steamclient64.dll under HKCU ActiveProcess`; line 121 `[bridge-steamstub] appId=219990 forwarder placed at C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn\x64\steamclient64.dll`; line 124 `HELLO  shim attached appid=219990`; lines 125-126 every FWD line: `FWD CreateInterface ver=SteamClient017 native=present` and `FWD CreateInterface ver=SteamClient014 native=present` (2 FWD lines in total). bottleProcessMonitor runtime: line 123 game started pid 81430, line 128 `gone after 37s of play — game stopped` (expected >= 60 s: not met). Product x64/steamclient64.dll: `cmp` identical to public/bin/arm64/darwin/steamclient64.dll and to the session snapshot, 187392 B, sha256 2110a1f9564d3b9db904f469c43e5b9d54ccfa231c49787123e03393648fb065; item 22's property re-measured on the product copy: objdump Entry 2 Resource Directory .rsrc RVA 0x33000, UTF-16 strings CompanyName, FileDescription, "GameLib steamclient forwarder", ProductName, OriginalFilename present, no "Valve" string, exports CreateInterface only; product x64/steam_api64.dll 251904 B, `cmp` identical to the build. So the forwarder carrying the VS_VERSIONINFO resource was placed and loaded, yet the stub still failed. Operator, verbatim, first reply: "1. yes / 2. logged out of friends / 3. application load error" (steps 4-7 not answered in that reply). Operator follow-up, verbatim: "the error text was application load error, and no did not launch game.  however was able to login to friends and be online". Dialog: yes. Full dialog text: NOT recoverable. The operator gave only "application load error"; the item 24 trace has no MessageBoxA line (DEBUGMSG has no +relay), only the user32 `FindResourceExW ... L"MSGBOX"` resource lookup at cxlog line 23620, so the text and code cannot be compared with 52-25 R1 (`Application load error 3:0000065432`, caption `Steam Error`) from this run. Main menu: no (operator: the game did not launch; the 37 s runtime agrees). In-Game: not reported by operator; cleared: not reported by operator. Inference, not an operator statement: the game never launched, so In-Game was presumably never reached. Recorded literally: `In-Game: no, cleared: no` (conjunct unmet because there was no launch). GameLib quit: not confirmed by operator; the executor found the gate's own gamelib-shell pid 80846 still running, sent SIGTERM (exited), then `wineserver -k` of the product bottle; no other instance existed. Friends observation for 52-28 (todo .planning/todos/pending/2026-10-24-friends-sign-out-steam-user-logon.md already exists): operator, verbatim, "logged out of friends" and, in the follow-up, "was able to login to friends and be online". It was a sign-out the operator recovered from. Log corroboration: archive line 58, 20:10:37, immediately after the user-play keyring read, `Steam client error, username unavailable: Error: LogonSessionReplaced` from steam-user 09-logon.js (the known GameLib steam-user logon replacing the Mac Steam session; 52-19 classified it outside-phase-52). Attributed to the Play press, not to the bridge. Round-1 sign: the stub rejects this forwarder too, so item 22's VS_VERSIONINFO change did not clear the Application Load Error.

### 24. Re-gate 3 — cx-log trace and strict Steam-init check (MODE=trace)
expected: everything item 18 expected (clone after item 23 with the product-written state asserted by cmp; `steam://run` 0; steamclient64.dll loaded; alive at 90 s; helper HELLO count >= 1; the `[S_API]` line `SteamAPI_Init(): Loaded '...steamclient64.dll' OK.` present; zero `[S_API]` lines matching failed, error, not logged on or unable, case-insensitive; IsSteamRunning count 0); plus a `MSGBOX` count of 0 in the game process. Harness-placed state is `issue — harness-flow init evidence only`. No Steam-init line anywhere is `issue — unverified (no game Steam-init log)`.
result: issue — product-state evidence (not harness-flow), but strict pass conditions not met. Session /tmp/gamelib-gate-52t-20261024T070522Z, `ROUND=regate3 MODE=trace WATCH=90 HELPER_BIN=<session snapshot>`; DRY_RUN first (clone `cp -cR` of the source bottle only; no shim or forwarder cp, no Valve `reg add`). Clone-state assertions after the run all hold: shim `cmp` identical to the product and 251904 B (= SHIM64); forwarder `cmp` identical to the product's and to the session snapshot; clone SteamClientDll64 line equal to the product user.reg. Counts: helper HELLO 1 (>= 1 ok; FWD lines SteamClient017 and SteamClient014 native=present); `[S_API]` line `SteamAPI_Init(): Loaded 'C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn\x64\steamclient64.dll' OK.` PRESENT (cxlog line after 198601.474); `[S_API]` lines matching failed/error/not logged on/unable: 0; IsSteamRunning count 1 (NOT 0: cxlog 198601.473 `[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.`, before the Loaded line); MSGBOX count 1 (NOT 0: user32 `FindResourceExW #0005 L"MSGBOX"` at cxlog line 23620, followed by explorer.exe /desktop start, i.e. the game process opened a message box); `steam://run` 0; steamclient64.dll loaded (native) at 198601.474; `L"pid"` RegQueryValueExW count 2; alive at 90 s: NO (alive=no; the game process ended within the window). Files newer than launch-marker under the clone drive_c/users with .log/.txt: none. Verdict: a game Steam-init log exists and the Loaded line is present, so this is not `unverified`, but IsSteamRunning 1, MSGBOX 1 and not alive at 90 s each fail the strict pass; bridge-verified is NOT achieved.

### 25. Re-gate 3 — bottle hygiene
expected: item 11's text with item 22's hygiene delta applied (forwarder byte-identical to the new build, size 187392): after `wineserver -k` of the product bottle, `user.reg` has `SteamClientDll64` under ActiveProcess and no `pid` value; `system.reg` has no `Software\Valve` or `Wow6432Node\Valve` key; no `steam.exe` or `steamclient*.dll` in the Steam root; x64/steamclient64.dll `cmp` identical to the new build and not `cmp`-equal to the genuine DLL; `x64/Grim Dawn.exe` sha256 equals the preflight value.
result: pass — after `wineserver -k` of the product bottle, read-only (2026-10-24): user.reg `[Software\\Valve\\Steam\\ActiveProcess]` holds `SteamClientDll64`="C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grim Dawn\\x64\\steamclient64.dll" and `Universe`="Public", no `pid` value; system.reg Valve key count 0; Steam root holds only `steamapps` (no steam.exe, no steamclient*.dll); x64/steamclient64.dll `cmp` identical to the new build and to the session snapshot (187392 B, sha256 2110a1f9564d3b9db904f469c43e5b9d54ccfa231c49787123e03393648fb065) and not `cmp`-equal to the genuine DLL (GameLibSteam bottle, 26547864 B); x64/Grim Dawn.exe sha256 d3915e2599317b6670cc088ba958afb2b2f4fa8141cfd1d777ee02f9ea1fc4c4 equals the preflight value. The hygiene read was taken after the app was stopped and before the item 24 clone run; the clone run touches the product bottle only by `wineserver -k`. Bottle hygiene is clean even though item 23 and 24 failed.

### 26. Re-gate 3 — ELEX (411300) no-regression after 52-26 (conditional)
expected: run only if 52-26 changed the shim, helper or generated sources (`git diff --name-only` of 52-26's commits touches meta/gen_vtables.ts, native/steam-bridge/generated or native/steam-bridge/helper). Otherwise `skipped — change limited to the forwarder, which is placed only on the drmWrapper=steamstub path`. When run: everything item 20 expected (HELLO shim attached appid=411300, `[bridge-steamstub]` 0, FWD 0, loading-screen baseline, no error dialog), Friends scored per item 20's outside-phase-52 rule, bridge-verified recorded separately.
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

total: 22
passed: 10
issues: 6
pending: 1
skipped: 5
blocked: 0

## Gaps

- truth: "A SteamStub title (Grim Dawn 219990) launched from GameLib goes through the forwarding steamclient64.dll path and reaches its main menu"
  status: failed
  reason: "The quick 261024-j4l withhold guard preempts SteamStub forwarding. 219990 is classified `withheld` because Engine.dll names SteamUser023, SteamNetworking006 and STEAMREMOTESTORAGE_INTERFACE_VERSION016 as unservable, so it takes the direct bottle launch: no forwarder, no helper, guaranteed 2 s exit. The classification predates 52-01's native SteamClient017/014 forwarding, under which those versions may be servable."
  evidence: "gamelib-launch-1.log lines 116/117, 180-182, 230-233 (withheld + direct launch), 122/186/236 (gone after 2s); the three versions are named by x64/Engine.dll (also compat/Engine.dll and root Engine.dll); items 6-8. 52-11 scratch round 1 never exercised the guard (the harness placed the shim itself)."
  fix_direction: "Make the withhold decision SteamStub-aware: when `.bind` is present, route to the bridge-steamstub forwarder path (52-08/52-09) instead of withholding, or re-derive the unservable set under native forwarding."
- truth: "A withheld SteamStub title fails loudly with a user-visible notice"
  status: failed
  reason: "The withheld path carries no drmWrapper, so neither the forwarder placement nor the `steamstub-unforwarded` notice runs; the user sees a silent failure after 2 s."
  evidence: "No `drmWrapper=steamstub`, `forwarder placed` or `steamstub-unforwarded` anywhere in gamelib-launch-1.log; operator: failing silently (flagged as a gap at 52-08/52-09)."
  fix_direction: "Detect `.bind` independently of the shim verdict and carry drmWrapper=steamstub (or emit the unforwarded notice) on the withheld branch."
- truth: "The launch log accurately states which steam_api the game runs"
  status: failed
  reason: "The withheld message says `launching with the game's own steam_api, no helper`, but when the original dll is gone (no .gamelib-orig backup) the stale GameLib shim remains in place, so the claim is false."
  evidence: "gamelib-launch-1.log lines 115/116, 180/179, 229/230; product x64/steam_api64.dll is 223744 bytes (stale shim, SHIM64 242688), item 8."
  fix_direction: "Log the real state (shim present, no original) or refuse to launch and advise Steam file verification."
- truth: "The stale shim in the product bottle is refreshed or removed when the shim is withheld"
  status: failed
  reason: "The withheld path neither restores the original steam_api64.dll nor refreshes the shim, leaving the 223744-byte shim that has no helper behind it."
  evidence: "item 8: x64/steam_api64.dll 223744 bytes after three launches; the warning `leaving the GameLib shim in place` each time."
  fix_direction: "On withhold, restore the original (or fail with guidance to verify files in Steam) rather than leaving a helper-less shim; refresh to current SHIM64 if the shim is kept."

- truth: "A SteamStub title (Grim Dawn 219990) launched through the forwarder reaches its main menu with a clean Steam-init log"
  status: failed
  reason: "Re-gate items 9 and 10: the forwarder is placed and the helper answers HELLO plus SteamClient017/014 natively, yet Grim Dawn shows Application Load Error 3 (item 9) and its Steam init logs `SteamAPI_IsSteamRunning() did not locate a running instance of Steam` after two `pid` reads of the absent ActiveProcess value (item 10). Operator chose option-c on item 13: investigate first, no pid writer yet."
  evidence: "52-UAT items 9, 10, 13; round-regate.cxlog:23303/:23311/:23313; helper log HELLO + two FWD lines and nothing after."
  fix_direction: "Investigate first: what the SteamStub check does with the ActiveProcess `pid` value (existence, OpenProcess, process-name check) and why Load Error 3 follows a clean HELLO/FWD; also the ELEX Friends sign-out (Gap 5). Next step: run /gsd-plan-phase 52 --gaps. Any pid writer needs its own plan and boundary review."

- truth: "Launching ELEX (411300) through the bridge leaves the user's Mac Steam session (Friends) signed in"
  status: failed
  reason: "Item 12: the operator checked Friends signed in before launch and signed out afterwards, with ELEX reaching only its loading screen (baseline). No log line explains it; cause unknown. Candidates present in the log but unproven: GameLib's steam-user logon on Play (17:33:59) and the helper's SteamAPI_Init against the Mac client (17:34:00). Not shown to be caused by CR-01 (no forwarder path, no FWD lines for 411300)."
  evidence: "gamelib-relaunch-2.log:60-67, :71-75, :81; operator verbatim in item 12; /tmp/gamelib-gate-52r-20261024T033525Z/."
  fix_direction: "Include in the item-13 investigation (run /gsd-plan-phase 52 --gaps): repeat with Friends state checked before and after (a) Play with the bridge disabled, (b) the steam-user logon alone, (c) helper alone, on a non-ELEX title, to attribute the sign-out. Do not guess a cause before that."

- truth: "A SteamStub title (Grim Dawn 219990) launched from GameLib after re-gate 2 reaches its main menu with a clean Steam-init log (item 17)"
  status: skipped
  reason: "Gap 5 not closable within the locked boundary: item 16 chose option-other (no code change); the stub reads all 186368 bytes of the forwarder before the MessageBox and what it checks in them was never inspected, and no listed option targets that input. No Grim Dawn launch was made in re-gate 2."
  evidence: "52-UAT items 14, 16, 17; 52-19-DIAGNOSIS.md `## Gap 5: candidate inputs`; cxlog:7170-7181 and 6810-6820."
  fix_direction: "Gap 5 not closable within the locked boundary (item 16). Run /gsd-plan-phase 52 --gaps to establish what the SteamStub check examines in the forwarder bytes."
- truth: "The re-gate 2 cx-log trace of Grim Dawn shows a clean strict Steam-init check and MSGBOX count 0 (item 18)"
  status: skipped
  reason: "Gap 5 not closable within the locked boundary (item 16): no item 17 launch exists to trace."
  evidence: "52-UAT items 16, 18."
  fix_direction: "Gap 5 not closable within the locked boundary (item 16); re-run after /gsd-plan-phase 52 --gaps yields a change."
- truth: "The Grim Dawn bottle hygiene holds after the re-gate 2 launch (item 19)"
  status: skipped
  reason: "Gap 5 not closable within the locked boundary (item 16): no item 17 launch whose hygiene could be read; item 16 recorded no hygiene delta."
  evidence: "52-UAT items 11, 16, 19."
  fix_direction: "Gap 5 not closable within the locked boundary (item 16); re-read hygiene after any future Gap 5 change launches."
