import { readFileSync } from 'graceful-fs'
import { join } from 'path'

/**
 * Threat T-34.11-12 (Spoofing) / review WR-03.
 *
 * `connectedStores` decides which rows the Store facet renders; `makeLibrary`
 * decides which store's games reach the grid. The registered mitigation for
 * T-34.11-12 is that the two use *the same* login gates -- so the panel cannot
 * advertise a store whose games are absent. That parity IS the control, and it
 * was false for exactly one store: `connectedStores` read `amazon.username`
 * while `makeLibrary` read `amazon.user_id`, so a username-without-user_id
 * account got an Amazon row over a grid with no Amazon games -- the
 * permanently-0 row that T-34.11-12 and T-34.11-19 both exist to prevent.
 *
 * This is a SOURCE gate because it has to be: every jest project here is
 * `testEnvironment: 'node'` -- no jsdom, no `@testing-library/react` -- so the
 * memo cannot be rendered and the invariant can only be read out of the text.
 *
 * A comment claiming parity is what shipped the defect. This asserts it.
 */

const LIBRARY_INDEX = join(__dirname, '..', 'index.tsx')

/**
 * `sideload` is pushed unconditionally and has no `makeLibrary` login gate --
 * local games need no account. Excluded BY NAME so that a future store which
 * loses its gate cannot silently inherit the exemption.
 */
const UNGATED_STORES = new Set(['sideload'])

/** `makeLibrary`'s `show<Name>` locals, mapped to the facet value they gate. */
const SHOW_LOCAL_TO_STORE: Record<string, string> = {
  Epic: 'legendary',
  Gog: 'gog',
  Amazon: 'nile',
  Zoom: 'zoom',
  Steam: 'steam'
}

/**
 * Strip the differences that carry no meaning: `!!` coercion (present in
 * `makeLibrary`, absent in an `if (...)` test) and all whitespace. What
 * survives is the accessor chain, which is the thing that must match.
 */
function normalise(expression: string): string {
  return expression.replace(/!!/g, '').replace(/\s+/g, '')
}

/** store -> gate expression, read from `connectedStores`'s `if` statements. */
function readConnectedStoreGates(source: string): Record<string, string> {
  const gates: Record<string, string> = {}
  const pattern = /if\s*\((.+?)\)\s*stores\.push\('([a-z]+)'\)/g
  let match = pattern.exec(source)
  while (match !== null) {
    gates[match[2]] = normalise(match[1])
    match = pattern.exec(source)
  }
  return gates
}

/** store -> gate expression, read from `makeLibrary`'s `show*` declarations. */
function readMakeLibraryGates(source: string): Record<string, string> {
  const gates: Record<string, string> = {}
  const pattern = /const\s+show([A-Z][a-zA-Z]*)\s*=\s*(.+)/g
  let match = pattern.exec(source)
  while (match !== null) {
    const store = SHOW_LOCAL_TO_STORE[match[1]]
    if (store !== undefined) {
      gates[store] = normalise(match[2])
    }
    match = pattern.exec(source)
  }
  return gates
}

/** The mismatching stores, as `store: panelGate !== libraryGate` strings. */
function parityMismatches(source: string): string[] {
  const panel = readConnectedStoreGates(source)
  const library = readMakeLibraryGates(source)
  return Object.keys(panel)
    .filter((store) => !UNGATED_STORES.has(store))
    .filter((store) => panel[store] !== library[store])
    .map((store) => `${store}: ${panel[store]} !== ${library[store]}`)
}

describe('connectedStores and makeLibrary gate every store identically (T-34.11-12 / WR-03)', () => {
  const source = readFileSync(LIBRARY_INDEX, 'utf-8')

  it('finds five gated stores in each region -- the comparison is not empty-vs-empty', () => {
    const panel = readConnectedStoreGates(source)
    const library = readMakeLibraryGates(source)

    // Without this, deleting `connectedStores` outright would turn the parity
    // assertion below green: `[].filter(...)` is `[]`. Non-vacuity first.
    expect(
      Object.keys(panel)
        .filter((store) => !UNGATED_STORES.has(store))
        .sort()
    ).toEqual(['gog', 'legendary', 'nile', 'steam', 'zoom'])
    expect(Object.keys(library).sort()).toEqual([
      'gog',
      'legendary',
      'nile',
      'steam',
      'zoom'
    ])
  })

  it('agrees on every gated store', () => {
    expect(parityMismatches(source)).toEqual([])
  })

  it('reads Amazon as user_id at BOTH sites, not username', () => {
    // The specific regression. Stated separately from the generic parity
    // assertion because "they match" would also be satisfied if a future
    // change moved BOTH sites back to `username`, which is the direction the
    // operator decided against on 2026-08-25.
    expect(readConnectedStoreGates(source)['nile']).toBe('amazon.user_id')
    expect(readMakeLibraryGates(source)['nile']).toBe('amazon.user_id')
  })

  /**
   * RED-PROOF. An assertion that has never been observed failing is worth
   * nothing -- T-34.11-26 registers exactly this, and F-34.10-08 recorded a
   * pattern that could never match returning 0 for a file that DID carry the
   * defect. The specimen below is the real source with the pre-fix expression
   * put back, so it exercises the same parser against known-bad input.
   */
  describe('the checker convicts the pre-fix source (red-proof)', () => {
    const preFixSpecimen = source.replace(
      "if (amazon.user_id) stores.push('nile')",
      "if (amazon.username) stores.push('nile')"
    )

    it('the specimen actually differs from the fixed source', () => {
      // Guards against the replace() silently no-op'ing after a refactor,
      // which would make every assertion below vacuous.
      expect(preFixSpecimen).not.toBe(source)
    })

    it('reports nile as a mismatch, naming both sides', () => {
      expect(parityMismatches(preFixSpecimen)).toEqual([
        'nile: amazon.username !== amazon.user_id'
      ])
    })

    it('still reports the other four stores as agreeing', () => {
      // Proves the checker is discriminating, not just always-failing.
      expect(parityMismatches(preFixSpecimen)).toHaveLength(1)
    })
  })
})
