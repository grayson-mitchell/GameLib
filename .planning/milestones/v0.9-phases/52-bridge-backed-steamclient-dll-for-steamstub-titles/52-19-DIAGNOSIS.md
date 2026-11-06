# Phase 52 Plan 19: Diagnosis (Gap 5 relay trace, Gap 6 Friends attribution)

Session dir: `/tmp/gamelib-gate-52d-20261024T053624Z` (cxlog: `round-diag1.cxlog`, 11964 lines; cxlog line numbers below are into that file).
This document recommends no fix. 52-22 decides.

Trace build: helper snapshot sha256 `9df66e3f...b9f9088` (copied from `public/bin/arm64/darwin/steam-bridge-helper` before the run). Shim and forwarder are the ones GameLib placed in the product bottle at 52-17 (shim 251392 B sha256 `41b74555...b8051be`, forwarder 186368 B sha256 `d84cb744...aac849`), `cmp`-identical in the clone. 52-20 (WR-09 off-path gate, regenerated shim `ad0e60406`) and 52-21 (WR-11, `08a669c52`) landed before this run, but the clone holds the 52-17 state, not a rebuild of either; the helper binary is whatever `public/bin` held at 05:36 UTC.

Round diag1: MODE=trace, WATCH=45, `+process,+reg,+loaddll,+seh,+relay` with the RELAY_INCLUDE filter from the plan. 852 relay `Call` lines (GetProcAddress 220, LdrGetProcedureAddress 55, GetModuleFileNameW 14, GetModuleFileNameA 8, CreateFileW 8, NtCreateFile 25, ReadFile 23, NtReadFile 12, RegQueryValueExW 27, OpenProcess 1, NtOpenProcess 0). Helper: HELLO then `FWD CreateInterface ver=SteamClient017` then `ver=SteamClient014`. The game showed the Load Error (first MSGBOX at cxlog:7186), `alive=yes` at 45 s (the MessageBox is up). Clone-state assertion: clone `x64/steam_api64.dll` and `x64/steamclient64.dll` `cmp` equal to the product's; clone user.reg holds SteamClientDll64 once. Fallback round diag2 not needed.

## Gap 5: export tables

Genuine Win64 steamclient64.dll (read-only, GameLibSteam bottle, 26547864 B, mode -rw-r--r--, never copied; `objdump -p`): 41 exports. Forwarder `public/bin/arm64/darwin/steamclient64.dll` (186368 B): 1 export, `CreateInterface`. Native Mac `steamclient.dylib` (`nm -gU`, `_Steam_*` and `_CreateInterface`): 33 names.

| name | genuine Win64 | forwarder | native Mac dylib |
| --- | --- | --- | --- |
| Breakpad_SteamMiniDumpInit | y | n | n |
| Breakpad_SteamSendMiniDump | y | n | n |
| Breakpad_SteamSetAppID | y | n | n |
| Breakpad_SteamSetSteamID | y | n | n |
| Breakpad_SteamWriteMiniDumpSetComment | y | n | n |
| Breakpad_SteamWriteMiniDumpUsingExceptionInfoWithBuildId | y | n | n |
| CreateInterface | y | y | y |
| Steam_BConnected | y | n | y |
| Steam_BGetCallback | y | n | y |
| Steam_BLoggedOn | y | n | y |
| Steam_BReleaseSteamPipe | y | n | y |
| Steam_ConnectToGlobalUser | y | n | y |
| Steam_CreateGlobalUser | y | n | y |
| Steam_CreateLocalUser | y | n | y |
| Steam_CreateSteamPipe | y | n | y |
| Steam_FreeLastCallback | y | n | y |
| Steam_GSBLoggedOn | y | n | y |
| Steam_GSBSecure | y | n | y |
| Steam_GSGetSteam2GetEncryptionKeyToSendToNewClient | y | n | y |
| Steam_GSGetSteamID | y | n | y |
| Steam_GSLogOff | y | n | y |
| Steam_GSLogOn | y | n | y |
| Steam_GSRemoveUserConnect | y | n | y |
| Steam_GSSendSteam2UserConnect | y | n | y |
| Steam_GSSendSteam3UserConnect | y | n | y |
| Steam_GSSendUserDisconnect | y | n | y |
| Steam_GSSendUserStatusResponse | y | n | y |
| Steam_GSSetServerType | y | n | y |
| Steam_GSSetSpawnCount | y | n | y |
| Steam_GSUpdateStatus | y | n | y |
| Steam_GetAPICallResult | y | n | y |
| Steam_GetGSHandle | y | n | y |
| Steam_InitiateGameConnection | y | n | y |
| Steam_IsKnownInterface | y | n | n |
| Steam_LogOff | y | n | y |
| Steam_LogOn | y | n | y |
| Steam_NotifyMissingInterface | y | n | n |
| Steam_ReleaseThreadLocalMemory | y | n | y |
| Steam_ReleaseUser | y | n | y |
| Steam_SetLocalIPBinding | y | n | y |
| Steam_TerminateGameConnection | y | n | y |

