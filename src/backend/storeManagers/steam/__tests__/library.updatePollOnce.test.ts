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
  STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS,
  STEAM_UPDATE_ABANDONED_TICKS
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

async function poll(): Promise<NonNullable<ReturnType<typeof getPoll>>> {
  await startInstallPolling(deps, APP, {
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
    await pollUpdateOnce(deps, APP, await poll())
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
    await pollUpdateOnce(deps, APP, await poll())
    expect(send).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        progress: expect.objectContaining({ percent: 50 })
      })
    )
  })

  it('completes when the update is no longer pending and bit 4 is set', async () => {
    const p = await poll()
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
    await pollUpdateOnce(deps, APP, await poll())
    expect(getPoll()).toBeDefined()
    expect(send).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'done' })
    )
  })

  it('completes on the target build with no pending state ever seen, updating before done', async () => {
    await startInstallPolling(deps, APP, {
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
    const p = await poll()
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

  async function pollWithTarget(targetBuild: string | undefined) {
    await startInstallPolling(deps, APP, {
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
    const p = await pollWithTarget('800')
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
    const p = await pollWithTarget('5820078')
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
    const p = await pollWithTarget('5820078')
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
    const p = await pollWithTarget(undefined)
    acf({ stateFlags: 4, buildid: '777' })
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS
    send.mockClear()
    await pollUpdateOnce(deps, APP, p)
    expect(statusesOf().slice(-2)).toEqual(['updating', 'done'])
  })

  it('quiet end at the target build completes', async () => {
    const p = await pollWithTarget('800')
    acf({ stateFlags: 4, buildid: '800' })
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS
    send.mockClear()
    await pollUpdateOnce(deps, APP, p)
    expect(statusesOf().slice(-2)).toEqual(['updating', 'done'])
  })

  describe('WR-01: Steam abandons an update after activity', () => {
    // Steam downloads (0x106 at the starting build), then drops the update: the ACF settles at
    // fromBuild with leftover byte counters and a TargetBuildID equal to the build.
    const downloading = () =>
      acf({
        stateFlags: 0x106,
        buildid: '777',
        targetBuildId: '800',
        bytesToDownload: 1000,
        bytesDownloaded: 400
      })
    const settled = () =>
      acf({
        stateFlags: 4,
        buildid: '777',
        targetBuildId: '777',
        bytesToDownload: 1000,
        bytesDownloaded: 400
      })
    async function tick(p: Awaited<ReturnType<typeof pollWithTarget>>) {
      p.ticks += 1
      await pollUpdateOnce(deps, APP, p)
    }

    it('ends quietly after STEAM_UPDATE_ABANDONED_TICKS settled ticks, never finished', async () => {
      const p = await pollWithTarget('800')
      downloading()
      await tick(p)
      expect(p.awaitingUpdate?.sawActivity).toBe(true)
      settled()
      for (let i = 0; i < STEAM_UPDATE_ABANDONED_TICKS - 1; i++) await tick(p)
      expect(getPoll()).toBeDefined()
      send.mockClear()
      await tick(p)
      expect(logInfo).toHaveBeenCalledWith(
        'Steam: update of appId 333300 settled back at build 777 for 20 ticks; ending the update poll quietly',
        'Steam'
      )
      expect(logInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('finished'),
        'Steam'
      )
      // quiet end only: no 'updating' that would precede a completion's done
      expect(statusesOf()).toEqual(['done'])
      expect(send).not.toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.anything()
      )
      expect(invalidateSteamUpdateState).toHaveBeenCalledWith(deps, APP)
      expect(getPoll()).toBeUndefined()
    })

    it('a settled read between active ticks restarts the count', async () => {
      const p = await pollWithTarget('800')
      downloading()
      await tick(p)
      settled()
      for (let i = 0; i < STEAM_UPDATE_ABANDONED_TICKS - 1; i++) await tick(p)
      downloading()
      await tick(p)
      settled()
      for (let i = 0; i < STEAM_UPDATE_ABANDONED_TICKS - 1; i++) await tick(p)
      expect(getPoll()).toBeDefined()
      expect(p.awaitingUpdate?.settledAtStartTicks).toBe(
        STEAM_UPDATE_ABANDONED_TICKS - 1
      )
    })

    it('reaching the target after a settled spell still finishes', async () => {
      const p = await pollWithTarget('800')
      downloading()
      await tick(p)
      settled()
      for (let i = 0; i < 5; i++) await tick(p)
      acf({ stateFlags: 4, buildid: '800', targetBuildId: '800' })
      await tick(p)
      expect(logInfo).toHaveBeenCalledWith(
        'Steam: update of appId 333300 finished (build 800)',
        'Steam'
      )
    })
  })

  it('ends quietly after the no-activity window', async () => {
    const p = await poll()
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

  async function armed() {
    await startInstallPolling(deps, APP, {
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
  const due = (p: Awaited<ReturnType<typeof armed>>) => {
    p.ticks = p.delegatedSinceTick + STEAM_INSTALLAPP_RETRY_EVERY_TICKS
  }

  it('ok: logs the retry, disarms, restarts the quiet window', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'ok', folderIndex: 0 } as never)
    const p = await armed()
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
    const p = await armed()
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
    const p = await armed()
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
    const p = await armed()
    due(p)
    const first = pollUpdateOnce(deps, APP, p)
    await Promise.resolve()
    await Promise.resolve()
    await pollUpdateOnce(deps, APP, p)
    expect(requestSteamInstallApp).toHaveBeenCalledTimes(1)
    resolve({ kind: 'ok', folderIndex: 0 })
    await first
  })

  const pendingIdle = () =>
    acf({
      stateFlags: 6,
      buildid: '100',
      targetBuildId: '200',
      bytesDownloaded: 0,
      bytesToDownload: 1000
    })
  const nonDue = (p: Awaited<ReturnType<typeof armed>>) => {
    p.ticks = p.delegatedSinceTick + 1
  }

  it('UAT 25: retries on the live pending-but-idle ACF (same tick)', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'ok', folderIndex: 0 } as never)
    const p = await armed()
    pendingIdle()
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(requestSteamInstallApp).toHaveBeenCalledTimes(1)
    expect(logInfo).toHaveBeenCalledWith(
      'SteamGame: Steam is updating appId 333300 via InstallApp (retry after Steam start)',
      'Steam'
    )
  })

  it('UAT 25: retries on a due tick after an earlier tick set sawPending', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'ok', folderIndex: 0 } as never)
    const p = await armed()
    pendingIdle()
    nonDue(p)
    await pollUpdateOnce(deps, APP, p)
    expect(p.awaitingUpdate?.sawPending).toBe(true)
    expect(requestSteamInstallApp).not.toHaveBeenCalled()
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(requestSteamInstallApp).toHaveBeenCalledTimes(1)
  })

  it('never retries once real activity was seen', async () => {
    const p = await armed()
    acf({ stateFlags: 0x106, targetBuildId: '200' })
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(requestSteamInstallApp).not.toHaveBeenCalled()
  })

  it('UAT 25: growing BytesDownloaded under UpdateRequired disarms the retry', async () => {
    const p = await armed()
    acf({ stateFlags: 6, targetBuildId: '200', bytesDownloaded: 0 })
    nonDue(p)
    await pollUpdateOnce(deps, APP, p)
    acf({ stateFlags: 6, targetBuildId: '200', bytesDownloaded: 500 })
    due(p)
    await pollUpdateOnce(deps, APP, p)
    expect(p.awaitingUpdate?.sawActivity).toBe(true)
    expect(requestSteamInstallApp).not.toHaveBeenCalled()
  })

  it('UAT 25: never logs finished at the stale starting build', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'unavailable', reason: 'steam-not-running' })
    const p = await armed()
    pendingIdle()
    nonDue(p)
    await pollUpdateOnce(deps, APP, p)
    acf({ stateFlags: 4, buildid: '100', targetBuildId: '100' })
    p.ticks += 1
    await pollUpdateOnce(deps, APP, p)
    expect(logInfo).not.toHaveBeenCalledWith(
      expect.stringContaining('finished (build 100)'),
      expect.anything()
    )
    expect(getPoll()).toBeDefined()
  })

  it('UAT 25: finishes once the target build is reached', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'unavailable', reason: 'steam-not-running' })
    const p = await armed()
    pendingIdle()
    nonDue(p)
    await pollUpdateOnce(deps, APP, p)
    acf({ stateFlags: 4, buildid: '200', targetBuildId: '200' })
    p.ticks += 1
    await pollUpdateOnce(deps, APP, p)
    expect(logInfo).toHaveBeenCalledWith(
      'Steam: update of appId 333300 finished (build 200)',
      'Steam'
    )
  })
})

describe('startInstallPolling awaitingUpdate', () => {
  afterEach(() => stopInstallPolling(deps, APP))

  it('sets awaitingUpdate on an existing install poll without a second entry', async () => {
    await startInstallPolling(deps, APP, { delegatedToSteamClient: true })
    const first = getPoll()
    expect(first?.awaitingUpdate).toBeUndefined()
    await startInstallPolling(deps, APP, {
      delegatedToSteamClient: true,
      awaitingUpdate: { fromBuild: '9' }
    })
    expect(getPoll()).toBe(first)
    expect(getPoll()?.awaitingUpdate?.fromBuild).toBe('9')
  })
})

// Plan 80-26: the polls flag now defaults to rust; this file exercises the ts arm, so pin it.
const prevPollsImpl = process.env.GAMELIB_STEAM_POLLS
beforeAll(() => {
  process.env.GAMELIB_STEAM_POLLS = 'ts'
})
afterAll(() => {
  if (prevPollsImpl === undefined) delete process.env.GAMELIB_STEAM_POLLS
  else process.env.GAMELIB_STEAM_POLLS = prevPollsImpl
})
