# lsteamclient pins (Phase 56 plan 02)

Human-readable copy of every pin in `meta/buildLsteamclient.ts`. The script is the authority; this
file is the record.

## Licence

These three overlay files and the built `lsteamclient.{dll,so}` are under the Steamworks SDK
License (`LICENSE` sha256 `80fda9147f8ee707cd18d1d6d71b307063fa3a02057a7c789de47f7c003510f1`,
fetched with Proton and copied beside the build outputs as `LICENSE.lsteamclient`). The
GameLib-authored trace blocks are contributed under the same terms so the component stays
single-licensed (D-02). GameLib's GPL-3.0-only code never links against these files: Wine loads
them at run time in a separate process (D-02, D-18). Valve's 3,133 files are fetched at build time
and never committed.

## Proton

- Commit: `164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca`
- Tarball: `https://codeload.github.com/ValveSoftware/Proton/tar.gz/164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca`
  (tarball bytes can change between downloads, so only the extracted tree is pinned)
- Extract: `*/lsteamclient/` with `--strip-components=2`
- Tree digest: `b286df1df46a70d9e2cc674676afcc6e08b1a56ce472e5add0932b86940657bf` over 3,133 files.
  Algorithm (NotProton `fetch.sh`): sha256 over every regular file in Python `sorted(pathlib.Path)`
  order, which compares the list of path segments (so `a/x` sorts before `a-b/x`); per file, update
  with `sha256(utf8(relpath)).digest()` then `sha256(bytes).digest()`; output the hex digest.

## NotProton overlay

- Upstream `NotProtonNot/NotProton` @ `8db22adb237e6ea640a5af148b69b93709daf50c`, path `lsteamclient/`.
- Gcenx fork @ `c09e0c4411518637a5f5979cd97c6833c92ed139` carries byte-identical copies.

| File                          | Upstream sha256                                                    |
| ----------------------------- | ------------------------------------------------------------------ |
| `steamclient_main.c`          | `9c0762a90c3d32abf1a1f953da913913618acb138cabf1f4bca8628a0d3d4ab0` |
| `unixlib.cpp`                 | `e219bba2d8af9f0ac9cbdae60bf1bc176b446cd3d89d4322bc06f29e99c323a1` |
| `unix_steam_input_manual.cpp` | `3f9e3390a9c4b060a367a312d61f84fc3690141ef34811484b3c21481d7583a7` |

- `unixlib.cpp` and `unix_steam_input_manual.cpp` are committed byte-for-byte.
- GameLib `steamclient_main.c` sha256 (as committed): `b59c4e88e55dd4330d3b9a5b0fc9901391f189550d5b05b01c41ab71b8d989e1`.
- Strip rule: deleting every block from a line whose trimmed content is
  `/* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */` through the line whose trimmed content is
  `/* GAMELIB-DRM-TRACE END */`, marker lines included, reproduces the upstream bytes exactly. There
  are exactly five blocks (provenance, trace helpers, DllMain hook, steamclient_call hook,
  CreateInterface hook).
- Known deviation: upstream `fetch.sh` also copies
  `steamworks_sdk_165x/isteamnetworkingsocketsserialized.h` and applies `serialized005.patch`
  (NotProton commit `1893a3a`, 2026-10-17). It adds `SteamNetworkingSocketsSerialized005`, which none
  of the three overlay files references; the Gcenx fork carries neither. GameLib does not carry them
  (D-01 names exactly three overlay files; the patch serves NotProton's Steam-side half). This may
  differ from the configuration 044 most likely ran. Lead for 56-15: a Wine log naming
  `SteamNetworkingSocketsSerialized005`.

## Bases (D-19)

- CrossOver drop (tried first): `https://media.codeweavers.com/pub/crossover/source/crossover-sources-26.3.0.tar.gz`,
  149,054,023 B, sha256 `ac99c8ca4b3848f3e81784135f023df266b61c2345726ea55a50b3e030dd6872`. Wine
  tree `sources/wine/`, `VERSION` reads `Wine version 11.0`.
- Stock Wine (fallback only): tag `wine-11.15` @ `2df1ee28039cf84776eb1421ed90bd154cebb65f` from
  `https://gitlab.winehq.org/wine/wine.git`. 044 proved this configuration.
- Registration (both bases): `enable_lsteamclient` after `enable_localui` in `configure`, and
  `wine_fn_config_makefile dlls/lsteamclient enable_lsteamclient` after
  `wine_fn_config_makefile dlls/localui/tests enable_tests`. `programs/steam.exe` is not registered
  (56-03 builds the helper with zig).

## Prerequisites

`brew install mingw-w64 bison`, on the build host only. `bison` must be version 3 or later; the
system bison 2.3 is too old. `flex`, `make`, `git`, `tar`, `lipo`, `codesign` and `otool` come from
macOS or Xcode CLT.

## Build

`pnpm build:lsteamclient --base crossover|wine [--build 26.3.0.39832] [--out <dir>] [--work <dir>]`
and `--check`. It is operator-run, never in release CI, never on a user's machine (D-01). Output:
`build/steamclient-layer/steamclient-layer-cx<build>/` (gitignored, never signed).

## Build result

Date: 2026-10-28. Base that shipped: stock Wine, tag `wine-11.15` @
`2df1ee28039cf84776eb1421ed90bd154cebb65f`.

D-01 amended per D-19: built against stock wine-11.15 @ 2df1ee28… because the CrossOver 26.3.0 drop
failed at `make dlls/lsteamclient/x86_64-windows/lsteamclient.dll`: its `tools/makedep.c` has no
`.cpp` parser (only `.c .h .inl .l .m .rh .x .y`), so the `#pragma makedep unix` in the
`cpp*.cpp` files is ignored, they are built as PE objects, and mingw rejects
`steamclient_structs.h:76` ("template argument 1 is invalid"). Fixing that would need a change to
CrossOver's sources, which D-19 forbids. 044 proved this Wine 11.15 configuration on the CX 26.3
runner.

| Output             | Size (B)   | sha256                                                             |
| ------------------ | ---------- | ------------------------------------------------------------------ |
| `lsteamclient.dll` | 33,904,653 | `22bb19413ce1f66c771c2d54260f6811480375db66c74e60c66a02d307b5cb76` |
| `lsteamclient.so`  | 2,388,896  | `dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d` |

Toolchain: mingw-w64 14.0.0 (`x86_64-w64-mingw32-gcc` GCC 16.2.0), Apple clang 21.0.0
(clang-2100.3.34.2), GNU Bison 3.8.2 (Homebrew).
