/**
 * Sidecar process entry point (Phase 27 Plan 02).
 *
 * This is the literal file `pnpm build:sidecar` bundles to
 * `build/main/sidecar.js` (esbuild `--bundle --external:electron
 * --external:electron-store ... --outfile=build/main/sidecar.js
 * src/sidecar/index.ts`) and the Rust shell spawns as `node
 * build/main/sidecar.js` (`src-tauri/src/main.rs`, 27-01; overridable via
 * `GAMELIB_SIDECAR_ENTRY`).
 *
 * Deliberately a thin, unconditional entry: all the load-bearing shim
 * ordering (the `Module._load` hook, then the backend registration import)
 * lives in `backend/sidecar/bootstrap.ts`'s module scope, executed the
 * moment this file requires it — `init()` only starts the RPC loop and
 * signals READY. Kept separate from `bootstrap.ts` so tests can `require`
 * the bootstrap module without it auto-starting against the real
 * process.stdin/stdout (bootstrap.test.ts calls `init()` itself with
 * injected streams).
 *
 * ORDERING (Phase 34.2 Plan 09, T-34.2-39; corrected by gap cycle 1's WR-04 on
 * 2026-08-23). The `unhandledRejection` guard must be live before ANY other
 * module scope evaluates. ES modules evaluate every static import before any
 * statement in this body, so a CALL here — which is what this file used to do —
 * could never achieve that: `bootstrap.ts`'s whole graph was already evaluated
 * by the time it ran. The install is therefore a side-effect IMPORT, and
 * `'./installRejectionGuard'` MUST stay the first import line in this file.
 * `sidecarRejectionGuard.test.ts` Group 3 gates exactly that.
 *
 * Two earlier attempts to fix this broke the build, both because
 * `processGuards.ts` still imported `logWarning` from `backend/logger` and so
 * dragged the backend graph into evaluation ahead of `bootstrap.ts`'s
 * `Module._load` electron hook:
 *
 *   (a) side-effect import first in THIS file — `app.getPath()` returned
 *       undefined and the sidecar died on boot, surfacing to the user as
 *       `broken pipe (os error 32)` (`727be5dbb`).
 *   (b) side-effect import inside `bootstrap.ts` after the electron hook —
 *       sidecar started, but `installFlows.test.ts` Test 1b failed
 *       deterministically with "Cannot read properties of undefined (reading
 *       'map')": the handler graph initialised in a different order.
 *
 * What makes this third attempt work is that `processGuards.ts` now has ZERO
 * static imports and late-binds its logger through
 * `setUnhandledRejectionLogSink()`, which `bootstrap.init()` calls after
 * `initLogger()`. Adding any import to `processGuards.ts` or to
 * `installRejectionGuard.ts` reintroduces (a).
 *
 * Gate any change to this file's import order on `pnpm smoke:sidecar`. Attempt
 * (a) passed 176 green jest suites, `build:sidecar`, `tsc`, and a bundle
 * byte-offset check before a user's broken build caught it.
 *
 * Quick task 260817-pkx (debug/humankind-depot-full-stall.md): a second,
 * non-RPC entry branch. `GAMELIB_SIDECAR_SELFTEST=decompress-pool` runs a
 * synthetic VZ/LZMA decode round trip through `DecompressPool` and exits —
 * this lets a COMPILED SEA binary prove its worker_threads pool actually
 * spawns real workers (`resolveWorkerSpec()`'s SEA-asset path) without
 * needing a real game install to reach it. `runDecompressPoolSelfTest` is a
 * STATIC import (never `await import(...)`): ts-jest downlevels dynamic
 * imports through jest's own module registry, so a dynamic-import defect
 * that only exists in the esbuild-bundled SEA binary would be structurally
 * invisible to the jest suite (see MEMORY.md
 * jest-cannot-see-dynamic-import-defects). The RPC loop must NOT start in
 * self-test mode — stdout is the RPC pipe, and the self-test writes plain
 * `SELFTEST ...` lines to it.
 */

import './installRejectionGuard'
import { init } from 'backend/sidecar/bootstrap'
import { runDecompressPoolSelfTest } from 'backend/storeManagers/steam/depot/decompressPoolSelfTest'

if (process.env.GAMELIB_SIDECAR_SELFTEST === 'decompress-pool') {
  void runDecompressPoolSelfTest().then((code) => process.exit(code))
} else {
  init()
}
