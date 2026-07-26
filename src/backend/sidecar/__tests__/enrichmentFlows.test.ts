/**
 * End-to-end wiring test for the sidecar's curated enrichment channels
 * (Phase 34.2 Plan 06 — REQ-34.2-04/REQ-34.2-07/REQ-34.2-11/REQ-34.2-12/
 * REQ-34.2-14).
 *
 * Drives the REAL sidecar RPC server in-process (`gameDetailsFlows.test.ts`'s
 * own real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
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
 * — the single choke point `electronStub.ts`'s `app.getPath()` calls through
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
 *   - `axios` — scriptable per-URL (CheapShark's three real endpoints), so
 *     the storeSearch trio's real `cheapshark.ts` bodies run against
 *     controlled fixture data/failures instead of a real network call.
 *   - `backend/storeManagers` (`libraryManagerMap`) — scriptable managers,
 *     the boundary `buildCrossoverRatingMap`'s enumeration walks and
 *     `getGame` (real, from `backend/utils`) resolves through.
 *   - `backend/constants/environment` — a MUTABLE double (mirrors
 *     `ratingMap.test.ts`'s own `envMock` pattern) so `isMac`/`isWindows` can
 *     be flipped per test for the D-10/D-16 crossover-map states and the
 *     anticheat Windows rider.
 *   - `backend/crossover_index/index` (`isCrossoverIndexEligible`,
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
 * instruction): `storeSearch/cheapshark`, `anticheat/utils`,
 * `crossover_index/crossoverRatingMap`, `knownFixes`, `recent_games/recent_games`.
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

// ── pathShim — CR-03: the REAL choke point. `constants/paths.ts`'s
// module-scope `app.getPath('appData'|'userData')` calls resolve through
// `electronStub.ts` -> `pathShim.getPath()`, whose real `resolveAppDataDir()`
// prefers `env.APPDATA`/`env.XDG_CONFIG_HOME` over `homedir()` — bypassing
// the `jest.mock('os', ...)` redirect above on win32/default. This factory
// reimplements all four names the real shim supports, rooted at a single
// per-suite tmp directory, with NO platform branch and NO env var reference —
// see the module docstring above ───────────────────────────────────────────
jest.mock('../pathShim', () => {
  const actualOs = jest.requireActual('os')
  const actualPath = jest.requireActual('path')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-enrichmentflows-test-home-${process.pid}`
  )
  return {
    getPath: (name: string) => {
      switch (name) {
        case 'appData':
          return tmpRoot
        case 'userData':
          return actualPath.join(tmpRoot, 'GameLib')
        case 'temp':
          return actualOs.tmpdir()
        case 'home':
          return tmpRoot
        default:
          throw new Error(
            `[pathShim mock] getPath('${name}') is not shimmed for this test`
          )
      }
    }
  }
})

// ── backend/logger/paths — WR-01 (34.2 gap cycle 2, plan 34.2-18): the log
// path is computed INDEPENDENTLY of pathShim -- `getBaseLogPath()`
// (`backend/logger/paths.ts`) reads `process.env.LOCALAPPDATA`/
// `XDG_STATE_HOME` plus `homedir()` directly, so it bypasses BOTH the `os`
// mock and the `pathShim` mock above. This factory reimplements
// `getLogFilePath`'s relative-path derivation, rooted at the SAME per-suite
// tmp root, so distinct arguments still yield distinct paths. Does NOT call
// `jest.requireActual('backend/logger')` -- `backend/logger/index.ts` and
// `log_writer.ts` import each other circularly, and re-entering that cycle
// from inside a mock factory throws inside `LogWriter`'s constructor (see
// `sidecarRejectionGuard.test.ts`'s own note on this) -- not a concern here
// since this suite never imports `backend/logger` at all. ───────────────────
jest.mock('backend/logger/paths', () => {
  const actualPath = jest.requireActual('path')
  const actualOs = jest.requireActual('os')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-enrichmentflows-test-home-${process.pid}`
  )
  const logBaseDir = actualPath.join(tmpRoot, 'logs')
  return {
    getLogFilePath: (
      args: { appName?: string; runner?: string; type?: string } = {}
    ): string => {
      let relativeFilePath: string
      if (!(args?.appName || args?.runner)) {
        relativeFilePath = 'gamelib'
      } else if (args.runner && !args.appName) {
        relativeFilePath = actualPath.join('runners', args.runner)
      } else {
        const { appName, runner, type = 'launch' } = args
        relativeFilePath = actualPath.join(
          'games',
          `${appName}_${runner}`,
          type
        )
      }
      return actualPath.join(logBaseDir, relativeFilePath + '.log')
    }
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — scriptable per-URL. `mockCheapsharkGet` drives the storeSearch
// trio's real cheapshark.ts bodies (top-level `axios.get`); `create()`
// still exists so bootstrap.ts's real `fetchLastestReleases()`
// (`axiosClient = axios.create(...)`) does not crash at startup ──────────────
const mockCheapsharkGet = jest.fn()
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      get: (...args: unknown[]) => mockCheapsharkGet(...args),
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
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}
jest.mock('backend/constants/environment', () => envMock)

// ── backend/config mock — avoid a real on-disk config.json write while still
// exercising bootstrap.ts's real i18next init (settings.language) ───────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── backend/online_monitor mock (full surface, per bootstrap.test.ts's own
// reasoning) — no real `electron` `net` surface touched by bootstrap.ts's
// initOnlineMonitor() call ───────────────────────────────────────────────────
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

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
  return {
    libraryManagerMap: {
      legendary: makeManager(),
      gog: makeManager(),
      steam: makeManager(),
      nile: makeManager(),
      zoom: makeManager(),
      sideload: makeManager()
    }
  }
})

// ── backend/crossover_index/index mock — the SAME boundary ratingMap.test.ts
// itself uses: this suite asserts crossoverRatingMap.ts's own three-state
// resolver, not index.ts's internal name-matching algorithm ─────────────────
const mockIsCrossoverIndexEligible = jest.fn()
const mockGetCodeweaversFromIndex = jest.fn()
jest.mock('../../crossover_index/index', () => ({
  isCrossoverIndexEligible: (...args: unknown[]) =>
    mockIsCrossoverIndexEligible(...args),
  getCodeweaversFromIndex: (...args: unknown[]) =>
    mockGetCodeweaversFromIndex(...args)
}))

// ── backend/dialog/dialog / backend/utils / legendary/user / aborthandler —
// carried over unchanged from gameDetailsFlowRegistration.ts's own harness;
// handlers.ts registers every curated module (including
// gameDetailsFlowRegistration.ts) at import time, so this whole graph loads
// regardless of which channels THIS suite invokes ───────────────────────────
jest.mock('../../dialog/dialog', () => ({
  ...jest.requireActual('../../dialog/dialog'),
  notify: jest.fn()
}))
jest.mock('../../storeManagers/legendary/user', () => ({
  LegendaryUser: { getUserInfo: jest.fn() }
}))
jest.mock('../../utils/aborthandler/aborthandler', () => ({
  ...jest.requireActual('../../utils/aborthandler/aborthandler'),
  callAbortController: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
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

import { init } from '../bootstrap'
import { GlobalConfig } from 'backend/config'
import { libraryManagerMap } from 'backend/storeManagers'
import { handlerRegistry } from '../electronStub'
import { fixesPath, appFolder, userDataPath } from '../../constants/paths'
import { getLogFilePath } from 'backend/logger/paths'
import { wikiGameInfoStore } from '../../wiki_game_info/electronStore'
import { configStore } from '../../constants/key_value_stores'
import { isOnline, runOnceWhenOnline } from '../../online_monitor'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { GameInfo } from 'common/types'

const mockedIsOnline = isOnline as jest.Mock
const mockedRunOnceWhenOnline = runOnceWhenOnline as jest.Mock

// ── CR-03 / WR-01 containment guard — MUST run before the first
// beforeEach's destructive rmSync/configStore.set calls (jest runs
// outer/top-level beforeAll before any nested describe's beforeEach). Uses
// resolve+relative, never startsWith/join (Phase 18: "join is not
// containment"; a bare prefix check would also pass for a sibling directory
// sharing the tmp prefix). Throws loudly rather than relying on the
// afterAll below as a safety net — see this repo's
// tests-clobbering-real-steam-store lesson (commit 92c29a5e): an afterAll
// restore is not a safety net under jest worker force-exit. Now also covers
// getLogFilePath({}) (WR-01, 34.2 gap cycle 2 plan 34.2-18) — the log path
// is env-driven and bypasses BOTH the os mock and the pathShim mock above,
// so it needed its own separate module mock rather than another entry in
// the same pathShim factory ─────────────────────────────────────────────
beforeAll(() => {
  const tmpRoot = resolve(tmpdir())
  const candidates = [appFolder, userDataPath, fixesPath, getLogFilePath({})]
  for (const candidate of candidates) {
    const rel = relative(tmpRoot, resolve(candidate))
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `[enrichmentFlows.test.ts] REFUSING TO RUN: "${candidate}" resolves ` +
          `outside os.tmpdir() (${tmpRoot}) — the pathShim mock redirect is ` +
          'not in effect, and this suite would rmSync/overwrite a real user ' +
          'config directory.'
      )
    }
  }
})

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock

const legendaryManager = libraryManagerMap.legendary as unknown as Record<
  string,
  jest.Mock
>
const gogManager = libraryManagerMap.gog as unknown as Record<string, jest.Mock>
const steamManager = libraryManagerMap.steam as unknown as Record<
  string,
  jest.Mock
>
const nileManager = libraryManagerMap.nile as unknown as Record<
  string,
  jest.Mock
>
const zoomManager = libraryManagerMap.zoom as unknown as Record<
  string,
  jest.Mock
>
const sideloadManager = libraryManagerMap.sideload as unknown as Record<
  string,
  jest.Mock
>

/** Points the mocked GlobalConfig.get() at a fresh settings object. */
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

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames. */
function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim().length > 0) {
        try {
          frames.push(JSON.parse(line))
        } catch {
          // Non-JSON diagnostic line (e.g. READY_SENTINEL) — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/**
 * `getAnticheatInfo`'s real `fs/promises` `readFile()` of an EXISTING file
 * goes through libuv's threadpool, which only resolves on a real event-loop
 * timer tick — `flush()`'s `setImmediate` chain alone is not sufficient
 * (empirically confirmed: the ENOENT-fast-path tests below pass on `flush()`
 * alone, but the file-present tests do not without this extra tick).
 */
async function flushWithIo(): Promise<void> {
  await flush()
  await new Promise((resolve) => setTimeout(resolve, 20))
}

/** Starts a fresh sidecar RPC loop bound to its own stream pair. */
function startSidecar(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  init(input, output)
  return { input, frames }
}

/** Writes a well-formed `invoke` request frame to the sidecar's stdin. */
function writeInvoke(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'invoke', channel, args })}\n`)
}

function findResponse(
  frames: Frame[],
  id: string
): { ok: boolean; result?: unknown; error?: string } | undefined {
  return frames.find((f) => f.id === id) as
    | { ok: boolean; result?: unknown; error?: string }
    | undefined
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

const CHEAPSHARK_BASE = 'https://www.cheapshark.com/api/1.0'

const STORE_FIXTURE_RAW = [
  {
    storeID: '1',
    storeName: 'Steam',
    isActive: 1,
    images: { banner: '', logo: '', icon: '' }
  },
  {
    storeID: '25',
    storeName: 'Epic Games Store',
    isActive: 1,
    images: { banner: '', logo: '', icon: '' }
  }
]

describe('sidecar enrichment flows (Phase 34.2 Plan 06)', () => {
  beforeEach(() => {
    mockAppSettings({ language: 'en' })
    mockCheapsharkGet.mockReset()
    mockIsCrossoverIndexEligible.mockReset()
    mockGetCodeweaversFromIndex.mockReset()

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

    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true

    for (const manager of [
      legendaryManager,
      gogManager,
      steamManager,
      nileManager,
      zoomManager,
      sideloadManager
    ]) {
      for (const key of Object.keys(manager)) {
        manager[key].mockReset()
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
  // contract, run FIRST in the file, before any successful getStoreMap()
  // call can populate cheapshark.ts's own in-memory storeMapCache — a
  // reject-then-succeed ordering would let a later happy-path test's cache
  // hit silently mask this suite's own reject scenario ─────────────────────
  describe('REQ-34.2-11/Phase 20 D-14 storeSearch error contract (load-bearing trio, run first)', () => {
    it('REQ-34.2-11 searchStores (invoke): a rejecting provider surfaces an ERROR response frame, not an empty array', async () => {
      mockCheapsharkGet.mockImplementation(() =>
        Promise.reject(new Error('cheapshark unreachable'))
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'ss-err-1', 'searchStores', ['some query'])
      await flush()

      const response = findResponse(frames, 'ss-err-1')
      expect(response?.ok).toBe(false)
      expect(typeof response?.error).toBe('string')
      expect((response?.error as string).length).toBeGreaterThan(0)
      expect(response?.result).toBeUndefined()
    })

    it('REQ-34.2-11 getStoreSearchDeals (invoke): a rejecting provider surfaces an ERROR response frame, not an empty array', async () => {
      mockCheapsharkGet.mockImplementation(() =>
        Promise.reject(new Error('cheapshark unreachable'))
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gsd-err-1', 'getStoreSearchDeals', ['game-1'])
      await flush()

      const response = findResponse(frames, 'gsd-err-1')
      expect(response?.ok).toBe(false)
      expect(typeof response?.error).toBe('string')
      expect((response?.error as string).length).toBeGreaterThan(0)
      expect(response?.result).toBeUndefined()
    })

    it('REQ-34.2-11 getStoreSearchStoreMap (invoke): a rejecting provider surfaces an ERROR response frame, not an empty object', async () => {
      mockCheapsharkGet.mockImplementation(() =>
        Promise.reject(new Error('cheapshark unreachable'))
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gssm-err-1', 'getStoreSearchStoreMap', [])
      await flush()

      const response = findResponse(frames, 'gssm-err-1')
      expect(response?.ok).toBe(false)
      expect(typeof response?.error).toBe('string')
      expect((response?.error as string).length).toBeGreaterThan(0)
      expect(response?.result).toBeUndefined()
    })
  })

  // ── REQ-34.2-11: storeSearch trio happy paths (run AFTER the error-contract
  // block above; getStoreSearchStoreMap's cache now legitimately populates
  // for the rest of the file) ────────────────────────────────────────────────
  describe('REQ-34.2-11 storeSearch trio (happy path)', () => {
    it('REQ-34.2-11 getStoreSearchStoreMap (invoke) returns the mapped CheapShark store directory', async () => {
      mockCheapsharkGet.mockImplementation((url: string) => {
        if (url === `${CHEAPSHARK_BASE}/stores`) {
          return Promise.resolve({ data: STORE_FIXTURE_RAW })
        }
        return Promise.reject(new Error(`unexpected axios.get(${url})`))
      })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gssm-1', 'getStoreSearchStoreMap', [])
      await flush()

      const response = findResponse(frames, 'gssm-1')
      expect(response?.ok).toBe(true)
      const result = response?.result as Record<
        string,
        { storeId: string; storeName: string; isActive: boolean }
      >
      expect(result['1']).toMatchObject({
        storeId: '1',
        storeName: 'Steam',
        isActive: true
      })
      expect(result['25']).toMatchObject({
        storeId: '25',
        storeName: 'Epic Games Store',
        isActive: true
      })
    })

    it('REQ-34.2-11 searchStores (invoke) returns the mapped CheapShark search results', async () => {
      mockCheapsharkGet.mockImplementation(
        (url: string, config?: { params?: Record<string, unknown> }) => {
          if (url === `${CHEAPSHARK_BASE}/games` && config?.params?.title) {
            return Promise.resolve({
              data: [
                {
                  gameID: 'g1',
                  steamAppID: '440',
                  cheapest: '9.99',
                  cheapestDealID: 'deal1',
                  external: 'Team Fortress 2',
                  internalName: 'teamfortress2',
                  thumb: 'thumb.jpg'
                }
              ]
            })
          }
          return Promise.reject(new Error(`unexpected axios.get(${url})`))
        }
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'ss-1', 'searchStores', ['team fortress'])
      await flush()

      const response = findResponse(frames, 'ss-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toMatchObject([
        {
          gameId: 'g1',
          title: 'Team Fortress 2',
          steamAppId: '440',
          cheapestPrice: '9.99',
          currencyCode: 'USD'
        }
      ])
    })

    it('REQ-34.2-11 getStoreSearchDeals (invoke) returns the mapped CheapShark deal breakdown', async () => {
      mockCheapsharkGet.mockImplementation(
        (url: string, config?: { params?: Record<string, unknown> }) => {
          if (url === `${CHEAPSHARK_BASE}/stores`) {
            return Promise.resolve({ data: STORE_FIXTURE_RAW })
          }
          if (url === `${CHEAPSHARK_BASE}/games` && config?.params?.id) {
            return Promise.resolve({
              data: {
                info: { title: 'Team Fortress 2', thumb: 'thumb.jpg' },
                cheapestPriceEver: { price: '4.99', date: 0 },
                deals: [
                  {
                    storeID: '1',
                    dealID: 'deal-x',
                    price: '4.99',
                    retailPrice: '9.99',
                    savings: '50'
                  }
                ]
              }
            })
          }
          return Promise.reject(new Error(`unexpected axios.get(${url})`))
        }
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gsd-1', 'getStoreSearchDeals', ['g1'])
      await flush()

      const response = findResponse(frames, 'gsd-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toMatchObject([
        {
          storeId: '1',
          storeName: 'Steam',
          price: '4.99',
          retailPrice: '9.99',
          currencyCode: 'USD'
        }
      ])
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

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gkf-1', 'getKnownFixes', ['known-fixes-app', 'gog'])
      await flush()

      const response = findResponse(frames, 'gkf-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual(fixture)
    })

    it('REQ-34.2-11 returns null when no fix file exists for the appName/runner pair', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'gkf-2', 'getKnownFixes', ['no-such-app', 'gog'])
      await flush()

      const response = findResponse(frames, 'gkf-2')
      expect(response?.ok).toBe(true)
      expect(response?.result).toBeNull()
    })
  })

  // ── REQ-34.2-11/D-16: getCrossoverIndex three-state map ───────────────────
  describe('REQ-34.2-11/D-16 getCrossoverIndex (invoke)', () => {
    it('REQ-34.2-11/D-16 resolves the three-state map: ineligible key-absent, eligible-unmatched null, eligible-matched number', async () => {
      envMock.isMac = true

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
      mockGetCodeweaversFromIndex.mockImplementation((gameInfo: GameInfo) => {
        if (gameInfo.app_name === 'matched-1') {
          return Promise.resolve({
            macRating: 5,
            linuxRating: null,
            slug: 'matched-1'
          })
        }
        return Promise.resolve(null)
      })

      const { input, frames } = startSidecar()
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
      mockGetCodeweaversFromIndex.mockResolvedValue({
        macRating: 5,
        linuxRating: null,
        slug: 'x'
      })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gci-2', 'getCrossoverIndex', [])
      await flush()

      const response = findResponse(frames, 'gci-2')
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual({})
      expect(mockIsCrossoverIndexEligible).not.toHaveBeenCalled()
      expect(mockGetCodeweaversFromIndex).not.toHaveBeenCalled()
    })
  })

  // ── REQ-34.2-11: removeRecent positive side-effect ────────────────────────
  describe('REQ-34.2-11 removeRecent (invoke)', () => {
    it('REQ-34.2-11 actually removes the named entry from the real configStore-backed recent-games list', async () => {
      configStore.set('games.recent', [
        { appName: 'keep-me', title: 'Keep Me' },
        { appName: 'remove-me', title: 'Remove Me' }
      ])

      const { input, frames } = startSidecar()
      writeInvoke(input, 'rr-1', 'removeRecent', ['remove-me'])
      await flush()

      expect(findResponse(frames, 'rr-1')?.ok).toBe(true)
      const remaining = configStore.get('games.recent', []) as Array<{
        appName: string
      }>
      expect(remaining.map((g) => g.appName)).toEqual(['keep-me'])
    })
  })

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
        umuId: null
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

      const { input, frames } = startSidecar()
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
      expect(mockCheapsharkGet).not.toHaveBeenCalled()
    })
  })

  // ── REQ-34.2-07: anticheat riders, asserted rather than assumed ───────────
  describe('REQ-34.2-07 getAnticheatInfo (invoke) — anticheat riders', () => {
    const anticheatDataPath = join(appFolder, 'areweanticheatyet.json')

    beforeEach(() => {
      const dir = join(appFolder)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    })

    afterEach(() => {
      if (existsSync(anticheatDataPath)) {
        rmSync(anticheatDataPath, { force: true })
      }
    })

    it('REQ-34.2-07 returns the record for a matching Epic namespace', async () => {
      writeFileSync(
        anticheatDataPath,
        JSON.stringify([
          {
            status: 'Working',
            anticheats: [],
            notes: [],
            native: false,
            storeIds: { epic: { namespace: 'epicnamespace1', slug: 'x' } },
            reference: 'ref',
            updates: []
          }
        ])
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gai-1', 'getAnticheatInfo', ['epicnamespace1'])
      await flushWithIo()

      const response = findResponse(frames, 'gai-1')
      expect(response?.ok).toBe(true)
      expect(response?.result).toMatchObject({ status: 'Working' })
    })

    it('REQ-34.2-07 a Steam-shaped namespace (no Epic namespace match) returns null — proves the Epic-namespace-only keying rider is real', async () => {
      writeFileSync(
        anticheatDataPath,
        JSON.stringify([
          {
            status: 'Working',
            anticheats: [],
            notes: [],
            native: false,
            storeIds: { steam: '440' },
            reference: 'ref',
            updates: []
          }
        ])
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gai-2', 'getAnticheatInfo', ['440'])
      await flushWithIo()

      const response = findResponse(frames, 'gai-2')
      expect(response?.ok).toBe(true)
      // gameAnticheatInfo resolves via Array.prototype.find, whose "no
      // match" value is `undefined` (not `null` despite the declared
      // `Promise<AntiCheatInfo | null>` signature) — over the wire this
      // serializes to an absent `result` key entirely (JSON.stringify drops
      // `undefined`), which is exactly what a genuinely falsy/no-match
      // result looks like here. Asserted falsy rather than strictly `null`
      // to match the real, observed runtime behavior instead of the
      // type declaration.
      expect(response?.result).toBeFalsy()
    })

    it('REQ-34.2-07 with isWindows pinned true, returns null regardless of the data file', async () => {
      envMock.isWindows = true
      writeFileSync(
        anticheatDataPath,
        JSON.stringify([
          {
            status: 'Working',
            anticheats: [],
            notes: [],
            native: false,
            storeIds: { epic: { namespace: 'windows-namespace', slug: 'x' } },
            reference: 'ref',
            updates: []
          }
        ])
      )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gai-3', 'getAnticheatInfo', ['windows-namespace'])
      await flush()

      const response = findResponse(frames, 'gai-3')
      expect(response?.ok).toBe(true)
      expect(response?.result).toBeNull()
    })

    it('REQ-34.2-07 with no data file at all, returns null rather than throwing', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'gai-4', 'getAnticheatInfo', ['anything'])
      await flush()

      const response = findResponse(frames, 'gai-4')
      expect(response?.ok).toBe(true)
      expect(response?.result).toBeNull()
    })
  })

  // ── REQ-34.2-14 / SEAM Invariant B ──────────────────────────────────────────
  describe('REQ-34.2-14/SEAM Invariant B', () => {
    const ALL_8_CHANNELS: [string, unknown[]][] = [
      ['getWikiGameInfo', ['t', 'app-x', 'legendary', false]],
      ['getAnticheatInfo', ['ns-x']],
      ['getKnownFixes', ['app-x', 'gog']],
      ['getCrossoverIndex', []],
      ['searchStores', ['query-x']],
      ['getStoreSearchDeals', ['deal-x']],
      ['getStoreSearchStoreMap', []],
      ['removeRecent', ['app-x']]
    ]

    it.each(ALL_8_CHANNELS)(
      'REQ-34.2-14 channel "%s" does not return UNPORTED_CHANNEL_MARKER and is present in the handler registry',
      async (channel, args) => {
        mockCheapsharkGet.mockImplementation(() =>
          Promise.reject(new Error('boundary rejection, not a marker'))
        )

        const { input, frames } = startSidecar()
        writeInvoke(input, `all8-${channel}`, channel, args)
        await flush()

        const response = findResponse(frames, `all8-${channel}`)
        expect(response).toBeDefined()
        expect(String(response?.error ?? '')).not.toContain(
          UNPORTED_CHANNEL_MARKER
        )
        expect(handlerRegistry.has(channel)).toBe(true)
      }
    )

    it('REQ-34.2-14 an UNPORTED channel (checkDiskSpace, owned by a later slice) still returns UNPORTED_CHANNEL_MARKER', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'unported-1', 'checkDiskSpace', ['/tmp'])
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
      "// this comment intentionally says: from 'electron'",
      "import { ipcMain } from './electronStub'"
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
