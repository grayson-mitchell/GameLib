---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 03
subsystem: bridge-drm-mode
tags: [ntdll-detour, steam-helper, mingw-w64, zig, gpl-3, bsd-3]
requires: []
provides:
  - ported x64 ntdll detour sources (GPL-3) with COPYING
  - dev-only meta/ntdllResolve/resolve.py plus README procedure
  - HKCU-only game-process helper steam.c (BSD-3)
  - meta/buildDrmNativeParts.ts (payload + helper build, sha-pinned payload)
affects: [56-06, 56-08, 56-09, 56-10, 56-12, 56-15]
tech-stack:
  added: []
  patterns: ["fake-HOME spawn per build step", "ld script objects resolved by cwd"]
key-files:
  created:
    - native/steam-bridge/steamclient-layer/ntdll-patch/detour.c
    - native/steam-bridge/steamclient-layer/ntdll-patch/shim.S
    - native/steam-bridge/steamclient-layer/ntdll-patch/link.ld
    - native/steam-bridge/steamclient-layer/ntdll-patch/COPYING
    - native/steam-bridge/steamclient-layer/helper/steam.c
    - native/steam-bridge/steamclient-layer/helper/LICENSE
    - meta/ntdllResolve/resolve.py
    - meta/ntdllResolve/README.md
    - meta/buildDrmNativeParts.ts
    - meta/__tests__/buildDrmNativeParts.test.ts
  modified: []
key-decisions:
  - "Helper refuses -applaunch / steam:// (exit 3): deliberate deviation from NotProton, which forwards to the Mac client; GameLib has no route into bottled Steam"
  - "link.ld names shim.o, so ld runs with cwd = work dir and bare object names (BuildStep.cwd)"
requirements-completed: [D-01, D-03, D-07, D-08, D-21]
duration: ~40 min
completed: 2026-10-28
---

# Phase 56 Plan 03: ntdll detour payload and game-process helper Summary

The x64 ntdll detour (GPL-3) and the HKCU-only `steam.exe` helper (BSD-3) are ported into the tree and built by the operator-run `meta/buildDrmNativeParts.ts`. The payload for CrossOver 26.3.0.39832 hashes to the pinned `e35b8344...1bfb` on the first build.

## Upstream pins

- NotProton `8db22adb237e6ea640a5af148b69b93709daf50c` (full sha). The shallow clone did not contain it, so it was fetched by sha. It was read as text only; no NotProton script or binary was run.
- Proton full sha used by 56-02: `164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca`. `steamclient_init_registry` is `void (void)` in the 56-02 lsteamclient, so no Proton clone was needed for the signature.
- Toolchain: mingw-w64 gcc 16.2.0 (Homebrew, installed by 56-02), zig 0.16.0 (pinned).
- Repo `COPYING` is byte-identical to NotProton's `LICENSE` (`cmp` exit 0), and the payload `COPYING` is a copy of it.

## Outputs (gitignored, unsigned)

`build/steamclient-layer/steamclient-layer-cx26.3.0.39832/`

| Output | Size (B) | sha256 |
| --- | --- | --- |
| `detour-cx26.3.0.39832.bin` | 832 | `e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb` |
| `steam.exe` | 193,536 | not pinned here (56-10 pins) |

Measured helper byproduct: `steam.pdb` beside `steam.exe`; `HELPER_BUILD_BYPRODUCTS` prunes it.

## Values taken only from resolve.py's PINNED row / derived

- `caveRVA 0xae000` and `caveSize 4096` come from the PINNED row (interfaces block called it `.npdet` at `0xae000`). `caveVa = imageBase + 0xae000 = 0x1700ae000`: the payload starts at the section's first byte, which is already 16-aligned.
- `scratchReg = rbx` is not in the PINNED row. It is derived as `shell_vars` does (rbx unless the WM register is rbx). The sha matching confirms it.

## Deviations from Plan

**1. [Rule 3 - Blocking] ld could not find `shim.o`**
- **Issue:** `link.ld` names `shim.o(.text)`, which ld treats as an input file resolved from cwd, and passing absolute object paths caused a duplicate-definition error.
- **Fix:** `BuildStep` gained an optional `cwd`; the ld step runs in the work dir with bare names `shim.o detour_c.o`. Test 2 asserts it.
- **Commit:** 88326904e

**2. [Deliberate, plan-directed] `-applaunch` refusal**
The helper exits 3 for `-applaunch` / `steam://` instead of forwarding to a Mac Steam client. 56-15 records it if it occurs.

**3. [Scope] resolve.py trimmed beyond i386**
The upstream script also carried an aarch64 resolver and multi-site/guest logic. These were removed along with the i386 resolver so the vendored copy is x86_64 only (no `i386` token remains).

## Not executed

- `resolve.py` was vendored and syntax-checked (`ast.parse`) but **not executed**; capstone (an `[ASSUMED]` PyPI package) was not installed.
- No brew installs were needed (mingw-w64 and bison were already present).

## Verification

- `npx jest meta/__tests__/buildDrmNativeParts.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts`: 24 pass.
- `npx tsc -p tsconfig.meta.json --noEmit`: clean.
- `prettier --check` on the two TS files and the README: clean (other files have no parser).
- CLI build printed `Compile gate PASSED (56-03)` for both parts; `steam.exe` begins `MZ`; `git status --porcelain build/` is empty.
- Greps: no `HKEY_LOCAL_MACHINE|HKLM` and no `steam_drm_thread|STEAMSTART|DIPC|OpenEventW` in `steam.c`; `buildDrmNativeParts` absent from `buildSteamBridgeShims.ts` and `release-tauri.yml`; `ntdllResolve` absent from `package.json`, workflows and `src`.

## Commits

- 985ffa9ed: ntdll-patch port and resolve.py (Task 1)
- 6883b8fad: helper steam.c and LICENSE (Task 2)
- 88326904e: buildDrmNativeParts and tests (Task 3)

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model.

## Notes

`gsd-sdk query requirements.mark-complete` reports REQUIREMENTS.md missing in this repo (known). `package.json` was not edited (56-10 owns `build:drm-native`).

## Self-Check: PASSED
