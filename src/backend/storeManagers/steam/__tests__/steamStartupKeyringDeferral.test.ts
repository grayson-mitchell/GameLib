/**
 * Structural proof for the Steam keyring deferral gate (quick task 260817-d61,
 * Task 3 — "Flip the gate: defer the startup refresh, activate on deliberate
 * Steam actions").
 *
 * What this file proves, and what it does NOT prove:
 *  - Startup (`SteamLibraryManager.init()`'s `runOnceWhenOnline` path and a
 *    LOCKED `refresh()`) issues ZERO keyring reads, through the PRODUCTION
 *    `setTokenStore()` seam — never a hand-built replica of the store's
 *    internals.
 *  - The deliberate path (a Steam action that calls `noteSteamAuthTrigger`)
 *    still reads exactly once, so the "zero" above is non-vacuous.
 *  - Install/Update/Play/game-page-open each unlock the gate as their FIRST
 *    action.
 *  - `SteamUser.ensureConnected()`'s `unreadable` branch never clears a
 *    token (constraint 5 regression pin).
 *  - `src-tauri/src/main.rs` is untouched (constraint 1).
 *  - Nothing here proves the macOS Keychain prompt actually moved, or that
 *    the 9:1 failure ratio improved — that is a deferred operator session
 *    (`U-34.5-01`/`U-34.5-10`, plan `34.5-58`). Every assertion below is
 *    STRUCTURAL.
 *
 * Mock strategy: this file needs BOTH `library.ts` (Section A) and `games.ts`
 * (Section B) loaded for REAL — they already have a real, working circular
 * import between them (`library.ts` imports `SteamGame` from `./games`,
 * `games.ts` imports several helpers from `./library`), the same shape
 * `games.test.ts` already exercises successfully. Unlike `library.test.ts`
 * and `games.test.ts`, this file does NOT mock `./user` — `SteamUser` must be
 * REAL so `ensureConnected()` genuinely reaches `readTokenOutcome()` and the
 * spy `TokenStore` installed via the production `setTokenStore()` seam.
 * `steam-session`/`steam-user` (the two real network-capable npm packages
 * `user.ts` imports) are mocked exactly as `user.test.ts` mocks them, so no
 * real CM connection is ever attempted.
 */

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('axios')

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── electronStores mock — configStore/steamLibraryStore/steamMetadataStore/
// steamSyncStore. `configStore.get_nodefault` drives SteamUser.isLoggedIn(). ─
const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  clear: jest.fn(),
  delete: jest.fn()
}
jest.mock('../electronStores', () => ({
  configStore: mockConfigStore,
  steamLibraryStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  steamMetadataStore: {
    get: jest.fn(),
    set: jest.fn(),
    entries: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  }
}))

// ── electron mock — shell.openExternal (games.ts), dialog.showMessageBox
// (library.ts's promptI386Recovery), app.getPath/getAppPath (constants/paths
// resolves these at module-load time), safeStorage (tokenStore.ts's
// ElectronTokenStore — unused here since every test installs a spy store via
// setTokenStore() before any read, but must exist so the module-level
// `new ElectronTokenStore()` construction and the import itself never throw).
jest.mock('electron', () => ({
  shell: { openExternal: jest.fn() },
  dialog: { showMessageBox: jest.fn() },
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    getAppPath: () => '/tmp/mock-path'
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(true),
    encryptString: jest.fn((s: string) => Buffer.from(s)),
    decryptString: jest.fn((b: Buffer) => b.toString())
  }
}))

jest.mock('backend/dialog/dialog', () => ({
  notify: jest.fn(),
  showDialogBoxModalAuto: jest.fn()
}))

jest.mock('backend/game_config', () => ({
  GameConfig: {
    get: jest.fn().mockReturnValue({
      config: undefined,
      getSettings: jest.fn().mockResolvedValue({ autoSyncSaves: false })
    })
  }
}))

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn()
}))
jest.mock('@node-steam/vdf', () => ({ parse: jest.fn() }))
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

