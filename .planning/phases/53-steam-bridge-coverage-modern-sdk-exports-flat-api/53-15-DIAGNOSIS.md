# 53-15 Diagnosis: Overlooting, Ranch Simulator, Rogue Waters

Method: bottle `wine` run directly under `CX_DEBUGMSG=+loaddll,+seh,+process` (WINEDEBUG alone is
ignored by CrossOver's wrapper), each run bounded by `perl alarm 45`, then `wineserver -k` scoped to
the bottle. Raw traces stay in the session scratchpad (not in the repo). GameLib was stopped first
(the stale `gamelib-shell` pid 65491 from 53-14 was killed).

Real-profile arm (fake-HOME convention): the subject IS the operator's real bottle under the real
HOME. A fake HOME would test nothing, because the bug is in what the real bottle's Wine provides.
No hand-rolled HOME/XDG env literal was used; only `CX_DEBUGMSG`, `WINEPREFIX` and `CX_ROOT`, the
same variables `killBottleWineServer` sets.

Shim swap safety (T-53-58): shims were backed up, swapped, restored, and `cmp`-verified against the
backup. Final sizes: 3410180 steam_api64.dll = 402944 bytes; 1119730 steam_api64.dll = 402944 bytes
(orig 330296 bytes still beside it). No game or wineserver process was left (`pgrep` empty).

## 3410180 Overlooting

Evidence (static): ImageBase 0x140000000, `.text` covers RVA 0x607f1. The instruction before the
return address is `41 ff d7  callq *%r15` at 0x1400607ee, preceded by
`mov rdx,[rsp+0xa8]; mov rcx,[rsp+0x70]`. In the same function (0x140060510-0x140060f77) the code
does `LoadLibraryA("nvapi64.dll")`, `GetProcAddress(h, "nvapi_QueryInterface")`, then a run of
`call *%rbx` (QueryInterface calls) and `mov %rax,%r15` at 0x1400605ed. The nearby strings are
`application/config/name`, `Godot Engine`, ` Nvidia Profile`: this is Godot 4.4's NVIDIA driver
profile setup (NvAPI DRS). r15 is the NvAPI function pointer for one interface ID, called with no
NULL check.

Evidence (traced, ends the run):

```
trace:loaddll:build_module Loaded L"...\\Overlooting\\steam_api64.dll" at 00006FFFFCE30000: native
trace:loaddll:build_module Loaded L"...\\libgodotsteam.windows.template_release.x86_64.dll" ...: native
trace:loaddll:build_module Loaded L"C:\\windows\\system32\\nvapi64.dll" at 00006FFFFCCF0000: builtin
warn:module:load_dll Failed to load module L"nvapi.dll"; status=c0000135
trace:seh:dispatch_exception code=c0000005 (EXCEPTION_ACCESS_VIOLATION) flags=0 addr=0000000000000000
trace:seh:dispatch_exception rip=0000000000000000 ... r15=0000000000000000
trace:unwind:RtlVirtualUnwind2 type 1 base 140000000 rip 1400607f1 rva 607f1
```

The last module loaded before the fault is Wine's builtin `nvapi64.dll`, whose `nvapi.dll` backend is
missing (c0000135), so `nvapi_QueryInterface` returns NULL for the requested ID.

Discriminator: the game ships NO original steam_api64.dll (the shim was placed where none existed;
there is no `.gamelib-orig`). So the discriminator is the shim removed entirely: with
`steam_api64.dll` moved away, the fault reproduces identically (`nvapi64.dll` builtin loaded,
access violation at rip 0, return address 0x1400607f1). Same, with or without the shim. A run with
`WINEDLLOVERRIDES=nvapi64=d` did not change the result (CrossOver's wrapper did not pass it
through), so that mitigation is untested.

Why no HELLO: the fault happens before Godot initialises GodotSteam, so the shim is never entered.

Why DRM detection could not parse the exe: `detectSteamDrmInPe` reproduces `parsed:false` on the
322 MB exe. The section `pck` has VirtualSize 8 but SizeOfRawData 0xd6455f0 (the embedded Godot
pack). The scanner sizes a section as `max(virtualSize, rawSize)`, so `pck` (RVA 0x589e000) claims
RVA 0x5dd6000, which is really `.rsrc`; `sections.find` picks `pck` first, computes a wrong file
offset, and the resource walk fails. This is a scanner bug in bridge scope (harmless in effect:
unparsed means "treated as not CEG"), not a size cap. Fixed in Task 3.

Cause: Godot 4.4 calls an unchecked NULL NvAPI function pointer under CrossOver's builtin
`nvapi64.dll` stub. Bottle runtime gap (no usable NvAPI), not the shim.

Disposition: pending Task 3

## 1119730 Ranch Simulator

Evidence: the Shipping exe, run directly, exits 53 (0x35). `detectSteamDrmInPe` over it returns
`{"parsed":true,"cegMarkers":[],"hasBindSection":true}`; `objdump -h` lists a `.bind` section (0x39248
bytes) as the last section: SteamStub.

```
trace:loaddll:build_module Loaded L"...\\Ranch_Simulator-Win64-Shipping.exe" at 0000000140000000
trace:loaddll:build_module Loaded L"C:\\windows\\system32\\concrt140.dll" ...: builtin
(no further module load; steam_api64.dll is never loaded; process exits 53)
```

No `unimplemented function`, no failed import, no shim export gap: the process exits during
SteamStub's own start-up, before the game loads `steam_api64.dll` from `Steamv161/Win64`.

Discriminator: with the original `steam_api64.dll.gamelib-orig` (330296 bytes) copied over the shim
the result is identical: exit 53, no steam module loaded. Same, with or without the shim.

Cause: SteamStub `.bind` wrapper self-terminates (launch check with no Steam client) before any
bridge code runs. Phase 52 scope (the SteamStub launch-check todo), not a shim defect. Not rerouted
to bottled Steam.

Disposition: pending Task 3

## 1691190 Rogue Waters

Re-trace pending Task 2 (operator live re-run on the current packaged build) and Task 3 scoring.

Disposition: pending Task 3
