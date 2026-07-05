import { addHandler, addListener } from 'backend/ipc'

import { HumbleUser } from './user'

/**
 * Registers all Humble IPC channels (typed in common/types/ipc.ts) against
 * the matching HumbleUser methods. Mirrors the Steam block in main.ts
 * (lines ~860-874), but grouped into its own function per the phase's
 * pattern map (10-PATTERNS.md) given Humble's larger IPC surface.
 *
 * Called exactly once from backend/main.ts during startup.
 */
export function registerHumbleIpcHandlers(): void {
  addHandler('humbleStartLogin', async () => HumbleUser.startLogin())
  addHandler('humbleGetUserInfo', async () => HumbleUser.getUserDetails())
  addHandler('humbleReconnect', async () => HumbleUser.reconnect())
  addHandler('humbleCheckHealth', async () =>
    HumbleUser.checkHealthAndFlagExpiry()
  )
  addListener('humbleDisconnect', () => void HumbleUser.disconnect())
}
