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
  },
  steamMetadataStore: {
    get: jest.fn()
  }
}))

jest.mock('../bottle', () => ({
  persistBottleWineVersion: jest.fn(),
  getSteamBottleSettings: jest.fn()
}))

// 34.13 review A-04/A-15: the seam now cross-checks the submitted `bin`
// against the engines GameLib itself detected, so the detector is part of
// this trust boundary and must be drivable per-test.
const mockGetAlternativeWine = jest.fn()
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => ({ getAlternativeWine: mockGetAlternativeWine })
  }
}))

import SteamGame from '../games'
import { steamBottleConfigStore, steamMetadataStore } from '../electronStores'
import { persistBottleWineVersion, getSteamBottleSettings } from '../bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import {
  getSteamBottleEligibilityVerdict,
  persistInstallFormWineVersion
} from '../installFormIpc'
import type { WineInstallation } from 'common/types'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const mockedSteamGame = SteamGame as unknown as jest.Mock
const mockedGetNodefault = steamBottleConfigStore.get_nodefault as jest.Mock
const mockedMetadataGet = steamMetadataStore.get as jest.Mock
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
    // Default: uncaptured/absent cache entry — the timeout/offline shape.
    // Specs that need a captured entry override this per-test.
    mockedMetadataGet.mockReturnValue(undefined)
    // Default: the engine the persist specs submit IS detected, so the
    // pre-existing specs measure what they were written to measure.
    mockGetAlternativeWine.mockResolvedValue([
      persistedEngine,
      sentinelGlobalEngine
    ])
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

        expect(result).toEqual({
          eligible: false,
          hasWindowsDepot: false,
          platformsCaptured: false
        })
        expect(mockedSteamGame).not.toHaveBeenCalled()
      }
    )

    // 34.13 review WR-10. The regex-only guard was `NUMERIC_APP_ID.test(x)`,
    // and `RegExp.prototype.test` COERCES its argument to a string — so a
    // numeric `123` (or a `['123']`, or a `{toString: () => '123'}`) passed
    // the guard and reached `new SteamGame(...)`, where `this.appId` is then
    // a non-string for every downstream `steamMetadataStore.get(this.appId)`
    // and template-literal path. The seam now takes `unknown` and rejects on
    // `typeof !== 'string'` BEFORE the regex.
    it.each<unknown>([123, ['570'], null, undefined, {}])(
      'WR-10: a non-STRING appName %p fails closed and never constructs a SteamGame',
      async (hostileAppName: unknown) => {
        const result = await getSteamBottleEligibilityVerdict(hostileAppName)

        expect(result).toEqual({
          eligible: false,
          hasWindowsDepot: false,
          platformsCaptured: false
        })
        expect(mockedSteamGame).not.toHaveBeenCalled()
      }
    )

    it('WR-10-RED: the pre-fix regex-only guard ACCEPTED those same non-string values -- proving the typeof term is load-bearing', () => {
      // The shipped guard, written out. `test()` coerces, so every one of
      // these is a false ACCEPT the new typeof term now refuses.
      const preFixGuard = (x: unknown) => /^\d+$/.test(x as string)
      expect(preFixGuard(123)).toBe(true)
      expect(preFixGuard(['570'])).toBe(true)
      // ...and the fixed guard's own typeof term refuses both.
      expect(typeof 123 === 'string').toBe(false)
      expect(typeof ['570'] === 'string').toBe(false)
    })

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

  describe('34.14 D-02/D-03: the depot pair is READ from steamMetadataStore, never hardcoded', () => {
    it('a captured cache entry with a Windows depot yields hasWindowsDepot: true, platformsCaptured: true', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)
      mockedMetadataGet.mockReturnValue({
        is_windows_native: true,
        platformsCaptured: true
      })

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.hasWindowsDepot).toBe(true)
      expect(verdict.platformsCaptured).toBe(true)
    })

    it('34.13 fence: a captured-and-absent entry yields hasWindowsDepot: false, platformsCaptured: true — the genuinely-absent case', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)
      mockedMetadataGet.mockReturnValue({
        is_windows_native: false,
        platformsCaptured: true
      })

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.hasWindowsDepot).toBe(false)
      expect(verdict.platformsCaptured).toBe(true)
    })

    it('260816-hdg: a PRE-D-17 RESIDUE entry (platformsCaptured:true, no is_windows_native) yields platformsCaptured: FALSE, so D-04 fail-open can offer Windows', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)
      // THE 370-ENTRY RESIDUE SHAPE. Before this fix the verdict reported
      // captured:true / depot:false — the worst pair, because it settles the
      // question as "no Windows build" with full confidence and suppresses the
      // 34.14 fail-open. hasWindowsDepot stays false (absent is never coerced
      // to available); only the CAPTURED claim is cleared.
      mockedMetadataGet.mockReturnValue({
        platformsCaptured: true
      })

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.hasWindowsDepot).toBe(false)
      expect(verdict.platformsCaptured).toBe(false)
    })

    it('an absent/uncaptured cache entry yields hasWindowsDepot: false, platformsCaptured: false — the timeout/offline case', async () => {
      mockCheckBottleEligibility.mockResolvedValue(true)
      mockedMetadataGet.mockReturnValue(undefined)

      const verdict = await getSteamBottleEligibilityVerdict('570')

      expect(verdict.hasWindowsDepot).toBe(false)
      expect(verdict.platformsCaptured).toBe(false)
    })
  })

  describe('persistInstallFormWineVersion — D-14', () => {
    it('D-14: a valid CrossOver engine is persisted and returns done', async () => {
      const result = await persistInstallFormWineVersion(persistedEngine)

      expect(result).toEqual({ status: 'done' })
      expect(mockedPersistBottleWineVersion).toHaveBeenCalledTimes(1)
      expect(mockedPersistBottleWineVersion).toHaveBeenCalledWith({
        bin: persistedEngine.bin,
        name: persistedEngine.name,
        type: persistedEngine.type
      })
    })

    it('D-14 containment: the renderer object is NOT persisted by reference and unknown keys are dropped', async () => {
      const polluted = { ...persistedEngine, polluted: 'yes' }

      await persistInstallFormWineVersion(polluted)

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
      async (badPayload) => {
        const result = await persistInstallFormWineVersion(badPayload)

        expect(result.status).toBe('error')
        expect(mockedPersistBottleWineVersion).not.toHaveBeenCalled()
      }
    )

    it('Deferred-idea guard: a toolkit (GPTK) engine is ACCEPTED by the backend', async () => {
      const result = await persistInstallFormWineVersion(sentinelGlobalEngine)

      expect(result).toEqual({ status: 'done' })
      expect(mockedPersistBottleWineVersion).toHaveBeenCalledTimes(1)
    })

    // ── 34.13 review A-04 / A-15: PROVENANCE ────────────────────────────────
    //
    // Everything above validates SHAPE. The end of this chain is a SPAWN:
    // getSteamBottleSettings() hands the persisted value to runWineCommand,
    // launcher.ts does `wineVersion.bin.replaceAll("'", '')` and executes it,
    // and wineserver is spawned with no existence check at all. validWine()
    // is purely existsSync(bin) — it proves the file is THERE, never that
    // GameLib discovered it. 539bc979c's `type === 'crossover'` fast-path
    // does not help: a payload DECLARING that type bypasses it entirely.
    //
    // The known-bad is the review's own literal:
    //   { bin: '/Users/x/Downloads/anything', name: 'X', type: 'crossover' }
    const ATTACKER_PAYLOAD: WineInstallation = {
      bin: '/Users/x/Downloads/anything',
      name: 'X',
      type: 'crossover'
    }

    it('A-15: a well-SHAPED payload whose bin is not among the detected engines is refused', async () => {
      mockGetAlternativeWine.mockResolvedValue([persistedEngine])

      const result = await persistInstallFormWineVersion(ATTACKER_PAYLOAD)

      expect(result).toEqual({ status: 'error', error: 'unknown-bin' })
      expect(mockedPersistBottleWineVersion).not.toHaveBeenCalled()
    })

    it('A-15: declaring type "crossover" does not buy a bypass — the SHAPE guards all pass and it is still refused', async () => {
      mockGetAlternativeWine.mockResolvedValue([persistedEngine])

      // Prove the payload is structurally valid: every field the pre-A-15
      // seam checked is well-formed, so the ONLY thing rejecting it is
      // provenance.
      expect(typeof ATTACKER_PAYLOAD.bin).toBe('string')
      expect(ATTACKER_PAYLOAD.bin.length).toBeGreaterThan(0)
      expect(typeof ATTACKER_PAYLOAD.name).toBe('string')
      expect(ATTACKER_PAYLOAD.type).toBe('crossover')

      const result = await persistInstallFormWineVersion(ATTACKER_PAYLOAD)

      expect(result.error).toBe('unknown-bin')
    })

    it('A-15 DISCRIMINATOR: a DETECTED engine is still persisted — the gate cannot pass by refusing everything', async () => {
      mockGetAlternativeWine.mockResolvedValue([
        persistedEngine,
        ATTACKER_PAYLOAD
      ])

      const result = await persistInstallFormWineVersion(persistedEngine)

      expect(result).toEqual({ status: 'done' })
      expect(mockedPersistBottleWineVersion).toHaveBeenCalledTimes(1)
    })

    it('A-15: fails CLOSED when the detector rejects — an unavailable detector cannot vouch for anything', async () => {
      mockGetAlternativeWine.mockRejectedValue(new Error('detector exploded'))

      const result = await persistInstallFormWineVersion(persistedEngine)

      expect(result).toEqual({ status: 'error', error: 'unknown-bin' })
      expect(mockedPersistBottleWineVersion).not.toHaveBeenCalled()
    })

    it('A-15: fails CLOSED when the detector returns an empty list', async () => {
      mockGetAlternativeWine.mockResolvedValue([])

      const result = await persistInstallFormWineVersion(persistedEngine)

      expect(result.status).toBe('error')
      expect(mockedPersistBottleWineVersion).not.toHaveBeenCalled()
    })

    it('A-15: the rejection never echoes the submitted bin path', async () => {
      mockGetAlternativeWine.mockResolvedValue([persistedEngine])
      const { logWarning } = jest.requireMock('backend/logger')
      ;(logWarning as jest.Mock).mockClear()

      await persistInstallFormWineVersion(ATTACKER_PAYLOAD)

      const logged = (logWarning as jest.Mock).mock.calls
        .flat()
        .map(String)
        .join(' ')
      expect(logged).toContain('provenance half')
      expect(logged).not.toContain(ATTACKER_PAYLOAD.bin)
      expect(logged).not.toContain('Downloads')
    })
  })
})

