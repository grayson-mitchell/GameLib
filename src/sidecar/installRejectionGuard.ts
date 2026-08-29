/**
 * Side-effect-only module whose sole job is to be the FIRST import of
 * `src/sidecar/index.ts` (Phase 34.2 gap cycle 1, WR-04 — closed 2026-08-23).
 *
 * SCOPE (Phase 35, D-35-10-01). This file now installs BOTH of the sidecar's
 * process-level guards: `unhandledRejection` (34.2) and `uncaughtException` (the
 * replacement for the `main.ts:618` handler that plan 35-14 deletes). The FILENAME
 * is deliberately left as `installRejectionGuard.ts` and is therefore narrower than
 * its contents: it is the first-import position that is load-bearing here, gated by
 * a source-text assertion on this exact path in `sidecarRejectionGuard.test.ts`
 * Group 3, and a rename buys nothing while touching a boot-ordering invariant whose
 * only real check is `pnpm smoke:sidecar`. Read it as "install the process guards".
 * Both guards need the same first-import position, for the same reason: a throw or
 * a rejection in any other module's scope must already be covered when it happens.
 *
 * WHY A SEPARATE FILE. `index.ts` used to call `installUnhandledRejectionGuard()`
 * as its first executable statement and claim in its docstring that the guard was
 * therefore live before `bootstrap.ts`'s module scope. That claim was false: ES
 * modules evaluate every static import before any statement in the importing body,
 * so `bootstrap.ts`'s entire graph had already run by the time the call happened.
 * Import ordering is the only ordering that exists at module scope, so the install
 * has to BE an import.
 *
 * WHY IT IS SAFE TO PUT FIRST, when two earlier attempts were not.
 * `backend/sidecar/processGuards` now has ZERO static imports (enforced by
 * `sidecarRejectionGuard.test.ts`'s zero-imports gate). Evaluating it therefore
 * pulls in no `backend/*` module, so `bootstrap.ts`'s `Module._load` electron hook
 * still installs before anything that calls `app.getPath()` — the exact invariant
 * attempt (a) broke (`727be5dbb`, `broken pipe (os error 32)`), and the reason
 * attempt (b) reordered the handler graph. The logger is late-bound instead:
 * `bootstrap.init()` installs the sink after `initLogger()`.
 *
 * DO NOT ADD AN IMPORT TO THIS FILE, and do not add one to `processGuards.ts`.
 * The invariant is checked by the zero-imports gate and by `pnpm smoke:sidecar`,
 * which runs the real bundled sidecar — the only check that catches this class of
 * regression, since a green jest run and a clean `build:sidecar` both missed
 * attempt (a).
 */

import {
  installUncaughtExceptionGuard,
  installUnhandledRejectionGuard
} from 'backend/sidecar/processGuards'

installUnhandledRejectionGuard()
installUncaughtExceptionGuard()