Names in spike 038 `exports64.txt` that differ from the genuine table: none (41 names, identical set).

Notes: `Steam_IsKnownInterface` and `Steam_NotifyMissingInterface` are exported by the genuine DLL and absent from the native Mac dylib (and from the forwarder). The six `Breakpad_*` names are in the genuine DLL only.

## Gap 5: trace window

Bounds: the helper logged `FWD CreateInterface ver=SteamClient014` (05:36:36Z, log line 8; second-resolution only) and the matching recv traffic is the `sock_ioctl MSG_WAITALL` pair at cxlog:7166-7167. The first MSGBOX line is cxlog:7186. Process `00e8:00ec` (Grim Dawn.exe). Context before the window is listed where it bears on the answers.

Before the window (same stub code, return addresses `ret=00ca....`):

- cxlog:6810-6820: `GetModuleFileNameW(140000000, ...)` returns the Grim Dawn.exe path, then `CreateFileW` on it (`ret=00ca40e0`) and `ReadFile(..., 0x478848 bytes)` (`ret=00ca413e`): the whole exe is read.
- cxlog:6824-6838: `RegQueryValueExW L"pid"` (retval 2, absent), `SteamClientDll64` read at 6830 (retval 0, value present), second `L"pid"` read at 6836 (retval 2).
- cxlog:6840: `[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.`
- cxlog:7002-7010: forwarder mapped, PROCESS_ATTACH, `Loaded '...\x64\steamclient64.dll' OK.`

Window calls (game process, relay Call/Ret):

| cxlog line | call | arguments / result | caller |
| --- | --- | --- | --- |
| 7130-7131 | GetProcAddress | forwarder base `6ffffd210000`, "CreateInterface" -> `6ffffd211000` | stub (`ret=00ca6681`) |
| 7134-7135 | GetProcAddress | steam_api64 base `6ffffdec0000`, "GameLibBridge_CreateInterface" -> found | forwarder (`ret=6ffffd21104f`) |
| 7136-7139 | GetModuleFileNameA | steam_api64 base -> `...\Grim Dawn\x64\steam_api64.dll` | shim (`ret` in steam_api64) |
| 7140-7151 | CreateFileW + 2x ReadFile | `...\x64\gamelib_bridge.cfg` (opened, read twice: data then EOF) | shim (`ret=6fffffa419e1`) |
| 7154, 7158 | GetProcAddress | ntdll `__wine_dbg_header`, `__wine_dbg_strdup` | Wine debug plumbing |
| 7163-7165 | GetProcAddress | handle `00000000`, "Steam_ReleaseThreadLocalMemory": `LdrGetProcedureAddress ... not found in ...\Grim Dawn.exe`, retval 0 | stub (`ret=00ca66af`) |
| 7168-7169 | GetProcAddress | forwarder base, "CreateInterface" -> `6ffffd211000` | stub (`ret=00ca424d`) |
| 7170-7173 | GetModuleFileNameW | forwarder base `6ffffd210000`, buf size 0x400 -> `...\x64\steamclient64.dll` (0x4d chars) | stub (`ret=00ca409a`) |
| 7174-7177 | CreateFileW | the forwarder path, GENERIC_READ, OPEN_EXISTING -> handle `a8` | stub (`ret=00ca40e0`) |
| 7178-7181 | ReadFile | handle `a8`, 0x2d800 bytes (= 186368, the whole forwarder file), retval 1 | stub (`ret=00ca413e`) |
| 7184-7185 | GetProcAddress | user32 "MessageBoxA" | exe (`ret=14044b784`) |
| 7186 | FindResourceExW | user32 `#0005 "MSGBOX"` (MessageBox dialog template) | -- |

