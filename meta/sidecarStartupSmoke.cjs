#!/usr/bin/env node
/**
 * Sidecar startup smoke gate.
 *
 * Exists because of a REAL regression on 2026-08-23 (`727be5dbb`): a one-line
 * import reorder in `src/sidecar/index.ts` made the sidecar die on boot with
 * `ERR_INVALID_ARG_TYPE: The "path" argument must be of type string`, which the
 * user saw as `broken pipe (os error 32)` from the Tauri shell.
 *
 * Nothing in the existing toolchain caught it:
 *
 *   - all 176 backend jest suites stayed GREEN;
 *   - `pnpm build:sidecar` exited 0 — the bundle builds fine, it just cannot run;
 *   - `tsc --noEmit` exited 0;
 *   - even a bundle byte-offset check "confirming" module emission order passed,
 *     because emission order says nothing about whether the process survives.
 *
 * The sidecar's whole failure mode is evaluation-order-dependent: module scopes
 * run in import order, and `bootstrap.ts` must install its `Module._load` hook
 * before any `backend/*` module is evaluated. That is invisible to unit tests by
 * construction, because jest supplies its own module registry.
 *
 * So the gate is the crude thing that actually works: BUILD IT AND RUN IT.
 * Costs about a second.
 *
 * WHAT "PASS" MEANS, precisely (corrected quick-260913-lkk). Exit 0 on its own
 * proves NOTHING: `installUncaughtExceptionGuard()` holds a sidecar that died
 * during module evaluation at exit 0. This header used to claim "Exit 0 = the
 * sidecar reached its RPC loop", and for the weeks between that guard landing
 * (D-35-10-01, Phase 35) and quick-260913-lkk that claim was false — a measured
 * negative control killed the sidecar outright and the gate printed PASS.
 *
 * PASS now requires the CONJUNCTION: it built, it did not time out, it exited 0,
 * it wrote the READY sentinel to stdout, and it swallowed no early-boot fault.
 * The sentinel is the load-bearing one — it is the only signal here that a dead
 * process cannot produce.
 *
 * ── DELIBERATELY EXEMPT from the fake-HOME two-profile rule ────────────────
 * (quick-260913-arr; see CLAUDE.md, "Fake-HOME isolation for direct binary
 * runs".) That convention says every run whose purpose is not
 * profile-dependent must spawn with an isolated, disposable fake profile.
 * THIS GATE IS THE NAMED EXCEPTION. The `spawnSync` below passes NO `env` key
 * and therefore inherits the operator's real, populated profile. That is
 * deliberate, and it is the point of the gate.
 *
 * THE REASON: this gate exists to catch profile-dependent startup hangs, and
 * a hang that only arms under a populated profile is invisible under an empty
 * one. The `major` defect quick-260913-901 fixed is exactly that shape -- an
 * un-`unref()`-ed 5-minute `setInterval` created by `setPresence()` at
 * `gog/presence.ts:39`, reachable only behind `GOGUser.isLoggedIn()`.
 * Measured the same day, on the same tree, with the same command:
 *
 *   real HOME              -> NEVER EXITS (no exit at 120s, reproduced twice)
 *   cold empty fake HOME   -> exit 0 in 27.7s
 *
 * Under an empty profile `isLoggedIn()` is false, the interval is never armed,
 * and the process exits cleanly. Isolating this gate would therefore have made
 * it permanently, confidently GREEN against a defect that blocked every PR to
 * `main`/`stable`. A gate that cannot see the class of failure it was built
 * for is worse than no gate, because it also carries a green check.
 *
 * SO: anyone adding an `env` key here is removing this gate's ability to see
 * the class of defect it exists for. Read the reasoning above first, and the
 * `260913-901` evidence, before doing it.
 *
 * This exemption has a machine-readable twin: the `EXEMPTIONS` entry in
 * `src/backend/__tests__/fakeHomeIsolation.test.ts`. That gate re-reads THIS
 * file and asserts an anchor phrase from its reason is still present here, so
 * the two cannot drift apart -- a stale exemption is how a gate rots into a
 * silent free pass.
 */
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const REPO_ROOT = join(__dirname, '..')
const BUNDLE = join(REPO_ROOT, 'build', 'main', 'sidecar.js')
const STARTUP_TIMEOUT_MS = 30_000

/**
 * The line `bootstrap.init()` writes to stdout once it has finished — the gate's
 * real success signal. HARDCODED, and it has to be: this file is CommonJS, run
 * straight off disk by `node`, so it cannot require the TypeScript export
 * `READY_SENTINEL` from `src/common/types/sidecarTransport.ts`.
 *
 * That duplication is bound rather than trusted. `sidecarRejectionGuard.test.ts`
 * (Group 3) re-reads THIS file and asserts the value below still equals that
 * export, so renaming or retyping the sentinel cannot silently disarm the gate.
 */
