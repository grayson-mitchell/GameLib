---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 02
subsystem: infra
tags: [tauri, node-sea, esbuild, keyring, steam-user, pnpm-patch, packaging]

# Dependency graph
requires:
  - phase: 34-01
    provides: RED-by-design cargoFeatures.test.ts and buildSidecarSea.test.ts Wave-0 suites this plan turns GREEN
provides:
  - "src-tauri/Cargo.toml: keyring windows-native + sync-secret-service features (cross-platform safeStorage), tauri-plugin-updater + tauri-plugin-shell crates"
  - "meta/buildSidecarSea.ts: legacy 2-step Node SEA build script producing a genuinely self-contained per-OS sidecar binary at src-tauri/binaries/gamelib-sidecar-<triple>[.exe]"
  - "pnpm build:sidecar-sea script"
  - "meta/sidecarSeaFsShim.ts + patches/steam-user.patch + patches/lzma.patch: the fixes that make the SEA binary actually runnable standalone"
affects: [34-05-tauri-shell-config, 34-06-release-workflow, 34-07-manual-uat]

# Tech tracking
tech-stack:
  added:
    - "tauri-plugin-updater 2 / @tauri-apps/plugin-updater 2.10.1"
    - "tauri-plugin-shell 2 / @tauri-apps/plugin-shell 2.3.5"
    - "postject 1.0.0-alpha.6 (devDependency, SEA blob injection)"
  patterns:
    - "Node SEA legacy 2-step build (sea-config.json -> --experimental-sea-config -> copy node binary -> postject inject -> macOS strip+re-sign), mirroring meta/buildSteamBridgeShims.ts's argv-form-spawn / exported-pure-argv-builder / fail-loud-compile-gate / JEST_WORKER_ID-guard conventions"
    - "esbuild --alias to statically replace an Electron-only import (electron -> backend/sidecar/electronStub.ts) at build time for a SEA-only bundle, since SEA's require() bypasses Module._load entirely (a runtime monkeypatch, this repo's normal mechanism, has no effect inside a compiled SEA binary)"
    - "esbuild --inject preamble to monkeypatch a single well-known fs.readFileSync call for a third-party package's runtime-computed asset path, passthrough for everything else"
    - "pnpm patch for a third-party package whose require() specifier is computed at runtime (unbundleable by esbuild) but which always resolves to the same literal target in this project -- a behavior-neutral simplification to a static, bundleable require, following the repo's existing @types/node patch precedent"

key-files:
  created:
    - meta/buildSidecarSea.ts
    - meta/sidecarSeaFsShim.ts
    - patches/steam-user.patch
    - patches/lzma.patch
    - src-tauri/binaries/.gitignore
  modified:
    - src-tauri/Cargo.toml
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml

key-decisions:
  - "The SEA build bundles its OWN fully self-contained copy of the sidecar (bundleForSea(), no --packages=external) rather than reusing pnpm build:sidecar's dev/Electron output -- that existing script relies on a real node_modules sitting next to build/main/sidecar.js at runtime, which is fine for dev/Electron but fundamentally incompatible with SEA's built-ins-only require() restriction. Matches the plan's own 'extend, do NOT replace' constraint on build:sidecar."
  - "electron is resolved via esbuild --alias to backend/sidecar/electronStub.ts (a build-time static replacement) instead of the runtime Module._load hook this repo otherwise uses -- confirmed by direct testing that SEA's require() uses a special embedderRequire that bypasses Module._load entirely, so the runtime hook mechanism cannot reach a compiled SEA binary."
  - "electron-store is bundled (not left external) because it is a real, directly-reachable sidecar dependency (backend/electron_store.ts, sidecar/handlers.ts), not merely Electron-guarded -- confirmed unsafe to leave external once electron itself resolves cleanly via the alias."
  - "steam-user's and lzma's own internal runtime-computed require() calls (requireWithFallback('lzma-native','lzma'); require(path.join(__dirname,'src','lzma_worker.js'))) are patched via pnpm patch to the literal target they always resolve to in this project (lzma-native is never installed; __dirname is always the package's own directory) -- a behavior-neutral simplification, not a functional change, using the repo's existing pnpm.patchedDependencies mechanism."

