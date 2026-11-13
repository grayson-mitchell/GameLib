/** Phase 74 plan 05: Steam listUpdateableGames / listAutoUpdateableGames delegate to detectSteamUpdates. */
import SteamLibraryManager from '../library'
import { detectSteamUpdates } from '../updateDetection'
import { logWarning } from 'backend/logger'
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { noteAutoUpdateAttempt } from '../autoUpdateAttempts'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../updateDetection', () => ({
  ...jest.requireActual('../updateDetection'),
  detectSteamUpdates: jest.fn(),
  getLastKnownSteamUpdateState: jest.fn()
}))
jest.mock('../games', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../library/acfState', () => ({ scanDownloadingAppIds: jest.fn() }))
jest.mock('../library/refresh', () => ({
  refresh: jest.fn(),
  refreshInstallState: jest.fn()
}))
jest.mock('../library/resume', () => ({
  rearmPersistedSteamRestartHolds: jest.fn()
}))
jest.mock('../../../dialog/dialog', () => ({ notify: jest.fn() }))

const detect = detectSteamUpdates as jest.Mock

function st(appId: string, kind: string, state: string, targetBuild = '9') {
  return {
    appId,
    kind,
    state,
    installedBuild: '1',
    targetBuild,
    branch: 'public'
  }
}

function makeLib() {
  return new SteamLibraryManager({
    steamInstallRuntime: createTestSteamInstallRuntime()
  } as never)
}

describe('Steam update listing', () => {
  beforeEach(() => {
    detect.mockReset()
    detect.mockResolvedValue([
      st('30', 'registered', 'stale'),
      st('20', 'bridge', 'stale'),
      st('10', 'bridge', 'stale'),
      st('40', 'bridge', 'unknown'),
      st('50', 'registered', 'current')
    ])
  })

  it('lists stale appIds of both kinds, sorted, excluding unknown/current', async () => {
    expect(await makeLib().listUpdateableGames()).toEqual(['10', '20', '30'])
  })

  it('auto list holds only stale bridge appIds', async () => {
    expect(await makeLib().listAutoUpdateableGames()).toEqual(['10', '20'])
  })

  it('returns [] and warns when detection throws', async () => {
    detect.mockRejectedValue(new Error('boom'))
    const lib = makeLib()
    expect(await lib.listUpdateableGames()).toEqual([])
    expect(await lib.listAutoUpdateableGames()).toEqual([])
    expect(logWarning).toHaveBeenCalled()
  })

  it('one refresh (badge list then auto list) detects once', async () => {
    const lib = makeLib()
    await lib.listUpdateableGames()
    await lib.listAutoUpdateableGames()
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('auto list alone still detects, and the hand-off is one-shot', async () => {
    const lib = makeLib()
    await lib.listAutoUpdateableGames()
    expect(detect).toHaveBeenCalledTimes(1)
    await lib.listAutoUpdateableGames()
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('auto list drops an app already attempted for its build, not a newer one', async () => {
    const lib = makeLib()
    const deps = (lib as unknown as { deps: never }).deps
    const { getLastKnownSteamUpdateState } = jest.requireMock(
      '../updateDetection'
    ) as { getLastKnownSteamUpdateState: jest.Mock }
    getLastKnownSteamUpdateState.mockReturnValue({ targetBuild: '9' })
    noteAutoUpdateAttempt(deps, '10')
    expect(await lib.listAutoUpdateableGames()).toEqual(['20'])
    detect.mockResolvedValue([st('10', 'bridge', 'stale', '10')])
    expect(await lib.listAutoUpdateableGames()).toEqual(['10'])
  })
})
