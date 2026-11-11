import { createOpenExternal } from '../openExternal'
import type { RequestRustInvoke } from '../index'
import {
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER
} from 'common/types/sidecarTransport'

const URL_OFF = 'steam://open/gooffline'
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function build(platform: NodeJS.Platform, invoke?: jest.Mock) {
  const requestOpenExternal = jest.fn()
  const openDetached = jest.fn()
  const requestRustInvoke = (invoke ??
    jest.fn(() => Promise.resolve(null))) as unknown as RequestRustInvoke
  return {
    requestOpenExternal,
    openDetached,
    requestRustInvoke,
    service: createOpenExternal({
      platform,
      requestOpenExternal,
      openDetached,
      requestRustInvoke
    })
  }
}

describe('openExternal background branch', () => {
  it('darwin + activate:false + steam -> detached open, no frame', async () => {
    const t = build('darwin')
    await t.service.openExternal(URL_OFF, { activate: false })
    expect(t.openDetached).toHaveBeenCalledTimes(1)
    expect(t.openDetached.mock.calls[0]?.[0]).toBe(URL_OFF)
    expect(t.requestOpenExternal).not.toHaveBeenCalled()
  })

  it('the detached open error callback only warns', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const t = build('darwin')
    await t.service.openExternal(URL_OFF, { activate: false })
    expect(() => t.openDetached.mock.calls[0]?.[1]('ENOENT')).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it.each([[undefined], [{ activate: true }]])(
    'darwin options %p -> frame',
    async (options) => {
      const t = build('darwin')
      await t.service.openExternal(URL_OFF, options)
      expect(t.requestOpenExternal).toHaveBeenCalledWith(URL_OFF)
      expect(t.openDetached).not.toHaveBeenCalled()
    }
  )

  it('darwin non-steam -> frame', async () => {
    const t = build('darwin')
    await t.service.openExternal('https://example.com', { activate: false })
    expect(t.requestOpenExternal).toHaveBeenCalled()
    expect(t.openDetached).not.toHaveBeenCalled()
  })

  it.each([['linux'], ['win32']] as const)('%s -> frame', async (platform) => {
    const t = build(platform)
    await t.service.openExternal(URL_OFF, { activate: false })
    expect(t.requestOpenExternal).toHaveBeenCalled()
    expect(t.openDetached).not.toHaveBeenCalled()
  })
})

describe('openPath / showItemInFolder', () => {
  let warn: jest.SpyInstance
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warn.mockRestore())

  it('openPath forwards and resolves an empty string', async () => {
    const invoke = jest.fn(() => Promise.resolve(null))
    const t = build('linux', invoke)
    await expect(t.service.openPath('/tmp/x')).resolves.toBe('')
    expect(invoke).toHaveBeenCalledWith(RUST_SHELL_OPEN_PATH, ['/tmp/x'])
  })

  it('openPath resolves the error text and never rejects', async () => {
    const t = build(
      'linux',
      jest.fn(() => Promise.reject(new Error('nope')))
    )
    await expect(t.service.openPath('/tmp/x')).resolves.toBe('nope')
    expect(warn).toHaveBeenCalled()
  })

  it('showItemInFolder forwards and swallows a rejection', async () => {
    const invoke = jest.fn(() => Promise.reject(new Error('boom')))
    const t = build('linux', invoke)
    expect(() => t.service.showItemInFolder('/tmp/x')).not.toThrow()
    await flush()
    expect(invoke).toHaveBeenCalledWith(RUST_SHELL_SHOW_ITEM_IN_FOLDER, [
      '/tmp/x'
    ])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