requirements-completed: [REQ-34-03, REQ-34-07]

duration: ~50min
completed: 2026-07-24
---

# Phase 34 Plan 02: SEA Sidecar Build Script + Packaging Foundation Summary

**Node sidecar now compiles into a genuinely self-contained, hardware-verified Node SEA executable via a new `meta/buildSidecarSea.ts`, plus the keyring/updater/shell Rust and JS dependencies the shell needs for cross-platform packaging.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-07-24T15:15:00+12:00 (approx)
- **Completed:** 2026-07-24T15:49:43+12:00
- **Tasks:** 2
- **Files modified:** 9 (4 created new build/shim/patch files, 1 new `.gitignore`, 4 modified manifests)

## Accomplishments
- `src-tauri/Cargo.toml`'s `keyring` dependency now carries `apple-native` + `windows-native` + `sync-secret-service` (still pinned to major version 3), and `tauri-plugin-updater`/`tauri-plugin-shell` are declared dependencies; `cargo build` verified genuinely successful on macOS with the new features (no `libdbus`/`dbus-secret-service` compiled into the mac build -- confirmed via the build's compile log, not just "no error").
- `@tauri-apps/plugin-updater@2.10.1`, `@tauri-apps/plugin-shell@2.3.5` installed as dependencies; `postject` installed as a devDependency.
- `meta/buildSidecarSea.ts` authored: exports `buildSeaConfigPath`, `sidecarOutputPath`, `buildPostjectArgv`, `buildCodesignArgv` (pure, tested argv-builders), plus a fail-loud `main()` that bundles, generates the SEA blob, copies the running node binary, injects it, and (on macOS) strips/re-signs.
- `pnpm build:sidecar-sea` produces `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` (the host triple on this machine) end to end.
- **The compiled SEA binary was hardware-verified to actually run standalone** -- not just produced. Run with `PATH=/usr/bin:/bin` (no system Node), no `node_modules`, stdin held open (matching real Tauri sidecar usage): it starts, wires the RPC transport, runs the online-connectivity check, and prints `__GAMELIB_SIDECAR_READY__` with no crash.
- `pnpm test -- --testPathPattern="cargoFeatures|buildSidecarSea"` -- both suites green (17/17 tests). Full `pnpm test` run confirmed zero regressions from the `steam-user`/`lzma` patches (only the two OTHER, already-known-RED Wave-0 suites scoped to plans 34-05/34-06 -- `tauriConf.test.ts`/`releaseWorkflow.test.ts` -- remain red, as designed).

## Task Commits

1. **Task 1: Cargo.toml crates + keyring features; JS deps + install** - `0912daca` (feat)
2. **Task 2: meta/buildSidecarSea.ts + build:sidecar-sea script** - `bf70bb67` (feat)

**Plan metadata:** (pending -- this commit)

## Files Created/Modified
- `src-tauri/Cargo.toml` - keyring gains `windows-native`/`sync-secret-service`; adds `tauri-plugin-updater`/`tauri-plugin-shell`
- `package.json` - adds `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-shell`, `postject` (dev), `build:sidecar-sea` script
- `meta/buildSidecarSea.ts` - the Node SEA legacy-2-step build script (argv-builders + fail-loud `main()`)
- `meta/sidecarSeaFsShim.ts` - injected `fs.readFileSync` patch for `@doctormckay/steam-crypto`'s `system.pem` runtime-computed path read
- `patches/steam-user.patch` - replaces `requireWithFallback('lzma-native','lzma')` with a static `require('lzma')` in `cdn_compression.js`
- `patches/lzma.patch` - replaces `require(path.join(__dirname,'src','lzma_worker.js'))` with a static `require('./src/lzma_worker.js')`
- `pnpm-workspace.yaml` - registers both new `patchedDependencies` entries
- `src-tauri/binaries/.gitignore` - ignores compiled `gamelib-sidecar-*` binaries, keeps the directory tracked

