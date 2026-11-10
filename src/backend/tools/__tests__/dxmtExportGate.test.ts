/**
 * Quick 261031-rjv — DXMT `-DXMT` Wine copies are only created/updated when the Wine's
 * winemac.so defines the macdrv metal-view exports DXMT v0.80 needs. See the todo
 * `2026-10-31-dxmt-engine-cannot-present-d3d11-on-wine-staging`.
 *
 * Mock set mirrors dxmtBootFetch.test.ts. Assertions are positive call-count / argument
 * checks, not negated pattern matches.
 */

jest.mock('../index', () => ({
  installOrUpdateTool: jest.fn()
}))

jest.mock('backend/constants/environment', () => ({
  isMac: true
}))

jest.mock('backend/constants/paths', () => ({
  toolsPath: '/tmp/gamelib-rjv-tools'
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
  checkWinemacMetalViewExports: jest.fn(),
  DXMT_REQUIRED_MACDRV_SYMBOLS: [
    '_macdrv_functions',
    '_macdrv_view_create_metal_view',
    '_macdrv_view_get_metal_layer',
    '_macdrv_view_release_metal_view'
  ]
}))

import { backendEvents } from 'backend/backend_events'
import { isOnline } from 'backend/online_monitor'
import { logWarning } from 'backend/logger'
import {
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
  rmSync
} from 'graceful-fs'
import { installOrUpdateTool } from '../index'
import { bindDxmtStores } from '../dxmt'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { checkWinemacMetalViewExports } from '../machoExports'
import type { ReleasesInfo, WineVersionInfo } from 'common/types'
import { defined } from 'backend/testUtils/indexed'

import '../dxmt'

const installMock = installOrUpdateTool as jest.Mock
const isOnlineMock = isOnline as jest.Mock
// eslint-disable-next-line @typescript-eslint/unbound-method
bindDxmtStores({
  runner: createScriptedRunner([]),
  stores: {
    wineManager: { wineDownloaderInfoStore: mockWineDownloaderInfoStore }
  } as never
})
const storeGetMock = mockWineDownloaderInfoStore.get as unknown as jest.Mock
const existsSyncMock = existsSync as unknown as jest.Mock
const readFileSyncMock = readFileSync as unknown as jest.Mock
const copyFileSyncMock = copyFileSync as unknown as jest.Mock
const cpSyncMock = cpSync as unknown as jest.Mock
const rmSyncMock = rmSync as unknown as jest.Mock
const checkMock = checkWinemacMetalViewExports as jest.Mock
const logWarningMock = logWarning as jest.Mock

const flush = () => new Promise((resolve) => setImmediate(resolve))

const WINES = '/tmp/gamelib-rjv-wines'
const failResult = (path: string) => ({
  ok: false,
  winemacPath: `${path}/Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so`,
  reason: 'winemac.so lacks the macdrv metal-view exports',
  missing: [
    '_macdrv_functions',
    '_macdrv_view_create_metal_view',
    '_macdrv_view_get_metal_layer',
    '_macdrv_view_release_metal_view'
  ]
})

function makeWine(
  name: string,
  overrides: Partial<WineVersionInfo> = {}
): WineVersionInfo {
  return {
    version: name,
    type: 'Wine-Staging-macOS',
    isInstalled: true,
    installDir: `${WINES}/${name}`,
    ...overrides
  } as WineVersionInfo
}

function emitInstalled(wine: WineVersionInfo) {
  backendEvents.emit('wineVersionInstalled', wine, WINES)
}

function emitReleasesInfoReady() {
  backendEvents.emit('releasesInfoReady', {
    dxmt: { tag: 'v0.80' }
  } as unknown as ReleasesInfo)
}

beforeEach(() => {
  isOnlineMock.mockReturnValue(true)
  storeGetMock.mockReturnValue([])
  existsSyncMock.mockReturnValue(false)
  readFileSyncMock.mockReturnValue('')
  checkMock.mockResolvedValue({ ok: true })
})

afterEach(() => {
  // The gate must never delete anything; only the uninstall regression case may.
  if (!expect.getState().currentTestName?.includes('uninstall')) {
    expect(rmSyncMock).toHaveBeenCalledTimes(0)
  }
})

