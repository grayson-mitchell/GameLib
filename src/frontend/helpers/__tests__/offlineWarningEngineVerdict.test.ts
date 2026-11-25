/**
 * 87-76 (RF5): `launch()` asks the engine state before it shows the generic "might not work properly offline"
 * warning. When the engine will refuse this offline launch itself (`offlineLaunchRefused`), the warning is pointless
 * and only the engine's refusal dialog should reach the user, so the warning is skipped, one fixed line is logged
 * and the launch goes ahead. Every other answer (false, absent, a null state, a rejected read) keeps the warning.
 */
import type { DialogModalOptions } from 'frontend/types'
import type { Runner } from 'common/types'

const getGameInfo = jest.fn()
jest.mock('../index', () => ({
  getGameInfo: (...a: unknown[]) => getGameInfo(...a)
}))

const launchApi = jest.fn()
const requestGameSettings = jest.fn()
const getEngineState = jest.fn()
const logInfo = jest.fn()

let launch: (typeof import('../library'))['launch']

const SKIPPED_LINE =
  'Offline warning skipped: the engine refuses this launch offline'

beforeAll(() => {
  Object.assign(globalThis, {
    window: {
      localStorage: {
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getItem: jest.fn()
      },
      api: {
        launch: launchApi,
        requestGameSettings,
        getEngineState,
        logInfo,
        getLaunchOptions: jest.fn()
      }
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  launch = require('../library').launch
})

beforeEach(() => {
  jest.clearAllMocks()
  launchApi.mockResolvedValue({ status: 'done' })
  requestGameSettings.mockResolvedValue({ ignoreGameUpdates: false })
  getGameInfo.mockResolvedValue({ runner: 'legendary' })
})

const t = ((_key: string, def?: string) => def ?? _key) as never
const LAUNCH_ARGUMENTS = { type: 'basic', name: 'x' } as never

function run(notPlayableOffline: boolean) {
  const showDialogModal = jest.fn<void, [DialogModalOptions]>()
  const result = launch({
    appName: 'app1',
    t,
    runner: 'legendary' as Runner,
    hasUpdate: false,
    notPlayableOffline,
    showDialogModal,
    launchArguments: LAUNCH_ARGUMENTS
  })
  return { showDialogModal, result }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('the engine will refuse the offline launch', () => {
  it('shows no dialog, logs the fixed line once and launches once', async () => {
    getEngineState.mockResolvedValue({ offlineLaunchRefused: true })
    const { showDialogModal, result } = run(true)

    await expect(result).resolves.toEqual({ status: 'done' })
    expect(showDialogModal).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledTimes(1)
    expect(logInfo).toHaveBeenCalledWith(SKIPPED_LINE)
    expect(launchApi).toHaveBeenCalledTimes(1)
  })

  it('asks the engine state about this game', async () => {
    getEngineState.mockResolvedValue({ offlineLaunchRefused: true })
    await run(true).result

    expect(getEngineState).toHaveBeenCalledTimes(1)
    expect(getEngineState).toHaveBeenCalledWith({
      runner: 'legendary',
      appName: 'app1'
    })
  })
})

describe.each([
  ['offlineLaunchRefused is false', () => ({ offlineLaunchRefused: false })],
  ['offlineLaunchRefused is absent', () => ({ runner: 'legendary' })],
  ['the state is null', () => null]
])('the generic warning still shows when %s', (_name, answer) => {
  it('opens the warning and does not launch until a button is pressed', async () => {
    getEngineState.mockResolvedValue(answer())
    const { showDialogModal } = run(true)
    await flush()

    expect(showDialogModal).toHaveBeenCalledTimes(1)
    expect(showDialogModal.mock.calls[0]?.[0].title).toBe('Offline Warning')
    expect(logInfo).not.toHaveBeenCalledWith(SKIPPED_LINE)
    expect(launchApi).not.toHaveBeenCalled()
  })
})

describe('the generic warning still shows when the read fails', () => {
  it('shows it when getEngineState rejects', async () => {
    getEngineState.mockRejectedValue(new Error('sidecar down'))
    const { showDialogModal } = run(true)
    await flush()

    expect(showDialogModal).toHaveBeenCalledTimes(1)
    expect(launchApi).not.toHaveBeenCalled()
    expect(logInfo).not.toHaveBeenCalledWith(SKIPPED_LINE)
  })

  it('shows it when getEngineState throws synchronously', async () => {
    getEngineState.mockImplementation(() => {
      throw new Error('no such channel')
    })
    const { showDialogModal } = run(true)
    await flush()

    expect(showDialogModal).toHaveBeenCalledTimes(1)
    expect(launchApi).not.toHaveBeenCalled()
  })
})

describe('a game that is playable offline', () => {
  it('does not read the engine state and does not warn', async () => {
    const { showDialogModal, result } = run(false)

    await expect(result).resolves.toEqual({ status: 'done' })
    expect(getEngineState).not.toHaveBeenCalled()
    expect(showDialogModal).not.toHaveBeenCalled()
    expect(launchApi).toHaveBeenCalledTimes(1)
  })
})
