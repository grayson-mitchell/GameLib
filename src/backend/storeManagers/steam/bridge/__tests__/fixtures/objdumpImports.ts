/**
 * Fixture `objdump --private-headers` stdout shapes.
 *
 * Two generations of fixture live here (Phase 51 Plan 02, D-51-15):
 *
 * 1. The original Phase 24 reconstructions (`AVERNUM_4_OBJDUMP_OUTPUT`,
 *    `HOARD_SPIKE_RECONSTRUCTED_OBJDUMP_OUTPUT`, `NO_STEAM_API_OBJDUMP_OUTPUT`),
 *    modeled on the two acceptance-set games' import surfaces
 *    (24-PATTERNS.md / 24-RESEARCH.md, cross-referenced against
 *    `.claude/skills/spike-findings-gamelib/sources/007-real-game-avernum/`
 *    and `.../008-gating-game-hoard/`'s own README/steam_api.def evidence).
 *    The spikes did not archive raw objdump text, so these reconstruct
 *    objdump's PE import-table section shape (DLL Name heading +
 *    Hint/Ord/Member-Name rows) around those confirmed symbol sets. The
 *    Hoard reconstruction is KNOWN TO UNDERSTATE the real import set -- it
 *    lists only 7 `SteamAPI_*`-prefixed lifecycle symbols, never the 8 bare
 *    accessors real Hoard also imports (D-UAT-24-09; see
 *    `HOARD_REUBEN_REAL_OBJDUMP_OUTPUT` below for the real 15).
 *
 * 2. Real captures (`HOARD_REUBEN_REAL_OBJDUMP_OUTPUT`, `XCOM_EU_OBJDUMP_OUTPUT`,
 *    `ELEX_X64_OBJDUMP_OUTPUT`, `AVERNUM_6_OBJDUMP_OUTPUT`) taken this session by
 *    running `/usr/bin/objdump --private-headers <exe>` (argv-form, by hand,
 *    read-only) against the operator's real owned installs under
 *    `~/Library/Application Support/CrossOver/Bottles/` (`GameLibSteamBridge`
 *    for Hoard, `GameLibSteam` for XCOM/ELEX/Avernum 6) -- `[VERIFIED: objdump
 *    --private-headers, read directly this session against real binaries on
 *    this machine]`. Only the file-format line, the "The Import Tables:"
 *    header, the `steam_api(64)?.dll` block, and one neighbouring DLL block
 *    are kept; the absolute bottle path before the exe filename is stripped
 *    (no home directory, no bottle names, no user names). This machine's objdump
 *    is Apple LLVM objdump, which reports `file format coff-i386` /
 *    `coff-x86-64` (not GNU's `pei-i386`) and a `Hint/Ord  Name` two-column
 *    row layout with an interstitial `lookup ... time ...` line before each
 *    DLL block, instead of GNU's `vma:  Hint/Ord Member-Name Bound-To`
 *    four-column layout -- `importParse.ts` accepts both shapes.
 *
 * `XCOM_DLL_VERSION_STRINGS` and `ELEX_EXE_VERSION_STRINGS` (Task 2) are the
 * `strings -a <binary> | grep -E '...'`-derived interface-version string sets
 * read directly off the same real binaries this session -- XCOM's original
 * `steam_api.dll` (bare-accessor family, runtime lookup NOT used) and ELEX's
 * `ELEX.exe` (ELEX imports `SteamInternal_CreateInterface`, i.e. runtime
 * lookup -- D-51-07 -- so its per-interface versions live in the exe, not a
 * fixed accessor-to-version mapping baked into the dll's bare exports).
 *
 * `HOARD_DLL_VERSION_STRINGS` (quick task 261021-pgx) is the same
 * `strings -a <binary> | grep -E '...'` extraction read directly off Hoard's
 * (63000) real original `steam_api.dll` (104872 bytes -- NOT the
 * 805888-byte Phase 24 shim), obtained and measured in a later session than
 * `HOARD_REUBEN_REAL_OBJDUMP_OUTPUT` above -- see its own comment for full
 * provenance.
 */

