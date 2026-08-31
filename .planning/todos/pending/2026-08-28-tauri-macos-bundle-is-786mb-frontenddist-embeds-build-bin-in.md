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

`build/bin/arm64/darwin/` contains Windows artifacts: `steam_api.pdb` (2.7M / measured
2,818,048 B in the quick-260901-8rm packaged-artifact census),
`steam_api.dll` (788K), `steam_api_shim.lib` (4,160 B). These are Windows build
byproducts of `meta/buildSteamBridgeShims.ts`, emitted alongside the arm64 helper
because the shim DLL itself is cross-compiled PE32 (it runs inside a Wine bottle,
not natively) even though the surrounding directory is otherwise a native-arm64
tree. **Kept as a SEPARATE follow-up item, deliberately not folded into fix (2)
below** — their removal is "stop emitting the .pdb/.lib at build time", a
`buildSteamBridgeShims.ts` compile-flag change, not a resource-mapping change. Fix
(1) below still ships them (they live inside the `arm64/darwin` directory entry
the macOS overlay carries wholesale) because narrowing WHICH platform ships a
directory is a different mechanism from narrowing WHAT that directory contains.

## Solution

Two independent fixes. Sizes are uncompressed installed-footprint deltas.

### Fix (1) — DONE, closed by quick-260901-8rm (2026-09-01)

Narrowed `bundle.resources` to per-platform overlays: the wholesale
`"../build/bin/": "build/bin"` entry was deleted from the base `tauri.conf.json`
(a platform overlay can only ADD/OVERRIDE a key onto the base, never remove one,
so shadowing it would not have worked) and replaced with three sibling files —
`src-tauri/tauri.macos.conf.json`, `tauri.windows.conf.json`, `tauri.linux.conf.json`
— each carrying only the `bin/{arch}/{platform}` trees that platform needs, plus
the two `x64/win32` Wine exes macOS and Linux copy into a Wine prefix with no
platform guard (`legendary/games.ts:919-937`, `launcher.ts:927`).

**Proof, on a real packaged artifact** (`pnpm tauri:dev:packaged`, DMG mounted
read-only since Tauri deletes the intermediate `.app` when only the `dmg` target
is requested — see `260901-8rm-MEASUREMENTS.md`):

- Shipped `Contents/Resources/build/bin`: 239,444 KB vs the repo's own unnarrowed
  `build/bin` at 367,160 KB — **saved ~124.7MB** on this run (below the plan's
  ~162MB estimate because this run's `arm64/darwin` also carries the freshly-built
  steam-bridge shim, which inflates the KEPT tree, not the removed one).
- `arm64/win32`, `x64/linux`, `arm64/linux` confirmed ABSENT from the shipped tree.
  `bin/x64/win32/` contains exactly the two Wine exes, nothing else.
- **The Tauri platform-config merge is confirmed a DEEP merge, not a shallow
  replace**: the base's `locales`/`changelog.json`/`webviewPreload.js`/`icon.png`
  all survived being merged with the bin-only-carrying macOS overlay.
- `__const` stayed at 235,074,112 bytes and `strings <shell> | grep -c
  'bin/x64/win32/gogdl.exe'` returned 1 — fix (1) demonstrably did not touch the
  `frontendDist` embedding fix (2) addresses below; the two fixes are independently
  attributable.
- Full numbers, including the 250MB `tauri-codegen-assets` staging-directory
  baseline that fix (2) must shrink: `260901-8rm-MEASUREMENTS.md`.
- Windows and Linux overlays are unexercised by any real build in this run —
  covered only by `packagingConfig.test.ts`'s merged-map config-level assertions.
  A real CI matrix run on those platforms has not happened yet.

### Fix (2) — Repoint `frontendDist` at a renderer-only directory — ~212MB, NOT YET PLANNED

This is a phase, not a quick task — see below for why. It is deliberately NOT
implemented by quick-260901-8rm; that plan's `scoped_out` frontmatter block
records the reasoning this section restates in full.