const READY_SENTINEL = '__GAMELIB_SIDECAR_READY__'

/**
 * The exact prefix `installUncaughtExceptionGuard()` writes to stderr while the
 * log sink is still null — `processGuards.ts:274`, a hardcoded non-interpolated
 * literal there for the same reason it is one here.
 */
const UNCAUGHT_EXCEPTION_PREFIX = '[sidecar] uncaught exception:'

function fail(message, extra) {
  console.error(`\n[sidecar-smoke] FAIL: ${message}`)
  if (extra) console.error(extra)
  process.exit(1)
}

const build = spawnSync('pnpm', ['build:sidecar'], {
  cwd: REPO_ROOT,
  encoding: 'utf-8'
})
if (build.status !== 0) {
  fail('pnpm build:sidecar did not exit 0', build.stderr || build.stdout)
}
if (!existsSync(BUNDLE))
  fail(`bundle missing at ${BUNDLE} despite a successful build`)

// No stdin: the RPC loop sees EOF immediately and shuts down. A healthy sidecar
// exits 0 -- but so does a DEAD one. This comment used to say "one that dies
// during module evaluation exits non-zero with the throwing module named in its
// stack"; that stopped being true when `installUncaughtExceptionGuard()` landed,
// because registering any `uncaughtException` listener suppresses Node's default
// non-zero exit. So the `run.status` arm below is a NECESSARY condition only, and
// the READY arm after it is what actually separates a live sidecar from a corpse.
const run = spawnSync(process.execPath, [BUNDLE], {
  cwd: REPO_ROOT,
  encoding: 'utf-8',
  timeout: STARTUP_TIMEOUT_MS
})

if (run.error && run.error.code === 'ETIMEDOUT') {
  fail(
    `the sidecar did not exit within ${STARTUP_TIMEOUT_MS}ms of stdin EOF. It is ` +
      'hanging at startup rather than crashing, which is its own defect.'
  )
}
if (run.status !== 0) {
  fail(
    `the sidecar exited ${run.status} at startup. It builds but cannot run — ` +
      'almost always an import/evaluation-ORDER problem, not a type error. See ' +
      'the memory note `sidecar-guard-first-import-breaks-electron-hook`.',
    run.stderr
  )
}

// THE REAL SIGNAL (quick-260913-lkk). Everything above this line can be satisfied
// by a completely dead sidecar, and was: the negative control recorded in
// quick-260913-901 put a module-scope `throw` in `bootstrap.ts`, and this gate
// printed PASS. The reason is that `installUncaughtExceptionGuard()` catches a
// module-evaluation throw, logs it, and lets the process exit 0 on stdin EOF
// (`processGuards.ts`) -- registering ANY `uncaughtException` listener suppresses
// Node's default non-zero exit. That guard is CORRECT and must not be weakened;
// the defect was this gate's choice of signal. So assert something the guard
// cannot forge: `init()` ran to completion and wrote the READY sentinel.
if (!(run.stdout || '').includes(READY_SENTINEL)) {
  fail(
    `the sidecar exited ${run.status} but never wrote ${READY_SENTINEL} to stdout, ` +
      'so `bootstrap.init()` never reached its end — the process was dead on arrival. ' +
      'THE EXIT CODE IS NOT THE SIGNAL for this failure class: the uncaughtException ' +
      'guard keeps a dead sidecar at 0. Almost always an import/evaluation-ORDER ' +
      'problem. The swallowed stack follows.',
    run.stderr
  )
}

// Faults the guard swallowed during EARLY boot. Scope, stated rather than implied:
// the guard only writes to stderr while its log sink is null, i.e. before
// `bootstrap.init()` installs it (`bootstrap.ts:786`). After that point a swallowed
// fault goes to the logger, not to stderr, so this arm does NOT see faults occurring
// between there and the READY write at `bootstrap.ts:1256`. What it does cover is the
// module-evaluation window -- the class this gate exists for -- where a fault can
// leave a half-initialised process that still reaches READY and still exits 0.
// Measured quick-260913-lkk: four consecutive clean boots against the operator's real
// profile emitted ZERO stderr bytes, so any occurrence here is a real fault, not noise.
if ((run.stderr || '').includes(UNCAUGHT_EXCEPTION_PREFIX)) {
  fail(
    'the sidecar reached READY, but its uncaughtException guard swallowed at least ' +
      'one fault during early boot. The process survives in a partly-initialised ' +
      'state and still exits 0, so no exit code will ever report this.',
    run.stderr
  )
}

console.log(
  `[sidecar-smoke] PASS: built, started, wrote ${READY_SENTINEL}, no swallowed ` +
    'early-boot fault, exited 0 on stdin EOF.'
)
