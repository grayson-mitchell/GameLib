/** Phase 74 plan 08: update-aware poll tick (D-11) and startInstallPolling's awaitingUpdate wiring. */
import {
  createTestManagerDeps,
  createInertSteamProcesses
} from 'backend/testUtils/testServices'
import { pollUpdateOnce } from '../library/updatePollOnce'
import { startInstallPolling } from '../library/installPolling'
import { stopInstallPolling } from '../library/installStop'
import { readAcfUpdateState } from '../library/acfUpdateState'
import { invalidateSteamUpdateState } from '../updateDetection'
import { logInfo, logError } from 'backend/logger'
import { notify } from '../../../dialog/dialog'
import {
  STEAM_REQUEST_NO_ACTIVITY_TICKS,
  STEAM_INSTALLAPP_RETRY_EVERY_TICKS,
  STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS
} from '../library/pollState'
import { requestSteamInstallApp } from '../steamInstallApp'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn((n: number) => `${n}B`)
}))
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))
jest.mock('../../../dialog/dialog', () => ({ notify: jest.fn() }))
jest.mock('../library/acfUpdateState', () => ({
  ...jest.requireActual('../library/acfUpdateState'),
  readAcfUpdateState: jest.fn()
}))
jest.mock('../updateDetection', () => ({
  ...jest.requireActual('../updateDetection'),
  invalidateSteamUpdateState: jest.fn()
}))
jest.mock('../steamInstallApp', () => ({
  requestSteamInstallApp: jest.fn(),
  createSteamInstallAppRun: () => 'run'
}))
jest.mock('../library/installPollOnce', () => ({ pollInstallOnce: jest.fn() }))

const send = jest.fn()
const deps = createTestManagerDeps({
  sendFrontendMessage: send,
  steamProcesses: createInertSteamProcesses()
})
const APP = '333300'

function acf(over: Record<string, unknown>) {
  jest.mocked(readAcfUpdateState).mockResolvedValue({
    steamappsDir: '/s',
    buildid: '100',
    stateFlags: 4,
    bytesToDownload: 0,
    bytesDownloaded: 0,
    scheduledAutoUpdate: 0,
    ...over
  } as never)
}

function poll(): NonNullable<ReturnType<typeof getPoll>> {
  startInstallPolling(deps, APP, {
    delegatedToSteamClient: true,
    awaitingUpdate: { fromBuild: '100' }
  })
  return getPoll()!
}
function getPoll() {
  return deps.steamInstallRuntime.polls.activePolls.get(APP)
}

