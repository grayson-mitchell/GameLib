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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_JSON_PATH = join(__dirname, '..', '..', 'package.json')

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
