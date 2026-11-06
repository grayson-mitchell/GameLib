# Phase 52 Plan 25: Diagnosis (Gap 5, what the SteamStub check examines in the forwarder bytes)

Session dir: `/tmp/gamelib-gate-52e-20261024T065250Z` (scripts `pecmp.py` / `pecksum.py`, raw output in `terminal.log`).
This document makes no fix choice. 52-26 decides.

Columns: G = genuine Win64 `steamclient64.dll` (GameLibSteam bottle, read in place, never copied), F = forwarder `public/bin/arm64/darwin/steamclient64.dll` (sha256 `d84cb744...aac849`), E = `Grim Dawn.exe` (GameLibSteamBridge-219990, sha256 `d3915e25...a1fc4c4`). All three were read only. Every value came from `python3 -I pecmp.py <path>` (a pefile-free parser written for this plan: reads the DOS/COFF/optional headers, section table, data directories, import/export tables and the `VS_VERSION_INFO` resource; the stored/recomputed CheckSum is the standard 16-bit one's-complement algorithm with the CheckSum field zeroed, plus file length), cross-checked against `/usr/bin/objdump -p` / `-h` where marked.

## Static comparison

| property | G (genuine) | F (forwarder) | E (Grim Dawn.exe) | measured by |
| --- | --- | --- | --- | --- |
| file size (bytes) | 26547864 | 186368 | 4687944 (= the 0x478848 ReadFile at cxlog:6820) | `stat -f %z` |
| Machine | 0x8664 (x64) | 0x8664 | 0x8664 | pecmp.py; `objdump -p` "file format coff-x86-64" |
| TimeDateStamp | 0x6ad92aa7 (2026-10-21 21:12:07 UTC) | 0xd805677e (2084-11-05; the toolchain's reproducible-build hash, not a date) | 0x6ac7f680 (2026-10-08 20:01:04 UTC) | `objdump -p` Time/Date; pecmp.py |
| stored header CheckSum | 0x0195cf93 | 0x00000000 | 0x00000000 | `objdump -p` CheckSum; pecmp.py |
| recomputed CheckSum | 0x0195cf93 (stored == recomputed) | 0x0002f67b (stored 0 != recomputed) | 0x0047fc2b (stored 0 != recomputed) | pecksum.py (copy of pecmp.py) |
| Security Directory (Authenticode) | offset 0x194ea00, size 0x2c98 (11416 B), ends at EOF | none (0, 0) | none (0, 0) | `objdump -p` Entry 4 |
| signer / issuer | signer `CN=Valve Corp., O=Valve Corp., L=Bellevue, ST=Washington, C=US`; issuer `CN=DigiCert Trusted G4 Code Signing RSA4096 SHA384 2021 CA1, O=DigiCert, Inc.`; chain ends at `CN=DigiCert Trusted Root G4`; a DigiCert timestamp countersignature is present | n/a | n/a | `dd` of the WIN_CERTIFICATE to `g-cert.bin`, 8-byte header stripped to `g-cert.p7b`, `openssl pkcs7 -inform DER -print_certs` (CNs and O only) |
| Resource Directory size | 0x7e8 (2024 B), section `.rsrc` | 0 (none) | 0x50550 (329040 B), section `.rsrc` | `objdump -p` Entry 2; pecmp.py |
| VS_VERSIONINFO CompanyName | Valve Corporation | (empty) | Crate Entertainment, LLC | pecmp.py |
| ProductName | Steam | (empty) | Grim Dawn | pecmp.py |
| FileDescription | Steamclient.dll | (empty) | Grim Dawn | pecmp.py |
| OriginalFilename | Steamclient.dll | (empty) | Grim Dawn.exe | pecmp.py |
| InternalName | Steamclient.dll (buildbot_steam-hotfix-w64... build host string) | (empty) | Grim Dawn.exe | pecmp.py |
| FileVersion | 11.15.70.27 | (empty) | 0.3.0.0 | pecmp.py |
| ProductVersion | 03.00.00.01 | (empty) | 0.3.0.0 | pecmp.py |
| export count | 41 | 1 (`CreateInterface`) | 26 (24 `LZ4_*`, `AmdPowerXpressRequestHighPerformance`, `NvOptimusEnablement`) | `objdump -p` export table; pecmp.py |
| import DLLs | 21: KERNEL32, USER32, GDI32, ADVAPI32, SHELL32, ole32, OLEAUT32, WS2_32, SHLWAPI, WINMM, CRYPT32, IPHLPAPI, imagehlp, PSAPI, VERSION, SETUPAPI, tier0_s64, vstdlib_s64, MSWSOCK, bcrypt, Secur32 | 5: api-ms-win-crt-runtime/stdio/heap/string-l1-1-0, KERNEL32 | 24 (StatReport, CrashReport, WINMM, lua51, KERNEL32, USER32, ADVAPI32, SHELL32, Engine, Game, MSVCP140, WS2_32, WININET, VCRUNTIME140 and 10 api-ms-win-crt-* DLLs) | `objdump -p` "DLL Name:" lines; pecmp.py |
| sections | 7: .text .rdata .data .pdata .fptable .rsrc .reloc | 7: .text .rdata .buildid .data .pdata .tls .reloc | 10: .text .rdata .data .pdata .gfids .tls _RDATA .rsrc .reloc .bind | `objdump -h`; pecmp.py (section names only; `.bind` was listed, never read or decoded) |
| overlay past last section (excluding certificate) | 0 bytes; the Security Directory begins exactly at the last section end 0x194ea00 and runs to EOF | 0 bytes (last section ends at EOF 186368) | 0 bytes (last section `.bind` ends at EOF) | pecmp.py |
| Rich header | absent | absent | absent | pecmp.py (no `Rich` before the PE header); `dd` first 1024 B piped to `strings` finds none |

### Differences

Every property on which F differs from G, with the E value beside it:

1. Size: F 186368 vs G 26547864. E is 4687944. Not G-like or F-like in a meaningful way (E is a different program).
2. Stored CheckSum: F 0 vs G 0x0195cf93 (G's matches its recomputed value). E is 0, F-like.
3. Security Directory: F none vs G 11416 B Valve/DigiCert Authenticode. E none, F-like.
4. Resource directory and every `VS_VERSIONINFO` string: F none vs G `Valve Corporation` / `Steam` / `Steamclient.dll` / `11.15.70.27`. E has a resource directory with its own (Crate) version strings, so E is G-like in having a resource directory and not G-like in its content.
5. Exports: F 1 vs G 41. E has 26 unrelated exports.
6. Import DLLs: F 5 vs G 21. E has 24.
7. Section set: F has `.buildid` and `.tls` and lacks `.fptable` and `.rsrc`; G the converse. E has neither `.fptable` nor `.buildid`, and has `.rsrc`.
8. TimeDateStamp: F is the reproducible hash value 0xd805677e (year 2084, a future date) vs G 2026-10-21. E 2026-10-08.
9. Equal across F, G, E: Machine, absence of Rich header, no overlay.

Indirect evidence from E only: the stub read E whole (cxlog:6810-6820) and did not reject it, and E has CheckSum 0, no Security Directory and no Rich header. That argues against CheckSum, Authenticode presence and a Rich header being checked on every module the stub reads. It is indirect: the stub's check on a file at the `SteamClientDll64` path may differ from what it does with the exe it is wrapped in, and a stub reading its own image has no reason to verify it. E does carry a resource directory and VS_VERSIONINFO, which F lacks, so the resource directory is the one structural property where E sides with G and not F.

## Export tables (re-measured)

Counts: G 41 (`objdump -p`), F 1 (`CreateInterface`, ordinal 1, RVA 0x1000), native Mac `steamclient.dylib` 33 (`nm -gU`, filtered to `_Steam_*` and `_CreateInterface`; 32 `Steam_*` plus `CreateInterface`). G's 41 names compared programmatically against the 41 `y` rows of the 52-19 table: sets equal, zero differences. The dylib's 33 names equal the 52-19 table's dylib column exactly. identical to `52-19-DIAGNOSIS.md ## Gap 5: export tables`; the 41-row table is not duplicated. (G has 8 names the dylib lacks: six `Breakpad_*`, `Steam_IsKnownInterface`, `Steam_NotifyMissingInterface`, as at 52-19.)

## Public-source claims

Six sources fetched on 2026-10-24 (limit 8). Nothing public found documents what SteamStub verifies about `steamclient64.dll`. All rows are `public-claim`, never observed.

| claim | URL | fetch date | label |
| --- | --- | --- | --- |
| The Steam DRM wrapper "verifies game ownership and ensures that Steamworks features work properly by launching Steam before launching the game"; it is not an anti-piracy solution and "has some obfuscation, but it is easily removed". The page does not mention steamclient.dll, signatures, hashes or "Application Load Error". | https://partner.steamgames.com/doc/features/drm | 2026-10-24 | public-claim |
| Steamless README lists SteamStub variants 1, 2, 3 (v3.0.0 through v3.1.2, 32 and 64 bit) as unpackable. No description of any steamclient.dll verification. (README read as text only; Steamless was not run and its format knowledge was not applied to Grim Dawn.exe.) | https://github.com/atom0s/Steamless (README.md) | 2026-10-24 | public-claim |
| Users report "Application load error 3:0000065432" (Astroneer, via PartyDeck, a Steam-client emulation layer); one reporter says the game worked after removing SteamStub with Steamless, and a maintainer says the SteamStub variant "is not covered by the steam client emulation". Suggests the error appears when the SteamStub wrapper does not get what it wants from its client replacement. Does not name the check. | https://github.com/partydeck/partydeck/issues/114 | 2026-10-24 | public-claim |
| "Application load error 6:0000065432" on Proton (Dark Souls III via me3 launcher); maintainers ask about the Steam install, account and license. A commenter in another thread says they saw this error only with software that unlocks DLC or family sharing. The code after the colon is not defined in these threads. | https://github.com/garyttierney/me3/issues/832 | 2026-10-24 | public-claim |
| "Application load error V:10000065432" (Fallout 4 modlist under Proton) and reports linking such errors to software interfering with Steam. | https://github.com/Omni-guides/Jackify/issues/248 | 2026-10-24 | public-claim |
| GitHub issue search for `"Application Load Error" steam` (277 hits, 10 inspected by title) shows the same family: the digit before the colon (3, 5, 6, V, 0x02) varies and the number after is `0000065432`/`65434`. No public source decodes the digit. | https://api.github.com/search/issues | 2026-10-24 | public-claim |

Reading: the public record establishes that the error text family exists and that SteamStub-wrapped titles show it when the client side is replaced, but it does not say whether the check is a signature, a hash or a structural property. That question remains open going into the trace.

## Trace window (diag3)

Round `diag3`, `MODE=trace`, `WATCH=45`, `+process,+reg,+loaddll,+seh,+relay` with a 46-name `RELAY_INCLUDE` list (window anchors, file geometry, trust and certificate, hash and signature primitives, loaders and MessageBox; list in `relay_include.txt`). Session `/tmp/gamelib-gate-52e-20261024T065250Z`, file `round-diag3.cxlog` (11305 lines; cxlog line numbers below are into that file). DRY_RUN first: the printout wrote RelayInclude only with `CX_BOTTLE=GameLibGate52GD`, had no `cp` of `steam_api64.dll` or `steamclient64.dll` and no `Software\Valve` write. Helper snapshot sha256 `9df66e3f27fb...f9088` (same bytes as 52-19). Round result: alive=yes at 45 s (the MessageBox is up), 523 relay `Call` lines, helper `LISTEN`, `INIT`, `HELLO` 1, `FWD CreateInterface ver=SteamClient017` and `ver=SteamClient014` (native=present), `steam://run` 0. Clone state asserted after the run: clone `x64/steam_api64.dll` and `x64/steamclient64.dll` `cmp` identical to the product's, clone `SteamClientDll64` count 1 equal to the product's, ActiveProcess values equal; product bottle re-read after `wineserver -k` unchanged (exe `d3915e25...a1fc4c4`, shim 251392 B `41b74555...b8051be`, forwarder 186368 B `d84cb744...aac849`, ActiveProcess lines identical, no HKLM Valve key). Fallback round diag4 not needed (523 Call lines).

Two Wine processes appear: `00e0:00e4` is CrossOver's launcher stub (it reads the CrossOver licence file at 2650 and does the `advapi32.Crypt*` calls at 2651-2743 before `NtCreateUserProcess` of Grim Dawn.exe at 2776) and `00e8:00ec` is Grim Dawn.exe (the game, the SteamStub wrapper and the forwarder). Everything below is process `00e8`.

Window: from the forwarder `GetModuleFileNameW` (6640, `ret=00ca409a`, the same return address the exe read used at 6308) to the MessageBox call (6654). All relay `Call`/`Ret` lines of process 00e8 in the window (6640-6654), verbatim except arguments trimmed:

```
6640 Call KERNEL32.GetModuleFileNameW(6ffffd210000,0010cb90,00000400) ret=00ca409a
6643 Ret  KERNEL32.GetModuleFileNameW() retval=0000004d ret=00ca409a
6644 Call KERNEL32.CreateFileW(0010cb90 L"C:\...\Grim Dawn\x64\steamclient64.dll",80000000,00000001,00000000,00000003,00000080,00000000) ret=00ca40e0
6645 Ret  KERNEL32.CreateFileW() retval=000000a8 ret=00ca40e0
6646 Call KERNEL32.GetFileSize(000000a8,00000000) ret=00ca40fc
6647 Ret  KERNEL32.GetFileSize() retval=0002d800 ret=00ca40fc
6648 Call KERNEL32.ReadFile(000000a8,001e7480,0002d800,0010d3c0,00000000) ret=00ca413e
6649 Ret  KERNEL32.ReadFile() retval=00000001 ret=00ca413e
6650 Call KERNEL32.LoadLibraryA(0010fd57 "user32.dll") ret=14044b73d
6653 Ret  KERNEL32.LoadLibraryA() retval=6fffff5d0000 ret=14044b73d
6654 Call user32.MessageBoxA(00000000,0010fae0 "Application load error 3:0000065432",0010fb18 "Steam Error",00000010) ret=14044b8d4
```

`+loaddll` lines of process 00e8 in the window: none (the only loads in 00e8 around it are `steamclient64.dll` native at 6489, 150 lines earlier, and `winemac.drv`/`uxtheme.dll` at 10295/10526, after the MessageBox). No wintrust, crypt32, imagehlp, bcrypt or rsaenh load appears anywhere in process 00e8 (`grep` for those names after line 2774 matches nothing). Only 1 ms (timestamps 197513.158 to .159) separates the end of `ReadFile` from `LoadLibraryA user32.dll`.

Context before the window, same process: the exe read at 6308-6317 (`GetModuleFileNameW(140000000,...)` `ret=00ca409a`, `CreateFileW` `ret=00ca40e0`, `GetFileSize` returning `0x478848`, `ReadFile` of `0x478848` bytes `ret=00ca413e`); `pid` read (6320s), `SteamClientDll64` read, `pid` read, then `[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.` at 6330; `[S_API] SteamAPI_Init(): Loaded '...\x64\steamclient64.dll' OK.` at 6500; `gamelib_bridge.cfg` read at 6624-6629 (the shim); `Steam_ReleaseThreadLocalMemory` not found in `Grim Dawn.exe` at 6637.

## Answers (diag3)

**R1: the full MessageBox text.** Observed at cxlog:6654: `user32.MessageBoxA(hWnd=0, text="Application load error 3:0000065432", caption="Steam Error", uType=0x10)` (0x10 is MB_ICONERROR|MB_OK). The full text is `Application load error 3:0000065432` and the caption is `Steam Error`. The suffix `0000065432` is the same in unrelated public reports (Dark Souls III, Fallout 4, Astroneer, public-claim rows above) whose leading digit differs, so the digit before the colon (3) is the varying part. Nothing in the text names a file, a signature or a hash.

**R2: any trust or certificate API in the window.** Not observed. Zero relay `Call` lines for `WinVerifyTrust`, `WinVerifyTrustEx`, `CryptCATAdminCalcHashFromFileHandle`, `ImageGetCertificateData`, `ImageGetCertificateHeader`, `ImageEnumerateCertificates`, `CryptQueryObject`, `CryptMsgGetParam`, `CertGetCertificateChain`, `CertVerifyCertificateChainPolicy`, `CryptVerifyMessageSignature`, `CertFindCertificateInStore` (summary block, all 0). Strength: direct that these OS entry points were not called by the game process in this run; it does not exclude verification code inside the stub itself.

**R3: any hash or signature primitive, or a crypto DLL load.** Not observed in the game process. The summary shows 1 each of `advapi32.CryptAcquireContextA`, `CryptCreateHash`, `CryptHashData`, `CryptImportKey`, `CryptVerifySignatureA`, but all five belong to the CrossOver launcher process `00e0:00e4` at cxlog:2651, 2713, 2719, 2741, 2743 (`ret=14000...`, provider `Microsoft Enhanced RSA and AES Cryptographic Provider`, immediately after it opens `com.codeweavers.CrossOver.license`), before the game process exists (`NtCreateUserProcess` at 2776). They are the CrossOver licence check, not the SteamStub. `BCrypt*` 0, `CryptAcquireContextW` 0, `CryptVerifySignatureW` 0. No crypto DLL loaded in process 00e8. Again: absence of API calls does not exclude an in-stub hash or signature routine.

**R4: the forwarder access pattern.** Observed: one `GetFileSize` (`0x2d800` = 186368, cxlog:6646-6647) and one `ReadFile` of `0x2d800` bytes into a fresh buffer (6648). No `SetFilePointer`, `SetFilePointerEx`, `GetFileSizeEx`, `CreateFileMappingW` or `MapViewOfFile` call (all 0). It is a single whole-file read, not targeted reads: no read was aimed at the Security Directory offset or at any header. Strength: direct for the access pattern.

**R5: the exe sequence against the forwarder sequence.** Same shape, call by call, with identical return addresses, so the same helper routine in the stub: `GetModuleFileNameW(module base, buf, 0x400)` `ret=00ca409a` (exe 6308, forwarder 6640); `CreateFileW(path, 0x80000000, share 1, 0, OPEN_EXISTING 3, FILE_ATTRIBUTE_NORMAL 0x80, 0)` `ret=00ca40e0` (6312, 6644); `GetFileSize` `ret=00ca40fc` (6314, 6646); `ReadFile(whole file)` `ret=00ca413e` (6316, 6648). Differences: the target (exe at its image base `140000000` vs the forwarder's loaded base `6ffffd210000`), the size (`0x478848` vs `0x2d800`) and the timing (the exe read comes at stub start, 30 ms before the forwarder read, which follows `Loaded ... steamclient64.dll OK`). The exe, read through the same routine, produced no MessageBox.

**R6: the last five calls before the MessageBox.** (1) `GetModuleFileNameW` on the forwarder base (6640); (2) `CreateFileW` on the forwarder path (6644); (3) `GetFileSize` returning `0x2d800` (6646); (4) `ReadFile` of `0x2d800` bytes (6648); (5) `LoadLibraryA("user32.dll")` (6650), then `MessageBoxA` at 6654. Diag1 (52-19 cxlog:7184) showed `GetProcAddress` of `MessageBoxA` at this position; this run's filter did not include `GetProcAddress`, so it shows the `LoadLibraryA` of `user32.dll` instead. The sequence ReadFile of the forwarder, then the user32 lookup, then the MessageBox is the same in both runs.

## Check classification

Boundary facts, stated plainly. A Valve signature exists only on Valve-built files. The only Valve-built `steamclient64.dll` is the Windows Steam client file (G above), which the locked boundary and the operator's rule forbid in the bridge bottle (and which was never copied here). A content hash of G can be matched only by G's bytes. The forwarder is a file GameLib builds itself (`zig cc`, `steamclient_fwd.c`, 186368 B). The boundary text forbids a stand-in, a local answer, reverse engineering of the wrapper, HKLM writes and hand edits to the product bottle; it does not mention version resources or PE header fields of the forwarder, so whether setting them is allowed is a boundary question left to 52-26, not settled here.

| class | evidence | strength | a forwarder GameLib builds could satisfy it | satisfiable within the locked boundary |
| --- | --- | --- | --- | --- |
| A. Authenticode or Valve signature on `steamclient64.dll` | G carries an 11416 B Valve Corp. / DigiCert signature; F and E have none (Static comparison). R2: no `WinVerifyTrust`/`Crypt*`/`Image*Certificate*` call in the game process, no crypto DLL loaded (diag3). R4: whole-file read, no read aimed at the certificate offset. E, read by the same routine (R5), has no signature and was not rejected. Public sources say nothing on signature checks (public-claim rows). | none that it is checked. Direct only that no OS trust API ran; an in-stub verifier cannot be excluded or confirmed. | no: Valve's private key is needed for a signature that verifies; an unsigned or self-signed file is not a Valve signature. If the check were only "a Security Directory exists", a build could add a structure, but nothing observed distinguishes that. | no for a Valve signature (needs the genuine file); unknown for a mere presence check |
| B. Content hash or CRC of the file compared with a value the stub holds | R4/R5: the whole file is read into a buffer by the routine the exe read also uses, then about 1 ms of non-API work, then the MessageBox (6649 to 6654). R2/R3: no Windows hash API ran in the game process. Consistent with an in-stub hash or CRC, but equally consistent with a parse (class C) or no check on content at all. The error text carries no digest (R1). | indirect (shape consistent, no hash call or value observed) | no, if the expected value is G's hash: only G's bytes match it. A different build cannot be made to match a cryptographic hash. | no (the matching bytes are G, which the boundary forbids); unknown whether this class is the one in force |
| C. Structural PE property of the file | F differs from G in size, CheckSum (0 vs 0x0195cf93), Security Directory, resource directory and all VS_VERSIONINFO strings, export set (1 vs 41), imports (5 vs 21), sections, TimeDateStamp (Differences list). E shares F's CheckSum 0 and missing Security Directory and Rich header, and was read and accepted by the same routine (R5), which weakens CheckSum, signature presence and Rich header as checks that apply to every file read (indirect, the exe is the stub's own image). E has a resource directory with version strings, as G does and F does not. In the 52-19 trace (which filtered `GetProcAddress`) only `CreateInterface` is resolved on F; in diag3 `Steam_ReleaseThreadLocalMemory` is looked up against `Grim Dawn.exe` at cxlog:6637, not against F (diag3 did not filter `GetProcAddress`). | indirect (differences are measured; that any of them is tested is not) | yes for header, resource and version fields, section names and export names, CheckSum, which a build can set; no for properties that carry G's content (the 26547864 B size, the 41 export implementations). Each yes is a claim about what a build could contain, not that the stub checks it. | unknown: setting fields in GameLib's own file is not named by the boundary, but version strings that claim Valve Corporation, Steamclient.dll or G's version are an identity claim; 52-26 must rule on it |
| D. Not observable without disassembly | R1-R6 stop at the ReadFile return; the decision runs inside the stub between cxlog:6649 and 6650 and leaves no relay line. The public sources (6 fetched) do not describe the check. | direct that it is not observable by relay, filesystem or public documentation here | not applicable | not applicable: observing it further requires disassembly or unpacking of the wrapper, which the boundary forbids, so no further evidence is available inside it |

Observed, not classified: the digit in the error text (3) is the only part of the message that varies across public reports; the code table is not public (public-claim rows), so no row above claims to know what 3 means.