The SeH noise at 7010-7129 is the `DBG_PRINTEXCEPTION_C` unwind for the `[S_API]` debug print and is not listed per call. Winsock `fixme:sock_ioctl MSG_WAITALL` lines at 7160-7162 and 7166-7167 are the helper round trips.

## Gap 5: answers

**Q1: export names resolved.** Observed. The stub resolves `CreateInterface` on the forwarder base (7130, 7168), found both times. It resolves `Steam_ReleaseThreadLocalMemory` once (7163-7165) with module handle `00000000`, which Wine's `LdrGetProcedureAddress` warning reports as searched in `Grim Dawn.exe`: not found. No other `Steam_*` name is resolved by the stub in the window. How the handle came to be 0 is not observed (`GetModuleHandle*` is not in the relay filter). `GameLibBridge_CreateInterface` (7134) is resolved by the forwarder, not the stub.

**Q2: module paths read.** Observed. GetModuleFileNameW on the exe base (6810) and on the forwarder base (7170) from the stub; GetModuleFileNameA on steam_api64 (7136) from the shim. Both stub paths are followed by a CreateFileW on the returned path and a ReadFile of the entire file: exe (6814, 0x478848 bytes) and forwarder (7174-7181, 0x2d800 = 186368 bytes). The forwarder read is the last stub action before the MessageBox lookup.

**Q3: OpenProcess / NtOpenProcess.** Not observed as calls. `NtOpenProcess` has 0 Call lines. The single `OpenProcess` relay match is `GetProcAddress(kernel32, "OpenProcess")` at cxlog:6651, part of the exe resolving a long list of kernel32 imports (6553-6715), not a call to OpenProcess. No pid value is therefore used in the window.

**Q4: process image / module base name.** Not observed. `QueryFullProcessImageNameW`, `K32GetModuleBaseNameW` and `K32GetModuleFileNameExW` have 0 Call lines.

**Q5: registry values read after the two `pid` reads.** None in the window (7166-7186). The sequence is: `pid` (6824, absent), `SteamClientDll64` (6830, present), `pid` (6836, absent), then the IsSteamRunning warning (6840). No `Universe` read is seen in the relay filter.

**Q6: last five calls before the MessageBox.** (1) GetProcAddress forwarder "CreateInterface" (7168); (2) GetModuleFileNameW on the forwarder base (7170); (3) CreateFileW on the forwarder path (7174); (4) ReadFile of the whole forwarder file (7178); (5) GetProcAddress user32 "MessageBoxA" (7184); next line is FindResourceExW "MSGBOX" (7186).

## Gap 5: candidate inputs

