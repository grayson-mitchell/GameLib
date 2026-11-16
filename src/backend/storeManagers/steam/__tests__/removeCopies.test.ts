import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for quick-260821-le0 — closes the 32-bit Mac Steam orphan
 * defect: the Apple Silicon host gate, the shared multi-root
 * enumerate/remove primitives, the route-time auto-cleanup inside
 * SteamGame.install(), and the "Remove all copies" IPC seam.
 *
 * Mock strategy mirrors library.test.ts / games.test.ts (this repo's own
 * established pattern for this directory):
 *  - backend/logger uses factory form to prevent transitive fs-extra crash
 *  - resetMocks: true (src/backend/jest.config.js) means every mock
 *    implementation must be re-established in beforeEach
 *  - graceful-fs (existsSync/readdirSync/readFileSync) + the mockedFsSteamFiles
 *    programmable parse are mocked and driven by a small in-memory manifest fixture
 *    helper (addManifest) so the REAL readAcfState/findOtherManifestsWithInstalldir
 *    implementations run against controlled fixtures — node:fs's rmSync is
 *    mocked separately so deletions are asserted by call ARGUMENTS, never
 *    merely "was called"
 *  - ../state is NOT mocked — real library Map, cleared in beforeEach
 */

import { rmSync } from 'node:fs'
// Plain 'fs' (not 'node:fs', not 'graceful-fs') is never mocked in this file
// — used ONLY by the Task 3 IPC-seam census test below to read real source
// files off disk, deliberately bypassing every fixture double above it.
import { readFileSync as readSourceFile } from 'fs'
import { join } from 'path'
import { getSteamLibraries } from 'backend/utils'
import * as uninstallPollingModule from '../library/uninstallPolling'
import * as acfState from '../library/acfState'
import type { AcfSource } from '../library/installRoot'
import SteamGame from '../games'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { removeAllSteamInstallCopies } from '../removeAllCopies'
import type { Stores } from 'backend/services/types'

import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { EMPTY_POLL_STATUS } from 'backend/testUtils/steamPollStatusFake'

// 66.3-15: the bottle helpers are read through the deps slice, so they are plain mocks here.
// quick 261024-cjq: plain function (survives resetMocks) — CrossOver present.
const getSteamBottleSettings = jest.fn()
const steamBottle = {
  isCrossoverInstalled: () => Promise.resolve(true),
  isBottleReady: jest.fn(),
  getSteamBottleSettings,
  isSteamBottleProvisioned: jest.fn(),
  resolveCrossoverWine: jest.fn()
}

const { steamMetadataStore } = jest.requireMock<Stores['steam']>('../stores')
const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// Rust owns the ACF reads and the copy removal, so a test scripts the steampoll channels it reaches.
// An unscripted read answers absent; the registry read answers empty; anything else is a failure.
const rustHandlers = new Map<string, (args: unknown) => unknown>()
const rustCalls: { channel: string; args: unknown }[] = []
const requestRustInvoke = (
  channel: string,
  argv: readonly unknown[]
): Promise<unknown> => {
  rustCalls.push({ channel, args: argv[0] })
  const handler = rustHandlers.get(channel)
  if (handler) return Promise.resolve(handler(argv[0]))
  if (channel === 'steampoll_status') return Promise.resolve(EMPTY_POLL_STATUS)
  if (channel === 'steampoll_acf_read_state') {
    return Promise.resolve({ state: 'absent' })
  }
  return Promise.reject(new Error(`unscripted rust channel ${channel}`))
}

const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: requestRustInvoke as never,
  config: createTestGlobalConfig({ defaultSteamPath: '/steam' }),
  steamUser,
  steamBottle: steamBottle as never,
  steamProcesses: createInertSteamProcesses(),
  stores: createTestStores({ steam: steamStoresModule })
})

// The boot-owned Steam library state the code under test reads (D-66.3-13): one instance per file.
const library = steamTestDeps.steamSession.libraryState.library

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
// steam/games.ts imports the shared shortcuts module, whose import graph does not load under
// this file's mocks (quick 261026-c7r).
jest.mock('../../../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: jest.fn(),
  removeShortcuts: jest.fn(),
  shortcutFiles: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

// ── backend/utils mock — getSteamLibraries() (native root) / getFileSize() ──
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── node:fs mock — rmSync is the ONLY delete primitive removeSteamInstallCopy
// calls; mocked so every deletion in these tests is asserted by exact call
// ARGUMENTS, never merely "was called" (plan's Task 1 hard requirement).
jest.mock('node:fs', () => ({ rmSync: jest.fn() }))

// ── dialog/dialog mock ────────────────────────────────────────────────────────
jest.mock('../../../dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn()),
  showDialogBoxModalAuto: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))