// ── online_monitor mock — runOnceWhenOnline is mocked to invoke its callback
// IMMEDIATELY (per this task's own <behavior> instruction), so init()'s
// background-sync branch drives refresh() synchronously-ish without a real
// online-state wait. ─────────────────────────────────────────────────────────
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn().mockReturnValue(true)
}))

jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

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

jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn().mockReturnValue(false) }
}))
jest.mock('../bridge/shimGenerate', () => ({
  placeShimForGame: jest.fn()
}))
jest.mock('../bridge/launchTarget', () => ({
  resolveBridgeLaunchExe: jest.fn()
}))
jest.mock('../bridge/helperProcess', () => ({
  ensureBridgeHelperReady: jest.fn()
}))

jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
}))

jest.mock('../nativeInstallSetting', () => ({
  isSteamNativeInstallEnabled: jest.fn()
}))

jest.mock('../depot', () => ({
  downloadSteamDepots: jest.fn(),
  finalizeToSteam: jest.fn().mockResolvedValue(undefined),
  buildDepotPlan: jest.fn(),
  healReconciledFileModes: jest.fn()
}))
jest.mock('../depot/reconcile', () => ({
  reconcilePartialState: jest.fn()
}))

jest.mock('../clientSetup', () => ({
  ensureSteamClientReady: jest.fn()
}))
jest.mock('../installLocation', () => ({
  resolveSteamInstallTarget: jest.fn(),
  sanitizeInstalldir: jest.fn((s: string) => s)
}))

jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  createAbortController: jest.fn(),
  callAbortController: jest.fn(),
  deleteAbortController: jest.fn()
}))

jest.mock('../platformCapture', () => ({
  captureOwnedAppPlatforms: jest.fn().mockResolvedValue({
    scopedCount: 0,
    capturedCount: 0,
    skippedCount: 0,
    failed: false
  })
}))

// ── child_process — deliberately NOT mocked. Neither init()/refresh() (the
// paths this file exercises) nor the constraint-1 git check below touch it
// through a mock; the git check needs the REAL execSync. ────────────────────

// ── steam-session mock (mirrors user.test.ts) — no real auth session is ever
// started by this file's tests, so these are never invoked, but the module
// must resolve without throwing. ─────────────────────────────────────────────
jest.mock('steam-session', () => ({
  LoginSession: jest.fn(() => ({
    startWithQR: jest.fn(),
    startWithCredentials: jest.fn(),
    submitSteamGuardCode: jest.fn(),
    cancelLoginAttempt: jest.fn(),
    on: jest.fn(),
    once: jest.fn()
  })),
  EAuthTokenPlatformType: { SteamClient: 2 }
}))

// ── steam-user mock (mirrors user.test.ts) — connectSteamUserClient() is
// never reached by this file's tests (every spy TokenStore outcome below
// short-circuits ensureConnected() before that point), but the module must
// resolve without throwing since user.ts imports it at module scope. ────────
const MockSteamUserLib = jest.fn(() => ({
  logOn: jest.fn(),
  logOff: jest.fn(),
  steamID: undefined,
  getPersonas: jest.fn(),
  getProductInfo: jest.fn().mockResolvedValue({ apps: {} }),
  relog: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  redeemKey: jest.fn()
})) as any
MockSteamUserLib.EPurchaseResult = { Unknown: -1, OK: 0 }
jest.mock('steam-user', () => MockSteamUserLib)

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { join } from 'path'
import { sendFrontendMessage } from '../../../ipc'
import SteamLibraryManager from '../library'
import SteamGame from '../games'
import { SteamUser } from '../user'
import { setTokenStore, type TokenStore } from '../tokenStore'
import { getSteamLibraries } from 'backend/utils'
import { runOnceWhenOnline } from 'backend/online_monitor'
import { library } from '../state'
import {
  isSteamAuthUnlocked,
  resetSteamAuthTrigger,
  noteSteamAuthTrigger,
  currentTriggerLabel
} from '../authTrigger'
import type { GameInfo, InstallArgs } from 'common/types'

