import {
  singleFlightLaunch,
  resetLaunchSingleFlightForTests
} from '../launchSingleFlight'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('singleFlightLaunch', () => {
  beforeEach(() => resetLaunchSingleFlightForTests())

  it('joins a concurrent same-key call: run once, onJoin once, same result', async () => {
    const d = deferred<string>()
    const run = jest.fn(() => d.promise)
    const onJoin = jest.fn()
    const a = singleFlightLaunch('steam', '1', onJoin, run)
    const b = singleFlightLaunch('steam', '1', onJoin, run)
    d.resolve('ok')
    await expect(a).resolves.toBe('ok')
    await expect(b).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(1)
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it('does not join a different appName or runner', async () => {
    const run = jest.fn(() => Promise.resolve(true))
    const onJoin = jest.fn()
    const d = deferred<boolean>()
    const hold = jest.fn(() => d.promise)
    singleFlightLaunch('steam', '1', onJoin, hold)
    await singleFlightLaunch('steam', '2', onJoin, run)
    await singleFlightLaunch('gog', '1', onJoin, run)
    expect(run).toHaveBeenCalledTimes(2)
    expect(onJoin).not.toHaveBeenCalled()
    d.resolve(true)
  })

  it('releases after settle so a later call runs again', async () => {
    const run = jest.fn(() => Promise.resolve(1))
    await singleFlightLaunch('steam', '1', jest.fn(), run)
    await new Promise(setImmediate)
    await singleFlightLaunch('steam', '1', jest.fn(), run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('owner rejection rejects both callers and releases', async () => {
    const d = deferred<string>()
    const run = jest.fn(() => d.promise)
    const a = singleFlightLaunch('steam', '1', jest.fn(), run)
    const b = singleFlightLaunch('steam', '1', jest.fn(), run)
    d.reject(new Error('boom'))
    await expect(a).rejects.toThrow('boom')
    await expect(b).rejects.toThrow('boom')
    await new Promise(setImmediate)
    const run2 = jest.fn(() => Promise.resolve('again'))
    await expect(
      singleFlightLaunch('steam', '1', jest.fn(), run2)
    ).resolves.toBe('again')
  })

  it('a throwing onJoin does not reject the joiner', async () => {
    const d = deferred<string>()
    const run = jest.fn(() => d.promise)
    singleFlightLaunch('steam', '1', jest.fn(), run)
    const b = singleFlightLaunch(
      'steam',
      '1',
      () => {
        throw new Error('notify failed')
      },
      run
    )
    d.resolve('ok')
    await expect(b).resolves.toBe('ok')
  })
})
