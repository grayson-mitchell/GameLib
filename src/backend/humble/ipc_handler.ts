import { addHandler, addListener } from 'backend/ipc'

import { HumbleUser, standardBrowserUserAgent } from './user'

/**
 * Registers all Humble IPC channels (typed in common/types/ipc.ts) against
 * the matching HumbleUser methods. Mirrors the Steam block in main.ts
 * (lines ~860-874), but grouped into its own function per the phase's
 * pattern map (10-PATTERNS.md) given Humble's larger IPC surface.
 *
 * The dev-only D-12 `humbleRunValidation` trigger is NOT registered here —
 * it is wired directly in backend/main.ts behind an explicit
 * `!app.isPackaged` guard (T-10-16), kept out of this always-on function so
 * it can never be accidentally exposed in a packaged build.
 *
 * Called exactly once from backend/main.ts during startup.
 */
export function registerHumbleIpcHandlers(): void {
  addHandler('humbleStartLogin', async () => HumbleUser.startLogin())
  addHandler('humbleGetUserInfo', () => HumbleUser.getUserDetails())
  addHandler('humbleReconnect', async () => HumbleUser.reconnect())
  addHandler('humbleCheckHealth', () => HumbleUser.checkHealthAndFlagExpiry())
  addHandler('humbleGetLoginUserAgent', () => standardBrowserUserAgent())
  addListener('humbleDisconnect', () => void HumbleUser.disconnect())
  addListener('humbleStopLogin', () => HumbleUser.stopLogin())
  addListener('humbleLoginNavigated', () => HumbleUser.notifyLoginNavigated())
}
