/**
 * Phase 34.9 gap cycle 4, plan 29. Closes C3-01 (34.9-REVIEW-CYCLE3.md): every
 * `package.json` script that compiled a `meta/*.ts` entry to a single
 * shared, script-name-keyed path in the project's cache directory (under
 * `node_modules`) and then ran it shared that ONE
 * path across every invocation of that script -- two concurrent invocations
 * of the same script raced on it, and the reviewer measured 100% silent
 * cross-contamination (one process's `node` reading the OTHER's freshly
 * compiled output) at exit 0 with no diagnostic. This wrapper removes the
 * shared mutable target entirely: every invocation compiles into its own
 * `fs.mkdtempSync`-created private directory, so there is nothing left to
 * race on.
 *
 * Deliberately a plain CommonJS `.cjs` file, NOT TypeScript and NOT bundled --
 * this is the bootstrap that compiles everything else, so it must run under
 * bare `node` with zero compilation of its own.
 *
 * Argv contract:
 *
 *   node meta/runTs.cjs [esbuild flags...] <entry.ts> [args forwarded to the script...]
 *
 * Parsing rule: walk `process.argv.slice(2)`; every leading token beginning
 * with `--` is an esbuild flag; the FIRST token not beginning with `--` is
 * the entry file; every token after the entry file is forwarded to the
 * compiled script unchanged. This is what makes
 * `pnpm verify:runner-bundle build --arch=arm64` work -- pnpm appends extra
 * args to the end of the whole resolved script string, which lands after the
 * entry file, and those trailing tokens are forwarded verbatim rather than
 * reinterpreted as esbuild flags.
 *
 * This wrapper adds exactly ONE esbuild flag of its own: `--outfile`. Every
 * other flag (`--bundle`, `--platform=node`, `--target=node21`/`node22`,
 * etc.) stays in `package.json` and is passed through verbatim -- per-script
 * flags differ (see 34.9-29-PLAN.md <interfaces>), and hardcoding any of them
 * here would make the next census of what each script actually does harder,
 * not easier.
 *
 * The compile-failure short-circuit property gap cycle 3 bought with `&&`
 * (`esbuild ... && node ...`, replacing a `| node` pipe whose exit code was
 * always the PIPELINE's last command, silently swallowing compile failures)
 * is preserved here, not regressed: if esbuild exits non-zero, `node` is
 * never spawned on the outfile.
 *
 * C4-01 (quick task 260814-u2u): this file previously installed no signal
 * handlers, so `kill -TERM <wrapper pid>` killed the wrapper via Node's
 * default disposition while the `spawnSync`-launched child was orphaned and
 * ran to completion unsupervised, leaking the private tmpdir for the whole
 * of that unsupervised run. Fixing that required moving BOTH the esbuild
 * step and the run step off `spawnSync` onto asynchronous `spawn`:
 * `spawnSync` blocks the event loop, so a `process.on('SIGTERM', ...)`
 * handler registered alongside it suppresses Node's default disposition
 * without the handler ever getting a turn to run -- the wrapper survives,
 * the handler never fires, and the operator's abort becomes a complete
 * no-op, which is strictly WORSE than the orphan-and-leak bug it was meant
 * to fix. Measured, not assumed, against this exact file. This is the fifth
 * such discovered-by-execution note in this file.
 */

'use strict'

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function parseArgv(argv) {
  const esbuildFlags = []
  let entry = null
  const forwardedArgs = []

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (entry === null) {
      if (token.startsWith('--')) {
        esbuildFlags.push(token)
      } else {
        entry = token
      }
    } else {
      forwardedArgs.push(token)
    }
  }

  if (entry === null) {
    throw new Error(
      'meta/runTs.cjs: no entry file found in argv (every token began with --): ' +
        JSON.stringify(argv)
    )
  }

  return { esbuildFlags, entry, forwardedArgs }
}

// Quick task 260906-hq8: decides HOW the resolved esbuild CLI is spawned.
// Mirrors buildEsbuildArgv() in meta/buildSidecarSea.ts, including the
// injectable `platform` default parameter -- that injection is not a
// convenience, it is what lets both branches be asserted from a single
// macOS/Linux test run instead of only the host's own platform (see
// meta/__tests__/runTs.test.ts and buildSidecarSea's own WR-06 note). Unlike
// buildEsbuildArgv(), the flags here come from argv rather than a fixed
// seaEsbuildFlags() call, so they are a parameter, not computed internally.
// Pure: no I/O, no closed-over mutable state, safe to require() and call
// from a test without touching the filesystem.
function buildEsbuildSpawnArgv(
  esbuildCli,
  esbuildArgs,
  platform = process.platform
) {
  if (platform === 'win32') {
    return { command: process.execPath, args: [esbuildCli, ...esbuildArgs] }
  }
  return { command: esbuildCli, args: esbuildArgs }
}

