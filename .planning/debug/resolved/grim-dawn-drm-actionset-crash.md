---
status: resolved
trigger: "Grim Dawn crashes with a null read right after ISteamController_SteamController008_GetActionSetHandle in DRM mode"
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/completed/2026-10-28-grim-dawn-drm-crash-after-getactionsethandle.md
---

## Symptoms

- expected: Grim Dawn (219990) launched in steamclient-layer DRM mode passes Steam init and reaches the main menu.
- actual: Steam init passes (census verified, game call `ISteamUser_SteamUser017_GetSteamID`), then the game crashes: c0000005 at `grim dawn.exe+0x1d10a`, read of 0x18 (null deref), thread 244. The last traced calls are `ISteamController_SteamController008_Init` then `ISteamController_SteamController008_GetActionSetHandle`. The trace has no role=helper lines.
- errors: c0000005 access violation, read 0x18 at grim dawn.exe+0x1d10a.
- timeline: First seen in the phase 56 live gate (56-16), session /tmp/gamelib-gate-20261028T081115Z, 2026-10-28.
- reproduction: Launch Grim Dawn 219990 from GameLib in steamclient-layer DRM mode on macOS.

## Evidence constraints

- The original crash files (`/tmp/gamelib-gate-20261028T081115Z/launch-1-crash/`) are GONE: the session dir no longer exists as of 2026-10-29.
- Candidates that may still hold evidence (unverified): `/private/tmp/dumps/ERR.dmp` (minidump, 2026-10-28 16:31 local, so maybe not Grim Dawn), `~/Library/Application Support/CrashReporter/grim dawn.exe_*.plist`, and the launcher at `~/Library/Application Support/notproton/launchers/219990/`.
- The on-disk exe is SteamStub-encrypted, so only minidump memory shows the decrypted code at +0x1d10a.

## Current Focus

- hypothesis: The layer returns a null ISteamController interface, or a null/zero action-set result that the game dereferences (offset 0x18).
- next_action: CHECKPOINT decision: approve temporary lsteamclient return-value trace (Controller008 Init/GetActionSetHandle/GetControllerForGamepadIndex-class, Apps BIsSubscribedApp) then one more live run. Prior (superseded): CHECKPOINT human-action: need fresh live repro with Wine log (WINEDEBUG +steamclient) and a minidump from the Grim Dawn run. Prior: gather initial evidence. Check whether any surviving dump is the Grim Dawn crash. Review the ISteamController008 handling in native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c (and the related thunks). If no dump survives, a fresh repro needs a user checkpoint.

## Evidence

- checked: /private/tmp/dumps/ERR.dmp (Mini DuMP, 1188 modules entry list, timestamp Oct 28 16:31:52 UTC)
  found: embeds only macOS paths ending in Steam.AppBundle/.../steamclient.dylib. No "grim dawn" string in ASCII or UTF-16. Gate session was 08:11 UTC, 8h earlier. A native macOS Steam process dump, NOT Grim Dawn's.
  implication: not usable for the +0x1d10a crash.
- checked: ~/Library/Application Support/CrashReporter/grim dawn.exe_*.plist
  found: 69-byte bplist holding only ForceQuitDate. No crash data.
- checked: launcher 219990/notproton-wine.log (Oct 27 08:13, predates the 2026-10-28 gate)
  found: no c0000005 and no "Don't recognize interface" lines. Different run, not the crash.
- checked: lsteamclient Controller008 path (build/lsteamclient-work/lsteamclient-tree: winISteamClient.c:5038, winISteamController.c:2125/2169, cppISteamController_SteamController008.cpp; steamclient_main.c:494 create_win_interface)
  found: GetISteamController wrapper returns create_win_interface(pchVersion, native_ptr), which returns NULL when the native handle is NULL (no ERR logged for that branch). Init and GetActionSetHandle are pure pass-throughs (Init returns int8, GetActionSetHandle returns uint64; no pointer is returned to the game). The trace (steamclient_call hook, status==0 only, first-seen names) logs call names, not return values, and runs after the wrapper already dereferenced _this->u_iface.
  implication: both traced calls ran on a non-null w_iface, so the layer did NOT hand the game a null controller interface. A null+0x18 read at game+0x1d10a is game code dereferencing its own state after GetActionSetHandle. The layer cannot show whether Init returned false or GetActionSetHandle returned 0/invalid handle, which is the likely trigger.

