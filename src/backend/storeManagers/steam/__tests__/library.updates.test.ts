/** Phase 74 plan 05: Steam listUpdateableGames / listAutoUpdateableGames delegate to detectSteamUpdates. */
import SteamLibraryManager from '../library'
import { detectSteamUpdates } from '../updateDetection'
import { logWarning } from 'backend/logger'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../updateDetection', () => ({ detectSteamUpdates: jest.fn() }))
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

function st(appId: string, kind: string, state: string) {
  return { appId, kind, state, installedBuild: '1', branch: 'public' }
}

function makeLib() {
  return new SteamLibraryManager({} as never)
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
})
