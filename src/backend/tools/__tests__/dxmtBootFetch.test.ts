/**
 * Quick 260916-9vh — the boot-time DXMT fetch must not be issued when there is no
 * installed Wine-Staging-macOS to update.
 *
 * WHY THIS GATE EXISTS
 *
 * `tools/dxmt.ts`'s `releasesInfoReady` listener used to `await DXMT.getLatest()`
 * BEFORE computing the installed-wine census that decides whether anything needs the
 * files. On a cold profile that census is empty, so the boot downloaded a DXMT tarball
 * and copied it into ZERO wine installs.
 *
 * That download is the entire cold-boot cost, measured with `meta/coldBootTiming.ts`
 * under an `https.request` probe (2 cold `createFakeHomeProfile()` runs, macOS):
 * `installOrUpdateTool` -> `downloadFile` (backend/utils.ts) -> EasyDl with
 * `connections: 5` issues five parallel 206-range requests on `https.globalAgent`; the
 * last chunk ended at 27.10s and the process exited at 27.26s. Sidecar exit tracks the
 * download drain, so a fetch nobody needs delayed exit by ~27s.
 *
 * WHY IT IS TESTED THIS WAY
 *
 * `../index` (`tools/index.ts`) is factory-mocked because it reaches Electron
 * transitively and must not be imported under the backend jest project — the same
 * documented constraint `dxvkEvidenceLines.test.ts` records in this directory. The mock
 * shape follows the existing precedent at `sidecar/__tests__/wineToolsFlows.test.ts:74`
 * and `sidecar/__tests__/runnerMiscFlows.test.ts:154`.
 *
 * `backend/backend_events` is deliberately NOT mocked: it is a bare `EventEmitter` with
 * type-only imports, and driving the real emitter is the point of the test.
 *
 * Assertions are positive call-count checks (`toHaveBeenCalledTimes`). No negated
 * pattern-match shape is used — this project has shipped vacuous negative assertions
 * before that passed just as happily against code that no longer existed.
 */

jest.mock('../index', () => ({
  installOrUpdateTool: jest.fn()
}))

jest.mock('backend/constants/environment', () => ({
  isMac: true
}))

jest.mock('backend/constants/paths', () => ({
  toolsPath: '/tmp/gamelib-260916-9vh-tools'
}))

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { ToolInstaller: 'ToolInstaller' }
}))

const mockWineDownloaderInfoStore = { get: jest.fn() }

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  copyFileSync: jest.fn(),
  cpSync: jest.fn(),
  rmSync: jest.fn(),
  writeFileSync: jest.fn()
}))

jest.mock('../machoExports', () => ({
  checkWinemacMetalViewExports: jest.fn()
}))

import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { EventEmitter } from 'events'
import { backendEvents } from 'backend/backend_events'
import { existsSync } from 'graceful-fs'
import { installOrUpdateTool } from '../index'
import { registerDxmtListeners } from '../dxmt'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createTestAbortRegistry } from 'backend/testUtils/testAbortRegistry'
import { checkWinemacMetalViewExports } from '../machoExports'
import type { ReleasesInfo, WineVersionInfo } from 'common/types'

const installOrUpdateToolMock = installOrUpdateTool as jest.Mock
const isOnlineMock = jest.fn()
// Reading `.get` off the mocked store is a jest mock handle, not a real unbound method
// call -- `this` is never involved. Hoisting it into a `mock`-prefixed factory variable
// instead would hit the TDZ, because `jest.mock` is hoisted above this declaration.
// eslint-disable-next-line @typescript-eslint/unbound-method
// 66.3-15: the listeners exist only after registerDxmtListeners, registered ONCE for the whole
// file (re-registering would stack duplicate listeners and inflate every call count).
const unregisterDxmt = registerDxmtListeners({
  events: backendEvents,
  runner: createScriptedRunner([]),
  aborts: createTestAbortRegistry(),
  dialogs: createTestHostServices().dialogs,
  appState: createTestHostServices().appState,
  // Read at call time so a case can flip the mock.
  onlineMonitor: { isOnline: () => isOnlineMock() as boolean },
  stores: {
    wineManager: { wineDownloaderInfoStore: mockWineDownloaderInfoStore }
  } as never
})
const storeGetMock = mockWineDownloaderInfoStore.get as unknown as jest.Mock
const existsSyncMock = existsSync as unknown as jest.Mock

