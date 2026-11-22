/**
 * End-to-end flow integration test for the sidecar's curated Steam channels
 * (Phase 27 Plan 04 — Task 2).
 *
 * Drives the REAL sidecar RPC server in-process (bootstrap.test.ts's
 * real-shim black-box pattern — the shims under test are the actual
 * platform/index.ts and store_backend.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs.
 *
 * **GAP FIX (2026-07-22):** this suite's config directory is NOT the real OS
 * config directory. Test 4 below writes fixture data (including a fake
 * refreshToken) through the real configStore/store_backend module instance, and a
 * previous incident (see `electronUntouched.test.ts`'s header) proved that
 * doing so against a developer's REAL
 * `~/Library/Application Support/GameLib/` is an active data-loss hazard. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real platformApi/store_backend CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
 *
 * `jest.mock('electron', ...)` below points Jest's OWN module resolution at
 * platform/index.ts directly. `backend/store_backend` is not mocked (quick
 * 261121-pwt): the production conf-backed store runs. This is necessary, not
 * incidental: `src/backend/__mocks__/
 * electron.ts` and `.../electron-store.ts` are Jest manual mocks for
 * node_modules packages, which Jest auto-applies to EVERY backend test —
 * BEFORE Node's `Module._load` (which bootstrap.ts's own hook patches) is
 * ever consulted, since Jest implements its own module registry for
 * `import ... from 'electron'`. Left unmocked, every real flow handler
 * would run against those generic fixtures instead of THIS plan's actual
 * sidecar transport (no `shell` export at all in the adjacent manual mock,
 * and a differently-rooted `app.getPath`), so neither the
 * `shell.openExternal` -> `openExternal` RPC frame bridge nor the
 * `BrowserWindow.webContents.send` -> `pushGameToLibrary` notification
 * bridge — the exact seams this test exists to prove — would ever be
 * exercised. `jest.requireActual` resolves the SAME singleton module
 * instance `bootstrap.ts`/`sidecarRpc.ts` bind their transport onto, so this
 * is the real platformApi (over the production store), wired through Jest's mock system
 * instead of the production `Module._load` hook (which only takes effect in
 * the real bundled `build/main/sidecar.js` process, outside Jest).
 *
 * Only steam-user's network surface (`SteamUser.ensureConnected`/
 * `getClient`, mirroring library.test.ts's own LIB-01 convention) and
 * `backend/utils`'s `getSteamLibraries` (no real on-disk Steam install in
 * CI) are stubbed; `backend/constants/environment` is pinned to
 * `isMac:false` so `SteamGame.launch()`'s bottle-eligibility/metadata-fetch
 * branches (mac-only) never fire, keeping this test on the native
 * steam:// action-flow branch without a real network call to the Steam
 * store API. Every other module in the read/action flow paths (library.ts,
 * games.ts, stores.ts, backend/ipc.ts, main_window.ts,
 * platform/index.ts, sidecarRpc.ts, bootstrap.ts, steamFlowRegistration.ts,
 * handlers.ts) runs for real, unmodified.
 *
 * Assertions are made only on the observable RPC frames (SidecarRpcResponse
 * / SidecarNotification / the openExternal SidecarRpcRequest) — never on
 * internals — per the plan's own acceptance criteria.
 */
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

// Per case (reset in freshRegistry): the boot is handed this root so the stores a case seeds
// and the boot's own stores share one file-cell table, as the old module-level registry did.
let testRoot = createTestStoreRoot()
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'