export const AVERNUM_4_OBJDUMP_OUTPUT = `
Avernum 4.exe:     file format pei-i386

Characteristics 0x10f
	relocations stripped
	executable
	line numbers stripped
	symbols stripped
	32 bit words
	debugging information removed

Time/Date		Thu Jan  1 00:00:00 1970
Magic			010b	(PE32)

The Import Tables (interpreted .idata section contents)

 vma:            Hint    Time      Forward  DLL       First
                 Table   Stamp     Chain    Name      Thunk
 004a2000        004a20b8 00000000 00000000 004a2144   004a1000

	DLL Name: KERNEL32.dll
	vma:  Hint/Ord Member-Name Bound-To
	004a1000	 384  GetProcAddress
	004a1004	  86  ExitProcess

	DLL Name: steam_api.dll
	vma:  Hint/Ord Member-Name Bound-To
	004a1100	   0  SteamAPI_Init
	004a1104	   1  SteamAPI_Shutdown

	DLL Name: USER32.dll
	vma:  Hint/Ord Member-Name Bound-To
	004a1200	  42  MessageBoxA
`

// KNOWN TO UNDERSTATE the real import set -- see file header. Real Hoard also
// imports 8 bare accessors (SteamUser, SteamUtils, SteamFriends, SteamApps,
// SteamMatchmaking, SteamNetworking, SteamRemoteStorage, SteamUserStats),
// none of which appear below. Use `HOARD_REUBEN_REAL_OBJDUMP_OUTPUT` for any
// assertion about bare-accessor coverage.
export const HOARD_SPIKE_RECONSTRUCTED_OBJDUMP_OUTPUT = `
Reuben.exe:     file format pei-i386

Characteristics 0x10f
	relocations stripped
	executable
	32 bit words

The Import Tables (interpreted .idata section contents)

 vma:            Hint    Time      Forward  DLL       First
                 Table   Stamp     Chain    Name      Thunk
 00512000        00512094 00000000 00000000 00512120   00511000

	DLL Name: KERNEL32.dll
	vma:  Hint/Ord Member-Name Bound-To
	00511000	 200  VirtualAlloc

	DLL Name: steam_api.dll
	vma:  Hint/Ord Member-Name Bound-To
	00511200	   0  SteamAPI_Init
	00511204	   1  SteamAPI_RestartAppIfNecessary
	00511208	   2  SteamAPI_RunCallbacks
	0051120c	   3  SteamAPI_RegisterCallback
	00511210	   4  SteamAPI_UnregisterCallback
	00511214	   5  SteamAPI_RegisterCallResult
	00511218	   6  SteamAPI_UnregisterCallResult

	DLL Name: WINMM.dll
	vma:  Hint/Ord Member-Name Bound-To
	00511300	  12  timeGetTime
`

export const NO_STEAM_API_OBJDUMP_OUTPUT = `
Foo.exe:     file format pei-i386

The Import Tables (interpreted .idata section contents)

 vma:            Hint    Time      Forward  DLL       First
                 Table   Stamp     Chain    Name      Thunk
 00401000        00401050 00000000 00000000 004010a0   00401800

	DLL Name: KERNEL32.dll
	vma:  Hint/Ord Member-Name Bound-To
	00401800	 100  GetModuleHandleA
`

// A GNU-style row with no Hint/Ord number at all -- a pure data export
// (`g_pSteamClientGameServer`-shaped). A drop-in shim must export EVERY
// member of the steam_api block, data exports included, so the row parser
// must capture a name-only row the same as a numbered one; the neighbouring
// KERNEL32.dll block's own row must never leak into the steam_api result.
export const DATA_EXPORT_ROW_OBJDUMP_OUTPUT = `
Test.exe:     file format pei-i386

The Import Tables (interpreted .idata section contents)

	DLL Name: steam_api.dll
	vma:  Hint/Ord Member-Name Bound-To
	00511200	   0  SteamAPI_Init
	00511300	      g_pSteamClientGameServer

	DLL Name: KERNEL32.dll
	vma:  Hint/Ord Member-Name Bound-To
	00401800	 100  GetModuleHandleA
`

// Synthetic: a single binary reporting BOTH a `steam_api.dll` AND a
// `steam_api64.dll` import heading. Never seen on a real PE (a binary links
// one or the other), but the parser must fail closed rather than guess which
// arch is real -- scanSteamApiImports surfaces this as a typed error.
export const CONFLICTING_DLL_HEADINGS_OBJDUMP_OUTPUT = `
Test.exe:     file format pei-i386

The Import Tables (interpreted .idata section contents)

	DLL Name: steam_api.dll
	vma:  Hint/Ord Member-Name Bound-To
	00511200	   0  SteamAPI_Init

	DLL Name: steam_api64.dll
	vma:  Hint/Ord Member-Name Bound-To
	00611200	   0  SteamAPI_Init
`

