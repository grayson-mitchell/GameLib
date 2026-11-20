/** quick 261120-p2j: verifyBridgeGame over a faked pinned-GID job, context and follow-ups. */
import { verifyBridgeGame } from '../verifyBridge'
import { initHeadless } from 'backend/logger'

// The real logger needs a writer; jest.setupContainment keeps the log file under a fake HOME.
beforeAll(() => initHeadless())

const verifyInstalledDepotsRust = jest.fn()
const resolveBridgeUpdateContext = jest.fn()
const runBridgeUpdateFollowUps = jest.fn()
const readAcfInstalledDepots = jest.fn()
const isBridgeGameRunning = jest.fn()
const collab = {
  isRunning: isBridgeGameRunning,
  resolveContext: resolveBridgeUpdateContext,
  readInstalledDepots: readAcfInstalledDepots,
  verifyDepots: verifyInstalledDepotsRust,
  runFollowUps: runBridgeUpdateFollowUps
}

function makeGame() {
  const controller = new AbortController()
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
          aborts.set(id, controller)
          return controller
        },
        delete: (id: string) => aborts.delete(id)
      },
      steamSession: {
        gameSession: { nativeInstallsInFlight: inFlight }
      }
    }
  }
  return { game: game as never, aborts, inFlight }
}

describe('verifyBridgeGame', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    isBridgeGameRunning.mockReturnValue(false)
    resolveBridgeUpdateContext.mockResolvedValue({
      bridgeBottleName: 'bottle',
      steamappsDir: '/b/steamapps',
      installdir: 'Game',
      branch: 'public',
      oldGidByDepot: new Map()
    })
    readAcfInstalledDepots.mockResolvedValue({
      buildid: '321',
      installedDepots: [
        { depotId: '100', manifest: '7234567890123456789', size: '0' }
      ]
    })
    verifyInstalledDepotsRust.mockResolvedValue({ status: 'done' })
    runBridgeUpdateFollowUps.mockResolvedValue({
      shimTouched: true,
      redistRan: false,
      drmPrefetched: false,
      errors: []
    } as never)
  })

  it('refuses a running game before reading any context', async () => {
    isBridgeGameRunning.mockReturnValue(true)
    const { game } = makeGame()
    await expect(verifyBridgeGame(game, collab)).rejects.toThrow(
      'Quit Game before verifying it.'
    )
    expect(resolveBridgeUpdateContext).not.toHaveBeenCalled()
  })

  it('refuses while an install or update is in flight', async () => {
    const { game, inFlight } = makeGame()
    inFlight.set('12345', { promise: new Promise(() => {}), aborted: false })
    await expect(verifyBridgeGame(game, collab)).rejects.toThrow(
      'is installing or updating'
    )
    expect(verifyInstalledDepotsRust).not.toHaveBeenCalled()
  })

  it('runs the pinned job with the installed build and follows up with a full reconcile', async () => {
    const { game, aborts, inFlight } = makeGame()
    const res = await verifyBridgeGame(game, collab)
    expect(verifyInstalledDepotsRust).toHaveBeenCalledWith(
      '12345',
      expect.objectContaining({
        os: 'windows',
        branch: 'public',
        installdir: 'Game',
        targetSteamappsDir: '/b/steamapps',
        installed: {
          buildid: '321',
          depots: [
            { depotId: '100', manifest: '7234567890123456789', size: '0' }
          ]
        }
      })
    )
    expect(runBridgeUpdateFollowUps).toHaveBeenCalledWith(game, {
      changedPaths: [],
      fullReconcile: true,
      bridgeBottleName: 'bottle'
    })
    expect(res.stdout).toContain('shimTouched=true')
    expect(aborts.has('12345')).toBe(false)
    // The in-flight entry is released once the run settles.
    await Promise.resolve()
    await Promise.resolve()
    expect(inFlight.has('12345')).toBe(false)
  })

  it('registers in nativeInstallsInFlight while running', async () => {
    const { game, inFlight } = makeGame()
    let seen = false
    verifyInstalledDepotsRust.mockImplementation(() => {
      seen = inFlight.has('12345')
      return Promise.resolve({ status: 'done' })
    })
    await verifyBridgeGame(game, collab)
    expect(seen).toBe(true)
  })

  it('runs the follow-ups after a cancelled job, then throws', async () => {
    verifyInstalledDepotsRust.mockResolvedValue({ status: 'cancelled' })
    const { game, aborts } = makeGame()
    await expect(verifyBridgeGame(game, collab)).rejects.toThrow(
      'Verify of Game was cancelled'
    )
    expect(runBridgeUpdateFollowUps).toHaveBeenCalledTimes(1)
    expect(aborts.has('12345')).toBe(false)
  })

  it('runs the follow-ups after a failed job, then throws the job error', async () => {
    verifyInstalledDepotsRust.mockResolvedValue({
      status: 'error',
      error: 'cdn down'
    })
    const { game } = makeGame()
    await expect(verifyBridgeGame(game, collab)).rejects.toThrow(
      'Could not verify Game: cdn down'
    )
    expect(runBridgeUpdateFollowUps).toHaveBeenCalledTimes(1)
  })

  it('throws naming follow-up errors after a done job', async () => {
    runBridgeUpdateFollowUps.mockResolvedValue({
      shimTouched: true,
      redistRan: false,
      drmPrefetched: false,
      errors: ['shim: boom']
    } as never)
    const { game } = makeGame()
    await expect(verifyBridgeGame(game, collab)).rejects.toThrow(
      'Verified Game, but the bridge follow-ups failed: shim: boom'
    )
  })

  it('throws on an unreadable install without running a job', async () => {
    resolveBridgeUpdateContext.mockResolvedValue({
      error: 'No bridge install found'
    })
    const { game } = makeGame()
    await expect(verifyBridgeGame(game, collab)).rejects.toThrow(
      'No bridge install found'
    )
    expect(verifyInstalledDepotsRust).not.toHaveBeenCalled()
    expect(runBridgeUpdateFollowUps).not.toHaveBeenCalled()
  })

  it('names skipped depots in the report', async () => {
    verifyInstalledDepotsRust.mockResolvedValue({
      status: 'done',
      skippedDepots: ['101']
    })
    const { game } = makeGame()
    const res = await verifyBridgeGame(game, collab)
    expect(res.stdout).toContain('skipped depots: 101')
  })
})