const APP_ID = '570'

/**
 * A real-shaped `TokenStore` spy, installed through the PRODUCTION
 * `setTokenStore()` seam — per this task's own instruction, never a
 * hand-built replica of the store's internals (a replica drifts silently).
 */
function installSpyTokenStore(outcome: {
  status: 'present' | 'absent' | 'unreadable'
  token?: string
  reason?: 'timeout' | 'unavailable'
}): TokenStore {
  const readTokenResult =
    outcome.status === 'present'
      ? ({ status: 'present', token: outcome.token ?? 'spy-token' } as const)
      : outcome.status === 'absent'
        ? ({ status: 'absent' } as const)
        : ({
            status: 'unreadable',
            reason: outcome.reason ?? 'timeout'
          } as const)

  const spy: TokenStore = {
    isAvailable: jest.fn().mockResolvedValue(true),
    getToken: jest
      .fn()
      .mockResolvedValue(outcome.status === 'present' ? outcome.token : ''),
    setToken: jest.fn().mockResolvedValue(undefined),
    clearToken: jest.fn().mockResolvedValue(undefined),
    readToken: jest.fn().mockResolvedValue(readTokenResult)
  }
  setTokenStore(spy)
  return spy
}

/** Flushes pending microtasks/macrotasks so a fire-and-forget path settles. */
const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(() => {
  jest.clearAllMocks()
  resetSteamAuthTrigger()
  library.clear()
  mockConfigStore.get_nodefault.mockReturnValue(undefined)
  jest.mocked(getSteamLibraries).mockResolvedValue([])
  jest.mocked(runOnceWhenOnline).mockImplementation((cb: () => unknown) => {
    void cb()
  })
  // Defaults so init()/migrateStaleArtUrls have empty caches to scan
  // (mirrors library.test.ts's own shared beforeEach).
  const { steamLibraryStore, steamMetadataStore } =
    jest.requireMock('../electronStores')
  ;(steamLibraryStore.get as jest.Mock).mockReturnValue([])
  ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([])
})

// ---------------------------------------------------------------------------
// Section A: SteamLibraryManager.init() / refresh() — the deferral gate
// ---------------------------------------------------------------------------