describe('pollUpdateOnce', () => {
  beforeEach(() => jest.clearAllMocks())
  afterEach(() => stopInstallPolling(deps, APP))

  it('pending (StateFlags 6) reports updating, managed by Steam', async () => {
    acf({ stateFlags: 6, targetBuildId: '200' })
    await pollUpdateOnce(deps, APP, poll())
    expect(send).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP,
      runner: 'steam',
      status: 'updating',
      managedBySteam: true
    })
    expect(getPoll()).toBeDefined()
  })

  it('derives percent from the ACF byte counters', async () => {
    acf({ stateFlags: 6, bytesDownloaded: 936064, bytesToDownload: 1872128 })
    await pollUpdateOnce(deps, APP, poll())
    expect(send).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        progress: expect.objectContaining({ percent: 50 })
      })
    )
  })

  it('completes when the update is no longer pending and bit 4 is set', async () => {
    const p = poll()
    acf({ stateFlags: 6, targetBuildId: '200' })
    await pollUpdateOnce(deps, APP, p)
    send.mockClear()
    acf({ stateFlags: 4, buildid: '200', targetBuildId: '200' })
    await pollUpdateOnce(deps, APP, p)
    expect(send).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP,
      runner: 'steam',
      status: 'done'
    })
    expect(invalidateSteamUpdateState).toHaveBeenCalledWith(deps, APP)
    expect(getPoll()).toBeUndefined()
  })

  it('bit 4 alone with a different target build is not completion', async () => {
    acf({ stateFlags: 4, buildid: '100', targetBuildId: '200' })
    await pollUpdateOnce(deps, APP, poll())
    expect(getPoll()).toBeDefined()
    expect(send).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'done' })
    )
  })

  it('completes on the target build with no pending state ever seen, updating before done', async () => {
    startInstallPolling(deps, APP, {
      delegatedToSteamClient: true,
      awaitingUpdate: { fromBuild: '100', targetBuild: '200' }
    })
    acf({ stateFlags: 4, buildid: '200' })
    send.mockClear()
    await pollUpdateOnce(deps, APP, getPoll()!)
    const statuses = send.mock.calls
      .filter((c) => c[0] === 'gameStatusUpdate')
      .map((c) => c[1].status)
    expect(statuses).toEqual(['updating', 'done'])
    expect(send).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'updating', managedBySteam: true })
    )
    expect(invalidateSteamUpdateState).toHaveBeenCalledWith(deps, APP)
    expect(getPoll()).toBeUndefined()
  })

  it('quiet end completes when the ACF is already current', async () => {
    const p = poll()
    acf({ stateFlags: 4, buildid: '100' })
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS
    send.mockClear()
    await pollUpdateOnce(deps, APP, p)
    const statuses = send.mock.calls
      .filter((c) => c[0] === 'gameStatusUpdate')
      .map((c) => c[1].status)
    expect(statuses.slice(-2)).toEqual(['updating', 'done'])
    expect(invalidateSteamUpdateState).toHaveBeenCalledWith(deps, APP)
    expect(getPoll()).toBeUndefined()
  })

  function pollWithTarget(targetBuild: string | undefined) {
    startInstallPolling(deps, APP, {
      delegatedToSteamClient: true,
      awaitingUpdate: { fromBuild: '777', targetBuild }
    })
    return getPoll()!
  }
  const statusesOf = () =>
    send.mock.calls
      .filter((c) => c[0] === 'gameStatusUpdate')
      .map((c) => c[1].status)

  it('quiet end with an unmet target build does not complete', async () => {
    const p = pollWithTarget('800')
    acf({ stateFlags: 4, buildid: '777' })
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS
    send.mockClear()
    await pollUpdateOnce(deps, APP, p)
    // the tick's own progress 'updating' precedes the quiet 'done'; complete() would send a second
    expect(statusesOf()).toEqual(['updating', 'done'])
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('ending the update poll quietly'),
      'Steam'
    )
    expect(logInfo).not.toHaveBeenCalledWith(
      expect.stringContaining('finished'),
      'Steam'
    )
    expect(invalidateSteamUpdateState).toHaveBeenCalledWith(deps, APP)
    expect(getPoll()).toBeUndefined()
  })

  it('UAT 19 live replay: stale ACF for 40 ticks ends quietly, never finished at the stale build', async () => {
    const p = pollWithTarget('5820078')
    p.awaitingUpdate!.fromBuild = '5820077'
    acf({ stateFlags: 4, buildid: '5820077', targetBuildId: '5820077' })
    send.mockClear()
    for (let i = 0; i < STEAM_REQUEST_NO_ACTIVITY_TICKS; i++) {
      p.ticks = i + 1
      await pollUpdateOnce(deps, APP, p)
    }
    expect(logInfo).not.toHaveBeenCalledWith(
      expect.stringContaining('finished (build 5820077)'),
      'Steam'
    )
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('ending the update poll quietly'),
      'Steam'
    )
    expect(statusesOf().filter((s) => s === 'done')).toHaveLength(1)
    expect(send).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
    expect(getPoll()).toBeUndefined()
  })

  it('UAT 19: reaching the PICS target logs finished at that build', async () => {
    const p = pollWithTarget('5820078')
    p.awaitingUpdate!.fromBuild = '5820077'
    acf({ stateFlags: 4, buildid: '5820078', targetBuildId: '5820078' })
    p.ticks = 5
    await pollUpdateOnce(deps, APP, p)
    expect(logInfo).toHaveBeenCalledWith(
      'Steam: update of appId 333300 finished (build 5820078)',
      'Steam'
    )
  })

  it('quiet end with no known target completes when the ACF is current', async () => {
    const p = pollWithTarget(undefined)
    acf({ stateFlags: 4, buildid: '777' })
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS
    send.mockClear()
    await pollUpdateOnce(deps, APP, p)
    expect(statusesOf().slice(-2)).toEqual(['updating', 'done'])
  })

  it('quiet end at the target build completes', async () => {
    const p = pollWithTarget('800')
    acf({ stateFlags: 4, buildid: '800' })
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS
    send.mockClear()
    await pollUpdateOnce(deps, APP, p)
    expect(statusesOf().slice(-2)).toEqual(['updating', 'done'])
  })

  it('ends quietly after the no-activity window', async () => {
    const p = poll()
    acf({ stateFlags: 6, targetBuildId: '200' })
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS
    await pollUpdateOnce(deps, APP, p)
    expect(send).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP,
      runner: 'steam',
      status: 'done'
    })
    expect(send).not.toHaveBeenCalledWith(
      'steamRequestNotice',
      expect.anything()
    )
    expect(notify).not.toHaveBeenCalled()
    expect(invalidateSteamUpdateState).toHaveBeenCalledWith(deps, APP)
    expect(getPoll()).toBeUndefined()
  })
})

