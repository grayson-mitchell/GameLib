/**
 * Unit tests for resolveSteamInstallTarget / listSteamLibraryTargets
 * (Phase 21-09) — D-08 registered-folder-only targeting, D-09 default-primary
 * + multi-library override resolution, and installdir sanitization (T-21-01).
 *
 * Mock strategy follows depot.test.ts/games.test.ts conventions:
 *  - backend/logger uses factory form (prevents transitive fs-extra native crash)
 *  - backend/utils is a minimal factory mock — only getSteamLibraries is needed
 *    here, avoiding the heavy gog/library.ts transitive chain the real
 *    utils.ts module pulls in
 *  - ../user is auto-mocked (jest.mock('../user')) — SteamUser.getClient()
 *    becomes a jest.fn(), matching depot.test.ts's established pattern
 */
import { join } from 'node:path'
import { logWarning } from 'backend/logger'
import { getSteamLibraries } from 'backend/utils'
import {
  listSteamLibraryTargets,
  resolveSteamInstallTarget
} from '../installLocation'
import { STEAM_PICS_TIMEOUT_MS } from '../withTimeout'
import { SteamUser } from '../user'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn()
}))

jest.mock('../user')

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    getProductInfo: jest.fn().mockResolvedValue({
      apps: {},
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    ...overrides
  }
}

function mockProductInfo(appId: number, installdir: string | undefined) {
  const appinfo = installdir === undefined ? {} : { config: { installdir } }
  return jest.fn().mockResolvedValue({
    apps: { [appId]: { appinfo } },
    packages: {},
    unknownApps: [],
    unknownPackages: []
  })
}

const APP_ID = '12345'

describe('listSteamLibraryTargets', () => {
  it('returns every registered library, primary first', async () => {
    jest
      .mocked(getSteamLibraries)
      .mockResolvedValue(['/lib/primary', '/lib/secondary'])

    const targets = await listSteamLibraryTargets()

    expect(targets).toEqual([
      {
        path: '/lib/primary',
        steamappsDir: join('/lib/primary', 'steamapps'),
        isPrimary: true
      },
      {
        path: '/lib/secondary',
        steamappsDir: join('/lib/secondary', 'steamapps'),
        isPrimary: false
      }
    ])
  })
})

describe('resolveSteamInstallTarget', () => {
  it('with one registered library, defaults to that library, no override needed', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'MyGame')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result).toEqual({
      targetSteamappsDir: join('/lib/only', 'steamapps'),
      installdir: 'MyGame'
    })
  })

  it('D-09: with multiple libraries and an override matching a registered library, uses it', async () => {
    jest
      .mocked(getSteamLibraries)
      .mockResolvedValue(['/lib/primary', '/lib/secondary'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'MyGame')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '/lib/secondary',
      platformToInstall: 'Windows'
    })

    expect(result.targetSteamappsDir).toBe(join('/lib/secondary', 'steamapps'))
  })

  it('D-08: an override NOT matching any registered library is rejected, defaults to primary', async () => {
    jest
      .mocked(getSteamLibraries)
      .mockResolvedValue(['/lib/primary', '/lib/secondary'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'MyGame')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '/some/unregistered/arbitrary/path',
      platformToInstall: 'Windows'
    })

    expect(result.targetSteamappsDir).toBe(join('/lib/primary', 'steamapps'))
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })

  it('T-21-01: a hostile PICS installdir (traversal) is sanitized to a safe fallback', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, '../../etc/passwd')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe(`app_${APP_ID}`)
    expect(result.installdir).not.toMatch(/\.\.|\/|\\/)
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })

  it('T-21-01: a hostile PICS installdir (path separator) is sanitized to a safe fallback', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'foo/bar')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe(`app_${APP_ID}`)
  })

  it('falls back to a safe appId-derived installdir when PICS returns nothing', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, undefined)
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe(`app_${APP_ID}`)
  })

  it('WR-01: a never-settling installdir getProductInfo does NOT hard-fail — fetchInstalldir bounds it, catches, and resolveSteamInstallTarget RESOLVES with a safe fallback dir (never rejects)', async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
      jest.mocked(SteamUser.getClient).mockReturnValue(
        makeFakeClient({
          // Simulates a stale-but-present CM socket: the installdir PICS
          // lookup never answers. fetchInstalldir's OWN withTimeout must bound
          // it and its catch must degrade to a benign undefined -> safe
          // fallback dir. This inner no-hard-fail contract is exactly what
          // WR-01's strictly-larger OUTER bound (games.ts) preserves: the
          // inner fallback must win its own race, not be pre-empted into a
          // fatal "pre-download timed out".
          getProductInfo: jest.fn().mockReturnValue(new Promise(() => {}))
        }) as never
      )

      const pending = resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })

      // Advance past the inner fetchInstalldir bound (STEAM_PICS_TIMEOUT_MS).
      await jest.advanceTimersByTimeAsync(STEAM_PICS_TIMEOUT_MS + 1000)

      const result = await pending
      // RESOLVED, not rejected: install proceeds with the safe fallback dir.
      expect(result.installdir).toBe(`app_${APP_ID}`)
      expect(result.targetSteamappsDir).toBe(join('/lib/only', 'steamapps'))
    } finally {
      jest.useRealTimers()
    }
  })

  it('T-21-05: rejects a non-numeric appId before any PICS lookup, still resolves via fallback installdir', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    const fakeClient = makeFakeClient()
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)

    const result = await resolveSteamInstallTarget('12345; rm -rf /', {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(fakeClient.getProductInfo).not.toHaveBeenCalled()
    expect(result.installdir.startsWith('app_')).toBe(true)
    expect(result.installdir).not.toMatch(/[/\\]/)
    expect(result.installdir.includes('..')).toBe(false)
  })

  it('WR-04: a quote-containing installdir falls back to a safe appId-derived name', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'Foo"bar')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe(`app_${APP_ID}`)
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })

  it('WR-04: a control-char/newline-containing installdir falls back to a safe appId-derived name', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'Foo\nBar')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe(`app_${APP_ID}`)
  })

  it('WR-04: a Windows drive-relative installdir (colon, no separator) falls back to a safe appId-derived name', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'C:foo')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe(`app_${APP_ID}`)
  })

  it('WR-04: a well-formed installdir with spaces/dots/dashes/underscores passes through unchanged', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'Half-Life 2')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe('Half-Life 2')
  })

  it('throws when no Steam libraries are registered at all', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue([])

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toThrow(/no registered Steam libraries/i)
  })
})