**Why the original one-line framing of this fix ("point `frontendDist` at a
renderer-only `build/renderer`") is FALSE as written.** `frontendDist` is not
merely "where index.html lives" — two live consumers resolve assets RELATIVE to
it, and would break silently in a packaged artifact only (a `pnpm tauri:dev` run
serves over `devUrl` and cannot see either failure — this is the same defect
shape as R-34.5-G1-PKG, paid for twice already):

- (a) `src/frontend/index.tsx:116` (this todo's original write-up cited
  `index.tsx:114`; the plan-checker's citation pass did not catch the 2-line
  drift) — i18next `HttpApi` `loadPath: 'locales/{{lng}}/{{ns}}.json'`, a relative
  URL served over `tauri://localhost/` from `frontendDist`. Move `frontendDist`
  without keeping `locales/` reachable from the new root and the packaged app
  loses EVERY translation.
- (b) `src/preload/api/tauriChildWindows.ts:177` — the About window is a
  `WebviewWindow` whose `url` is `'about.html?v=' + encodeURIComponent(version)`,
  also relative to `frontendDist`. `about.html` is a `public/` file that only
  reaches `build/` today via vite's implicit `publicDir` copy.

A "renderer-only" directory must therefore carry `index.html`, `assets/`,
`locales/` AND `about.html` at minimum. Whoever plans this must first enumerate
EVERY webview-reachable relative URL (i18n `loadPath`, every `WebviewWindow` url,
any relative `fetch` in renderer/preload, and anything `index.html` or
`about.html` themselves reference) rather than assuming that set is closed —
the two named above are the ones measured, not necessarily the only two.

**Why `publicDir` cannot simply move.** `build/bin`, `build/locales`,
`build/changelog.json`, `build/webviewPreload.js` and `build/icon.png` are the
SOURCE paths of `bundle.resources`, and they exist only because vite's implicit
`public/` -> `outDir` copy puts them there. Moving `outDir` moves that ~300MB
copy too. The mechanism, precisely: `paths.ts`'s runtime `publicDir` resolution
is NOT itself broken by an `outDir` move (packaged, it resolves
`Contents/Resources/build`, which `bundle.resources` populates by explicit
target regardless of where `frontendDist` points) — what breaks is the
repo-side `build/` tree those resource SOURCES read from at bundle time.

**Two candidate designs — pick by measurement, not by preference:**

- **D1 (the original framing):** `publicDir: false`, `outDir: build/renderer`,
  `frontendDist: ../build/renderer`, plus an explicit copy step producing BOTH
  the full `build/` tree (for `bundle.resources`, unchanged) and the
  webview-reachable subset inside `build/renderer/` (for the embed). Saves the
  full ~212MB. Largest blast radius — touches the outDir, the copy step, AND
  every consumer of the old `build/` root as a webview-relative base.
- **D2 (narrower, not yet costed):** leave `frontendDist: "../build"` alone and
  simply stop putting `bin/` into `build/` in the first place — `publicDir: false`
  plus an explicit copy that excludes `bin/`, with `bundle.resources` sourcing the
  runner trees straight from `../public/bin/...` while keeping the
  `build/bin/...` TARGET paths unchanged (so `paths.ts`'s packaged `publicDir`
  resolution needs no change at all). Nothing webview-reachable moves, so
  consumers (a) and (b) above cannot fire — smaller blast radius, but the open
  question that decides feasibility: **does Tauri's resource copier preserve
  symlinks?** `public/bin/*/darwin/*/` contains Python.framework symlinks, and
  Apple's framework layout requires `Versions/Current` to be a link or codesign
  fails with "bundle format is ambiguous". Under D2, `preserveRunnerSymlinksPlugin`
  (which currently runs as part of the vite build that populates `build/`,
  restoring symlinks vite's copy would otherwise flatten — 12 restored on the
  quick-260901-8rm packaging run) would no longer run over the `bin/` tree at
  all, since `bin/` would never pass through vite's `outDir` copy. Whether
  Tauri's own `bundle.resources` copier preserves symlinks when copying straight
  from `public/bin/` needs to be measured before D2 can be chosen.

**Five pinned assertions the fix must update** (each currently green; each would
go red under either design):

- `meta/__tests__/viteRendererConfig.test.ts:87-88` — pins
  `config.build?.outDir === 'build'` and `config.build?.emptyOutDir === false`.
- `src/backend/__tests__/packagingConfig.test.ts:257-277` (that region moved to
  `:388-404` after quick-260901-8rm's Task 1 added the merged-map assertions
  above it in the same file — re-locate by searching for the describe title
  `'vite.config.ts registers the runner-symlink preservation plugin (F-34.9-01)'`
  rather than trusting either line number) — pins that `vite.config.ts` imports
  AND calls `preserveRunnerSymlinksPlugin()` (F-34.9-01, deliberately still live).
- `src/backend/__tests__/releaseWorkflow.test.ts:437-530` — EXECUTES the release
  workflow's prune step (`PRUNE_STEP_NAME`, the describe block spans
  `:436-564`) against a synthetic fixture and asserts `build/index.html` survives.
- `.github/workflows/release-tauri.yml:422-428` — the prune step's own
  `test -f build/index.html` guard (line 425), which hard-fails the release job
  if `index.html` moves out from under `build/`.
- `vite.config.ts:106` — `emptyOutDir: false` exists only because `build/` is
  shared with non-renderer output today; re-reason it under whichever design is
  chosen (D1 changes what `outDir` even is; D2 changes what gets copied into it).

**How it must be proven:** `pnpm tauri:dev:packaged` (or a real release bundle),
never plain `tauri:dev` — the latter serves over `devUrl` and resolves no bundled
resource at all, so it cannot see either consumer (a) or (b) break. Baseline
recorded by quick-260901-8rm in `260901-8rm-MEASUREMENTS.md`: `__const` =
235,074,112 bytes, `strings <shell> | grep -c 'bin/x64/win32/gogdl.exe'` = 1,
`tauri-codegen-assets` staging dir = 250MB. Success = `__const` drops below
~30,000,000, the gogdl `strings` count becomes 0, and the packaged app still
renders a non-English locale AND opens the About window (both webview-reachable
consumers verified live, not just config-level).

**Target after both fixes: ~330MB installed, roughly 150–200MB DMG.**

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
- Do NOT fold the `steam_api.pdb` / `steam_api_shim.lib` removal into fix (2). See
  "Minor" above — different mechanism, separate item.
