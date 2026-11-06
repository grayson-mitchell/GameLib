# 56-17 Desk Diagnosis: Gap 7 (Grim Dawn crash) and Gap 9 (second-launch hang)

Written 2026-10-29, read-only. No game was launched, no wine process started, no product code touched.

## Status at a glance

Two quick debug sessions ran on 2026-10-29 BEFORE this desk plan executed, and each reached a live-confirmed root cause:

| Gap | Debug record | Root cause found | Fix commit |
| --- | --- | --- | --- |
| 7 | `.planning/debug/resolved/grim-dawn-drm-actionset-crash.md` | wrong working directory (`x64\`), not the controller interface | `98837f09b` |
| 9 | `.planning/debug/resolved/drm-second-launch-bottle-stage.md` | strict `SteamPath` equality in the staged check forces a needless `reg add`; the fresh session's `winedevice` (winebus.so) aborts and spins | `5ff2dbd8c` |

This document therefore does two jobs. It records the desk evidence the plan asked for (what is still measurable on disk now), and it restates the hypotheses with the status the later live evidence gives them, so that 56-22 runs confirmation and regression experiments rather than blind discrimination. Where a status rests on a debug record rather than something I re-measured, the row says so.

## Gap 7

### Evidence

**E-7.0 Evidence availability.** `/tmp/gamelib-gate-20261028T081115Z/` no longer exists (confirmed: `ls` fails; `find / -name minidump.dmp` finds nothing). `launch-1-crash/minidump.dmp`, `crash.xml` and `log.html` are gone. The lldb pass over the minidump asked for by the plan cannot be re-run. The register, module and stack facts below are carried from the planner's reading of the dump (recorded in the plan's interfaces block) and from 56-15-LIVE-GATE.md, and are marked UNVERIFIED-BY-ME. The debug session confirmed the same loss and that `/private/tmp/dumps/ERR.dmp` is a native macOS Steam dump, not Grim Dawn's.

**E-7.1 Fault (planner's lldb reading, unverified by me).**
- exception c0000005, read of 0x18, faulting tid 0xf4 (the main thread, rsp 0x10f630), rip `0x14001d10a` = `x64\grim dawn.exe` + `0x1d10a` (image base 0x140000000).
- rax = rbx = rdx = r13 = 0; rcx = r14 = 0x5680d8; rsi = 0x5680c0; rdi = 0x567600. A zero base register plus offset 0x18 is a null object pointer read.
- No code bytes at rip in the dump (`.module_image` unreadable), and the on-disk exe is SteamStub-encrypted, so the fault site cannot be disassembled from either source.

**E-7.2 Stack return addresses as module+offset** (image bases from the planner's `image list`; arithmetic redone here):

| Stack word | Module | Offset |
| --- | --- | --- |
| `0x1400bb44e` | `x64\grim dawn.exe` | `+0xbb44e` |
| `0x1402de577` | `x64\grim dawn.exe` | `+0x2de577` |
| `0x1402e6a28` | `x64\grim dawn.exe` | `+0x2e6a28` |
| `0x6ffffc1c2fec` | `Engine.dll` (base `0x6ffffc1a0000`) | `+0x22fec` |
| `0x6ffffc2dc808` | `Engine.dll` | `+0x13c808` |

No `steamclient64`, `lsteamclient` or `steam_api64` address appeared in the first 48 stack words. The faulting call chain is game code and game engine code, not layer code. (A 256-word walk and the per-thread PC list for all 16 threads were not possible: dump gone.)

**E-7.3 Renderer chain at crash time (planner's reading).** Game `Direct3D11.dll` onto system `d3d11.dll` + `wined3d.dll` + `libvkd3d-shader-1.dll` (CrossOver wined3d, not DXVK). `steamclient64.dll`, `lsteamclient.dll`, `tier0_s64.dll`, `vstdlib_s64.dll` loaded from `C:\Program Files (x86)\Steam\`. Input DLLs loaded: `directinput.dll`, `XINPUT1_3.dll`, `DINPUT8.dll`, `hid.dll`. The game log ended after "Renderer Initialized: direct3d11", adapter enumeration and "UPnP services unavailable".

**E-7.4 Trace semantics (read from `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c`).**
- `steamclient_call` (line ~292-294): `NTSTATUS status = WINE_UNIX_CALL( code, args ); ... if (!status) gamelib_trace_call( name );` so only successful calls are traced.
- `gamelib_trace_call` (line 211): returns early on a name not starting `ISteam`, hashes the name (FNV-1a), and `if (gamelib_trace_seen( hash )) return;` so each name is written once. Caps: `GAMELIB_TRACE_MAX_NAMES 64`, `GAMELIB_TRACE_MAX_LINES 256`, `GAMELIB_TRACE_SLOTS 512`.
- Consequence: the trace is a first-occurrence list of successful call NAMES. It carries no return value and no timeline. "Last traced call = `ISteamController_SteamController008_GetActionSetHandle`" does not mean the crash followed that call in time, and a call that failed or never returned is invisible. The 56-16 reading "crash right after GetActionSetHandle" was an inference from list order, not an observation.

**E-7.5 Delta between the 56-16 launch and spike 044's menu-reaching run** (044 README "Grim Dawn" section and `logs/219990-run1/`):

| Variable | 56-16 launch (crashed) | Spike 044 (menu reached) |
| --- | --- | --- |
| Launch exe | `x64/Grim Dawn.exe` (first Windows entry in PICS `config.launch`; `launchTarget.ts` `pickWindowsLaunch` takes the first `oslist=windows` entry) | launch option 1, `compat/grim dawn.exe` (same SteamStub 3.1 x64 flags per `decode_bind.py`) |
| Working directory | `Grim Dawn\x64\` (`startFolder: dirname(exePath)`) | Steam's: install root `Grim Dawn\` (`cwd=` line of `notproton-run.log` is the install root) |
| Renderer | CrossOver wined3d + vkd3d-shader | DXVK (`notproton-wine.log`: "HACK: trying graphics backend dxvk", "DXVK: cxaddon-1.10.3-1-25-g737aacd") |
| Launched by | GameLib, no Mac Steam involved | Mac Steam (knew the app was running; Steam Input / action manifest loaded) |
| Steam.app changes | none (deliberate, 56-CONTEXT) | `DYLD_INSERT_LIBRARIES=notproton.dylib`, joystick blocklist entry |
| Steam API init | succeeded (census verified, `ISteamUser_SteamUser017_GetSteamID`) | NOT verified: 044's own README says the game log has only `SteamInternal_SetMinidumpSteamID ... [API loaded no]`, so the menu was reached without proven Steam init |
| lsteamclient overlay | no `serialized005.patch` (PINS.md) | had `serialized005.patch` |

Two points the plan did not list but the table exposes: (a) the working directory differs, and (b) 044 never proved Steam init, so 044 reaching the menu says nothing about the post-init path that 56-16 did exercise.

**E-7.6 Install-dir artefacts on disk now.** The bottle `GameLibSteamBridge-219990` install dir holds `action_manifest.vdf`, `Grim Dawn.exe` at the install root, and `grim dawn_d3d11.log` / `grim dawn.dxvk-cache` dated 2026-10-29 07:47 (after the gate). That d3d11 log is DXVK ("DXVK: cxaddon-1.10.3-1-25-g737aacd", display mode set to 3440x1440@100 at the end), i.e. a later live launch that ran DXVK and was running a frame loop. It is not the crashed run and I do not attribute its renderer choice to a mechanism.

**E-7.7 Launch option GameLib picks.** `pickWindowsLaunch` returns the first PICS launch entry with `oslist=windows`, falling back to one with no oslist. 56-16 therefore used `x64/Grim Dawn.exe`. After `98837f09b` the PICS entry's optional `workingdir` is also parsed and persisted, and `resolveBridgeLaunchWorkingDir` supplies the install root as `startFolder`.

### Hypotheses

| ID | Hypothesis | Status | Basis |
| --- | --- | --- | --- |
| H7-cwd | The game ran with cwd `Grim Dawn\x64\`, so `database\database.arz` and `Resources\` lookups failed and a null result was dereferenced at +0x1d10a | **supported (live-confirmed)** | Debug record: `+file,+reg` CrossOver log showed curdir `...\Grim Dawn\x64\` and `x64\database\database.arz` failing c000003a/c0000034; after the fix curdir is `...\Grim Dawn\`, `database.arz` opens, no c0000005, user confirmed menu. Not re-measured by me. |
| H7-input | `ISteamController` / Steam Input state differs because Mac Steam did not launch the app, and an untraced failing call (or a zero handle) leaves a null the game dereferences | **excluded** | Debug record: forcing `Controller008_Init` to 0 changed nothing; static read shows traced calls ran on a non-null interface; Controller handles/Init proven red herrings; fix needed no input change. |
| H7-render | wined3d + vkd3d-shader path crashes where DXVK does not | **open, weakened** | Stack shows game and Engine.dll frames, not renderer frames. A DXVK launch exists on disk (E-7.6) but its cwd was already the fixed one, so it confounds nothing and proves nothing about wined3d. The menu was reached at the fix with whatever renderer the global settings chose. Treat as no longer needed for the gate. |
| H7-exe | `x64\grim dawn.exe` differs from `compat\grim dawn.exe` | **excluded for the crash** | Both are the same SteamStub 3.1 x64 build per 044; the fix kept the `x64` exe and removed the crash by changing only the cwd. (Forum note in the debug record: x64 exe from `x64` cwd is the known black-screen trap.) |
| H7-overlay | Missing `serialized005.patch` in the lsteamclient overlay causes it | **excluded** | `grep -c SteamNetworkingSocketsSerialized005` was 0 in every gate sink (56-15 item 12), and the crash site is not in layer code (E-7.2). |
| H7-bind-null | Init succeeded where 044 never proved it, so a post-init game path ran that 044 did not | **excluded as the cause** | The post-init path ran in 56-16 and succeeded once the cwd was right; with the cwd fixed the same post-init path ran to the menu. |

### Experiments

Because the root cause is already fixed, 56-22 uses these as confirmation and regression checks. One variable each.

- **E7-1 (confirm fix).** Variable: none beyond HEAD (includes `98837f09b`). Launch Grim Dawn 219990 from the Library card in DRM mode. Observable: operator reaches the interactive main menu; no `crash.xml`; census row `verified`.
- **E7-2 (cwd is the discriminator, negative control).** Variable: working directory only. Optional, run only if E7-1 passes and the operator accepts a deliberate crash: launch with `startFolder` forced to `<install>\x64\` (a temporary local edit, reverted). Observable: c0000005 at `grim dawn.exe+0x1d10a` returns. If it does NOT return, H7-cwd is incomplete and the earlier crash had a second contributor. Skippable; the debug record already holds the positive before/after pair.
- **E7-3 (wine-log sink proof).** Variable: none. With `CX_DEBUGMSG=+file,err+all` and `CX_LOG=<scratch path>` (the working channel per the debug record, since `WINEDEBUG` is ignored by the clone runner), launch once. Observable: the game process's curdir line reads the install root and `database\database.arz` opens (ret 0). This is the check 56-20's wine log sink must be able to reproduce.
- **E7-4 (renderer, only if E7-1 fails).** Variable: `CX_GRAPHICS_BACKEND=dxvk` (existing `bridgeKnownFixes.ts` mechanism). Observable: menu reached under DXVK where wined3d did not. Not needed while E7-1 passes.

### Fix candidates

- H7-cwd: already applied. Files: `src/backend/storeManagers/steam/bridge/launchTarget.ts` (`workingdir` parse, `resolveBridgeLaunchWorkingDir`, `containWorkingDir`), `src/backend/storeManagers/steam/games.ts` (`fireBridgeWineLaunch` `startFolder`), `bridgeVerdict.ts`, `electronStores.ts`. Nothing further for 56-23/24 unless E7-1 fails.
- H7-render (contingent): `src/backend/storeManagers/steam/bridgeKnownFixes.ts`, `CX_GRAPHICS_BACKEND=dxvk` entry for 219990.
- H7-exe (contingent): `launchTarget.ts` `pickWindowsLaunch` ordering.
- H7-input / H7-overlay: none; both excluded. (An lsteamclient overlay change would force a component rebuild and re-publish, which is why excluding them matters.)

## Gap 9

### Evidence

**E-9.1 Registry idempotency (re-measured today).** `drmRegistryStagedInUserReg` (`src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts`, now lines ~127-161) checks four values against `buildDrmRegistryCommands()` (line 100): ActiveProcess `SteamClientDll64`, ActiveProcess `Universe`, ActiveProcess `SteamPath`, Steam `SteamPath`. Live `user.reg` now:

| Bottle | `[...\Steam]` SteamPath | `[...\Steam\ActiveProcess]` SteamClientDll64 / SteamPath / Universe |
| --- | --- | --- |
| `GameLibSteamBridge-219990` | `C:\\Program Files (x86)\\Steam\\` (trailing backslash) | `C:\\Program Files (x86)\\Steam\\steamclient64.dll` / `C:\\Program Files (x86)\\Steam\\` / `Public` |
| `GameLibSteamBridge-648800` | `C:\\Program Files (x86)\\Steam\\` (trailing backslash) | same three, SteamPath also with trailing backslash |

The planner measured 648800 without a trailing backslash and ActiveProcess SteamPath without one in 219990; today both bottles carry it in both keys, which is the post-launch state the debug session described (Raft had been launched again since). The failing comparison before commit `5ff2dbd8c` was `active.get('SteamPath') === regEscape('C:\\Program Files (x86)\\Steam')` and `steam.get('SteamPath') === ...` against data ending in `\\`: the value that fails is SteamPath, in either key, with data `C:\\Program Files (x86)\\Steam\\`. At HEAD, `sameSteamPath` (line 127) accepts both forms, so these bottles now count as staged.

**E-9.2 Writer of the trailing backslash.** `native/steam-bridge/steamclient-layer/helper/steam.c`: `slash[1] = 0; /* keep the trailing backslash */` at line 152 builds `steam_dir`; `write_registry` writes it at line 88 (`ActiveProcess\SteamPath`) and line 89 (`Steam\SteamPath`). The helper `steam.exe` runs at every DRM launch (`write_registry` called at line 164), so every launch rewrites SteamPath with the trailing backslash after GameLib's `reg add` had written it without. Pre-launch registry commands: GameLib's DRM path loops `env.registryCommands` with `runWineCommand` in `fireBridgeWineLaunch` (`src/backend/storeManagers/steam/games.ts` ~4094-4106, each raced against `DRM_REGISTRY_TIMEOUT_MS`), the same four `reg add` values as `buildDrmRegistryCommands`; `stageDrmBottle` step 6 is skipped when `alreadyStaged`.

**E-9.3 `.update-timestamp`.** Re-measured: both bottles' `.update-timestamp` = `1784047440`; `/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/share/wine/wine.inf` mtime = `1784047440`; the clone's `.../steam-bridge/drm/runners/crossover-26.3.0.39832/CrossOver/share/wine/wine.inf` mtime = `1784047440` (both `GameLib` and legacy lowercase `gamelib` runner roots). Four equal numbers: a prefix-update `wineboot --init` triggered by timestamp mismatch is excluded.

**E-9.4 Paths that end a DRM bottle's wine session** (all end in `killBottleWineServer`, `src/backend/storeManagers/steam/bottle.ts:652`, which runs `<binDir>/wineserver -k` with env `WINEPREFIX=<bottle dir>` and `CX_ROOT=<cxRoot>`; there is no `CX_BOTTLE` in that env):

| Path | File:line | Binary | After a DRM game exits? |
| --- | --- | --- | --- |
| `endPerGameBridgeBottleSession` -> `drmLaunchSetup.runSetup` step 6 | `drmLaunchSetup.ts:332-345` (call at ~340), `bottle.ts:1891-1910` | clone `bin/wineserver` via `drmRunnerBinDir(appId)` once a runner is registered; stock when none is registered | No. Runs only when `getRunner(appId)?.runner.runnerDir !== runner.runnerDir`, i.e. the first DRM launch per app process (`drmBridgeRunners`, `bottle.ts:1551`, in-memory, empty after a restart), and BEFORE `registerRunner`, so the stop uses the previous (stock) runner |
| `stopPerGameBridgeBottle` | `bottle.ts:1843-1881` (kill at 1880), called from `SteamGame.stop` `games.ts:~4946` | clone if registered | Only on the user's Stop action, not on natural exit |
| `removePerGameBridgeBottle` | `bottle.ts:1758-1790` (kill at 1790) | stock (no binDir) | Only on uninstall |
| provisioning/recreate | `bottle.ts:818`, `bottle.ts:2037` | stock | No |
| `bottleProcessMonitor` `onStopped` | `games.ts:4146-4150` | none | Runs `clearLaunchRecord()`, `stopBridgeHelper()`, `relogOnce()` only; it does NOT end the wine session |

So after a DRM game exits by itself nothing ends the bottle's clone session; whatever `winedevice`/`wineserver` it left stays until the next first-launch `endBottleSession`, a Stop, or an uninstall. (The 56-16 observation that `wineserver -k` with `CX_BOTTLE` alone did not stop the session fits the env: the code path uses `WINEPREFIX` + `CX_ROOT`, and the 56-16 manual kill used a different env.)

**E-9.5 Why launch 1 did not hang.** The first DRM launch ran `endBottleSession` at step 6 (E-9.4) and found a not-yet-staged `user.reg`, so its `reg add` ran against a fresh session. The debug record's live repro then found, on a LATER launch, an entirely FRESH clone-runner session (all processes 37 s old, no stock wineserver): `wineserver`, `wineboot.exe --init`, two `winedevice`, the hung `reg add`; the spinning one (101% CPU) hosted `winebus.so`, and `sample` showed `_onqueue_addMouse` -> `malloc_zone_error` -> abort -> SIGABRT, then wine's `ntdll.so` signal handler spinning. `ntdll.so`, `winebus.so`, `winebus.sys`, `winedevice.exe` are byte-identical between stock CrossOver and the clone. That evidence is from the debug record and was not re-measured by me; I could not re-sample (no wine processes are running).

### Hypotheses

| ID | Hypothesis | Status | Basis |
| --- | --- | --- | --- |
| H9-idempotency | The helper's trailing-backslash `SteamPath` defeats the strict staged check, so a no-op becomes a `reg add` on every launch after the first | **supported (live-confirmed)** | E-9.1/9.2; fix `5ff2dbd8c`; user confirmed the hang gone on 219990. Does not alone explain Raft, whose `user.reg` already matched when the debug session read it. |
| H9-winebus-spin | A brand-new session's `winedevice` (winebus.so) aborts in the macOS GameController path and spins, blocking `wineboot --init`, so `reg add` times out | **supported (root mechanism), not fixed** | Debug record `sample` stack; residual risk filed as `.planning/todos/pending/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md`. Why a first launch usually avoids it is unproven. |
| H9-stale-session | The clone session outlives the game and a later `wine reg` attaches to it and blocks | **weakened** | E-9.4 shows nothing ends the session after a natural exit, so a stale session is possible; but the live repro's processes were all freshly started by the failing launch, not leftovers. |
| H9-two-servers | A stock and a clone wineserver both serve the bottle | **excluded for the observed repro** | Live repro: no stock-CrossOver wineserver present. Still possible after an app restart (empty `drmBridgeRunners` makes step 6 use the stock `wineserver -k`, E-9.4). |
| H9-kill-env | `wineserver -k` reaches no server because the env names the bottle differently | **open** | Code uses `WINEPREFIX` + `CX_ROOT` (E-9.4); the 56-16 failure used `CX_BOTTLE` only. Not exercised since. |
| H9-timestamp | A prefix update from a `.update-timestamp` / `wine.inf` mismatch starts `wineboot --init` | **excluded** | E-9.3, four equal numbers. |
| H9-raft | Raft's hang has the same mechanism | **open** | Raft's staged values matched the check, yet it hung at 22:52:09; nothing today explains it. |

### Experiments

- **E9-1 (reproduce, then confirm the fix).** Variable: launch count in one bottle. Launch Raft 648800 in DRM mode, exit it, launch it again, with the bottle already staged. During any hang capture `ps -axww -o pid,ppid,pcpu,command` filtered on the bottle path and both runner roots (`GameLib` and legacy `gamelib`), `sample <winedevice pid> 3`, and the sockets under `/tmp/.wine-$(id -u)/`. Observable: second launch reaches the game with NO `reg add` in `gamelib.log` (no stage `reg add` line) and no `drm-bottle-stage` notice; if it still hangs, the captured processes say whether the cause is H9-raft/H9-stale-session.
- **E9-2 (session end after a clean exit, clone binary, WINEPREFIX env).** Variable: ending the session. After a successful launch exits, run the clone `bin/wineserver -k` under `WINEPREFIX=<bottle>` and `CX_ROOT=<clone cxroot>`; Observable: `ps` shows zero processes whose command contains the bottle path; then launch again and record whether it starts promptly.
- **E9-3 (CX_BOTTLE-only kill).** Variable: env of the kill. Same as E9-2 but with `CX_BOTTLE=<name>` only and no `WINEPREFIX`. Observable: bottle processes remain (reproducing 56-16) or do not. Together with E9-2 this settles H9-kill-env.
- **E9-4 (unstaged bottle, residual winebus risk).** Variable: bottle registry state. On a scratch-copied or new DRM bottle with no `ActiveProcess` values, run the first DRM launch five times with a full session end between each. Observable: count of stage `reg add` timeouts; a nonzero count means the winebus abort-spin needs the F9-d escalation.
- **E9-5 (post-restart stock/clone mismatch).** Variable: app restart between launches. Launch, quit and relaunch the dev app with the game's session still alive, launch again. Observable: `ps` shows one wineserver (clone) or two (stock + clone), which decides H9-two-servers after a restart.

### Fix candidates

- **F9-a (staged check accepts the helper's form): DONE** in `5ff2dbd8c` (`stageDrmBottle.ts` `sameSteamPath`). 56-23 needs only the regression test to stay.
- **F9-b (end the clone session after a DRM game exits).** Files: `src/backend/storeManagers/steam/games.ts` (the `onStopped` handler at ~4146) calling `bottle.endPerGameBridgeBottleSession`, which already selects the registered DRM runner's `wineserver`. Needed only if E9-1/E9-2 show leftovers matter; it also removes the stale-session precondition for every future stage.
- **F9-c (end a stale session before staging on every DRM launch).** Files: `drmLaunchSetup.ts` runSetup step 6, dropping the `runnerDir !==` guard, or checking for a live wineserver and ending it only then. Cost: kills a still-running game in that bottle, so it must be gated on no live game.
- **F9-d (bounded pid-kill escalation).** Files: `bottle.ts` `killBottleWineServer` (or a sibling), plus the `stageDrmBottle.ts` `runRegArgv` timeout path (line 460): on a `reg add` timeout, find the stage session's own `winedevice`, kill it, retry once. This is the residual winebus remedy, in line with the filed todo's "short-timeout first stage, retry after killing the stage session's own winedevice". Rejected there: disabling winebus (`winebus.sys=d`), because the game reuses the stage session and loses controller input.
