/**
 * Unit tests for platformCapture.ts — D-01/D-02/D-03/D-04 bulk PICS platform
 * capture (Phase 34.15, Plan 01).
 *
 * Mock strategy (mirrors library.test.ts / games.test.ts in this directory):
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in the Backend jest.config means all mock
 *    implementations must be re-established per describe/beforeEach
 */

import { parseOslistPlatforms, CapturedPlatforms } from '../platformCapture'

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