// Signals forwarded to the running child (C4-01). SIGTERM/SIGINT are the two
// the reviewer measured directly; SIGHUP is the terminal-closed case that
// produces the exact same orphan+leak shape. Nothing else is forwarded.
const FORWARDED_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP']

// Bounded escalation to SIGKILL if the child ignores the forwarded signal.
// Chosen over waiting indefinitely: an ignoring child would otherwise keep
// the destructive work (and the tmpdir) alive for that child's whole
// lifetime, and the wrapper would hang instead of aborting. Cleared on the
// child's 'close', never unref'd.
const KILL_ESCALATION_MS = 5000

function signalExitCode(sig) {
  const n = os.constants.signals[sig]
  return typeof n === 'number' ? 128 + n : 1
}

async function main() {
  const { esbuildFlags, entry, forwardedArgs } = parseArgv(
    process.argv.slice(2)
  )

  // C5-01: every binding the signal handlers below can reach is declared
  // and initialised HERE, before those handlers are registered, and before
  // the tmpdir they protect is created. A signal delivered in the window
  // between process start and `mkdtempSync` must find working handlers
  // already installed -- if it instead finds Node's default disposition
  // (no handler yet), the process is terminated immediately with NO 'exit'
  // event and NO chance for any cleanup to run (measured empirically: see
  // meta/__tests__/runTsSignals.test.ts T7). Before this fix, the handler
  // registration loop ran AFTER `mkdtempSync`, leaving exactly that window
  // open; a signal landing inside it leaked the tmpdir with nothing to show
  // for it. `tmpDir` is therefore a mutable `let` initialised to `null`
  // here and assigned its real value only once mkdtempSync actually runs,
  // a few lines below -- do NOT "tidy" this back to a `const` initialised
  // at its mkdtempSync call site; that silently reopens C5-01 by moving
  // tmpDir's declaration (and therefore the handlers that close over it)
  // back after the vulnerable window.
  let tmpDir = null
  let cleaned = false
  let currentChild = null
  let escalationTimer = null
  let terminatingSignal = null

  // Idempotent cleanup (C4-02/C4-03): the async rewrite makes double-entry
  // reachable (a signal handler can clean up and exit, and separately the
  // child's own 'close' handler can run), so `cleaned` guards against a
  // second `fs.rmSync`. `tmpDir === null` is a correct, non-error outcome
  // here too (C5-01): a signal arriving before `mkdtempSync` has run means
  // there is genuinely nothing on disk yet to remove, not a swallowed
  // failure. Cleanup is also registered on Node's 'exit' event (D6) as a
  // second, independent guarantee that covers process.exit() calls this
  // file forgets to route through cleanupAndExit and the uncaughtException
  // case (Node prints its own diagnostic, then emits 'exit', so a sync
  // rmSync here never suppresses that diagnostic) -- but 'exit' is a
  // backstop for THOSE paths only, not for default-disposition signal
  // termination, which (per C5-01's own finding) emits no 'exit' event at
  // all; the forwarded-signal handlers below are what actually close that
  // gap. The try/catch inside cleanup() matters specifically because this
  // runs inside an 'exit' listener -- a throw there would mask the real
  // failure that was already in flight.
  function cleanup() {
    if (cleaned) return
    cleaned = true
    if (tmpDir === null) return
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // best-effort; see comment above
    }
  }
  process.on('exit', cleanup)

  // NOTE: `process.exit()` does NOT run pending `try/finally` blocks -- Node
  // terminates the process before the stack unwinds far enough for the
  // `finally` to execute (verified empirically while authoring this file).
  // Every exit path therefore routes through cleanupAndExit, which cleans up
  // explicitly before exiting, rather than relying on `finally`
  // (T-34.9-C4-03).
  function cleanupAndExit(code) {
    cleanup()
    process.exit(code)
  }

  for (const sig of FORWARDED_SIGNALS) {
    process.on(sig, () => {
      // Repeat signals during termination are ignored (D4) -- one escalation
      // mechanism (the timer below), one thing to test.
      if (terminatingSignal !== null) return
      terminatingSignal = sig

      if (
        currentChild &&
        currentChild.exitCode === null &&
        currentChild.signalCode === null
      ) {
        try {
          currentChild.kill(sig)
        } catch {
          // Under a terminal Ctrl-C the child may receive SIGINT directly
          // from the process group and already be dead by the time we get
          // here -- .kill() on a dead child is a harmless no-op, must not
          // throw.
        }
        escalationTimer = setTimeout(() => {
          if (currentChild) {
            try {
              currentChild.kill('SIGKILL')
            } catch {
              // already gone
            }
          }
        }, KILL_ESCALATION_MS)
      } else {
        // Nothing live to forward to -- clean up and exit immediately.
        cleanupAndExit(signalExitCode(sig))
      }
    })
  }

  // Private per-invocation directory -- never a constructed or predictable
  // path. A predictable name under the shared os.tmpdir() would be
  // pre-creatable as a symlink by another local user (T-34.9-C4-01).
  // Assigned only now, AFTER cleanup/cleanupAndExit are defined and the
  // 'exit' + forwarded-signal handlers are registered (C5-01) -- every
  // handler that could possibly run has already been installed by the time
  // this directory exists, so there is no window left in which a signal
  // finds no handler and bypasses cleanup entirely.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-runts-'))

  // Runs `cmd` asynchronously with inherited stdio, tracking it as
  // `currentChild` so the signal handlers above can reach it. Resolves once
  // with `{ status, signal, error }`: on 'error' (e.g. ENOENT) resolves
  // `{status:null, signal:null, error:err}`; on 'close' resolves
  // `{status:code, signal, error:null}`. Both events fire for an ENOENT
  // spawn -- the second resolve is a no-op, but 'close' still clears
  // currentChild/escalationTimer regardless of which settled first.
  function runChild(cmd, args) {
    return new Promise((resolve) => {
      let settled = false
      const child = spawn(cmd, args, { stdio: 'inherit' })
      currentChild = child

      child.on('error', (err) => {
        if (settled) return
        settled = true
        resolve({ status: null, signal: null, error: err })
      })

      child.on('close', (code, signal) => {
        currentChild = null
        if (escalationTimer) {
          clearTimeout(escalationTimer)
          escalationTimer = null
        }
        if (settled) return
        settled = true
        resolve({ status: code, signal, error: null })
      })
    })
  }

  // Exit code convention (D5):
  //  - wrapper was signalled: 128 + signum of the CALLER's signal, regardless
  //    of how the child actually died -- a SIGTERM'd wrapper always answers
  //    143, because it is a transparent shim and 143 is the conventional
  //    answer to "I was terminated by TERM".
  //  - wrapper not signalled, child died by signal (C4-04: an external
  //    `kill -9 <child pid>` while the wrapper survives): 128 + signum of the
  //    child's signal, e.g. 137. Never a flat 1.
  //  - child exited normally: its own code.
  //  - child failed to launch: 1 (the 'error' branch above).
  function exitCodeFor(result) {
    if (terminatingSignal !== null) return signalExitCode(terminatingSignal)
    if (result.status !== null) return result.status
    if (result.signal) return signalExitCode(result.signal)
    return 1
  }

  try {
    const entryBasename = path.basename(entry).replace(/\.ts$/, '')
    const outfile = path.join(tmpDir, entryBasename + '.cjs')

    // A `node_modules` symlink INSIDE the private tmpdir, pointing at this
    // project's real `node_modules`. Discovered empirically while authoring
    // this file: at least two entries (`meta/buildSidecarSea.ts`,
    // `meta/updaterSigningKey.ts`, the latter bundled into
    // `verify:updater-key`) call runtime `require.resolve('<pkg>/<subpath>')`
    // to locate a CLI tool's real on-disk path (so it can be spawned as a
    // separate process, not `require()`d for its exports) -- esbuild leaves
    // these calls as genuine runtime `require.resolve` calls rather than
    // statically bundling them. Node's CJS resolution algorithm walks up
    // parent directories from the CALLING FILE's own location looking for the
    // project's dependency directory; when the compiled file lived inside the
    // project's shared build-cache path (the pre-C3-01 idiom) that walk found
    // the project's dependency tree one level up by construction. Once
    // compiled into `os.tmpdir()`, that walk finds nothing and every such
    // call throws.
    // This symlink is read-only from the compiled script's perspective (it
    // never writes through it) and points at the SAME immutable project tree
    // every invocation already shares -- unlike the outfile itself, reading
    // `node_modules` concurrently from many invocations is not a hazard, so
    // this does not reintroduce anything C3-01 closed. `fs.rmSync` in
    // cleanup() does not follow the symlink when cleaning up (it unlinks the
    // symlink entry itself, standard `rm -rf` semantics), so the real
    // `node_modules` is never touched.
    // C4-02: this block now sits INSIDE the try/catch (it used to run before
    // it), so a `symlinkSync` failure is caught by the same catch that owns
    // cleanup(), instead of leaking tmpDir on an uncaught throw.
    const repoNodeModules = path.join(__dirname, '..', 'node_modules')
    if (fs.existsSync(repoNodeModules)) {
      fs.symlinkSync(
        repoNodeModules,
        path.join(tmpDir, 'node_modules'),
        'junction'
      )
    }

    // esbuild's own `install.js` postinstall step overwrites `bin/esbuild`
    // with the native platform binary (Mach-O/ELF/PE) for the current
    // machine -- EXCEPT on win32, where `maybeOptimizePackage()` in that
    // installer explicitly skips the hardlink swap (measured directly
    // against esbuild 0.25.12's own `install.js`, quick task 260906-hq8:
    // this is the sixth such discovered-by-execution note in this file).
    // The *published* `esbuild` tarball ships `bin/esbuild` as a
    // 9351-byte `#!/usr/bin/env node` JS shim; on win32 that shim survives
    // untouched, and `CreateProcess` cannot execute a shebang script --
    // spawning it as the direct command there surfaces as libuv errno
    // -4058 (ENOENT). On this project's macOS/Linux hosts the installed
    // copy IS the native binary (confirmed here by its Mach-O header), so
    // it must be spawned directly, never routed through `process.execPath`
    // (a native binary is not parseable JS). `buildEsbuildSpawnArgv()`
    // above picks the right shape for the given platform.
    //
    // Honesty note: the Windows failure that motivated this branch was
    // REPORTED, not reproduced by the author of this fix -- there was no
    // Windows machine to confirm on. The mechanism above is confirmed from
    // esbuild's own tarball and installer source, on macOS, today; whether
    // it is what the reporting machine actually hit is not confirmed. See
    // this quick task's plan `<diagnosis_status>` falsifiers and the
    // pending todo filed alongside this change.
    const esbuildBin = require.resolve('esbuild/bin/esbuild')
    const esbuildArgs = [...esbuildFlags, '--outfile=' + outfile, entry]
    const esbuildArgv = buildEsbuildSpawnArgv(esbuildBin, esbuildArgs)

    const compile = await runChild(esbuildArgv.command, esbuildArgv.args)
    if (compile.error) {
      console.error('meta/runTs.cjs: failed to launch esbuild:', compile.error)
    }

    if (compile.status !== 0) {
      // esbuild failed (or was killed by a signal, status === null): `node`
      // must NEVER be spawned on a failed/partial compile. This is the exact
      // property gap cycle 3 bought with `&&`; preserve it, don't regress it.
      cleanupAndExit(exitCodeFor(compile))
      return
    }

    const run = await runChild(process.execPath, [outfile, ...forwardedArgs])
    if (run.error) {
      console.error('meta/runTs.cjs: failed to launch node:', run.error)
    }

    cleanupAndExit(exitCodeFor(run))
  } catch (err) {
    // Unexpected throw (e.g. the esbuild binary failing to resolve, or the
    // symlinkSync above throwing -- C4-02) -- clean up before propagating,
    // rather than leaking tmpDir.
    cleanup()
    throw err
  }
}

// main() is async now (D1); an async throw that escapes it would otherwise
// become an unhandled rejection rather than the process exiting non-zero.
// main()'s own catch already ran cleanup() before re-throwing here, and the
// 'exit' hook registered above is the idempotent second guarantee.
//
// Quick task 260906-hq8: guarded behind require.main === module so this file
// can be require()d (by meta/__tests__/runTs.test.ts, to assert both
// buildEsbuildSpawnArgv() platform branches from a macOS host) without
// kicking off a real compile-and-run. Every package.json script invokes this
// file as `node meta/runTs.cjs ...`, where require.main === module holds, as
// do the generated probe copies meta/__tests__/runTsSignals.test.ts spawns --
// this guard changes nothing for either of those callers.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { buildEsbuildSpawnArgv }
