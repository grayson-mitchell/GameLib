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
import { logWarning } from 'backend/logger'
import { resolveBridgeLaunchExe } from '../launchTarget'
import { SteamUser } from '../../user'
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
    jest.mocked(getBridgeBottleSettings).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BRIDGE_STEAMAPPS_DIR)
  })

  it('returns the WINDOWS launch entry executable (oslist filter), not a linux sibling entry', async () => {
    jest.mocked(SteamUser.getClient).mockReturnValue(
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    const result = await resolveBridgeLaunchExe(APP_ID)

    expect(result).toBe(
      join(BRIDGE_STEAMAPPS_DIR, 'common', 'Avernum 4', 'Avernum4.exe')
    )
    expect(getBottleSteamappsDir).toHaveBeenCalledWith('GameLibSteamBridge')
  })

  it('falls back to a single UNTAGGED launch entry (no oslist) for Windows-only titles -- D-UAT-24-03 (Avernum 5)', async () => {
    jest.mocked(SteamUser.getClient).mockReturnValue(
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    const result = await resolveBridgeLaunchExe('206040')

    expect(result).toBe(
      join(BRIDGE_STEAMAPPS_DIR, 'common', 'Avernum 5', 'Avernum 5.exe')
    )
  })

  it('prefers an explicit windows entry over an untagged sibling', async () => {
    jest.mocked(SteamUser.getClient).mockReturnValue(
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    const result = await resolveBridgeLaunchExe('206040')

    expect(result).toBe(
      join(BRIDGE_STEAMAPPS_DIR, 'common', 'Avernum 5', 'Avernum5.exe')
    )
  })

  it('returns undefined when the only launch entry is linux/macos (no windows launch target) -- never throws', async () => {
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(63000, {
          config: {
            installdir: 'Hoard',
            launch: {
              '0': { executable: 'hoard_mac', config: { oslist: 'macos' } }
            }
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    const result = await resolveBridgeLaunchExe('63000')

    expect(result).toBeUndefined()
  })

  it('returns undefined when config.launch is empty/absent', async () => {
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(63000, { config: {} })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    const result = await resolveBridgeLaunchExe('63000')

    expect(result).toBeUndefined()
  })

  it('rejects a non-numeric appId via NUMERIC_APP_ID before any PICS call', async () => {
    const client = makeFakeClient()
    jest
      .mocked(SteamUser.getClient)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValue(client as any)

    const result = await resolveBridgeLaunchExe('not-a-number')

    expect(result).toBeUndefined()
    expect(client.getProductInfo).not.toHaveBeenCalled()
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })

  it('returns undefined when SteamUser.getClient() is absent (no second logon attempted)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.mocked(SteamUser.getClient).mockReturnValue(undefined as any)

    const result = await resolveBridgeLaunchExe(APP_ID)

    expect(result).toBeUndefined()
  })

  it('returns undefined (never throws) when getProductInfo rejects', async () => {
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: jest.fn().mockRejectedValue(new Error('PICS down'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )

    const result = await resolveBridgeLaunchExe(APP_ID)

    expect(result).toBeUndefined()
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })
})
