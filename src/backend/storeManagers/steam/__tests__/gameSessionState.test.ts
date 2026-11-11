import { createSteamGameSessionState } from '../gameSessionState'

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