// ── i18next mock ──────────────────────────────────────────────────────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: jest.fn((_key: string, fallback = '') => fallback) }
}))

// ── backend/constants/environment mock — mutable double (this repo's own
// established pattern, games.test.ts:170/library.test.ts). Defaults to a
// confirmed Apple Silicon Mac so the Task 2 install() describe block below
// can exercise the auto-cleanup branch without per-test boilerplate; the
// dedicated host-gate describe block re-requires the REAL module in
// isolation and never touches this mock.
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: true,
  isLinux: false,
  isAppleSiliconMac: true
}))

// ── stores mock ───────────────────────────────────────────────────────
jest.mock('../stores', () => ({
  configStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn(),
    clear: jest.fn()
  },
  steamLibraryStore: { get: jest.fn(), set: jest.fn(), entries: jest.fn() },
  steamMetadataStore: { get: jest.fn(), set: jest.fn() },
  steamSyncStore: { get: jest.fn(), set: jest.fn() }
}))

// ── bottle mock — union of what library.ts AND games.ts import from it ──────
// resolveBridgeBottleName/removePerGameBridgeBottle/DEFAULT_BRIDGE_BOTTLE_NAME
// added for D-51-12 (phase 51 plan 05) — library.ts's removeSteamInstallCopy
// now calls through this seam for the 'bridge' source. DEFAULT_BRIDGE_BOTTLE_NAME
// is a plain string (not a jest.fn()) so the real `!==` comparison inside
// removeSteamInstallCopy behaves identically to the real module's constant.
jest.mock('../bottle', () => ({
  CROSSOVER_MISSING: 'crossover-missing',
  getBottleSteamappsDir: jest.fn(),
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge'
}))
jest.mock('../bridgeBottleLifecycle', () => ({
  provisionBridgeBottle: jest.fn(),
  removePerGameBridgeBottle: jest.fn()
}))
jest.mock('../bridgeBottle', () => ({
  createDrmBridgeRunners: () => ({}),
  isBridgeBottleReady: jest.fn(),
  getBridgeBottleSettings: jest.fn(),
  resolveBridgeBottleName: jest.fn()
}))
jest.mock('../bottledSteam', () => ({
  createBottledSteamRaiser: () => ({}),
  tellBottledSteamToLaunch: jest.fn(),
  tellBottledSteamToUninstall: jest.fn()
}))

// ── depot mock ─────────────────────────────────────────────────────────────────
jest.mock('../depot', () => ({
  downloadSteamDepots: jest.fn()
}))

// ── backend/launcher mock ─────────────────────────────────────────────────────
jest.mock('backend/launcher', () => ({ runWineCommand: jest.fn() }))

// ── bridge/* mocks ─────────────────────────────────────────────────────────────
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn(), knownBadReason: jest.fn() }
}))
jest.mock('../bridge/shimGenerate', () => ({ placeShimForGame: jest.fn() }))
jest.mock('../bridge/launchTarget', () => ({
  resolveBridgeLaunchExe: jest.fn(),
  resolveBridgeLaunchWorkingDir: jest.fn()
}))
jest.mock('../bridge/helperProcess', () => ({
  ensureBridgeHelperReady: jest.fn()
}))
// ── platformCapture mock ──────────────────────────────────────────────────────
jest.mock('../platformCapture', () => ({
  createPlatformCaptureQueue: () => ({})
}))

// ── nativeInstallSetting mock ─────────────────────────────────────────────────
jest.mock('../nativeInstallSetting', () => ({
  isSteamNativeInstallEnabled: jest.fn(),
  isSteamNativeDeleteEnabled: jest.fn()
}))
jest.mock('../nativeDelete', () => ({ decideSteamNativeDelete: jest.fn() }))

// ── clientSetup / installLocation mocks (Plan 09/10 seams) ──────────────────
jest.mock('../clientSetup', () => ({ ensureSteamClientReady: jest.fn() }))
jest.mock('../installLocation', () => ({
  resolveSteamInstallTarget: jest.fn()
}))

// ── axios mock (games.ts's fetchMetadataIfNeeded — not exercised by any test
// in this file, but games.ts is a real, unmocked module here) ───────────────
jest.mock('axios')

