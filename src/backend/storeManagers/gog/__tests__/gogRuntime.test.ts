/**
 * 66.4-10: the GOG runtime holds per-instance state. Two runtimes share no library entry, installed
 * game, baseline, credential or stub; credential reads are single-flight with a TTL on the injected
 * clock; the presence keep-alive arms once per runtime on the clock and clears on demand.
 */
import { createFakeClock } from 'backend/testUtils/fakeClock'
import type { GameInfo, InstalledInfo } from 'common/types'
import { createGogRuntime } from '../gogRuntime'

const GOG_PRESENCE_INTERVAL_MS = 5 * 60 * 1000

// Fabricated credentials -- no real token, no real GOG account.
const CREDS = {
  access_token: 't1',
  refresh_token: 'r1',
  user_id: 'u1',
  expires_in: 3600,
  token_type: 'bearer',
  scope: '',
  session_id: 's1',
  loginType: 1
}

function make() {
  const clock = createFakeClock()
  return { clock, rt: createGogRuntime({ clock }) }
}

describe('createGogRuntime', () => {
  it('arms no timer at construction', () => {
    const { clock } = make()
    expect(clock.pendingCount()).toBe(0)
  })

  it('two runtimes share no library entries, installed games, baselines or stubs', async () => {
    const a = make().rt
    const b = make().rt
    a.libraryState.library.set('1', { app_name: '1' } as GameInfo)
    a.libraryState.installedGames.set('1', { appName: '1' } as InstalledInfo)
    expect(b.libraryState.library.size).toBe(0)
    expect(b.libraryState.installedGames.size).toBe(0)

    a.resumeBaselines.resumeAdjustedPercent('g', {
      percent: 1,
      done: 10,
      total: 100
    })
    expect(
      b.resumeBaselines.resumeAdjustedPercent('g', {
        percent: 5,
        done: 0,
        total: 50
      })
    ).toBe(5)

    a.stubs.set([{ commandParts: ['x'], stdout: 'custom' }])
    expect((await a.stubs.run(['x'])).stdout).toBe('custom')
    expect((await b.stubs.run(['x'])).stdout).toBe('')

    a.credentials.put(CREDS)
    expect(b.credentials.getFresh()).toBeUndefined()
  })

  describe('stub slot', () => {
    it('starts with the default --version stub; set replaces and reset restores it', async () => {
      const { rt } = make()
      expect((await rt.stubs.run(['--version'])).stdout).toBe('0.7.1')
      rt.stubs.set([{ commandParts: ['--version'], stdout: '9.9.9' }])
      expect((await rt.stubs.run(['--version'])).stdout).toBe('9.9.9')
      rt.stubs.reset()
      expect((await rt.stubs.run(['--version'])).stdout).toBe('0.7.1')
    })
  })

  describe('credential cache', () => {
    it('concurrent reads trigger one fetch', async () => {
      const { rt } = make()
      let release!: (v: string) => void
      const fetcher = jest.fn(
        () => new Promise<string>((resolve) => (release = resolve))
      )
      const first = rt.credentials.singleFlight(
        fetcher as never
      ) as Promise<unknown>
      const second = rt.credentials.singleFlight(
        fetcher as never
      ) as Promise<unknown>
      release('done')
      await expect(first).resolves.toBe('done')
      await expect(second).resolves.toBe('done')
      expect(fetcher).toHaveBeenCalledTimes(1)
      // The slot is free again afterwards.
      await rt.credentials.singleFlight((() => Promise.resolve('x')) as never)
    })

    it('serves the cached value inside its window and refetches after it', () => {
      const { clock, rt } = make()
      rt.credentials.put(CREDS)
      clock.advance(3600 * 1000 - 60_000 - 1)
      expect(rt.credentials.getFresh()).toBe(CREDS)
      clock.advance(2)
      expect(rt.credentials.getFresh()).toBeUndefined()
    })

    it('clear drops the cached value', () => {
      const { rt } = make()
      rt.credentials.put(CREDS)
      rt.credentials.clear()
      expect(rt.credentials.getFresh()).toBeUndefined()
    })
  })

  describe('presence keep-alive', () => {
    it('arms one interval, ignores a second arm, fires on the clock and clears with no pending timer', () => {
      const { clock, rt } = make()
      const tick = jest.fn()
      expect(rt.presence.armKeepAlive(tick)).toBe(true)
      expect(rt.presence.armKeepAlive(tick)).toBe(false)
      expect(clock.pendingCount()).toBe(1)
      clock.assertNoKeepAlive()

      clock.advance(GOG_PRESENCE_INTERVAL_MS)
      expect(tick).toHaveBeenCalledTimes(1)

      rt.presence.clearKeepAlive()
      expect(clock.pendingCount()).toBe(0)
      // Cleared means the next arm re-arms.
      expect(rt.presence.armKeepAlive(tick)).toBe(true)
    })

    it('tracks the current game per runtime', () => {
      const a = make().rt
      const b = make().rt
      a.presence.setCurrentGame('g1')
      expect(a.presence.getCurrentGame()).toBe('g1')
      expect(b.presence.getCurrentGame()).toBe('')
    })
  })
})
