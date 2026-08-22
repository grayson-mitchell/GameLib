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
 * WR-04 (gap cycle 1) — THE ORDERING CLAIM BELOW IS NOT ACHIEVED, and two
 * attempts to achieve it both failed on 2026-08-23. Recorded here so nobody
 * spends a third afternoon on it without the constraint.
 *
 * The claim is true of the CALL order and false of the EVALUATION order: ES
 * modules evaluate every static import before any statement in this body, so
 * `bootstrap.ts`'s whole graph is already evaluated by the time the guard call
 * runs. Both fixes fail for the same root reason — `processGuards` imports
 * `logWarning` from `backend/logger`, so importing the guard early drags the
 * backend graph into evaluation earlier than the existing init sequence
 * tolerates:
 *
 *   (a) side-effect import first in THIS file — evaluates `backend/*` before
 *       `bootstrap.ts`'s `Module._load` electron hook, so `app.getPath()`
 *       returns undefined and the sidecar dies on boot (`727be5dbb`).
 *   (b) side-effect import inside `bootstrap.ts` after the electron hook —
 *       sidecar starts, but `installFlows.test.ts` Test 1b fails
 *       deterministically with "Cannot read properties of undefined (reading
 *       'map')": the handler graph initialises in a different order.
 *
 * Any third attempt must make the guard LOGGER-FREE first, so its import graph
 * touches no `backend/*` module. That is a real change: the tests asserting
 * `logWarning` is called would need rewriting.
 *
 * The gap is currently not observable — `src/backend` and `src/sidecar` contain
 * zero module-scope floating promises, so nothing can reject in the uncovered
 * window. That invariant is pinned by `sidecarRejectionGuard.test.ts`, and it
 * going red is the signal that this stops being theoretical.
 *
 * Whatever is attempted, gate it on `pnpm smoke:sidecar`. Attempt (a) passed
 * 176 green jest suites, `build:sidecar`, `tsc`, and a bundle byte-offset check
 * before it was caught by a user's broken build.
 *
 * Ordering (Phase 34.2 Plan 09, T-34.2-39): `installUnhandledRejectionGuard()` must run
 * BEFORE `init()` — the guard must be live before `bootstrap.ts`'s module scope and `init()`
 * can produce any rejection.
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

import { init } from 'backend/sidecar/bootstrap'
import { installUnhandledRejectionGuard } from 'backend/sidecar/processGuards'
import { runDecompressPoolSelfTest } from 'backend/storeManagers/steam/depot/decompressPoolSelfTest'

if (process.env.GAMELIB_SIDECAR_SELFTEST === 'decompress-pool') {
  void runDecompressPoolSelfTest().then((code) => process.exit(code))
} else {
  installUnhandledRejectionGuard()
  init()
}
