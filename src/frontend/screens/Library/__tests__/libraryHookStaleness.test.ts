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
 * The twelve identifiers `makeLibrary` reads from component props/state --
 * the six login gates (`epic.username`, `gog.username`, `amazon.user_id`,
 * `zoom.enabled`, `zoom.username`, `steam?.username`) plus the six library
 * sources each gate switches on (`epic.library`, `gog.library`,
 * `amazon.library`, `zoom.library`, `steam?.library`, `sideloadedLibrary`).
 * Listed explicitly by name (not derived by parsing the body generically) so
 * that a future accidental deletion of one of these reads is caught by Test H
 * rather than silently shrinking the set the checker looks for.
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
  const actualReads = readsPresentIn(body).map(normalise)
  const declaredDeps = extractDepsArray(source, endIdx).map(normalise)

  it('Test H (non-vacuity): the extracted read set has exactly 12 members and contains epic.username', () => {
    // Without this, a body that had lost every one of these reads (e.g. a
    // future refactor that inlined the gates elsewhere) would make Test G
    // vacuously green -- `[].every(...)` is `true` -- the exact fail-open
    // shape this project has hit before.
    expect(actualReads).toHaveLength(12)
    expect(actualReads).toContain(normalise('epic.username'))
  })

  it('Test G: every identifier makeLibrary reads is declared in its useCallback dependency array', () => {
    // Failing assertion against pre-fix code: before this task there was no
    // useCallback at all, and the libraryUnion memo listed only six of the
    // twelve -- this test reported the six missing login-gate identifiers by
    // name. It is green now because makeLibrary declares all twelve.
    const missing = actualReads.filter((read) => !declaredDeps.includes(read))
    expect(missing).toEqual([])
  })

  it('Test I (known-bad): a dependency list missing epic.username is caught, proving the predicate can fail independently of the current file', () => {
    const knownBadDeps = declaredDeps.filter(
      (dep) => dep !== normalise('epic.username')
    )
    const missing = actualReads.filter((read) => !knownBadDeps.includes(read))
    expect(missing).toEqual([normalise('epic.username')])
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
