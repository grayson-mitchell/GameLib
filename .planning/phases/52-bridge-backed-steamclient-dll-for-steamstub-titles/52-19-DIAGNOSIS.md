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
