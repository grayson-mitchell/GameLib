# 52-30 Diagnosis: Gap 5, round 4, discriminating trace (arm A)

## Pre-registration

Written and committed before any non-DRY round. This section stays byte-equal to its commit through 52-31.

This is diagnostic instrumentation in a throwaway clone (`GameLibGate52GD`), never a stand-in shipped to users. A passing arm B is a lead for 52-32, not an authorization to write a pid in the product.

Metrics, computed by the same harness code (`SCORE=1`) over the game process lines of the cxlog only:

- W: IsSteamRunning-warning count
- M: MessageBox call count
- D: text and caption of the first MessageBox, verbatim, or `none`
- L: alive at the end of WATCH (yes/no) and runtime seconds
- S: `[S_API]` lines matching failed/error/not logged on/unable (case-insensitive), count
- H: helper HELLO count
- R: helper FWD count
- P: ActiveProcess `pid` value read count
- K: `steam://run` count

Arms:

- Arm A, `diag5a`: fresh clone with the product-written state, no pid. Run by 52-30.
- Arm B, `diag5b`: same, plus `PID_ARM=live` (pid REG_DWORD in the clone naming a live clone anchor process). Run by 52-31.

Both arms use `RELAY_INCLUDE="$(cat gate/relay-include-diag5.txt)"` and the same WATCH, DEBUGMSG and helper snapshot.

Anchor choice: `notepad.exe` (CrossOver ships it in `lib/wine/x86_64-windows`). It is a GUI tool that does not exit on its own, so it stays alive for the whole WATCH. It is started inside the clone's wineserver by `CX_BOTTLE=GameLibGate52GD wine notepad.exe`, and its Windows PID is read with `tasklist.exe`. Known confound: its image name is `notepad.exe`, not `Steam.exe`. T4 records whether the stub queries any process image name, which decides whether an O3 result carries that caveat.

Validity checks:

- V1: clone shim and forwarder are cmp-identical to the product's; forwarder is 187392 B.
- V2: clone `SteamClientDll64` equals the product's.
- V3: product bottle P1-P6 (exe sha, shim size/sha, forwarder size/sha, ActiveProcess section, system.reg Valve count, reg file hashes) are equal before and after each round.
- V4: arm A holds no pid; arm B holds exactly the anchor pid.

