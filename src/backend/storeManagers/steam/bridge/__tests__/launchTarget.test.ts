/**
 * Unit tests for resolveBridgeLaunchExe (Phase 24 Plan 08, R4/R6, review
 * finding #2) -- Windows launch-exe resolution from PICS appinfo
 * `config.launch`, filtered to the entry whose OWN `config.oslist ===
 * 'windows'`, joined onto the bridge-bottle install dir.
 *
 * Mock strategy follows installLocation.test.ts's established precedent:
 *  - backend/logger factory mock (prevents transitive fs-extra native crash)
 *  - ../user auto-mocked (jest.mock('../../user')) -- SteamUser.getClient()
 *    becomes a jest.fn()
 *  - ../../bottle factory-mocked -- getBridgeBottleSettings/
 *    getBottleSteamappsDir only, avoiding bottle.ts's heavy backend/config
 *    transitive chain
 */
import { join } from 'node:path'
import { logInfo, logWarning } from 'backend/logger'
import {
  resolveBridgeLaunchExe,
  backfillBridgeLaunchTargets
} from '../launchTarget'
import { SteamUser } from '../../user'
import { getAnonymousPicsClient } from '../../anonymousClient'
import { readBridgeVerdict, setBridgeLaunchTarget } from '../bridgeVerdict'
import { getBridgeBottleSettings, getBottleSteamappsDir } from '../../bottle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('../../user')

jest.mock('../../anonymousClient', () => ({
  ...jest.requireActual('../../anonymousClient'),
  getAnonymousPicsClient: jest.fn()
}))

jest.mock('../bridgeVerdict', () => ({
  readBridgeVerdict: jest.fn(),
  setBridgeLaunchTarget: jest.fn()
}))

jest.mock('../../bottle', () => ({
  getBridgeBottleSettings: jest.fn(),
  getBottleSteamappsDir: jest.fn()
}))

const APP_ID = '206020' // Avernum 4 (24-03 SUMMARY)
const BRIDGE_STEAMAPPS_DIR = '/mock/bridge/bottle/steamapps'

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

function mockProductInfo(appId: number, appinfo: Record<string, unknown>) {
  return jest.fn().mockResolvedValue({
    apps: { [appId]: { appinfo } },
    packages: {},
    unknownApps: [],
    unknownPackages: []
  })
}

