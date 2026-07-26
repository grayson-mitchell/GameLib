/**
 * Curated Steam QR-login + credential-login + session/identity channel
 * registration (Phase 30 Plan 01 D-01/D-02/D-08; extended Phase 34.4 Plan 01,
 * REQ-34.4-01/REQ-34.4-02).
 *
 * Registers the invoke handlers the Tauri build's Steam login gate needs to
 * reach a populated, signed-in library, importing the REAL backend code
 * paths unchanged (mirrors `steamFlowRegistration.ts`'s own objective — prove the
 * real logic runs behind the new transport, not a reimplementation):
 *
 * QR login trio (Phase 30, `ipcMain.handle`):
 *   - `checkSteamInstalled` -> `SteamUser.isSteamClientInstalled()` (AUTH-05).
 *   - `steamStartQR` -> `SteamUser.startQRLogin()` (AUTH-01), which on a
 *     successful phone-approved poll writes the refresh token through
 *     `getTokenStore().setToken(...)` (the `SidecarKeyringTokenStore` seam,
 *     Phase 28) and writes only `isLoggedIn`/`userData` onto the shared
 *     `steamConfigStore` — never the token itself (D-03/T-30-01/T-30-02).
 *   - `steamPollQR` -> `SteamUser.pollQRLogin()` (AUTH-01), the frontend's
 *     polling read of the same in-memory `qrSessionState`.
 *
 * Credential/SteamGuard/TOTP login trio (Phase 34.4, REQ-34.4-01,
 * `ipcMain.handle`, `main.ts:899-905`):
 *   - `steamPollCredential` -> `SteamUser.pollCredentialLogin()` (`main.ts:899`).
 *   - `steamStartCredentials` -> `SteamUser.startCredentialLogin(username, password)`
 *     (`main.ts:900-902`).
 *   - `steamSubmitGuard` -> `SteamUser.submitSteamGuardCode(code)` (`main.ts:903-905`).
 *
 * Session/identity trio (Phase 34.4, REQ-34.4-02, `main.ts:918,922,939`):
 *   - `getSteamUserInfo` -> `SteamUser.getUserDetails()` (`ipcMain.handle`,
 *     `main.ts:918`).
 *   - `getSteamSyncedAt` -> `steamSyncStore.get('syncedAt') ?? null`
 *     (`ipcMain.handle`, `main.ts:922`).
 *   - `logoutSteam` -> `SteamUser.logout()` — a **send** (`ipcMain.on`,
 *     `main.ts:939`, `addListener`, NEVER `addHandler`). This is the G-30-01
 *     channel: a `send` registered as a `handle` (or the reverse) fails 100%
 *     silently at runtime (`sidecar-send-channels-fail-silently`, Phase 31
 *     Pitfall 2) — no reject, no timeout, no console line. The listener below
 *     never lets the fire-and-forget `SteamUser.logout()` rejection escape
 *     unguarded.
 *
 * Deliberately does NOT register `isLoggedIn` (`LegendaryUser.isLoggedIn()`,
 * `main.ts:875` — Epic auth, reassigned to Phase 34.5 by 34.4 D-03, not a
 * Steam channel despite the inventory grouping it here), nor the bottle
 * trio / client-setup pair / `redeemSteamKey` / `getSteamInstallSize` /
 * private-branch pair — those belong to plan 34.4-02 (same file, next wave).
 * Those channels stay unregistered on the sidecar and keep rejecting
 * non-fatally with `UNPORTED_CHANNEL_MARKER` per SEAM.md Load-Bearing
 * Invariant B.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors steamFlowRegistration.ts's Phase 27 Plan
// 05 circular-dep fix): force `storeManagers/index.ts` to be the
// INITIALIZATION ENTRY before the direct `steam/user` import below resolves.
// `storeManagers/index.ts` imports `steam/library` at its OWN top (which in
// turn imports `steam/user`) and only THEN constructs its eager
// `libraryManagerMap` (`new SteamLibraryManager()` ...), so entering through
// it lets every steam/* module finish defining its class export first.
// Entering through `steam/user` DIRECTLY (as this file's own import below
// does) risks the same re-entrant `index.ts` mid-evaluation crash
// `steamFlowRegistration.ts`'s docstring documents (`SteamLibraryManager is
// not a constructor`, esbuild-bundle-only, ts-jest's init order differs) —
// this fix is per-file, not "once is enough", because each curated
// registration module is its own independent entry point into the bundle's
// module graph.
import '../storeManagers'
import { SteamUser } from '../storeManagers/steam/user'
import { steamSyncStore } from '../storeManagers/steam/electronStores'

/**
 * Registers the QR-login trio, the credential/SteamGuard/TOTP login trio,
 * and the session/identity trio. Called once from `handlers.ts` — this
 * module owns no side effects at import time beyond the imports above; the
 * caller decides when registration onto the handler registry happens.
 */
export function registerSteamAuthFlows(): void {
  ipcMain.handle('checkSteamInstalled', async () => {
    return SteamUser.isSteamClientInstalled()
  })

  ipcMain.handle('steamStartQR', async () => {
    return SteamUser.startQRLogin()
  })

  ipcMain.handle('steamPollQR', async () => {
    return SteamUser.pollQRLogin()
  })

  // Source: main.ts:899 — credential/SteamGuard/TOTP login trio (REQ-34.4-01).
  ipcMain.handle('steamPollCredential', async () => {
    return SteamUser.pollCredentialLogin()
  })

  ipcMain.handle(
    'steamStartCredentials',
    async (_event: unknown, ...args: unknown[]) => {
      const { username, password } = args[0] as {
        username: string
        password: string
      }
      return SteamUser.startCredentialLogin(username, password)
    }
  )

  ipcMain.handle(
    'steamSubmitGuard',
    async (_event: unknown, ...args: unknown[]) => {
      return SteamUser.submitSteamGuardCode(args[0] as string)
    }
  )

  // Source: main.ts:918,922 — session/identity trio (REQ-34.4-02).
  ipcMain.handle('getSteamUserInfo', async () => {
    return SteamUser.getUserDetails()
  })

  ipcMain.handle('getSteamSyncedAt', async () => {
    return steamSyncStore.get('syncedAt') ?? null
  })

  // Source: main.ts:939 — `addListener('logoutSteam', ...)`, the G-30-01 SEND
  // channel. `ipcMain.on`, NEVER `ipcMain.handle`. `SteamUser.logout()` is
  // async (D-09 gap fix — clears the refresh token through the TokenStore
  // seam, which may RPC to Rust in the sidecar build); this listener is
  // fire-and-forget, so its promise must not be discarded silently
  // (`sidecar-dialog-reject-crashes`: an unguarded fire-and-forget rejection
  // can crash the sidecar). Mirrors `humble/ipc_handler.ts:121-125`'s
  // `humbleDisconnect` guard shape.
  ipcMain.on('logoutSteam', () => {
    SteamUser.logout().catch((error) =>
      console.warn('[steamAuthFlowRegistration] logoutSteam failed:', error)
    )
  })
}
