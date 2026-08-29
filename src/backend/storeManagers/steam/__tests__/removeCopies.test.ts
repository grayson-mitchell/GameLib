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
 *  - graceful-fs (existsSync/readdirSync/readFileSync) + @node-steam/vdf
 *    (parse) are mocked and driven by a small in-memory manifest fixture
 *    helper (addManifest) so the REAL readAcfState/findOtherManifestsWithInstalldir
 *    implementations run against controlled fixtures — node:fs's rmSync is
 *    mocked separately so deletions are asserted by call ARGUMENTS, never
 *    merely "was called"
 *  - ../state is NOT mocked — real library Map, cleared in beforeEach
 */

import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { rmSync } from 'node:fs'
// Plain 'fs' (not 'node:fs', not 'graceful-fs') is never mocked in this file
// — used ONLY by the Task 3 IPC-seam census test below to read real source
// files off disk, deliberately bypassing every fixture double above it.
import { readFileSync as readSourceFile } from 'fs'
import { join } from 'path'
import * as vdf from '@node-steam/vdf'
import { getSteamLibraries } from 'backend/utils'
import * as libraryModule from '../library'
import { library } from '../state'
import { steamMetadataStore } from '../electronStores'
import SteamGame from '../games'
import { removeAllSteamInstallCopies } from '../removeAllCopies'

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

// ── backend/utils mock — getSteamLibraries() (native root) / getFileSize() ──
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── graceful-fs mock — existsSync/readdirSync/readFileSync ──────────────────
jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn()
}))

// ── @node-steam/vdf mock — parse() ───────────────────────────────────────────
jest.mock('@node-steam/vdf', () => ({ parse: jest.fn() }))

// ── node:fs mock — rmSync is the ONLY delete primitive removeSteamInstallCopy
// calls; mocked so every deletion in these tests is asserted by exact call
// ARGUMENTS, never merely "was called" (plan's Task 1 hard requirement).
jest.mock('node:fs', () => ({ rmSync: jest.fn() }))

// ── IPC mock ──────────────────────────────────────────────────────────────────
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))

// ── dialog/dialog mock ────────────────────────────────────────────────────────
jest.mock('../../../dialog/dialog', () => ({
  notify: jest.fn(),
  showDialogBoxModalAuto: jest.fn()
}))

// ── i18next mock ──────────────────────────────────────────────────────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: jest.fn((_key: string, fallback = '') => fallback) }
}))

// ── SteamUser mock ────────────────────────────────────────────────────────────
jest.mock('../user', () => ({
  SteamUser: {
    isLoggedIn: jest.fn(),
    getClient: jest.fn(),
    ensureConnected: jest.fn().mockResolvedValue(true)
  }
}))

// ── online_monitor mock ───────────────────────────────────────────────────────
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn().mockReturnValue(false)
}))

// ── child_process mock ────────────────────────────────────────────────────────
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  execFileSync: jest.fn()
}))

