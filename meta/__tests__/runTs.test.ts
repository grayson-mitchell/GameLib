/**
 * Phase 34.9 gap cycle 4, plan 29, Task 3. Pins the C3-01 fix (meta/runTs.cjs
 * + package.json wiring, Tasks 1-2 of this plan) against silent
 * reintroduction of the shared script-name-keyed `node_modules/.cache/`
 * compile-then-run outfile a future refactor might otherwise bring back.
 *
 * Mirrors `meta/__tests__/verifyRunnerBundle.test.ts`'s
 * `package.json wiring pin (C2-04)` describe block: reads the REAL
 * `package.json` from disk at module scope through a local `loadScripts()`
 * helper. Deliberately does NOT hand-copy any script string into this file
 * -- a test that reconstructs the call site is a replica and drifts
 * silently from what actually ships (the standing project rule).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_JSON_PATH = join(__dirname, '..', '..', 'package.json')
const META_DIR = join(__dirname, '..')

interface PackageJsonScripts {
  scripts: Record<string, string>
}

function loadScripts(): Record<string, string> {
  return (
    JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as PackageJsonScripts
  ).scripts
}

// The C3-01 defect predicate itself: a script value writes esbuild's output
// to the shared, script-name-keyed `node_modules/.cache/` path. This is the
// EXACT shape the reviewer measured 100% cross-contamination on. Reused
// unmodified against both the real scripts object (test 1, expect zero
// matches) and a synthetic deliberately-bad fixture (test 3, the vacuity
// guard) so test 1's assertion is proven capable of failing, not just
// capable of passing.
function hasSharedCacheOutfile(scriptValue: string): boolean {
  return /node_modules\/\.cache/.test(scriptValue)
}

// A script "compiles an esbuild-bundled meta/*.ts entry and then executes
// it" if it matches EITHER shape: the OLD vulnerable shared-cache-then-node
// idiom this plan eliminates, or the NEW meta/runTs.cjs wrapper idiom this
// plan introduces. Deliberately matches both shapes (rather than only the
// new one) so that a script silently reverted to the old shape still shows
// up in this set -- which is what makes the set-equality assertion in test
// 2 able to catch a reintroduction that swaps the wrapper back out for a raw
// esbuild-then-node pipeline on a per-script basis, not just a wholesale one
// (test 1 already covers that case via the substring check above).
const OLD_SHARED_CACHE_SHAPE =
  /--outfile=node_modules\/\.cache\/[\w.-]+\.cjs\s+meta\/[\w]+\.ts\s+&&\s+node\s+node_modules\/\.cache\//
const NEW_WRAPPER_SHAPE = /node meta\/runTs\.cjs\s+(?:\S+\s+)*meta\/[\w]+\.ts/

function compilesMetaTsEntryThenExecutes(scriptValue: string): boolean {
  return (
    OLD_SHARED_CACHE_SHAPE.test(scriptValue) ||
    NEW_WRAPPER_SHAPE.test(scriptValue)
  )
}

function wrapped(scriptValue: string): boolean {
  return /node meta\/runTs\.cjs/.test(scriptValue)
}

describe('meta/runTs.cjs wrapper wiring pin (C3-01)', () => {
  test('no package.json script value references the shared node_modules/.cache compile-then-run outfile', () => {
    const scripts = loadScripts()
    const survivors = Object.entries(scripts).filter(([, v]) =>
      hasSharedCacheOutfile(v)
    )
    expect(survivors.map(([k]) => k)).toEqual([])
  })

  test('every script that compiles a meta/*.ts entry and executes it goes through meta/runTs.cjs (set equality, not a hand-written literal list)', () => {
    const scripts = loadScripts()

    const wrappedNames = Object.entries(scripts)
      .filter(([, v]) => wrapped(v))
      .map(([k]) => k)
      .sort()

    const compileThenExecuteNames = Object.entries(scripts)
      .filter(([, v]) => compilesMetaTsEntryThenExecutes(v))
      .map(([k]) => k)
      .sort()

    // Set equality, both directions: a script in one set but not the other
    // is exactly the reintroduction shape this test exists to catch (a
    // meta/*.ts entry compiled-and-run WITHOUT going through the wrapper).
    expect(wrappedNames).toEqual(compileThenExecuteNames)

    // Non-vacuous in the other sense: the set itself must be non-empty, so
    // this assertion cannot pass merely because nothing on either side
    // matched anything (e.g. both regexes silently failing to match real
    // package.json content would otherwise still produce two empty,
    // "equal" arrays).
    expect(wrappedNames.length).toBeGreaterThan(0)
  })

  test('vacuity guard: the shared-cache-outfile predicate used in test 1 actually fires against a known-bad synthetic input', () => {
    // Proves test 1's assertion could go red, not just that it currently
    // passes. Deliberately reintroduces the exact vulnerable shape into a
    // synthetic scripts object (never the real package.json) and asserts
    // the SAME predicate function used above flags it.
    const syntheticBadScripts: Record<string, string> = {
      'reintroduced-hazard':
        '--outfile=node_modules/.cache/x.cjs meta/x.ts && node node_modules/.cache/x.cjs'
    }

    const survivors = Object.entries(syntheticBadScripts).filter(([, v]) =>
      hasSharedCacheOutfile(v)
    )

    expect(survivors.map(([k]) => k)).toEqual(['reintroduced-hazard'])
  })
})

// ---------------------------------------------------------------------------
// E-02 (item 24): package.json-derived doc-comment execution-path accuracy
// pin. Phase 34.9's ledger recorded that several meta/*.ts source comments
// kept describing the RETIRED node_modules/.cache/<name>.cjs compile-then-run
// mechanism after meta/runTs.cjs replaced it -- a stale-doc defect that
// recurred three times because the earlier IN-01/IN-02-style pins in
// meta/__tests__/cleanDist.test.ts assert the RATIONALE ("__dirname is
// unsafe"), not the FACT (which path literal is actually true). These three
// pins assert the fact, derived from the real package.json rather than
// hand-copied, so a future reintroduction of a shared-cache outfile -- or a
// comment drifting away from meta/runTs.cjs -- goes red here first.
// ---------------------------------------------------------------------------

// Two path literals genuinely reference a generated .cjs file's name without
// asserting anything about how a meta/*.ts script itself is compiled or run
// -- they must never be flagged as a stale-runner-path mismatch by pin 2.
const NON_EXECUTION_CJS_ALLOWLIST = [
  'lzmaNativeResolvedPaths.generated.cjs',
  'resolved-paths.generated.cjs'
]

function listMetaTsFiles(): string[] {
  return readdirSync(META_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort()
}

function sourceMentionsSharedCachePath(source: string): boolean {
  return /node_modules\/\.cache/.test(source)
}

// Scoped per the plan: `.cjs` paths under `node_modules/`, OR `.cjs` paths
// appearing directly after the literal `node `. This deliberately excludes
// bare `.cjs` filename mentions like `require('./foo.generated.cjs')`, which
// name a generated artifact rather than a runner invocation.
function extractRunnerCjsPaths(source: string): string[] {
  const found = new Set<string>()
  for (const m of source.matchAll(/node_modules\/[\w./-]+\.cjs/g)) {
    found.add(m[0])
  }
  for (const m of source.matchAll(/node ([\w./-]+\.cjs)/g)) {
    found.add(m[1])
  }
  return [...found].filter(
    (p) => !NON_EXECUTION_CJS_ALLOWLIST.some((allowed) => p.endsWith(allowed))
  )
}

const WRAPPER_SCRIPT_PATTERN =
  /node meta\/runTs\.cjs\s+(?:\S+\s+)*meta\/(\w+)\.ts/

function loadWrapperEntryFiles(): string[] {
  const scripts = loadScripts()
  const entryFiles = new Set<string>()
  for (const value of Object.values(scripts)) {
    const match = WRAPPER_SCRIPT_PATTERN.exec(value)
    if (match) {
      entryFiles.add(`${match[1]}.ts`)
    }
  }
  return [...entryFiles]
}

describe('meta/*.ts doc-comment execution-path accuracy pin (E-02)', () => {
  test('pin 1 (derived negative): no meta/*.ts source mentions the shared node_modules/.cache path, because no package.json script writes there', () => {
    const scripts = loadScripts()
    const scriptsWritingToSharedCache = Object.entries(scripts).filter(
      ([, v]) => hasSharedCacheOutfile(v)
    )
    // The claim this test makes about meta/*.ts source comments is only
    // true BECAUSE this is empty. If a future script reintroduces the
    // shared-cache outfile, that must surface here explicitly rather than
    // this test silently continuing to assert an empty comment-mention set
    // for a reason that no longer holds.
    expect(scriptsWritingToSharedCache.map(([k]) => k)).toEqual([])

    const offendingFiles = listMetaTsFiles().filter((name) =>
      sourceMentionsSharedCachePath(readFileSync(join(META_DIR, name), 'utf-8'))
    )
    expect(offendingFiles).toEqual([])
  })

  test('pin 2 (derived positive): every meta/<X>.ts source comment naming a runner .cjs path names meta/runTs.cjs, matching the wrapper every package.json script actually invokes', () => {
    const entryFiles = loadWrapperEntryFiles()
    // Non-vacuous: real package.json scripts do wrap a meta/*.ts entry
    // through meta/runTs.cjs today.
    expect(entryFiles.length).toBeGreaterThan(0)

    let sawAnyRunnerPathMention = false
    const mismatches: string[] = []

    for (const entryFile of entryFiles) {
      let source: string
      try {
        source = readFileSync(join(META_DIR, entryFile), 'utf-8')
      } catch {
        // The entry file doesn't live directly under meta/ (e.g. a fixture
        // under meta/__tests__) -- outside this pin's concern.
        continue
      }

      const runnerPaths = extractRunnerCjsPaths(source)
      if (runnerPaths.length > 0) {
        sawAnyRunnerPathMention = true
      }
      for (const path of runnerPaths) {
        if (path !== 'meta/runTs.cjs') {
          mismatches.push(`${entryFile}: ${path}`)
        }
      }
    }

    // Non-vacuous in the other sense: at least one wrapped entry file must
    // actually name a runner path in its source, or this assertion would
    // pass merely because nothing on either side matched anything.
    expect(sawAnyRunnerPathMention).toBe(true)
    expect(mismatches).toEqual([])
  })

  test('pin 3 (vacuity guard): the shared-cache-path predicate used in pin 1 actually fires against a known-bad synthetic source string', () => {
    // Proves pin 1's assertion could go red, not just that it currently
    // passes. Reproduces the exact retired claim's wording in a synthetic
    // string (never read from a real meta/*.ts file) and asserts the SAME
    // predicate function pin 1 uses flags it. Mirrors the existing vacuity
    // guard above.
    const syntheticBadSource = `
// NOTE: this script is bundled by esbuild to
// node_modules/.cache/example.cjs and run as
// \`node node_modules/.cache/example.cjs\` (the meta/ convention).
`
    expect(sourceMentionsSharedCachePath(syntheticBadSource)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Quick task 260906-hq8: first platform coverage this file has ever had.
// Before today, nothing in this suite exercised the esbuild spawn's argv at
// all, which is exactly how the win32 branch went missing for as long as it
// did. `buildEsbuildSpawnArgv()` takes `platform` as an injected parameter
// (not `process.platform` read internally) SPECIFICALLY so the win32 branch
// is assertable without an `if (process.platform === 'win32')` guard around
// the argv assertions -- that shape is what WR-06 rejected for the identical
// helper in meta/buildSidecarSea.ts, because it made the win32 branch
// unreachable on macOS/Linux dev machines and on three of the four CI legs.
// Every test below runs unconditionally on every host except test 6, which is
// a deliberate, commented exception (see its own note).
//
// `require('../runTs.cjs')` below is only safe because runTs.cjs wraps its
// own `main()` call in `if (require.main === module)`; if that guard is ever
// removed, this require() starts a real compile-and-run inside jest and this
// whole suite fails loudly (not silently) -- which is the point.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const runTs = require('../runTs.cjs')

describe('meta/runTs.cjs esbuild spawn argv (quick task 260906-hq8)', () => {
  const CLI = '/fake/project/node_modules/esbuild/bin/esbuild'
  const FLAGS = ['--bundle', '--outfile=/tmp/out.cjs', '/tmp/entry.ts']

  test('win32 branch runs the CLI through process.execPath', () => {
    const argv = runTs.buildEsbuildSpawnArgv(CLI, FLAGS, 'win32')
    expect(argv.command).toBe(process.execPath)
    expect(argv.args[0]).toBe(CLI)
    expect(argv.args.slice(1)).toEqual(FLAGS)
  })

  test('non-win32 branches spawn the CLI directly', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const argv = runTs.buildEsbuildSpawnArgv(CLI, FLAGS, platform)
      expect(argv.command).toBe(CLI)
      expect(argv.command).not.toBe(process.execPath)
      expect(argv.args[0]).toBe(FLAGS[0])
    }
  })

  test('the two branches differ only in who is spawned, never in the flags', () => {
    const win = runTs.buildEsbuildSpawnArgv(CLI, FLAGS, 'win32')
    const linux = runTs.buildEsbuildSpawnArgv(CLI, FLAGS, 'linux')
    expect(win.args.slice(1)).toEqual(linux.args)
  })

  test('the default parameter follows the host platform', () => {
    expect(runTs.buildEsbuildSpawnArgv(CLI, FLAGS)).toEqual(
      runTs.buildEsbuildSpawnArgv(CLI, FLAGS, process.platform)
    )
  })

  // Non-vacuity control: proves the helper actually branches on `platform`
  // rather than ignoring the argument -- which is exactly the pre-fix
  // behaviour, hard-coded to the non-win32 (direct-spawn) shape. A helper
  // that ignored `platform` would pass tests 1-4 trivially on a non-win32
  // host (they'd never observe the win32 shape diverging from anything) but
  // fails HERE because the two calls would be deep-equal.
  test('non-vacuity control: the helper actually branches on platform', () => {
    const win = runTs.buildEsbuildSpawnArgv(CLI, FLAGS, 'win32')
    const darwin = runTs.buildEsbuildSpawnArgv(CLI, FLAGS, 'darwin')
    expect(win).not.toEqual(darwin)
  })

  // Host-fact pin, deliberately host-conditional -- unlike tests 1-5 above,
  // this one asserts a fact about THIS DISK's installed esbuild copy, not
  // about a code branch, so a host conditional is correct here and would be
  // wrong there. On a non-win32 host, esbuild's installer has already
  // hardlink-swapped bin/esbuild for the native binary, so its first two
  // bytes must NOT be a `#!` shebang -- confirming the direct-spawn branch is
  // the right choice on this machine. On win32 the installer skips that
  // swap, so the shebang survives and process.execPath is required instead.
  test('host-fact pin: the installed esbuild/bin/esbuild matches this host branch', () => {
    const esbuildBin = require.resolve('esbuild/bin/esbuild')
    expect(existsSync(esbuildBin)).toBe(true)
    const firstBytes = readFileSync(esbuildBin).subarray(0, 2).toString('utf8')
    if (process.platform === 'win32') {
      expect(firstBytes).toBe('#!')
    } else {
      expect(firstBytes).not.toBe('#!')
    }
  })

  // Installer tripwire: a stale-assumption pin, not a correctness assertion
  // about our own code. It reads esbuild's OWN bundled, minified installer
  // output -- a third-party file we do not control -- so an esbuild upgrade
  // that changes maybeOptimizePackage()'s shape can turn this red without any
  // of our code being wrong. That is intended: RED here means esbuild changed
  // its installer, so the win32 branch's justification needs re-verification
  // against the new version, NOT that the branch itself should be deleted.
  // If the file cannot be read or the function is missing, this fails loudly
  // (never skips) -- "what happens when the check fails to load" must be RED.
  test('installer tripwire: esbuild install.js still skips the hardlink swap on win32', () => {
    const installJsPath = require.resolve('esbuild/install.js')
    const source = readFileSync(installJsPath, 'utf8')
    expect(source).toContain('maybeOptimizePackage')
    expect(source).toMatch(/platform\(\)\s*!==\s*["']win32["']/)
  })
})
