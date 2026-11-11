/**
 * A fresh, isolated Steam session cluster for consumer tests (D-66.3-13). Plain object, no jest
 * APIs. Two calls never share state. The factories are required lazily so importing this fake
 * does not pull the Steam user chain into a suite that mocks one of those modules.
 */
import type { SteamSessionServices } from '../services/types'

export function createTestSteamSession(): SteamSessionServices {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createSteamSignInState } =
    require('../storeManagers/steam/userSignInState') as typeof import('../storeManagers/steam/userSignInState')
  const { createSteamAuthTrigger } =
    require('../storeManagers/steam/authTrigger') as typeof import('../storeManagers/steam/authTrigger')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    signIn: createSteamSignInState(),
    authTrigger: createSteamAuthTrigger()
  }
}