| input | evidence lines | evidence strength | native Mac counterpart that could answer it |
| --- | --- | --- | --- |
| content of the file at the forwarder path (the stub reads all 186368 bytes of it immediately before failing; it did the same for the exe at 6814-6820, which did not fail) | cxlog:7170-7181; 6810-6820 | direct that the file is read; indirect on what is checked in it (not inspected, and not disassembled) | none from the export table: a read of file bytes is not an export; the genuine DLL is a different file |
| `Steam_ReleaseThreadLocalMemory` lookup with a 0 module handle | cxlog:7163-7165 | direct that it is looked up and not found; indirect that it matters (the handle was 0, so the forwarder base was not searched) | native dylib exports `Steam_ReleaseThreadLocalMemory` (`nm` list), forwarder does not; genuine DLL does |
| forwarder export surface (1 export vs 41 genuine) | export table; 7130, 7168 (only `CreateInterface` is resolved on the forwarder) | indirect (stub resolves only CreateInterface on the forwarder; no other name is asked of it in the window) | 33 of the 41 genuine names (CreateInterface plus 32 `Steam_*`) have a native counterpart; `Steam_IsKnownInterface`, `Steam_NotifyMissingInterface` and the six `Breakpad_*` do not |
| absent `pid` value | cxlog:6824-6840 | direct that two reads return 2 and IsSteamRunning warns; none that the stub window depends on it (no OpenProcess call, 0 image-name queries) | none known; Mac Steam has no Wine pid |
| module path / directory of the forwarder (`...\x64\steamclient64.dll`, `SteamClientDll64` value) | 6830, 7170-7174 | direct that it reads the path it was loaded from; none that the path is rejected | not applicable (path, not export) |

No recommendation is made here.

## Gap 6: arms

Operator-observed Friends state; times are UTC from `terminal.log` `=== OPERATOR` lines (GameLib/Mac Steam logs use local time, UTC+13). T_bridge = Age of Decadence (appid 230070, not SteamStub, no forwarder placed). Session dir `/tmp/gamelib-gate-52d-20261024T053624Z`; log files `gamelib-f1.log`, `gamelib-f2.log`, `gamelib-f3.log`, `arm-c.helper.log`, `steamlogs-before.txt`.

| arm | what ran | bridge disabled (arm a) | build hashes (arm d) | Friends before | Friends after | GameLib/helper log evidence | Mac Steam log evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0a | nothing (baseline, after the Grim Dawn trace) | n/a | n/a | signed in (05:45Z) | n/a | none | none |
| 0b | idle control, 3 min, no GameLib, no helper | n/a | n/a | signed in (05:45Z) | signed in (05:48Z) | none | none |
| c | helper alone against the real HOME (`arm-c-helper.sh`, ARM C DONE 05:51:07Z) | n/a | n/a | signed in | signed in (~05:51Z), no flip | arm-c.helper.log:2 LISTEN appid=230070 mode=full; :6 INIT SteamAPI ready (single InitFlat call); no HELLO (no shim in this arm, expected) | no logoff/logon in the window (connection_log.txt: Logged On from 15:41 to 18:54 local without a displacement line) |
| b (F1) | GameLib launched, steam-user logon only, no Play (GATE LAUNCH F1 05:52:00Z) | n/a | n/a | signed in | SIGNED OUT, observed ~05:52:35Z (before the 2-minute wait elapsed) | gamelib-f1.log:46 `[Timing] SteamUser.loggedOn` 18:52:03 local (05:52:03Z); :47 `ensureConnected: cold-connect path took 3126ms`; no `bridge helper [` line anywhere in the log (no helper spawned) | no line in the window (18:52-18:53 local) matching the grep set; Mac Steam's own CM session stays up (see below) |
| b repeat (F2) | same as F1 after the step-4 Mac Steam restart restored Friends (signed in 05:55:12Z); GATE LAUNCH F2 05:55:41Z | n/a | n/a | signed in | SIGNED OUT, observed ~05:56:05Z, before any Play | gamelib-f2.log:46 `SteamUser.loggedOn` 18:55:45 local (05:55:45Z); :48 `cold-connect path took 3208ms`; no `bridge helper [` line | none in the window |
| a | Play with the bridge disabled | not runnable: GameLib has no bridge toggle and no non-bridge (native / not-eligible) title is installed | n/a | n/a | n/a | not exercised (no route line for a T_native; no such title) | n/a |
| d (F3) | fresh GameLib (GATE LAUNCH F3 05:56:25Z), logon, then Mac Steam restart with GameLib running, then bridge Play of T_bridge (~90 s, quit) | n/a | helper sha256 `9df66e3f27fb...` equals the trace snapshot and the current `public/bin/arm64/darwin/steam-bridge-helper`; shim placed in GameLibSteamBridge-230070 sha256 `9b2a5f0e3780...` equals the terminal.log snapshot `9b2a5f0e...d842`; no forwarder in that bottle (not a SteamStub title, so the `d84cb744...` snapshot does not apply). The debug gamelib-shell binary is from 16:37 Oct 24 and may predate 52-20/52-21; the hashes above show the helper and shim bytes are the snapshot ones | offline after the logon (loggedOn 05:56:29Z); ONLINE 06:00:24Z after the operator restarted Mac Steam; ONLINE 06:02:33Z after the Play. Mac Steam showed the game as in-game while playing | gamelib-f3.log:46 `SteamUser.loggedOn` 18:56:29 local; :67 LISTEN appid=230070 mode=full (19:01:00); :71 INIT SteamAPI ready; :76 bottleProcessMonitor matched `AoD64.exe` (19:01:02); :77 `HELLO  shim attached appid=230070` (19:01:04); no FWD lines (not SteamStub); :80 bottleProcessMonitor gone after 63s of play; :82 helper exited on SIGTERM. No steam-user disconnect or relogon in the log after the Mac Steam restart | no Friends flip in the window |

