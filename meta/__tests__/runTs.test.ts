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
import { readdirSync, readFileSync } from 'node:fs'
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