describe('resolveBridgeLaunchExe', () => {
  beforeEach(() => {
    jest.mocked(getAnonymousPicsClient).mockReset()
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReset()
    jest.mocked(SteamUser.ensureConnected).mockClear()
    jest.mocked(readBridgeVerdict).mockReset()
    jest.mocked(setBridgeLaunchTarget).mockReset()
    jest.mocked(getBridgeBottleSettings).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BRIDGE_STEAMAPPS_DIR)
  })

  it('returns the WINDOWS launch entry executable (oslist filter), not a linux sibling entry', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(206020, {
          config: {
            installdir: 'Avernum 4',
            launch: {
              '0': {
                executable: 'avernum4_linux',
                config: { oslist: 'linux' }
              },
              '1': {
                executable: 'Avernum4.exe',
                config: { oslist: 'windows' }
              }
            }
          }
        })
      }) as any
    )

    const result = await resolveBridgeLaunchExe(APP_ID)

    expect(result).toBe(
      join(BRIDGE_STEAMAPPS_DIR, 'common', 'Avernum 4', 'Avernum4.exe')
    )
    expect(getBottleSteamappsDir).toHaveBeenCalledWith('GameLibSteamBridge')
    // quick/261016-u1w (D-B threading): getBridgeBottleSettings is now
    // per-appId so a per-game bridge bottle can be resolved.
    expect(getBridgeBottleSettings).toHaveBeenCalledWith(APP_ID)
  })

  it('falls back to a single UNTAGGED launch entry (no oslist) for Windows-only titles -- D-UAT-24-03 (Avernum 5)', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(206040, {
          config: {
            installdir: 'Avernum 5',
            launch: {
              // Old Spiderweb Windows-only title: one entry, no oslist tag.
              '0': { executable: 'Avernum 5.exe' }
            }
          }
        })
      }) as any
    )

    const result = await resolveBridgeLaunchExe('206040')

    expect(result).toBe(
      join(BRIDGE_STEAMAPPS_DIR, 'common', 'Avernum 5', 'Avernum 5.exe')
    )
  })

  it('splits a backslash-separated subfolder executable into path segments -- 51-19 live gate (XCOM 200510)', async () => {
    // PICS carries Windows-style separators verbatim. Joined as-is on macOS
    // the backslashes are literal filename characters, so objdump was handed
    // a path that does not exist.
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(200510, {
          config: {
            installdir: 'XCom-Enemy-Unknown',
            launch: {
              '0': {
                executable: 'Binaries\\Win32\\XComGame.exe',
                config: { oslist: 'windows' }
              }
            }
          }
        })
      }) as never
    )

    const result = await resolveBridgeLaunchExe('200510')

    expect(result).toBe(
      join(
        BRIDGE_STEAMAPPS_DIR,
        'common',
        'XCom-Enemy-Unknown',
        'Binaries',
        'Win32',
        'XComGame.exe'
      )
    )
  })

  it('prefers an explicit windows entry over an untagged sibling', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(206040, {
          config: {
            installdir: 'Avernum 5',
            launch: {
              '0': { executable: 'untagged.exe' },
              '1': { executable: 'Avernum5.exe', config: { oslist: 'windows' } }
            }
          }
        })
      }) as any
    )

    const result = await resolveBridgeLaunchExe('206040')

    expect(result).toBe(
      join(BRIDGE_STEAMAPPS_DIR, 'common', 'Avernum 5', 'Avernum5.exe')
    )
  })

  it('returns undefined when the only launch entry is linux/macos (no windows launch target) -- never throws', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(63000, {
          config: {
            installdir: 'Hoard',
            launch: {
              '0': { executable: 'hoard_mac', config: { oslist: 'macos' } }
            }
          }
        })
      }) as any
    )

    const result = await resolveBridgeLaunchExe('63000')

    expect(result).toBeUndefined()
  })

  it('returns undefined when config.launch is empty/absent', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(63000, { config: {} })
      }) as any
    )

    const result = await resolveBridgeLaunchExe('63000')

    expect(result).toBeUndefined()
  })

  it('rejects a non-numeric appId via NUMERIC_APP_ID before any PICS call', async () => {
    const client = makeFakeClient()
    jest
      .mocked(getAnonymousPicsClient)

      .mockResolvedValue(client as any)

    const result = await resolveBridgeLaunchExe('not-a-number')

    expect(result).toBeUndefined()
    expect(client.getProductInfo).not.toHaveBeenCalled()
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })

  it('returns undefined (never throws) when getProductInfo rejects', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: jest.fn().mockRejectedValue(new Error('PICS down'))
      }) as any
    )

    const result = await resolveBridgeLaunchExe(APP_ID)

    expect(result).toBeUndefined()
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })
})

