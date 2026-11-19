import {
  createSteamGameSessionState,
  runningBridgedAppId
} from '../gameSessionState'

/**
 * 66.3-13 (D-05): the per-session game maps are one boot-owned instance, not module state, so each
 * case builds its own and no reset hook exists.
 */
describe('createSteamGameSessionState', () => {
  it('marks, queries and clears a bridge failure per appId', () => {
    const session = createSteamGameSessionState()
    expect(session.bridgeFailedThisSession.has('730')).toBe(false)
    session.markBridgeFailedThisSession('730')
    expect(session.bridgeFailedThisSession.has('730')).toBe(true)
    expect(session.bridgeFailedThisSession.has('440')).toBe(false)
    session.clearBridgeFailedThisSession('730')
    expect(session.bridgeFailedThisSession.has('730')).toBe(false)
  })

  it('isNativeInstallInFlight reflects nativeInstallsInFlight', () => {
    const session = createSteamGameSessionState()
    expect(session.isNativeInstallInFlight('730')).toBe(false)
    session.nativeInstallsInFlight.set('730', {
      promise: Promise.resolve({ status: 'done' }),
      aborted: false
    })
    expect(session.isNativeInstallInFlight('730')).toBe(true)
    session.nativeInstallsInFlight.delete('730')
    expect(session.isNativeInstallInFlight('730')).toBe(false)
  })

  it('two instances never share a map or a set', () => {
    const one = createSteamGameSessionState()
    const two = createSteamGameSessionState()
    one.markBridgeFailedThisSession('730')
    one.bridgeLaunchBottles.set('730', { bottle: 'b' })
    one.loggedEmptyGameInfoMisses.add('730')
    one.bridgeLaunchesInFlight.set('730', Promise.resolve(true))
    expect(two.bridgeFailedThisSession.size).toBe(0)
    expect(two.bridgeLaunchBottles.size).toBe(0)
    expect(two.loggedEmptyGameInfoMisses.size).toBe(0)
    expect(two.bridgeLaunchesInFlight.size).toBe(0)
  })
})

describe('runningBridgedAppId (quick 261119-se9)', () => {
  it('is 0 with empty maps', () => {
    expect(runningBridgedAppId(createSteamGameSessionState())).toBe(0)
  })

  it('counts a spawned bridged launch', () => {
    const session = createSteamGameSessionState()
    session.bridgeLaunchBottles.set('206040', {
      bottle: 'GameLibSteamBridge-206040'
    })
    expect(runningBridgedAppId(session)).toBe(206040)
  })

  it('counts a launch that is only in pre-flight', () => {
    const session = createSteamGameSessionState()
    session.bridgeLaunchesInFlight.set('206040', Promise.resolve(true))
    expect(runningBridgedAppId(session)).toBe(206040)
  })

  it('returns the numeric minimum across both maps, not the lexicographic one', () => {
    const session = createSteamGameSessionState()
    session.bridgeLaunchBottles.set('206040', { bottle: 'a' })
    session.bridgeLaunchesInFlight.set('99999', Promise.resolve(true))
    expect(runningBridgedAppId(session)).toBe(99999)
  })

  it('is 0 again once both keys are deleted', () => {
    const session = createSteamGameSessionState()
    session.bridgeLaunchBottles.set('206040', { bottle: 'a' })
    session.bridgeLaunchesInFlight.set('206040', Promise.resolve(true))
    session.bridgeLaunchBottles.delete('206040')
    session.bridgeLaunchesInFlight.delete('206040')
    expect(runningBridgedAppId(session)).toBe(0)
  })

  it.each(['', '0', 'abc'])(
    'ignores the non-positive-integer key %p',
    (key) => {
      const session = createSteamGameSessionState()
      session.bridgeLaunchBottles.set(key, { bottle: 'a' })
      expect(runningBridgedAppId(session)).toBe(0)
    }
  )
})
