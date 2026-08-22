/**
 * The Manage Accounts tile must not present Steam as connected when the backend
 * has proven the stored credential is gone.
 *
 * Regression source (2026-08-22): the tile was driven off `Boolean(steam?.username)`
 * alone. With a cached username and an empty Keychain slot it read "signed in"
 * while every install failed with "You are not signed in to Steam".
 */
import { isSteamConnected } from '../steamTileState'

describe('isSteamConnected', () => {
  it('is connected with a username and no missing-credential verdict', () => {
    expect(isSteamConnected('Grayson', false)).toBe(true)
    expect(isSteamConnected('Grayson', undefined)).toBe(true)
  })

  it('is NOT connected when the credential is proven missing, despite a username', () => {
    // The exact observed state: identity still cached and correct, credential gone.
    expect(isSteamConnected('Grayson', true)).toBe(false)
  })

  it('is not connected without a username, regardless of the flag', () => {
    expect(isSteamConnected(null, false)).toBe(false)
    expect(isSteamConnected(undefined, false)).toBe(false)
    expect(isSteamConnected('', true)).toBe(false)
  })
})