describe('resolveBridgeLaunchExe — anonymous PICS, open session, stored record (Phase 54, 54-06)', () => {
  const GATED_ID = 230070
  const publicOnlyClient = () =>
    makeFakeClient({
      getProductInfo: jest.fn().mockResolvedValue({
        apps: {
          [GATED_ID]: {
            appinfo: { appid: GATED_ID, public_only: '1' },
            missingToken: true
          }
        }
      })
    })
  const fullAppinfo = {
    config: {
      installdir: 'Game',
      launch: {
        '0': {
          executable: 'Binaries\\Win32\\Game.exe',
          config: { oslist: 'windows' }
        }
      }
    }
  }
  const gameExe = join(
    BRIDGE_STEAMAPPS_DIR,
    'common',
    'Game',
    'Binaries',
    'Win32',
    'Game.exe'
  )

  beforeEach(() => {
    jest.mocked(getAnonymousPicsClient).mockReset()
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReset()
    jest.mocked(SteamUser.ensureConnected).mockClear()
    jest.mocked(readBridgeVerdict).mockReset()
    jest.mocked(setBridgeLaunchTarget).mockReset()
    jest.mocked(getBridgeBottleSettings).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    } as never)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BRIDGE_STEAMAPPS_DIR)
  })

  it('anonymous full answer resolves and records the target, never touching a session', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(GATED_ID, fullAppinfo)
      }) as never
    )

    expect(await resolveBridgeLaunchExe(String(GATED_ID))).toBe(gameExe)
    expect(setBridgeLaunchTarget).toHaveBeenCalledWith(String(GATED_ID), {
      executable: 'Binaries\\Win32\\Game.exe',
      installdir: 'Game'
    })
    expect(SteamUser.acquireOpenAuthenticated).not.toHaveBeenCalled()
    expect(SteamUser.ensureConnected).not.toHaveBeenCalled()
  })

  it('public_only with an open session resolves from the session, records it, releases once', async () => {
    jest
      .mocked(getAnonymousPicsClient)
      .mockResolvedValue(publicOnlyClient() as never)
    const release = jest.fn()
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReturnValue({
      client: makeFakeClient({
        getProductInfo: mockProductInfo(GATED_ID, fullAppinfo)
      }),
      release
    } as never)

    expect(await resolveBridgeLaunchExe(String(GATED_ID))).toBe(gameExe)
    expect(setBridgeLaunchTarget).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('public_only with no session resolves from the stored record', async () => {
    jest
      .mocked(getAnonymousPicsClient)
      .mockResolvedValue(publicOnlyClient() as never)
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReturnValue(null)
    jest.mocked(readBridgeVerdict).mockReturnValue({
      launchTarget: {
        executable: 'Binaries\\Win32\\Game.exe',
        installdir: 'Game'
      }
    })

    expect(await resolveBridgeLaunchExe(String(GATED_ID))).toBe(gameExe)
    expect(setBridgeLaunchTarget).not.toHaveBeenCalled()
    expect(jest.mocked(logInfo)).toHaveBeenCalledWith(
      expect.stringContaining('stored'),
      'Steam'
    )
  })

  it('a tampered stored installdir is rejected by containment and yields undefined', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(null)
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReturnValue(null)
    jest.mocked(readBridgeVerdict).mockReturnValue({
      launchTarget: { executable: 'Game.exe', installdir: '../../escape' }
    })

    await expect(
      resolveBridgeLaunchExe(String(GATED_ID))
    ).resolves.toBeUndefined()
  })

  it('no answer anywhere returns undefined without throwing', async () => {
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(null)
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReturnValue(null)
    jest.mocked(readBridgeVerdict).mockReturnValue(undefined)

    await expect(
      resolveBridgeLaunchExe(String(GATED_ID))
    ).resolves.toBeUndefined()
    expect(SteamUser.ensureConnected).not.toHaveBeenCalled()
  })
})

describe('backfillBridgeLaunchTargets', () => {
  const entry = (installdir: string, executable: string) => ({
    appinfo: {
      config: {
        installdir,
        launch: { '0': { executable, config: { oslist: 'windows' } } }
      }
    }
  })

  beforeEach(() => {
    jest.mocked(readBridgeVerdict).mockReset()
    jest.mocked(setBridgeLaunchTarget).mockReset()
    jest.mocked(logWarning).mockClear()
  })

  it('records one target per app from ONE bulk call', async () => {
    jest.mocked(readBridgeVerdict).mockReturnValue(undefined)
    const client = {
      getProductInfo: jest.fn().mockResolvedValue({
        apps: { 230070: entry('A', 'a.exe'), 63000: entry('B', 'b\\b.exe') }
      })
    }

    const n = await backfillBridgeLaunchTargets(client, [
      '230070',
      '63000',
      'bad'
    ])

    expect(n).toBe(2)
    expect(client.getProductInfo).toHaveBeenCalledTimes(1)
    expect(client.getProductInfo).toHaveBeenCalledWith(
      [230070, 63000],
      [],
      true
    )
    expect(setBridgeLaunchTarget).toHaveBeenCalledWith('63000', {
      executable: 'b\\b.exe',
      installdir: 'B'
    })
  })

  it('skips apps that already have a record and makes no call when all do', async () => {
    jest.mocked(readBridgeVerdict).mockReturnValue({
      launchTarget: { executable: 'a.exe', installdir: 'A' }
    })
    const client = { getProductInfo: jest.fn() }

    expect(await backfillBridgeLaunchTargets(client, ['230070'])).toBe(0)
    expect(client.getProductInfo).not.toHaveBeenCalled()
  })

  it('never throws when the bulk call rejects', async () => {
    jest.mocked(readBridgeVerdict).mockReturnValue(undefined)
    const client = {
      getProductInfo: jest.fn().mockRejectedValue(new Error('down'))
    }

    expect(await backfillBridgeLaunchTargets(client, ['230070'])).toBe(0)
    expect(logWarning).toHaveBeenCalled()
  })
})