// Real capture: Hoard's `win32/Reuben.exe` (GameLibSteamBridge bottle, appId
// 63000). 15 steam_api.dll imports: 7 `SteamAPI_*` lifecycle symbols + the 8
// bare accessors (D-UAT-24-09). Apple LLVM objdump shape (coff-i386,
// Hint/Ord two-column rows, interstitial `lookup ... time ...` line).
export const HOARD_REUBEN_REAL_OBJDUMP_OUTPUT = `
Reuben.exe:	file format coff-i386

The Import Tables:

    DLL Name: steam_api.dll
    Hint/Ord  Name
           5  SteamAPI_Init
          10  SteamAPI_RestartAppIfNecessary
          52  SteamUtils
          50  SteamUser
          27  SteamFriends
          11  SteamAPI_RunCallbacks
           9  SteamAPI_RegisterCallback
          17  SteamAPI_UnregisterCallback
          44  SteamMatchmaking
           8  SteamAPI_RegisterCallResult
          16  SteamAPI_UnregisterCallResult
          51  SteamUserStats
          46  SteamNetworking
          20  SteamApps
          47  SteamRemoteStorage

  lookup 00168ddc time 00000000 fwd 00000000 name 001693fc addr 0012d1ac

    DLL Name: OPENGL32.dll
    Hint/Ord  Name
          43  glColor4f
          18  glClearColor
          81  glEnd
`

// Real capture: XCOM: Enemy Unknown's `Binaries/Win32/XComGame.exe`
// (GameLibSteam bottle, appId 200510). 26 steam_api.dll imports: 8
// `SteamAPI_*` lifecycle + 9 client bare accessors (the three new-interface
// targets among them) + 9 out-of-scope `SteamGameServer*` bare names that
// still need stub export for the exe to load at all (Windows PE import
// resolution is all-or-nothing per DLL).
export const XCOM_EU_OBJDUMP_OUTPUT = `
XComGame.exe:	file format coff-i386

The Import Tables:

    DLL Name: steam_api.dll
    Hint/Ord  Name
          28  SteamGameServer
          44  SteamMatchmaking
          46  SteamNetworking
          20  SteamApps
          45  SteamMatchmakingServers
          42  SteamGameServer_Shutdown
          47  SteamRemoteStorage
           9  SteamAPI_RegisterCallback
          15  SteamAPI_Shutdown
          17  SteamAPI_UnregisterCallback
          16  SteamAPI_UnregisterCallResult
           8  SteamAPI_RegisterCallResult
          34  SteamGameServer_BSecure
          27  SteamFriends
          49  SteamUser
          51  SteamUtils
          38  SteamGameServer_GetSteamID
          10  SteamAPI_RestartAppIfNecessary
           5  SteamAPI_Init
          50  SteamUserStats
          39  SteamGameServer_Init
          32  SteamGameServerStats
          31  SteamGameServerNetworking
          33  SteamGameServerUtils
          11  SteamAPI_RunCallbacks
          41  SteamGameServer_RunCallbacks

  lookup 018e5ad8 time 00000000 fwd 00000000 name 018e67be addr 01042058

    DLL Name: DINPUT8.dll
    Hint/Ord  Name
           0  DirectInput8Create
`

// Real capture: ELEX's `system/ELEX.exe` (GameLibSteam bottle, appId
// 411300). The one real Win64-only title in this session's census: a
// `steam_api64.dll` heading (not `steam_api.dll`), 10 imports including the
// runtime-lookup family (`SteamInternal_CreateInterface`,
// `SteamAPI_GetHSteamUser`, `SteamAPI_GetHSteamPipe`) -- none of the 10 are
// covered by today's shim. `file format coff-x86-64` is Apple LLVM objdump's
// x86-64 label (GNU objdump would print `pei-x86-64`).
export const ELEX_X64_OBJDUMP_OUTPUT = `
ELEX.exe:	file format coff-x86-64

The Import Tables:

    DLL Name: steam_api64.dll
    Hint/Ord  Name
         101  SteamAPI_GetHSteamUser
         100  SteamAPI_GetHSteamPipe
         748  SteamAPI_IsSteamRunning
         753  SteamAPI_RunCallbacks
         752  SteamAPI_RestartAppIfNecessary
         759  SteamAPI_UnregisterCallback
         750  SteamAPI_RegisterCallback
         757  SteamAPI_Shutdown
         746  SteamAPI_Init
         771  SteamInternal_CreateInterface

  lookup 00dc1a50 time 00000000 fwd 00000000 name 00dc2d42 addr 00b00fb0

    DLL Name: dbghelp.dll
    Hint/Ord  Name
         118  SymGetModuleBase64
          87  SymFromAddr
`

