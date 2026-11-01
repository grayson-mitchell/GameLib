/**
 * The renderer's connectivity state (debug session retrying-banner-windows-launch).
 *
 * The "Retrying (Ignore)" banner is `{status:'check-online', retryIn:0}`. The renderer used
 * to apply whatever arrived last, from two sources that reach the webview by different routes
 * (a push event, and the one-time reply to its `get-connectivity-status` pull). When the pull
 * was answered during the probe and the `online` push overtook that reply, the stale reply won
 * and nothing ever corrected it: the banner stayed until the next connectivity change, which
 * never comes on a connection that is simply fine. `preload/tauriTransport.ts` documents the
 * same hazard class for the store snapshot (`changesDuringFetch`).
 */
import type { ConnectivitySnapshot } from 'common/types'
import {
  CONNECTIVITY_RESYNC_MS,
  createConnectivitySync
} from '../connectivitySync'

const snap = (
  status: ConnectivitySnapshot['status'],
  retryIn: number,
  seq: number,
  epoch = 'sidecar-A'
): ConnectivitySnapshot => ({ status, retryIn, epoch, seq })

const setup = (pullImpl?: () => Promise<ConnectivitySnapshot>) => {
  const pull = jest.fn(
    pullImpl ?? (() => Promise.resolve(snap('online', 0, 99)))
  )
  const onChange = jest.fn()
  const log = jest.fn()
  const sync = createConnectivitySync({ pull, onChange, log })
  return { sync, pull, onChange, log }
}

const lastView = (onChange: jest.Mock) => onChange.mock.calls.at(-1)?.[0]

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('ordering', () => {
  it('applies updates in the order they are newer', () => {
    const { sync, onChange } = setup()
    sync.receive(snap('check-online', 0, 1))
    sync.receive(snap('check-online', 5, 2))
    sync.receive(snap('online', 0, 3))

    expect(onChange.mock.calls.map(([view]) => view)).toEqual([
      { status: 'check-online', retryIn: 0 },
      { status: 'check-online', retryIn: 5 },
      { status: 'online', retryIn: 0 }
    ])
  })

  it('ignores a pull reply that a newer push has already overtaken', async () => {
    let answerPull!: (value: ConnectivitySnapshot) => void
    const { sync, onChange, log } = setup(
      () => new Promise((resolve) => (answerPull = resolve))
    )

    const pulled = sync.pull() // the sidecar handles it while probing: seq 2, check-online
    sync.receive(snap('online', 0, 3)) // the push that followed arrives first
    answerPull(snap('check-online', 0, 2)) // ...and the older reply lands afterwards
    await pulled

    expect(lastView(onChange)).toEqual({ status: 'online', retryIn: 0 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/stale pull/))
  })

  it('ignores a push older than what the renderer already shows', () => {
    const { sync, onChange } = setup()
    sync.receive(snap('online', 0, 7))
    sync.receive(snap('check-online', 0, 6))

    expect(lastView(onChange)).toEqual({ status: 'online', retryIn: 0 })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('applies a pull reply that is newer than every push it saw (a push was lost)', async () => {
    const { sync, onChange } = setup(() =>
      Promise.resolve(snap('online', 0, 5))
    )
    sync.receive(snap('check-online', 0, 2))
    await sync.pull()

    expect(lastView(onChange)).toEqual({ status: 'online', retryIn: 0 })
  })

  it('accepts a restarted sidecar even though its counter starts again at 1', () => {
    const { sync, onChange } = setup()
    sync.receive(snap('online', 0, 40, 'sidecar-A'))
    sync.receive(snap('check-online', 0, 1, 'sidecar-B'))

    expect(lastView(onChange)).toEqual({ status: 'check-online', retryIn: 0 })
  })

  it('does not drop an unstamped update from a sidecar that predates stamping', () => {
    const { sync, onChange } = setup()
    sync.receive({ status: 'online', retryIn: 0 } as ConnectivitySnapshot)
    sync.receive({ status: 'offline', retryIn: 0 } as ConnectivitySnapshot)

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(lastView(onChange)).toEqual({ status: 'offline', retryIn: 0 })
  })
})

describe('the resync watchdog (a message lost for any reason must not strand the banner)', () => {
  it('asks again after a quiet spell while not online, and recovers if the answer is newer', async () => {
    const { sync, onChange, pull, log } = setup(() =>
      Promise.resolve(snap('online', 0, 9))
    )
    sync.receive(snap('check-online', 0, 2)) // the 'online' push never arrives

    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS - 1)
    expect(pull).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)

    expect(pull).toHaveBeenCalledTimes(1)
    expect(lastView(onChange)).toEqual({ status: 'online', retryIn: 0 })
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/resync recovered/))

    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS * 3)
    expect(pull).toHaveBeenCalledTimes(1) // online: nothing left to watch
  })

  it('keeps watching while the sidecar genuinely is still probing', async () => {
    const { sync, pull, onChange, log } = setup(() =>
      Promise.resolve(snap('check-online', 0, 2))
    )
    sync.receive(snap('check-online', 0, 2))

    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS * 3 + 5)

    expect(pull).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenCalledTimes(1)
    // A watchdog pull that only confirms the state is not news: no log line every 20 seconds.
    expect(log).not.toHaveBeenCalled()
  })

  it('each newer update restarts the quiet spell, and online stops it', async () => {
    const { sync, pull } = setup()
    sync.receive(snap('check-online', 5, 1))
    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS - 1000)
    sync.receive(snap('check-online', 4, 2)) // a countdown tick: the sidecar is alive
    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS - 1000)
    expect(pull).not.toHaveBeenCalled()

    sync.receive(snap('online', 0, 3))
    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS * 5)
    expect(pull).not.toHaveBeenCalled()
  })

  it('logs a failing pull once, never throws, and keeps trying', async () => {
    const { sync, pull, log } = setup(() =>
      Promise.reject(new Error('sidecar closed'))
    )
    sync.receive(snap('check-online', 0, 1))

    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS * 3 + 5)

    expect(pull).toHaveBeenCalledTimes(3)
    expect(
      log.mock.calls.filter(([message]) => /pull failed/.test(message))
    ).toHaveLength(1)
  })

  it('stops for good after dispose()', async () => {
    const { sync, pull } = setup()
    sync.receive(snap('check-online', 0, 1))
    sync.dispose()

    await jest.advanceTimersByTimeAsync(CONNECTIVITY_RESYNC_MS * 5)
    expect(pull).not.toHaveBeenCalled()
  })
})
