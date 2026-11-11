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
 * Deliberately a thin, unconditional entry: all the load-bearing
 * ordering lives in `backend/sidecar/bootstrap.ts`'s module scope, executed the
 * moment this file imports it — `init()` only starts the RPC loop and
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
 * by the time it ran. The install is therefore done by an IMPORT (the module builds and installs the one
 * guards instance, exported as `guards` and passed to `init({ guards })`), and
 * `import { guards } from './installRejectionGuard'` MUST stay the first import line in this file.
 * `sidecarRejectionGuard.test.ts` Group 3 gates exactly that.
 *
 * Two earlier attempts to fix this broke the build, both because
 * `processGuards.ts` still imported `logWarning` from `backend/logger` and so
 * dragged the backend graph into evaluation ahead of the platform layer:
 *
 *   (a) a guards import first in THIS file — `app.getPath()` returned
 *       undefined and the sidecar died on boot, surfacing to the user as
 *       `broken pipe (os error 32)` (`727be5dbb`).
 *   (b) the import inside `bootstrap.ts` after the platform setup —
 *       sidecar started, but `installFlows.test.ts` Test 1b failed
 *       deterministically with "Cannot read properties of undefined (reading
 *       'map')": the handler graph initialised in a different order.
 *
 * What makes this third attempt work is that `processGuards.ts` now has ZERO
 * static imports and late-binds its logger through
 * the sink setters, which the boot logger step calls on the instance
 * passed to `init({ guards })` after `initLogger()`. Adding any import to `processGuards.ts` or to
 * `installRejectionGuard.ts` reintroduces (a).
 *
 * Gate any change to this file's import order on `pnpm smoke:sidecar`. Attempt
 * (a) passed 176 green jest suites, `build:sidecar`, `tsc`, and a bundle
 * byte-offset check before a user's broken build caught it.
 */

import { guards } from './installRejectionGuard'
import { init } from 'backend/sidecar/bootstrap'

init({ guards })
