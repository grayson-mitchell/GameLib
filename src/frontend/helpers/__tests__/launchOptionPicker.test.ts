import type { DialogModalOptions } from 'frontend/types'
import {
  reduceDialogRequest,
  type DialogQueueState
} from 'frontend/state/dialogQueue'

jest.mock('../index', () => ({ getGameInfo: jest.fn() }))

const launchApi = jest.fn()
const getLaunchOptions = jest.fn()
const requestGameSettings = jest.fn()
const options = [
  { type: 'basic', name: 'First' },
  { type: 'basic', name: 'Second' }
]

let launch: (typeof import('../library'))['launch']

beforeAll(() => {
  Object.assign(globalThis, {
    window: {
      localStorage: { setItem: jest.fn(), removeItem: jest.fn() },
      api: {
        getLaunchOptions,
        requestGameSettings,
        setSetting: jest.fn(),
        launch: launchApi
      }
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  launch = require('../library').launch
})

let state: DialogQueueState
const showDialogModal = (o: DialogModalOptions) => {
  state = reduceDialogRequest(state, o)
}

const t = ((_key: string, def: string, opts?: { seconds?: number }) =>
  String(def).replace('{{seconds}}', String(opts?.seconds ?? ''))) as never

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  launchApi.mockResolvedValue({ status: 'done' })
  getLaunchOptions.mockResolvedValue(options)
  requestGameSettings.mockResolvedValue({})
  state = { current: { showDialog: false }, queue: [] }
})
afterEach(() => jest.useRealTimers())

// What MessageBoxModal does on a button click, with DialogHandler's onClose.
function click(index: number) {
  const { current } = state
  const button = current.buttons?.[index]
  if (current.onClose) current.onClose()
  else showDialogModal({ showDialog: false, dialogKey: current.dialogKey })
  void button?.onClick?.()
}

async function startPicker() {
  void launch({
    appName: 'app1',
    t,
    runner: 'steam',
    hasUpdate: false,
    showDialogModal
  })
  await jest.advanceTimersByTimeAsync(0)
}

describe('launch-option picker', () => {
  it('CR-01: the countdown updates the open picker in place', async () => {
    await startPicker()
    const key = state.current.dialogKey
    await jest.advanceTimersByTimeAsync(3000)
    expect(state.current.showDialog).toBe(true)
    expect(state.current.title).toContain('(7s)')
    expect(state.current.dialogKey).toBe(key)
    expect(state.queue).toHaveLength(0)
  })

  it('CR-01: picking an option at 3 s launches once and leaves no picker', async () => {
    await startPicker()
    await jest.advanceTimersByTimeAsync(3000)
    click(1)
    expect(state.current.showDialog).toBe(false)
    expect(state.queue).toHaveLength(0)
    await jest.advanceTimersByTimeAsync(15000)
    expect(state.current.showDialog).toBe(false)
    expect(state.queue).toHaveLength(0)
    expect(launchApi).toHaveBeenCalledTimes(1)
    expect(launchApi.mock.calls[0][0].launchArguments).toEqual(options[1])
  })

  it('CR-01: the 10 s auto-select launches once and leaves nothing queued', async () => {
    await startPicker()
    await jest.advanceTimersByTimeAsync(10000)
    expect(launchApi).toHaveBeenCalledTimes(1)
    expect(launchApi.mock.calls[0][0].launchArguments).toEqual(options[0])
    expect(state.current.showDialog).toBe(false)
    expect(state.queue).toHaveLength(0)
    await jest.advanceTimersByTimeAsync(10000)
    expect(launchApi).toHaveBeenCalledTimes(1)
    expect(state.current.showDialog).toBe(false)
    expect(state.queue).toHaveLength(0)
  })

  it('WR-01: OK on the offline warning does not drop the next queued dialog', async () => {
    const result = launch({
      appName: 'app1',
      t,
      runner: 'steam',
      hasUpdate: false,
      notPlayableOffline: true,
      showDialogModal
    })
    showDialogModal({ title: 'Second' })
    expect(state.queue).toHaveLength(1)
    click(0)
    expect(state.current.title).toBe('Second')
    await expect(result).resolves.toEqual({ status: 'abort' })
  })
})