describe('SteamLibraryManager keyring deferral (quick-260817-d61)', () => {
  it('init() with a spy TokenStore and runOnceWhenOnline invoking immediately: the spy is read ZERO times', async () => {
    const spy = installSpyTokenStore({ status: 'absent' })
    mockConfigStore.get_nodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )

    const manager = new SteamLibraryManager()
    await manager.init()
    await flushAsync()

    expect(spy.readToken).toHaveBeenCalledTimes(0)
    expect(spy.getToken).toHaveBeenCalledTimes(0)
  })

  it('init() still pushes every cached game to the frontend — the deferral does not empty the grid (anti-vacuity)', async () => {
    installSpyTokenStore({ status: 'absent' })
    const cachedGames: GameInfo[] = [
      { app_name: '111', runner: 'steam' } as GameInfo,
      { app_name: '222', runner: 'steam' } as GameInfo
    ]
    const { steamLibraryStore } = jest.requireMock('../electronStores')
    ;(steamLibraryStore.get as jest.Mock).mockReturnValue(cachedGames)

    const manager = new SteamLibraryManager()
    await manager.init()
    await flushAsync()

    const pushes = jest
      .mocked(sendFrontendMessage)
      .mock.calls.filter(([channel]) => channel === 'pushGameToLibrary')
    expect(pushes).toHaveLength(2)
  })

  it('refresh() while LOCKED returns null, emits steamSyncStatus idle, and NEVER emits syncing or failed', async () => {
    installSpyTokenStore({ status: 'absent' })
    const manager = new SteamLibraryManager()

    const result = await manager.refresh()

    expect(result).toBeNull()
    const syncStatusCalls = jest
      .mocked(sendFrontendMessage)
      .mock.calls.filter(([channel]) => channel === 'steamSyncStatus')
    expect(syncStatusCalls).toHaveLength(1)
    expect(syncStatusCalls[0][1]).toEqual({ status: 'idle' })
    expect(
      syncStatusCalls.some(
        (c) => (c[1] as { status: string }).status === 'syncing'
      )
    ).toBe(false)
    expect(
      syncStatusCalls.some(
        (c) => (c[1] as { status: string }).status === 'failed'
      )
    ).toBe(false)
  })

  it('refresh() while LOCKED never reads the token store (the deferral is real, not a coincidence of an unrelated early return)', async () => {
    const spy = installSpyTokenStore({ status: 'absent' })
    const manager = new SteamLibraryManager()

    await manager.refresh()

    expect(spy.readToken).toHaveBeenCalledTimes(0)
    expect(spy.getToken).toHaveBeenCalledTimes(0)
  })

  it('after noteSteamAuthTrigger("user-install"), refresh() reaches ensureConnected() and the spy store IS read exactly ONCE (anti-vacuity: proves the zero above is not "never reads at all")', async () => {
    const spy = installSpyTokenStore({ status: 'absent' })
    mockConfigStore.get_nodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    noteSteamAuthTrigger('user-install')
    expect(isSteamAuthUnlocked()).toBe(true)

    const manager = new SteamLibraryManager()
    await manager.refresh()

    expect(spy.readToken).toHaveBeenCalledTimes(1)
  })

  it('the deferral log line names the reason and the current trigger, without ever containing a token value', async () => {
    installSpyTokenStore({ status: 'absent' })
    const manager = new SteamLibraryManager()
    noteSteamAuthTrigger('startup')

    await manager.refresh()

    const { logInfo } = jest.requireMock('backend/logger')
    const lines = (logInfo as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(
      lines.some(
        (l) =>
          l.includes('deferred until a deliberate Steam action') &&
          l.includes('no keyring_get issued') &&
          l.includes(`trigger=${currentTriggerLabel()}`)
      )
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Section B: SteamGame — Install/Update/Play/game-page-open unlock the gate
// ---------------------------------------------------------------------------

describe('SteamGame keyring deferral unlock (quick-260817-d61)', () => {
  it('install() unlocks the gate before doing any other work', () => {
    const game = new SteamGame(APP_ID)
    expect(isSteamAuthUnlocked()).toBe(false)

    void game.install({} as InstallArgs).catch(() => {})

    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('update() unlocks the gate before doing any other work', async () => {
    const game = new SteamGame(APP_ID)
    expect(isSteamAuthUnlocked()).toBe(false)

    await game.update()

    expect(isSteamAuthUnlocked()).toBe(true)
  })

  it('launch() unlocks the gate before doing any other work', () => {
    const game = new SteamGame(APP_ID)
    expect(isSteamAuthUnlocked()).toBe(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void game.launch({} as any).catch(() => {})

    expect(isSteamAuthUnlocked()).toBe(true)
  })

  describe('getExtraInfo() — locked->unlocked transition fires ensureConnected() exactly once', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('the FIRST getExtraInfo() call unlocks the gate and fires exactly one ensureConnected()', async () => {
      const ensureConnectedSpy = jest
        .spyOn(SteamUser, 'ensureConnected')
        .mockResolvedValue(true)
      const game = new SteamGame(APP_ID)
      expect(isSteamAuthUnlocked()).toBe(false)

      await game.getExtraInfo()
      await flushAsync()

      expect(isSteamAuthUnlocked()).toBe(true)
      expect(ensureConnectedSpy).toHaveBeenCalledTimes(1)
    })

    it('a SECOND getExtraInfo() call fires NO additional ensureConnected() — only the transition fires it', async () => {
      const ensureConnectedSpy = jest
        .spyOn(SteamUser, 'ensureConnected')
        .mockResolvedValue(true)
      const game = new SteamGame(APP_ID)

      await game.getExtraInfo()
      await flushAsync()
      expect(ensureConnectedSpy).toHaveBeenCalledTimes(1)

      await game.getExtraInfo()
      await flushAsync()

      expect(ensureConnectedSpy).toHaveBeenCalledTimes(1)
    })

    it('getExtraInfo() never blocks page render — a rejected ensureConnected() is swallowed, resolution is unaffected', async () => {
      jest
        .spyOn(SteamUser, 'ensureConnected')
        .mockRejectedValue(new Error('boom'))
      const game = new SteamGame(APP_ID)

      await expect(game.getExtraInfo()).resolves.not.toThrow()
      await flushAsync()
    })
  })
})

// ---------------------------------------------------------------------------
// Constraint 5 regression pin: ensureConnected()'s unreadable branch never
// clears a token or touches isLoggedIn (quick-260814-r2d, re-pinned here).
// ---------------------------------------------------------------------------

describe('SteamUser.ensureConnected() unreadable outcome — constraint 5 regression pin', () => {
  it('calls clearToken ZERO times and leaves isLoggedIn untouched on an unreadable read', async () => {
    const spy = installSpyTokenStore({
      status: 'unreadable',
      reason: 'timeout'
    })
    mockConfigStore.get_nodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    mockConfigStore.delete.mockClear()

    const result = await SteamUser.ensureConnected()

    expect(result).toBe(false)
    expect(spy.clearToken).toHaveBeenCalledTimes(0)
    expect(mockConfigStore.delete).not.toHaveBeenCalledWith('isLoggedIn')
    expect(mockConfigStore.delete).not.toHaveBeenCalledWith('userData')
  })
})

// ---------------------------------------------------------------------------
// Constraint 1: KEYRING_READ_TIMEOUT must stay at 45s — 7 of 9 observed
// timeouts postdate that change, and this plan does not revisit it.
//
// This used to be enforced by `git diff --name-only HEAD` not listing
// `src-tauri/src/main.rs`. That proxy was defective in two ways, and both are
// worth naming because the shape recurs:
//
//   1. It measured the WORKING TREE, not this plan's diff. From the moment the
//      plan committed it was unconditionally true on any clean checkout, so it
//      protected nothing — the same failure mode recorded on
//      `gameDetailsImportGate.test.ts`'s Gate 7, which replaced a
//      `git show HEAD:<same path>` comparison for exactly this reason.
//   2. It was over-broad in the other direction: it failed on ANY edit to
//      main.rs by ANY later session, related or not. It first fired on a
//      2026-08-22 doc-comment correction to `LONG_RUNNING_CHANNELS` (IN-03)
//      that does not go near the keyring path.
//
// Replaced with a direct pin on the constant the constraint actually names.
// Hermetic (no `git` subprocess, works in a source export) and it fails only
// when the guarded value moves. The ORDERING invariant between this constant
// and RUST_INVOKE_TIMEOUT_MS is separately gated Rust-side, in main.rs's own
// `#[cfg(test)]` region.
// ---------------------------------------------------------------------------

describe('constraint 1 — KEYRING_READ_TIMEOUT stays at 45s', () => {
  const MAIN_RS = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'src-tauri',
    'src',
    'main.rs'
  )
  const PIN = 'const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);'

  it('src-tauri/src/main.rs still declares KEYRING_READ_TIMEOUT as 45 seconds', () => {
    const { readFileSync } = jest.requireActual<typeof import('fs')>('fs')
    expect(readFileSync(MAIN_RS, 'utf-8')).toContain(PIN)
  })

  // Anti-vacuity: a `toContain` on a file that failed to load, or a pin whose
  // text no longer resembles the declaration, would pass silently forever.
  it('self-test: main.rs is really being read, and the pin is specific to 45s', () => {
    const { readFileSync } = jest.requireActual<typeof import('fs')>('fs')
    const source = readFileSync(MAIN_RS, 'utf-8')

    expect(source.length).toBeGreaterThan(100_000)
    expect(source).toContain('const INVOKE_TIMEOUT: Duration')
    expect(source).not.toContain(PIN.replace('45', '46'))
  })
})
