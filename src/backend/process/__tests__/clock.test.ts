import { createClock } from '../clock'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('createClock', () => {
  it('fires a timeout', async () => {
    const clock = createClock()
    const fn = jest.fn()
    clock.setTimeout(fn, 10)
    await wait(60)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not fire a cleared timeout', async () => {
    const clock = createClock()
    const fn = jest.fn()
    const h = clock.setTimeout(fn, 10)
    clock.clear(h)
    await wait(50)
    expect(fn).not.toHaveBeenCalled()
  })

  it('unrefs by default and refs with keepAlive', () => {
    const spy = jest.spyOn(global, 'setTimeout')
    const clock = createClock()
    const a = clock.setTimeout(() => undefined, 1000)
    const b = clock.setTimeout(() => undefined, 1000, {
      keepAlive: { reason: 'game session must outlive stdin' }
    })
    const timers = spy.mock.results.map((r) => r.value as NodeJS.Timeout)
    const [ta, tb] = timers.slice(-2)
    expect(ta?.hasRef()).toBe(false)
    expect(tb?.hasRef()).toBe(true)
    clock.clear(a)
    clock.clear(b)
    spy.mockRestore()
  })

  it('rejects keepAlive with an empty reason', () => {
    const clock = createClock()
    expect(() =>
      clock.setTimeout(() => undefined, 10, { keepAlive: { reason: '' } })
    ).toThrow(/reason/)
    expect(() =>
      clock.setInterval(() => undefined, 10, { keepAlive: { reason: '   ' } })
    ).toThrow(TypeError)
  })

  it('repeats an interval until cleared; clear of unknown handle is a no-op', async () => {
    const clock = createClock()
    const fn = jest.fn()
    const h = clock.setInterval(fn, 10)
    await wait(80)
    clock.clear(h)
    const n = fn.mock.calls.length
    expect(n).toBeGreaterThanOrEqual(2)
    await wait(50)
    expect(fn.mock.calls.length).toBe(n)
    expect(() => clock.clear(h)).not.toThrow()
    expect(() => clock.clear({ id: 9999 })).not.toThrow()
  })

  it('now() tracks Date.now()', () => {
    expect(Math.abs(createClock().now() - Date.now())).toBeLessThan(50)
  })
})
