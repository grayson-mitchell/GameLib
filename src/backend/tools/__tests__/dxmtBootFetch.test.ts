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

jest.mock('backend/online_monitor', () => ({
  isOnline: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { ToolInstaller: 'ToolInstaller' }
}))

jest.mock('backend/wine/manager/utils', () => ({
  wineDownloaderInfoStore: { get: jest.fn() }
}))

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  copyFileSync: jest.fn(),
  cpSync: jest.fn(),
  rmSync: jest.fn(),
  writeFileSync: jest.fn()
}))

import { backendEvents } from 'backend/backend_events'
import { isOnline } from 'backend/online_monitor'
import { wineDownloaderInfoStore } from 'backend/wine/manager/utils'
import { existsSync } from 'graceful-fs'
import { installOrUpdateTool } from '../index'
import type { ReleasesInfo, WineVersionInfo } from 'common/types'

// Importing the module under test registers its three module-scope `backendEvents`
// listeners. Imported ONCE for the whole file: re-importing would stack duplicate
// listeners and inflate every call count, mirroring the file-scope-once convention
// `wineToolsFlows.test.ts` records for the same reason.
import '../dxmt'

const installOrUpdateToolMock = installOrUpdateTool as jest.Mock
const isOnlineMock = isOnline as jest.Mock
// Reading `.get` off the mocked store is a jest mock handle, not a real unbound method
// call -- `this` is never involved. Hoisting it into a `mock`-prefixed factory variable
// instead would hit the TDZ, because `jest.mock` is hoisted above this declaration.
// eslint-disable-next-line @typescript-eslint/unbound-method
const storeGetMock = wineDownloaderInfoStore.get as unknown as jest.Mock
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

  it('DOES fetch when an installed Wine-Staging-macOS exists (the update case)', async () => {
    storeGetMock.mockReturnValue([makeWine({ isInstalled: true })])

    emitReleasesInfoReady()
    await flush()

    expect(installOrUpdateToolMock).toHaveBeenCalledTimes(1)
    expect(installOrUpdateToolMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'dxmt', os: 'darwin' })
    )
  })
})
