import { createDialogs } from '../dialogs'
import type { RequestRustInvoke } from '../index'
import {
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE
} from 'common/types/sidecarTransport'

function build(invoke: jest.Mock) {
  const order: string[] = []
  const raise = jest.fn(() => order.push('raise'))
  const wrapped = jest.fn((...args: unknown[]) => {
    order.push('invoke')
    return invoke(...args)
  })
  return {
    order,
    raise,
    invoke: wrapped,
    dialogs: createDialogs({
      requestRustInvoke: wrapped as unknown as RequestRustInvoke,
      raiseMainWindowIfHiddenByGameLib: raise
    })
  }
}

let warn: jest.SpyInstance
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

const reject = () => jest.fn(() => Promise.reject(new Error('boom')))

describe('showErrorBox', () => {
  it('raises first, forwards an error-kind message', async () => {
    const t = build(jest.fn(() => Promise.resolve(null)))
    await t.dialogs.showErrorBox('t', 'c')
    expect(t.order).toEqual(['raise', 'invoke'])
    expect(t.invoke).toHaveBeenCalledWith(RUST_DIALOG_MESSAGE, [
      { message: 'c', title: 't', kind: 'error' }
    ])
  })

  it('swallows a rejected invoke', async () => {
    const t = build(reject())
    await expect(t.dialogs.showErrorBox('t', 'c')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('showMessageBox', () => {
  it('raises first and returns the clicked index', async () => {
    const t = build(jest.fn(() => Promise.resolve(1)))
    const result = await t.dialogs.showMessageBox({
      message: 'm',
      buttons: ['a', 'b']
    })
    expect(t.order[0]).toBe('raise')
    expect(result).toEqual({ response: 1, checkboxChecked: false })
  })

  it('folds detail into the message', async () => {
    const t = build(jest.fn(() => Promise.resolve(0)))
    await t.dialogs.showMessageBox({ message: 'm', detail: 'd' })
    expect(
      (t.invoke.mock.calls[0]?.[1] as Array<{ message: string }>)[0]?.message
    ).toBe('m\n\nd')
  })

  it("resolves the caller's cancelId when the invoke rejects", async () => {
    const t = build(reject())
    await expect(
      t.dialogs.showMessageBox({
        message: 'm',
        buttons: ['Yes', 'No'],
        cancelId: 0
      })
    ).resolves.toEqual({ response: 0, checkboxChecked: false })
  })

  it('falls back to the last index without a cancelId, and on dismissal', async () => {
    const rejected = build(reject())
    await expect(
      rejected.dialogs.showMessageBox({ message: 'm', buttons: ['a', 'b'] })
    ).resolves.toMatchObject({ response: 1 })
    const dismissed = build(jest.fn(() => Promise.resolve(null)))
    await expect(
      dismissed.dialogs.showMessageBox({
        message: 'm',
        buttons: ['a', 'b'],
        cancelId: 0
      })
    ).resolves.toMatchObject({ response: 0 })
  })
})

describe('showOpenDialog / showSaveDialog', () => {
  it('open: a string result is a pick, null is a cancel', async () => {
    const pick = build(jest.fn(() => Promise.resolve('/x')))
    await expect(pick.dialogs.showOpenDialog({})).resolves.toEqual({
      canceled: false,
      filePaths: ['/x']
    })
    expect(pick.invoke).toHaveBeenCalledWith(RUST_DIALOG_OPEN, [{}])
    const cancel = build(jest.fn(() => Promise.resolve(null)))
    await expect(cancel.dialogs.showOpenDialog({})).resolves.toEqual({
      canceled: true,
      filePaths: []
    })
  })

  it('open: resolves a cancel on rejection', async () => {
    const t = build(reject())
    await expect(t.dialogs.showOpenDialog({})).resolves.toEqual({
      canceled: true,
      filePaths: []
    })
  })

  it('save: forwards and resolves a cancel on rejection', async () => {
    const pick = build(jest.fn(() => Promise.resolve('/y')))
    await expect(pick.dialogs.showSaveDialog({})).resolves.toEqual({
      canceled: false,
      filePath: '/y'
    })
    expect(pick.invoke).toHaveBeenCalledWith(RUST_DIALOG_SAVE, [{}])
    const failed = build(reject())
    await expect(failed.dialogs.showSaveDialog({})).resolves.toEqual({
      canceled: true,
      filePath: undefined
    })
  })
})
