import { createNotifications } from '../notifications'
import type { RequestRustInvoke } from '../index'
import {
  RUST_NOTIFICATION_AUTH_DENIED_PREFIX,
  RUST_NOTIFICATION_SHOW
} from 'common/types/sidecarTransport'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
let warn: jest.SpyInstance
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

const build = (invoke: jest.Mock) =>
  createNotifications({
    requestRustInvoke: invoke as unknown as RequestRustInvoke
  })

describe('notifications.show', () => {
  it('invokes with title/body and reports the backend to onShown', async () => {
    const invoke = jest.fn(() => Promise.resolve('portal'))
    const onShown = jest.fn()
    build(invoke).show({ title: 't', body: 'b' }, { onShown })
    await flush()
    expect(invoke).toHaveBeenCalledWith(RUST_NOTIFICATION_SHOW, [
      { title: 't', body: 'b' }
    ])
    expect(onShown).toHaveBeenCalledWith('portal')
  })

  it('reports a rejection to onFailed', async () => {
    const onFailed = jest.fn()
    build(jest.fn(() => Promise.reject(new Error('denied')))).show(
      { title: 't' },
      { onFailed }
    )
    await flush()
    expect(onFailed).toHaveBeenCalledWith('denied')
  })

  it('reports a permission denial once per instance, other failures every time', async () => {
    const denied = () =>
      jest.fn(() =>
        Promise.reject(new Error(`${RUST_NOTIFICATION_AUTH_DENIED_PREFIX} x`))
      )
    const first = build(denied())
    const onFailed = jest.fn()
    first.show({ title: 'a' }, { onFailed })
    first.show({ title: 'b' }, { onFailed })
    await flush()
    expect(onFailed).toHaveBeenCalledTimes(1)

    // A second instance (another boot) has its own flag.
    const second = build(denied())
    second.show({ title: 'c' }, { onFailed })
    await flush()
    expect(onFailed).toHaveBeenCalledTimes(2)

    const other = jest.fn()
    const broken = build(jest.fn(() => Promise.reject(new Error('boom'))))
    broken.show({}, { onFailed: other })
    broken.show({}, { onFailed: other })
    await flush()
    expect(other).toHaveBeenCalledTimes(2)
  })

  it('catches and warns about a throwing callback', async () => {
    const shown = jest.fn(() => {
      throw new Error('cb')
    })
    build(jest.fn(() => Promise.resolve(null))).show({}, { onShown: shown })
    await flush()
    expect(shown).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    const failed = jest.fn(() => {
      throw new Error('cb2')
    })
    build(jest.fn(() => Promise.reject(new Error('x')))).show(
      {},
      { onFailed: failed }
    )
    await flush()
    expect(failed).toHaveBeenCalled()
  })

  it('works without callbacks', async () => {
    expect(() =>
      build(jest.fn(() => Promise.reject(new Error('x')))).show({})
    ).not.toThrow()
    await flush()
  })
})
