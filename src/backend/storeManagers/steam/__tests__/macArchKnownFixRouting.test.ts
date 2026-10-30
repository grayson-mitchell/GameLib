/**
 * quick 261027-bqe: install() routing for a curated known-fix macArch "32".
 * Apple silicon seeds mac_arch '32' (known-fix, unverified) and takes the
 * bottle branch with no native download; Intel is unchanged.
 */

jest.mock('../../../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: jest.fn(),
  removeShortcuts: jest.fn(),
  shortcutFiles: jest.fn()
}))

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
    ensureConnected: jest.fn().mockResolvedValue(true),
    acquireAuthenticated: jest.fn()
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
jest.mock('backend/platform', () => ({
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
// resolveBridgeBottleName/removePerGameBridgeBottle/DEFAULT_BRIDGE_BOTTLE_NAME
// added for D-51-12 (phase 51 plan 05) — library.ts's removeSteamInstallCopy
// now calls through this seam for the 'bridge' source. DEFAULT_BRIDGE_BOTTLE_NAME
// is a plain string (not a jest.fn()) so the real `!==` comparison inside
// removeSteamInstallCopy behaves identically to the real module's constant.
jest.mock('../bottle', () => ({
  // quick 261024-cjq: plain function (survives resetMocks) — CrossOver present
  isCrossoverInstalled: () => Promise.resolve(true),
  CROSSOVER_MISSING: 'crossover-missing',
  isBottleReady: jest.fn(),
  tellBottledSteamToLaunch: jest.fn(),
  tellBottledSteamToUninstall: jest.fn(),
  getSteamBottleSettings: jest.fn(),
  getBottleSteamappsDir: jest.fn(),
  isBridgeBottleReady: jest.fn(),
  getBridgeBottleSettings: jest.fn(),
  provisionBridgeBottle: jest.fn(),
  isBottleProvisioned: jest.fn(),
  resolveBridgeBottleName: jest.fn(),
  removePerGameBridgeBottle: jest.fn(),
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge'
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
jest.mock('../platformCapture', () => ({ captureOwnedAppPlatforms: jest.fn() }))
jest.mock('../metacriticCapture', () => ({
  captureOwnedAppMetacritic: jest.fn()
}))

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

jest.mock('backend/knownFixes', () => ({ readKnownFixes: jest.fn() }))

import { existsSync, readdirSync } from 'graceful-fs'
import { getSteamLibraries } from 'backend/utils'
import { shell } from 'backend/platform'
import { readKnownFixes } from 'backend/knownFixes'
import { library } from '../state'
import { steamMetadataStore } from '../electronStores'
import { downloadSteamDepots } from '../depot'
import SteamGame from '../games'
import { SteamUser } from '../user'

const APP_ID = '63000'
const store = new Map<string, Record<string, unknown>>()

const env = () =>
  jest.requireMock<{ isAppleSiliconMac: boolean; isMac: boolean }>(
    'backend/constants/environment'
  )

beforeEach(() => {
  store.clear()
  ;(SteamUser.acquireAuthenticated as jest.Mock).mockResolvedValue({
    ok: true,
    client: {},
    release: jest.fn()
  })
  store.set(APP_ID, {
    platformsCaptured: true,
    is_mac_native: true,
    is_windows_native: true,
    mac_arch: 'unknown',
    mac_arch_source: 'minos',
    bridge: { userRoute: 'bottle' }
  })
  ;(steamMetadataStore.get as jest.Mock).mockImplementation((id: string) =>
    store.get(id)
  )
  ;(steamMetadataStore.set as jest.Mock).mockImplementation(
    (id: string, v: Record<string, unknown>) => {
      store.set(id, v)
    }
  )
  ;(readKnownFixes as jest.Mock).mockReturnValue({
    title: 'HOARD',
    macArch: '32'
  })
  ;(getSteamLibraries as jest.Mock).mockResolvedValue(['/lib'])
  ;(existsSync as jest.Mock).mockReturnValue(false)
  ;(readdirSync as jest.Mock).mockReturnValue([])
  env().isMac = true
  env().isAppleSiliconMac = true
  library.clear()
  library.set(APP_ID, {
    runner: 'steam',
    app_name: APP_ID,
    title: 'HOARD',
    is_installed: false,
    install: {},
    art_cover: '',
    art_square: '',
    extra: { reqs: [] },
    canRunOffline: true,
    installable: true
  } as never)
  jest
    .requireMock<{ bridgeAllowlist: { has: jest.Mock } }>('../bridge/allowlist')
    .bridgeAllowlist.has.mockReturnValue(false)
  jest
    .requireMock<{ isBottleReady: jest.Mock }>('../bottle')
    .isBottleReady.mockReturnValue(false)
})

describe('known-fix macArch 32 routing', () => {
  it('Apple silicon: seeds known-fix 32 (unverified) and takes the bottle branch with no native download', async () => {
    const result = await new SteamGame(APP_ID).install({} as never)
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    const stored = store.get(APP_ID)
    expect(stored?.mac_arch).toBe('32')
    expect(stored?.mac_arch_source).toBe('known-fix')
    expect(stored?.mac_arch_verified).not.toBe(true)
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    const urls = (shell.openExternal as jest.Mock).mock.calls.map((c) =>
      String(c[0])
    )
    expect(urls.some((u) => u.startsWith('steam://install'))).toBe(false)
  })

  it('Intel: never seeds and does not take the bottle-branch result', async () => {
    env().isAppleSiliconMac = false
    let result: unknown
    try {
      result = await new SteamGame(APP_ID).install({} as never)
    } catch (e) {
      result = e
    }
    expect(result).not.toEqual({ status: 'done', deferredToSetup: true })
    expect(shell.openExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(store.get(APP_ID)?.mac_arch_source).not.toBe('known-fix')
    expect(store.get(APP_ID)?.mac_arch).toBe('unknown')
  })

  it('checkBottleEligibility: true on Apple silicon, false on Intel', async () => {
    expect(await new SteamGame(APP_ID).checkBottleEligibility()).toBe(true)
    store.set(APP_ID, { ...store.get(APP_ID), mac_arch: 'unknown' })
    env().isAppleSiliconMac = false
    expect(await new SteamGame(APP_ID).checkBottleEligibility()).toBe(false)
  })
})