/**
 * Task 3 (D-02 no-fork invariant): makes "getSteamBottleEligibilityVerdict is
 * defined in exactly ONE place" a CHECKABLE, permanent guard rather than a
 * comment. `main.ts` and `steamAuthFlowRegistration.ts` are deliberately NOT
 * edited by this plan — the widening reaches both runtimes by construction,
 * because both import the identifier from this single shared body. This
 * describe block proves that construction rather than merely asserting it.
 *
 * Scan scope is PRODUCTION source under `src/` (`__tests__`/`__mocks__`
 * excluded, following `externalDynamicImportGate.test.ts`'s own
 * `collectSourceFiles` convention) — this is also what keeps the
 * non-vacuity spec's inline two-definition specimen from being picked up by
 * the real scan: the specimen lives in THIS file, which is itself under
 * `__tests__` and therefore out of scope for the real-source walk.
 */
const REPO_ROOT = join(__dirname, '../../../../..')
const SRC_ROOT = join(REPO_ROOT, 'src')

const HANDLER_DEFINITION_PATTERN =
  /export async function getSteamBottleEligibilityVerdict\(/g

function countHandlerDefinitions(source: string): number {
  const stripped = stripSourceComments(source)
  const matches = stripped.match(HANDLER_DEFINITION_PATTERN)
  return matches ? matches.length : 0
}

function collectProductionSourceFiles(root: string): string[] {
  const results: string[] = []

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (entry === '__tests__' || entry === '__mocks__') continue
      const full = join(dir, entry)
      const stats = statSync(full)
      if (stats.isDirectory()) {
        walk(full)
      } else if (
        (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
        !entry.endsWith('.d.ts')
      ) {
        results.push(full)
      }
    }
  }

  walk(root)
  return results
}

