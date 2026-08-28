---
created: 2026-08-28T19:40:06.304Z
title: "The Tauri macOS bundle is 786MB installed / 529MB DMG — `frontendDist: \"../build\"` brotli-embeds `build/bin` INTO the shell binary, and `bundle.resources` then ships all six platform trees again"
area: build
files:
  - src-tauri/tauri.conf.json:1 (frontendDist, bundle.resources)
  - vite.config.ts:104 (renderer outDir: 'build')
  - vite.config.ts:105-107 (the comment that already names the collision)
  - electron.vite.config.ts:56,68,82 (build/main, build/preload, build)
---

## Problem

Measured on `src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg`
(built 2026-08-28 22:54): **529MB DMG, 786MB installed.**

| Component | Size | Verdict |
| --- | --- | --- |
| `MacOS/gamelib-shell` | 221MB | 212MB of it is dead weight |
| `MacOS/gamelib-sidecar` | 162MB | Node 26 runtime (138MB) + 26MB blob — structural, not a bug |
| `Resources/build/bin` | 397MB | all six platform×arch trees; only `arm64/darwin` is reachable |
| `Resources/build` (locales, icon, preload, changelog) | ~5MB | fine |

### Cause 1 — `frontendDist` points at the shared `build/` directory

`src-tauri/tauri.conf.json` sets `"frontendDist": "../build"`. Tauri's codegen
brotli-compresses **every file under `frontendDist`** into the shell binary. But
`build/` is 446MB, because the renderer shares that directory with everything else
the build writes — `vite.config.ts:105` already says so in a comment:

```
351M  build/bin               <- every helper binary, every platform
 45M  build/main              <- the Electron main bundle, dead under Tauri
 26M  build/sidecar-prep.blob
 16M  build/assets            <- the ONLY part the webview serves
```

Proof from `size -m` on the shipped binary:

```
Section __text:   5,813,368     <- real Rust code: 5.8MB, entirely normal
Section __const: 222,423,384    <- 212MB of embedded assets
```

`strings` on that binary returns `/bin/x64/win32/gogdl.exe`,
`GalaxyCommunication.exe`, and
`/bin/arm64/darwin/legendary/_internal/python3.14/lib-dynload/_codecs_hk.cpython-314-darwin.so`.
The staging directory corroborates it:
`src-tauri/target/release/build/gamelib-shell-*/out/tauri-codegen-assets` is
379MB across 1198 entries.

Embedded assets are only servable to the webview over `tauri://` — nothing can
execute a helper binary from there. So this copy is 100% dead, and every helper
binary ships **twice**: once brotli'd into the executable, once (correctly) into
`Resources/build/bin`.

### Cause 2 — `bundle.resources` ships all six platform trees

`bundle.resources` maps `"../build/bin/": "build/bin"` wholesale. In the shipped
app: `arm64/darwin` 189M, `x64/win32` 52M, `x64/darwin` 44M, `arm64/win32` 38M,
`x64/linux` 37M, `arm64/linux` 35M. On an arm64 mac only the first is reachable.

### Minor

`build/bin/arm64/darwin/` contains Windows artifacts: `steam_api.pdb` (2.7M),
`steam_api.dll` (788K), `steam_api_shim.lib`.

## Solution

Two independent fixes. Sizes are uncompressed installed-footprint deltas.

**(1) Narrow `bundle.resources` to the host platform — ~208MB. Small, self-contained.**
Tauri v2 merges `tauri.<platform>.conf.json`, so the `build/bin/` resource map can
name only `arm64/darwin` (and `x64/darwin` if that leg ever returns — note
`phase-34-16-closed-partial-x64-retired`, Intel was dropped). Do this one first;
it does not touch any path-resolution code.

**(2) Repoint `frontendDist` at a renderer-only directory — ~212MB. Needs its own plan.**
Move `vite.config.ts:104`'s `outDir` from `build` to something like `build/renderer`
and point `frontendDist` there, so Tauri walks only the renderer output.

This is exactly the `publicDir` / `getAppPath` / chunking seam that has bitten this
project four times (the fourth killed Phase 34.5 — see the
`publicdir-getapppath-chunking` memory). `emptyOutDir: false` and
`preserveRunnerSymlinksPlugin()` at `vite.config.ts:106,125` exist because of that
sharing and must both be re-reasoned, not just carried across. Runtime helper-path
resolution lives in `src/backend/constants/paths.ts:67,108` and assumes `build/bin`.

**Target after both: ~330MB installed, roughly 150–200MB DMG.**

Below that the floor is architectural, not a defect: the Node sidecar (162MB) and
the PyInstaller onedir helpers (legendary 47M, nile 44M, gogdl 40M, comet 10M).
Heroic ships those same helpers, which is most of its 160MB. Going lower means
fetching helpers on first run instead of bundling them, or retiring the Node
sidecar for native Rust.

## Non-goals

- Do NOT treat the 162MB sidecar as in scope. It is a Node 26 SEA; 138MB of it is
  the runtime itself.
- Steam's 11MB installer is not a comparable baseline — that is a bootstrapper that
  downloads its runtime on first launch. The comparable target is Heroic's 160MB.
