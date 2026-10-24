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
