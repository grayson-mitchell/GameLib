/**
 * Unit tests for installFormIpc.ts — the single shared handler body for the
 * phase's only new IPC surface, `isSteamBottleEligible` (D-09 + D-15
 * exposure half) and `persistBottleWineVersion` (D-14). Both `main.ts` and
 * `steamAuthFlowRegistration.ts` import from this module (Task 2) so the two
 * runtimes cannot drift.
 *
 * Mock strategy follows steam/__tests__/bottle.test.ts and games.test.ts:
 *  - backend/logger uses factory form (prevents transitive fs-extra crash)
 *  - electron mocked (app.getPath) — ../constants imports it for real here
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test (beforeEach below)
 *
 * ../games is NOT bare-automocked: automocking it would require loading the
 * real module and its ~20-module transitive import surface for real (the
 * same harness games.test.ts already carries) purely to introspect its
 * shape. Instead this file uses a lightweight factory mock whose default
 * export is itself a jest.fn() constructor — functionally identical to
 * `jest.mocked(SteamGame).mockImplementation(...)`, the plan's own explicit
 * fallback ("whichever the automock actually yields"), and it still supports
 * `expect(SteamGame).toHaveBeenCalledWith(...)` /
 * `expect(SteamGame).not.toHaveBeenCalled()` directly.
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path')
  }
}))

const mockCheckBottleEligibility = jest.fn()
jest.mock('../games', () => ({
  __esModule: true,
  default: jest.fn()
}))

jest.mock('../electronStores', () => ({
  steamBottleConfigStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn()
  }
}))

jest.mock('../bottle', () => ({
  persistBottleWineVersion: jest.fn(),
  getSteamBottleSettings: jest.fn()
}))

import SteamGame from '../games'
import { steamBottleConfigStore } from '../electronStores'
import { persistBottleWineVersion, getSteamBottleSettings } from '../bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import {
  getSteamBottleEligibilityVerdict,
  persistInstallFormWineVersion
} from '../installFormIpc'
import type { WineInstallation } from 'common/types'

const mockedSteamGame = SteamGame as unknown as jest.Mock
const mockedGetNodefault = steamBottleConfigStore.get_nodefault as jest.Mock
const mockedPersistBottleWineVersion = persistBottleWineVersion as jest.Mock
const mockedGetSteamBottleSettings = getSteamBottleSettings as jest.Mock

const persistedEngine: WineInstallation = {
  bin: '/opt/crossover/bin/wine',
  name: 'CrossOver 24',
  type: 'crossover'
}

// A sentinel deliberately distinct from persistedEngine, used to prove the
// D-15 exposure discriminator never delegates to getSteamBottleSettings().
const sentinelGlobalEngine: WineInstallation = {
  bin: '/sentinel/global/bin/wine',
  name: 'SentinelGlobalEngine',
  type: 'toolkit'
}

describe('installFormIpc.ts', () => {
  beforeEach(() => {
    mockedSteamGame.mockImplementation(() => ({
      checkBottleEligibility: mockCheckBottleEligibility
    }))
    mockedGetNodefault.mockReturnValue(undefined)
  })

  describe('getSteamBottleEligibilityVerdict — D-09 + D-15 exposure', () => {
    it('D-09: resolves the backend verdict for a numeric appName', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.eligible).toBe(true)
      expect(mockedSteamGame).toHaveBeenCalledWith('570')
      expect(mockCheckBottleEligibility).toHaveBeenCalledTimes(1)
    })

    it('D-09: a false backend verdict round-trips as false', async () => {
      mockCheckBottleEligibility.mockResolvedValue(false)

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.eligible).toBe(false)
    })

    it.each(['abc', '', '570; rm -rf /', '../../etc/passwd', '57 0'])(
      'T-34.13-07-01: a non-numeric appName %p fails closed and never constructs a SteamGame',
      async (hostileAppName) => {
        const result = await getSteamBottleEligibilityVerdict(hostileAppName)

        expect(result).toEqual({ eligible: false })
        expect(mockedSteamGame).not.toHaveBeenCalled()
      }
    )

    it('D-15 exposure: a persisted wineVersion is surfaced', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)
      mockedGetNodefault.mockImplementation((key: string) => {
        if (key === 'wineVersion') return persistedEngine
        if (key === 'wineCrossoverBottle') return DEFAULT_STEAM_BOTTLE_NAME
        return undefined
      })

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.wineVersion).toEqual(persistedEngine)
    })

    it('D-15 exposure DISCRIMINATOR: an empty bottle store yields wineVersion undefined, NOT the global engine', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)
      mockedGetNodefault.mockReturnValue(undefined)
      mockedGetSteamBottleSettings.mockReturnValue({
        wineVersion: sentinelGlobalEngine,
        wineCrossoverBottle: 'SentinelBottle'
      })

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.wineVersion).toBeUndefined()
      expect(verdict.bottleName).toBe(DEFAULT_STEAM_BOTTLE_NAME)
      expect(mockedGetSteamBottleSettings).not.toHaveBeenCalled()
    })

    it('D-15 exposure: bottleName comes from the wineCrossoverBottle key, not the bottleName key', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)
      mockedGetNodefault.mockImplementation((key: string) => {
        if (key === 'wineCrossoverBottle') return 'FromWineCrossoverBottle'
        if (key === 'bottleName') return 'FromBottleName'
        return undefined
      })

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.bottleName).toBe('FromWineCrossoverBottle')
    })
  })

  describe('persistInstallFormWineVersion — D-14', () => {
    it('D-14: a valid CrossOver engine is persisted and returns done', () => {
      const result = persistInstallFormWineVersion(persistedEngine)

      expect(result).toEqual({ status: 'done' })
      expect(mockedPersistBottleWineVersion).toHaveBeenCalledTimes(1)
      expect(mockedPersistBottleWineVersion).toHaveBeenCalledWith({
        bin: persistedEngine.bin,
        name: persistedEngine.name,
        type: persistedEngine.type
      })
    })

    it('D-14 containment: the renderer object is NOT persisted by reference and unknown keys are dropped', () => {
      const polluted = { ...persistedEngine, polluted: 'yes' }

      persistInstallFormWineVersion(polluted)

      const persistedArg = mockedPersistBottleWineVersion.mock.calls[0][0]
      expect(persistedArg).not.toBe(polluted)
      expect(Object.keys(persistedArg)).not.toContain('polluted')
    })

    it.each([
      null,
      undefined,
      'crossover',
      42,
      {},
      { bin: '', name: 'X', type: 'crossover' },
      { bin: '/x', name: '', type: 'crossover' },
      { bin: '/x', name: 'X', type: 'evil' },
      { bin: '/x', name: 'X', type: 'crossover', lib: 7 }
    ])(
      'T-34.13-07-02: structurally invalid payload %p is rejected before the store write',
      (badPayload) => {
        const result = persistInstallFormWineVersion(badPayload)

        expect(result.status).toBe('error')
        expect(mockedPersistBottleWineVersion).not.toHaveBeenCalled()
      }
    )

    it('Deferred-idea guard: a toolkit (GPTK) engine is ACCEPTED by the backend', () => {
      const result = persistInstallFormWineVersion(sentinelGlobalEngine)

      expect(result).toEqual({ status: 'done' })
      expect(mockedPersistBottleWineVersion).toHaveBeenCalledTimes(1)
    })
  })
})