- checked: user live repro, 2026-10-29
  found: Grim Dawn now reaches a black screen with no error message, not the c0000005 crash. No logs captured yet.
  implication: the symptom may have changed from a crash to a hang, or the crash may be silent. Needs the CrossOver debug log to tell which.
- checked: how the DRM launch gets its env (bottle.ts:1393 stockBridgeBottleSettings, games.ts:4076 base enviromentOptions)
  found: DRM-mode launch settings come from the GLOBAL settings, not per-game settings. The runner is a CrossOver clone, which ignores WINEDEBUG (spikes/030 README; shim_features.c:31). CX_DEBUGMSG + CX_LOG is the working channel.

- checked: fresh repro with CX_DEBUGMSG=+steamclient,+seh,+loaddll,err+all CX_LOG=/Users/graysonmitchell/gd-cxlog.txt (set in global config.json defaultSettings.enviromentOptions), 2026-10-29 07:18
  found: /Users/graysonmitchell/gd-cxlog.txt (2.8 MB) line 16421: `00ec:00f0:trace:seh:dispatch_exception code=c0000005 ... addr=000000014001D10A`. The crash recurs at the same address. The black screen is the crash with no dialog. No /tmp/gamelib-gate-* dir was produced (this was a normal app launch, not a gate run). notproton-wine.log was not updated (still Oct 27).
  implication: the +seh trace around line 16421 should carry the register context. The +steamclient lines before it should show the ISteamController008 interface pointers and calls.
- checked: gd-cxlog.txt lines 13250-13361 and 16360-16440 (+steamclient, +seh), 2026-10-29
  found: Layer is SteamClient023. At 6468.892 the game fetches SteamController008 via GetISteamGenericInterface; create_winISteamController_SteamController008 -> 0x2CED30 (non-null), then _Init on that pointer. Game keeps running ~9s with no steamclient calls (6469.6 -> 6477.6), then GetActionSetHandle(this=0x2CED30) twice (wrapper+unix trace), a warn LdrGetProcedureAddress "lua_getglobal" not found in lua51.dll (also seen once at 16368, so benign probing; lua 5.1 lacks it), then one winISteamApps_STEAMAPPS_INTERFACE_VERSION009_BIsSubscribedApp (non-null iface 0x1420A0), then c0000005 on thread 00f0 at 14001d10a: read of 0x18, rax=0, rbx=0, rdx=0, r13=0; rcx=r14=441fb78, rsi=441fb60, rdi=441f0a0, r12=438b690. Faulting fn is 14001d100-14001d16a, caller fn bb310-bbacd (ret bb44e). No controller/steam call follows GetActionSetHandle except BIsSubscribedApp, so the null is not a layer-returned pointer.
  implication: The crash is the very next Steam call (BIsSubscribedApp) after GetActionSetHandle, so the null likely comes from a value the game derived from a return (GetActionSetHandle uint64 handle, Init bool, or BIsSubscribedApp bool) or from non-Steam game state. Log has no return values; the faulting instruction (rax=0 as [rax+0x18] base) cannot be disassembled because the exe is SteamStub-encrypted on disk. Cannot discriminate further without return values.