## Decisions Made
See `key-decisions` in frontmatter. In short: the SEA bundle is deliberately independent from `pnpm build:sidecar`'s dev/Electron output (different self-containment requirements), `electron` is resolved via a build-time `--alias` rather than the repo's usual runtime `Module._load` hook (which cannot reach a SEA binary), and two small, behavior-neutral `pnpm patch`es fix third-party packages' runtime-computed `require()` calls that are fundamentally unbundleable by esbuild and unresolvable by Node SEA's built-ins-only `require()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SEA binary crashed at startup: `ERR_UNKNOWN_BUILTIN_MODULE: graceful-fs`**
- **Found during:** Task 2, running the freshly-compiled SEA binary for the plan's own "standalone smoke" acceptance criterion.
- **Issue:** `pnpm build:sidecar`'s `build/main/sidecar.js` (which the plan's `key_links` specified this SEA step should consume directly) is built with `--packages=external`, leaving every node_modules dependency as an unresolved `require('pkg')` call. This is fine for dev/Electron (real `node_modules` on disk) but SEA's runtime can only `require()` built-ins -- confirmed empirically that SEA's `embedderRequire` bypasses Node's normal `Module`/`Module._load` machinery entirely (not just "restricted", genuinely a different code path), directly contradicting 34-RESEARCH.md Pitfall 3's assumption that the dev bundle was already self-contained.
- **Fix:** `bundleForSea()` produces its own fully self-contained bundle (`build/main/sidecar-sea-bundle.js`, no `--packages=external`) specifically for the SEA path, leaving `build:sidecar`'s dev/Electron output untouched ("extend, do NOT replace").
- **Files modified:** `meta/buildSidecarSea.ts`
- **Verification:** Compiled binary progressed past this crash; further crashes (below) diagnosed and fixed in the same pass.
- **Committed in:** `bf70bb67` (Task 2 commit)

**2. [Rule 1 - Bug] SEA binary crashed at startup: `ERR_UNKNOWN_BUILTIN_MODULE: electron-store` (and, transitively, `electron`)**
- **Found during:** Task 2, same standalone smoke test, after fix #1.
- **Issue:** `electron-store` is a real, directly-reachable dependency of the sidecar's own code (`backend/electron_store.ts`, `sidecar/handlers.ts`), not merely Electron-guarded -- bundling it naively still crashes because its own top-level `require('electron')` becomes another unresolved SEA require. This project's usual fix for `electron`-only imports (a runtime `Module._load` monkeypatch, `installElectronHook.ts`) has zero effect inside a compiled SEA binary (confirmed: SEA's `embedderRequire` bypasses `Module._load`, per fix #1's finding).
- **Fix:** Used esbuild's `--alias:electron=./src/backend/sidecar/electronStub.ts` to statically replace every `electron` import/require (first-party AND inside bundled third-party code, incl. `electron-store`'s own) with this project's real, working Electron stub at BUILD time, then stopped marking `electron-store` external so it bundles cleanly too.
- **Files modified:** `meta/buildSidecarSea.ts`
- **Verification:** No more `electron`/`electron-store` crashes; `electronStub`'s real `app.getPath`/`ipcMain` implementations satisfy `electron-store`'s constructor without needing Electron.
- **Committed in:** `bf70bb67` (Task 2 commit)

**3. [Rule 1 - Bug] SEA binary crashed: `ENOENT: system.pem` (`@doctormckay/steam-crypto`)**
- **Found during:** Task 2, same standalone smoke test, after fix #2.
- **Issue:** `@doctormckay/steam-crypto` (a transitive `steam-user` dependency) reads its bundled public key via `readFileSync(__dirname + '/system.pem')` -- a runtime-computed path esbuild cannot statically inline as a bundled asset.
- **Fix:** Added `meta/sidecarSeaFsShim.ts`, injected via esbuild `--inject`, monkeypatching `fs.readFileSync` to serve the certificate's well-known public bytes directly for any path ending in `system.pem`, passthrough for everything else.
- **Files modified:** `meta/buildSidecarSea.ts`, `meta/sidecarSeaFsShim.ts` (new)
- **Verification:** No more `system.pem` crash.
- **Committed in:** `bf70bb67` (Task 2 commit)

**4. [Rule 1 - Bug] SEA binary crashed unconditionally at module load: `Cannot find module 'lzma'` / `Cannot find module '.../src/lzma_worker.js'`**
- **Found during:** Task 2, same standalone smoke test, after fix #3.
- **Issue:** Two more third-party runtime-computed `require()` calls, both executed unconditionally at module load (not lazily): `steam-user`'s `cdn_compression.js` calls `requireWithFallback('lzma-native', 'lzma')`, and the `lzma` package's own `index.js` calls `require(path.join(__dirname, 'src', 'lzma_worker.js'))`. Neither is statically bundleable by esbuild (computed specifier), and both are unconditionally reached the moment `steam-user` is required anywhere in the sidecar's module graph -- a guaranteed startup crash, not an edge case.
- **Fix:** Applied two `pnpm patch`es (following this repo's existing `@types/node` patch precedent, registered in `pnpm-workspace.yaml`'s `patchedDependencies`): `patches/steam-user.patch` replaces the dynamic fallback with a static `require('lzma')` (this project never installs the optional `lzma-native` native addon, so the fallback was always the path taken anyway); `patches/lzma.patch` replaces the computed worker path with a static `require('./src/lzma_worker.js')` (`__dirname` there is always the package's own directory, so this resolves identically). Both are behavior-neutral simplifications, not functional changes.
- **Files modified:** `patches/steam-user.patch` (new), `patches/lzma.patch` (new), `pnpm-workspace.yaml`
- **Verification:** The compiled SEA binary, run with `PATH=/usr/bin:/bin` and no `node_modules`, now starts cleanly and prints `__GAMELIB_SIDECAR_READY__` -- verified twice (once with stdin closed immediately, once with stdin held open matching real Tauri usage).
- **Committed in:** `bf70bb67` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 -- bugs found by direct empirical testing against a real compiled SEA binary, none assumed from research; 34-RESEARCH.md Pitfall 3 turned out to under-scope the actual self-containment requirement)
**Impact on plan:** All four fixes were required to make the plan's own stated must-have truth ("`pnpm build:sidecar-sea` produces a self-contained host-triple sidecar binary that runs without a system Node") actually true, rather than merely "produces a file." No scope creep beyond what correctness required; the plan's own acceptance criteria explicitly anticipated the standalone smoke test might not fully pass and allowed deferring it to 34-07 -- it now fully passes instead, which is strictly better for 34-05/34-06 downstream.

## Issues Encountered

Extensive iterative debugging was required to get the standalone smoke test from "binary produced" to "binary actually runs standalone" -- see the four Rule-1 fixes above for the full diagnostic trail (each crash was root-caused via direct reproduction under a `PATH`-scrubbed environment before being fixed, not guessed at).

## User Setup Required

None - no external service configuration required. (Note: `pnpm install` after pulling this commit will apply the two new patches automatically via pnpm's `patchedDependencies` mechanism -- no manual step needed, same as the existing `@types/node` patch.)

## Next Phase Readiness
- 34-05 (Tauri shell config: `tauri.conf.json`'s `externalBin`/`plugins.updater`) and 34-06 (CI release workflow) both now have a genuinely working, hardware-verified SEA sidecar binary to consume -- not just a file that happens to exist.
- `tauriConf.test.ts` and `releaseWorkflow.test.ts` remain RED as designed, scoped to 34-05/34-06 respectively -- confirmed unaffected by this plan's changes (full `pnpm test` run shows zero new failures beyond those two pre-existing, out-of-scope suites).
- The `patches/` directory now has 3 entries (`@types/node`, `steam-user`, `lzma`) -- any future `steam-user`/`lzma` version bump should re-verify these two patches still apply cleanly (`pnpm install` will fail loudly if a patch no longer applies, this is not a silent risk).
- macOS `aarch64-apple-darwin` is the only triple verified on real hardware this session (this machine). Windows/Linux SEA compiles are structurally identical (same `bundleForSea()`/`buildPostjectArgv`/codesign-only-on-darwin logic) but untested on real hardware here -- 34-06's CI matrix is the first place those triples will actually build.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

All 6 created/referenced files verified present on disk (`meta/buildSidecarSea.ts`,
`meta/sidecarSeaFsShim.ts`, `patches/steam-user.patch`, `patches/lzma.patch`,
`src-tauri/binaries/.gitignore`, this SUMMARY.md). All 3 commit hashes (`0912daca`,
`bf70bb67`, `fd3c4c78`) verified present in `git log --oneline --all`.
