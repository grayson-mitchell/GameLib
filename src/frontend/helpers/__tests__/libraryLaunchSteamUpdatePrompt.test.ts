import type { DialogModalOptions } from 'frontend/types'
import type { Runner } from 'common/types'

jest.mock('../index', () => ({ getGameInfo: jest.fn() }))

const launchApi = jest.fn()
const requestGameSettings = jest.fn()

let launch: (typeof import('../library'))['launch']

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
})

const t = ((_key: string, def?: string) => def ?? _key) as never

function run(runner: Runner) {
  const showDialogModal = jest.fn<void, [DialogModalOptions]>()
  const result = launch({
    appName: 'app1',
    t,
    runner,
    hasUpdate: true,
    showDialogModal,
    launchArguments: { type: 'basic', name: 'x' } as never
  })
  return { showDialogModal, result }
}

describe('launch update prompt', () => {
  it('never shows the inherited update prompt for a steam game', async () => {
    const { showDialogModal, result } = run('steam')
    expect(await result).toEqual({ status: 'done' })
    expect(showDialogModal).not.toHaveBeenCalled()
    expect(launchApi).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'app1', skipVersionCheck: true })
    )
    expect(requestGameSettings).not.toHaveBeenCalled()
  })

  it('still shows the update prompt for other runners', () => {
    const { showDialogModal } = run('legendary')
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      expect(showDialogModal).toHaveBeenCalledTimes(1)
      expect(showDialogModal.mock.calls[0]?.[0].title).toBe(
        'gamepage:box.update.title'
      )
    })
  })
})
