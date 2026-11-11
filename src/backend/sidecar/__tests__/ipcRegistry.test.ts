import {
  createIpcRegistry,
  handleTyped,
  onTestOnly,
  onTyped
} from '../ipcRegistry'

describe('createIpcRegistry', () => {
  it('registers, reads and removes a handler', () => {
    const ipc = createIpcRegistry()
    const handler = jest.fn()
    ipc.handle('a', handler)
    expect(ipc.getHandler('a')).toBe(handler)
    expect(ipc.has('a')).toBe(true)
    ipc.removeHandler('a')
    expect(ipc.getHandler('a')).toBeUndefined()
  })

  it('appends listeners in order and returns [] for an unknown channel', () => {
    const ipc = createIpcRegistry()
    const one = jest.fn()
    const two = jest.fn()
    ipc.on('ch', one)
    ipc.on('ch', two)
    expect(ipc.getListeners('ch')).toEqual([one, two])
    expect(ipc.getListeners('unknown')).toEqual([])
  })

  it('once runs exactly once and is then removed', () => {
    const ipc = createIpcRegistry()
    const listener = jest.fn()
    const other = jest.fn()
    ipc.once('ch', listener)
    ipc.on('ch', other)
    for (const l of [...ipc.getListeners('ch')]) l(undefined, 1)
    for (const l of [...ipc.getListeners('ch')]) l(undefined, 2)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(undefined, 1)
    expect(other).toHaveBeenCalledTimes(2)
  })

  it('two registries never share a handler or a listener', () => {
    const first = createIpcRegistry()
    const second = createIpcRegistry()
    first.handle('a', jest.fn())
    first.on('b', jest.fn())
    expect(second.getHandler('a')).toBeUndefined()
    expect(second.getListeners('b')).toEqual([])
    expect(second.has('a')).toBe(false)
  })

  it('removeAllListeners drops a channel and the maps expose live views', () => {
    const ipc = createIpcRegistry()
    ipc.on('ch', jest.fn())
    ipc.handle('h', jest.fn())
    expect([...ipc.listenerMap().keys()]).toEqual(['ch'])
    expect([...ipc.handlerMap().keys()]).toEqual(['h'])
    ipc.removeAllListeners('ch')
    expect(ipc.getListeners('ch')).toEqual([])
  })
})

describe('typed helpers', () => {
  it('handleTyped registers on the registry passed in', () => {
    const ipc = createIpcRegistry()
    const handler = jest.fn()
    handleTyped(ipc, 'get-connectivity-status', handler as never)
    expect(ipc.getHandler('get-connectivity-status')).toBeDefined()
  })

  it('onTyped registers a listener', () => {
    const ipc = createIpcRegistry()
    onTyped(ipc, 'quit', jest.fn())
    expect(ipc.getListeners('quit')).toHaveLength(1)
  })

  it('onTestOnly registers only when the passed env has CI === e2e', () => {
    const ipc = createIpcRegistry()
    onTestOnly(ipc, { CI: 'true' }, 'setSetting' as never, jest.fn())
    expect(ipc.getListeners('setSetting')).toEqual([])
    onTestOnly(ipc, { CI: 'e2e' }, 'setSetting' as never, jest.fn())
    expect(ipc.getListeners('setSetting')).toHaveLength(1)
  })
})