// ── os — GAP FIX (2026-07-22): Test 4 below writes fixture data (including a
// fake refreshToken) through the real, unmocked configStore/store_backend module
// instance to prove the snapshot handler filters it out. That module resolves
// its on-disk path from `homedir()` (process/appPaths -> resolveAppDataDir), and on
// darwin there is no HOME/XDG_CONFIG_HOME override — left unmocked, this would
// write directly into the developer's REAL
// `~/Library/Application Support/GameLib/steam_store/config.json`, the exact
// file a previous version of `electronUntouched.test.ts` destroyed (see that
// file's header). Overriding `homedir()` to a disposable per-process tmp
// directory keeps the real platformApi/store_backend code paths under test (the
// whole point of this suite) while making it structurally impossible for any
// test in this file to touch real user data.
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-skeletonflows-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
// ── axios — fix/steam-native-install-stability (33-05 live-gate gap): `init()` now wires
// the REAL `initOnlineMonitor()` (backend/online_monitor.ts), which -- now that the real
// platformApi's `net.isOnline()` returns `true` (mocked above) -- immediately calls the real
// `pingSites()`, a live `axios.head()` against github/epic/gog/cloudflare. Mocked so this suite
// (which drives the real, unmocked RPC/handler graph) never makes a real network call; `.create`
// is also stubbed for `backend/utils.ts`'s module-scope `axiosClient` singleton.
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/utils mock — no real on-disk Steam install to scan in CI ────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment mock — pins the native (non-bottle,
// non-mac-metadata-fetch) branch deterministically regardless of the host
// OS running this test ───────────────────────────────────────────────────────
// The runtime `process.platform` pin below is also needed: since 721c2fa01 `shell.openExternal`
// calls `shouldOpenInBackground(process.platform, ...)` at call time, so on a Mac the
// `isMac:false` mock alone still spawns a real detached `/usr/bin/open -g steam://...`
// and never writes the `openExternal` frame.
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── SteamUser mock — controls ensureConnected()/getClient() (mirrors
// library.test.ts's LIB-01 convention); automocked, no factory ──────────────
// The boot builds its SteamUser through createSteamUser; hand it the suite's one jest-fn double (66.3-16).
// `mock`-prefixed so the hoisted factory may reference it; it is initialised before the first require.
const mockSteamUser = createMockSteamUser()
jest.mock('../../storeManagers/steam/user', () => ({
  createSteamUser: () => mockSteamUser
}))

// ── Anonymous PICS client mock (Phase 54) — refresh() captures platforms on
// the anonymous steam-user client first; automocked so no test opens a real
// CM connection. Resolves null below, so capture falls back to the held
// (mocked) client. ─────────────────────────────────────────────────────────

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { defined } from 'backend/testUtils/indexed'
import {
  answerPollStatus,
  bootFresh,
  writeInvoke
} from './helpers/sidecarHarness'
import { createTestAnonymousClient } from 'backend/testUtils/testAnonymousClient'

// D-08: every case boots the sidecar once, in a fresh module registry. Module
// handles the cases configure or inspect are rebound from that registry in
// freshRegistry() (run before each case, ahead of any mock configuration), and
// boot() then boots without a second reset.
let mockLeaseOk: typeof import('../../storeManagers/steam/__tests__/depotLeaseMocks').mockLeaseOk
let getSteamLibraries: typeof import('backend/utils').getSteamLibraries

function freshRegistry(): void {
  jest.resetModules()
  testRoot = createTestStoreRoot()
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('../bootstrap')
  ;({
    mockLeaseOk
  } = require('../../storeManagers/steam/__tests__/depotLeaseMocks'))
  ;({ getSteamLibraries } = require('backend/utils'))
  /* eslint-enable @typescript-eslint/no-require-imports */
}

// The anonymous CM client is the inert fake (resolves null, no CM connection): capture falls
// back to the held (mocked) client.
const boot = () =>
  bootFresh({
    reuseRegistry: true,
    services: {
      storeRoot: testRoot,
      anonymousClient: createTestAnonymousClient()
    }
  })

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

// Pin the native Linux branch of shell.openExternal regardless of host OS (see the
// environment mock above): restored afterAll, same idiom as openExternalBackground.test.ts.
const realPlatform = process.platform
beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
})
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
})

