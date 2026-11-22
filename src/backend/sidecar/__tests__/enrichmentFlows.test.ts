/**
 * End-to-end wiring test for the sidecar's curated enrichment channels
 * (Phase 34.2 Plan 06 — REQ-34.2-04/REQ-34.2-07/REQ-34.2-11/REQ-34.2-12/
 * REQ-34.2-14).
 *
 * Drives the REAL sidecar RPC server in-process (`gameDetailsFlows.test.ts`'s
 * own real-shim black-box pattern — the shims under test are the actual
 * platform/index.ts and store_backend.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs. This suite's config directory is redirected to
 * a disposable per-process tmp home, never the developer's real config
 * directory.
 *
 * **CR-03 (34.2-10):** the ONLY mechanism that used to establish that
 * redirect was a `jest.mock('os', ...)` `homedir()` override. That is
 * insufficient: `pathShim.ts`'s `resolveAppDataDir()` prefers `env.APPDATA`
 * (win32) / `env.XDG_CONFIG_HOME` (default/Linux) over `homedir()`, so on
 * those platforms the mocked `homedir()` is never consulted and
 * `constants/paths.ts`'s module-scope `appFolder`/`userDataPath`/`fixesPath`
 * resolve to the REAL user config directory — where this suite's
 * `beforeEach`/`afterAll` then `rmSync(fixesPath, { recursive: true, force:
 * true })` and `configStore.set('games.recent', [])`. The `jest.mock('os',
 * ...)` block below is KEPT as defence-in-depth for any code that calls
 * `homedir()` directly, but the actual redirect now mocks `pathShim` itself
 * — the single choke point `platform/index.ts`'s `app.getPath()` calls through
 * — with no platform branch and no environment variable participating. A
 * `beforeAll` containment guard (below the mocks) additionally asserts, via
 * `resolve`+`relative` (never `startsWith`/`join` — see Phase 18's recorded
 * "join is not containment" lesson), that `appFolder`/`userDataPath`/
 * `fixesPath` all resolve inside `os.tmpdir()` before the first destructive
 * call can run, and throws loudly if not. This does not rely on the
 * `afterAll` below as a safety net — this repo's own
 * `tests-clobbering-real-steam-store` incident (commit `92c29a5e`) recorded
 * that an `afterAll` restore is not a safety net under jest worker
 * force-exit.
 *
 * Mocked only at the boundaries this plan's own module docstring names:
 *   - `axios` — scriptable per-URL (ITAD's search/prices/lookup endpoints), so
 *     the storeSearch trio's real `itad.ts` bodies run against
 *     controlled fixture data/failures instead of a real network call.
 *   - `backend/storeManagers` (`libraryManagerMap`) — scriptable managers,
 *     the boundary `buildCrossoverRatingMap`'s enumeration walks and
 *     `getGame` (real, from `backend/utils`) resolves through.
 *   - `backend/constants/environment` — a MUTABLE double (mirrors
 *     `ratingMap.test.ts`'s own `envMock` pattern) so `isMac`/`isWindows` can
 *     be flipped per test for the D-10/D-16 crossover-map states and the
 *     anticheat Windows rider.
 *   - `backend/crossover_index/index` (`isCrossoverIndexEligible`,
 *     `buildIndexResolver` — WR-07 replaced the per-game
 *     `getCodeweaversFromIndex`) — the SAME boundary `ratingMap.test.ts`
 *     itself uses: this suite asserts `crossoverRatingMap.ts`'s own
 *     three-state RESOLVER contract, not `index.ts`'s internal name-matching
 *     algorithm (already covered by `index.test.ts`).
 *   - `backend/config` (`GlobalConfig.get`) — avoids a real on-disk
 *     config.json write while bootstrap.ts's real i18next init still runs.
 *   - `backend/online_monitor` (full surface) — deterministic, no real
 *     `electron` `net` surface touched by `bootstrap.ts`'s
 *     `initOnlineMonitor()` call.
 *   - `backend/dialog/dialog`'s `notify`, `backend/utils`'s
 *     `sendGameStatusUpdate`, `legendary/user`'s `LegendaryUser`,
 *     `aborthandler`'s `callAbortController` — carried over unchanged from
 *     `gameDetailsFlowRegistration.ts`'s own harness (`gameDetailsFlows.test.ts`)
 *     because `handlers.ts` registers EVERY curated module at import time,
 *     including `gameDetailsFlowRegistration.ts`, which transitively reaches
 *     these; none of this suite's own assertions touch them.
 *
 * Deliberately NOT mocked (the bodies actually under test — mocking them
 * would prove only that a jest.fn() was called, per this plan's own
 * instruction): `storeSearch/itad`,
 * `crossover_index/crossoverRatingMap`, `knownFixes`.
 */