// ── electron mock ──────────────────────────────────────────────────────────────
jest.mock('electron', () => ({
  dialog: { showMessageBox: jest.fn() },
  shell: { openExternal: jest.fn() },
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    getAppPath: () => '/tmp/mock-path'
  }
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

// ── electronStores mock ───────────────────────────────────────────────────────
jest.mock('../electronStores', () => ({
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
jest.mock('../bottle', () => ({
  isBottleReady: jest.fn(),
  tellBottledSteamToInstall: jest.fn(),
  tellBottledSteamToLaunch: jest.fn(),
  tellBottledSteamToUninstall: jest.fn(),
  getSteamBottleSettings: jest.fn(),
  getBottleSteamappsDir: jest.fn(),
  isBridgeBottleReady: jest.fn(),
  getBridgeBottleSettings: jest.fn(),
  provisionBridgeBottle: jest.fn(),
  isBottleProvisioned: jest.fn()
}))

// ── depot mock ─────────────────────────────────────────────────────────────────
jest.mock('../depot', () => ({
  finalizeToSteam: jest.fn().mockResolvedValue(undefined),
  downloadSteamDepots: jest.fn(),
  buildDepotPlan: jest.fn(),
  healReconciledFileModes: jest.fn(),
  formatEta:
    jest.requireActual<typeof import('../depot')>('../depot').formatEta,
  rollingRateMiBs:
    jest.requireActual<typeof import('../depot')>('../depot').rollingRateMiBs
}))
jest.mock('../depot/reconcile', () => ({ reconcilePartialState: jest.fn() }))

// ── backend/launcher mock ─────────────────────────────────────────────────────
jest.mock('backend/launcher', () => ({ runWineCommand: jest.fn() }))

// ── bridge/* mocks ─────────────────────────────────────────────────────────────
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn() }
}))
jest.mock('../bridge/shimGenerate', () => ({ placeShimForGame: jest.fn() }))
jest.mock('../bridge/launchTarget', () => ({
  resolveBridgeLaunchExe: jest.fn()
}))
jest.mock('../bridge/helperProcess', () => ({
  ensureBridgeHelperReady: jest.fn()
}))

// ── platformCapture mock ──────────────────────────────────────────────────────
jest.mock('../platformCapture', () => ({ captureOwnedAppPlatforms: jest.fn() }))

// ── nativeInstallSetting mock ─────────────────────────────────────────────────
jest.mock('../nativeInstallSetting', () => ({
  isSteamNativeInstallEnabled: jest.fn()
}))

// ── clientSetup / installLocation mocks (Plan 09/10 seams) ──────────────────
jest.mock('../clientSetup', () => ({ ensureSteamClientReady: jest.fn() }))
jest.mock('../installLocation', () => ({
  resolveSteamInstallTarget: jest.fn()
}))

// ── aborthandler mock ─────────────────────────────────────────────────────────
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  createAbortController: jest.fn(),
  callAbortController: jest.fn(),
  deleteAbortController: jest.fn()
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

// ────────────────────────────────────────────────────────────────────────────
// Fixture harness — an in-memory "filesystem" of steamapps dirs + ACF
// manifests, driving the REAL readAcfState / findOtherManifestsWithInstalldir
// implementations through the mocked graceful-fs + vdf.parse seams above.
// ────────────────────────────────────────────────────────────────────────────

const NATIVE_LIB = '/lib'
const NATIVE_STEAMAPPS = join(NATIVE_LIB, 'steamapps')

let existingPaths: Set<string>
let manifestByPath: Map<string, { AppState: Record<string, unknown> }>
let dirListing: Map<string, string[]>

function resetFixture() {
  existingPaths = new Set()
  manifestByPath = new Map()
  dirListing = new Map()
  ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIB])
  ;(existsSync as jest.Mock).mockImplementation((p: string) =>
    existingPaths.has(p)
  )
  ;(readdirSync as jest.Mock).mockImplementation(
    (dir: string) => dirListing.get(dir) ?? []
  )
  ;(readFileSync as jest.Mock).mockImplementation((p: string) =>
    JSON.stringify(manifestByPath.get(p))
  )
  ;(vdf.parse as jest.Mock).mockImplementation((content: string) =>
    JSON.parse(content)
  )
  // rmSync is mocked (no real filesystem I/O in these tests), but the
  // fixture must still reflect a deletion for subsequent readAcfState /
  // findOtherManifestsWithInstalldir calls in the SAME test — e.g. Task 2's
  // pollUninstallOnce call after removeSteamInstallCopy re-probes the same
  // native root and must see it as gone, not still "installed". Calls are
  // still fully recorded (mockImplementation does not disable call
  // tracking), so `expect(rmSync).toHaveBeenCalledWith(...)` assertions
  // elsewhere in this file are unaffected.
  ;(rmSync as jest.Mock).mockImplementation(
    (p: string, opts?: { recursive?: boolean }) => {
      if (opts?.recursive) {
        for (const existing of Array.from(existingPaths)) {
          if (existing === p || existing.startsWith(`${p}/`)) {
            existingPaths.delete(existing)
          }
        }
      } else {
        existingPaths.delete(p)
      }
      manifestByPath.delete(p)
      for (const [dir, files] of dirListing) {
        const idx = files.findIndex((f) => join(dir, f) === p)
        if (idx !== -1) files.splice(idx, 1)
      }
    }
  )
}

/** Registers appId's manifest under `dir` (defaults to the native steamapps
 *  root) with the given AppState fields. */
function addManifest(
  appId: string,
  appState: Record<string, unknown>,
  dir: string = NATIVE_STEAMAPPS
) {
  existingPaths.add(dir)
  const file = `appmanifest_${appId}.acf`
  const path = join(dir, file)
  existingPaths.add(path)
  manifestByPath.set(path, { AppState: appState })
  const listing = dirListing.get(dir) ?? []
  if (!listing.includes(file)) listing.push(file)
  dirListing.set(dir, listing)
}