describe('wineVersionInstalled gate', () => {
  it('creates the -DXMT copy when the export check passes, checking before download', async () => {
    const wine = makeWine('wine-staging-ok')

    emitInstalled(wine)
    await flush()

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(installMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ name: 'dxmt' })
    )
    expect(checkMock).toHaveBeenCalledTimes(1)
    expect(checkMock.mock.calls[0][0]).toBe(`${WINES}/wine-staging-ok`)
    expect(cpSyncMock).toHaveBeenCalledTimes(1)
    expect(cpSyncMock.mock.calls[0][0]).toBe(`${WINES}/wine-staging-ok`)
    expect(cpSyncMock.mock.calls[0][1]).toBe(`${WINES}/wine-staging-ok-DXMT`)
    expect(
      defined(checkMock.mock.invocationCallOrder[0], 'check call order')
    ).toBeLessThan(
      defined(installMock.mock.invocationCallOrder[0], 'install call order')
    )
  })

  it('skips download and copy and warns when the check fails', async () => {
    const src = `${WINES}/wine-staging-bad`
    checkMock.mockResolvedValue(failResult(src))

    emitInstalled(makeWine('wine-staging-bad'))
    await flush()

    expect(installMock).toHaveBeenCalledTimes(0)
    expect(cpSyncMock).toHaveBeenCalledTimes(0)
    expect(logWarningMock).toHaveBeenCalledTimes(1)
    const [msg, prefix] = logWarningMock.mock.calls[0] as [string, string]
    expect(prefix).toBe('ToolInstaller')
    for (const part of [
      'wine-staging-bad',
      `${src}/Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so`,
      '_macdrv_functions',
      '_macdrv_view_create_metal_view',
      '_macdrv_view_get_metal_layer',
      '_macdrv_view_release_metal_view'
    ]) {
      expect(msg.includes(part)).toBe(true)
    }
  })

  it('treats a missing winemac.so as a failure carrying the reason', async () => {
    checkMock.mockResolvedValue({
      ...failResult(`${WINES}/wine-staging-nofile`),
      reason: 'winemac.so not found'
    })

    emitInstalled(makeWine('wine-staging-nofile'))
    await flush()

    expect(installMock).toHaveBeenCalledTimes(0)
    expect(cpSyncMock).toHaveBeenCalledTimes(0)
    expect(logWarningMock).toHaveBeenCalledTimes(1)
    expect(
      (logWarningMock.mock.calls[0][0] as string).includes(
        'winemac.so not found'
      )
    ).toBe(true)
  })
})

describe('releasesInfoReady gate', () => {
  const dxmtPathsExist = (...copies: string[]) =>
    existsSyncMock.mockImplementation((p: string) => copies.includes(p))

  it('downloads and updates a passing existing copy', async () => {
    const wine = makeWine('wine-a')
    storeGetMock.mockReturnValue([wine])
    dxmtPathsExist(`${wine.installDir}-DXMT`)

    emitReleasesInfoReady()
    await flush()

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(checkMock.mock.calls[0][0]).toBe(`${wine.installDir}-DXMT`)
    expect(copyFileSyncMock).toHaveBeenCalledTimes(11)
    for (const call of copyFileSyncMock.mock.calls as string[][]) {
      expect(
        defined(call[1], 'copy destination').startsWith(
          `${wine.installDir}-DXMT/`
        )
      ).toBe(true)
    }
  })

  it('does not download or write when the only copy fails', async () => {
    const wine = makeWine('wine-b')
    storeGetMock.mockReturnValue([wine])
    dxmtPathsExist(`${wine.installDir}-DXMT`)
    checkMock.mockResolvedValue(failResult(`${wine.installDir}-DXMT`))

    emitReleasesInfoReady()
    await flush()

    expect(installMock).toHaveBeenCalledTimes(0)
    expect(copyFileSyncMock).toHaveBeenCalledTimes(0)
    expect(logWarningMock).toHaveBeenCalledTimes(1)
  })

  it('updates only the passing copy when one passes and one fails', async () => {
    const good = makeWine('wine-good')
    const bad = makeWine('wine-bad')
    storeGetMock.mockReturnValue([good, bad])
    dxmtPathsExist(`${good.installDir}-DXMT`, `${bad.installDir}-DXMT`)
    checkMock.mockImplementation((p: string) =>
      Promise.resolve(
        p === `${bad.installDir}-DXMT` ? failResult(p) : { ok: true }
      )
    )

    emitReleasesInfoReady()
    await flush()

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(copyFileSyncMock).toHaveBeenCalledTimes(11)
    for (const call of copyFileSyncMock.mock.calls as string[][]) {
      expect(
        defined(call[1], 'copy destination').startsWith(
          `${good.installDir}-DXMT/`
        )
      ).toBe(true)
    }
    expect(logWarningMock).toHaveBeenCalledTimes(1)
  })
})

describe('wineVersionUninstalled (unchanged)', () => {
  it('still removes the -DXMT copy on uninstall', async () => {
    const wine = makeWine('wine-gone')
    existsSyncMock.mockReturnValue(true)

    backendEvents.emit('wineVersionUninstalled', wine)
    await flush()

    expect(rmSyncMock).toHaveBeenCalledTimes(1)
    expect(rmSyncMock.mock.calls[0][0]).toBe(`${wine.installDir}-DXMT`)
  })
})
