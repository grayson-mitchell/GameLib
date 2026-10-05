import {
  isValidFocusRowSelection,
  migrateFocusRowSelection
} from '../focusRowMigration'

const RECENT = { kind: 'view', value: 'recentlyPlayed' }
const FAVOURITES = { kind: 'view', value: 'favourites' }

describe('Phase 48 plan 05: migrateFocusRowSelection', () => {
  describe('presence guard (R7: a deliberate clear must never be re-seeded)', () => {
    it('a present focusRow of null wins over a legacy libraryTopSection', () => {
      // The case a plausible `??`-based implementation gets wrong: `null` is
      // a legitimate "off" selection, so presence -- not value -- is the guard.
      expect(
        migrateFocusRowSelection({
          focusRow: null,
          libraryTopSection: 'favourites'
        })
      ).toBeNull()
    })

    it('a present valid focusRow is returned unchanged', () => {
      expect(
        migrateFocusRowSelection({
          focusRow: { kind: 'store', value: 'gog' },
          libraryTopSection: 'favourites'
        })
      ).toEqual({ kind: 'store', value: 'gog' })
    })

    it('a present but invalid focusRow falls through to the legacy derivation', () => {
      expect(
        migrateFocusRowSelection({
          focusRow: 'garbage',
          libraryTopSection: 'favourites'
        })
      ).toEqual(FAVOURITES)
    })

    it('a present but invalid focusRow with no legacy value yields null', () => {
      expect(migrateFocusRowSelection({ focusRow: 'garbage' })).toBeNull()
      expect(
        migrateFocusRowSelection({ focusRow: { kind: 'nope', value: 'x' } })
      ).toBeNull()
    })

    it('DEC trap (documentation): a factory-default-merged object masks the legacy value, config.ts must pass the RAW object', () => {
      const merged = {
        ...{ focusRow: null },
        ...{ libraryTopSection: 'favourites' }
      }
      expect(migrateFocusRowSelection(merged)).toBeNull()
    })
  })

  describe('legacy libraryTopSection seed (operator ruling: recency)', () => {
    it('recently_played maps to the recentlyPlayed view', () => {
      expect(
        migrateFocusRowSelection({ libraryTopSection: 'recently_played' })
      ).toEqual(RECENT)
    })

    it('recently_played_installed keeps recency and drops the installed-only qualifier', () => {
      expect(
        migrateFocusRowSelection({
          libraryTopSection: 'recently_played_installed'
        })
      ).toEqual(RECENT)
    })

    it('favourites maps to the favourites view', () => {
      expect(
        migrateFocusRowSelection({ libraryTopSection: 'favourites' })
      ).toEqual(FAVOURITES)
    })

    it('disabled maps to null', () => {
      expect(
        migrateFocusRowSelection({ libraryTopSection: 'disabled' })
      ).toBeNull()
    })
  })

  describe('degenerate input never throws and yields null (T-48-13)', () => {
    it('an empty object', () => {
      expect(migrateFocusRowSelection({})).toBeNull()
    })

    it('null', () => {
      expect(migrateFocusRowSelection(null)).toBeNull()
    })

    it('undefined', () => {
      expect(migrateFocusRowSelection(undefined)).toBeNull()
    })

    it('an unrecognised string legacy value', () => {
      expect(
        migrateFocusRowSelection({ libraryTopSection: 'nonsense' })
      ).toBeNull()
    })

    it('a non-string legacy value', () => {
      expect(migrateFocusRowSelection({ libraryTopSection: 42 })).toBeNull()
    })
  })

  describe('idempotency: a second launch cannot re-seed or drift', () => {
    const legacyInputs: Array<Record<string, unknown>> = [
      { libraryTopSection: 'recently_played' },
      { libraryTopSection: 'recently_played_installed' },
      { libraryTopSection: 'favourites' },
      { libraryTopSection: 'disabled' },
      {}
    ]

    it.each(legacyInputs.map((input) => [JSON.stringify(input), input]))(
      'feeding the output of %s back as focusRow returns an identical value',
      (_label, input) => {
        const first = migrateFocusRowSelection(input)
        const second = migrateFocusRowSelection({ focusRow: first })
        expect(second).toEqual(first)
      }
    )
  })
})

describe('Phase 48 plan 05: isValidFocusRowSelection (single definition)', () => {
  it('accepts the four kinds with a non-empty string value', () => {
    for (const kind of ['view', 'collection', 'store', 'runnability']) {
      expect(isValidFocusRowSelection({ kind, value: 'x' })).toBe(true)
    }
  })

  it('rejects null, undefined, non-objects, bad kinds and empty or non-string values', () => {
    for (const bad of [
      null,
      undefined,
      'view',
      42,
      {},
      { kind: 'view' },
      { kind: 'view', value: '' },
      { kind: 'view', value: 3 },
      { kind: 'nope', value: 'x' }
    ]) {
      expect(isValidFocusRowSelection(bad)).toBe(false)
    }
  })
})
