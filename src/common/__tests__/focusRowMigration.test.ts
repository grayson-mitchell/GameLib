import {
  FocusRowHydrationDeps,
  hydrateFocusRowSelection,
  isValidFocusRowSelection,
  migrateFocusRowSelection,
  seedFocusRowFromMirror
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

    it('WR-02: a present but invalid focusRow yields null and never re-seeds from libraryTopSection', () => {
      expect(
        migrateFocusRowSelection({
          focusRow: 'garbage',
          libraryTopSection: 'favourites'
        })
      ).toBeNull()
    })

    it('WR-01 + WR-02: a present view selection naming an unknown view yields null, not the legacy seed', () => {
      expect(
        migrateFocusRowSelection({
          focusRow: { kind: 'view', value: 'bogus' },
          libraryTopSection: 'recently_played'
        })
      ).toBeNull()
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
  it('accepts the four kinds with a non-empty string value (a real view for kind view)', () => {
    expect(
      isValidFocusRowSelection({ kind: 'view', value: 'favourites' })
    ).toBe(true)
    for (const kind of ['collection', 'store', 'runnability']) {
      expect(isValidFocusRowSelection({ kind, value: 'x' })).toBe(true)
    }
  })

  it('WR-01: kind view accepts exactly all, installed, recentlyPlayed and favourites', () => {
    for (const value of ['all', 'installed', 'recentlyPlayed', 'favourites']) {
      expect(isValidFocusRowSelection({ kind: 'view', value })).toBe(true)
    }
    for (const value of ['x', 'bogus', 'All']) {
      expect(isValidFocusRowSelection({ kind: 'view', value })).toBe(false)
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
      { kind: 'view', value: 'x' },
      { kind: 'view', value: 'bogus' },
      { kind: 'nope', value: 'x' }
    ]) {
      expect(isValidFocusRowSelection(bad)).toBe(false)
    }
  })
})

describe('Phase 48 plan 07: seedFocusRowFromMirror (CR-01 renderer seed)', () => {
  it.each([
    ['an absent mirror', undefined],
    ['a null mirror', null],
    ['a non-object mirror', 'settings'],
    ['a mirror without the focusRow key', { language: 'en' }]
  ])('%s asks for the migrated value', (_label, mirror) => {
    expect(seedFocusRowFromMirror(mirror)).toEqual({
      focusRow: null,
      needsMigratedValue: true
    })
  })

  it('a present null is a deliberate clear and does not ask for the migrated value', () => {
    expect(seedFocusRowFromMirror({ focusRow: null })).toEqual({
      focusRow: null,
      needsMigratedValue: false
    })
  })

  it('a present valid value seeds unchanged', () => {
    expect(seedFocusRowFromMirror({ focusRow: FAVOURITES })).toEqual({
      focusRow: FAVOURITES,
      needsMigratedValue: false
    })
  })

  it('a present invalid value yields null and still does not ask for the migrated value (WR-02)', () => {
    expect(
      seedFocusRowFromMirror({ focusRow: { kind: 'view', value: 'bogus' } })
    ).toEqual({ focusRow: null, needsMigratedValue: false })
  })
})

describe('Phase 48 plan 07: hydrateFocusRowSelection', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  function makeDeps(
    overrides: Partial<FocusRowHydrationDeps> = {}
  ): FocusRowHydrationDeps {
    return {
      requestAppSettings: jest.fn(() => Promise.resolve({ focusRow: RECENT })),
      setSetting: jest.fn(),
      applyFocusRow: jest.fn(),
      hasUserPicked: jest.fn(() => false),
      onError: jest.fn(),
      ...overrides
    }
  }

  it('applies and persists the migrated value', async () => {
    const deps = makeDeps()

    await expect(hydrateFocusRowSelection(deps)).resolves.toEqual(RECENT)

    expect(deps.applyFocusRow).toHaveBeenCalledWith(RECENT)
    expect(deps.setSetting).toHaveBeenCalledWith({
      appName: 'default',
      key: 'focusRow',
      value: RECENT
    })
  })

  it('never overwrites a pick the user made while the IPC was in flight', async () => {
    const inFlight = deferred<unknown>()
    let picked = false
    const deps = makeDeps({
      requestAppSettings: () => inFlight.promise,
      hasUserPicked: () => picked
    })

    const pending = hydrateFocusRowSelection(deps)
    picked = true
    inFlight.resolve({ focusRow: RECENT })

    await expect(pending).resolves.toBeUndefined()
    expect(deps.applyFocusRow).not.toHaveBeenCalled()
    expect(deps.setSetting).not.toHaveBeenCalled()
  })

  it('a rejected requestAppSettings reports once, writes nothing and resolves undefined', async () => {
    const boom = new Error('ipc down')
    const deps = makeDeps({
      requestAppSettings: () => Promise.reject(boom)
    })

    await expect(hydrateFocusRowSelection(deps)).resolves.toBeUndefined()

    expect(deps.onError).toHaveBeenCalledTimes(1)
    expect(deps.onError).toHaveBeenCalledWith(boom)
    expect(deps.applyFocusRow).not.toHaveBeenCalled()
    expect(deps.setSetting).not.toHaveBeenCalled()
  })

  it('a throwing applyFocusRow still resolves (never rejects)', async () => {
    const deps = makeDeps({
      applyFocusRow: () => {
        throw new Error('setState blew up')
      }
    })

    await expect(hydrateFocusRowSelection(deps)).resolves.toBeUndefined()
    expect(deps.onError).toHaveBeenCalledTimes(1)
  })

  it('an invalid focusRow in the settings is applied and written as null', async () => {
    const deps = makeDeps({
      requestAppSettings: () =>
        Promise.resolve({ focusRow: { kind: 'view', value: 'bogus' } })
    })

    await expect(hydrateFocusRowSelection(deps)).resolves.toBeNull()

    expect(deps.applyFocusRow).toHaveBeenCalledWith(null)
    expect(deps.setSetting).toHaveBeenCalledWith({
      appName: 'default',
      key: 'focusRow',
      value: null
    })
  })
})
