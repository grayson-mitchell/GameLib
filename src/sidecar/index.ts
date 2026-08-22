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

// WR-04: MUST stay the first import. Installing the unhandledRejection guard is
// this module's only job, and importing it here — ahead of `bootstrap` — is what
// makes the guard live before bootstrap's module scope is evaluated. Moving or
// reordering this line silently reopens the gap; `sidecarRejectionGuard.test.ts`
// Group 3 pins the order.
import './installRejectionGuardFirst'
import { init } from 'backend/sidecar/bootstrap'
import { installUnhandledRejectionGuard } from 'backend/sidecar/processGuards'
import { runDecompressPoolSelfTest } from 'backend/storeManagers/steam/depot/decompressPoolSelfTest'

if (process.env.GAMELIB_SIDECAR_SELFTEST === 'decompress-pool') {
  void runDecompressPoolSelfTest().then((code) => process.exit(code))
} else {
  // Retained deliberately after the WR-04 fix, and now a NO-OP: the guard is
  // already installed by the side-effect import above, and
  // `installUnhandledRejectionGuard` is idempotent (`processGuards.ts:56`).
  // Kept as defence in depth for the case where the import above is dropped,
  // and because the Group 3 call-order assertion still reads it.
  installUnhandledRejectionGuard()
  init()
}
