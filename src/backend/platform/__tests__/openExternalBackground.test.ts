import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import { shouldOpenInBackground, spawnOpenDetached } from '../openDetached'
import { bindTransport, shell } from 'backend/platform'

jest.mock('child_process')

const spawnMock = spawn as unknown as jest.Mock
const URL_OFF = 'steam://open/gooffline'

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { unref: jest.Mock }
  child.unref = jest.fn()
  return child
}

const realPlatform = process.platform
function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', { value })
}

beforeEach(() => {
  spawnMock.mockReset()
  spawnMock.mockImplementation(() => fakeChild())
})
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

describe('spawnOpenDetached', () => {
  it('spawns open -g detached with no env, unrefs, and reports errors', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const onError = jest.fn()
    spawnOpenDetached(URL_OFF, onError)
    expect(spawnMock).toHaveBeenCalledWith('/usr/bin/open', ['-g', URL_OFF], {
      detached: true,
      stdio: 'ignore'
    })
    expect(spawnMock.mock.calls[0][2]).not.toHaveProperty('env')
    expect(child.unref).toHaveBeenCalled()
    child.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }))
    expect(onError).toHaveBeenCalledWith('ENOENT')
    child.emit('error', new Error('y'))
    expect(onError).toHaveBeenCalledWith('error')
  })
  it('does not throw without onError', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    spawnOpenDetached(URL_OFF)
    expect(() => child.emit('error', new Error('z'))).not.toThrow()
  })
})

describe('shell.openExternal background branch', () => {
  const transport = { openExternal: jest.fn(), pushFrontendMessage: jest.fn() }
  beforeEach(() => {
    transport.openExternal.mockReset()
    bindTransport(transport)
  })

  it('darwin + activate:false + steam -> detached open, no frame', async () => {
    setPlatform('darwin')
    await shell.openExternal(URL_OFF, { activate: false })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock.mock.calls[0].slice(0, 2)).toEqual([
      '/usr/bin/open',
      ['-g', URL_OFF]
    ])
    expect(transport.openExternal).not.toHaveBeenCalled()
  })
  it.each([[undefined], [{ activate: true }]])(
    'darwin options %p -> frame',
    async (o) => {
      setPlatform('darwin')
      await shell.openExternal(URL_OFF, o)
      expect(transport.openExternal).toHaveBeenCalledWith(URL_OFF)
      expect(spawnMock).not.toHaveBeenCalled()
    }
  )
  it('darwin non-steam -> frame', async () => {
    setPlatform('darwin')
    await shell.openExternal('https://example.com', { activate: false })
    expect(transport.openExternal).toHaveBeenCalled()
    expect(spawnMock).not.toHaveBeenCalled()
  })
  it.each([['linux'], ['win32']])('%s -> frame', async (p) => {
    setPlatform(p)
    await shell.openExternal(URL_OFF, { activate: false })
    expect(transport.openExternal).toHaveBeenCalled()
    expect(spawnMock).not.toHaveBeenCalled()
  })
  it('unbound transport -> no-op', async () => {
    setPlatform('darwin')
    await jest.isolateModulesAsync(async () => {
      const fresh = await import('backend/platform')
      await fresh.shell.openExternal(URL_OFF, { activate: false })
    })
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
