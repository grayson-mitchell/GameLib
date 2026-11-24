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
 *   - `axios` — scriptable, so no boot path or channel body reaches a real network call. (The GOG
 *     discounts body that once ran against it is Rust now, 86-18; the registration is a forward.)
 *   - `backend/storeManagers` (`libraryManagerMap`) — scriptable managers,
 *     the boundary `getGame` (real, from `backend/utils`) resolves through.
 *   - `backend/constants/environment` — a MUTABLE double (mirrors
 *     `ratingMap.test.ts`'s own `envMock` pattern) so `isMac`/`isWindows` can
 *     be flipped per test for the D-10/D-16 crossover-map states and the
 *     anticheat Windows rider.
 *   - (`getCrossoverIndex` is the D-24 resolver `info/crossover.ts` since 86-19 and runs for real: the
 *     harness answers its one `info_crossover_rating_map` Rust frame. The TS `crossover_index` module
 *     that this suite once mocked was deleted in 86-24.)
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
 * instruction): `knownFixes`.
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
// ── axios — scriptable. `mockAxiosGet` / `mockAxiosPost` stand in for the top-level
// `axios.get` / `axios.post` (nothing here calls them any more: the GOG discounts fetch is Rust, 86-18);
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

// ── info/discounts — getGogDiscounts's resolver. The catalog fetch is Rust now (86-18); this suite
// tests the channel routing (the registration forwards its three positional arguments), not the
// resolver's own token read, which `info/__tests__/discounts.test.ts` covers. ───
const mockGetGogDiscounts = jest.fn()
jest.mock('../../info/discounts', () => ({
  getGogDiscounts: (...args: unknown[]) => mockGetGogDiscounts(...args)
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

// Per case (reset in freshRegistry): the boot is handed this root so the stores a case seeds
// and the boot's own stores share one file-cell table, as the old module-level registry did.
let testRoot = createTestStoreRoot()
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
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
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createTestOnlineMonitor } from 'backend/testUtils/testOnlineMonitor'

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
// boot() then boots without a second reset.
let configStore: ReturnType<
  typeof import('../../constants/key_value_stores').createKvsStores
>['configStore']
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
  ;({ configStore } =
    require('../../constants/key_value_stores').createKvsStores({
      registry: createStoreRegistry(),
      root: testRoot
    }))
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
const boot = (rustAnswers?: Record<string, (args: unknown[]) => unknown>) =>
  bootFresh({
    reuseRegistry: true,
    rustAnswers,
    // The anticheat data path is ctx.paths.appFolder (66.4-14): the shimmed app folder. The known-fix
    // layers are ctx.paths too (66.4-17): the remote layer is the shimmed `fixesPath` this suite writes
    // its fixtures under, the local layer nests inside it.
    context: {
      paths: { appFolder, fixesPath, localFixesPath: join(fixesPath, 'local') }
    },
    services: {
      storeRoot: testRoot,
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

  // ── Phase 86 (86-16, D-17): the storeSearch trio (`searchStores`, `getStoreSearchDeals`,
  // `getItadSteamGids`) are native `info` channels served by Rust. Their error contract, request
  // shapes, caches and stale-serve behaviour are proven against the 86-07 goldens in
  // `gamelib-info`'s `golden_storeSearch.rs`, not through the sidecar. ──────────────────────────

  // ── Phase 88 (88-08, D-19, D-23): `getKnownFixes` is a native `knownfix` channel served by Rust
  // (`knownfix_read`). The three layers, the allow-list and the traversal refusal are pinned by
  // `gamelib-knownfix`'s `golden_reader.rs` and the argument bounds by the native manifest vectors, so the
  // sidecar no longer registers it. ────────────────────────────────────────────────────────────────────
  it('Phase 88 (D-19) getKnownFixes is a native `knownfix` channel: the sidecar no longer registers it', () => {
    boot()
    expect(handlerRegistry.has('getKnownFixes')).toBe(false)
  })

  // ── Phase 88 (88-08, D-19, D-23): `getGamelibFixStatus` (quick 261027-ch9) is a native `knownfix` channel
  // served by Rust (`knownfix_status`): the remote layer never counts, a routing-only tier-1 file does not
  // count, and the launch notice is trimmed. Those rules are pinned by `gamelib-knownfix`'s
  // `golden_reader.rs`, so the sidecar no longer registers it. ───────────────────────────────────────────
  it('Phase 88 (D-19) getGamelibFixStatus is a native `knownfix` channel: the sidecar no longer registers it', () => {
    boot()
    expect(handlerRegistry.has('getGamelibFixStatus')).toBe(false)
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

  // ── REQ-34.2-11/D-16: getCrossoverIndex three-state map. Since Phase 86 (86-19) the map is built
  // in Rust (`info_crossover_rating_map`: key absent for a game never looked up, null for looked up
  // and not found, a number for a match, `{}` off macOS) and pinned by `golden_crossover.rs`; the
  // registration stays TS-registered as a D-24 resolver because the games come from the library
  // managers. This suite runs the real resolver and answers its one Rust frame.
  describe('REQ-34.2-11/D-16 getCrossoverIndex (invoke)', () => {
    const game = (app_name: string, title: string, runner: string) => ({
      app_name,
      title,
      runner
    })

    it('Phase 86 (86-19, D-24) getCrossoverIndex sends every library manager’s games to Rust in one call and answers the map it returns', async () => {
      for (const manager of [legendaryManager, nileManager, sideloadManager]) {
        manager.getListOfGames.mockReturnValue([])
      }
      gogManager.getListOfGames.mockReturnValue([
        game('ineligible-1', 'Some GOG Game', 'gog')
      ])
      steamManager.getListOfGames.mockReturnValue([
        game('unmatched-1', 'Unmatched', 'steam'),
        game('matched-1', 'Matched', 'steam')
      ])
      const asked: unknown[][] = []

      const { input, frames } = boot({
        info_crossover_rating_map: (args) => {
          asked.push(args)
          return { 'matched-1': 5, 'unmatched-1': null }
        }
      })
      writeInvoke(input, 'gci-1', 'getCrossoverIndex', [])
      await flush()

      expect(asked).toEqual([
        [
          {
            games: [
              {
                appName: 'ineligible-1',
                title: 'Some GOG Game',
                runner: 'gog'
              },
              { appName: 'unmatched-1', title: 'Unmatched', runner: 'steam' },
              { appName: 'matched-1', title: 'Matched', runner: 'steam' }
            ]
          }
        ]
      ])
      const response = findResponse(frames, 'gci-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual({ 'matched-1': 5, 'unmatched-1': null })
    })

    it('Phase 86 (86-19) a rejected Rust call reaches the renderer as a rejection, not as an empty map', async () => {
      for (const manager of [
        legendaryManager,
        gogManager,
        steamManager,
        nileManager,
        sideloadManager
      ]) {
        manager.getListOfGames.mockReturnValue([])
      }

      const { input, frames } = boot({
        info_crossover_rating_map: () => {
          throw new Error('info_crossover_rating_map:bad-args')
        }
      })
      writeInvoke(input, 'gci-2', 'getCrossoverIndex', [])
      await flush()

      expect(findResponse(frames, 'gci-2')?.ok).toBe(false)
    })
  })

  // ── REQ-34.2-11: removeRecent positive side-effect ────────────────────────
  // Phase 86 Plan 08 (D-17): `removeRecent` is a native `info` channel served by Rust, so the
  // sidecar no longer registers it. Its removal, write bytes, emit and tray update are pinned by
  // `gamelib-info`'s `golden_recent` and the shell's `info_dispatch` tests; its single owner by
  // `nativeChannelOwnership.test.ts`.

  // ── Phase 86 (86-22, D-17, D-23): `getWikiGameInfo` is a native `info` channel served by Rust
  // (`info_wiki_get`). The cache key, the stale rules, the sources and the result bytes are pinned by
  // `gamelib-info`'s `golden_wiki.rs` (all 31 wiki goldens) and the argument bounds by the native
  // manifest vectors, so the sidecar no longer registers it.
  it('Phase 86 (D-17) getWikiGameInfo is a native `info` channel: the sidecar no longer registers it', () => {
    boot()
    expect(handlerRegistry.has('getWikiGameInfo')).toBe(false)
  })

  // ── Phase 86 (86-12, D-17): the anticheat lookup is a native `info` channel ───────────────────
  // Its behavior (the Epic-namespace-only keying, null on Windows, null for a missing data file) is
  // pinned by the Rust golden `golden_anticheat.rs` and the native vectors, not here.
  it('Phase 86 (D-17) getAnticheatInfo is a native `info` channel: the sidecar no longer registers it', () => {
    boot()
    expect(handlerRegistry.has('getAnticheatInfo')).toBe(false)
  })

  // ── Phase 86 (86-16, D-17): `itad.getKeyStatus` and `itad.setApiKey` are native `info` channels over
  // the Rust Keychain owner, so the sidecar no longer registers them. Their behaviour (two booleans,
  // the key never in a frame, trim and clear, a failed write as a fixed category) is pinned by the
  // Rust `golden_storeSearch.rs` and `info_dispatch.rs` tests and the native manifest vectors.
  it('Phase 86 (D-17) the ITAD channels are native `info` channels: the sidecar no longer registers them', () => {
    boot()
    for (const channel of [
      'searchStores',
      'getStoreSearchDeals',
      'getItadSteamGids',
      'itad.getKeyStatus',
      'itad.setApiKey'
    ]) {
      expect(handlerRegistry.has(channel)).toBe(false)
    }
  })

  // ── REQ-34.6-08: getGogDiscounts (invoke). The five steamgriddb.* channels left this
  // registration in Phase 86 Plan 15 (D-17): they are native `info` channels now, and their
  // behaviour is pinned by the Rust golden_steamgrid test and the native manifest vectors.
  describe('REQ-34.6-08 getGogDiscounts (invoke)', () => {
    it('REQ-34.6-08 getGogDiscounts delegates to info/discounts.ts’s getGogDiscounts(deps, locale, hideOwned, wishlistOnly)', async () => {
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
          libraryManagers: expect.anything(),
          requestRustInvoke: expect.any(Function)
        }),
        locale,
        true,
        false
      )
      expect(findResponse(frames, 'discounts-1')?.result).toEqual([
        { id: 'prod-1', title: 'Discounted Game' }
      ])
    })
  })

  // ── REQ-34.2-14 / SEAM Invariant B ──────────────────────────────────────────
  describe('REQ-34.2-14/SEAM Invariant B', () => {
    const ALL_7_CHANNELS: [string, unknown[]][] = [
      ['getCrossoverIndex', []]
      // `getKnownFixes` left this list in Phase 88 Plan 08 (D-19): it is a native `knownfix` channel.
      // `getWikiGameInfo` left this list in Phase 86 Plan 22 (D-17): it is a native `info` channel.
      // `removeRecent` left this list in Phase 86 Plan 08 (D-17): it is a native `info` channel.
      // `searchStores`, `getStoreSearchDeals` and `getItadSteamGids` left it in Phase 86 Plan 16 (D-17),
      // for the same reason.
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

        // getCrossoverIndex awaits its one Rust frame (86-19), so the double answers it.
        const { input, frames } = boot({
          info_crossover_rating_map: () => ({})
        })
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
