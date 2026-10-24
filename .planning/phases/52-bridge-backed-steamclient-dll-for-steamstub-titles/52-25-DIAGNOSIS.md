# Phase 52 Plan 25: Diagnosis (Gap 5, what the SteamStub check examines in the forwarder bytes)

Session dir: `/tmp/gamelib-gate-52e-20261024T065250Z` (scripts `pecmp.py` / `pecksum.py`, raw output in `terminal.log`).
This document recommends no fix. 52-26 decides.

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