- checked: temporary return-value trace build, 2026-10-29
  found: Edited ONLY untracked build/lsteamclient-work/wine-11.15/src/dlls/lsteamclient/{winISteamController.c,winISteamApps.c} (originals saved as *.orig): ERR("GLTRACE ...") after the call in Controller008_Init, Controller008_GetActionSetHandle (name + uint64), Apps009_BIsSubscribedApp (appid + bool). pnpm build:lsteamclient was NOT run (its tree-copy step would wipe the edits); ran `make dlls/lsteamclient/x86_64-windows/lsteamclient.dll` in build/lsteamclient-work/wine-build instead. Result: build/lsteamclient-work/trace-out/lsteamclient.trace.dll, 33917247 B, sha256 71d88040226ac6f914e13723c970cf3d55b3571d5710e6682a279961b3c866cf (3 GLTRACE strings present). Deployed original is byte-identical to wine-build's prior output (sha 22bb1941..., 33904653 B), also kept at build/steamclient-layer/steamclient-layer-cx26.3.0.39832/lsteamclient.dll.
  blocker: deploy not done. The component dir ~/Library/Application Support/gamelib/steam-bridge/drm/component/steamclient-layer-cx26.3.0.39832 is checked by verifyComponentDir (steamclientLayerInstall.ts:350) against pinned size+sha256 in src/common/steamclientLayerCatalogue.ts (lines 118-122) on every launch; a swapped dll fails the check and is re-downloaded/overwritten. Needs a temporary edit of committed code.
