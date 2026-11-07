jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('../processListing', () => ({
  ...jest.requireActual('../processListing'),
  processListing: jest.fn()
}))

import {
  deriveGameProcessPrefix,
  deriveGameProcessPrefixes,
  watchForGameProcess
} from '../gameProcessWatch'

const HOME = '/Users/u'
const INSTALL = '/Users/u/Games/Avernum 4'

function fakeTimers() {
  const pending: Array<{ fn: () => void; ms: number; unref: jest.Mock }> = []
  return {
    pending,
    setTimer: (fn: () => void, ms: number) => {
      const handle = { fn, ms, unref: jest.fn() }
      pending.push(handle)
      return handle
    },
    clearTimer: (handle: unknown) => {
      const i = pending.indexOf(handle as (typeof pending)[number])
      if (i >= 0) pending.splice(i, 1)
    },
    /** Fire the poll timer (the one that is not the long cap). */
    async firePoll() {
      const t = pending.find((p) => p.ms < 10_000)
      if (!t) throw new Error('no poll timer')
      pending.splice(pending.indexOf(t), 1)
      t.fn()
      await new Promise((r) => setImmediate(r))
    }
  }
}

describe('deriveGameProcessPrefixes', () => {
  it('builds unix, Z: and Y: forms with a trailing separator, lowercased', () => {
    expect(deriveGameProcessPrefixes(INSTALL, HOME)).toEqual([
      '/users/u/games/avernum 4/',
      'z:\\users\\u\\games\\avernum 4\\',
      'y:\\games\\avernum 4\\'
    ])
  })
  it('omits the Y: form outside the home dir and returns [] when unusable', () => {
    expect(deriveGameProcessPrefixes('/Volumes/x/G', HOME)).toHaveLength(2)
    expect(deriveGameProcessPrefixes('relative/path', HOME)).toEqual([])
    expect(deriveGameProcessPrefixes('/', HOME)).toEqual([])
  })
  it('exposes the unix form via deriveGameProcessPrefix', () => {
    expect(deriveGameProcessPrefix('/a/B')).toBe('/a/b/')
    expect(deriveGameProcessPrefix('nope')).toBeNull()
  })
})

describe('watchForGameProcess', () => {
  const make = (listings: Array<string | Error>, extra = {}) => {
    const timers = fakeTimers()
    let i = 0
    const listing = jest.fn(() => {
      const next = listings[Math.min(i++, listings.length - 1)]
      if (next instanceof Error) return Promise.reject(next)
      return Promise.resolve(next)
    })
    const onFirstMatch = jest.fn()
    const onGiveUp = jest.fn()
    const watch = watchForGameProcess({
      installPath: INSTALL,
      onFirstMatch,
      onGiveUp,
      deps: {
        processListing: listing,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        homeDir: () => HOME
      },
      ...extra
    })
    return { timers, listing, onFirstMatch, onGiveUp, watch }
  }

  it('matches on the 3rd poll, reports the pid once and stops', async () => {
    const { timers, listing, onFirstMatch, watch } = make([
      '  1 /bin/sh\n',
      '  1 /bin/sh\n',
      '  1 /bin/sh\n 4242 Y:\\Games\\Avernum 4\\Game.exe\n'
    ])
    expect(watch).not.toBeNull()
    for (let n = 0; n < 3; n++) await timers.firePoll()
    expect(onFirstMatch).toHaveBeenCalledTimes(1)
    expect(onFirstMatch).toHaveBeenCalledWith('4242')
    expect(listing).toHaveBeenCalledTimes(3)
    expect(timers.pending).toHaveLength(0)
  })

  it('matches the GPTK argument form and the Z: form', async () => {
    const gptk = make([
      ' 7 wine64-preloader /w/bin/wine64 /Users/u/Games/Avernum 4/Game.exe\n'
    ])
    await gptk.timers.firePoll()
    expect(gptk.onFirstMatch).toHaveBeenCalledWith('7')
    const z = make([' 8 Z:\\Users\\u\\Games\\Avernum 4\\Game.exe\n'])
    await z.timers.firePoll()
    expect(z.onFirstMatch).toHaveBeenCalledWith('8')
  })

  it('does not match a sibling dir or a glued longer path', async () => {
    const { timers, onFirstMatch } = make([
      ' 9 /Users/u/Games/Avernum 4 Remaster/x.exe\n' +
        ' 10 Y:\\Games\\Avernum 4 Remaster\\x.exe\n' +
        ' 11 /opt/Users/u/Games/Avernum 4/x\n'
    ])
    await timers.firePoll()
    expect(onFirstMatch).not.toHaveBeenCalled()
  })

  it('stop() before a match: no further polls, no callback', () => {
    const { timers, listing, onFirstMatch, watch } = make(['  1 x\n'])
    watch?.stop()
    expect(timers.pending).toHaveLength(0)
    expect(listing).not.toHaveBeenCalled()
    expect(onFirstMatch).not.toHaveBeenCalled()
  })

  it('gives up by itself after maxDurationMs', () => {
    const { timers, onGiveUp } = make(['  1 x\n'], { maxDurationMs: 60_000 })
    const cap = timers.pending.find((p) => p.ms === 60_000)
    cap?.fn()
    expect(onGiveUp).toHaveBeenCalledWith('max-duration')
    expect(timers.pending).toHaveLength(0)
  })

  it('unrefs every timer handle', async () => {
    const { timers } = make(['  1 x\n'])
    const handles = [...timers.pending]
    await timers.firePoll()
    handles.push(...timers.pending)
    expect(handles.length).toBeGreaterThanOrEqual(3)
    for (const h of handles) expect(h.unref).toHaveBeenCalled()
  })

  it('gives up after 20 consecutive listing failures', async () => {
    const { timers, onGiveUp, onFirstMatch } = make([new Error('EPERM')])
    for (let n = 0; n < 20; n++) await timers.firePoll()
    expect(onGiveUp).toHaveBeenCalledWith('listing-failures')
    expect(onFirstMatch).not.toHaveBeenCalled()
    expect(timers.pending).toHaveLength(0)
  })

  it('returns null when no prefix can be derived', () => {
    expect(
      watchForGameProcess({ installPath: 'rel', onFirstMatch: jest.fn() })
    ).toBeNull()
  })
})