// NOTE: no file-local `jest.mock('os', ...)` here. `jest.setupContainment.ts`
// (a global `setupFiles` entry, applied to EVERY src/backend test) already
// installs a file-registry-level mock for both the `'os'` and `'node:os'`
// specifiers (`mockOsFactory` — see that file's CR-02 docstring), because
// Node core-module exports are non-configurable getters under CJS require()
// in this Node version (`jest.spyOn(realOsNamespace, 'cpus')` throws
// `TypeError: Cannot redefine property: cpus`). A second, file-local
// `jest.mock('os', ...)` here would collide with that registration rather
// than layering on top of it. Containment's factory forwards every export
// OTHER than `homedir`/`userInfo` straight from `jest.requireActual('os')`
// via object spread — which means the mock module IS a plain, freshly
// spread object (not the frozen native namespace), so `cpus` on it CAN be
// spied with `jest.spyOn(jest.requireMock('os'), 'cpus')` inside
// `loadWithHost()` below, without redeclaring the mock.

const NATIVE_LIB = '/lib'
const NATIVE_STEAMAPPS = join(NATIVE_LIB, 'steamapps')

beforeEach(() => {
  rustHandlers.clear()
  rustCalls.length = 0
  ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIB])
  jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
    ok: true,
    client: {},
    release: jest.fn()
  } as never)
})