// StateFlags bit 4 (0x4) set => 'installed'; unset => 'downloading'.
const INSTALLED_FLAGS = '4'
const DOWNLOADING_FLAGS = '2'

beforeEach(() => {
  resetFixture()
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
describe('enumerateSteamInstallCopies', () => {
  it('returns only the native copy when bottle/bridge are absent', async () => {
    addManifest('63000', {
      appid: '63000',
      StateFlags: INSTALLED_FLAGS,
      installdir: 'HOARD',
      SizeOnDisk: '12345'
    })
    const bottleMock = jest.requireMock<{
      getSteamBottleSettings: jest.Mock
      getBridgeBottleSettings: jest.Mock
      getBottleSteamappsDir: jest.Mock
    }>('../bottle')
    bottleMock.getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'B'
    })
    bottleMock.getBridgeBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'BR'
    })
    bottleMock.getBottleSteamappsDir.mockImplementation((name: string) =>
      name === 'B' ? '/bottle/steamapps' : '/bridge/steamapps'
    )

    const copies = await libraryModule.enumerateSteamInstallCopies('63000')

    expect(copies).toEqual([
      {
        source: 'native',
        installPath: join(NATIVE_STEAMAPPS, 'common', 'HOARD'),
        sizeOnDisk: '12345'
      }
    ])
  })

  it('excludes a "downloading" root from the result', async () => {
    addManifest('63000', {
      appid: '63000',
      StateFlags: DOWNLOADING_FLAGS,
      installdir: 'HOARD'
    })

    const copies = await libraryModule.enumerateSteamInstallCopies('63000')

    expect(copies).toEqual([])
  })

  it('probes native, bottle, bridge in that fixed order, and a throwing probe is logged + skipped (never propagated)', async () => {
    // Note: readAcfState is NOT spied here — it's called internally by
    // enumerateSteamInstallCopies from the SAME source file (library.ts), so
    // a jest.spyOn against the imported module object would not intercept
    // that call site (TS compiles same-file calls as direct local function
    // references, not property lookups through module.exports — a known
    // jest/ts-jest gotcha). Order and the throw-and-skip behavior are
    // instead observed through the real EXTERNAL seams each source's probe
    // must call through (getSteamLibraries for native, getSteamBottleSettings
    // for bottle, getBridgeBottleSettings for bridge) — these ARE
    // cross-module calls and are safely mockable.
    const order: string[] = []
    ;(getSteamLibraries as jest.Mock).mockImplementation(async () => {
      order.push('native')
      return [NATIVE_LIB]
    })
    const bottleMock = jest.requireMock<{
      getSteamBottleSettings: jest.Mock
      getBridgeBottleSettings: jest.Mock
      getBottleSteamappsDir: jest.Mock
    }>('../bottle')
    bottleMock.getSteamBottleSettings.mockImplementation(() => {
      order.push('bottle')
      throw new Error('unprovisioned bridge bottle')
    })
    bottleMock.getBridgeBottleSettings.mockImplementation(() => {
      order.push('bridge')
      return { wineCrossoverBottle: 'BR' }
    })
    bottleMock.getBottleSteamappsDir.mockReturnValue('/bridge/steamapps')

    const { logWarning } = jest.requireMock<{ logWarning: jest.Mock }>(
      'backend/logger'
    )

    const copies = await libraryModule.enumerateSteamInstallCopies('63000')

    expect(order).toEqual(['native', 'bottle', 'bridge'])
    // native: absent (no manifest fixture added); bottle: threw, skipped;
    // bridge: absent (steamapps dir '/bridge/steamapps' never registered
    // as existing in the fixture) -> no copies, and the throw never
    // propagated out of enumerateSteamInstallCopies.
    expect(copies).toEqual([])
    expect(logWarning).toHaveBeenCalled()
  })
})