describe('pollUpdateOnce InstallApp retry (74-30)', () => {
  beforeEach(() => jest.clearAllMocks())
  afterEach(() => stopInstallPolling(deps, APP))

  function armed() {
    startInstallPolling(deps, APP, {
      delegatedToSteamClient: true,
      awaitingUpdate: {
        fromBuild: '100',
        targetBuild: '200',
        installAppRetry: { libraryPath: '/lib', attempts: 0 }
      }
    })
    const p = getPoll()!
    acf({ stateFlags: 4, buildid: '100', targetBuildId: '100' })
    return p
  }
  const due = (p: ReturnType<typeof armed>) => {
    p.ticks = p.delegatedSinceTick + STEAM_INSTALLAPP_RETRY_EVERY_TICKS
  }

  it('ok: logs the retry, disarms, restarts the quiet window', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'ok', folderIndex: 0 } as never)
    const p = armed()
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(requestSteamInstallApp).toHaveBeenCalledTimes(1)
    expect(logInfo).toHaveBeenCalledWith(
      'SteamGame: Steam is updating appId 333300 via InstallApp (retry after Steam start)',
      'Steam'
    )
    expect(p.awaitingUpdate?.installAppRetry).toBeUndefined()
    expect(p.delegatedSinceTick).toBe(p.ticks)
  })

  it('unavailable: counts attempts, gives up at the max with one log', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'unavailable', reason: 'steam-not-running' })
    const p = armed()
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(p.awaitingUpdate?.installAppRetry?.attempts).toBe(1)
    p.awaitingUpdate!.installAppRetry!.attempts =
      STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS - 1
    p.ticks += STEAM_INSTALLAPP_RETRY_EVERY_TICKS
    p.ticks -= p.ticks % STEAM_INSTALLAPP_RETRY_EVERY_TICKS
    p.delegatedSinceTick = 0
    await pollUpdateOnce(deps, APP, p)
    expect(p.awaitingUpdate?.installAppRetry).toBeUndefined()
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining(
        'InstallApp retry for appId 333300 gave up after'
      ),
      'Steam'
    )
  })

  it('error: disarms and logs the EAppUpdateError code', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'error', code: 9 } as never)
    const p = armed()
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(p.awaitingUpdate?.installAppRetry).toBeUndefined()
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('EAppUpdateError 9'),
      'Steam'
    )
    expect(getPoll()).toBeDefined()
  })

  it('does not call the helper again while one retry is in flight', async () => {
    let resolve!: (v: unknown) => void
    jest.mocked(requestSteamInstallApp).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }) as never
    )
    const p = armed()
    due(p)
    const first = pollUpdateOnce(deps, APP, p)
    await Promise.resolve()
    await Promise.resolve()
    await pollUpdateOnce(deps, APP, p)
    expect(requestSteamInstallApp).toHaveBeenCalledTimes(1)
    resolve({ kind: 'ok', folderIndex: 0 })
    await first
  })

  it('never retries once pending or activity was seen', async () => {
    const p = armed()
    acf({ stateFlags: 6, targetBuildId: '200' })
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(requestSteamInstallApp).not.toHaveBeenCalled()
  })
})

describe('startInstallPolling awaitingUpdate', () => {
  afterEach(() => stopInstallPolling(deps, APP))

  it('sets awaitingUpdate on an existing install poll without a second entry', () => {
    startInstallPolling(deps, APP, { delegatedToSteamClient: true })
    const first = getPoll()
    expect(first?.awaitingUpdate).toBeUndefined()
    startInstallPolling(deps, APP, {
      delegatedToSteamClient: true,
      awaitingUpdate: { fromBuild: '9' }
    })
    expect(getPoll()).toBe(first)
    expect(getPoll()?.awaitingUpdate?.fromBuild).toBe('9')
  })
})
