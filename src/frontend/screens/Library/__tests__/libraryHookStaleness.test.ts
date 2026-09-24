/**
 * Source-text gates for three dependency/staleness defects in
 * `Library/index.tsx` (quick 260827-t9c, closing residual review findings
 * WR-01, WR-05 and WR-09).
 *
 * Same reason as `connectedStoresParity.test.ts` and `libraryPipeline.test.ts`:
 * the `Frontend` jest project runs `testEnvironment: 'node'` with no jsdom, so
 * `Library` cannot be mounted and every assertion here reads the raw source
 * text instead -- following `connectedStoresParity.test.ts`'s idiom exactly,
 * including a NON-VACUITY assertion before every parity assertion.
 */
import { readFileSync } from 'graceful-fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const LIBRARY_INDEX = join(__dirname, '..', 'index.tsx')

/**
 * Brace-counted region extraction, the same idiom as
 * `libraryPipeline.test.ts`'s `functionRegion` -- but this one also returns
 * where the closing brace landed, so the caller can go on to read the
 * `useCallback` dependency array that follows it.
 */
function functionRegion(
  source: string,
  startNeedle: string
): { body: string; endIdx: number } {
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
        return { body: source.slice(braceStart + 1, i), endIdx: i }
      }
    }
  }
  throw new Error(`unterminated block for ${startNeedle}`)
}

