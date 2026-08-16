/**
 * Unit tests for platformCapture.ts — D-01/D-02/D-03/D-04 bulk PICS platform
 * capture (Phase 34.15, Plan 01).
 *
 * Mock strategy (mirrors library.test.ts / games.test.ts in this directory):
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in the Backend jest.config means all mock
 *    implementations must be re-established per describe/beforeEach
 */

import {
  parseOslistPlatforms,
  mergePlatformCapture,
  CapturedPlatforms
} from '../platformCapture'
import { steamMetadataStore } from '../electronStores'

jest.mock('../electronStores', () => ({
  steamMetadataStore: {
    get: jest.fn(),
    set: jest.fn(),
    entries: jest.fn()
  }
}))

const mockedGet = steamMetadataStore.get as jest.Mock
const mockedSet = steamMetadataStore.set as jest.Mock

// ── parseOslistPlatforms (Task 1) ────────────────────────────────────────────

describe('parseOslistPlatforms', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace-only string', '   '],
    ['a number', 42]
  ])('returns null for %s', (_name, input) => {
    expect(parseOslistPlatforms(input)).toBeNull()
  })

  it('returns null for a string of only unrecognised tokens', () => {
    expect(parseOslistPlatforms('unknowntoken')).toBeNull()
  })

  it("'unknowntoken,linux' -> linux only (unrecognised token does not block a real one)", () => {
    expect(parseOslistPlatforms('unknowntoken,linux')).toEqual<CapturedPlatforms>(
      {
        is_windows_native: false,
        is_mac_native: false,
        is_linux_native: true
      }
    )
  })

  it("'windows' -> windows only", () => {
    expect(parseOslistPlatforms('windows')).toEqual<CapturedPlatforms>({
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })
  })

  it("'windows,linux' -> windows + linux", () => {
    expect(parseOslistPlatforms('windows,linux')).toEqual<CapturedPlatforms>({
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: true
    })
  })

  it("'windows,macos,linux' -> all three", () => {
    expect(
      parseOslistPlatforms('windows,macos,linux')
    ).toEqual<CapturedPlatforms>({
      is_windows_native: true,
      is_mac_native: true,
      is_linux_native: true
    })
  })

  it("'macos' -> mac only", () => {
    expect(parseOslistPlatforms('macos')).toEqual<CapturedPlatforms>({
      is_windows_native: false,
      is_mac_native: true,
      is_linux_native: false
    })
  })

  it("'osx' (legacy synonym) -> is_mac_native: true", () => {
    const result = parseOslistPlatforms('osx')
    expect(result).not.toBeNull()
    expect(result?.is_mac_native).toBe(true)
    expect(result?.is_windows_native).toBe(false)
    expect(result?.is_linux_native).toBe(false)
  })

  it("' Windows , MacOS ' (whitespace + case) -> windows + mac", () => {
    expect(parseOslistPlatforms(' Windows , MacOS ')).toEqual<CapturedPlatforms>(
      {
        is_windows_native: true,
        is_mac_native: true,
        is_linux_native: false
      }
    )
  })

  describe('non-vacuity: the "write nothing" branch is not vacuous', () => {
    /** Saboteur: the shape this module must NEVER become — treats an
     *  absent/empty oslist as "every platform available" instead of "write
     *  nothing". Proves the real function's null-on-empty branch actually
     *  discriminates rather than being an untested no-op. */
    function treatsAbsentAsAvailable(oslist: unknown): CapturedPlatforms {
      if (typeof oslist === 'string' && oslist.trim().length > 0) {
        return parseOslistPlatforms(oslist) ?? {
          is_windows_native: true,
          is_mac_native: true,
          is_linux_native: true
        }
      }
      return { is_windows_native: true, is_mac_native: true, is_linux_native: true }
    }

    it('the saboteur DISAGREES with the real function on an empty string', () => {
      const sabotaged = treatsAbsentAsAvailable('')
      const real = parseOslistPlatforms('')

      expect(sabotaged).toEqual<CapturedPlatforms>({
        is_windows_native: true,
        is_mac_native: true,
        is_linux_native: true
      })
      expect(real).toBeNull()
    })
  })
})

// ── mergePlatformCapture (Task 2, D-02) ──────────────────────────────────────

describe('mergePlatformCapture (D-02)', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedSet.mockReset()
  })

  it('carries forward every existing field individually while writing the three new flags + platformsCaptured', () => {
    mockedGet.mockReturnValue({
      art_cover: 'https://example.test/cover.jpg',
      art_square: 'https://example.test/square.jpg',
      extra: { about: { description: 'x', shortDescription: 'y' }, genres: [] },
      mac_arch: '64',
      mac_arch_verified: true,
      mac_arch_source: 'macho',
      forcedWindowsViaBottle: true,
      is_delisted: false
    })

    mergePlatformCapture('123', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: true
    })

    expect(mockedSet).toHaveBeenCalledTimes(1)
    const [, written] = mockedSet.mock.calls[0]

    expect(written.art_cover).toBe('https://example.test/cover.jpg')
    expect(written.art_square).toBe('https://example.test/square.jpg')
    expect(written.extra).toEqual({
      about: { description: 'x', shortDescription: 'y' },
      genres: []
    })
    expect(written.is_delisted).toBe(false)
    expect(written.mac_arch).toBe('64')
    expect(written.mac_arch_verified).toBe(true)
    expect(written.mac_arch_source).toBe('macho')
    expect(written.forcedWindowsViaBottle).toBe(true)

    expect(written.is_windows_native).toBe(true)
    expect(written.is_mac_native).toBe(false)
    expect(written.is_linux_native).toBe(true)
    expect(written.platformsCaptured).toBe(true)
  })

  it('with NO existing entry, the write still succeeds with the three flags + platformsCaptured, and does not invent mac_arch', () => {
    mockedGet.mockReturnValue(undefined)

    mergePlatformCapture('456', {
      is_windows_native: true,
      is_mac_native: true,
      is_linux_native: false
    })

    expect(mockedSet).toHaveBeenCalledTimes(1)
    const [key, written] = mockedSet.mock.calls[0]

    expect(key).toBe('456')
    expect(written.is_windows_native).toBe(true)
    expect(written.is_mac_native).toBe(true)
    expect(written.is_linux_native).toBe(false)
    expect(written.platformsCaptured).toBe(true)
    expect(written.mac_arch).toBeUndefined()
  })

  it('wholesaleSet saboteur: a wholesale set() with only the new fields DROPS forcedWindowsViaBottle, while the real writer preserves it', () => {
    const existing = {
      forcedWindowsViaBottle: true,
      mac_arch: '64' as const
    }
    mockedGet.mockReturnValue(existing)

    /** Saboteur: the exact anti-pattern D-02/T-34.15-01-02 forbids — writes
     *  ONLY the new fields, discarding everything else on the entry. */
    function wholesaleSet(appId: string, platforms: CapturedPlatforms): void {
      steamMetadataStore.set(appId, {
        ...platforms,
        platformsCaptured: true
      } as never)
    }

    wholesaleSet('789', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })
    const [, sabotagedWrite] = mockedSet.mock.calls[0]
    expect(sabotagedWrite.forcedWindowsViaBottle).toBeUndefined()

    mockedSet.mockReset()
    mockedGet.mockReturnValue(existing)

    mergePlatformCapture('789', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })
    const [, realWrite] = mockedSet.mock.calls[0]
    expect(realWrite.forcedWindowsViaBottle).toBe(true)
  })
})
