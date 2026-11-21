import { yieldUntil } from '../yieldUntil'

/** This file's own real clock, captured at load before any test installs fake timers. On jest 29.7
 * the live performance.now freezes once fake timers are installed, so the elapsed-time assertions
 * below read this reference instead. Every elapsed assertion is a lower bound: the only upper
 * bound is jest's per-test timeout, so CPU load cannot flake these tests. */
const realNow = performance.now.bind(performance)
const realSetTimeout = setTimeout

describe('yieldUntil', () => {
  it('returns at once when done() already holds, calling it exactly once', async () => {
    const done = jest.fn(() => true)

    await yieldUntil(done)

    expect(done).toHaveBeenCalledTimes(1)
  })

  it('resolves rather than rejects once the deadline passes with a condition that never holds', async () => {
    const start = realNow()

    await expect(yieldUntil(() => false, 50)).resolves.toBeUndefined()

    expect(realNow() - start).toBeGreaterThanOrEqual(50)
  })

  it('still expires on real elapsed time while fake timers are installed with setImmediate left real', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
    try {
      const start = realNow()

      await yieldUntil(() => false, 50)

      expect(realNow() - start).toBeGreaterThanOrEqual(50)
    } finally {
      jest.useRealTimers()
    }
  })

  it('sees a condition flipped by a real timer well past the old turn-counted window', async () => {
    let flipped = false
    realSetTimeout(() => {
      flipped = true
    }, 250)

    await yieldUntil(() => flipped)

    expect(flipped).toBe(true)
  })
})
