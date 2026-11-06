---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 02
subsystem: bridge-drm-mode
tags: [lsteamclient, wine-11.15, mingw-w64, drm-trace, steamworks-licence]
requires: []
provides:
  - build:lsteamclient pipeline (meta/buildLsteamclient.ts)
  - gated lsteamclient.dll (PE x86_64) and lsteamclient.so (Mach-O x86_64) in the gitignored component staging dir
  - D-15/D-16 [drm-trace] writer inside steamclient_main.c
affects: [56-03, 56-05, 56-10, 56-12, 56-15]
tech-stack:
  added: []
  patterns: ["strippable GAMELIB-DRM-TRACE blocks over a sha-pinned upstream file", "fake-HOME spawn per build step"]
key-files:
  created:
    - native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c
    - native/steam-bridge/steamclient-layer/lsteamclient/unixlib.cpp
    - native/steam-bridge/steamclient-layer/lsteamclient/unix_steam_input_manual.cpp
    - native/steam-bridge/steamclient-layer/lsteamclient/PINS.md
    - meta/buildLsteamclient.ts
    - meta/__tests__/buildLsteamclient.test.ts
  modified:
    - package.json
key-decisions:
  - "D-01 amended per D-19: built against stock wine-11.15 @ 2df1ee28039cf84776eb1421ed90bd154cebb65f because the CrossOver 26.3.0 drop failed at make dlls/lsteamclient/x86_64-windows/lsteamclient.dll"
  - "DEFAULT_LSTEAMCLIENT_BASE flipped to wine"
  - "Unix half linked with -Wl,-S so the debug map carries no build-host object paths"
requirements-completed: [D-01, D-02, D-15, D-16, D-19]
duration: ~35 min
completed: 2026-10-28
---

# Phase 56 Plan 02: lsteamclient build and D-15/D-16 trace Summary

GameLib now builds its own `lsteamclient.{dll,so}` (x86_64) from digest-pinned Proton plus NotProton's three overlay files and five strippable `[drm-trace]` blocks, through the operator-run `pnpm build:lsteamclient`. The shipped base is stock Wine 11.15, because the CrossOver 26.3.0 drop cannot build it.

## D-19 outcome (verbatim)

`D-01 amended per D-19: built against stock wine-11.15 @ 2df1ee28… because the CrossOver 26.3.0 drop failed at make dlls/lsteamclient/x86_64-windows/lsteamclient.dll: its tools/makedep.c has no .cpp parser, so the #pragma makedep unix in the cpp*.cpp files is ignored, they are built as PE objects, and mingw rejects steamclient_structs.h:76 ("template argument 1 is invalid").` 044 proved the Wine 11.15 configuration on the CX 26.3 runner.

- Time box: attempt 1 started 04:17:15Z (after the one-off 149 MB download) and failed at 04:18Z; the Wine 11.15 fallback started 04:21Z and passed at about 04:25Z. Total wall time on the build was well inside the 90-minute box.
- Fix iterations used on the CrossOver attempt: 1 configure/flag-level iteration was not applicable. The failure is in CrossOver's own `tools/makedep.c`, which D-19 forbids changing. The two other re-runs were defects in my own script and overlay (see Deviations), not configure changes.

## Outputs (56-10 pins these)

Location: `build/steamclient-layer/steamclient-layer-cx26.3.0.39832/` (gitignored, unsigned), plus `LICENSE.lsteamclient` (sha `80fda914…10f1`) and the build record `build/steamclient-layer/lsteamclient-build-cx26.3.0.39832.json`.

| Output | Size (B) | sha256 |
| --- | --- | --- |
| `lsteamclient.dll` | 33,904,653 | `22bb19413ce1f66c771c2d54260f6811480375db66c74e60c66a02d307b5cb76` |
| `lsteamclient.so` | 2,388,896 | `dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d` |

Toolchain: mingw-w64 14.0.0 (gcc 16.2.0), Apple clang 21.0.0, GNU Bison 3.8.2, all Homebrew core, installed with `brew install mingw-w64 bison`. `--check` prints `Output gate PASSED (56-02)`. The sizes sit within 0.2% / 0.3% of the 044 artifacts.

## Pins recorded

- Proton `164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca`, tree digest `b286df1df46a70d9e2cc674676afcc6e08b1a56ce472e5add0932b86940657bf` (verified live by the build).
- NotProton `8db22adb237e6ea640a5af148b69b93709daf50c`: `steamclient_main.c` `9c0762a9…4ab0`, `unixlib.cpp` `e219bba2…23a1`, `unix_steam_input_manual.cpp` `3f9e3390…83a7`. GameLib `steamclient_main.c` sha `b59c4e88e55dd4330d3b9a5b0fc9901391f189550d5b05b01c41ab71b8d989e1`.
- `serialized005.patch` / `steamworks_sdk_165x/isteamnetworkingsocketsserialized.h` are deliberately NOT carried (D-01 names three overlay files; none references `SteamNetworkingSocketsSerialized005`). This may differ from the configuration 044 ran. Lead for 56-15: a Wine log naming `SteamNetworkingSocketsSerialized005`.

## A2 status (handed to 56-15)

Wine 11.15 shipped, so A2 (the CX-drop `.so` works on the CX 26.3 runner) is moot. The residual question for 56-15 is the same 044 configuration without the serialized005 patch.

## Commits

- b7ce09343: overlay files and PINS.md (Task 1)
- 0a9c01423: buildLsteamclient pipeline, tests, package script (Task 2)
- 51e14ed75: fix CreateInterface trace hook condition
- 1f72a95a2: wine-11.15 build, -Wl,-S, gate fix, PINS build result (Task 3)

## Deviations from Plan

**1. [Rule 1 - Bug] CreateInterface hook condition did not compile**
- **Found during:** Task 3 (first PE compile)
- **Issue:** The plan's `if (params._ret) gamelib_trace_create_interface( name );` fails because `_ret` is a `struct u_iface`.
- **Fix:** `if (params._ret.handle) ...`. Semantics are identical (the same `.handle` test `create_win_interface` makes). Strip check still yields `9c0762a9…4ab0`. PINS.md updated with the new GameLib sha.
- **Commit:** 51e14ed75

**2. [Rule 1 - Bug] CrossOver tarball layout assumption**
- **Issue:** The drop's entries start at `sources/`, not `<top>/sources/`.
- **Fix:** extract `sources/wine` with `--strip-components=2`; srcDir is the extract dir.

**3. [Rule 2 - Missing critical] Unix link leaked build-host paths**
- **Found during:** Task 3 gates (the output gate did its job)
- **Issue:** the linker's debug map embedded the absolute `.o` paths (including the home dir) in `lsteamclient.so`.
- **Fix:** link with `-Wl,-S`; test updated. Also the otool gate now ignores the unindented header line (it names the file itself and false-positived).
- **Commit:** 1f72a95a2

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model.

## Notes

`gsd-sdk query requirements.mark-complete` reports REQUIREMENTS.md missing in this repo (known). `pnpm planning-gates` was not touched. The two downloaded tarballs and work dir live in `build/lsteamclient-work/` (gitignored).

## Self-Check: PASSED
