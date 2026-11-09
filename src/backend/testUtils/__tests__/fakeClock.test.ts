import { createFakeClock } from '../fakeClock'
import { createCaptureLog } from '../captureLog'

describe('createFakeClock', () => {
  it('fires a timeout only once its time has been advanced', () => {
    const clock = createFakeClock()
    const fn = jest.fn()
    clock.setTimeout(fn, 100)
    clock.advance(99)
    expect(fn).not.toHaveBeenCalled()
    clock.advance(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(clock.now()).toBe(100)
  })

  it('fires an interval floor(t/interval) times and clear stops it', () => {
    const clock = createFakeClock()
    const fn = jest.fn()
    const h = clock.setInterval(fn, 10)
    clock.advance(35)
    expect(fn).toHaveBeenCalledTimes(3)
    clock.clear(h)
    clock.advance(100)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('runAll fires pending timeouts and one tick of each interval', () => {
    const clock = createFakeClock()
    const t = jest.fn()
    const i = jest.fn()
    clock.setTimeout(t, 5000)
    clock.setInterval(i, 10)
    clock.runAll()
    expect(t).toHaveBeenCalledTimes(1)
    expect(i).toHaveBeenCalledTimes(1)
    expect(clock.pendingCount()).toBe(0)
  })

  it('rejects keepAlive without a reason', () => {
    const clock = createFakeClock()
    expect(() =>
      clock.setTimeout(() => undefined, 1, { keepAlive: { reason: ' ' } })
    ).toThrow(TypeError)
  })

  it('assertNoKeepAlive lists reasons of pending keepAlive timers', () => {
    const clock = createFakeClock()
    clock.setTimeout(() => undefined, 1, { keepAlive: { reason: 'because' } })
    expect(clock.keepAliveReasons()).toEqual(['because'])
    expect(() => clock.assertNoKeepAlive()).toThrow('because')
    clock.advance(1)
    expect(() => clock.assertNoKeepAlive()).not.toThrow()
  })
})

describe('createCaptureLog', () => {
  it('records lines in call order', () => {
    const log = createCaptureLog()
    log.info('a')
    log.warn('b')
    log.error('c')
    expect(log.lines).toEqual([
      { level: 'info', msg: 'a' },
      { level: 'warn', msg: 'b' },
      { level: 'error', msg: 'c' }
    ])
  })
})
