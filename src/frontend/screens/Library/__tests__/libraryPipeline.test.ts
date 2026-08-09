/**
 * Source-text gate for the Games grid pipeline (34.11 Plan 05,
 * REQ-34.11-02/04/09/15).
 *
 * Why a source gate and not a render test: `Library` is a large component
 * wired to dozens of hooks, and the `Frontend` jest project runs
 * `testEnvironment: 'node'` (see `src/frontend/jest.config.js`) -- there is
 * no jsdom, so mounting `Library` (or anything that imports `./index.css`)
 * is not possible in this project. These assertions instead inspect the raw
 * source text, following the `tier2Portal.test.ts` idiom (`readFileSync` +
 * `stripSourceComments`, no jsdom, no render).
 *
 * What this gate actually protects against: `filterEngine.ts` (plan 01) is
 * the single implementation of every filter stage. `Library/index.tsx`'s
 * grid and plan 04's facet counts both call `filterLibrary` against the
 * SAME memoized state/deps objects. If a second implementation of the
 * pipeline ever reappears -- someone inlines a "quick fix" filter directly
 * into the grid's `useMemo`, or resurrects `filterByPlatform` -- the grid
 * and the counts can silently drift apart, which is exactly the "counts
 * that lie" failure `34.11-RESEARCH.md`'s Anti-Patterns section names. This
 * file is the tripwire for that regression class.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const LIBRARY_TSX = 'src/frontend/screens/Library/index.tsx'

/**
 * Returns the declaration body of the first function whose source begins at
 * `startNeedle` (e.g. `'const makeLibrary = () => {'`), brace-counted
 * rather than regex-terminated so a nested block cannot end the match early
 * -- the same idiom `tier2Portal.test.ts`'s `cssBlock` uses for CSS rules.
 */
function functionRegion(source: string, startNeedle: string): string {
  const startIdx = source.indexOf(startNeedle)
  if (startIdx === -1) {
    throw new Error(`${startNeedle} not found`)
  }
  const braceStart = source.indexOf('{', startIdx)
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(braceStart + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${startNeedle}`)
}

describe('Library pipeline has exactly one implementation', () => {
  const libraryTsx = read(LIBRARY_TSX)

  it('calls filterLibrary( exactly once -- a second call site means the grid and the counts have started to diverge', () => {
    const matches = libraryTsx.match(/filterLibrary\(/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('no longer contains filterByPlatform -- D-09 retired the literal platform facet', () => {
    expect(libraryTsx).not.toMatch(/filterByPlatform/)
  })

  it('no longer derives or indexes a crossoverRatingTier -- D-10 absorbed medal tiers into the runnability facet as evidence, not a user-facing control', () => {
    // Asserted on the derivation/indexing forms, not on the bare
    // `crossoverRatingFilters` identifier: the STATE declaration
    // (`useState<CrossoverRatingFilters>`, `setCrossoverRatingFilters`) is
    // still read by `LibraryFilters` and stays declared until plan 09
    // retires that component. A gate on the bare identifier would go red
    // for the wrong reason -- it must fail only when the FILTER actually
    // runs again, not when the dead state merely still exists.
    expect(libraryTsx).not.toMatch(/crossoverRatingTier/)
    expect(libraryTsx).not.toMatch(/crossoverRatingFilters\[/)
  })

  it("makeLibrary's own region contains no storesFilters reference -- the store facet is applied exclusively downstream in filterLibrary", () => {
    const region = functionRegion(libraryTsx, 'const makeLibrary = () => {')
    expect(region).not.toMatch(/storesFilters/)
  })
})

describe('search keeps its shipped fuzzy behaviour (REQ-34.11-15)', () => {
  const libraryTsx = read(LIBRARY_TSX)

  // D-33/D-35's substring-search rewrite was explicitly deferred by
  // operator decision at `/gsd-plan-phase 34.11` -- Fuse.js fuzzy search
  // stays in this codebase this phase, and facet counts are computed over
  // the fuzzy-matched set (REQ-34.11-15). Asserted POSITIVELY (the call
  // site and its options must still exist) rather than only negatively, so
  // a future contributor "fixing" search to plain substring matching --
  // reverting a decision, not implementing one -- trips this test instead
  // of shipping silently.
  it('still imports Fuse from fuse.js', () => {
    expect(libraryTsx).toMatch(/import Fuse from 'fuse\.js'/)
  })

  it('the Fuse options object still carries threshold: 0.4 and useExtendedSearch: true, unchanged', () => {
    expect(libraryTsx).toMatch(/threshold:\s*0\.4/)
    expect(libraryTsx).toMatch(/useExtendedSearch:\s*true/)
  })
})
