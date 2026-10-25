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