- checked: temporary deploy of trace DLL, 2026-10-29 (UNCOMMITTED)
  found: src/common/steamclientLayerCatalogue.ts lsteamclient.dll pin changed to sha256 71d88040226ac6f914e13723c970cf3d55b3571d5710e6682a279961b3c866cf / size 33917247. Component dir lsteamclient.dll replaced by build/lsteamclient-work/trace-out/lsteamclient.trace.dll; deployed sha256 and size verified to match.
  REVERT: (1) `git checkout src/common/steamclientLayerCatalogue.ts`; (2) `cp build/steamclient-layer/steamclient-layer-cx26.3.0.39832/lsteamclient.dll "$HOME/Library/Application Support/gamelib/steam-bridge/drm/component/steamclient-layer-cx26.3.0.39832/lsteamclient.dll"` (must have sha 22bb19413ce1f66c771c2d54260f6811480375db66c74e60c66a02d307b5cb76, 33904653 B); (3) restart GameLib; (4) restore config.json from config.json.bak-20261029 (orchestrator); (5) optional: mv build/lsteamclient-work/wine-11.15/src/dlls/lsteamclient/*.c.orig back over the .c files.

- checked: GLTRACE live run, 2026-10-29 07:29 (sidecar rebuilt 07:28, component lsteamclient.dll sha 71d88040… = trace DLL). Log /Users/graysonmitchell/gd-cxlog.txt
  found:
    - `Controller008_Init -> 1` (line 13337).
    - `BIsSubscribedApp` -> 0 for 2699230, 897670 and 642280, polled repeatedly (lines 13379-13611). These are Grim Dawn's three expansions: Fangs of Asterkarn, Forgotten Gods, Ashes of Malmouth.
    - `GetActionSetHandle("InGameControls") -> 0` and `GetActionSetHandle("MenuControls") -> 0` (lines 16435/16437).
    - `BIsSubscribedApp(2699230) -> 0` (line 16442), then the crash at 14001D10A (line 16443). Same thread (00f4) and same millisecond as the subscription check.
    - The bottle's Grim Dawn dir has no gdx1/gdx2/gdx3 expansion folders. It ships `action_manifest.vdf` and per-controller `*_controller.vdf`.
  implication: two candidate triggers remain.
    (a) Action-set handles of 0. Native Mac Steam does not load this Windows title's action_manifest.vdf, so the game likely gets a null action-set object for handle 0, and the +0x18 read follows.
    (b) The expansion ownership answer. This only matters if the user owns an expansion: then Mac Steam's answer of 0 is wrong. If they don't, 0 is correct, and base-game-only players don't crash on Windows.
- checked: experiment 2 deploy, 2026-10-29 (UNCOMMITTED): Controller008_Init forced to return 0
  found: winISteamController.c (untracked build tree) logs "GLTRACE Controller008_Init native=%d forced=0" then sets params._ret = 0. DLL build/lsteamclient-work/trace-out/lsteamclient.trace2.dll sha256 57da0a4acebba08337a1a923f1c620cd6641d10cc33a57cd190614aab0785be9, size 33917247 (unchanged). Catalogue pin sha updated to it; component lsteamclient.dll replaced, sha verified. Revert steps are the same as the previous experiment entry (git checkout the catalogue; copy the original build/steamclient-layer/.../lsteamclient.dll sha 22bb1941... back; restart; restore config).
- checked: GLTRACE run + Init=false run + two game minidumps (/Users/graysonmitchell/gd-dumps/run2-gltrace-0729.dmp, run3-init-false-0735.dmp), 2026-10-29
  found: (a) GLTRACE values: Controller008_Init=1; GetActionSetHandle("InGameControls")=0 and ("MenuControls")=0; BIsSubscribedApp(2699230/897670/642280)=0 (user owns no expansions). (b) Init forced to 0: NEGATIVE, the game still called GetActionSetHandle x2 (both 0), BIsSubscribedApp(2699230)->0, then the identical crash at 14001D10A 17 ms later. The game does not branch on Init. (c) Both dumps are tiny (370590 B, 8 streams): thread list, module list (exe base 140000000 size 482000), exception, 32 small memory regions = thread stacks (+256 B around other threads' ntdll IPs). NO region covers 0x14001D100-0x14001D16A or 0x1400BB310-0x1400BBACD, and no heap, so the null base register cannot be traced to its load. On-disk Grim Dawn.exe .text at RVA 1d100 is SteamStub-encrypted (garbage bytes, confirmed), so it cannot be disassembled either. (d) From the exception context (identical in both runs, only heap addresses differ): rax=rbx=rdx=r13=0; rcx=r14=rsi+0x18; rsi=rdi+0xac0 (both runs); r15=0xc; r8=7fffa004; r9=150060. So the fault is a read [reg+0x18] where reg is one of {rax,rbx,rdx,r13}, all 0; rcx is a pointer to a member at +0x18 of the object in rsi (rdi+0xac0 = a sub-object of a larger heap object). Stack (rsp=10f630): ret 1400bb44e (fn bb310), then 1402de577, 1402e6a28, 1400ba228 in the exe; Engine.dll return addresses 6ffffc1c2fec (Engine+0x22fec) and 6ffffc2dc808 (Engine+0x13c808) in nearby stack. Fn 1d100-1d16a is only 0x6a bytes: push rdi; sub rsp,20; saves rbx. (e) Earlier in the same run the same three BIsSubscribedApp calls (and a repeat) happen ~10 s earlier with result 0 and no crash, so a 0 result alone does not crash; the crash is in a later phase (after ~10 s of loading, 17 ms after the final single BIsSubscribedApp(2699230) call and GetActionSetHandle x2 and a lua_getglobal GetProcAddress miss).
  implication: Layer-returned values do not explain the null: Init is ignored, and 0 handles / 0 subscription are legitimate (the Windows build must also tolerate no-DLC and 0 handles). The null is game-internal state, a lookup (map/list/asset/file) that returned NULL. Hypothesis class now: a game-internal object lookup fails under Wine/DRM that succeeds on Windows (e.g. a missing/mis-cased file or resource, a registry/path value, or a Steam-supplied path/string such as the install dir or user data dir). Not provable from the available data. Unfalsified-but-weakened: 'action_manifest / controller handle null'.

- checked: +file,+reg run, 2026-10-29 07:40 (/Users/graysonmitchell/gd-cxlog.txt, 65 MB; crash at line 47287, same 14001D10A)
  found: the game process (00f4) has curdir `C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grim Dawn\\x64\\` (line 28995). It then looks up `x64\\database\\database.arz`, `x64\\Resources\\` and `x64\\gdx1..3\\database\\*.arz`, all c000003a/c0000034. The real files are at `Grim Dawn\\database\\database.arz` (and Resources) in the install root. The helper (native/steam-bridge/steamclient-layer/helper/steam.c:180) calls CreateProcessW with lpCurrentDirectory=NULL, so the game inherits the helper's cwd. That is runWineCommand's `startFolder: dirname(exePath)` (src/backend/storeManagers/steam/games.ts:4179), i.e. `...\\Grim Dawn\\x64`. Crate forum: launching x64\\Grim Dawn.exe with x64 as the working dir gives a black screen/crash; it must start from the game root.
  implication: ROOT CAUSE. The bridge launch sets cwd to the exe's directory, but Steam uses the install root (or the launch entry's `workingdir`). The game database fails to load, which leads to the null deref. Not related to ISteamController (Init=false and the handle values are red herrings).
- checked: experiment revert + fix, 2026-10-29 (UNCOMMITTED)
  found: Reverted: catalogue git-checkout; component lsteamclient.dll restored, sha 22bb1941... verified; build-tree *.c.orig restored. Fix: launchTarget.ts parses PICS launch `workingdir`, persists it in bridge.launchTarget (bridgeVerdict zod schema + electronStores type, optional so old records stay valid), new resolveBridgeLaunchWorkingDir(appId) (stored target -> install root, or contained workingdir; unsafe/escaping -> install root) and containWorkingDir(). games.ts fireBridgeWineLaunch (the only game-exe startFolder site, used by DRM and non-DRM bridge launches) uses `resolveBridgeLaunchWorkingDir ?? resolveBridgeGameInstallRoot ?? dirname(exePath)`. Unix cwd -> Wine curdir was already confirmed by the +file log (curdir == startFolder). steam.c untouched. Tests added (launchTarget, bridgeVerdict, games); jest steam suites: 840 pass, 1 pre-existing failure (games.test.ts 'quick 261024-tny' fails identically on stashed HEAD). tsc clean, eslint 0 errors, prettier --check clean on all touched files.

## Eliminated

- hypothesis 'ISteamController handles / Init / DLC ownership cause the null' (red herrings; root cause is the process cwd).
- hypothesis 'Init result drives the crash' (Controller008_Init forced to 0: no change, identical crash).
- hypothesis 'layer returns null ISteamController interface': contradicted statically (traced calls need non-null w_iface). Not fully proven without the live repro.

## Resolution

- root_cause: Bridge launches set the game's working directory to the exe's own folder: `startFolder: dirname(exePath)` in `fireBridgeWineLaunch`, src/backend/storeManagers/steam/games.ts. The DRM helper (steam.c CreateProcessW, lpCurrentDirectory=NULL) inherits that cwd. Grim Dawn's launch exe is `x64/Grim Dawn.exe`, so the game ran from `Grim Dawn\x64\` and failed to find `database\database.arz` and `Resources\`. That left a null that it dereferenced at +0x1d10a. Steam uses the install root, or the launch entry's `workingdir`. The ISteamController calls were coincidental.
- fix: launchTarget.ts parses and persists the PICS launch entry's optional `workingdir`. The new `resolveBridgeLaunchWorkingDir` contains it inside the install root, falling back to the install root. `fireBridgeWineLaunch` uses it as `startFolder` for all bridge launches. bridgeVerdict.ts and electronStores.ts carry the optional field; old stored targets still parse.
- verification: Live run 2026-10-29: Grim Dawn reached the main menu in DRM mode (user-confirmed). The CrossOver +file log shows curdir `...\Grim Dawn\`, `Grim Dawn\database\database.arz` opened (ret 0), and no c0000005. The steam jest suites ran 841 tests: 840 pass, and the 1 failure ("quick 261024-tny") is pre-existing on HEAD. tsc is clean, and prettier --check is clean on the touched paths.
- files_changed: src/backend/storeManagers/steam/bridge/launchTarget.ts, src/backend/storeManagers/steam/bridge/bridgeVerdict.ts, src/backend/storeManagers/steam/electronStores.ts, src/backend/storeManagers/steam/games.ts, plus tests.
- cleanup: The experiment was reverted (catalogue pin, original lsteamclient.dll sha 22bb1941…, build-tree sources). The global config.json CX_DEBUGMSG/CX_LOG were removed by restoring the backup.
