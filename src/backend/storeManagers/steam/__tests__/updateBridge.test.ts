/* eslint-disable @typescript-eslint/unbound-method */
/** Phase 74 plan 10: updateBridgeGame (D-10, D-13, D-15, D-16) over faked estimate/pipeline. */
import { updateBridgeGame } from '../updateBridge'
import { downloadSteamDepotsRust } from '../depotRust/install'
import {
  estimateBridgeUpdate,
  resolveBridgeUpdateContext
} from '../depotRust/updateEstimate'
import { runBridgeUpdateFollowUps } from '../bridge/bridgeUpdateFollowUps'
import {
  getLastKnownSteamUpdateState,
  invalidateSteamUpdateState
} from '../updateDetection'
import { getDiskInfo } from 'backend/utils/filesystem'
import { logInfo } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_k: string, d: string, o?: Record<string, string>) =>
      d.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => o?.[n] ?? '')
  }
}))
jest.mock('backend/dialog/dialog', () => ({ notify: jest.fn() }))
jest.mock('backend/utils', () => ({
  getFileSize: (n: number) => `${n}B`,
  sendGameStatusUpdate: jest.fn()
}))
jest.mock('backend/utils/filesystem', () => ({ getDiskInfo: jest.fn() }))
jest.mock('../depotRust/install', () => ({
  downloadSteamDepotsRust: jest.fn()
}))
jest.mock('../depotRust/updateEstimate', () => ({
  estimateBridgeUpdate: jest.fn(),
  resolveBridgeUpdateContext: jest.fn()
}))
jest.mock('../bridge/bridgeUpdateFollowUps', () => ({
  runBridgeUpdateFollowUps: jest.fn()
}))
jest.mock('../updateDetection', () => ({
  ...jest.requireActual('../updateDetection'),
  getLastKnownSteamUpdateState: jest.fn(),
  invalidateSteamUpdateState: jest.fn()
}))

const GB = 1024 ** 3
const EST = {
  targetBuild: '9',
  downloadBytes: GB,
  peakBytes: 13 * GB,
  oldManifestAvailable: true,
  computedAt: 0
}

function makeGame(phase: 'running' | 'starting' | null = null) {
  const signal = new AbortController()
  const aborts = new Map<string, AbortController>()
  const inFlight = new Map<
    string,
    { promise: Promise<unknown>; aborted: boolean }
  >()
  const game = {
    appId: '12345',
    getGameInfo: () => ({ title: 'Game' }),
    deps: {
      steamInstallRuntime: {},
      steamUser: {},
      config: {},
      aborts: {
        has: (id: string) => aborts.has(id),
        getSignal: (id: string) => aborts.get(id)?.signal,
        create: (id: string) => {
          const c = signal
          aborts.set(id, c)
          return c
        },
        delete: (id: string) => aborts.delete(id)
      },
      steamLaunchRuntime: {
        monitors: { getBottleProcessMonitorPhase: () => phase }
      },
      steamSession: {
        gameSession: {
          nativeInstallsInFlight: inFlight,
          bridgeLaunchesInFlight: new Map()
        }
      }
    }
  }
  return { game: game as never, aborts, inFlight, signal }
}

