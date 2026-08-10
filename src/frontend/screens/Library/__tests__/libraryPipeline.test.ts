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
const ENGINE_WIRING_TS = 'src/frontend/screens/Library/engineWiring.ts'

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

  // WR-14: the gate that used to live here asserted
  // `libraryTsx.match(/filterLibrary\(/g)` had length 1, and was described as
  // the tripwire for "the grid and the counts have started to diverge". CR-01
  // was precisely that divergence and this gate stayed GREEN throughout,
  // because the second pipeline pass happened INSIDE `filterEngine.countFor`
  // -- driven by the wrong first argument at a `countFor` call site the gate
  // never looked at. Counting `filterLibrary(` occurrences could not, even in
  // principle, observe the defect.
  //
  // The replacement asserts the property that actually matters: neither
  // `filterLibrary` nor `countFor` is invoked from this component at all.
  // Both call shapes now live in `engineWiring.ts`, where
  // `__tests__/engineWiring.test.ts` exercises them BEHAVIOURALLY over the
  // real production arguments. A source gate is the wrong instrument for a
  // wrong-argument defect; its job here is only to stop the call shape
  // leaking back into the component where no test can reach it.
  it('never calls filterLibrary( or countFor( itself -- both call shapes live in engineWiring.ts, where a behavioural test can reach the real arguments', () => {
    expect(libraryTsx.match(/filterLibrary\(/g) ?? []).toHaveLength(0)
    expect(libraryTsx.match(/countFor\(/g) ?? []).toHaveLength(0)
  })

  it('builds its grid and both facet counts from ONE buildGridPipeline call -- a second call could be handed a different library and reintroduce CR-01', () => {
    expect(libraryTsx.match(/buildGridPipeline\(/g) ?? []).toHaveLength(1)
  })

  it('reads the grid list and both count accessors off that single pipeline object, never recomputing either', () => {
    expect(libraryTsx).toMatch(/gamesForAlphabetFilter\s*=\s*gridPipeline\.games/)
    expect(libraryTsx).toMatch(
      /\{\s*countForStore,\s*countForRunnability\s*\}\s*=\s*gridPipeline/
    )
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

describe('engineWiring passes the UNFILTERED union to every engine call (CR-01)', () => {
  const engineWiringTs = read(ENGINE_WIRING_TS)

  // The behavioural proof lives in `__tests__/engineWiring.test.ts`. This is
  // the structural half: all three engine calls must take the SAME
  // identifier as their first argument, and that identifier must be the
  // untouched parameter -- not a local derived from it. CR-01 was one of
  // those identifiers being different from the others; asserting all three
  // are literally `libraryUnion` is what makes that unrepresentable here.
  it('filterLibrary and both countFor calls all take `libraryUnion` as their first argument', () => {
    expect(engineWiringTs).toMatch(/filterLibrary\(\s*libraryUnion,/)
    const countForCalls =
      engineWiringTs.match(/countFor\(\s*libraryUnion,/g) ?? []
    expect(countForCalls).toHaveLength(2)
  })

  it('makes exactly those three engine calls and no others', () => {
    expect(
      engineWiringTs.match(/filterEngine\.filterLibrary\(/g) ?? []
    ).toHaveLength(1)
    expect(engineWiringTs.match(/filterEngine\.countFor\(/g) ?? []).toHaveLength(
      2
    )
  })

  it('never reassigns libraryUnion -- the list reaching every call is the one the caller passed', () => {
    expect(engineWiringTs).not.toMatch(/\blibraryUnion\s*=[^=>]/)
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
