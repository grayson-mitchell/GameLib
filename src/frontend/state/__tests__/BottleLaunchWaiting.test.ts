/**
 * Unit tests for the BottleLaunchWaiting store + backend-signal wiring
 * (D-51-16, folded todo). No jsdom is installed in this project (see
 * src/frontend/jest.config.js docstring), so the store/handler are
 * exercised directly -- mirrors SteamBridgeSetup.test.ts.
 */
import {
  useBottleLaunchWaiting,
  handleSteamBottleLaunchWaitingSignal,
  resolveWaitingCauseOrder
} from '../BottleLaunchWaiting'
import type { IpcRendererEvent } from 'backend/platform'

describe('useBottleLaunchWaiting store', () => {
  afterEach(() => {
    useBottleLaunchWaiting.setState({ entries: {} })
  })

  it('starts with no entries', () => {
    expect(useBottleLaunchWaiting.getState().entries).toEqual({})
  })

  it('set(appName, detectedCause) stores an entry keyed by appName', () => {
    useBottleLaunchWaiting.getState().set('38410', 'other-session')

    expect(useBottleLaunchWaiting.getState().entries).toEqual({
      '38410': { detectedCause: 'other-session' }
    })
  })

  it('set(appName, null) stores an entry with a null detectedCause', () => {
    useBottleLaunchWaiting.getState().set('38410', null)

    expect(useBottleLaunchWaiting.getState().entries['38410']).toEqual({
      detectedCause: null
    })
  })

  it('set() for a second appName does not disturb the first', () => {
    useBottleLaunchWaiting.getState().set('38410', 'self-update')
    useBottleLaunchWaiting.getState().set('440', 'login')

    expect(useBottleLaunchWaiting.getState().entries).toEqual({
      '38410': { detectedCause: 'self-update' },
      '440': { detectedCause: 'login' }
    })
  })

  it('clear(appName) removes only that entry', () => {
    useBottleLaunchWaiting.getState().set('38410', 'self-update')
    useBottleLaunchWaiting.getState().set('440', 'login')

    useBottleLaunchWaiting.getState().clear('38410')

    expect(useBottleLaunchWaiting.getState().entries).toEqual({
      '440': { detectedCause: 'login' }
    })
  })

  it('clear() on an appName with no entry is a no-op', () => {
    useBottleLaunchWaiting.getState().set('440', 'login')

    expect(() => useBottleLaunchWaiting.getState().clear('38410')).not.toThrow()
    expect(useBottleLaunchWaiting.getState().entries).toEqual({
      '440': { detectedCause: 'login' }
    })
  })
})

describe('handleSteamBottleLaunchWaitingSignal (backend signal wiring)', () => {
  afterEach(() => {
    useBottleLaunchWaiting.setState({ entries: {} })
  })

  it('stores the exact appName/detectedCause the backend signal carries', () => {
    handleSteamBottleLaunchWaitingSignal({} as IpcRendererEvent, {
      appName: '38410',
      detectedCause: 'other-session'
    })

    expect(useBottleLaunchWaiting.getState().entries['38410']).toEqual({
      detectedCause: 'other-session'
    })
  })

  it('stores a null detectedCause without throwing', () => {
    expect(() =>
      handleSteamBottleLaunchWaitingSignal({} as IpcRendererEvent, {
        appName: '38410',
        detectedCause: null
      })
    ).not.toThrow()

    expect(useBottleLaunchWaiting.getState().entries['38410']).toEqual({
      detectedCause: null
    })
  })

  it('never stores an entry unless the signal fires', () => {
    expect(useBottleLaunchWaiting.getState().entries).toEqual({})
  })
})

describe('resolveWaitingCauseOrder', () => {
  it('returns the canonical order when a cause was detected', () => {
    expect(resolveWaitingCauseOrder('self-update')).toEqual([
      'self-update',
      'login',
      'other-session'
    ])
  })

  it('returns the same canonical order when no cause was detected (no "most likely" marker)', () => {
    expect(resolveWaitingCauseOrder(null)).toEqual([
      'self-update',
      'login',
      'other-session'
    ])
  })

  it('returns the canonical order regardless of which cause was detected', () => {
    expect(resolveWaitingCauseOrder('other-session')).toEqual([
      'self-update',
      'login',
      'other-session'
    ])
    expect(resolveWaitingCauseOrder('login')).toEqual([
      'self-update',
      'login',
      'other-session'
    ])
  })
})
