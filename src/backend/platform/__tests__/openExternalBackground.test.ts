import { shouldOpenInBackground } from '../openDetached'
import { bindTransport, shell } from 'backend/platform'

const URL_OFF = 'steam://open/gooffline'

const realPlatform = process.platform
function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', { value })
}

afterEach(() => setPlatform(realPlatform))

describe('shouldOpenInBackground', () => {
  it('admits darwin + activate:false + steam scheme', () => {
    expect(shouldOpenInBackground('darwin', URL_OFF, { activate: false })).toBe(
      true
    )
    expect(
      shouldOpenInBackground('darwin', 'STEAM://open/main', { activate: false })
    ).toBe(true)
  })
  it('rejects other platforms', () => {
    expect(shouldOpenInBackground('linux', URL_OFF, { activate: false })).toBe(
      false
    )
    expect(shouldOpenInBackground('win32', URL_OFF, { activate: false })).toBe(
      false
    )
  })
  it('requires strict activate === false', () => {
    for (const o of [
      undefined,
      {},
      { activate: true },
      { activate: 'false' }
    ]) {
      expect(shouldOpenInBackground('darwin', URL_OFF, o)).toBe(false)
    }
  })
  it('rejects non-steam schemes and colon-less input', () => {
    expect(
      shouldOpenInBackground('darwin', 'https://store.steampowered.com', {
        activate: false
      })
    ).toBe(false)
    expect(shouldOpenInBackground('darwin', 'steam', { activate: false })).toBe(
      false
    )
  })
})

describe('shell.openExternal background branch', () => {
  const transport = {
    openExternal: jest.fn(),
    pushFrontendMessage: jest.fn(),
    openDetached: jest.fn(),
    runSync: jest.fn()
  }
  beforeEach(() => {
    transport.openExternal.mockReset()
    transport.openDetached.mockReset()
    bindTransport(transport)
  })

  it('darwin + activate:false + steam -> detached open, no frame', async () => {
    setPlatform('darwin')
    await shell.openExternal(URL_OFF, { activate: false })
    expect(transport.openDetached).toHaveBeenCalledTimes(1)
    expect(transport.openDetached.mock.calls[0]?.[0]).toBe(URL_OFF)
    expect(transport.openExternal).not.toHaveBeenCalled()
  })
  it.each([[undefined], [{ activate: true }]])(
    'darwin options %p -> frame',
    async (o) => {
      setPlatform('darwin')
      await shell.openExternal(URL_OFF, o)
      expect(transport.openExternal).toHaveBeenCalledWith(URL_OFF)
      expect(transport.openDetached).not.toHaveBeenCalled()
    }
  )
  it('darwin non-steam -> frame', async () => {
    setPlatform('darwin')
    await shell.openExternal('https://example.com', { activate: false })
    expect(transport.openExternal).toHaveBeenCalled()
    expect(transport.openDetached).not.toHaveBeenCalled()
  })
  it.each([['linux'], ['win32']])('%s -> frame', async (p) => {
    setPlatform(p)
    await shell.openExternal(URL_OFF, { activate: false })
    expect(transport.openExternal).toHaveBeenCalled()
    expect(transport.openDetached).not.toHaveBeenCalled()
  })
  it('unbound transport -> no-op', async () => {
    setPlatform('darwin')
    await jest.isolateModulesAsync(async () => {
      const fresh = await import('backend/platform')
      await fresh.shell.openExternal(URL_OFF, { activate: false })
    })
    expect(transport.openDetached).not.toHaveBeenCalled()
  })
})
