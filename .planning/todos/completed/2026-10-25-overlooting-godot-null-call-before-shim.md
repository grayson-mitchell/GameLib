---
created: 2026-10-25
title: "Overlooting (3410180) crashes in Godot's NvAPI profile setup because CrossOver's builtin nvapi64.dll returns NULL, before the shim is entered"
source: 53-15 Task 1 diagnosis (static disassembly plus Wine +loaddll/+seh trace)
area: steam-bridge
files:
  - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-15-DIAGNOSIS.md
severity: major
platform: macos
ready: live-gate
---

**Problem.** Overlooting dies with `page fault on read access to 0x0 in 64-bit code`, rip=0, return address 0x1400607f1 inside overlooting.exe. No HELLO, no Steam call: the shim is never entered.

**Cause (named).** The return address follows `41 ff d7 callq *%r15` at 0x1400607ee in Godot 4.4's NVIDIA driver-profile setup (`LoadLibraryA("nvapi64.dll")`, `GetProcAddress("nvapi_QueryInterface")`, then unchecked calls through the returned pointers). CrossOver's builtin `nvapi64.dll` fails to load its `nvapi.dll` backend (`status=c0000135`), so `nvapi_QueryInterface` returns NULL and r15 is 0.

**Discriminator.** The game ships no original steam_api64.dll. With the placed shim removed entirely the fault reproduces identically. It is a bottle runtime gap, not a bridge defect, and it is not a reason to reroute to bottled Steam.

**Evidence.** See `53-15-DIAGNOSIS.md` section 3410180 (trace excerpts).

**Next.** Untested mitigation: make `nvapi64` resolve to nothing or to a stub that returns a non-NULL no-op for QueryInterface in the bottle (`WINEDLLOVERRIDES=nvapi64=d` was not passed through by CrossOver's wrapper; set it via the bottle's registry DllOverrides instead). Also fold into `2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md` as a runtime component gap.

**Revisit trigger.** Any bottle-runtime change (DXVK/nvapi settings, CrossOver update) or a second Godot 4.4 title with the same fault.

## 53-19 evidence

2026-10-25: measured in the real bottle (see `53-19-NVAPI.md`). Baseline reproduced the rip=0 fault. A per-exe registry override `HKCU\Software\Wine\AppDefaults\Overlooting.exe\DllOverrides` `nvapi64=""` clears it: nvapi64 fails to load, Godot skips its NvAPI block, and godot.log advances into GodotSteam init. The bottle was restored byte-for-byte. Shipped as a per-appId applier in `bottleDllOverrides.ts`; stays open until the 53-20 live re-run shows HELLO.

## 53-20 evidence (2026-10-25)

The null-call crash is gone on the 53-19 build: the `nvapi64` per-exe override applied (user.reg `"nvapi64"=""`), no `page fault on read access to 0x0`, godot.log advances past the driver lines, and the operator reached the menu. The bridge saw HELLO and one game call, `SteamUser023.GetSteamID`; the census reads `unverified (1 game call; needs 2 incl. identity)`. Not closed, because the row is not verified (53-UAT item 36). Open question for the next round: godot.log prints `Usernam: ` empty after `Steam is running!` and no GetPersonaName CALL was traced.

## 261026-qvc evidence (2026-10-26)

Second root cause, after the 53-19 nvapi fix. Overlooting's main_screen.gdc calls `Steam.getSteamID` and then `Steam.getFriendPersonaName(<own id>)`, printing `Usernam: ` plus the result. It never calls getPersonaName. `ISteamFriends::GetFriendPersonaName` (slot 6 of SteamFriends018) was a generated stub that returned "" with no `bridge_transact`, which is why godot.log showed an empty name and the census saw one game call.

Fix: the generator now admits `CSteamID` as an 8-byte by-value wire param (both Win32 ABIs pass it like a uint64; i386 `ret $0x8`, x64 value in `%rdx`, both pinned in `shimAbiGate`). `CGameID` stays rejected because it has no consumer and its flat-API shape is unverified. `GetFriendPersonaName` is wired in SteamFriends011/013/015/017/018 to `SteamAPI_ISteamFriends_GetFriendPersonaName`, returning through the CR-01 shim-owned buffer. Wire-table hash `e05aec2c174d` -> `00e358feeee6`. Rebuilt sizes: steam_api.dll 290304, steam_api64.dll 505344, steam-bridge-helper 156688.

