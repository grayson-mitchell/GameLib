/** Phase 74 plan 09: the bridge pre-launch update gate (D-04..D-07) and the ack store (D-06). */
import { gateBridgeLaunchOnUpdate } from '../updateLaunchPrompt'
import { readUpdatePromptAck, recordUpdatePromptAck } from '../updatePromptAck'
import { detectSteamUpdates } from '../updateDetection'
import { readAcfUpdateState } from '../library/acfUpdateState'
import { notify } from 'backend/dialog/dialog'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_k: string, d: string) => d }
}))
jest.mock('backend/dialog/dialog', () => ({ notify: jest.fn() }))
jest.mock('../updateDetection', () => ({
  detectSteamUpdates: jest.fn(),
  STEAM_UPDATE_PRELAUNCH_TIMEOUT_MS: 3000
}))
jest.mock('../library/acfUpdateState', () => ({
  readAcfUpdateState: jest.fn()
}))
jest.mock('../games', () => ({ __esModule: true, default: jest.fn() }))

const APP = '1603180'

function makeStore() {
  const m = new Map<string, unknown>()
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: unknown) => void m.set(k, v)
  }
}

function setup(
  opts: {
    queued?: boolean
    queueState?: string
    inFlight?: { aborted: boolean }
    ackStore?: unknown
  } = {}
) {
  const showMessageBox = jest.fn()
  const addToQueue = jest.fn().mockResolvedValue(undefined)
  const store = opts.ackStore ?? makeStore()
  const deps = {
    steamSession: {
      gameSession: {
        nativeInstallsInFlight: new Map(
          opts.inFlight ? [[APP, opts.inFlight]] : []
        )
      }
    },
    stores: { steam: { steamUpdatePromptAckStore: store } },
    dialogs: { showMessageBox },
    getDownloadQueue: () => ({
      addToQueue,
      getQueueInformation: () => ({
        elements: opts.queued
          ? [{ type: 'update', params: { appName: APP } }]
          : [],
        state: opts.queueState ?? 'idle'
      })
    })
  }
  const game = {
    appId: APP,
    deps,
    getGameInfo: () => ({
      title: 'Game',
      runner: 'steam',
      install: { install_path: '/p', platform: 'Windows' }
    })
  }
  return {
    game: game as never,
    deps: deps as never,
    showMessageBox,
    addToQueue
  }
}

const stale = (targetBuild = '200') =>
  [{ state: 'stale', targetBuild }] as never

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(readAcfUpdateState).mockResolvedValue({ stateFlags: 4 } as never)
})

