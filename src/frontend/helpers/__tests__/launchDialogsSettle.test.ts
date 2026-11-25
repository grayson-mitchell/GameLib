/**
 * 87-73 (RF2): the two dialogs `launch()` opens settle its promise on every way they close.
 *
 * GamePage holds its Play-click latch (`playClicked`) until `await launch()` returns. A dialog dismissed without a
 * button (the header X, Escape) used to leave that promise pending for good, so the Play button stayed on "launching".
 * `MessageBoxModal` runs the dialog's `onClose` before a button's `onClick` in the same click, and a dialog that
 * carries its own `onClose` is closed by that `onClose` alone (DialogHandler), so the handler has to close the dialog
 * itself and must not let its abort win over the button the user pressed.
 */
import type { DialogModalOptions } from 'frontend/types'
import type { Runner } from 'common/types'

const getGameInfo = jest.fn()
jest.mock('../index', () => ({
  getGameInfo: (...a: unknown[]) => getGameInfo(...a)
}))

const launchApi = jest.fn()
const requestGameSettings = jest.fn()
const updateGameApi = jest.fn()

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
        updateGame: updateGameApi,
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

function run(extra: { hasUpdate?: boolean; notPlayableOffline?: boolean }) {
  const showDialogModal = jest.fn<void, [DialogModalOptions]>()
  const result = launch({
    appName: 'app1',
    t,
    runner: 'legendary' as Runner,
    hasUpdate: extra.hasUpdate ?? false,
    notPlayableOffline: extra.notPlayableOffline,
    showDialogModal,
    launchArguments: LAUNCH_ARGUMENTS
  })
  return { showDialogModal, result }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

/** The dialog `launch()` opened, once it has. */
async function opened(showDialogModal: jest.Mock<void, [DialogModalOptions]>) {
  await flush()
  const options = showDialogModal.mock.calls[0]?.[0]
  if (!options) throw new Error('launch() opened no dialog')
  return options
}

/** What MessageBoxModal does for a button: onClose first, then the button's own onClick, in the same tick. */
function pressButton(options: DialogModalOptions, index: number) {
  options.onClose?.()
  void options.buttons?.[index]?.onClick?.()
}

describe.each([
  ['the offline warning', { notPlayableOffline: true }, 'ok', 'playAnyway'],
  ['the update prompt', { hasUpdate: true }, 'yes', 'no']
] as const)('%s', (_name, extra, firstButton, secondButton) => {
  const index = { ok: 0, playAnyway: 1, yes: 0, no: 1 } as const

  it('carries an onClose, so a dismissal without a button reaches the launch', async () => {
    const { showDialogModal } = run(extra)
    const options = await opened(showDialogModal)
    expect(typeof options.onClose).toBe('function')
    expect(options.dialogId).toEqual(expect.any(String))
  })

  it('settles {status: abort} when closed without a button, and closes its own dialog', async () => {
    const { showDialogModal, result } = run(extra)
    const options = await opened(showDialogModal)
    options.onClose?.()

    await expect(result).resolves.toEqual({ status: 'abort' })
    expect(showDialogModal).toHaveBeenLastCalledWith({
      showDialog: false,
      dialogId: options.dialogId
    })
    expect(launchApi).not.toHaveBeenCalled()
  })

  it(`a press of the ${secondButton} button keeps its own result (onClose runs first and must not win)`, async () => {
    const { showDialogModal, result } = run(extra)
    const options = await opened(showDialogModal)
    pressButton(options, index[secondButton])

    await expect(result).resolves.toEqual({ status: 'done' })
    expect(launchApi).toHaveBeenCalledTimes(1)
  })

  it(`a press of the ${firstButton} button settles too`, async () => {
    const { showDialogModal, result } = run(extra)
    const options = await opened(showDialogModal)
    pressButton(options, index[firstButton])

    const settled = await result
    expect(['abort', 'done']).toContain(settled.status)
    expect(launchApi).not.toHaveBeenCalled()
  })
})