// ── os — GAP FIX precedent: redirect homedir() to a disposable per-process
// tmp directory so this suite can never touch a developer's real config
// directory ──────────────────────────────────────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-enrichmentflows-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
// ── axios — scriptable per-URL. `mockAxiosGet` / `mockAxiosPost` drive the
// storeSearch trio's real itad.ts bodies (top-level `axios.get` / `axios.post`);
// `create()` still exists so bootstrap.ts's real `fetchLastestReleases()`
// (`axiosClient = axios.create(...)`) does not crash at startup ──────────────
const mockAxiosGet = jest.fn()
const mockAxiosPost = jest.fn()
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      get: (...args: unknown[]) => mockAxiosGet(...args),
      post: (...args: unknown[]) => mockAxiosPost(...args),
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/constants/environment — MUTABLE double (mirrors ratingMap.test.ts's
// own envMock pattern) so isMac/isWindows can be flipped per test ───────────
const envMock = {
  isWindows: false,
  isMac: false,
  isLinux: true,
  isSteamDeckGameMode: false,
  isFlatpak: false
}
jest.mock('backend/constants/environment', () => envMock)

// ── backend/config mock — avoid a real on-disk config.json write while still
// exercising bootstrap.ts's real i18next init (settings.language) ───────────
jest.mock('backend/config', () => {
  // The factory the boot's 'config' step would call; its return value is the settings object
  // each test points it at.
  const createGlobalConfig = jest.fn()
  return { createGlobalConfig }
})

// ── backend/online_monitor mock (full surface, per bootstrap.test.ts's own
// reasoning) — no real `electron` `net` surface touched by bootstrap.ts's
// initOnlineMonitor() call ───────────────────────────────────────────────────

// ── backend/storeManagers mock — the boundary buildCrossoverRatingMap's
// enumeration walks and getGame(appName, runner) resolves through ───────────
jest.mock('backend/storeManagers', () => {
  const makeManager = () => ({
    getGame: jest.fn(),
    hasGame: jest.fn(() => true),
    changeGameInstallPath: jest.fn(),
    getLaunchOptions: jest.fn(),
    changeVersionPinnedStatus: jest.fn(),
    getGameOverride: jest.fn(),
    getGameSdl: jest.fn(),
    refresh: jest.fn(),
    getListOfGames: jest.fn(() => []),
    getCyberpunkMods: jest.fn(),
    setCyberpunkModConfig: jest.fn(),
    addNewApp: jest.fn()
  })
  const libraryManagerMap = {
    legendary: makeManager(),
    gog: makeManager(),
    steam: makeManager(),
    nile: makeManager(),
    sideload: makeManager()
  }
  return {
    libraryManagerMap,
    // The boot builds its managers through this factory (66.1-23); here it hands back the
    // scripted table so the suite keeps driving the same fakes.
    createStoreManagers: () => ({
      library: libraryManagerMap,
      launchHooks: {},
      autoUpdate: () => [],
      initAll: async () => [],
      launcher: {}
    })
  }
})

// ── backend/crossover_index/index mock — the SAME boundary ratingMap.test.ts
// itself uses: this suite asserts crossoverRatingMap.ts's own three-state
// resolver, not index.ts's internal name-matching algorithm ─────────────────
// WR-07: the boundary moved from a per-game `getCodeweaversFromIndex` to a
// once-per-pass `buildIndexResolver` returning a sync resolver. Two mocks so
// "was the index consulted AT ALL" stays separately assertable from "what did
// each game resolve to" -- the non-macOS test below depends on the former.
const mockIsCrossoverIndexEligible = jest.fn()
const mockResolveRatingFor = jest.fn()
const mockBuildIndexResolver = jest.fn()
jest.mock('../../crossover_index/index', () => ({
  isCrossoverIndexEligible: (...args: unknown[]) =>
    mockIsCrossoverIndexEligible(...args),
  // The boot builds its lookups with this factory (66.4-17): the mock exposes the factory name and
  // hands back lookups whose resolver is the scripted one.
  createCrossoverIndex: () => ({
    buildIndexResolver: (...args: unknown[]) => mockBuildIndexResolver(...args),
    getCodeweaversFromIndex: jest.fn(),
    crossoverIndexHas: jest.fn()
  })
}))

// ── backend/dialog/dialog / backend/utils / legendary/user / aborthandler —
// carried over unchanged from gameDetailsFlowRegistration.ts's own harness;
// handlers.ts registers every curated module (including
// gameDetailsFlowRegistration.ts) at import time, so this whole graph loads
// regardless of which channels THIS suite invokes ───────────────────────────
jest.mock('../../dialog/dialog', () => ({
  ...jest.requireActual('../../dialog/dialog'),
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))
jest.mock('../../storeManagers/legendary/user', () => ({
  LegendaryUser: { getUserInfo: jest.fn() }
}))

// ── steamgrid/secretStore — Amendment A-03 seam. Every steamgriddb.*
// handler under test MUST call deps.steamGridSecrets exclusively —
// never GlobalConfig or steamgrid/secureKey.ts directly (see
// mockedGlobalConfigGet.not.toHaveBeenCalled() assertion below). Fully
// controllable per test; re-armed in beforeEach because `resetMocks: true`
// strips the factory's own jest.fn() implementations before every test
// (WR-08 gotcha, same as isOnline/runOnceWhenOnline above) ──────────────────
const mockSecretStoreGetApiKey = jest.fn()
const mockSecretStoreSetApiKey = jest.fn()
const mockSecretStoreClearApiKey = jest.fn()
const mockGetSteamGridDbSecretStore = jest.fn(() => ({
  isAvailable: () => true,
  getApiKey: mockSecretStoreGetApiKey,
  setApiKey: mockSecretStoreSetApiKey,
  clearApiKey: mockSecretStoreClearApiKey
}))
// The sidecar's REAL (unmocked) bootstrap.ts builds the boot's SteamGridDB
// secret owner through createSteamGridDbSecrets() in the 'steamgrid-secrets'
// step, handing it the keyring/dev-vault store it selected. Here that factory
// always returns the SAME fixed test double regardless of the store it is
// given, so bootstrap's real selection cannot affect what this suite's
// handlers actually resolve.
jest.mock('../../steamgrid/secretStore', () => ({
  createSteamGridDbSecrets: () => mockGetSteamGridDbSecretStore()
}))

// ── steamgrid/utils — the real SteamGridDB API client. Mocked at this
// boundary per this suite's own "mocked only at the boundaries" discipline
// (module docstring): the channel-routing/seam logic is what this suite
// tests, not SteamGridDB's own HTTP-shaped client body (already covered by
// steamgrid/__tests__ if present) ────────────────────────────────────────
const mockSteamGridGetGrids = jest.fn()
const mockSteamGridGetHeroes = jest.fn()
jest.mock('../../steamgrid/utils', () => ({
  getGrids: (...args: unknown[]) => mockSteamGridGetGrids(...args),
  getHeroes: (...args: unknown[]) => mockSteamGridGetHeroes(...args)
}))

// ── discounts/fetchDiscounts — getGogDiscounts's Plan 34.6-09 extraction
// out of discounts/index.ts's previously-inline addHandler body. Mocked
// here for the same reason as steamgrid/utils above: this suite tests the
// channel-routing, not fetchDiscounts.ts's own GOG-catalog-fetching body ───
const mockGetGogDiscounts = jest.fn()
jest.mock('../../discounts/fetchDiscounts', () => ({
  getGogDiscounts: (...args: unknown[]) => mockGetGogDiscounts(...args)
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

// Per case (reset in freshRegistry): the boot is handed this root so the stores a case seeds
// and the boot's own stores share one file-cell table, as the old module-level registry did.
let testRoot = createTestStoreRoot()
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { join, relative, resolve, isAbsolute } from 'path'
import { tmpdir } from 'os'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

import {
  bootFresh,
  writeInvoke,
  findResponse,
  Frame,
  handlerRegistry
} from './helpers/sidecarHarness'
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'

// The app folders a boot derives for the jest-contained HOME (`jest.setupContainment`).
const {
  fixesPath,
  appFolder,
  userData: userDataPath
} = createContainedHomeAppPaths()
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { GameInfo } from 'common/types'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createTestOnlineMonitor } from 'backend/testUtils/testOnlineMonitor'
import { createItadSecrets } from 'backend/storeSearch/itadSecrets'

// ── CR-03 / WR-01 containment guard — MUST run before the first
// beforeEach's destructive rmSync/configStore.set calls (jest runs
// outer/top-level beforeAll before any nested describe's beforeEach). Uses
// resolve+relative, never startsWith/join (Phase 18: "join is not
// containment"; a bare prefix check would also pass for a sibling directory
// sharing the tmp prefix). Throws loudly rather than relying on the
// afterAll below as a safety net — see this repo's
// tests-clobbering-real-steam-store lesson (commit 92c29a5e): an afterAll
// restore is not a safety net under jest worker force-exit. (A
// getLogFilePath({}) element was retired in 84-07 with the TS log path.) ─────────
beforeAll(() => {
  const tmpRoot = resolve(tmpdir())
  const candidates = [appFolder, userDataPath, fixesPath]
  for (const candidate of candidates) {
    const rel = relative(tmpRoot, resolve(candidate))
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `[enrichmentFlows.test.ts] REFUSING TO RUN: "${candidate}" resolves ` +
          `outside os.tmpdir() (${tmpRoot}) — the jest containment redirect is ` +
          'not in effect, and this suite would rmSync/overwrite a real user ' +
          'config directory.'
      )
    }
  }
})

type ManagerMock = Record<'getGame' | 'getListOfGames', jest.Mock>

// D-08: every case boots the sidecar once, in a fresh module registry. Module
// handles the cases configure or inspect are rebound from that registry in
// freshRegistry() (run before each case, ahead of any mock configuration), and
// boot() then boots without a second reset. The SteamGridDB secret store the
// boot reads is a file-level double (`mockGetSteamGridDbSecretStore`), so it
// is configured in the beforeEach, which runs before the boot.
let wikiGameInfoStore: ReturnType<
  typeof import('../../wiki_game_info/stores').createWikiGameInfoStores
>['wikiGameInfoStore']
let configStore: ReturnType<
  typeof import('../../constants/key_value_stores').createKvsStores
>['configStore']
let loggerModule: typeof import('../../logger')
let mockedGlobalConfigGet: jest.Mock
let mockedIsOnline: jest.Mock
let mockedRunOnceWhenOnline: jest.Mock
let legendaryManager: ManagerMock
let gogManager: ManagerMock
let steamManager: ManagerMock
let nileManager: ManagerMock
let sideloadManager: ManagerMock

function freshRegistry(): void {
  jest.resetModules()
  testRoot = createTestStoreRoot()
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('../bootstrap')
  const { createGlobalConfig } = require('backend/config')
  const { libraryManagerMap } = require('backend/storeManagers')
  ;({ wikiGameInfoStore } =
    require('../../wiki_game_info/stores').createWikiGameInfoStores({
      root: testRoot
    }))
  ;({ configStore } =
    require('../../constants/key_value_stores').createKvsStores({
      registry: createStoreRegistry(),
      root: testRoot
    }))
  loggerModule = require('../../logger')
  /* eslint-enable @typescript-eslint/no-require-imports */
  mockedGlobalConfigGet = createGlobalConfig as jest.Mock
  mockedIsOnline = jest.fn()
  mockedRunOnceWhenOnline = jest.fn()
  legendaryManager = libraryManagerMap.legendary as unknown as ManagerMock
  gogManager = libraryManagerMap.gog as unknown as ManagerMock
  steamManager = libraryManagerMap.steam as unknown as ManagerMock
  nileManager = libraryManagerMap.nile as unknown as ManagerMock
  sideloadManager = libraryManagerMap.sideload as unknown as ManagerMock
}

// The monitor the boot hands out: the two members this suite drives are the jest.fns above, read
// at call time so a per-test re-arm is honoured.
/**
 * A real ITAD user-key owner over an in-memory store. The boot's own owner reads the OS keyring
 * through a Rust peer this suite does not have, which would hang every search; every boot here
 * hands it this one instead.
 */
function inMemoryItadSecrets() {
  let stored: string | undefined
  return createItadSecrets({
    store: {
      getApiKey: async () => stored,
      setApiKey: async (value) => {
        stored = value
      },
      clearApiKey: async () => {
        stored = undefined
      }
    }
  })
}

const boot = (itadSecrets = inMemoryItadSecrets()) =>
  bootFresh({
    reuseRegistry: true,
    // The anticheat data path is ctx.paths.appFolder (66.4-14): the shimmed app folder. The known-fix
    // layers are ctx.paths too (66.4-17): the remote layer is the shimmed `fixesPath` this suite writes
    // its fixtures under, the local layer nests inside it.
    context: {
      paths: { appFolder, fixesPath, localFixesPath: join(fixesPath, 'local') }
    },
    services: {
      storeRoot: testRoot,
      itadSecrets,
      onlineMonitor: {
        ...createTestOnlineMonitor(),
        isOnline: () => mockedIsOnline() as boolean,
        runOnceWhenOnline: (callback) => mockedRunOnceWhenOnline(callback)
      }
    }
  })

/** Points the mocked createGlobalConfig() at a fresh settings object. */
function mockAppSettings(partial: Record<string, unknown>) {
  const setSetting = jest.fn()
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial,
    setSetting,
    set: jest.fn(),
    flush: jest.fn()
  })
  return { setSetting }
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/**
 * Polls for a response frame instead of assuming any fixed delay was long enough. It was written
 * for `getAnticheatInfo` (a real `fs/promises` `readFile()` resolves through libuv's threadpool, so
 * its round-trip is bounded by OS thread scheduling, not the JS event loop; see debug session
 * `anticheat-response-frame-drop`). That channel is native since Phase 86 Plan 12, but the helper
 * stays for the UNPORTED-marker sweep below: polling every 10ms up to `timeoutMs` returns as soon as
 * the frame arrives and bakes in no upper-bound assumption beyond the test's own timeout budget.
 */
async function waitForResponse(
  frames: Frame[],
  id: string,
  timeoutMs = 3000
): Promise<ReturnType<typeof findResponse>> {
  const deadline = Date.now() + timeoutMs
  let response = findResponse(frames, id)
  while (!response && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    response = findResponse(frames, id)
  }
  return response
}

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    app_name: 'default-app',
    runner: 'legendary',
    title: 'Default Game',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    canRunOffline: false,
    ...overrides
  } as GameInfo
}

