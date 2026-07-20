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
 */

import { init } from 'backend/sidecar/bootstrap'

init()
