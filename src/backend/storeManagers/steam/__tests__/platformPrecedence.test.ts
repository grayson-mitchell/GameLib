/**
 * Unit tests for platformPrecedence.ts — the shared freshest-write-wins
 * decision function (quick task 260816-qcn, closing todo
 * 2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md /
 * Phase 34.15 review finding WR-02).
 *
 * No mocks needed — the module is dependency-free by design (mirrors
 * `flagsCensus.test.ts`'s no-mock idiom).
 */

import {
  resolvePlatformWrite,
  PlatformTriple,
  PlatformSignalSource,
  PlatformWriteResolution,
  ExistingPlatformEntry
} from '../platformPrecedence'

const NOW = 1_000_000
const OLDER = NOW - 60_000
const NEWER = NOW + 60_000

const APPDETAILS_TRIPLE: PlatformTriple = {
  is_windows_native: true,
  is_mac_native: true,
  is_linux_native: false
}

const PICS_TRIPLE: PlatformTriple = {
  is_windows_native: true,
  is_mac_native: false,
  is_linux_native: true
}

describe('resolvePlatformWrite', () => {
  it('PICS declines to overwrite a strictly-newer, complete appdetails capture', () => {
    const existing: ExistingPlatformEntry = {
      ...APPDETAILS_TRIPLE,
      platformsSource: 'appdetails',
      platformsCapturedAt: NEWER
    }

    const result = resolvePlatformWrite(existing, PICS_TRIPLE, 'pics', NOW)

    expect(result.accepted).toBe(false)
    expect(result.platforms).toEqual(APPDETAILS_TRIPLE)
    expect(result.platformsSource).toBe('appdetails')
    expect(result.platformsCapturedAt).toBe(NEWER)
  })

  it('appdetails declines to overwrite a strictly-newer, complete PICS capture (mirror)', () => {
    const existing: ExistingPlatformEntry = {
      ...PICS_TRIPLE,
      platformsSource: 'pics',
      platformsCapturedAt: NEWER
    }

    const result = resolvePlatformWrite(
      existing,
      APPDETAILS_TRIPLE,
      'appdetails',
      NOW
    )

    expect(result.accepted).toBe(false)
    expect(result.platforms).toEqual(PICS_TRIPLE)
    expect(result.platformsSource).toBe('pics')
    expect(result.platformsCapturedAt).toBe(NEWER)
  })

  it('PICS wins when it is the newer capture', () => {
    const existing: ExistingPlatformEntry = {
      ...APPDETAILS_TRIPLE,
      platformsSource: 'appdetails',
      platformsCapturedAt: OLDER
    }

    const result = resolvePlatformWrite(existing, PICS_TRIPLE, 'pics', NOW)

    expect(result.accepted).toBe(true)
    expect(result.platforms).toEqual(PICS_TRIPLE)
    expect(result.platformsSource).toBe('pics')
    expect(result.platformsCapturedAt).toBe(NOW)
  })

  it('appdetails wins when it is the newer capture', () => {
    const existing: ExistingPlatformEntry = {
      ...PICS_TRIPLE,
      platformsSource: 'pics',
      platformsCapturedAt: OLDER
    }

    const result = resolvePlatformWrite(
      existing,
      APPDETAILS_TRIPLE,
      'appdetails',
      NOW
    )

    expect(result.accepted).toBe(true)
    expect(result.platforms).toEqual(APPDETAILS_TRIPLE)
    expect(result.platformsSource).toBe('appdetails')
    expect(result.platformsCapturedAt).toBe(NOW)
  })

  it('equal timestamps -> incoming write is accepted (a tie goes to the incoming writer)', () => {
    const existing: ExistingPlatformEntry = {
      ...APPDETAILS_TRIPLE,
      platformsSource: 'appdetails',
      platformsCapturedAt: NOW
    }

    const result = resolvePlatformWrite(existing, PICS_TRIPLE, 'pics', NOW)

    expect(result.accepted).toBe(true)
    expect(result.platforms).toEqual(PICS_TRIPLE)
    expect(result.platformsSource).toBe('pics')
    expect(result.platformsCapturedAt).toBe(NOW)
  })

  it.each<[string, PlatformSignalSource]>([
    ['pics', 'pics'],
    ['appdetails', 'appdetails']
  ])(
    'a legacy entry with NO platformsCapturedAt is writable by %s',
    (_name, source) => {
      const existing: ExistingPlatformEntry = { ...APPDETAILS_TRIPLE }

      const result = resolvePlatformWrite(existing, PICS_TRIPLE, source, NOW)

      expect(result.accepted).toBe(true)
      expect(result.platformsSource).toBe(source)
      expect(result.platformsCapturedAt).toBe(NOW)
    }
  )

  it('existing is null -> accepted', () => {
    const result = resolvePlatformWrite(null, PICS_TRIPLE, 'pics', NOW)
    expect(result.accepted).toBe(true)
  })

  it('existing is undefined -> accepted', () => {
    const result = resolvePlatformWrite(undefined, PICS_TRIPLE, 'pics', NOW)
    expect(result.accepted).toBe(true)
  })

  it('existing is an empty object -> accepted', () => {
    const result = resolvePlatformWrite({}, PICS_TRIPLE, 'pics', NOW)
    expect(result.accepted).toBe(true)
  })

  it('a corrupted NaN platformsCapturedAt degrades to indefinitely-old -> accepted, never a NaN comparison', () => {
    const existing: ExistingPlatformEntry = {
      ...APPDETAILS_TRIPLE,
      platformsSource: 'appdetails',
      platformsCapturedAt: NaN
    }

    const result = resolvePlatformWrite(existing, PICS_TRIPLE, 'pics', NOW)

    expect(result.accepted).toBe(true)
  })

  it('a corrupted string platformsCapturedAt degrades to indefinitely-old -> accepted', () => {
    const existing = {
      ...APPDETAILS_TRIPLE,
      platformsSource: 'appdetails' as const,
      platformsCapturedAt: 'not-a-number' as unknown as number
    }

    const result = resolvePlatformWrite(existing, PICS_TRIPLE, 'pics', NOW)

    expect(result.accepted).toBe(true)
  })

  it('a strictly-newer existing with a partial triple (is_mac_native undefined) is still accepted (hard constraint 2: an incomplete triple cannot win)', () => {
    const existing: ExistingPlatformEntry = {
      is_windows_native: true,
      is_mac_native: undefined,
      is_linux_native: false,
      platformsSource: 'pics',
      platformsCapturedAt: NEWER
    }

    const result = resolvePlatformWrite(
      existing,
      APPDETAILS_TRIPLE,
      'appdetails',
      NOW
    )

    expect(result.accepted).toBe(true)
    expect(result.platforms).toEqual(APPDETAILS_TRIPLE)
  })

  it('on decline, platformsSource falls back to the incoming source when the existing entry has a timestamp but no recorded source', () => {
    const existing: ExistingPlatformEntry = {
      ...APPDETAILS_TRIPLE,
      platformsCapturedAt: NEWER
      // deliberately no platformsSource
    }

    const result = resolvePlatformWrite(existing, PICS_TRIPLE, 'pics', NOW)

    expect(result.accepted).toBe(false)
    expect(result.platformsSource).toBe('pics')
  })

  describe('non-vacuity: a last-write-always-wins saboteur disagrees with the real function', () => {
    /** Saboteur: the EXACT shipped behaviour this task replaces — ignores
     *  timestamps entirely and always accepts the incoming write. Proves
     *  the strictly-newer-existing branch actually discriminates rather
     *  than being an untested no-op. */
    function lastWriteAlwaysWins(
      _existing: ExistingPlatformEntry | null | undefined,
      incoming: PlatformTriple,
      source: PlatformSignalSource,
      capturedAt: number
    ): PlatformWriteResolution {
      return {
        platforms: incoming,
        platformsSource: source,
        platformsCapturedAt: capturedAt,
        accepted: true
      }
    }

    it('disagrees with resolvePlatformWrite on the strictly-newer-existing case', () => {
      const existing: ExistingPlatformEntry = {
        ...APPDETAILS_TRIPLE,
        platformsSource: 'appdetails',
        platformsCapturedAt: NEWER
      }

      const real = resolvePlatformWrite(existing, PICS_TRIPLE, 'pics', NOW)
      const sabotaged = lastWriteAlwaysWins(existing, PICS_TRIPLE, 'pics', NOW)

      expect(real.accepted).toBe(false)
      expect(sabotaged.accepted).toBe(true)
      expect(real.platforms).not.toEqual(sabotaged.platforms)
      expect(real.platformsCapturedAt).not.toBe(sabotaged.platformsCapturedAt)
    })
  })
})