// ── Task 1: isAppleSiliconMac host gate ──────────────────────────────────────
describe('isAppleSiliconMac (host gate)', () => {
  /**
   * D-14 (Phase 34.18 Plan 05): the Intel-detection constant this RED-proof
   * originally pinned was removed from backend/constants/environment.ts, so
   * the RED-proof below can no longer read a real Intel-detection export off
   * the module. The unsafe negation it pins is computed LOCALLY, directly
   * from the same mocked `cpus()` model
   * string `loadWithHost` supplies to the real module — expressing the exact
   * shape `isAppleSiliconMac` must never be rewritten as (D-12): a bare
   * negation of an Intel substring match, which does not fail closed on an
   * empty/unknown CPU model.
   */
  function negatedIntelProbe(cpuModel: string | null | undefined): boolean {
    return !(cpuModel ?? '').includes('Intel')
  }

  /**
   * Re-requires backend/constants/environment in isolation with `os.cpus()`
   * / `process.platform` / `process.arch` mocked for exactly this call —
   * the module computes its exports once at load time, so each scenario
   * needs a fresh module instance.
   */
  function loadWithHost(opts: {
    platform: string
    arch: string
    cpuModel?: string | null
  }): { isAppleSiliconMac: boolean } {
    let result!: { isAppleSiliconMac: boolean }
    // Node core modules' real namespace exports are non-configurable in
    // this jest environment — `jest.spyOn` directly on `require('os')`
    // throws "Cannot redefine property: cpus" (see jest.setupContainment.ts's
    // CR-02 docstring). But `jest.requireMock('os')` here resolves to
    // containment's OWN plain-object mock (a fresh object built via
    // `{ ...jest.requireActual('os'), homedir: ..., userInfo: ... }`) —
    // ordinary object-spread properties ARE configurable, so spying on
    // THAT object's `cpus` works, without redeclaring the module mock.
    const osMock = jest.requireMock<{ cpus: () => unknown }>('os')
    const cpusSpy = jest
      .spyOn(osMock, 'cpus')
      .mockReturnValue(
        opts.cpuModel === null ? [] : [{ model: opts.cpuModel ?? '' }]
      )
    jest.isolateModules(() => {
      const originalPlatform = process.platform
      const originalArch = process.arch
      Object.defineProperty(process, 'platform', {
        value: opts.platform,
        configurable: true
      })
      Object.defineProperty(process, 'arch', {
        value: opts.arch,
        configurable: true
      })
      try {
        // requireActual (not require) is load-bearing: this test file has
        // a top-level jest.mock('backend/constants/environment', ...)
        // static double (for the Task 2 install() describe block below),
        // which would otherwise shadow every require() of this module —
        // including inside isolateModules — with the static mock instead
        // of evaluating the REAL module against the host fixture above.
        // 'os' stays mocked (via containment's setupFiles-level mock) even
        // through requireActual, since requireActual only bypasses the
        // mock for the module explicitly named — not its transitive deps.
        result = jest.requireActual('backend/constants/environment')
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true
        })
        Object.defineProperty(process, 'arch', {
          value: originalArch,
          configurable: true
        })
      }
    })
    cpusSpy.mockRestore()
    return result
  }

  it('darwin + arm64 -> true', () => {
    expect(
      loadWithHost({ platform: 'darwin', arch: 'arm64', cpuModel: 'Apple M2' })
        .isAppleSiliconMac
    ).toBe(true)
  })

  it('darwin + x64 Rosetta VirtualApple model -> true', () => {
    expect(
      loadWithHost({
        platform: 'darwin',
        arch: 'x64',
        cpuModel: 'VirtualApple @ 2.50GHz processor'
      }).isAppleSiliconMac
    ).toBe(true)
  })

  it('darwin + x64 Intel model -> false (RED-proof target case 1)', () => {
    const cpuModel = 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz'
    const loaded = loadWithHost({ platform: 'darwin', arch: 'x64', cpuModel })
    expect(loaded.isAppleSiliconMac).toBe(false)
    // The unsafe negation gets this host right BY ACCIDENT — this is the
    // case a negated-Intel-probe implementation would get right, so it
    // alone cannot prove the positive-probe requirement; the empty-model
    // case below is the one that actually distinguishes the two
    // implementations.
    expect(negatedIntelProbe(cpuModel)).toBe(false)
  })

  it('darwin + x64 empty model string -> false, fails closed (RED-proof target case 2)', () => {
    const cpuModel = ''
    expect(
      loadWithHost({ platform: 'darwin', arch: 'x64', cpuModel })
        .isAppleSiliconMac
    ).toBe(false)
    // The unsafe negation gets this host WRONG: 'Intel'.includes('') is
    // false, so the negation is TRUE — the exact false-positive D-14 exists
    // to prevent (it would wrongly fire the destructive auto-removal).
    expect(negatedIntelProbe(cpuModel)).toBe(true)
  })

  it('darwin + x64 cpus() returning [] -> false, fails closed', () => {
    expect(
      loadWithHost({ platform: 'darwin', arch: 'x64', cpuModel: null })
        .isAppleSiliconMac
    ).toBe(false)
  })

  it('non-darwin (win32) -> false regardless of arch', () => {
    expect(
      loadWithHost({ platform: 'win32', arch: 'arm64', cpuModel: 'Apple M2' })
        .isAppleSiliconMac
    ).toBe(false)
  })

  it('non-darwin (linux) -> false regardless of arch', () => {
    expect(
      loadWithHost({ platform: 'linux', arch: 'arm64', cpuModel: 'Apple M2' })
        .isAppleSiliconMac
    ).toBe(false)
  })

  /**
   * Mandatory RED-proof (D-14, plan Task 1 hard requirement + verification
   * step 5), rewritten (Phase 34.18 Plan 05) to OUTLIVE the now-removed
   * Intel-detection constant: a negated-Intel-substring-match implementation
   * must FAIL the Intel and empty-model cases above. Proven here directly
   * by evaluating the negated expression against the same host fixtures
   * `loadWithHost` supplies to the real `isAppleSiliconMac`, so this test is
   * self-verifying without requiring a real source edit+revert — if this
   * assertion itself were ever wrong, the case above (asserting
   * isAppleSiliconMac===false) would also be wrong, and would already be
   * failing.
   */
  it('RED-proof: a negated-Intel-probe implementation gets the Intel and empty-model cases WRONG', () => {
    const intelCpuModel = 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz'
    const intelHost = loadWithHost({
      platform: 'darwin',
      arch: 'x64',
      cpuModel: intelCpuModel
    })
    expect(negatedIntelProbe(intelCpuModel)).toBe(false) // correct (matches real impl)
    expect(intelHost.isAppleSiliconMac).toBe(false)

    // The real isAppleSiliconMac fails closed on an empty cpus() model —
    // proving a negated-Intel-probe implementation is not just wrong but
    // UNSAFE for the empty-model host this gate must protect against.
    expect(() =>
      loadWithHost({ platform: 'darwin', arch: 'x64', cpuModel: '' })
    ).not.toThrow()
    const emptyModelHost = loadWithHost({
      platform: 'darwin',
      arch: 'x64',
      cpuModel: ''
    })
    // A negated-Intel-probe for an empty model: 'Intel'.includes match on
    // '' is false, so the negation is TRUE — the WRONG answer (real
    // isAppleSiliconMac is false here, fails closed).
    expect(negatedIntelProbe('')).toBe(true)
    expect(emptyModelHost.isAppleSiliconMac).toBe(false)
  })
})

// ── Task 1: enumerateSteamInstallCopies ──────────────────────────────────────