Next: a live re-run on a packaged build (restart dev so the rebuilt helper is used) must show HELLO plus CALLs for both `SteamUser023.GetSteamID` and `SteamFriends018.GetFriendPersonaName`, a non-empty `Usernam:` line in godot.log, and the census row verified.

## 261026-rqb evidence (2026-10-26)

The 261026-qvc live gate, 2026-10-26 19:48 and 19:50, on the rebuilt packaged debug bundle (helper 156688, steam_api64.dll 505344), launched via `gamelib://launch?appName=3410180&runner=steam`: the nvapi64 override applied and there was no page fault. The log showed HELLO, `GINIT fn=SteamInternal_SteamAPI_Init ret=0 ok=1`, `CALL SteamUser023.GetSteamID` and `CALL SteamFriends018.GetFriendPersonaName`, with no NOVER. `pnpm bridge-census` reads 3410180 `verified`. The operator quit cleanly via the game's Quit button at 19:55 and the menu behaved normally.

The name is still wrong. The godot.log `Usernam: ` line is hex `55 73 65 72 6e 61 6d 3a 20 07 0a`. 0x07 is the low byte of the 4-byte little-endian length prefix of a 7-byte name, and the following 0x00 terminates the string.

Root cause: the generated shim's string-return branch copied the whole `[u32 len][bytes]` reply raw (`memcpy(buf, retbuf, retlen)`). The helper's encode was correct; the defect sat in the generator, so it affected every wired string return on every interface and arch: GetPersonaName (Vampire's Fall 1167950, Mining Mechs 1603180), GetCurrentGameLanguage (Rogue Waters 1691190, Mining Mechs) and others (68 sites). Those census rows read verified only because the census checks that CALLs happened, not what they returned.

Fix: single-sourced `emitStringReturnEncodeLines` / `emitStringReturnDecode` in `meta/gen_vtables.ts`. The decode requires `retlen >= 4`, `len <= retlen - 4` and `len < STRING_RETURN_BUF_BYTES`, otherwise it yields "". The shim retbuf is now `STRING_RETURN_WIRE_BYTES` (259 = 4 + 255), which also closes the 252..255-byte oversize-drop mismatch in `bridge_transact`. `stringReturnRoundTrip.test.ts` compiles the helper encode and the shim decode with clang (ASan/UBSan) and round-trips them. Rebuilt sizes: steam_api.dll 290816, steam_api64.dll 506368, steam-bridge-helper 156688 (unchanged; bridge_dispatch.h changed by a comment only).

HYPOTHESIS (unproven): Mining Mechs' Win32 error dialogs (todo `completed/2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md`) may come from a garbage GetCurrentGameLanguage. Recorded here because that todo is under completed/ and carries an unrelated uncommitted edit.

Next: a live re-run on a packaged build with the rebuilt shim must show the real persona name after `Usernam:` in godot.log. Restart dev so the rebuilt helper and shim are used.

## Live gate passed (2026-10-26)

20:09, rebuilt packaged debug bundle carrying the 261026-rqb shim (bottle steam_api64.dll 506368 = built; helper 156688), launched via `gamelib://launch?appName=3410180&runner=steam`. The nvapi64 per-exe override applied, with no `page fault on read access to 0x0`. The bridge logged HELLO, `GINIT fn=SteamInternal_SteamAPI_Init ret=0 ok=1`, `CALL SteamUser023.GetSteamID` and `CALL SteamFriends018.GetFriendPersonaName`, with no NOVER. The operator reached the menu (normal) and quit via the game's Quit button. godot.log now reads `Usernam: Grayson` (hex `... 3a 20 47 72 61 79 73 6f 6e 0a`, no length byte). `pnpm bridge-census` reads 3410180 `verified`. Closed.

The Mining Mechs language hypothesis above is moot for that todo: it was already closed on a separate D3DMetal cause. Whether other titles misbehaved on the garbled GetPersonaName/GetCurrentGameLanguage returns before 261026-rqb is unmeasured.
