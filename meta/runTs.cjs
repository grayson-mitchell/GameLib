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
 */

'use strict'

const { spawnSync } = require('node:child_process')
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

function main() {
  const { esbuildFlags, entry, forwardedArgs } = parseArgv(
    process.argv.slice(2)
  )

  // Private per-invocation directory -- never a constructed or predictable
  // path. A predictable name under the shared os.tmpdir() would be
  // pre-creatable as a symlink by another local user (T-34.9-C4-01).
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-runts-'))

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
  // this does not reintroduce anything C3-01 closed. `fs.rmSync` below does
  // not follow the symlink when cleaning up (it unlinks the symlink entry
  // itself, standard `rm -rf` semantics), so the real `node_modules` is
  // never touched.
  const repoNodeModules = path.join(__dirname, '..', 'node_modules')
  if (fs.existsSync(repoNodeModules)) {
    fs.symlinkSync(
      repoNodeModules,
      path.join(tmpDir, 'node_modules'),
      'junction'
    )
  }

  // NOTE: `process.exit()` does NOT run pending `try/finally` blocks -- Node
  // terminates the process before the stack unwinds far enough for the
  // `finally` to execute (verified empirically while authoring this file).
  // Every exit path below therefore removes tmpDir explicitly, immediately
  // before calling process.exit, rather than relying on `finally` (T-34.9-C4-03).
  function cleanupAndExit(code) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.exit(code)
  }

  try {
    const entryBasename = path.basename(entry).replace(/\.ts$/, '')
    const outfile = path.join(tmpDir, entryBasename + '.cjs')

    // esbuild's own `install.js` postinstall step overwrites `bin/esbuild`
    // with the native platform binary (Mach-O/ELF/PE) for the current
    // machine -- it is NEVER a JS file to hand to `process.execPath`, on any
    // platform, once install has run. Spawn it directly; on POSIX this also
    // transparently handles the (no longer normal, but not impossible) case
    // where it is still a `#!/usr/bin/env node` shim, since execve resolves
    // the shebang itself.
    const esbuildBin = require.resolve('esbuild/bin/esbuild')

    const compile = spawnSync(
      esbuildBin,
      [...esbuildFlags, '--outfile=' + outfile, entry],
      { stdio: 'inherit' }
    )

    if (compile.status !== 0) {
      // esbuild failed (or was killed by a signal, status === null): `node`
      // must NEVER be spawned on a failed/partial compile. This is the exact
      // property gap cycle 3 bought with `&&`; preserve it, don't regress it.
      cleanupAndExit(compile.status === null ? 1 : compile.status)
      return
    }

    const run = spawnSync(process.execPath, [outfile, ...forwardedArgs], {
      stdio: 'inherit'
    })

    cleanupAndExit(run.status === null ? 1 : run.status)
  } catch (err) {
    // Unexpected throw (e.g. the esbuild binary failing to resolve) --
    // clean up before propagating, rather than leaking tmpDir.
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw err
  }
}

main()