// ── Task 1: removeSteamInstallCopy ───────────────────────────────────────────
describe('removeSteamInstallCopy', () => {
  it('non-numeric appId -> refused, nothing deleted', async () => {
    const result = await libraryModule.removeSteamInstallCopy(
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

  it("state 'absent' -> absent, nothing deleted", async () => {
    const result = await libraryModule.removeSteamInstallCopy('63000', 'native')

    expect(result).toEqual({ status: 'absent', source: 'native' })
    expect(rmSync).not.toHaveBeenCalled()
  })

  it("state 'downloading' -> refused, nothing deleted", async () => {
    addManifest('63000', {
      appid: '63000',
      StateFlags: DOWNLOADING_FLAGS,
      installdir: 'HOARD'
    })

    const result = await libraryModule.removeSteamInstallCopy('63000', 'native')

    expect(result).toEqual({
      status: 'refused',
      source: 'native',
      reason: expect.stringMatching(/in progress/i)
    })
    expect(rmSync).not.toHaveBeenCalled()
  })

  it('installPath escaping common/ via a traversal installdir -> refused, nothing deleted', async () => {
    addManifest('63000', {
      appid: '63000',
      StateFlags: INSTALLED_FLAGS,
      installdir: '../../etc/evil'
    })

    const result = await libraryModule.removeSteamInstallCopy('63000', 'native')

    expect(result).toEqual({
      status: 'refused',
      source: 'native',
      reason: expect.stringMatching(/outside common/i)
    })
    expect(rmSync).not.toHaveBeenCalled()
  })

  it('installPath resolving to the bare common/ root (empty installdir) -> refused, nothing deleted', async () => {
    addManifest('63000', {
      appid: '63000',
      StateFlags: INSTALLED_FLAGS,
      installdir: ''
    })

    const result = await libraryModule.removeSteamInstallCopy('63000', 'native')

    expect(result).toEqual({
      status: 'refused',
      source: 'native',
      reason: expect.stringMatching(/outside common/i)
    })
    expect(rmSync).not.toHaveBeenCalled()
  })

  it('happy path -> removes the installdir AND unlinks the manifest, manifestOnly:false', async () => {
    addManifest('63000', {
      appid: '63000',
      StateFlags: INSTALLED_FLAGS,
      installdir: 'HOARD',
      SizeOnDisk: '999'
    })

    const result = await libraryModule.removeSteamInstallCopy('63000', 'native')

    expect(result).toEqual({
      status: 'removed',
      source: 'native',
      manifestOnly: false
    })
    expect(rmSync).toHaveBeenCalledWith(
      join(NATIVE_STEAMAPPS, 'common', 'HOARD'),
      { recursive: true, force: true }
    )
    expect(rmSync).toHaveBeenCalledWith(
      join(NATIVE_STEAMAPPS, 'appmanifest_63000.acf'),
      { force: true }
    )
  })

  it('shared installdir with another appId -> manifest-only removal, directory untouched', async () => {
    addManifest('63000', {
      appid: '63000',
      StateFlags: INSTALLED_FLAGS,
      installdir: 'SharedGame'
    })
    addManifest('99999', {
      appid: '99999',
      StateFlags: INSTALLED_FLAGS,
      installdir: 'SharedGame'
    })

    const result = await libraryModule.removeSteamInstallCopy('63000', 'native')

    expect(result).toEqual({
      status: 'removed',
      source: 'native',
      manifestOnly: true
    })
    expect(rmSync).toHaveBeenCalledTimes(1)
    expect(rmSync).toHaveBeenCalledWith(
      join(NATIVE_STEAMAPPS, 'appmanifest_63000.acf'),
      { force: true }
    )
    expect(rmSync).not.toHaveBeenCalledWith(
      join(NATIVE_STEAMAPPS, 'common', 'SharedGame'),
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
      is_mac_native: false
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
    jest
      .requireMock<{ isBottleReady: jest.Mock }>('../bottle')
      .isBottleReady.mockReturnValue(false)
  })

  it("mac_arch:'32' + isAppleSiliconMac + native installed -> removeSteamInstallCopy called exactly once, install proceeds", async () => {
    addManifest(APP_ID, {
      appid: APP_ID,
      StateFlags: INSTALLED_FLAGS,
      installdir: 'HOARD'
    })
    const removeSpy = jest.spyOn(libraryModule, 'removeSteamInstallCopy')

    const result = await new SteamGame(APP_ID).install({} as any)

    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledWith(APP_ID, 'native')
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    // rmSync is the real deletion primitive removeSteamInstallCopy calls
    // internally — the spy above only proves the CALL, this proves the
    // deletion the plan's Task 2 <behavior> requires actually happened.
    expect(rmSync).toHaveBeenCalledWith(
      join(NATIVE_STEAMAPPS, 'common', 'HOARD'),
      { recursive: true, force: true }
    )

    removeSpy.mockRestore()
  })

  it('isAppleSiliconMac===false (Intel/unconfirmed) -> removeSteamInstallCopy NEVER called, even with mac_arch 32 + native copy present', async () => {
    addManifest(APP_ID, {
      appid: APP_ID,
      StateFlags: INSTALLED_FLAGS,
      installdir: 'HOARD'
    })
    const removeSpy = jest.spyOn(libraryModule, 'removeSteamInstallCopy')

    // Flip the mutable environment double for this one test only.
    jest.requireMock<{ isAppleSiliconMac: boolean }>(
      'backend/constants/environment'
    ).isAppleSiliconMac = false

    await new SteamGame(APP_ID).install({} as any)

    expect(removeSpy).not.toHaveBeenCalled()

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
      is_mac_native: false
    })
    addManifest(APP_ID, {
      appid: APP_ID,
      StateFlags: INSTALLED_FLAGS,
      installdir: 'HOARD'
    })
    const removeSpy = jest.spyOn(libraryModule, 'removeSteamInstallCopy')

    await new SteamGame(APP_ID).install({} as any)

    expect(removeSpy).not.toHaveBeenCalled()
    removeSpy.mockRestore()
  })

  it('no native copy on disk -> no call, no error', async () => {
    // No addManifest() call -> readAcfState('native') resolves 'absent'.
    const removeSpy = jest.spyOn(libraryModule, 'removeSteamInstallCopy')

    const result = await new SteamGame(APP_ID).install({} as any)

    expect(removeSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    removeSpy.mockRestore()
  })

  it('removeSteamInstallCopy throwing is logged and swallowed — install still proceeds and returns its normal result', async () => {
    addManifest(APP_ID, {
      appid: APP_ID,
      StateFlags: INSTALLED_FLAGS,
      installdir: 'HOARD'
    })
    const removeSpy = jest
      .spyOn(libraryModule, 'removeSteamInstallCopy')
      .mockRejectedValue(new Error('disk error'))
    const { logWarning } = jest.requireMock<{ logWarning: jest.Mock }>(
      'backend/logger'
    )

    const result = await new SteamGame(APP_ID).install({} as any)

    expect(logWarning).toHaveBeenCalled()
    expect(result).toEqual({ status: 'done', deferredToSetup: true })

    removeSpy.mockRestore()
  })

  it('routes every state change through pollUninstallOnce — the cleanup block itself never hand-writes library.set (single call, from pollUninstallOnce only)', async () => {
    addManifest(APP_ID, {
      appid: APP_ID,
      StateFlags: INSTALLED_FLAGS,
      installdir: 'HOARD'
    })
    const librarySetSpy = jest.spyOn(library, 'set')

    await new SteamGame(APP_ID).install({} as any)

    // No survivor on bottle/bridge in this fixture -> pollUninstallOnce's
    // own confirmed-absent branch calls library.set exactly once. If
    // removeDemotedNativeOrphan ALSO hand-wrote library.set directly (the
    // behavior this test guards against), this count would be 2 and the
    // badge could flip early/inconsistently with the honest reconciliation.
    expect(librarySetSpy).toHaveBeenCalledTimes(1)
    expect(library.get(APP_ID)?.is_installed).toBe(false)

    librarySetSpy.mockRestore()
  })
})

// ── Task 3: removeAllSteamInstallCopies ──────────────────────────────────────
describe('removeAllSteamInstallCopies (Task 3)', () => {
  const APP_ID = '63000'

  function mockCopy(
    source: libraryModule.AcfSource
  ): libraryModule.SteamInstallCopy {
    return {
      source,
      installPath: `/${source}/steamapps/common/HOARD`,
      sizeOnDisk: '1'
    }
  }

  it('non-numeric-string appName -> {removed:0, refused:0, error} without enumerating or removing anything', async () => {
    const enumerateSpy = jest.spyOn(
      libraryModule,
      'enumerateSteamInstallCopies'
    )
    const removeSpy = jest.spyOn(libraryModule, 'removeSteamInstallCopy')

    const result = await removeAllSteamInstallCopies('../evil')

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
    const result = await removeAllSteamInstallCopies(63000 as unknown)

    expect(result).toEqual({
      removed: 0,
      refused: 0,
      error: expect.stringMatching(/invalid/i)
    })
  })

  it('three installed roots -> removeSteamInstallCopy called once per root in enumerate order, {removed:3, refused:0}', async () => {
    const enumerateSpy = jest
      .spyOn(libraryModule, 'enumerateSteamInstallCopies')
      .mockResolvedValue([
        mockCopy('native'),
        mockCopy('bottle'),
        mockCopy('bridge')
      ])
    const removeSpy = jest
      .spyOn(libraryModule, 'removeSteamInstallCopy')
      .mockImplementation(async (appId, source) => ({
        status: 'removed',
        source,
        manifestOnly: false
      }))
    const pollSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(APP_ID)

    expect(removeSpy).toHaveBeenCalledTimes(3)
    expect(removeSpy).toHaveBeenNthCalledWith(1, APP_ID, 'native')
    expect(removeSpy).toHaveBeenNthCalledWith(2, APP_ID, 'bottle')
    expect(removeSpy).toHaveBeenNthCalledWith(3, APP_ID, 'bridge')
    expect(result).toEqual({ removed: 3, refused: 0 })

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('one root refuses (mid-download) + two remove -> {removed:2, refused:1}, the refusal does not abort the sweep', async () => {
    const enumerateSpy = jest
      .spyOn(libraryModule, 'enumerateSteamInstallCopies')
      .mockResolvedValue([
        mockCopy('native'),
        mockCopy('bottle'),
        mockCopy('bridge')
      ])
    const removeSpy = jest
      .spyOn(libraryModule, 'removeSteamInstallCopy')
      .mockImplementation(async (appId, source) => {
        if (source === 'bottle') {
          return {
            status: 'refused',
            source,
            reason: 'uninstall already in progress'
          }
        }
        return { status: 'removed', source, manifestOnly: false }
      })
    const pollSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(APP_ID)

    expect(removeSpy).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ removed: 2, refused: 1 })

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('a root throwing mid-sweep is tallied as refused and does not abort the remaining roots (T-LE0-06)', async () => {
    const enumerateSpy = jest
      .spyOn(libraryModule, 'enumerateSteamInstallCopies')
      .mockResolvedValue([mockCopy('native'), mockCopy('bridge')])
    const removeSpy = jest
      .spyOn(libraryModule, 'removeSteamInstallCopy')
      .mockImplementation(async (appId, source) => {
        if (source === 'native') throw new Error('disk error')
        return { status: 'removed', source, manifestOnly: false }
      })
    const pollSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
    const { logWarning } = jest.requireMock<{ logWarning: jest.Mock }>(
      'backend/logger'
    )

    const result = await removeAllSteamInstallCopies(APP_ID)

    expect(result).toEqual({ removed: 1, refused: 1 })
    expect(logWarning).toHaveBeenCalled()

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('zero copies -> {removed:0, refused:0}, no throw, removeSteamInstallCopy never called', async () => {
    const enumerateSpy = jest
      .spyOn(libraryModule, 'enumerateSteamInstallCopies')
      .mockResolvedValue([])
    const removeSpy = jest.spyOn(libraryModule, 'removeSteamInstallCopy')
    const pollSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(APP_ID)

    expect(removeSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ removed: 0, refused: 0 })

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it("finishes with exactly one pollUninstallOnce(appId, 'native') call AFTER the sweep, never per-root", async () => {
    const enumerateSpy = jest
      .spyOn(libraryModule, 'enumerateSteamInstallCopies')
      .mockResolvedValue([mockCopy('native'), mockCopy('bottle')])
    const removeSpy = jest
      .spyOn(libraryModule, 'removeSteamInstallCopy')
      .mockImplementation(async (appId, source) => ({
        status: 'removed',
        source,
        manifestOnly: false
      }))
    const pollSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    await removeAllSteamInstallCopies(APP_ID)

    expect(pollSpy).toHaveBeenCalledTimes(1)
    expect(pollSpy).toHaveBeenCalledWith(APP_ID, 'native')

    enumerateSpy.mockRestore()
    removeSpy.mockRestore()
    pollSpy.mockRestore()
  })

  it('enumerateSteamInstallCopies itself throwing -> swallowed, {removed:0, refused:0, error}, pollUninstallOnce never reached', async () => {
    const enumerateSpy = jest
      .spyOn(libraryModule, 'enumerateSteamInstallCopies')
      .mockRejectedValue(new Error('fs error'))
    const pollSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const result = await removeAllSteamInstallCopies(APP_ID)

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
    'src/common/types/ipc.ts',
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