// ── Task 1: removeSteamInstallCopy ───────────────────────────────────────────
describe('removeSteamInstallCopy', () => {
  it('non-numeric appId -> refused, nothing deleted', async () => {
    const result = await acfState.removeSteamInstallCopy(
      steamTestDeps,
      '../evil',
      'native'
    )

    expect(result).toEqual({
      status: 'refused',
      source: 'native',
      reason: expect.stringMatching(/invalid appId/i)
    })
    expect(rmSync).not.toHaveBeenCalled()
  })
})

// quick 261106-s3n: the ON delete fallback leans on these guards for any
// registered library and for hostile installdir values.

// ── Task 1 (D-51-12): removeSteamInstallCopy — bridge bottle cleanup ────────
// Closes LD-5 (folded todo 2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md):
// "Remove all copies" on a per-game bridge install must also delete the
// emptied GameLibSteamBridge-<appId> bottle, via the existing
// removePerGameBridgeBottle guard chain — never for the legacy shared
// bottle, and never for 'native'/'bottle' sources.
describe('removeSteamInstallCopy — bridge bottle cleanup (D-51-12)', () => {
  const APP_ID = '206040'
  const BRIDGE_STEAMAPPS = '/bridge/steamapps'
  const BOTTLE_STEAMAPPS = '/bottle/steamapps'
  const PER_GAME_BOTTLE = 'GameLibSteamBridge-206040'
  const LEGACY_BOTTLE = 'GameLibSteamBridge'

  function bottleMock() {
    return {
      ...jest.requireMock<{
        getBottleSteamappsDir: jest.Mock
      }>('../bottle'),
      ...jest.requireMock<{
        removePerGameBridgeBottle: jest.Mock
      }>('../bridgeBottleLifecycle'),
      ...jest.requireMock<{
        getBridgeBottleSettings: jest.Mock
        resolveBridgeBottleName: jest.Mock
      }>('../bridgeBottle')
    }
  }

  beforeEach(() => {
    const mock = bottleMock()
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'SteamBottle'
    })
    mock.getBridgeBottleSettings.mockReturnValue({
      wineCrossoverBottle: PER_GAME_BOTTLE
    })
    mock.getBottleSteamappsDir.mockImplementation(
      (_paths: unknown, name: string) =>
        name === 'SteamBottle' ? BOTTLE_STEAMAPPS : BRIDGE_STEAMAPPS
    )
  })

  // The guards and the deletion run in Rust; what stays TS is the per-game bottle step after it.
  const removeCopyReplies = (
    bridgeBottle: string | null,
    manifestOnly = false
  ) =>
    rustHandlers.set('steampoll_acf_remove_copy', () => ({
      status: 'removed',
      source: 'bridge',
      manifestOnly,
      bridgeBottle
    }))

  it('per-game bridge bottle, full removal -> removePerGameBridgeBottle called once with appId, bottleRemoved:true', async () => {
    const mock = bottleMock()
    mock.removePerGameBridgeBottle.mockResolvedValue({ status: 'removed' })
    removeCopyReplies(PER_GAME_BOTTLE)

    const result = await acfState.removeSteamInstallCopy(
      steamTestDeps,
      APP_ID,
      'bridge'
    )

    expect(result).toEqual({
      status: 'removed',
      source: 'bridge',
      manifestOnly: false,
      bottleRemoved: true
    })
    expect(mock.removePerGameBridgeBottle).toHaveBeenCalledTimes(1)
    expect(mock.removePerGameBridgeBottle).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID
    )
    expect(rustCalls.map((c) => c.channel)).toContain(
      'steampoll_acf_remove_copy'
    )
  })

  it('resolved bottle is the legacy GameLibSteamBridge -> removePerGameBridgeBottle NOT called, bottleRemoved absent', async () => {
    const mock = bottleMock()
    removeCopyReplies(LEGACY_BOTTLE)

    const result = await acfState.removeSteamInstallCopy(
      steamTestDeps,
      APP_ID,
      'bridge'
    )

    expect(result).toEqual({
      status: 'removed',
      source: 'bridge',
      manifestOnly: false
    })
    expect(result).not.toHaveProperty('bottleRemoved')
    expect(mock.removePerGameBridgeBottle).not.toHaveBeenCalled()
  })

  it('manifestOnly removal (shared installdir) -> bottle NOT removed even though the bottle is per-game', async () => {
    const mock = bottleMock()
    removeCopyReplies(PER_GAME_BOTTLE, true)

    const result = await acfState.removeSteamInstallCopy(
      steamTestDeps,
      APP_ID,
      'bridge'
    )

    expect(result).toEqual({
      status: 'removed',
      source: 'bridge',
      manifestOnly: true
    })
    expect(mock.removePerGameBridgeBottle).not.toHaveBeenCalled()
  })

  it("removePerGameBridgeBottle returning {status:'error'} -> removal still reports 'removed', bottleRemoved:false, and a logWarning names the bottle", async () => {
    const mock = bottleMock()
    mock.removePerGameBridgeBottle.mockResolvedValue({
      status: 'error',
      error: 'boom'
    })
    removeCopyReplies(PER_GAME_BOTTLE)
    const { logWarning } = jest.requireMock<{ logWarning: jest.Mock }>(
      'backend/logger'
    )

    const result = await acfState.removeSteamInstallCopy(
      steamTestDeps,
      APP_ID,
      'bridge'
    )

    expect(result).toEqual({
      status: 'removed',
      source: 'bridge',
      manifestOnly: false,
      bottleRemoved: false
    })
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining(PER_GAME_BOTTLE),
      expect.anything()
    )
  })
})