// Real capture: Avernum 6's `Avernum 6.exe` (GameLibSteam bottle, appId
// 206060). Avernum 5/6 are the regression pair (D-51-14): already fully
// covered by the lifecycle-only shim, confirmed unchanged from the Avernum 4
// shape by this real capture.
export const AVERNUM_6_OBJDUMP_OUTPUT = `
Avernum 6.exe:	file format coff-i386

The Import Tables:

    DLL Name: steam_api.dll
    Hint/Ord  Name
          15  SteamAPI_Shutdown
           5  SteamAPI_Init

  lookup 001c4dbc time 00000000 fwd 00000000 name 001c4e24 addr 0017e380

    DLL Name: WINMM.dll
    Hint/Ord  Name
         148  timeGetTime
`

// `strings -a <XCOM's original steam_api.dll> | grep -E '^(Steam[A-Za-z]+0[0-9]{2}|STEAM[A-Z]+_INTERFACE_VERSION0[0-9]{2})$'`,
// read directly this session (Binaries/Win32/steam_api.dll, GameLibSteam
// bottle). The 9 versions resolveRequiredInterfaceVersions must map XCOM's 9
// client bare accessors onto.
export const XCOM_DLL_VERSION_STRINGS = [
  'STEAMAPPS_INTERFACE_VERSION004',
  'STEAMHTTP_INTERFACE_VERSION001',
  'STEAMREMOTESTORAGE_INTERFACE_VERSION005',
  'STEAMSCREENSHOTS_INTERFACE_VERSION001',
  'STEAMUSERSTATS_INTERFACE_VERSION010',
  'SteamClient012',
  'SteamContentServer002',
  'SteamFriends011',
  'SteamGameServer011',
  'SteamGameServerStats001',
  'SteamMatchMaking009',
  'SteamMatchMakingServers002',
  'SteamNetworking005',
  'SteamUser016',
  'SteamUtils005'
]

// `strings -a <Hoard's real original steam_api.dll> | grep -E
// '^(Steam[A-Za-z]+0[0-9]{2}|STEAM[A-Z]+_INTERFACE_VERSION0[0-9]{2})$' | sort -u`,
// read directly this session (261021-pgx) against
// `/Users/graysonmitchell/Downloads/steam_api.dll`, 104872 bytes -- NOT the
// 805888-byte Phase 24 shim. `[VERIFIED: strings -a, read directly this
// session against the real binary on this machine]`.
//
// Provenance (operator's direct confirmation, recorded verbatim): freshly
// installed from scratch on a separate Windows PC where XCOM is not even
// installed, ruling out a copy mixup -- despite an unrelated, coincidental
// byte-identical match to an XCOM XEW expansion dll already in this repo's
// CrossOver fixtures, which is a documented coincidence, not evidence of
// contamination.
export const HOARD_DLL_VERSION_STRINGS = [
  'STEAMAPPS_INTERFACE_VERSION005',
  'STEAMHTTP_INTERFACE_VERSION002',
  'STEAMREMOTESTORAGE_INTERFACE_VERSION010',
  'STEAMSCREENSHOTS_INTERFACE_VERSION002',
  'STEAMUNIFIEDMESSAGES_INTERFACE_VERSION001',
  'STEAMUSERSTATS_INTERFACE_VERSION011',
  'SteamClient012',
  'SteamContentServer002',
  'SteamFriends013',
  'SteamGameServer011',
  'SteamGameServerStats001',
  'SteamMatchMaking009',
  'SteamMatchMakingServers002',
  'SteamNetworking005',
  'SteamUser016',
  'SteamUtils005'
]

// `strings -a <ELEX.exe>` (not a separate dll -- ELEX uses
// `SteamInternal_CreateInterface` runtime lookup, D-51-07, so its
// per-interface versions live in the exe), read directly this session.
export const ELEX_EXE_VERSION_STRINGS = [
  'STEAMAPPLIST_INTERFACE_VERSION001',
  'STEAMAPPS_INTERFACE_VERSION008',
  'STEAMHTTP_INTERFACE_VERSION002',
  'STEAMMUSICREMOTE_INTERFACE_VERSION001',
  'STEAMMUSIC_INTERFACE_VERSION001',
  'STEAMREMOTESTORAGE_INTERFACE_VERSION013',
  'STEAMSCREENSHOTS_INTERFACE_VERSION002',
  'STEAMUGC_INTERFACE_VERSION008',
  'STEAMUNIFIEDMESSAGES_INTERFACE_VERSION001',
  'STEAMUSERSTATS_INTERFACE_VERSION011',
  'SteamClient017',
  'SteamController003',
  'SteamFriends015',
  'SteamMatchMaking009',
  'SteamMatchMakingServers002',
  'SteamNetworking005',
  'SteamUser019',
  'SteamUtils008'
]
