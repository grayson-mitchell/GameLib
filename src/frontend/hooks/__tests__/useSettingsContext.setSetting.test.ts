jest.mock('frontend/state/GlobalStateV2', () => ({
  __esModule: true,
  default: { keys: () => ({ settingsModalProps: { isOpen: false } }) }
}))
jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: {}
}))

import {
  createSettingSetter,
  shouldRefetchOnWriteFailure
} from '../useSettingsContext'

describe('createSettingSetter (G17)', () => {
  const make = (initial: Record<string, unknown>) => {
    let config = initial
    const send = jest.fn()
    const set = createSettingSetter({
      appName: '1284190',
      getConfig: () => config,
      setConfig: (c) => {
        config = c as Record<string, unknown>
      },
      send
    })
    return { set, send, get: () => config }
  }

  it('sends a real change and updates the config', () => {
    const { set, send, get } = make({ steamEngineOverride: 'pinned:a' })
    set('steamEngineOverride', 'automatic')
    expect(send).toHaveBeenCalledWith({
      appName: '1284190',
      key: 'steamEngineOverride',
      value: 'automatic'
    })
    expect(get().steamEngineOverride).toBe('automatic')
  })

  it('does not send a no-change', () => {
    const { set, send } = make({ steamEngineOverride: 'crossover' })
    set('steamEngineOverride', 'crossover')
    expect(send).not.toHaveBeenCalled()
  })

  it('sends when the key is unset or null', () => {
    const a = make({})
    a.set('steamEngineOverride', 'automatic')
    expect(a.send).toHaveBeenCalledTimes(1)
    const b = make({ steamEngineOverride: null })
    b.set('steamEngineOverride', 'automatic')
    expect(b.send).toHaveBeenCalledTimes(1)
  })

  it('compares against the latest config, never a stale snapshot', () => {
    const { set, send } = make({ steamEngineOverride: 'pinned:a' })
    set('steamEngineOverride', 'automatic')
    set('steamEngineOverride', 'pinned:a')
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('shouldRefetchOnWriteFailure (WR-04)', () => {
  it('WR-04: true for a payload naming this appName with a string key', () => {
    expect(
      shouldRefetchOnWriteFailure('1284190', {
        appName: '1284190',
        key: 'steamEngineOverride'
      })
    ).toBe(true)
  })

  it('WR-04: false for another appName, a missing payload or bad types', () => {
    expect(
      shouldRefetchOnWriteFailure('1284190', { appName: '38400', key: 'k' })
    ).toBe(false)
    expect(shouldRefetchOnWriteFailure('1284190', undefined)).toBe(false)
    expect(shouldRefetchOnWriteFailure('1284190', null)).toBe(false)
    expect(
      shouldRefetchOnWriteFailure('1284190', { appName: 1284190, key: 'k' })
    ).toBe(false)
    expect(shouldRefetchOnWriteFailure('1284190', { appName: '1284190' })).toBe(
      false
    )
  })
})