// ── Task 2: SteamGame.install() — removeDemotedNativeOrphan ─────────────────
describe('SteamGame.install() route-time auto-cleanup (Task 2)', () => {
  const APP_ID = '63000'

  function libraryEntry(overrides: Record<string, unknown> = {}) {
    return {
      runner: 'steam',
      app_name: APP_ID,
      title: 'HOARD',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true,
      ...overrides
    }
  }

  beforeEach(() => {
    library.clear()
    library.set(APP_ID, libraryEntry() as any)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      mac_arch: '32',
      platformsCaptured: true,
      is_mac_native: false,
      // D-51-09: a non-seed, never-scanned, bottle-eligible title now
      // defaults to the bridge route (rule 11, pending-scan) -- this whole
      // describe block is about route-time native-copy cleanup ahead of a
      // BOTTLE install, so pin the route rather than relying on the
      // obsolete "bridgeAllowlist.has(false) alone forces bottled" default.
      bridge: { userRoute: 'bottle' }
    })
    // Short-circuit routeThroughBottle's remaining branches cleanly, after
    // removeDemotedNativeOrphan has run, without needing to drive the whole
    // depot-download pipeline: not bridge-eligible, bottle not provisioned
    // -> install() returns { status: 'done', deferredToSetup: true }.
    jest
      .requireMock<{
        bridgeAllowlist: { has: jest.Mock }
      }>('../bridge/allowlist')
      .bridgeAllowlist.has.mockReturnValue(false)
    steamBottle.isBottleReady.mockReturnValue(false)
  })

  const nativeInstalledReplies = () =>
    rustHandlers.set('steampoll_acf_read_state', (args) =>
      (args as { source: string }).source === 'native'
        ? {
            state: 'installed',
            stateFlags: 4,
            installPath: join(NATIVE_STEAMAPPS, 'common', 'HOARD'),
            sizeOnDisk: '12345'
          }
        : { state: 'absent' }
    )
  const removeCalls = () =>
    rustCalls.filter((c) => c.channel === 'steampoll_acf_remove_copy')

  it("mac_arch:'32' + isAppleSiliconMac + native installed -> removeSteamInstallCopy called exactly once, install proceeds", async () => {
    nativeInstalledReplies()
    rustHandlers.set('steampoll_acf_remove_copy', () => ({
      status: 'removed',
      source: 'native',
      manifestOnly: false,
      bridgeBottle: null
    }))
    const removeSpy = jest.spyOn(acfState, 'removeSteamInstallCopy')

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'native')
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    // Rust performs the deletion; the call carries the native source and the appId.
    expect(removeCalls()).toHaveLength(1)
    expect(removeCalls()[0]?.args).toMatchObject({
      appId: APP_ID,
      source: 'native'
    })

    removeSpy.mockRestore()
  })

  it('isAppleSiliconMac===false (Intel/unconfirmed) -> removeSteamInstallCopy NEVER called, even with mac_arch 32 + native copy present', async () => {
    nativeInstalledReplies()
    const removeSpy = jest.spyOn(acfState, 'removeSteamInstallCopy')

    // Flip the mutable environment double for this one test only.
    jest.requireMock<{ isAppleSiliconMac: boolean }>(
      'backend/constants/environment'
    ).isAppleSiliconMac = false

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(removeSpy).not.toHaveBeenCalled()
    expect(removeCalls()).toHaveLength(0)

    // Restore the module default for subsequent tests.
    jest.requireMock<{ isAppleSiliconMac: boolean }>(
      'backend/constants/environment'
    ).isAppleSiliconMac = true
    removeSpy.mockRestore()
  })

  it("mac_arch !== '32' -> removeSteamInstallCopy NEVER called", async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      mac_arch: '64',
      platformsCaptured: true,
      is_mac_native: false,
      // D-51-09: pin the bottle route — see the describe block's own
      // beforeEach note above.
      bridge: { userRoute: 'bottle' }
    })
    nativeInstalledReplies()
    const removeSpy = jest.spyOn(acfState, 'removeSteamInstallCopy')

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(removeSpy).not.toHaveBeenCalled()
    removeSpy.mockRestore()
  })

  it('no native copy on disk -> no call, no error', async () => {
    // No scripted read: Rust answers absent for the native root.
    const removeSpy = jest.spyOn(acfState, 'removeSteamInstallCopy')

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(removeSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    removeSpy.mockRestore()
  })

  it('removeSteamInstallCopy throwing is logged and swallowed — install still proceeds and returns its normal result', async () => {
    nativeInstalledReplies()
    const removeSpy = jest
      .spyOn(acfState, 'removeSteamInstallCopy')
      .mockRejectedValue(new Error('disk error'))
    const { logWarning } = jest.requireMock<{ logWarning: jest.Mock }>(
      'backend/logger'
    )

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(logWarning).toHaveBeenCalled()
    expect(result).toEqual({ status: 'done', deferredToSetup: true })

    removeSpy.mockRestore()
  })
})

