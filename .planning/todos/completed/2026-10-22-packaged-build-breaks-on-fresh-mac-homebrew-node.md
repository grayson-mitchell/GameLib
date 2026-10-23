---
created: 2026-10-22
title: "Packaged build breaks on a fresh Mac: tauri:dev:packaged skips the SEA sidecar, and Homebrew's shared-libnode node can't be postject-injected"
source: phase 51-19 live-gate setup on a fresh Apple-silicon Mac (Homebrew node@22.23.4 installed 2026-10-22)
area: build
files:
  - package.json
  - meta/buildSidecarSea.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
severity: medium
platform: macos
ready: code
---

Two failures stacked up before the 51-19 live gates could start:

1. **`pnpm tauri:dev:packaged` never builds the bundled sidecar.** The script is
   `vite build && build:sidecar && build:decompress-worker-dev && tauri build --debug`, but
   `tauri.conf` bundles `binaries/gamelib-sidecar-aarch64-apple-darwin`, which only
   `pnpm build:sidecar-sea` produces. On a clean checkout, `src-tauri/binaries/` is empty and
   `tauri build` fails: `resource path binaries/gamelib-sidecar-aarch64-apple-darwin doesn't
   exist`. The shell wrapper exits 0 regardless, so the failure is easy to miss.
2. **`build:sidecar-sea` fails under Homebrew node.** Homebrew's `node` (`/opt/homebrew/bin/node`)
   is a 66 KB launcher linked against `@rpath/libnode.127.dylib`. The SEA fuse sentinel lives in
   libnode, not the executable. `buildSidecarSea.ts` copies `process.execPath` as the base binary
   (by design, so the base matches the blob's Node version), so postject finds no sentinel:
   `COMPILE GATE FAILED (D-06): postject exited 1:` with an empty stderr (postject prints to
   stdout). The gate worked around it by running the build with the official nodejs.org
   v22.23.4 darwin-arm64 binary (SHA-256 verified) first on PATH.

The same Homebrew-node cause fails 3 tests in `lzmaNativeSeaRealBuild.test.ts` (`postject exited
1`) on this machine. 2 more fail in `lzmaNativeBinding.test.ts`'s real-filesystem cases
(`sweepStaleExtractDirs` S11 and the R6 round trip: `Array.prototype.forEach called on null or
undefined`). All 5 reproduce at HEAD with no 51-19 changes applied. The R6/S11 cause is not yet
diagnosed and may be a separate environment difference.

Fix direction:
- Chain `build:sidecar-sea` into `tauri:dev:packaged`, or add a pre-flight that fails loudly when
  `src-tauri/binaries/` lacks the triple's sidecar.
- In `buildSidecarSea.ts`, detect a shared-libnode base binary (`otool -L` lists `libnode`, or
  the size is far below ~100 MB) and either fetch the official nodejs.org build for
  `process.version` (the cross-build path already does this, with SHA-256 checks) or fail with an
  actionable message. Also include postject's stdout in the error.
- Diagnose the two `lzmaNativeBinding` real-fs failures separately.

Also noted: the debug bundle's shell spawns the sidecar in dev mode
(`/opt/homebrew/bin/node <repo>/build/main/sidecar.js`), not the bundled SEA binary. So a "packaged
debug build" exercises the repo's `build/main/sidecar.js`; `pnpm build:sidecar` plus a restart is
enough to pick up a sidecar fix.

## Closed

Closed 2026-10-24, quick 261024-eg9.

1. `tauri:dev:packaged` now chains `pnpm build:sidecar-sea` (which runs `build:sidecar` first) before `tauri build --debug`, so a fresh checkout produces `src-tauri/binaries/gamelib-sidecar-<triple>`. The "wrapper exits 0 regardless" claim was measured: `pnpm exec tauri build --debug` with the sidecar missing exits 1 here, and nothing in-repo swallows it (plain `&&` chain, `.npmrc` is only `node-linker=hoisted`). The 0 seen in 51-19 came from the operator's wrapper (a pipe without pipefail), not the repo.
2. `meta/buildSidecarSea.ts` classifies `process.execPath` (`otool -L` / `ldd` for a `libnode.` library, size floor 20 MB as fallback). A shared-libnode base now uses the SHA-256-verified official nodejs.org build of `process.version` (`obtainOfficialNodeBinary`, renamed from `obtainCrossNodeBinary`); self-contained bases copy execPath as before. postject failures now include stdout. `pnpm build:sidecar-sea` verified under Homebrew node 22.23.4 (arm64 gate passed, ~140 MB binary); `lzmaNativeSeaRealBuild.test.ts` 3/3 pass.
3. R6/S11 root cause is a test-harness defect, not product: on Node 22.23.4 `fs.rmSync` is JS and lazily loads `internal/fs/rimraf`, which captures `fs.readdirSync` at load. R6's `jest.spyOn(nodeFs, 'readdirSync')` was active at the process's first real `rmSync`, so rimraf kept the spy wrapper, which returns undefined after `restoreAllMocks()`; later recursive `rmSync` then threw `forEach called on null or undefined` (R6 finally, S11 sweep and afterEach). Probed outside jest to confirm. Fixed by warming rimraf at module scope in `lzmaNativeBinding.test.ts` before any spy; 40/40 pass. The shipped sidecar installs no such spies, so production is unaffected.
