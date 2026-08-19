import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/**
 * Quick task 260819-s8p -- closes 34.13 UAT gap G-D05-BOTTLENAME (already
 * observed as a FAIL under G-ROW-1 on both runtimes): the Steam
 * install-options wine section's read-only CrossOver bottle-name field was
 * permanently blank because `crossoverBottle` initialised to `''` and
 * nothing on the Steam path ever seeded it.
 *
 * VACUITY BOUNDARY (read before trusting a green run here): these gates
 * prove the SOURCE encodes the seed -- they are NOT evidence the dialog
 * actually renders a prefilled field. This repo's Frontend jest project has
 * no jsdom and no react-test-renderer, and `index.tsx` imports
 * `./index.scss` as its very first line, so no test in this repo can import
 * it and observe a real render. The live proof is owed to 34.13's blocking
 * human UAT gate on both runtimes; a green run here is not a substitute.
 *
 * This file NEVER imports `../index` -- it reads the file as raw text and
 * strips comments first, mirroring the idiom already established by the
 * sibling `installModalSource.test.ts`.
 */

const INDEX_PATH = join(__dirname, '..', 'index.tsx')

function readIndexStripped(): string {
  return stripSourceComments(readFileSync(INDEX_PATH, 'utf8'))
}

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1
}

/**
 * Locate the nearest enclosing `if (` guard for the FIRST occurrence of
 * `callToken` in a flattened (whitespace-collapsed) source string, and
 * return the text between that `if (` and the call site -- the span this
 * file's "steam-only" gate inspects for the `isSteamManagedApp` guard name.
 * Returns `''` when either the call or an enclosing `if (` cannot be found,
 * so a mis-anchored gate fails loudly rather than passing vacuously.
 */
function enclosingIfGuardSpan(flattenedSource: string, callToken: string): string {
  const callIdx = flattenedSource.indexOf(callToken)
  if (callIdx === -1) {
    return ''
  }
  const ifIdx = flattenedSource.lastIndexOf('if (', callIdx)
  if (ifIdx === -1) {
    return ''
  }
  return flattenedSource.slice(ifIdx, callIdx)
}

describe('G-D05-BOTTLENAME: the Steam bottle-name field is seeded, never left blank', () => {
  const stripped = readIndexStripped()

  it('spec 1 -- the stripped source contains a setCrossoverBottle( CALL (open-paren form)', () => {
    // Pre-fix, the ONLY occurrence of the identifier outside the useState
    // destructure is the JSX prop pass-through
    // `setCrossoverBottle={setCrossoverBottle}`, which has NO open paren
    // immediately after the identifier -- so this matcher is red on the
    // unseeded `useState('')` version by construction (see spec 6 below).
    expect(countOccurrences(stripped, 'setCrossoverBottle(')).toBeGreaterThan(
      0
    )
  })

  it('spec 2 -- the seed uses the dedicated constant, IMPORTED rather than redefined locally', () => {
    expect(stripped).toContain('DEFAULT_STEAM_BOTTLE_NAME')
    const flattened = stripped.replace(/\s+/g, ' ')
    expect(flattened).toMatch(/import\s*\{[^}]*DEFAULT_STEAM_BOTTLE_NAME/)
    expect(stripped).not.toContain('const DEFAULT_STEAM_BOTTLE_NAME')
  })

  it('spec 3 -- the shared GOG/Epic bottle is never seeded: zero occurrences of wineCrossoverBottle (17-06 regression guard)', () => {
    expect(countOccurrences(stripped, 'wineCrossoverBottle')).toBe(0)
  })

  it('spec 3 non-vacuity -- the same zero-occurrence matcher DOES detect an inline specimen that seeds the shared bottle', () => {
    const knownBadSpecimen =
      'setCrossoverBottle(globalConfig.wineCrossoverBottle)'
    expect(countOccurrences(knownBadSpecimen, 'wineCrossoverBottle')).toBe(1)
  })

  it('spec 4 -- the seed sits within an isSteamManagedApp guard (Steam-only, never on the plain hasWine arm)', () => {
    // 34.13 review C-12's lesson: flatten whitespace FIRST so a prettier
    // reflow of this multi-line call cannot break the gate.
    const flattened = stripped.replace(/\s+/g, ' ')
    const guardSpan = enclosingIfGuardSpan(flattened, 'setCrossoverBottle(')
    expect(guardSpan).not.toBe('')
    expect(guardSpan).toContain('isSteamManagedApp')
  })

  it('spec 4 non-vacuity -- the same guard-span check fails against an inline specimen where the seed sits OUTSIDE any isSteamManagedApp guard', () => {
    const knownBadSpecimen =
      "if (showWineSelector) { setCrossoverBottle((current) => current || DEFAULT_STEAM_BOTTLE_NAME) }"
    const flattened = knownBadSpecimen.replace(/\s+/g, ' ')
    const guardSpan = enclosingIfGuardSpan(flattened, 'setCrossoverBottle(')
    expect(guardSpan).not.toBe('')
    expect(guardSpan).not.toContain('isSteamManagedApp')
  })

  it('spec 5 -- read-only preserved: exactly ONE occurrence of bottleNameReadOnly (the bug was the missing value, not the read-only-ness)', () => {
    expect(countOccurrences(stripped, 'bottleNameReadOnly')).toBe(1)
  })

  it('spec 6 -- PRE-FIX SPECIMEN CONTROL: an inline specimen reproducing the real pre-fix shape does NOT satisfy spec 1\'s matcher', () => {
    // A grep assertion that cannot fail against a known-bad input guards
    // nothing. This specimen reproduces the pre-fix shape byte-for-byte in
    // spirit: the bare useState('') initialiser, the JSX prop pass-through,
    // and no call form anywhere.
    const preFixSpecimen = `
      const [crossoverBottle, setCrossoverBottle] = useState('')
      const showWineSelector = isSteamManagedApp ? steamGating.wineSection : hasWine
      useEffect(() => {
        if (showWineSelector) {
          const getWine = async () => {
            const newWineList = await window.api.getAlternativeWine()
            setWineVersionList(newWineList)
          }
          getWine().catch(() => {})
        }
      }, [showWineSelector])
      return (
        <WineSelector
          crossoverBottle={crossoverBottle}
          setCrossoverBottle={setCrossoverBottle}
          bottleNameReadOnly
        />
      )
    `
    expect(countOccurrences(preFixSpecimen, 'setCrossoverBottle(')).toBe(0)
  })
})