describe('updateBridgeGame', () => {
  beforeEach(() => {
    jest.mocked(resolveBridgeUpdateContext).mockResolvedValue({
      bridgeBottleName: 'bottle',
      steamappsDir: '/b/steamapps',
      installdir: 'Game',
      branch: 'beta1',
      oldGidByDepot: new Map([['100', '7234567890123456789']])
    })
    jest.mocked(estimateBridgeUpdate).mockResolvedValue(EST)
    jest.mocked(getDiskInfo).mockResolvedValue({
      freeSpace: 100 * GB,
      totalSpace: 200 * GB
    })
    jest.mocked(getLastKnownSteamUpdateState).mockReturnValue(undefined)
    jest.mocked(runBridgeUpdateFollowUps).mockResolvedValue({
      errors: []
    } as never)
  })

  it('refuses while running, before any work', async () => {
    const { game } = makeGame('running')
    const r = await updateBridgeGame(game)
    expect(r.status).toBe('error')
    expect(estimateBridgeUpdate).not.toHaveBeenCalled()
    expect(getDiskInfo).not.toHaveBeenCalled()
    expect(downloadSteamDepotsRust).not.toHaveBeenCalled()
  })

  it('refuses an unresolvable branch without a job', async () => {
    jest
      .mocked(getLastKnownSteamUpdateState)
      .mockReturnValue({ reason: 'branch-unresolved' } as never)
    const { game } = makeGame()
    const r = await updateBridgeGame(game)
    expect(r).toMatchObject({ status: 'error' })
    expect((r as { error: string }).error).toContain('beta1')
    expect(downloadSteamDepotsRust).not.toHaveBeenCalled()
  })

  it('refuses a short disk with both sizes and starts nothing', async () => {
    jest.mocked(getDiskInfo).mockResolvedValue({
      freeSpace: 4 * GB,
      totalSpace: 200 * GB
    })
    const { game } = makeGame()
    const r = (await updateBridgeGame(game)) as {
      status: string
      error: string
    }
    expect(r.status).toBe('error')
    expect(r.error).toContain(`${13 * GB}B`)
    expect(r.error).toContain(`${4 * GB}B`)
    expect(downloadSteamDepotsRust).not.toHaveBeenCalled()
  })

  it('happy path: delta job, follow-ups, invalidate, done', async () => {
    jest.mocked(downloadSteamDepotsRust).mockResolvedValue({
      status: 'done',
      delta: {
        mode: 'chunk',
        changedFiles: ['Game/Binaries/Win64/steam_api64.dll']
      }
    } as never)
    const { game, aborts, inFlight, signal } = makeGame()
    expect(await updateBridgeGame(game)).toEqual({ status: 'done' })
    expect(downloadSteamDepotsRust).toHaveBeenCalledWith(
      '12345',
      expect.objectContaining({
        os: 'windows',
        targetSteamappsDir: '/b/steamapps',
        installdir: 'Game',
        branch: 'beta1',
        signal: signal.signal,
        delta: { oldGidByDepot: new Map([['100', '7234567890123456789']]) }
      })
    )
    expect(runBridgeUpdateFollowUps).toHaveBeenCalledWith(game, {
      changedPaths: ['Game/Binaries/Win64/steam_api64.dll'],
      fullReconcile: false,
      bridgeBottleName: 'bottle'
    })
    expect(invalidateSteamUpdateState).toHaveBeenCalled()
    await Promise.resolve()
    expect(aborts.size).toBe(0)
    expect(inFlight.size).toBe(0)
  })

  it('file_fallback runs follow-ups as a full reconcile', async () => {
    jest.mocked(downloadSteamDepotsRust).mockResolvedValue({
      status: 'done',
      delta: { mode: 'file_fallback', changedFiles: [] }
    } as never)
    const { game } = makeGame()
    await updateBridgeGame(game)
    expect(runBridgeUpdateFollowUps).toHaveBeenCalledWith(
      game,
      expect.objectContaining({ fullReconcile: true })
    )
  })

  it('cancelled maps to abort with no follow-ups and clean registries', async () => {
    jest
      .mocked(downloadSteamDepotsRust)
      .mockResolvedValue({ status: 'cancelled' } as never)
    const { game, aborts, inFlight } = makeGame()
    expect(await updateBridgeGame(game)).toEqual({ status: 'abort' })
    expect(runBridgeUpdateFollowUps).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(aborts.size).toBe(0)
    expect(inFlight.size).toBe(0)
  })

  it('a committed delta finishes its follow-ups even when the signal aborted', async () => {
    const { game, signal } = makeGame()
    jest.mocked(downloadSteamDepotsRust).mockImplementation(() => {
      signal.abort()
      return Promise.resolve({
        status: 'done',
        delta: { mode: 'chunk', changedFiles: ['a'], committed: true }
      } as never)
    })
    expect(await updateBridgeGame(game)).toEqual({ status: 'done' })
    expect(runBridgeUpdateFollowUps).toHaveBeenCalled()
    expect(invalidateSteamUpdateState).toHaveBeenCalled()
  })

  it('a cancelled outcome that carries a committed delta is treated as done', async () => {
    jest.mocked(downloadSteamDepotsRust).mockResolvedValue({
      status: 'cancelled',
      delta: { mode: 'chunk', changedFiles: [], committed: true }
    } as never)
    const { game } = makeGame()
    expect(await updateBridgeGame(game)).toEqual({ status: 'done' })
    expect(runBridgeUpdateFollowUps).toHaveBeenCalled()
  })

  it('a cancelled outcome with an uncommitted delta stays abort', async () => {
    jest.mocked(downloadSteamDepotsRust).mockResolvedValue({
      status: 'cancelled',
      delta: { mode: 'chunk', changedFiles: [], committed: false }
    } as never)
    const { game } = makeGame()
    expect(await updateBridgeGame(game)).toEqual({ status: 'abort' })
    expect(runBridgeUpdateFollowUps).not.toHaveBeenCalled()
  })

  it('error maps through with no follow-ups and no retry', async () => {
    jest
      .mocked(downloadSteamDepotsRust)
      .mockResolvedValue({ status: 'error', error: 'boom' } as never)
    const { game } = makeGame()
    expect(await updateBridgeGame(game)).toMatchObject({
      status: 'error',
      error: 'boom'
    })
    expect(runBridgeUpdateFollowUps).not.toHaveBeenCalled()
    expect(downloadSteamDepotsRust).toHaveBeenCalledTimes(1)
  })

  it('unattended threads the flag to estimate and download', async () => {
    jest.mocked(downloadSteamDepotsRust).mockResolvedValue({
      status: 'done',
      delta: { committed: true, changedFiles: [], mode: 'delta' }
    } as never)
    const { game } = makeGame()
    await updateBridgeGame(game, { unattended: true })
    expect(estimateBridgeUpdate).toHaveBeenCalledWith(
      game,
      expect.objectContaining({ unattended: true })
    )
    expect(downloadSteamDepotsRust).toHaveBeenCalledWith(
      '12345',
      expect.objectContaining({ unattended: true })
    )
  })

  it('unattended refused lease: error result, one log line, no dialog', async () => {
    jest
      .mocked(estimateBridgeUpdate)
      .mockResolvedValue({ error: 'Steam sign-in unavailable (no-session)' })
    const { game } = makeGame()
    const r = await updateBridgeGame(game, { unattended: true })
    expect(r).toMatchObject({
      status: 'error',
      error: 'Steam sign-in unavailable (no-session)'
    })
    const lines = jest
      .mocked(logInfo)
      .mock.calls.filter(([m]) => String(m).includes('unattended=true'))
    expect(lines).toHaveLength(1)
    expect(notify).not.toHaveBeenCalled()
    expect(downloadSteamDepotsRust).not.toHaveBeenCalled()
  })

  it('unattended log names the phase: estimate and disk refusals are "not started", a download error is "failed"', async () => {
    const lines = () =>
      jest
        .mocked(logInfo)
        .mock.calls.map(([m]) => String(m))
        .filter((m) => m.includes('unattended=true'))
    jest.mocked(estimateBridgeUpdate).mockResolvedValueOnce({ error: 'e1' })
    await updateBridgeGame(makeGame().game, { unattended: true })
    expect(lines().at(-1)).toContain('update not started: e1')

    jest.mocked(getDiskInfo).mockResolvedValueOnce({
      freeSpace: 1,
      totalSpace: 1
    } as never)
    await updateBridgeGame(makeGame().game, { unattended: true })
    expect(lines().at(-1)).toContain('update not started: Not enough')

    jest
      .mocked(downloadSteamDepotsRust)
      .mockResolvedValueOnce({ status: 'error', error: 'boom' } as never)
    await updateBridgeGame(makeGame().game, { unattended: true })
    expect(lines().at(-1)).toContain('update failed: boom')

    const before = lines().length
    jest
      .mocked(downloadSteamDepotsRust)
      .mockResolvedValueOnce({ status: 'error', error: 'boom' } as never)
    await updateBridgeGame(makeGame().game)
    expect(lines()).toHaveLength(before)
  })

  it('a concurrent update joins the in-flight run (one job)', async () => {
    let finish: (v: unknown) => void = () => undefined
    jest.mocked(downloadSteamDepotsRust).mockReturnValue(
      new Promise((res) => {
        finish = res
      }) as never
    )
    const { game } = makeGame()
    const a = updateBridgeGame(game)
    const b = updateBridgeGame(game)
    await new Promise((r) => setImmediate(r))
    finish({ status: 'cancelled' })
    expect(await a).toEqual({ status: 'abort' })
    expect(await b).toEqual({ status: 'abort' })
    expect(downloadSteamDepotsRust).toHaveBeenCalledTimes(1)
  })
})
