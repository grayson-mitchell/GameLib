/**
 * Curated Steam QR-login channel registration (Phase 30 Plan 01, D-01/D-02/D-08).
 *
 * Registers exactly the three invoke handlers the Tauri build's Steam login gate
 * needs to reach a populated, signed-in library, importing the REAL backend code
 * paths unchanged (mirrors `steamFlowRegistration.ts`'s own objective — prove the
 * real logic runs behind the new transport, not a reimplementation):
 *
 *   - `checkSteamInstalled` -> `SteamUser.isSteamClientInstalled()` (AUTH-05).
 *   - `steamStartQR` -> `SteamUser.startQRLogin()` (AUTH-01), which on a
 *     successful phone-approved poll writes the refresh token through
 *     `getTokenStore().setToken(...)` (the `SidecarKeyringTokenStore` seam,
 *     Phase 28) and writes only `isLoggedIn`/`userData` onto the shared
 *     `steamConfigStore` — never the token itself (D-03/T-30-01/T-30-02).
 *   - `steamPollQR` -> `SteamUser.pollQRLogin()` (AUTH-01), the frontend's
 *     polling read of the same in-memory `qrSessionState`.
 *
 * Deliberately does NOT register `steamStartCredentials`, `steamSubmitGuard`,
 * `steamPollCredential`, `getSteamUserInfo`, or `logoutSteam` — the credential/
 * SteamGuard/TOTP login branches and sign-out are explicitly OUT of scope per
 * Phase 30 D-02 (QR only). Those five channels stay unregistered on the
 * sidecar and keep rejecting non-fatally with `UNPORTED_CHANNEL_MARKER` per
 * SEAM.md Load-Bearing Invariant B — adding these three handlers must not turn
 * any of those five into anything other than a non-fatal rejection.
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

/**
 * Registers the three QR-login invoke handlers. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above; the caller decides when registration onto the handler
 * registry happens.
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
}