Mac Steam log diff (lines added since `steamlogs-before.txt`, keywords only, no account data). `connection_log.txt` lines 652-658 and 704-710: `LogOff()` / `AsyncDisconnect` / `user initiated logoff` at 18:54:09 and 18:59:41 local, which are the two operator Mac Steam restarts (05:54Z and 05:59Z); each is followed by a normal `LogOn()` and `RecvMsgClientLogOnResponse` 'OK' (lines 671-702 and from 716). `steamui_login.txt` lines 176-184 and 191-199: the matching `Initiating LogOn` / `Received logon success response` at 18:54:18 and 18:59:50. `console_log.txt` 949 and 998: `ExecuteSteamURL ... open/friends` at 18:54:24 and 18:59:59 (the restarts' Friends window). `webhelper.txt` 2646-2658 and 2826+: `friendslist_uid0` popup created at 18:54:22 and 18:59:54. No line carrying `logged in elsewhere`, `already logged`, `LoggedInElsewhere` or a remote-initiated logoff appears anywhere. Mac Steam's own CM session was never logged off between 15:41 and 18:54 local, so across the F1 (18:52) and F2 (18:56) flips Steam's connection log shows no event; the signed-out state is a Friends-UI/persona state, not a Steam account logoff.

## Gap 6: attribution

Arm b flipped Friends from signed in to signed out in F1 while the idle control (0b) stayed signed in, and flipped again in F2, the pre-committed repeat. Its window contained one GameLib event, `SteamUser.loggedOn` (3 s and 4 s before the operator saw the flip), and no helper, shim, forwarder or Play. Attribution: the GameLib steam-user logon (`user.ts` logOn path; the logon, not the helper). F3 was a third reproduction: Friends was offline after the logon again, before any Play.

Arm c (helper alone, SteamAPI_Init against Mac Steam) did not flip: not a cause. Arm d (helper, shim and a bridge Play) did not flip Friends once Friends had been restored; it held ONLINE through INIT, HELLO and 63 s of play, so the phase-52 pieces (shim, helper, bridge) showed no effect. Arm a was not runnable, so no route-disabled Play was scored; arms a and d inherit the logon and cannot isolate it, and nothing here says the logon is the only thing that can do this.

Observed, not explained: while the steam-user session is up, Mac Steam shows Friends signed in but its status stays 'Offline' and cannot be changed; restarting Mac Steam restores it, with GameLib running (F3) or not (step 4). No "logged in elsewhere" notification was seen, and Mac Steam's connection log shows no displacement, so the mechanism (e.g. a second logon with the same refresh token taking the persona session, which Valve does not document here) is not established by any arm. No cause beyond "the steam-user logon, which the Phase 51 flow already did before Phase 52" is named. Phase 51 and the Grim Dawn R1 launches contained the same logon.

classification: outside-phase-52