// ── Task 3: removeAllSteamInstallCopies ──────────────────────────────────────
describe('removeAllSteamInstallCopies (Task 3)', () => {
  const APP_ID = '63000'

  function mockCopy(source: AcfSource): acfState.SteamInstallCopy {
    return {
      source,
      installPath: `/${source}/steamapps/common/HOARD`,
      sizeOnDisk: '1'
    }
  }

  it('non-numeric-string appName -> {removed:0, refused:0, error} without enumerating or removing anything', async () => {
    const enumerateSpy = jest.spyOn(acfState, 'enumerateSteamInstallCopies')
    const removeSpy = jest.spyOn(acfState, 'removeSteamInstallCopy')

    const result = await removeAllSteamInstallCopies(steamTestDeps, '../evil')

    expect(result).toEqual({
      removed: 0,
      refused: 0,
      error: expect.stringMatching(/invalid/i)
    })
    expect(enumerateSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('non-string appName (e.g. a raw number from a malformed IPC payload) -> rejected the same way', async () => {
    const result = await removeAllSteamInstallCopies(
      steamTestDeps,
      63000 as unknown
    )

    expect(result).toEqual({
      removed: 0,
      refused: 0,
      error: expect.stringMatching(/invalid/i)
    })
  })

  it('three installed roots -> removeSteamInstallCopy called once per root in enumerate order, {removed:3, refused:0}', async () => {
    const enumerateSpy = jest
      .spyOn(acfState, 'enumerateSteamInstallCopies')
      .mockResolvedValue([
        mockCopy('native'),
        mockCopy('bottle'),
        mockCopy('bridge')
      ])
    const removeSpy = jest
      .spyOn(acfState, 'removeSteamInstallCopy')
      .mockImplementation((_deps, appId, source) =>
        Promise.resolve({
          status: 'removed',
          source,
          manifestOnly: false
        })
      )
    const pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(steamTestDeps, APP_ID)

    expect(removeSpy).toHaveBeenCalledTimes(3)
    expect(removeSpy).toHaveBeenNthCalledWith(
      1,
      steamTestDeps,
      APP_ID,
      'native'
    )
    expect(removeSpy).toHaveBeenNthCalledWith(
      2,
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(removeSpy).toHaveBeenNthCalledWith(
      3,
      steamTestDeps,
      APP_ID,
      'bridge'
    )
    expect(result).toEqual({ removed: 3, refused: 0 })

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('one root refuses (mid-download) + two remove -> {removed:2, refused:1}, the refusal does not abort the sweep', async () => {
    const enumerateSpy = jest
      .spyOn(acfState, 'enumerateSteamInstallCopies')
      .mockResolvedValue([
        mockCopy('native'),
        mockCopy('bottle'),
        mockCopy('bridge')
      ])
    const removeSpy = jest
      .spyOn(acfState, 'removeSteamInstallCopy')
      .mockImplementation((_deps, appId, source) => {
        if (source === 'bottle') {
          return Promise.resolve({
            status: 'refused',
            source,
            reason: 'uninstall already in progress'
          })
        }
        return Promise.resolve({
          status: 'removed',
          source,
          manifestOnly: false
        })
      })
    const pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(steamTestDeps, APP_ID)

    expect(removeSpy).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ removed: 2, refused: 1 })

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('a root throwing mid-sweep is tallied as refused and does not abort the remaining roots (T-LE0-06)', async () => {
    const enumerateSpy = jest
      .spyOn(acfState, 'enumerateSteamInstallCopies')
      .mockResolvedValue([mockCopy('native'), mockCopy('bridge')])
    const removeSpy = jest
      .spyOn(acfState, 'removeSteamInstallCopy')
      .mockImplementation((_deps, appId, source) => {
        if (source === 'native') return Promise.reject(new Error('disk error'))
        return Promise.resolve({
          status: 'removed',
          source,
          manifestOnly: false
        })
      })
    const pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
    const { logWarning } = jest.requireMock<{ logWarning: jest.Mock }>(
      'backend/logger'
    )

    const result = await removeAllSteamInstallCopies(steamTestDeps, APP_ID)

    expect(result).toEqual({ removed: 1, refused: 1 })
    expect(logWarning).toHaveBeenCalled()

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('zero copies -> {removed:0, refused:0}, no throw, removeSteamInstallCopy never called', async () => {
    const enumerateSpy = jest
      .spyOn(acfState, 'enumerateSteamInstallCopies')
      .mockResolvedValue([])
    const removeSpy = jest.spyOn(acfState, 'removeSteamInstallCopy')
    const pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(steamTestDeps, APP_ID)

    expect(removeSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ removed: 0, refused: 0 })

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it("finishes with exactly one pollUninstallOnce(appId, 'native') call AFTER the sweep, never per-root", async () => {
    const enumerateSpy = jest
      .spyOn(acfState, 'enumerateSteamInstallCopies')
      .mockResolvedValue([mockCopy('native'), mockCopy('bottle')])
    const removeSpy = jest
      .spyOn(acfState, 'removeSteamInstallCopy')
      .mockImplementation((_deps, appId, source) =>
        Promise.resolve({
          status: 'removed',
          source,
          manifestOnly: false
        })
      )
    const pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    await removeAllSteamInstallCopies(steamTestDeps, APP_ID)

    expect(pollSpy).toHaveBeenCalledTimes(1)
    expect(pollSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'native')

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('enumerateSteamInstallCopies itself throwing -> swallowed, {removed:0, refused:0, error}, pollUninstallOnce never reached', async () => {
    const enumerateSpy = jest
      .spyOn(acfState, 'enumerateSteamInstallCopies')
      .mockRejectedValue(new Error('fs error'))
    const pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(steamTestDeps, APP_ID)

    expect(result).toEqual({
      removed: 0,
      refused: 0,
      error: expect.stringMatching(/sweep failed/i)
    })
    expect(pollSpy).not.toHaveBeenCalled()

    enumerateSpy.mockRestore()
    pollSpy.mockRestore()
  })
})

// ── Task 3: steamRemoveAllCopies IPC seam census ─────────────────────────────
// A source-level assertion (not just a passing behavioral test) that the
// channel string is wired into all THREE surviving seam files this repo requires for
// any IPC handler (installFormIpc.ts's own persistBottleWineVersion is the
// established precedent) — comment-only occurrences (e.g. a stray mention in
// a docstring) do not count, so this cannot be satisfied by documenting the
// feature without registering it.
describe('steamRemoveAllCopies IPC seam census (Task 3)', () => {
  // Phase 35 Plan 14 deleted `src/backend/main.ts`, so the seam census is THREE files, not
  // four. The count is re-derived here rather than left stale: a census whose stated number
  // no longer matches its list is exactly how this repo has previously lost coverage in the
  // OTHER direction -- the list shrinks, the number does not, and nobody notices which seam
  // stopped being checked. The three surviving seams are the type declaration, the sidecar
  // registration and the preload invoker, which is the full path a channel now travels.
  const SEAM_FILES = [
    'src/common/types/ipc/steamAuth.ts',
    'src/backend/sidecar/steamAuthFlowRegistration.ts',
    'src/preload/api/steam.ts'
  ]

  it('the steamRemoveAllCopies channel string appears in non-comment code in all three surviving IPC seam files', () => {
    const repoRoot = join(__dirname, '..', '..', '..', '..', '..')

    for (const relPath of SEAM_FILES) {
      const contents = readSourceFile(join(repoRoot, relPath), 'utf-8')
      const codeOnly = contents
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim()
          return !trimmed.startsWith('//') && !trimmed.startsWith('*')
        })
        .join('\n')

      expect(codeOnly).toEqual(expect.stringContaining('steamRemoveAllCopies'))
    }
  })
})
