/**
 * Quick 261029-s5l: the install-side Steam sign-in decision, plus parity with
 * the account surfaces that already show the token-absent latch.
 */
import { resolveSignInStates } from 'common/signInState'
import { resolveLibrarySignInRows } from '../../screens/Library/librarySignInRows'
import { resolveSignInTile } from '../../screens/Login/signInTileState'
import { collectSignInInputs } from '../signInInputs'
import {
  resolveSteamInstallSignInState,
  steamInstallNeedsSignIn
} from '../steamInstallSignIn'
import { steamConfigStore } from 'frontend/helpers/electronStores'

interface StoreSpy {
  get_nodefault: jest.Mock
}

jest.mock('frontend/helpers/electronStores', () => ({
  legendaryConfigStore: { get_nodefault: jest.fn() },
  gogConfigStore: { get_nodefault: jest.fn() },
  nileConfigStore: { get_nodefault: jest.fn() },
  steamConfigStore: { get_nodefault: jest.fn() }
}))

const mockSteam = steamConfigStore as unknown as StoreSpy

function armLatch(on: boolean): void {
  mockSteam.get_nodefault.mockImplementation((key: string) =>
    key === 'credentialsMissing' ? on : undefined
  )
}

beforeEach(() => {
  mockSteam.get_nodefault.mockReset()
  armLatch(false)
})

describe('steamInstallSignIn', () => {
  test('S1: latch + username -> expired -> needs sign-in', () => {
    armLatch(true)
    const state = resolveSteamInstallSignInState('tester', {})
    expect(state).toBe('expired')
    expect(steamInstallNeedsSignIn(state)).toBe(true)
  })

  test('S2: latch outranks a missing username', () => {
    armLatch(true)
    const state = resolveSteamInstallSignInState(undefined, {})
    expect(state).toBe('expired')
    expect(steamInstallNeedsSignIn(state)).toBe(true)
  })

  test('S3: healthy -> connected; no outcome -> unknown; neither blocks', () => {
    const connected = resolveSteamInstallSignInState('tester', {
      steam: 'healthy'
    })
    expect(connected).toBe('connected')
    expect(steamInstallNeedsSignIn(connected)).toBe(false)
    const unknown = resolveSteamInstallSignInState('tester', {})
    expect(unknown).toBe('unknown')
    expect(steamInstallNeedsSignIn(unknown)).toBe(false)
  })

  test('S4: no username, no latch -> not-connected -> does not block', () => {
    const state = resolveSteamInstallSignInState(undefined, {})
    expect(state).toBe('not-connected')
    expect(steamInstallNeedsSignIn(state)).toBe(false)
  })

  test('S5: the account surfaces already fire for the latch', () => {
    armLatch(true)
    const states = resolveSignInStates(
      collectSignInInputs({ steamUsername: 'tester' }, {})
    )
    const rows = resolveLibrarySignInRows({ states, dismissed: ['steam'] })
    expect(rows.find((r) => r.store === 'steam')).toMatchObject({
      kind: 'expired',
      dismissible: false
    })
    expect(resolveSignInTile(states.steam)).toMatchObject({
      isLoggedIn: false,
      reconnect: true
    })
  })
})