const ITAD_BASE = 'https://api.isthereanydeal.com'
const ITAD_GID = '018d937f-0f7e-7172-b2c5-9a6e6b4e38a1'
const ITAD_KEY_ENV = 'GAMELIB_ITAD_API_KEY'

const itadSearchFixture = [
  { id: ITAD_GID, title: 'Team Fortress 2', assets: { banner145: 'tf2.jpg' } }
]

const itadPricesFixture = [
  {
    id: ITAD_GID,
    deals: [
      {
        shop: { id: 61, name: 'Steam' },
        price: { amount: 4.99, amountInt: 499, currency: 'USD' },
        regular: { amount: 9.99, amountInt: 999, currency: 'USD' },
        url: 'https://store.steampowered.com/app/440/?ref=itad'
      }
    ]
  }
]

// Behavioural pin for the os-mock shadowing rule (quick 260905-jg4), rehomed here from the deleted
// loggerFlows.test.ts by Phase 84 plan 84-06: `structuralContainment.test.ts` leg 3 holds this test
// in place and needs a suite that declares a per-suite `os` mock in code. It sits in its own
// top-level describe, ahead of the suite's `freshRegistry()` (`jest.resetModules()`), because a
// reset drops the cached setupContainment instance and would make this file's mock take effect.
describe('os mock shadowing', () => {
  it("this file's own jest.mock('os') is INERT -- setupContainment's wins", () => {
    // MEASURED: a per-suite os mock in a backend suite never takes effect while the registry is
    // intact. `jest.setupContainment.ts` runs from `setupFiles` and requires 'os' during its own
    // precondition block, so the mocked module is already instantiated by the time this file's
    // hoisted os mock registers a new factory -- `require('os')` returns the cached
    // setupContainment instance. Containment is not weakened: homedir() still resolves inside a
    // disposable tmp root, just setupContainment's rather than this file's. The rule's canonical
    // statement is `jest.setupContainment.ts`'s SHADOWING section.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { homedir } = require('os') as typeof import('os')
    /* eslint-enable @typescript-eslint/no-require-imports */
    const thisFilesMockedHome = join(
      jest.requireActual<typeof import('os')>('os').tmpdir(),
      `gamelib-enrichmentflows-test-home-${process.pid}`
    )
    expect(homedir()).not.toBe(thisFilesMockedHome)
    expect(homedir()).toBe(process.env.HOME)

    // Still contained, which is the property that actually matters.
    const rel = relative(resolve(tmpdir()), resolve(homedir()))
    expect(rel.startsWith('..') || isAbsolute(rel)).toBe(false)
  })
})

