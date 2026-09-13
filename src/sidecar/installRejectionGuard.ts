/**
 * Side-effect-only module whose sole job is to be the FIRST import of
 * `src/sidecar/index.ts` (Phase 34.2 gap cycle 1, WR-04 — closed 2026-08-23).
 *
 * SCOPE (Phase 35, D-35-10-01; extended quick-260912-e6k). This file now installs
 * THREE things: the stdio error guards, then `unhandledRejection` (34.2), then
 * `uncaughtException` (the replacement for the `main.ts:618` handler that plan 35-14
 * deletes). The FILENAME is deliberately left as `installRejectionGuard.ts` and is
 * therefore narrower than its contents: it is the first-import position that is
 * load-bearing here, gated by a source-text assertion on this exact path in
 * `sidecarRejectionGuard.test.ts` Group 3, and a rename buys nothing while touching a
 * boot-ordering invariant whose only real check is `pnpm smoke:sidecar`. Read it as
 * "install the process guards". All three need the same first-import position, for the
 * same reason: a throw, a rejection, or a dead-pipe stream error in any other module's
 * scope must already be covered when it happens.
 *
 * ORDER WITHIN THIS FILE MATTERS (quick-260912-e6k). `installStdioErrorGuards()` is
 * called FIRST, ahead of both guards below, because it removes the escalation path
 * that used to feed a dead stdio pipe's write failure back into `uncaughtException`
 * as an unbounded 100%-CPU loop -- see that function's own doc comment in
 * `processGuards.ts` for the full mechanism. The other two guards must still be
 * installed for every OTHER uncaught exception or rejection; this ordering only
 * ensures the specific escalation path is closed before anything else runs.
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
 *
 * WHAT MAKES THAT SECOND CHECK REAL, and when it was briefly false
 * (quick-260913-lkk). `pnpm smoke:sidecar` catches this class only because it
 * asserts the sidecar wrote `READY_SENTINEL` to stdout. Do NOT read it as "a broken
 * sidecar exits non-zero, so CI goes red" — `installUncaughtExceptionGuard()`, which
 * THIS FILE installs, suppresses Node's default non-zero exit, so a sidecar that dies
 * in module evaluation still exits 0. Between that guard landing (D-35-10-01, Phase
 * 35) and quick-260913-lkk the gate's only signal WAS that exit code, which made the
 * paragraph above false: a measured negative control put a throw in `bootstrap.ts`'s
 * module scope, the sidecar was completely dead, and the gate printed PASS. Anyone
 * changing the gate's assertions is deciding whether this paragraph stays true.
 */

import {
  installStdioErrorGuards,
  installUncaughtExceptionGuard,
  installUnhandledRejectionGuard
} from 'backend/sidecar/processGuards'

installStdioErrorGuards()
installUnhandledRejectionGuard()
installUncaughtExceptionGuard()
