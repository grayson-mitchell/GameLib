/**
 * Fixture `objdump --private-headers` stdout shapes, modeled on the two
 * acceptance-set games' real import surfaces (24-PATTERNS.md /
 * 24-RESEARCH.md, cross-referenced against
 * `.claude/skills/spike-findings-gamelib/sources/007-real-game-avernum/`
 * and `.../008-gating-game-hoard/`'s own README/steam_api.def evidence --
 * Avernum 4.exe imports exactly `SteamAPI_Init`/`SteamAPI_Shutdown` (2);
 * Hoard's Reuben.exe imports exactly the 7 symbols listed in that spike's
 * committed `steam_api.def`). The spikes did not archive raw objdump text,
 * so these fixtures reconstruct objdump's real PE import-table section
 * shape (DLL Name heading + Hint/Ord/Member-Name rows) around those
 * confirmed symbol sets.
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

export const HOARD_REUBEN_OBJDUMP_OUTPUT = `
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