describe('sidecar Steam skeleton flows (read + action, end to end)', () => {
  beforeEach(() => {
    freshRegistry()
    // resetMocks:true (shared root config) wipes automock/factory
    // implementations before every test — re-establish the defaults every
    // test relies on.
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  // Test 1 (read flow): dispatching a `refreshLibrary` invoke frame through
  // the RPC server, with steam-user's owned-apps path stubbed to return >=1
  // app, produces >=1 `pushGameToLibrary` SidecarNotification carrying a
  // steam GameInfo.
  //
  // GAP CYCLE 4 (34.5-33): an empty args array now means "all" (the same
  // semantics `main.ts:1051` always had) rather than the old stub's
  // unconditional Steam-only call — every OTHER manager in
  // `libraryManagerMap` (gog/legendary/nile/sideload) also has its real
  // `refresh()` invoked here, unmocked. This is safe and fast: each of those
  // managers' `refresh()` self-gates on `isLoggedIn()`/`existsSync()` checks
  // against this suite's disposable tmp home directory (see the module
  // docstring's `os` mock) and returns near-instantly with no games and no
  // network call, so the Steam assertions below are unaffected — constrains
  // the environment rather than weakening the assertion, per this plan's own
  // instruction.
  it('Test 1 (read flow): refreshLibrary invoke produces a pushGameToLibrary notification carrying a steam GameInfo', async () => {
    // Phase 54 (54-04): a granted refresh takes an authenticated lease via
    // acquireAuthenticated() instead of calling ensureConnected().
    mockLeaseOk(mockSteamUser)
    // 79-41: Refresh is Rust-only, so the held client is a Rust lease and the owned set comes back in
    // the steamcm_refresh reply, which this test answers on the sidecar's rustInvoke channel.
    const {
      createRustCmClient
    } = require('../../storeManagers/steam/cm/RustCmClient') // eslint-disable-line @typescript-eslint/no-require-imports
    const fakeClient = createRustCmClient(
      { requestRustInvoke: jest.fn() } as never,
      { leaseId: 7, steamId: '76561198000000001', licenses: [] }
    )

    jest.mocked(mockSteamUser.getClient).mockReturnValue(fakeClient)

    const { input, frames } = boot()
    // quick-260817-d61: the Steam keyring deferral gate defers an automatic
    // ('startup'-shaped, no origin) refresh — this test proves the READ FLOW
    // mechanics (a refreshLibrary invoke reaches the real steam-user path and
    // pushes a notification), so it must dispatch with a DELIBERATE origin,
    // the same shape a real Refresh-button click sends
    // (`action-icons-refresh-button` -> `noteRefreshTrigger` -> `user-refresh`,
    // an allowlisted deliberate trigger). An empty args array would otherwise
    // be classified as an unattended startup call and correctly deferred —
    // that deferral is exercised by its own dedicated suite
    // (steamStartupKeyringDeferral.test.ts), not this one.
    writeInvoke(input, 'read-1', 'refreshLibrary', [
      undefined,
      'action-icons-refresh-button'
    ])
    await flush()
    // Polls run in Rust (80-26): the install-state reconcile asks for the poll registry before the
    // refresh reaches steamcm_refresh, so answer that status read with an empty registry.
    answerPollStatus(input, frames)
    await flush()
    const refreshCall = frames.find(
      (frame) =>
        frame.kind === 'rustInvoke' && frame.channel === 'steamcm_refresh'
    )
    expect(refreshCall).toBeDefined()
    input.write(
      `${JSON.stringify({
        id: refreshCall?.id,
        ok: true,
        result: {
          ok: true,
          result: {
            games: [
              {
                runner: 'steam',
                app_name: '999001',
                title: 'Skeleton Test Game',
                art_cover: '',
                art_square: '',
                is_installed: false,
                install: {},
                extra: { reqs: [] },
                canRunOffline: true,
                installable: true
              }
            ],
            metadataUpdates: {},
            ownedCount: 1,
            demoCount: 0,
            demosFailed: false,
            capture: {
              platforms: { scoped: 0, captured: 0, skipped: 0, failed: false },
              metacritic: { scoped: 0, captured: 0, skipped: 0, failed: false },
              anonCount: 0,
              heldCount: 0
            },
            enrich: {
              attempted: 0,
              enriched: 0,
              delisted: 0,
              failed: 0,
              rateLimited: false,
              budgetHit: false,
              notReached: []
            },
            source: 'cm'
          }
        }
      })}\n`
    )
    await flush()
    // C1/WR-01: the Refresh re-reads install state after the op, so answer that status read too.
    answerPollStatus(input, frames)
    await flush()

    const pushes = frames.filter(
      (frame) =>
        frame.kind === 'frontendMessage' &&
        frame.channel === 'pushGameToLibrary'
    )
    expect(pushes.length).toBeGreaterThanOrEqual(1)

    const pushedGame = (
      defined(pushes[0], 'first push').args as unknown[]
    )[0] as {
      app_name: string
      runner: string
    }
    expect(pushedGame.runner).toBe('steam')
    expect(pushedGame.app_name).toBe('999001')

    const response = frames.find((frame) => frame.id === 'read-1')
    expect(response).toMatchObject({ id: 'read-1', ok: true })
  })

  // Test 2 (action flow): dispatching a `launch` invoke frame for a
  // numeric-appId steam game produces an `openExternal` RPC frame whose URL
  // matches ^steam://rungameid/\d+$.
  it('Test 2 (action flow): launch invoke for a numeric appId emits a validated steam://rungameid/<id> openExternal frame', async () => {
    const { input, frames } = boot()
    writeInvoke(input, 'launch-1', 'launch', [
      { appName: '999002', runner: 'steam' }
    ])
    await flush()

    const openExternal = frames.find((frame) => frame.kind === 'openExternal')
    expect(openExternal).toBeDefined()
    const url = (openExternal?.args as unknown[])[0] as string
    expect(url).toMatch(/^steam:\/\/rungameid\/\d+$/)
    expect(url).toBe('steam://rungameid/999002')

    const response = frames.find((frame) => frame.id === 'launch-1')
    expect(response).toMatchObject({
      id: 'launch-1',
      ok: true,
      result: { status: 'done' }
    })
  })

  // Test 3 (guard): a non-numeric appId does NOT emit an openExternal frame
  // (buildSteamProtocolUrl T-03-01 guard holds through the sidecar).
  it('Test 3 (guard): launch invoke for a non-numeric appId does not emit an openExternal frame', async () => {
    const { input, frames } = boot()
    writeInvoke(input, 'launch-2', 'launch', [
      { appName: '../../etc/passwd', runner: 'steam' }
    ])
    await flush()

    const openExternal = frames.find((frame) => frame.kind === 'openExternal')
    expect(openExternal).toBeUndefined()

    const response = frames.find((frame) => frame.id === 'launch-2')
    expect(response).toMatchObject({
      id: 'launch-2',
      ok: true,
      result: { status: 'error' }
    })
  })

  // Test 4 (snapshot) and the Phase 29 Plan 06 storeSet/storeDelete/storeNew cases drove the
  // sidecar's store read and write handlers. Since 85-16/85-17 the renderer's store channels are
  // native Rust channels and since 85-21 (D-03) the sidecar keeps no fallback handler; the snapshot
  // filter (no refreshToken), the write guards, the cache-store writes and the storeNew refusals are
  // `cargo test --bin gamelib-shell store_native`.

  describe('refreshLibrary runner dispatch (gap cycle 4)', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it("invoking refreshLibrary with ['gog'] calls the gog manager's refresh() and does NOT call the steam manager's refresh()", async () => {
      // The managers are built by the boot (66.1-23): boot first, then spy on its table.
      const { input, frames, services } = boot()
      const libraryManagerMap = services.managers.library
      const gogSpy = jest
        .spyOn(libraryManagerMap.gog, 'refresh')
        .mockResolvedValue({ stdout: '', stderr: '' })
      const steamSpy = jest
        .spyOn(libraryManagerMap.steam, 'refresh')
        .mockResolvedValue({ stdout: '', stderr: '' })

      writeInvoke(input, 'gog-refresh-1', 'refreshLibrary', ['gog'])
      await flush()

      expect(gogSpy).toHaveBeenCalledTimes(1)
      expect(steamSpy).not.toHaveBeenCalled()

      const response = frames.find((frame) => frame.id === 'gog-refresh-1')
      expect(response).toMatchObject({ id: 'gog-refresh-1', ok: true })
    })

    it("invoking refreshLibrary with ['all'] calls every manager's refresh()", async () => {
      // The managers are built by the boot (66.1-23): boot first, then spy on its table.
      const { input, frames, services } = boot()
      const libraryManagerMap = services.managers.library
      const spies = Object.entries(libraryManagerMap).map(([, manager]) =>
        jest
          .spyOn(manager, 'refresh')
          .mockResolvedValue({ stdout: '', stderr: '' })
      )

      writeInvoke(input, 'all-refresh-1', 'refreshLibrary', ['all'])
      await flush()

      spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1))

      const response = frames.find((frame) => frame.id === 'all-refresh-1')
      expect(response).toMatchObject({ id: 'all-refresh-1', ok: true })
    })

    // LIVE REGRESSION (2026-08-01, follow-up to 34.5-33): a live `pnpm tauri:dev`
    // session proved the mount-time "refresh everything" call
    // (`window.api.refreshLibrary(undefined)`, GlobalState.tsx) arrives at this
    // handler as `rawRunner === null`, never `undefined` — Tauri's RPC args cross
    // the wire JSON-encoded, and `JSON.stringify([undefined])` produces `[null]`.
    // Every OTHER test in this describe block invokes with `['gog']`/`['all']`/an
    // unknown-string element, or (Test 1, above this block) an EMPTY args array —
    // none of those exercise a literal `null` element, which is exactly why a
    // 3546-green suite missed this. Dispatching with `[null]` here reproduces the
    // real transport shape byte for byte.
    it("invoking refreshLibrary with [null] (the JSON-transport shape of the frontend's mount-time undefined call) calls every manager's refresh(), the same as ['all']", async () => {
      // The managers are built by the boot (66.1-23): boot first, then spy on its table.
      const { input, frames, services } = boot()
      const libraryManagerMap = services.managers.library
      const spies = Object.entries(libraryManagerMap).map(([, manager]) =>
        jest
          .spyOn(manager, 'refresh')
          .mockResolvedValue({ stdout: '', stderr: '' })
      )

      writeInvoke(input, 'null-refresh-1', 'refreshLibrary', [null])
      await flush()

      spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1))

      const response = frames.find((frame) => frame.id === 'null-refresh-1')
      expect(response).toMatchObject({ id: 'null-refresh-1', ok: true })
    })

    it('an unknown runner is rejected value-free at the schema boundary, and calls no manager’s refresh()', async () => {
      // The managers are built by the boot (66.1-23): boot first, then spy on its table.
      const { input, frames, services } = boot()
      const libraryManagerMap = services.managers.library
      const spies = Object.values(libraryManagerMap).map((manager) =>
        jest
          .spyOn(manager, 'refresh')
          .mockResolvedValue({ stdout: '', stderr: '' })
      )

      writeInvoke(input, 'unknown-refresh-1', 'refreshLibrary', [
        'not-a-real-runner'
      ])
      await flush()

      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled())

      const response = frames.find(
        (frame) => frame.id === 'unknown-refresh-1'
      ) as { id: string; ok: boolean; error?: string } | undefined
      expect(response?.ok).toBe(false)
      // Phase 67: the schema rejects it at the boundary, and a rejection is value-free
      // (it never echoes the offending argument).
      expect(response?.error).toEqual(expect.stringContaining('refreshLibrary'))
      expect(response?.error).not.toContain('not-a-real-runner')
    })

    it('in the all-branch, one manager rejecting does not reject the handler and the other managers still ran', async () => {
      // The managers are built by the boot (66.1-23): boot first, then spy on its table.
      const { input, frames, services } = boot()
      const libraryManagerMap = services.managers.library
      const rejectingSpy = jest
        .spyOn(libraryManagerMap.gog, 'refresh')
        .mockRejectedValue(new Error('gog refresh boom'))
      const otherSpies = Object.entries(libraryManagerMap)
        .filter(([runner]) => runner !== 'gog')
        .map(([, manager]) =>
          jest
            .spyOn(manager, 'refresh')
            .mockResolvedValue({ stdout: '', stderr: '' })
        )

      writeInvoke(input, 'all-refresh-partial-fail-1', 'refreshLibrary', [
        'all'
      ])
      await flush()

      expect(rejectingSpy).toHaveBeenCalledTimes(1)
      otherSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1))

      const response = frames.find(
        (frame) => frame.id === 'all-refresh-partial-fail-1'
      )
      expect(response).toMatchObject({
        id: 'all-refresh-partial-fail-1',
        ok: true
      })
    })
  })
})