describe('sidecar enrichment flows (Phase 34.2 Plan 06)', () => {
  beforeEach(() => {
    freshRegistry()
    mockAppSettings({ language: 'en' })
    mockAxiosGet.mockReset()
    mockAxiosPost.mockReset()
    mockIsCrossoverIndexEligible.mockReset()
    mockResolveRatingFor.mockReset()
    // Re-armed after mockReset per the WR-08 gotcha documented below:
    // `resetMocks: true` strips implementations, so a factory default would
    // not survive to the test body.
    mockBuildIndexResolver.mockReset()
    mockBuildIndexResolver.mockResolvedValue(mockResolveRatingFor)

    // WR-08 GOTCHA (this project's shared jest.config.js sets
    // `resetMocks: true`, which strips even a jest.mock FACTORY's own
    // default implementation before every test — not just call history).
    // Without re-arming this here, isOnline() returns undefined and
    // runOnceWhenOnline(cb) never invokes cb in ANY test in this file,
    // mirroring gameDetailsFlows.test.ts's identical, already-correct
    // pattern (line ~401).
    mockedIsOnline.mockReset().mockReturnValue(true)
    mockedRunOnceWhenOnline
      .mockReset()
      .mockImplementation((callback: () => unknown) => callback())

    // Re-armed per WR-08 (resetMocks: true strips factory implementations
    // before every test). Default: no key stored, so hasApiKey/searchGame/
    // getGrids/getHeroes exercise their "no key" branch unless a test
    // explicitly overrides mockSecretStoreGetApiKey's return value.
    mockGetSteamGridDbSecretStore.mockReset().mockImplementation(() => ({
      isAvailable: () => true,
      getApiKey: mockSecretStoreGetApiKey,
      setApiKey: mockSecretStoreSetApiKey,
      clearApiKey: mockSecretStoreClearApiKey
    }))
    mockSecretStoreGetApiKey.mockReset().mockResolvedValue(undefined)
    mockSecretStoreSetApiKey.mockReset().mockResolvedValue(undefined)
    mockSecretStoreClearApiKey.mockReset().mockResolvedValue(undefined)
    mockSteamGridGetGrids.mockReset()
    mockSteamGridGetHeroes.mockReset()
    mockGetGogDiscounts.mockReset()

    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true

    for (const manager of [
      legendaryManager,
      gogManager,
      steamManager,
      nileManager,
      sideloadManager
    ]) {
      for (const mock of Object.values(manager)) {
        mock.mockReset()
      }
      manager.getListOfGames.mockReturnValue([])
    }

    if (existsSync(fixesPath)) {
      rmSync(fixesPath, { recursive: true, force: true })
    }
    mkdirSync(fixesPath, { recursive: true })

    configStore.set('games.recent', [])
  })

  afterAll(() => {
    if (existsSync(fixesPath)) {
      rmSync(fixesPath, { recursive: true, force: true })
    }
  })

  // ── REQ-34.2-11 / Phase 20 D-14: the storeSearch error-propagation
  // contract. Every test uses a query / gid no other test cached, so a prior
  // happy path can never mask a reject scenario ─────────────────────────────
  describe('REQ-34.2-11/Phase 20 D-14 storeSearch error contract (load-bearing trio)', () => {
    beforeEach(() => {
      process.env[ITAD_KEY_ENV] = 'test-key'
    })
    afterEach(() => {
      delete process.env[ITAD_KEY_ENV]
    })

    it('REQ-34.2-11 searchStores (invoke): a rejecting provider surfaces an ERROR response frame carrying the [storeSearch:provider] marker, not an empty array', async () => {
      mockAxiosGet.mockImplementation(() =>
        Promise.reject(new Error('itad unreachable'))
      )

      const { input, frames } = boot()
      writeInvoke(input, 'ss-err-1', 'searchStores', ['some query'])
      await flush()

      const response = findResponse(frames, 'ss-err-1')
      expect(response?.ok).toBe(false)
      expect(typeof response?.error).toBe('string')
      expect(response?.error as string).toContain('[storeSearch:provider]')
      expect(response?.result).toBeUndefined()
    })

    it('REQ-34.2-11 getStoreSearchDeals (invoke): a rejecting provider surfaces an ERROR response frame carrying the [storeSearch:provider] marker, not an empty array', async () => {
      mockAxiosPost.mockImplementation(() =>
        Promise.reject(new Error('itad unreachable'))
      )

      const { input, frames } = boot()
      writeInvoke(input, 'gsd-err-1', 'getStoreSearchDeals', [ITAD_GID])
      await flush()

      const response = findResponse(frames, 'gsd-err-1')
      expect(response?.ok).toBe(false)
      expect(typeof response?.error).toBe('string')
      expect(response?.error as string).toContain('[storeSearch:provider]')
      expect(response?.result).toBeUndefined()
    })

    it('T-47-28b the error frame carries only the marker message: no key, no URL', async () => {
      mockAxiosGet.mockImplementation(() =>
        Promise.reject(new Error('https://api.isthereanydeal.com?key=test-key'))
      )

      const { input, frames } = boot()
      writeInvoke(input, 'ss-err-leak', 'searchStores', ['leak probe query'])
      await flush()

      const response = findResponse(frames, 'ss-err-leak')
      expect(response?.ok).toBe(false)
      expect(response?.error as string).not.toContain('test-key')
      expect(response?.error as string).not.toContain('http')
    })

    it('REQ-34.2-11 searchStores (invoke): no built-in key surfaces an ERROR frame carrying [storeSearch:notConfigured]', async () => {
      delete process.env[ITAD_KEY_ENV]

      const { input, frames } = boot()
      writeInvoke(input, 'ss-nokey-1', 'searchStores', ['keyless query'])
      await flush()

      const response = findResponse(frames, 'ss-nokey-1')
      expect(response?.ok).toBe(false)
      expect(response?.error as string).toContain('[storeSearch:notConfigured]')
      expect(mockAxiosGet).not.toHaveBeenCalled()
    })
  })

  // ── REQ-34.2-11: storeSearch trio happy paths ────────────────────────────
  describe('REQ-34.2-11 storeSearch trio (happy path)', () => {
    beforeEach(() => {
      process.env[ITAD_KEY_ENV] = 'test-key'
    })
    afterEach(() => {
      delete process.env[ITAD_KEY_ENV]
    })

    it('REQ-34.2-11 searchStores (invoke) returns the StoreSearchResponse envelope from ITAD', async () => {
      mockAxiosGet.mockImplementation((url: string) => {
        if (url === `${ITAD_BASE}/games/search/v1`) {
          return Promise.resolve({ data: itadSearchFixture })
        }
        return Promise.reject(new Error(`unexpected axios.get(${url})`))
      })
      mockAxiosPost.mockImplementation((url: string) => {
        if (url === `${ITAD_BASE}/games/prices/v3`) {
          return Promise.resolve({ data: itadPricesFixture })
        }
        return Promise.reject(new Error(`unexpected axios.post(${url})`))
      })

      const { input, frames } = boot()
      writeInvoke(input, 'ss-1', 'searchStores', ['team fortress', 'US'])
      await flush()

      const response = findResponse(frames, 'ss-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toMatchObject({
        pricedCountry: 'US',
        results: [
          {
            gameId: ITAD_GID,
            title: 'Team Fortress 2',
            cheapestPrice: '4.99',
            currencyCode: 'USD'
          }
        ]
      })
    })

    it('REQ-34.2-11 getStoreSearchDeals (invoke) returns the mapped ITAD deal breakdown', async () => {
      mockAxiosPost.mockImplementation((url: string) => {
        if (url === `${ITAD_BASE}/games/prices/v3`) {
          return Promise.resolve({ data: itadPricesFixture })
        }
        return Promise.reject(new Error(`unexpected axios.post(${url})`))
      })

      const { input, frames } = boot()
      writeInvoke(input, 'gsd-1', 'getStoreSearchDeals', [ITAD_GID, 'US'])
      await flush()

      const response = findResponse(frames, 'gsd-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toMatchObject([
        {
          storeId: '61',
          storeName: 'Steam',
          price: '4.99',
          retailPrice: '9.99',
          currencyCode: 'USD'
        }
      ])
    })

    it('PRICE-02 getItadSteamGids (invoke) returns the keyless appid -> gid map', async () => {
      mockAxiosPost.mockImplementation((url: string) => {
        if (url.startsWith(`${ITAD_BASE}/lookup/id/shop/`)) {
          return Promise.resolve({ data: { 'app/440': ITAD_GID } })
        }
        return Promise.reject(new Error(`unexpected axios.post(${url})`))
      })

      const { input, frames } = boot()
      writeInvoke(input, 'gig-1', 'getItadSteamGids', [['440']])
      await flush()

      const response = findResponse(frames, 'gig-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual({ '440': ITAD_GID })
    })
  })

  // ── REQ-34.2-11: getKnownFixes ────────────────────────────────────────────
  describe('REQ-34.2-11 getKnownFixes (invoke)', () => {
    it('REQ-34.2-11 returns the parsed fixture written under the tmp fixesPath', async () => {
      const fixture = { winetricks: ['vcrun2019'], runInPrefix: ['setup.exe'] }
      writeFileSync(
        join(fixesPath, 'known-fixes-app-gog.json'),
        JSON.stringify(fixture)
      )

      const { input, frames } = boot()
      writeInvoke(input, 'gkf-1', 'getKnownFixes', ['known-fixes-app', 'gog'])
      await flush()

      const response = findResponse(frames, 'gkf-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual(fixture)
    })

    it('REQ-34.2-11 returns null when no fix file exists for the appName/runner pair', async () => {
      const { input, frames } = boot()
      writeInvoke(input, 'gkf-2', 'getKnownFixes', ['no-such-app', 'gog'])
      await flush()

      const response = findResponse(frames, 'gkf-2')
      expect(response?.ok).toBe(true)
      expect(response?.result).toBeNull()
    })
  })

  // ── quick 261027-ch9: getGamelibFixStatus ──────────────────────────────────
  describe('quick 261027-ch9 getGamelibFixStatus (invoke)', () => {
    it('returns null for a fix present only in the remote fixesPath', async () => {
      writeFileSync(
        join(fixesPath, 'gfs-remote-app-gog.json'),
        JSON.stringify({ title: 'x', launchNotice: 'remote text' })
      )
      const { input, frames } = boot()
      writeInvoke(input, 'gfs-1', 'getGamelibFixStatus', [
        'gfs-remote-app',
        'gog'
      ])
      await flush()

      const response = findResponse(frames, 'gfs-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toBeNull()
    })

    it('returns origin local for a fix under the local layer', async () => {
      mkdirSync(join(fixesPath, 'local'), { recursive: true })
      writeFileSync(
        join(fixesPath, 'local', 'gfs-local-app-gog.json'),
        JSON.stringify({ title: 'x' })
      )
      const { input, frames } = boot()
      writeInvoke(input, 'gfs-2', 'getGamelibFixStatus', [
        'gfs-local-app',
        'gog'
      ])
      await flush()

      const response = findResponse(frames, 'gfs-2')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual({ origin: 'local' })
    })
  })

  // ── quick 261029-mkz: Runs for me override ─────────────────────────────────
  describe('quick 261029-mkz setRunsForMe / getRunsForMeMap (invoke)', () => {
    it('round-trips a user-on through the real store', async () => {
      const { input, frames } = boot()
      writeInvoke(input, 'rfm-1', 'setRunsForMe', [
        { appName: 'rfm.game', runner: 'steam', on: true }
      ])
      await flush()
      writeInvoke(input, 'rfm-2', 'getRunsForMeMap', [])
      await flush()

      expect(findResponse(frames, 'rfm-1')?.ok).toBe(true)
      const response = findResponse(frames, 'rfm-2')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual({ 'rfm.game_steam': 'user-on' })
    })

    it.each([
      ['non-string appName', { appName: 7, runner: 'gog', on: true }],
      ['empty appName', { appName: '', runner: 'gog', on: true }],
      ['unknown runner', { appName: 'x.bad', runner: 'epic', on: true }],
      ['non-boolean on', { appName: 'x.bad', runner: 'gog', on: 'yes' }],
      ['null payload', null]
    ])('writes nothing for a malformed payload: %s', async (_name, payload) => {
      const { input, frames } = boot()
      writeInvoke(input, 'rfm-bad', 'setRunsForMe', [payload])
      await flush()
      writeInvoke(input, 'rfm-get', 'getRunsForMeMap', [])
      await flush()

      const response = findResponse(frames, 'rfm-get')
      expect(response?.ok).toBe(true)
      const map = response?.result as Record<string, string>
      expect(Object.keys(map)).not.toContain('x.bad_gog')
      expect(Object.keys(map)).not.toContain('7_gog')
      expect(Object.keys(map)).not.toContain('_gog')
    })
  })

  // ── REQ-34.2-11/D-16: getCrossoverIndex three-state map ───────────────────
  describe('REQ-34.2-11/D-16 getCrossoverIndex (invoke)', () => {
    it('REQ-34.2-11/D-16 resolves the three-state map: ineligible key-absent, eligible-unmatched null, eligible-matched number', async () => {
      gogManager.getListOfGames.mockReturnValue([
        makeGameInfo({ app_name: 'ineligible-1', runner: 'gog' })
      ])
      steamManager.getListOfGames.mockReturnValue([
        makeGameInfo({ app_name: 'unmatched-1', runner: 'steam' }),
        makeGameInfo({ app_name: 'matched-1', runner: 'steam' })
      ])

      mockIsCrossoverIndexEligible.mockImplementation(
        (gameInfo: GameInfo) => gameInfo.app_name !== 'ineligible-1'
      )
      mockResolveRatingFor.mockImplementation((gameInfo: GameInfo) =>
        gameInfo.app_name === 'matched-1' ? 5 : null
      )

      const { input, frames } = boot()
      // Set AFTER the boot has settled: a macOS boot starts the dxmt release
      // check, which is not what this case exercises; the handler reads isMac
      // per call.
      await flush()
      envMock.isMac = true
      writeInvoke(input, 'gci-1', 'getCrossoverIndex', [])
      await flush()

      const response = findResponse(frames, 'gci-1')
      expect(response?.ok).toBe(true)
      const map = response?.result as Record<string, number | null>

      // key-ABSENT, not merely falsy — Object.prototype.hasOwnProperty, not a
      // truthiness check (D-16).
      expect(Object.prototype.hasOwnProperty.call(map, 'ineligible-1')).toBe(
        false
      )
      expect(Object.prototype.hasOwnProperty.call(map, 'unmatched-1')).toBe(
        true
      )
      expect(map['unmatched-1']).toBeNull()
      expect(Object.prototype.hasOwnProperty.call(map, 'matched-1')).toBe(true)
      expect(map['matched-1']).toBe(5)
    })

    it('REQ-34.2-11/D-16 returns {} on non-macOS regardless of eligibility, and never consults the index', async () => {
      envMock.isMac = false

      steamManager.getListOfGames.mockReturnValue([
        makeGameInfo({ app_name: 'would-be-eligible', runner: 'steam' })
      ])
      mockIsCrossoverIndexEligible.mockReturnValue(true)
      mockResolveRatingFor.mockReturnValue(5)

      const { input, frames } = boot()
      writeInvoke(input, 'gci-2', 'getCrossoverIndex', [])
      await flush()

      const response = findResponse(frames, 'gci-2')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual({})
      expect(mockIsCrossoverIndexEligible).not.toHaveBeenCalled()
      expect(mockResolveRatingFor).not.toHaveBeenCalled()
      // WR-07: stronger than the old assertion -- the index is not merely
      // unqueried per game, it is never LOADED.
      expect(mockBuildIndexResolver).not.toHaveBeenCalled()
    })
  })

  // ── REQ-34.2-11: removeRecent positive side-effect ────────────────────────
  // Phase 86 Plan 08 (D-17): `removeRecent` is a native `info` channel served by Rust, so the
  // sidecar no longer registers it. Its removal, write bytes, emit and tray update are pinned by
  // `gamelib-info`'s `golden_recent` and the shell's `info_dispatch` tests; its single owner by
  // `nativeChannelOwnership.test.ts`.

  // ── REQ-34.2-11: getWikiGameInfo resolves via getGame(appName, runner);
  // the title argument is intentionally ignored ────────────────────────────
  describe('REQ-34.2-11 getWikiGameInfo (invoke)', () => {
    it('REQ-34.2-11 resolves the game through getGame(appName, runner) and returns the wiki payload, ignoring a deliberately wrong title argument', async () => {
      const realTitle = 'The Real Game Title'
      const cachedPayload = {
        pcgamingwiki: null,
        applegamingwiki: null,
        codeweavers: {
          macRating: null,
          linuxRating: null,
          slug: 'the-real-game-title'
        },
        howlongtobeat: null,
        gamesdb: null,
        steamInfo: null,
        umuId: null,
        // Load-bearing, and NOT incidental fixture noise. `getWikiGameInfo`'s
        // `staleWikiFetch` guard (quick task 260822-rc8) treats a cached entry with NO
        // `fetchStatus` as a 403-era entry and re-fetches it, which would make this
        // suite's "the cache hit resolved everything" assertion below fail for a reason
        // that has nothing to do with the cache KEY this test is actually about. A
        // successful outcome keeps the entry a genuine cache hit.
        fetchStatus: {
          pcgamingwiki: 'ok' as const,
          howlongtobeat: 'ok' as const
        }
      }
      // Cache is keyed by the GAME's OWN title (from getGameInfo()), never
      // by the invoke's `title` argument — pre-populating it under the REAL
      // title and then passing a WRONG title argument proves the cache
      // lookup (and therefore the whole resolution) used getGame()'s
      // result, not the ignored argument.
      wikiGameInfoStore.set(realTitle, cachedPayload)

      legendaryManager.getGame.mockReturnValue({
        getGameInfo: () => ({
          app_name: 'wiki-app-1',
          title: realTitle,
          runner: 'legendary'
        })
      })

      const { input, frames } = boot()
      writeInvoke(input, 'gwgi-1', 'getWikiGameInfo', [
        'A Completely Wrong Title',
        'wiki-app-1',
        'legendary',
        false
      ])
      await flush()

      const response = findResponse(frames, 'gwgi-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual(cachedPayload)
      expect(legendaryManager.getGame).toHaveBeenCalledWith('wiki-app-1')
      // No provider fetch ever happened — the cache hit resolved everything,
      // which is only possible if the lookup key was the REAL title, not
      // the wrong one passed as the `title` argument.
      expect(mockAxiosGet).not.toHaveBeenCalled()
    })
  })

  // ── Phase 86 (86-12, D-17): the anticheat lookup is a native `info` channel ───────────────────
  // Its behavior (the Epic-namespace-only keying, null on Windows, null for a missing data file) is
  // pinned by the Rust golden `golden_anticheat.rs` and the native vectors, not here.
  it('Phase 86 (D-17) getAnticheatInfo is a native `info` channel: the sidecar no longer registers it', () => {
    boot()
    expect(handlerRegistry.has('getAnticheatInfo')).toBe(false)
  })

  // ── Phase 47 D-05/D-06 (T-47-41/42): itad.getKeyStatus / itad.setApiKey go through the boot's
  // one deps.itadSecrets owner and never return or log the key.
  describe('Phase 47 itad.getKeyStatus + itad.setApiKey (invoke)', () => {
    const SEEDED = 'itad-seeded-test-value'

    it('reports hasKey false and rejected false with no key set', async () => {
      const { input, frames } = boot()
      writeInvoke(input, 'itad-status-0', 'itad.getKeyStatus', [])
      await flush()
      expect(findResponse(frames, 'itad-status-0')?.result).toEqual({
        hasKey: false,
        rejected: false
      })
    })

    it('setApiKey then getKeyStatus reports hasKey true, and the frame never carries the key', async () => {
      const { input, frames } = boot()
      writeInvoke(input, 'itad-set-1', 'itad.setApiKey', [SEEDED])
      await flush()
      expect(findResponse(frames, 'itad-set-1')?.ok).toBe(true)

      writeInvoke(input, 'itad-status-1', 'itad.getKeyStatus', [])
      await flush()
      const status = findResponse(frames, 'itad-status-1')
      expect(status?.result).toEqual({ hasKey: true, rejected: false })
      expect(JSON.stringify(status)).not.toContain(SEEDED)
    })

    it('reports rejected true after the owner marks the key rejected, and clearing resets it', async () => {
      const owner = inMemoryItadSecrets()
      const { input, frames } = boot(owner)
      writeInvoke(input, 'itad-set-2', 'itad.setApiKey', [SEEDED])
      await flush()
      owner.markRejected()
      writeInvoke(input, 'itad-status-2', 'itad.getKeyStatus', [])
      await flush()
      expect(findResponse(frames, 'itad-status-2')?.result).toEqual({
        hasKey: true,
        rejected: true
      })

      writeInvoke(input, 'itad-clear', 'itad.setApiKey', [''])
      await flush()
      writeInvoke(input, 'itad-status-3', 'itad.getKeyStatus', [])
      await flush()
      expect(findResponse(frames, 'itad-status-3')?.result).toEqual({
        hasKey: false,
        rejected: false
      })
    })

    it('ignores a non-string key: the call is rejected and the status is unchanged', async () => {
      const { input, frames } = boot()
      writeInvoke(input, 'itad-bad', 'itad.setApiKey', [42])
      await flush()
      expect(findResponse(frames, 'itad-bad')?.ok).toBe(false)

      writeInvoke(input, 'itad-status-4', 'itad.getKeyStatus', [])
      await flush()
      expect(findResponse(frames, 'itad-status-4')?.result).toEqual({
        hasKey: false,
        rejected: false
      })
    })
  })

  // ── REQ-34.6-02/04/08/13, Amendment A-03: steamgriddb.* + getGogDiscounts
  // (invoke) — every steamgriddb.* read/write below goes through
  // deps.steamGridSecrets exclusively; NEVER GlobalConfig or
  // steamgrid/secureKey.ts directly (T-34.6-01/T-34.6-24). Never logs,
  // echoes, or otherwise persists a raw API key value in this file — every
  // assertion below checks presence/absence and call arguments only.
  describe('REQ-34.6-02/04/08/13 steamgriddb.* + getGogDiscounts (invoke)', () => {
    it('REQ-34.6-02 steamgriddb.hasApiKey is false when the secret store holds no key, and never reads GlobalConfig', async () => {
      mockSecretStoreGetApiKey.mockResolvedValueOnce(undefined)
      const { input, frames } = boot()
      // bootstrap.ts's REAL (unmocked) startSidecarSteamGridDbSecretStore()
      // fires a synchronous-start, fire-and-forget migrateSteamGridDbApiKey()
      // that reads the global config on its very first line (Plan 34.6-02,
      // A-03) — unrelated to the handler under test here. Cleared AFTER
      // boot() but BEFORE the invoke below so the assertion below
      // is scoped to the hasApiKey handler's OWN behavior only.
      mockedGlobalConfigGet.mockClear()
      writeInvoke(input, 'sgdb-has-1', 'steamgriddb.hasApiKey', [])
      await flush()
      expect(findResponse(frames, 'sgdb-has-1')?.result).toBe(false)

      expect(mockedGlobalConfigGet).not.toHaveBeenCalled()
    })

    it('REQ-34.6-02 steamgriddb.hasApiKey is true when the secret store holds a key, and never reads GlobalConfig', async () => {
      mockSecretStoreGetApiKey.mockResolvedValueOnce('a-seeded-test-value')
      const { input, frames } = boot()
      // See the test above for why this mockClear() is required.
      mockedGlobalConfigGet.mockClear()
      writeInvoke(input, 'sgdb-has-2', 'steamgriddb.hasApiKey', [])
      await flush()
      expect(findResponse(frames, 'sgdb-has-2')?.result).toBe(true)

      expect(mockedGlobalConfigGet).not.toHaveBeenCalled()
    })

    it('REQ-34.6-02 steamgriddb.setApiKey persists via the secret store’s setApiKey and never touches GlobalConfig', async () => {
      const { input, frames } = boot()
      // See the hasApiKey test above for why this mockClear() is required
      // and load-bearing, not incidental cleanup.
      mockedGlobalConfigGet.mockClear()
      writeInvoke(input, 'sgdb-set-1', 'steamgriddb.setApiKey', [
        'a-seeded-test-value'
      ])
      await flush()

      expect(findResponse(frames, 'sgdb-set-1')?.ok).toBe(true)
      expect(mockSecretStoreSetApiKey).toHaveBeenCalledWith(
        'a-seeded-test-value'
      )
      // Amendment A-03's load-bearing assertion: the global config must
      // NEVER be called by this handler. RED-proven live during
      // implementation (see 34.6-09-SUMMARY.md) by temporarily adding a
      // `the global config.setSetting(...)` call inside the handler —
      // this exact assertion failed, and only this one, before the
      // temporary line was reverted.
      expect(mockedGlobalConfigGet).not.toHaveBeenCalled()
    })

    // WR-01 (34.6-REVIEW.md): the handler used `args[0] as string` -- a CAST, not
    // a check. A non-string reaching SidecarKeyringSlotStore.setToken() gets
    // requestRustInvoke awaited FIRST (so the keyring write may actually be issued,
    // e.g. as a serialized null) and only then does `token.length` throw, landing in
    // a catch that logs the write as "failed" when it may have succeeded with a
    // corrupted value. setToken is a total method, so no rejection reaches the caller
    // either. These pin rejection at the boundary, before any keyring round trip.

    it.each([
      ['undefined', undefined],
      ['a number', 42],
      ['null', null],
      ['an object', { key: 'not-a-string' }]
    ])(
      'WR-01 steamgriddb.setApiKey REJECTS %s at the schema boundary and never reaches the secret store',
      async (_label, badKey) => {
        const { input, frames } = boot()
        writeInvoke(input, 'sgdb-bad-1', 'steamgriddb.setApiKey', [badKey])
        await flush()

        // Phase 67: the channel schema rejects a non-string key before the handler runs.
        expect(findResponse(frames, 'sgdb-bad-1')?.ok).toBe(false)
        // The load-bearing half: the store is never touched, so no keyring
        // round trip is attempted with a non-string.
        expect(mockSecretStoreSetApiKey).not.toHaveBeenCalled()
      }
    )

    it('WR-01 steamgriddb.setApiKey still accepts an EMPTY STRING (a valid clear gesture, not a malformed key)', async () => {
      const { input, frames } = boot()
      writeInvoke(input, 'sgdb-empty-1', 'steamgriddb.setApiKey', [''])
      await flush()

      expect(findResponse(frames, 'sgdb-empty-1')?.ok).toBe(true)
      // Proves the guard tests the TYPE, not truthiness -- a falsy-check here
      // would have silently broken "submit an empty value to clear the key".
      expect(mockSecretStoreSetApiKey).toHaveBeenCalledWith('')
    })

    it('REQ-34.6-04 steamgriddb.getGrids and steamgriddb.getHeroes each return their own mapped results when a key is stored', async () => {
      mockSecretStoreGetApiKey.mockResolvedValue('a-seeded-test-value')
      mockSteamGridGetGrids.mockResolvedValueOnce([
        {
          id: 10,
          url: 'https://example/grid.png',
          thumb: 'https://example/grid-thumb.png'
        }
      ])
      mockSteamGridGetHeroes.mockResolvedValueOnce([
        {
          id: 20,
          url: 'https://example/hero.png',
          thumb: 'https://example/hero-thumb.png'
        }
      ])

      const { input, frames } = boot()
      writeInvoke(input, 'sgdb-grids-1', 'steamgriddb.getGrids', [
        { gameId: 123, styles: ['alternate'], dimensions: ['600x900'] }
      ])
      writeInvoke(input, 'sgdb-heroes-1', 'steamgriddb.getHeroes', [
        { gameId: 123 }
      ])
      await flush()

      expect(mockSteamGridGetGrids).toHaveBeenCalledWith(
        expect.anything(),
        'a-seeded-test-value',
        { gameId: 123, dimensions: ['600x900'], styles: ['alternate'] }
      )
      expect(findResponse(frames, 'sgdb-grids-1')?.result).toEqual([
        {
          id: 10,
          url: 'https://example/grid.png',
          thumb: 'https://example/grid-thumb.png'
        }
      ])
      expect(mockSteamGridGetHeroes).toHaveBeenCalledWith(
        expect.anything(),
        'a-seeded-test-value',
        { gameId: 123, dimensions: undefined, styles: undefined }
      )
      expect(findResponse(frames, 'sgdb-heroes-1')?.result).toEqual([
        {
          id: 20,
          url: 'https://example/hero.png',
          thumb: 'https://example/hero-thumb.png'
        }
      ])
    })

    it('REQ-34.6-08 getGogDiscounts delegates to fetchDiscounts.ts’s getGogDiscounts(deps, locale, hideOwned, wishlistOnly)', async () => {
      const locale = {
        countryCode: 'US',
        locale: 'en-US',
        currencyCode: 'USD'
      }
      mockGetGogDiscounts.mockResolvedValueOnce([
        { id: 'prod-1', title: 'Discounted Game' }
      ])

      const { input, frames } = boot()
      writeInvoke(input, 'discounts-1', 'getGogDiscounts', [
        locale,
        true,
        false
      ])
      await flush()

      expect(mockGetGogDiscounts).toHaveBeenCalledWith(
        expect.objectContaining({
          stores: expect.anything(),
          libraryManagers: expect.anything()
        }),
        locale,
        true,
        false
      )
      expect(findResponse(frames, 'discounts-1')?.result).toEqual([
        { id: 'prod-1', title: 'Discounted Game' }
      ])
    })

    it('T-34.6-25: a steamgriddb.getGrids rejection is logged without any log argument containing the seeded API key value', async () => {
      const logErrorSpy = jest.spyOn(loggerModule, 'logError')
      const seededKey = 'a-seeded-test-value-that-must-never-be-logged'
      mockSecretStoreGetApiKey.mockResolvedValueOnce(seededKey)
      mockSteamGridGetGrids.mockRejectedValueOnce(
        new Error('SteamGridDB boundary rejection')
      )

      const { input, frames } = boot()
      writeInvoke(input, 'sgdb-search-err', 'steamgriddb.getGrids', [
        { gameId: 1 }
      ])
      await flush()

      expect(findResponse(frames, 'sgdb-search-err')?.ok).toBe(false)
      expect(logErrorSpy).toHaveBeenCalled()
      for (const call of logErrorSpy.mock.calls) {
        const serialized = JSON.stringify(call)
        expect(serialized).not.toContain(seededKey)
      }
      logErrorSpy.mockRestore()
    })
  })

  // ── REQ-34.2-14 / SEAM Invariant B ──────────────────────────────────────────
  describe('REQ-34.2-14/SEAM Invariant B', () => {
    const ALL_7_CHANNELS: [string, unknown[]][] = [
      ['getWikiGameInfo', ['t', 'app-x', 'legendary', false]],
      ['getKnownFixes', ['app-x', 'gog']],
      ['getCrossoverIndex', []],
      ['searchStores', ['query-x']],
      ['getStoreSearchDeals', [ITAD_GID]],
      ['getItadSteamGids', [['440']]]
      // `removeRecent` left this list in Phase 86 Plan 08 (D-17): it is a native `info` channel.
    ]

    it.each(ALL_7_CHANNELS)(
      'REQ-34.2-14 channel "%s" does not return UNPORTED_CHANNEL_MARKER and is present in the handler registry',
      async (channel, args) => {
        mockAxiosGet.mockImplementation(() =>
          Promise.reject(new Error('boundary rejection, not a marker'))
        )
        mockAxiosPost.mockImplementation(() =>
          Promise.reject(new Error('boundary rejection, not a marker'))
        )

        const { input, frames } = boot()
        writeInvoke(input, `all7-${channel}`, channel, args)
        // waitForResponse(), not flush(): see its docstring above.
        const response = await waitForResponse(frames, `all7-${channel}`)
        expect(response).toBeDefined()
        expect(String(response?.error ?? '')).not.toContain(
          UNPORTED_CHANNEL_MARKER
        )
        expect(handlerRegistry.has(channel)).toBe(true)
      }
    )

    // UPDATED (Phase 34.3 Plan 01): `checkDiskSpace` — this test's original
    // example channel — is no longer unported. It is now registered for real
    // by `shellFilesFlowRegistration.ts` (REQ-34.3-02, `shellFilesFlows.test.ts`
    // covers its ported behavior). `getLegendaryVersion` substituted here as a
    // channel that plan did not touch and that stayed genuinely unported
    // until Phase 34.5.
    //
    // UPDATED AGAIN (Phase 34.5 Plan 07, REQ-34.5-06): `getLegendaryVersion`
    // is ALSO no longer unported — it is now registered for real by
    // `runnerMiscFlowRegistration.ts` (`runnerMiscFlows.test.ts` covers its
    // ported registration kind). `winetricksInstall` substituted here as a
    // channel D-03 permanently deferred to Phase 34.6.
    //
    // UPDATED AGAIN (Phase 34.6 Plan 07, REQ-34.6-04/07/13): `winetricksInstall`
    // is ALSO no longer unported — it is now registered for real (send-kind,
    // D-11) by `wineToolsFlowRegistration.ts` (`wineToolsFlows.test.ts` covers
    // its ported registration kind). A synthetic channel name substitutes here:
    // `sidecarRpc.ts` answers ANY channel with no registered handler with
    // `UNPORTED_CHANNEL_MARKER` (it never consults a list of known names), so a name that
    // no slice will ever register is a stable exemplar that needs no further substitution.
    it('REQ-34.2-14 an UNPORTED channel (no handler registered) still returns UNPORTED_CHANNEL_MARKER', async () => {
      const { input, frames } = boot()
      writeInvoke(input, 'unported-1', 'neverRegisteredChannel', [])
      await flush()

      const response = findResponse(frames, 'unported-1')
      expect(response?.ok).toBe(false)
      expect(response?.error).toContain(UNPORTED_CHANNEL_MARKER)
    })
  })
})

// ── REQ-34.2-04 import gates (comment-stripped, self-tested) ───────────────
describe('REQ-34.2-04 enrichmentFlowRegistration.ts import gates', () => {
  // Comment-stripping now delegates to the shared
  // `backend/testUtils/stripSourceComments` util (strips block comments
  // first, then the line-prefix filter), imported above as `stripComments`.

  it('REQ-34.2-04 self-test: stripComments removes a comment-only forbidden-pattern line before matching', () => {
    const source = [
      "// this comment intentionally says: from 'backend/platform'",
      "import { ipcMain } from './platformApi'"
    ].join('\n')
    expect(stripComments(source)).not.toMatch(/from\s+['"]electron['"]/)
  })

  it('REQ-34.2-04 enrichmentFlowRegistration.ts references no ipc_handler path, backend/ipc, ../ipc, or storeSearch/index', () => {
    const source = readFileSync(
      join(__dirname, '../enrichmentFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/ipc_handler/)
    expect(stripped).not.toMatch(/backend\/ipc/)
    expect(stripped).not.toMatch(/from\s+['"]\.\.\/ipc['"]/)
    expect(stripped).not.toMatch(/storeSearch\/index/)
  })

  it('REQ-34.6-02/04/08/13 Amendment A-03: enrichmentFlowRegistration.ts never references GlobalConfig, steamgrid/secureKey, or the raw steamGridDbApiKey setting name', () => {
    const source = readFileSync(
      join(__dirname, '../enrichmentFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/GlobalConfig/)
    expect(stripped).not.toMatch(/secureKey/)
    expect(stripped).not.toMatch(/steamGridDbApiKey/)
    expect(stripped).not.toMatch(/encryptApiKey|decryptApiKey/)
    expect(stripped).not.toMatch(/steamgrid\/ipc_handler/)
  })

  it('REQ-34.2-04 no .ts file directly under src/backend/sidecar/ imports the real electron module (re-run of the directory gate, now covering the new file)', () => {
    const sidecarDir = join(__dirname, '..')
    const files: string[] = readdirSync(sidecarDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
    expect(files).toContain('enrichmentFlowRegistration.ts')

    for (const file of files) {
      const stripped = stripComments(
        readFileSync(join(sidecarDir, file), 'utf-8')
      )
      expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
      expect(stripped).not.toMatch(/require\(\s*['"]electron['"]\s*\)/)
    }
  })
})