describe('gateBridgeLaunchOnUpdate', () => {
  it('launches without a dialog when current', async () => {
    const t = setup()
    jest
      .mocked(detectSteamUpdates)
      .mockResolvedValue([{ state: 'current' }] as never)
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
    expect(t.showMessageBox).not.toHaveBeenCalled()
  })

  it('launches when unknown and bounds detection to 3s with force', async () => {
    const t = setup()
    jest
      .mocked(detectSteamUpdates)
      .mockResolvedValue([{ state: 'unknown' }] as never)
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
    expect(t.showMessageBox).not.toHaveBeenCalled()
    expect(detectSteamUpdates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ force: true, timeoutMs: 3000, appIds: [APP] })
    )
  })

  it('Update now queues an update element and aborts', async () => {
    const t = setup()
    jest.mocked(detectSteamUpdates).mockResolvedValue(stale())
    t.showMessageBox.mockResolvedValue({ response: 1 })
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('abort')
    const opts = t.showMessageBox.mock.calls[0][0]
    expect(opts.buttons).toEqual([
      'Play anyway',
      'Update now',
      "Don't ask again for this build"
    ])
    expect(opts.cancelId).toBe(0)
    expect(opts.defaultId).toBe(0)
    expect(t.addToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update' })
    )
  })

  it('Play anyway launches and writes no ack', async () => {
    const t = setup()
    jest.mocked(detectSteamUpdates).mockResolvedValue(stale())
    t.showMessageBox.mockResolvedValue({ response: 0 })
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
    expect(readUpdatePromptAck(t.deps, APP)).toBeUndefined()
    expect(t.addToQueue).not.toHaveBeenCalled()
  })

  it("Don't ask again records the ack and launches", async () => {
    const t = setup()
    jest.mocked(detectSteamUpdates).mockResolvedValue(stale())
    t.showMessageBox.mockResolvedValue({ response: 2 })
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
    expect(readUpdatePromptAck(t.deps, APP)).toBe('200')
  })

  it('skips the prompt for an acknowledged build, shows it for a newer one', async () => {
    const t = setup()
    recordUpdatePromptAck(t.deps, APP, '200')
    jest.mocked(detectSteamUpdates).mockResolvedValue(stale('200'))
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
    expect(t.showMessageBox).not.toHaveBeenCalled()
    jest.mocked(detectSteamUpdates).mockResolvedValue(stale('300'))
    t.showMessageBox.mockResolvedValue({ response: 0 })
    await gateBridgeLaunchOnUpdate(t.game)
    expect(t.showMessageBox).toHaveBeenCalledTimes(1)
  })

  it.each([7, -1, 3])(
    'launches and never queues on unexpected response %i',
    async (response) => {
      const t = setup()
      jest.mocked(detectSteamUpdates).mockResolvedValue(stale())
      t.showMessageBox.mockResolvedValue({ response })
      expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
      expect(t.addToQueue).not.toHaveBeenCalled()
      expect(readUpdatePromptAck(t.deps, APP)).toBeUndefined()
    }
  )

  it('aborts with a notice while a bridge update is in flight', async () => {
    const t = setup({ inFlight: { aborted: false } })
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('abort')
    expect(notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.stringContaining('is updating') })
    )
    expect(t.showMessageBox).not.toHaveBeenCalled()
    expect(detectSteamUpdates).not.toHaveBeenCalled()
  })

  it('ignores an aborted in-flight entry', async () => {
    const t = setup({ inFlight: { aborted: true } })
    jest.mocked(detectSteamUpdates).mockResolvedValue(stale())
    t.showMessageBox.mockResolvedValue({ response: 0 })
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
  })

  it('aborts with a notice when the update waits in a running queue', async () => {
    const t = setup({ queued: true, queueState: 'running' })
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('abort')
    expect(notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('waiting in Downloads')
      })
    )
    expect(t.showMessageBox).not.toHaveBeenCalled()
  })

  it.each(['paused', 'idle', 'stopped'])(
    'prompts normally when the update is queued but the queue is %s',
    async (queueState) => {
      const t = setup({ queued: true, queueState })
      jest.mocked(detectSteamUpdates).mockResolvedValue(stale())
      t.showMessageBox.mockResolvedValue({ response: 0 })
      expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
      expect(t.showMessageBox).toHaveBeenCalledTimes(1)
    }
  )

  it('refuses to launch a half-committed tree', async () => {
    const t = setup()
    jest
      .mocked(readAcfUpdateState)
      .mockResolvedValue({ stateFlags: 1026 } as never)
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('abort')
    expect(notify).toHaveBeenCalled()
    expect(t.showMessageBox).not.toHaveBeenCalled()
  })

  it('launches when detection throws', async () => {
    const t = setup()
    jest.mocked(detectSteamUpdates).mockRejectedValue(new Error('boom'))
    expect(await gateBridgeLaunchOnUpdate(t.game)).toBe('launch')
  })
})

describe('update prompt ack store', () => {
  it('round-trips and rejects bad input', () => {
    const t = setup()
    recordUpdatePromptAck(t.deps, APP, '20000001')
    expect(readUpdatePromptAck(t.deps, APP)).toBe('20000001')
    recordUpdatePromptAck(t.deps, 'abc', '1')
    recordUpdatePromptAck(t.deps, APP, 'x1')
    expect(readUpdatePromptAck(t.deps, 'abc')).toBeUndefined()
    expect(readUpdatePromptAck(t.deps, APP)).toBe('20000001')
  })

  it('reads a corrupt stored value as undefined', () => {
    const store = makeStore()
    store.set(APP, { nope: true })
    const t = setup({ ackStore: store })
    expect(readUpdatePromptAck(t.deps, APP)).toBeUndefined()
  })
})
