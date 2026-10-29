import {
  isRunsForMeOn,
  nextRunsForMeAfterSession,
  nextRunsForMeAfterUserToggle,
  RUNS_FOR_ME_AUTO_THRESHOLD_MS,
  runsForMeKey
} from '../runsForMe'

describe('runsForMe rules', () => {
  it('threshold is 60 s', () => {
    expect(RUNS_FOR_ME_AUTO_THRESHOLD_MS).toBe(60_000)
  })

  it('does not auto-set below the threshold', () => {
    expect(nextRunsForMeAfterSession(undefined, 59_000)).toBeUndefined()
    expect(nextRunsForMeAfterSession(undefined, 59_999)).toBeUndefined()
  })

  it('auto-sets at the threshold', () => {
    expect(nextRunsForMeAfterSession(undefined, 60_000)).toBe('auto')
  })

  it('never overrides a user choice', () => {
    expect(nextRunsForMeAfterSession('user-off', 3_600_000)).toBe('user-off')
    expect(nextRunsForMeAfterSession('user-on', 60_000)).toBe('user-on')
    expect(nextRunsForMeAfterSession('auto', 60_000)).toBe('auto')
  })

  it('maps a user toggle', () => {
    expect(nextRunsForMeAfterUserToggle(true)).toBe('user-on')
    expect(nextRunsForMeAfterUserToggle(false)).toBe('user-off')
  })

  it('isRunsForMeOn', () => {
    expect(isRunsForMeOn('auto')).toBe(true)
    expect(isRunsForMeOn('user-on')).toBe(true)
    expect(isRunsForMeOn('user-off')).toBe(false)
    expect(isRunsForMeOn(undefined)).toBe(false)
  })

  it('runsForMeKey', () => {
    expect(runsForMeKey('Foo.Bar', 'gog')).toBe('Foo.Bar_gog')
  })
})