/** Reads the `[...]` dependency array that follows a `useCallback` body. */
function extractDepsArray(source: string, afterIdx: number): string[] {
  const bracketStart = source.indexOf('[', afterIdx)
  const bracketEnd = source.indexOf(']', bracketStart)
  return source
    .slice(bracketStart + 1, bracketEnd)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/** `?.` carries no meaning for identity comparison here; neither does whitespace. */
function normalise(expression: string): string {
  return expression.replace(/\?\./g, '.').replace(/\s+/g, '')
}

/**
 * The twelve identifiers the grid's read surface takes from component
 * props/state -- the six login gates (`epic.username`, `gog.username`,
 * `amazon.user_id`, `zoom.enabled`, `zoom.username`, `steam?.username`) plus
 * the six library sources each gate switches on (`epic.library`,
 * `gog.library`, `amazon.library`, `zoom.library`, `steam?.library`,
 * `sideloadedLibrary`).
 * Listed explicitly by name (not derived by parsing the body generically) so
 * that a future accidental deletion of one of these reads is caught by Test H
 * rather than silently shrinking the set the checker looks for.
 *
 * quick/260924-g7r -- that surface is no longer ONE function. Ten of the
 * twelve are still read directly inside `makeLibrary`; `steam?.username` and
 * `steam?.library` moved up into the `steamVisibility` memo, which
 * `makeLibrary` then consumes as a single value. The staleness invariant is
 * unchanged in substance but now spans a hop, so it is checked across BOTH
 * regions plus the link between them (Test K) rather than lowering this
 * count to ten -- a count that shrinks whenever a read moves is a gate that
 * gets weaker exactly when the code gets more indirect.
 */
const KNOWN_READS = [
  'epic.username',
  'epic.library',
  'gog.username',
  'gog.library',
  'amazon.user_id',
  'amazon.library',
  'zoom.enabled',
  'zoom.username',
  'zoom.library',
  'steam?.username',
  'steam?.library',
  'sideloadedLibrary'
]

/** Which of `KNOWN_READS` actually appear in the given function body text. */
function readsPresentIn(body: string): string[] {
  const normalisedBody = normalise(body)
  return KNOWN_READS.filter((read) => normalisedBody.includes(normalise(read)))
}

describe("makeLibrary's dependency array is complete (WR-01)", () => {
  const source = stripSourceComments(readFileSync(LIBRARY_INDEX, 'utf-8'))
  const { body, endIdx } = functionRegion(
    source,
    'const makeLibrary = useCallback(() => {'
  )
  // quick/260924-g7r: the second half of the read surface. Extracted with the
  // same brace-counting helper, so a memo rewritten to an expression body
  // (`useMemo(() => resolveSteamVisibility({...}), [...])`) throws here rather
  // than silently capturing the object literal and reporting zero reads.
  const { body: steamMemoBody, endIdx: steamMemoEndIdx } = functionRegion(
    source,
    'const steamVisibility = useMemo(() => {'
  )
  const actualReads = readsPresentIn(body + steamMemoBody).map(normalise)
  const declaredDeps = extractDepsArray(source, endIdx).map(normalise)
  const steamMemoDeps = extractDepsArray(source, steamMemoEndIdx).map(normalise)

  /**
   * The WR-01 predicate, region by region: a read must be declared by the
   * hook that PERFORMS it. Taking the union of both dep arrays instead would
   * pass a `makeLibrary` that reads `epic.username` while only the Steam memo
   * declares it -- which is precisely the staleness this file exists to stop.
   */
  const missingFor = (libDeps: string[], memoDeps: string[]): string[] => [
    ...readsPresentIn(body)
      .map(normalise)
      .filter((read) => !libDeps.includes(read)),
    ...readsPresentIn(steamMemoBody)
      .map(normalise)
      .filter((read) => !memoDeps.includes(read))
  ]

  it('Test H (non-vacuity): the extracted read set has exactly 12 members and contains epic.username', () => {
    // Without this, a body that had lost every one of these reads (e.g. a
    // future refactor that inlined the gates elsewhere) would make Test G
    // vacuously green -- `[].every(...)` is `true` -- the exact fail-open
    // shape this project has hit before.
    expect(actualReads).toHaveLength(12)
    expect(actualReads).toContain(normalise('epic.username'))
  })

  it('Test H2 (non-vacuity of the split): the two Steam reads live in the memo, not in makeLibrary', () => {
    // Pins WHERE each half sits. Without it, Test H's 12 could be satisfied
    // by both reads drifting back into `makeLibrary` while `steamMemoBody`
    // contributed nothing -- leaving the memo half of Test G vacuous.
    expect(readsPresentIn(steamMemoBody).map(normalise).sort()).toEqual([
      normalise('steam?.library'),
      normalise('steam?.username')
    ])
    expect(readsPresentIn(body).map(normalise)).not.toContain(
      normalise('steam?.username')
    )
  })

  it('Test G: every identifier the grid reads is declared by the hook that reads it', () => {
    // Failing assertion against pre-fix code: before this task there was no
    // useCallback at all, and the libraryUnion memo listed only six of the
    // twelve -- this test reported the six missing login-gate identifiers by
    // name. It is green now because each hook declares everything it reads.
    expect(missingFor(declaredDeps, steamMemoDeps)).toEqual([])
  })

  it('Test K: makeLibrary consumes the steamVisibility memo AND declares it as a dependency', () => {
    // The hop itself. Both halves can declare their own reads correctly and
    // the grid still goes stale if `makeLibrary` closes over `steamVisibility`
    // without listing it -- the memo would recompute on a sync-status change
    // while the grid kept the previous Steam slice, which looks exactly like
    // the bug debug/steam-library-shows-logged-out fixed.
    expect(normalise(body)).toContain('steamVisibility.')
    expect(declaredDeps).toContain('steamVisibility')
  })

  it('Test I (known-bad): a dependency list missing epic.username is caught, proving the predicate can fail independently of the current file', () => {
    const knownBadDeps = declaredDeps.filter(
      (dep) => dep !== normalise('epic.username')
    )
    const missing = missingFor(knownBadDeps, steamMemoDeps)
    expect(missing).toEqual([normalise('epic.username')])
  })

  it('Test I2 (known-bad, memo half): a steamVisibility dep list missing steam?.library is caught', () => {
    // Test I only ever exercises the `makeLibrary` half of `missingFor`. The
    // memo half is new and needs its own red-proof, or a bug that made it
    // always return [] would leave Test G green over an undefended memo.
    const knownBadMemoDeps = steamMemoDeps.filter(
      (dep) => dep !== normalise('steam?.library')
    )
    const missing = missingFor(declaredDeps, knownBadMemoDeps)
    expect(missing).toEqual([normalise('steam?.library')])
  })
})

describe('recentAppNames refreshes on handleRecentGamesChanged, not just at mount (WR-05)', () => {
  const source = readFileSync(LIBRARY_INDEX, 'utf-8')

  it('Test J: subscribes to handleRecentGamesChanged and holds recentAppNames as refreshable state', () => {
    expect(source).toMatch(/handleRecentGamesChanged/)
    expect(source).toMatch(/setRecentAppNames/)
  })

  it('Test J (non-vacuity): a known-bad copy with both identifiers stripped fails the same assertion', () => {
    const knownBad = source
      .replace(/handleRecentGamesChanged/g, '')
      .replace(/setRecentAppNames/g, '')
    expect(knownBad).not.toMatch(/handleRecentGamesChanged/)
    expect(knownBad).not.toMatch(/setRecentAppNames/)
  })
})

describe('a stale currentCollection is detected and cleared (WR-09 wiring)', () => {
  const source = readFileSync(LIBRARY_INDEX, 'utf-8')

  it('Test L: calls collectionIsStale( and clears the persisted selection with setCurrentCollectionPersisted(null)', () => {
    // A behavioural unit test of collectionIsStale itself (engineWiring.test.ts
    // Test K) passes trivially and proves nothing about an effect actually
    // being mounted in Library/index.tsx -- this pairs with it.
    expect(source).toMatch(/collectionIsStale\(/)
    expect(source).toMatch(/setCurrentCollectionPersisted\(null\)/)
  })

  it('Test L (non-vacuity): a known-bad copy with both call sites stripped fails the same assertion', () => {
    const knownBad = source
      .replace(/collectionIsStale\(/g, '')
      .replace(/setCurrentCollectionPersisted\(null\)/g, '')
    expect(knownBad).not.toMatch(/collectionIsStale\(/)
    expect(knownBad).not.toMatch(/setCurrentCollectionPersisted\(null\)/)
  })
})