/** Lets the async listener run past its synchronous prefix. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

function makeWine(overrides: Partial<WineVersionInfo>): WineVersionInfo {
  return {
    version: 'wine-staging-9.0',
    type: 'Wine-Staging-macOS',
    isInstalled: true,
    installDir: '/tmp/gamelib-260916-9vh-wines/wine-staging-9.0',
    ...overrides
  } as WineVersionInfo
}

function emitReleasesInfoReady() {
  backendEvents.emit('releasesInfoReady', {
    dxmt: { tag: 'v0.80' }
  } as unknown as ReleasesInfo)
}

beforeEach(() => {
  // `resetMocks: true` is set in src/backend/jest.config.js, which STRIPS the
  // implementations supplied by the factories above between tests. Without these
  // re-stubs `wineDownloaderInfoStore.get` returns `undefined` and the listener's
  // `availableWines.filter` throws — a failure that reads like a product bug and is not
  // one. Re-established here rather than in the factories for exactly that reason.
  isOnlineMock.mockReturnValue(true)
  storeGetMock.mockReturnValue([])
  // `false` keeps `getCurrentDXMTVersion()` returning '' (so the version-equality early
  // return is not taken) and keeps the post-download copy loop inert. The decision under
  // test is whether the FETCH is issued, not whether files are copied afterwards.
  existsSyncMock.mockReturnValue(false)
  ;(checkWinemacMetalViewExports as jest.Mock).mockResolvedValue({ ok: true })
})

describe('boot-time DXMT fetch is gated on there being an installed wine to update', () => {
  it('does NOT fetch when no Wine-Staging-macOS is installed (the cold-profile case)', async () => {
    storeGetMock.mockReturnValue([])

    emitReleasesInfoReady()
    await flush()

    expect(installOrUpdateToolMock).toHaveBeenCalledTimes(0)
  })

  it('does NOT fetch when wine releases are known but none is installed', async () => {
    storeGetMock.mockReturnValue([
      makeWine({ isInstalled: false }),
      makeWine({
        type: 'Wine-Crossover',
        isInstalled: true
      } as Partial<WineVersionInfo>)
    ])

    emitReleasesInfoReady()
    await flush()

    expect(installOrUpdateToolMock).toHaveBeenCalledTimes(0)
  })

  // Quick 261031-rjv: the census now also requires an existing `-DXMT` copy that passes
  // the winemac export check, so this case provides the copy (existsSync true for it,
  // still false for `latest_dxmt`) and a passing check.
  it('DOES fetch when an installed Wine-Staging-macOS exists (the update case)', async () => {
    const wine = makeWine({ isInstalled: true })
    storeGetMock.mockReturnValue([wine])
    existsSyncMock.mockImplementation(
      (p: string) => p === `${wine.installDir}-DXMT`
    )

    emitReleasesInfoReady()
    await flush()

    expect(installOrUpdateToolMock).toHaveBeenCalledTimes(1)
    expect(installOrUpdateToolMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ name: 'dxmt', os: 'darwin' })
    )
  })
})

describe('registerDxmtListeners (66.3-15)', () => {
  it('attaches exactly one listener per event and detaches them all on unregister', () => {
    const on = jest.fn()
    const off = jest.fn()
    const unregister = registerDxmtListeners({
      events: { on, off } as never,
      runner: createScriptedRunner([]),
      aborts: createTestAbortRegistry(),
      dialogs: createTestHostServices().dialogs,
      appState: createTestHostServices().appState,
      onlineMonitor: { isOnline: () => true },
      stores: {
        wineManager: { wineDownloaderInfoStore: mockWineDownloaderInfoStore }
      } as never
    })

    expect(on.mock.calls.map(([name]) => name)).toEqual([
      'wineVersionInstalled',
      'wineVersionUninstalled',
      'releasesInfoReady'
    ])
    expect(off).not.toHaveBeenCalled()
    unregister()
    expect(off.mock.calls.map(([name]) => name)).toEqual([
      'wineVersionInstalled',
      'wineVersionUninstalled',
      'releasesInfoReady'
    ])
    // The same handler objects that were attached are the ones detached.
    expect(off.mock.calls.map(([, fn]) => fn)).toEqual(
      on.mock.calls.map(([, fn]) => fn)
    )
  })

  it('importing the module registers nothing: no module-scope listener exists', () => {
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const isolated = (
        require('backend/backend_events') as typeof import('backend/backend_events')
      ).backendEvents
      require('../dxmt')
      /* eslint-enable @typescript-eslint/no-require-imports */
      expect(isolated.eventNames()).toEqual([])
    })
  })

  it('a listener fires with the deps it was constructed with; detached, it no longer fires', async () => {
    const fresh = new EventEmitter()
    const store = { get: jest.fn().mockReturnValue([]) }
    storeGetMock.mockReturnValue([])
    const unregister = registerDxmtListeners({
      events: fresh as never,
      runner: createScriptedRunner([]),
      aborts: createTestAbortRegistry(),
      dialogs: createTestHostServices().dialogs,
      appState: createTestHostServices().appState,
      onlineMonitor: { isOnline: () => true },
      stores: { wineManager: { wineDownloaderInfoStore: store } } as never
    })
    expect(fresh.listenerCount('releasesInfoReady')).toBe(1)
    fresh.emit('releasesInfoReady', { dxmt: { tag: 'v0.80' } })
    await flush()
    expect(store.get).toHaveBeenCalledWith('wine-releases', [])

    unregister()
    expect(fresh.listenerCount('releasesInfoReady')).toBe(0)
    expect(fresh.listenerCount('wineVersionInstalled')).toBe(0)
  })

  afterAll(() => unregisterDxmt())
})