describe('D-02: the shared handler body is never forked', () => {
  it('exactly ONE file under src/ (production source) declares export async function getSteamBottleEligibilityVerdict, and it is installFormIpc.ts', () => {
    const files = collectProductionSourceFiles(SRC_ROOT)
    const hits = files.filter(
      (file) => countHandlerDefinitions(readFileSync(file, 'utf8')) > 0
    )

    expect(hits).toHaveLength(1)
    expect(relative(REPO_ROOT, hits[0]).split('\\').join('/')).toBe(
      'src/backend/storeManagers/steam/installFormIpc.ts'
    )
  })

  it('main.ts and steamAuthFlowRegistration.ts each contain the IDENTIFIER but NOT the export async function definition of it', () => {
    const mainSource = readFileSync(
      join(REPO_ROOT, 'src/backend/main.ts'),
      'utf8'
    )
    const sidecarSource = readFileSync(
      join(REPO_ROOT, 'src/backend/sidecar/steamAuthFlowRegistration.ts'),
      'utf8'
    )

    expect(stripSourceComments(mainSource)).toMatch(
      /getSteamBottleEligibilityVerdict/
    )
    expect(countHandlerDefinitions(mainSource)).toBe(0)

    expect(stripSourceComments(sidecarSource)).toMatch(
      /getSteamBottleEligibilityVerdict/
    )
    expect(countHandlerDefinitions(sidecarSource)).toBe(0)
  })

  it('non-vacuity: the matcher counts 2 against a hand-built specimen containing a second definition -- proving the gate bites', () => {
    const specimen = `
      export async function getSteamBottleEligibilityVerdict(appName: unknown) {
        return { eligible: false }
      }

      // A second, forked copy -- this is what the gate must catch.
      export async function getSteamBottleEligibilityVerdict(appName: unknown) {
        return { eligible: true }
      }
    `
    expect(countHandlerDefinitions(specimen)).toBe(2)
  })
})
