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
import { logInfo } from 'backend/logger'
import { notify } from '../../../dialog/dialog'
import { STEAM_REQUEST_NO_ACTIVITY_TICKS } from '../library/pollState'

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
