import type { DialogModalOptions } from 'frontend/types'
import type { InstallProgress, Runner } from 'common/types'

jest.mock('../index', () => ({ getGameInfo: jest.fn() }))

const setItem = jest.fn()
const removeItem = jest.fn()
const cancelDownload = jest.fn()

let handleStopInstallation: (typeof import('../library'))['handleStopInstallation']

beforeAll(() => {
  Object.assign(globalThis, {
    window: {
      localStorage: { setItem, removeItem, getItem: jest.fn() },
      api: { cancelDownload, kill: jest.fn() }
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  handleStopInstallation = require('../library').handleStopInstallation
})

beforeEach(() => jest.clearAllMocks())

const t = ((_key: string, def: string, opts?: { title?: string }) =>
  String(def).replace('{{title}}', opts?.title ?? '')) as never

const progress = { percent: '10%' } as unknown as InstallProgress

function open(runner: Runner) {
  const show = jest.fn<void, [DialogModalOptions]>()
  handleStopInstallation(
    'app1',
    '/games',
    t,
    progress,
    runner,
    show,
    'Cool Game'
  )
  expect(show).toHaveBeenCalledTimes(1)
  return show.mock.calls[0][0]
}

describe('handleStopInstallation', () => {
  test('non-steam: three verb buttons in order', () => {
    const o = open('gog')
    expect(o.title).toBe('Cancel download?')
    expect(o.message as string).toContain('Cool Game')
    expect(o.buttons?.map((b) => b.text)).toEqual([
      'Delete Files',
      'Keep Downloading',
      'Stop & Keep Files'
    ])
    expect(o.buttons?.map((b) => b.variant)).toEqual([
      'danger',
      undefined,
      'primary'
    ])
    expect(o.buttons?.[1].onClick).toBeUndefined()
  })

  test('Delete Files cancels with removal and clears progress', () => {
    open('gog').buttons?.[0].onClick?.()
    expect(cancelDownload).toHaveBeenCalledWith(true)
    expect(removeItem).toHaveBeenCalledWith('app1')
    expect(setItem).not.toHaveBeenCalled()
  })

  test('Stop & Keep Files saves progress and cancels without removal', () => {
    open('gog').buttons?.[2].onClick?.()
    expect(setItem).toHaveBeenCalledWith(
      'app1',
      JSON.stringify({ ...progress, folder: '/games' })
    )
    expect(cancelDownload).toHaveBeenCalledWith(false)
    expect(removeItem).not.toHaveBeenCalled()
  })

  test('steam: same three verb buttons as other runners', () => {
    const o = open('steam')
    expect(o.buttons?.map((b) => b.text)).toEqual([
      'Delete Files',
      'Keep Downloading',
      'Stop & Keep Files'
    ])
    expect(o.buttons?.map((b) => b.variant)).toEqual([
      'danger',
      undefined,
      'primary'
    ])
    expect(o.message as string).toContain('delete them')
    o.buttons?.[0].onClick?.()
    expect(cancelDownload).toHaveBeenCalledWith(true)
    expect(removeItem).toHaveBeenCalledWith('app1')
  })
})
