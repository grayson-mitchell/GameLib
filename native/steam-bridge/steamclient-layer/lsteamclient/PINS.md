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
- GameLib `steamclient_main.c` sha256 (as committed): `6fab6375ae1afff6e3f4644440ca9c5fe108bd58a6e0e6279380dca93ce4f543` (was `389163118e...` before the GetAppBuildId fixup below).
- Strip rule: deleting every block from a line whose trimmed content is
  `/* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */` through the line whose trimmed content is
  `/* GAMELIB-DRM-TRACE END */`, marker lines included, reproduces the upstream bytes exactly. There
  are exactly seven blocks (provenance, trace helpers, DllMain hook, steamclient_call hook,
  CreateInterface hook, BGetCallback hook, GetAPICallResult hook). Blocks 6 and 7 (Phase 58 D-08)
  write `event=callback id=<n>` only for the closed callback id set {333, 337, 504, 505, 506, 510,
  513, 1202, 1203, 1221, 1251, 1252, 1281}, plus `resp=` on 504 and `state=` on 1221.
- Phase 58 D-08a (plan 58-08, operator decision "Extend the trace") extends blocks 2, 4 and 6 in place
  (the count stays seven). 1202 now carries `peer=<ordinal>` (P2PSessionRequest_t.m_steamIDRemote,
  needs a payload of at least 8 bytes, else the bare line). The `steamclient_call` hook adds
  `event=p2p op=accept peer=<ordinal> ok=0|1`, `op=send peer=<ordinal> bytes=<n>` (only when the
  send returned true) and `op=read peer=<ordinal> bytes=<n>` (only when the read returned true and
  both out-params are non-NULL), for ISteamNetworking 003 to 006 by name suffix. Params layout is the
  x86_64 PE struct; `_Static_assert` pins the 003/004 offsets against 006. Volume scheme: each key
  (1202 per peer; accept per peer and result; send and read per peer and zero/nonzero size) is written
  once, capped at 32 such lines per launch (`GAMELIB_TRACE_MAX_P2P`), inside the existing 256-line cap.
  Privacy (T-58-09 / D-08 restored, operator decision 2026-10-31): the trace carries NO SteamID.
  `peer=` is a per-launch ordinal (1, 2, ...) assigned on first sight of each distinct SteamID64 from a
  bounded, critical-section-protected table of 16 (`GAMELIB_TRACE_MAX_PEERS`); a full table writes
  `peer=overflow`, which the parser rejects so the census never counts it. The raw ID is used only for
  the lookup and is never formatted. This supersedes the note commit f3df38704 wrote here ("SteamID64
  is now written to the trace file"); that archive (raw IDs) is withdrawn and unpublished. The census
  checks equality on the ordinal, which is stable within one launch's process. Captures stay in `/tmp`
  and are never committed (56-SECURITY T-56-15-03).
- raft-drm-build-id-mismatch (2026-10-31) extends blocks 2 and 4 in place (the count stays seven).
  Block 4's `steamclient_call` hook calls `gamelib_apps_call`, which for `ISteamApps_..._GetAppBuildId`
  (007/008) replaces Mac Steam's answer with the `buildid` of `C:\Program Files (x86)\Steam\steamapps\appmanifest_<SteamGameId>.acf`
  when that file exists and parses; otherwise Mac Steam's answer stands. It runs whether or not tracing is
  enabled. Trace shape: `event=apps op=build-id|build-id-given ret=<int>` (two integers, no ID; the
  census parser ignores it). Audit: the Raft host trace shows only `GetAppBuildId` among ISteamApps
  calls, so `GetCurrentBetaName`, `BIsAppInstalled`, `GetAppInstallDir`, `BIsSubscribedApp`,
  `GetInstalledDepots` and `GetLaunchCommandLine` are deliberately not rewritten (no evidence a game needs it).
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