Outcome classes (operator's locked rule, applied unchanged by 52-31):

- O1: W gone AND Load Error 3 persists -> the file/forwarder check is the blocker, recommend close-out.
- O2: both gone (game reaches further/main menu) -> a product pid writer is a candidate, needs its own boundary review.
- O3: neither changes -> pid is not the input, record and recommend close-out or static RE at operator's choice.
- O4: any other combination -> recorded literally, no fix chosen.

## Relay list

File: `gate/relay-include-diag5.txt` (one line, `;`-separated, never edited after this commit). Groups:

- diag3 list verbatim (file anchors, file geometry, trust/certificate, hash/signature primitives, loaders, MessageBox): keeps the arm A window comparable with 52-25.
- GetProcAddress / LdrGetProcedureAddress / GetModuleHandleA/W / GetModuleFileNameA: T5.
- OpenProcess / NtOpenProcess / GetExitCodeProcess: T3.
- Toolhelp, psapi, K32* image-name and enumeration names, NtQuerySystemInformation: T3/T4.
- OpenMutexW / OpenEventW / OpenFileMappingW: T6.
- RegQueryValueExW (advapi32 and kernelbase), RegGetValueW: T2.

No name was dropped. RelayInclude is a pure name filter and does not report unknown names, so a name Wine does not export would be silently inert. T3/T4 `not observed` therefore means `not called` only for names that Wine exports under that spelling, and the answers say so where it matters.

## Trace window (diag5a)

Session `/tmp/gamelib-gate-52u-20261024T080006Z`, file `round-diag5a.cxlog` (12101 lines; the line numbers below are into that file). Round: `MODE=trace SCORE=1 WATCH=90`, `+process,+reg,+loaddll,+seh,+relay`, the 88-name list above, helper snapshot sha256 `9df66e3f...f9088` (same bytes as 52-25). The game process is `00ec:00f0` (CrossOver's launcher stub is `00e4`, and `00f8` is a later explorer process; neither is scored). DRY_RUN first showed RelayInclude written to `CX_BOTTLE=GameLibGate52GD` only, no DLL cp and no `Software\Valve` write. Result: alive=yes at 90 s, 918 relay Call lines, helper HELLO 1, FWD CreateInterface SteamClient017 and SteamClient014 (native=present), steam://run 0. Fallback round not needed.

Window: first `L"pid"` read (cxlog:6871) to the first MessageBox (cxlog:7235). Every game-process relay Call/Ret line, plus the `+loaddll` line and the `[S_API]` lines, in that window (args trimmed):

- 6871 Call advapi32.RegQueryValueExW(key 9c, L"pid") ret=00ca6e88 ; 6873 NtQueryValueKey L"pid" ; 6874 Ret retval=00000002
- 6877 Call RegQueryValueExW(L"SteamClientDll64") ret=00ca599b ; 6880 Ret retval=00000000
- 6883 Call RegQueryValueExW(L"pid") ret=00ca6499 ; 6885 NtQueryValueKey L"pid" ; 6886 Ret retval=00000002
- 6887 `[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.`
- 7013 warn find_builtin_dll cannot find builtin library for steamclient64.dll ; 7048 loaddll: Loaded x64\steamclient64.dll (native) ; 7052-7057 TLS callbacks and PE DLL attach for it (Call/Ret retval=1)
- 7059 `[S_API] SteamAPI_Init(): Loaded '...x64\steamclient64.dll' OK.`
- 7179/7180 GetProcAddress(forwarder, "CreateInterface") ; 7181-7186 GetModuleHandleW("steam_api64.dll"), GetProcAddress("GameLibBridge_CreateInterface") (forwarder to shim) ; 7187-7190 GetModuleFileNameA(shim) ; 7191-7196 CreateFileW + two ReadFile of x64\gamelib_bridge.cfg ; 7197-7208 ntdll handle and `__wine_dbg_*` lookups (Wine debug plumbing of the shim) 
- 7212/7214 GetProcAddress(0, "Steam_ReleaseThreadLocalMemory") retval=0 (not found in Grim Dawn.exe)
- 7217/7218 GetProcAddress(forwarder, "CreateInterface") ; 7219-7222 GetModuleFileNameW(forwarder) ; 7223/7224 CreateFileW(x64\steamclient64.dll) ; 7225/7226 GetFileSize retval=0x2dc00 ; 7227/7228 ReadFile(0x2dc00) retval=1
- 7229/7232 LoadLibraryA("user32.dll") ; 7233/7234 GetProcAddress("MessageBoxA") ; 7235 Call user32.MessageBoxA

## Answers (diag5a)

**T1: the dialog text and caption.** Observed at cxlog:7235: `user32.MessageBoxA(0, "Application load error 3:0000065432", "Steam Error", 0x10)`, ret=14044b8d4. Same as 52-25 R1 (cxlog:6654 of diag3): same text, same caption, same flags. Nothing changed in the dialog between the 186368 B forwarder and the 187392 B forwarder.

**T2: the two pid reads.** Observed at cxlog:6871 and 6883, both `RegQueryValueExW(L"pid")` on ActiveProcess, both returning retval=00000002 (ERROR_FILE_NOT_FOUND, value absent; consistent with no pid in the clone). Between them 6877 reads `SteamClientDll64` (retval 0, present). No call between them, or after the second until the loaded-OK line, acts on a pid value: no OpenProcess, GetExitCodeProcess, process-image-name query or enumeration appears in 6871-7235. The warning at 6887 follows the second absent read directly.

**T3: OpenProcess / process enumeration in the window.** Not observed. No `OpenProcess`, `NtOpenProcess`, `CreateToolhelp32Snapshot`, `Process32*` or `EnumProcesses` Call in the game process anywhere. The per-name summary counts of 1 for OpenProcess and GetExitCodeProcess are GetProcAddress lookups of those names at cxlog:6692 and 6694: the stub resolves its whole import set at once (cxlog:6640-6832, ret=14044a3a4, including OpenProcess, GetExitCodeProcess, RegQueryValueExW, ShellExecuteA/W), before the window. Resolving is not calling: a call through the resolved pointer would hit the traced export thunk and log a Call line, and none did. The two ntdll.NtQuerySystemInformation calls in the game process (cxlog:6362 class 0 and 6364 class 1, ret=6fffffc3f27f/6fffffc3f29b, before the window) are basic and processor information, not process enumeration (that is class 5).

**T4: image-name queries and enumeration.** Not observed. Zero Call lines in any process for `QueryFullProcessImageNameW`, `K32GetModuleFileNameExW`, `K32GetProcessImageFileNameW`, `K32GetModuleBaseNameW`, `CreateToolhelp32Snapshot`, `Process32FirstW/NextW` and `K32EnumProcesses` (kernel32 and kernelbase spellings; summary counts all 0). Names that Wine may not export under that spelling would be inert in the filter; for the K32* names both spellings were listed, and the psapi forwards were listed too. Consequence for 52-31: an arm B anchor named notepad.exe is not confounded by an image-name check on any path arm A exercised, because arm A shows no such query even when the pid is absent. An arm B run may still exercise code that arm A skips (it only runs once a pid exists), so an O3 result keeps a caveat that the image-name check is untested.

**T5: GetProcAddress / module-handle against the forwarder.** Observed: `GetProcAddress(forwarder, "CreateInterface")` at 7179 and again at 7217, ret=00ca6681 and 00ca424d (stub addresses). The forwarder itself resolves `GetModuleHandleW("steam_api64.dll")` then `GameLibBridge_CreateInterface` (7181-7186, ret inside the forwarder). Only `CreateInterface` is requested by the stub, and a lookup of `Steam_ReleaseThreadLocalMemory` is made against the exe handle 0 (7212, returns 0), not the forwarder, as in diag3.

**T6: Steam IPC object opens.** Not observed. No OpenMutex, OpenEvent or OpenFileMapping Call in the game process (all three names, kernel32 and kernelbase spellings, 0 in the window and in the whole cxlog).

**T7: forwarder file access pattern.** Observed: `GetModuleFileNameW` (7219), `CreateFileW` (7223), one `GetFileSize` returning 0x2dc00 = 187392 (7225-7226), one whole-file `ReadFile` of 0x2dc00 (7227-7228). Same as 52-25 R4 (single whole-file read, no SetFilePointer, mapping or targeted read) with the new file size and the same return addresses 00ca409a/00ca40e0/00ca40fc/00ca413e.

**T8: the last five calls before the MessageBox.** (1) `ReadFile` of the forwarder (7227/7228), (2) `LoadLibraryA("user32.dll")` (7229), (3) its Ret (7232), (4) `GetProcAddress("MessageBoxA")` (7233), (5) its Ret (7234), then the MessageBoxA at 7235. Same shape as 52-25 R6 and diag1 (ReadFile of the forwarder, then the user32 lookup, then the dialog). The decision still falls between the ReadFile return and the LoadLibraryA call and leaves no relay line.

Validity (arm A): V1 clone x64/steam_api64.dll and x64/steamclient64.dll cmp-identical to the product's, forwarder 187392 B. V2 clone SteamClientDll64 count 1, equal to the product's. V3 product preflight and post-run P1-P6 equal after `wineserver -k` (exe d3915e25...a1fc4c4; shim 251904 B 9b2a5f0e...59d842; forwarder 187392 B 2110a1f9...8fb065; ActiveProcess holds SteamClientDll64 and Universe=Public; Valve lines in system.reg 0; reg file hashes equal). V4 clone ActiveProcess holds no pid value.

## Arm A baseline (scored)

Score block from `diag5a` (game process 00ec):

| metric | value |
| --- | --- |
| W | 1 |
| M | 1 |
| D | `MessageBoxA(0, "Application load error 3:0000065432", "Steam Error", 0x10)` |
| L | alive=yes, runtime=91s |
| S | 0 |
| H | 1 |
| R | 2 |
| P | 2 |
| K | 0 |

## Arm B anchor

Session `/tmp/gamelib-gate-52v-20261024T080546Z`. PREREG commit `08064e3f1`: the `## Pre-registration` section extracted with the same awk range from `git show 08064e3f1:<path>` and from the working copy is byte-equal (empty diff, 41 lines, recorded in that session's terminal.log before the run). Helper snapshot reused, hash-equal to 52-30's (`9df66e3f...f9088`). Product preflight P1-P6 equal to arm A's, no pid.

Anchor: `notepad.exe`, as pre-registered (CrossOver ships it; it started inside the clone wineserver of `GameLibGate52GD` via `CX_BOTTLE=GameLibGate52GD wine notepad.exe`). Windows PID 248 (0xf8) read with `tasklist.exe /FI 'IMAGENAME eq notepad.exe'`; the harness then ran one `reg add HKCU\Software\Valve\Steam\ActiveProcess /v pid /t REG_DWORD /d 248` in the clone. V4b: after the run the clone user.reg holds `"pid"=dword:000000f8`, the product user.reg holds no pid, and the stub's own `OpenProcess` call names `000000f8`. Known confound (from the pre-registration): the anchor's image name is `notepad.exe`, not `Steam.exe`.

## Trace window (diag5b)

Session `/tmp/gamelib-gate-52v-20261024T080546Z`, file `round-diag5b.cxlog` (8215 lines; 690 relay Call lines, so relay was observable). Round: `MODE=trace SCORE=1 PID_ARM=live WATCH=90`, same debugmsg, relay list and helper snapshot as arm A. Game process `0178:017c`. Window: first `L"pid"` read (cxlog:6871) to the first MessageBox (cxlog:7135; the `MSGBOX` resource lookup is 7136). Game-process relay lines in it (args trimmed):

- 6871 Call RegQueryValueExW(key 9c, L"pid") ; 6873 NtQueryValueKey ; 6874 Ret retval=00000000 (value present)
- 6875 Call KERNEL32.OpenProcess(0x400, 0, 0xf8) ; 6876 NtOpenProcess ; Ret retval=0x9c (a handle: the anchor opened)
- 6879 Call GetExitCodeProcess(0x9c) ; 6880 NtQueryInformationProcess ; Ret retval=1
- 6881-6895 RegQueryValueExW(L"SteamClientDll") retval 2, then L"SteamClientDll64" retval 0
- 6896 Call RegQueryValueExW(L"pid") retval 0 ; 6900 OpenProcess(0x400, 0, 0xf8) ; 6904 GetExitCodeProcess(0x9c) retval=1 (same sequence a second time)
- 6948 loaddll: Loaded x64\steamclient64.dll (native)
- 6959 `[S_API] SteamAPI_Init(): Loaded '...x64\steamclient64.dll' OK.` (no IsSteamRunning warning)
- GetProcAddress(forwarder, "CreateInterface") ; GetModuleHandleW("steam_api64.dll") ; GetProcAddress("GameLibBridge_CreateInterface") ; GetModuleFileNameA(shim) ; CreateFileW and two ReadFile of x64\gamelib_bridge.cfg ; ntdll `__wine_dbg_*` lookups
- GetProcAddress(0, "Steam_ReleaseThreadLocalMemory") retval=0
- GetProcAddress(forwarder, "CreateInterface") ; GetModuleFileNameW(forwarder) ; CreateFileW(x64\steamclient64.dll) ; GetFileSize retval=0x2dc00 ; ReadFile(0x2dc00) retval=1
- LoadLibraryA("user32.dll") ; GetProcAddress("MessageBoxA") ; 7135 Call user32.MessageBoxA

## Answers (diag5b)

**T1: dialog text and caption.** Observed at cxlog:7135: `user32.MessageBoxA(0, "Application load error 3:0000065432", "Steam Error", 0x10)`, ret=14044b8d4. Same as arm A (cxlog:7235) and 52-25 R1.

**T2: the pid reads.** Observed at cxlog:6871 and 6896, both retval=00000000 (value present). Changed from arm A (retval 2). The stub acts on the value: each read is followed directly by `OpenProcess(0x400, 0, 0xf8)` and `GetExitCodeProcess`.

**T3: process open/enumeration.** Changed. `OpenProcess`/`NtOpenProcess` is called twice (6875/6876 and 6900/6901) with the anchor PID 0xf8, access 0x400 (PROCESS_QUERY_INFORMATION), returning a handle; `GetExitCodeProcess` twice (6879, 6904), each retval=1. No `CreateToolhelp32Snapshot`, `Process32*` or `EnumProcesses` Call. The exit-code value itself is not in the relay line; the stub proceeds as if the process were alive, since the next lines read `SteamClientDll64` and load the DLL.

**T4: image-name or module query on another process.** Not observed. Zero Call lines for `QueryFullProcessImageNameW`, `K32GetModuleFileNameExW`, `K32GetProcessImageFileNameW`, `K32GetModuleBaseNameW`, `psapi.*` and the toolhelp names (summary counts all 0), even though a pid now resolves to a live process. Same as arm A. The image-name branch was not exercised with a pid present; the access mask 0x400 would not permit `GetModuleFileNameEx` (it needs PROCESS_VM_READ), and `QueryFullProcessImageNameW` was not called either. Name-spelling caveat as in the relay-list section.

**T5: GetProcAddress / handle lookups against the forwarder.** Same as arm A: `CreateInterface` looked up twice, forwarder resolves `GameLibBridge_CreateInterface`, `Steam_ReleaseThreadLocalMemory` looked up against the exe handle and not found.

**T6: Steam IPC object opens.** Not observed, same as arm A (OpenMutex/OpenEvent/OpenFileMapping all 0).

**T7: forwarder file access.** Same as arm A: `GetModuleFileNameW`, `CreateFileW`, one `GetFileSize` = 0x2dc00 (187392), one whole-file `ReadFile` of 0x2dc00.

**T8: last five calls before the MessageBox.** Same as arm A: ReadFile of the forwarder, LoadLibraryA("user32.dll"), its Ret, GetProcAddress("MessageBoxA"), its Ret, then MessageBoxA (7135).

Validity (arm B): V1 clone steam_api64.dll and steamclient64.dll cmp-identical to the product's, forwarder 187392 B. V2 clone SteamClientDll64 count 1, equal to the product's. V3 product post-run P1-P6 equal to preflight after `wineserver -k` (exe d3915e25...a1fc4c4; shim 251904 B 9b2a5f0e...59d842; forwarder 187392 B 2110a1f9...8fb065; Valve lines in system.reg 0; reg file hashes equal), product ActiveProcess still holds no pid. V4b clone `pid` = 0xf8 = anchor PID 248, the only pid-bearing difference from arm A. No game-process helper or gamelib-shell remained.

## Discriminating result

| metric | arm A (diag5a, no pid) | arm B (diag5b, live pid) | changed? |
| --- | --- | --- | --- |
| W | 1 | 0 | yes |
| M | 1 | 1 | no |
| D | `MessageBoxA(0, "Application load error 3:0000065432", "Steam Error", 0x10)` | identical | no |
| L | alive=yes, 91s | alive=yes, 90s | no |
| S | 0 | 0 | no |
| H | 1 | 1 | no |
| R | 2 | 2 | no |
| P | 2 | 2 | no (value present in B, absent in A) |
| K | 0 | 0 | no |

The one metric that moved is W: the IsSteamRunning warning is gone once a pid names a live process. The pid is read in both arms; in arm B the stub opens that process and queries its exit code (cxlog:6875-6880, 6900-6905) and then loads steamclient64.dll without the warning (6959). Everything after that, including the forwarder whole-file read at 0x2dc00 and the MessageBox text, caption and flags, is unchanged from arm A (cxlog:7135 against arm A cxlog:7235).

Matched class, quoted from `## Pre-registration`: "O1: W gone AND Load Error 3 persists -> the file/forwarder check is the blocker, recommend close-out." W is 1 in arm A and 0 in arm B, and the dialog `Application load error 3:0000065432` is present in both (M 1/1, D identical). That is the O1 condition.

Classification: **O1**.

Recommendation (the one O1 carries): the file/forwarder check is the blocker; recommend close-out (SteamStub is not closable inside the boundary). The 52-32 options are an honest SteamStub notice plus a ROADMAP done-when amendment draft, or static RE as a separate operator choice. A pid writer in the product is not indicated: it would remove only the warning, not the load error. This plan implements nothing.

Recorded limitations, which do not change the class: the anchor is a non-Steam image (`notepad.exe`) and the open used access 0x400; neither arm showed an image-name query, so a stub branch that would reject a non-Steam image cannot be ruled out by this experiment but did not fire.

## Boundary note

Arm B's pid was a clone-only diagnostic. No product pid, HKLM write, DRM decode or bottled-Steam reroute was done or is being recommended by this plan.
