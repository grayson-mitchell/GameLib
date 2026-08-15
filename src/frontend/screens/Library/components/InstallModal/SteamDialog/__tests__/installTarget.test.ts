import {
  SteamDialogLibraryOption,
  defaultSteamLibraryPath,
  resolveSteamInstallPath
} from '../installTarget'

// --- Fixtures -------------------------------------------------------------
//
// Primary deliberately NOT at array index 0, so a test that passes by
// accidentally taking `libraries[0]` is distinguishable from one that
// actually honours `isPrimary`.
const threeLibraries: SteamDialogLibraryOption[] = [
  {
    path: '/mnt/data/SteamLibrary',
    steamappsDir: '/mnt/data/SteamLibrary/steamapps',
    isPrimary: false
  },
  {
    path: '/home/user/.steam/steam',
    steamappsDir: '/home/user/.steam/steam/steamapps',
    isPrimary: true
  },
  {
    path: '/mnt/backup/SteamLibrary',
    steamappsDir: '/mnt/backup/SteamLibrary/steamapps',
    isPrimary: false
  }
]

const noPrimaryLibraries: SteamDialogLibraryOption[] = [
  {
    path: '/mnt/data/SteamLibrary',
    steamappsDir: '/mnt/data/SteamLibrary/steamapps',
    isPrimary: false
  },
  {
    path: '/mnt/backup/SteamLibrary',
    steamappsDir: '/mnt/backup/SteamLibrary/steamapps',
    isPrimary: false
  }
]

const emptyLibraries: SteamDialogLibraryOption[] = []

const ALL_FIXTURES: SteamDialogLibraryOption[][] = [
  threeLibraries,
  noPrimaryLibraries,
  emptyLibraries
]

// A case-flipped variant of a real option path in `threeLibraries` -- looks
// "close" to a real entry under any normalising/case-insensitive compare,
// but is a different string under strict equality.
const CASE_FLIPPED_REAL_PATH = '/HOME/USER/.steam/STEAM'

// The hostile-input case table. Shared VERBATIM between the "real
// implementation" block below and the "saboteur" block via
// `assertContainment`, so the saboteur is provably run against the same
// expectations the real implementation satisfies -- not a weaker parallel
// set (T-34.13-10-01).
const HOSTILE_INPUTS = [
  '',
  '/etc',
  '../../etc',
  '/Users/x/Steam/../../..',
  '/Users/x/steamlibrary ', // trailing space
  CASE_FLIPPED_REAL_PATH
]

/**
 * Runs `resolveFn` across the full `HOSTILE_INPUTS` case table for a given
 * `libraries` fixture and BOTH `libraryVisible` values, asserting the
 * T-34.13-10-01 containment invariant: the result is always `''` or an
 * EXACT member of `libraries`, and `libraryVisible: false` always yields
 * `''` regardless of the submitted `selectedPath`. Uses `expect` internally,
 * so a violation throws a real jest assertion error -- callers can wrap a
 * call in `expect(() => assertContainment(...)).toThrow()` to prove a
 * saboteur breaks the very invariant the real implementation satisfies.
 */
function assertContainment(
  resolveFn: (
    selectedPath: string,
    libraries: SteamDialogLibraryOption[],
    libraryVisible: boolean
  ) => string,
  libraries: SteamDialogLibraryOption[]
) {
  const validPaths = new Set(libraries.map((lib) => lib.path))
  for (const hostile of HOSTILE_INPUTS) {
    for (const libraryVisible of [true, false]) {
      const result = resolveFn(hostile, libraries, libraryVisible)
      if (!libraryVisible) {
        expect(result).toBe('')
        continue
      }
      expect(result === '' || validPaths.has(result)).toBe(true)
    }
  }
}

describe('defaultSteamLibraryPath', () => {
  it('chooses the primary over the first array entry', () => {
    expect(defaultSteamLibraryPath(threeLibraries)).toBe(
      '/home/user/.steam/steam'
    )
  })

  it('falls back to the first entry when no library is primary', () => {
    expect(defaultSteamLibraryPath(noPrimaryLibraries)).toBe(
      '/mnt/data/SteamLibrary'
    )
  })

  it('returns the empty string for an empty library list', () => {
    expect(defaultSteamLibraryPath(emptyLibraries)).toBe('')
  })
})

describe('resolveSteamInstallPath -- T-34.13-10-01 destination containment', () => {
  it('libraryVisible: false returns "" regardless of a populated selectedPath -- the D-02 bottled-install case, the most important single assertion in this file', () => {
    expect(
      resolveSteamInstallPath('/Users/x/hostile-path', threeLibraries, false)
    ).toBe('')
  })

  it('a selectedPath that exactly matches an option returns that path unchanged', () => {
    // Deliberately the non-primary entry -- proves this is a containment
    // check, not a "always return the default" shortcut.
    expect(
      resolveSteamInstallPath(
        '/mnt/backup/SteamLibrary',
        threeLibraries,
        true
      )
    ).toBe('/mnt/backup/SteamLibrary')
  })

  it.each(HOSTILE_INPUTS)(
    'a selectedPath that matches no option falls back to the primary, never the submitted value (case: %s)',
    (hostile) => {
      const result = resolveSteamInstallPath(hostile, threeLibraries, true)
      expect(result).not.toBe(hostile)
      expect(result).toBe('/home/user/.steam/steam')
    }
  )

  it('an unrecognised selectedPath with an EMPTY library list returns "", never the submitted value', () => {
    const result = resolveSteamInstallPath('/etc', emptyLibraries, true)
    expect(result).toBe('')
    expect(result).not.toBe('/etc')
  })

  it('invariant sweep: across every fixture x hostile case x libraryVisible, the result is always "" or an exact member of the library list', () => {
    for (const libraries of ALL_FIXTURES) {
      assertContainment(resolveSteamInstallPath, libraries)
    }
  })
})

describe('the containment gate is not vacuous', () => {
  // Has resolveSteamInstallPath's EXACT signature but skips containment --
  // returns selectedPath verbatim whenever a dropdown is shown. This is
  // exactly the defect T-34.13-10-01 exists to prevent.
  function resolveWithoutContainment(
    selectedPath: string,
    _libraries: SteamDialogLibraryOption[],
    libraryVisible: boolean
  ): string {
    if (!libraryVisible) {
      return ''
    }
    return selectedPath
  }

  it('returns the hostile "/etc" value verbatim when libraryVisible is true (the real implementation never does)', () => {
    expect(resolveWithoutContainment('/etc', threeLibraries, true)).toBe(
      '/etc'
    )
    expect(resolveSteamInstallPath('/etc', threeLibraries, true)).not.toBe(
      '/etc'
    )
  })

  it('returns the hostile "../../etc" value verbatim when libraryVisible is true (the real implementation never does)', () => {
    expect(
      resolveWithoutContainment('../../etc', threeLibraries, true)
    ).toBe('../../etc')
    expect(
      resolveSteamInstallPath('../../etc', threeLibraries, true)
    ).not.toBe('../../etc')
  })

  it('fails the SAME containment invariant block 3 proves the real implementation satisfies, run through the identical shared helper and case table', () => {
    // The real implementation satisfies the shared invariant on every fixture.
    for (const libraries of ALL_FIXTURES) {
      expect(() =>
        assertContainment(resolveSteamInstallPath, libraries)
      ).not.toThrow()
    }
    // The saboteur, run through the IDENTICAL assertContainment helper and
    // HOSTILE_INPUTS case table (not a weaker parallel set), fails it.
    expect(() =>
      assertContainment(resolveWithoutContainment, threeLibraries)
    ).toThrow()
  })
})
