/**
 * Curated Epic (legendary)/GOG/Amazon (nile) auth + sign-out channel registration for the Tauri
 * sidecar (Phase 34.5 Plans 34.5-06/34.5-10, REQ-34.5-04).
 *
 * Plan 34.5-06 fills in the Epic + GOG channels (7 of the 11 declared below). Amazon's 4 channels
 * (`getAmazonLoginData`/`authAmazon`/`getAmazonUserInfo`/`logoutAmazon`) land in plan 34.5-10 —
 * do not add them here.
 *
 * Declared channel list (11 total — verified against `main.ts` by 34.5-RESEARCH.md and this
 * plan's own `<interfaces>` block):
 *
 *   invoke (ipcMain.handle, 10):
 *     - `login`                -> main.ts:877 -> `LegendaryUser.login(sid)`
 *     - `getUserInfo`          -> main.ts:868
 *     - `isLoggedIn`           -> main.ts:875 -> `LegendaryUser.isLoggedIn()`
 *     - `getEpicGamesStatus`   -> main.ts:772 -> `isEpicServiceOffline()`
 *     - `logoutLegendary`      -> main.ts:879 -> `LegendaryUser.logout()`
 *     - `authGOG`              -> main.ts:878 -> `GOGUser.login(code)`
 *     - `getAmazonLoginData`   -> main.ts:882 -> `NileUser.getLoginData()`               [34.5-10]
 *     - `authAmazon`           -> main.ts:883 -> `NileUser.login(data)`                  [34.5-10]
 *     - `getAmazonUserInfo`    -> main.ts:872 -> `NileUser.getUserData()`                [34.5-10]
 *     - `logoutAmazon`         -> main.ts:884 -> `NileUser.logout()`                     [34.5-10]
 *
 *   send (ipcMain.on, 1):
 *     - `logoutGOG` -> main.ts:880 SEND -> `GOGUser.logout()`. A `send` channel's rejection
 *       reaches NO caller (no reject, no timeout, no console line to the renderer) —
 *       `sidecar-send-channels-fail-silently` project memory. `GOGUser.logout()` is SYNCHRONOUS
 *       (`gog/user.ts:140`, no `async`), so the listener body below wraps it in a plain
 *       synchronous try/catch — NOT `.catch()`, which would itself throw a TypeError against a
 *       `void` return and make the failure invisible in exactly the way a send channel already
 *       is. This is the phase's only Repudiation surface (T-34.5-18); the asymmetry (Legendary
 *       and, once 34.5-10 lands, Amazon's sign-outs are handle-kind while GOG's is send-kind) is
 *       inherited Electron behaviour, deliberately preserved, and cross-checked in both
 *       directions by `__tests__/runnerAuthFlows.test.ts`.
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`storeManagers/legendary/user`, `storeManagers/gog/user`, `storeManagers/nile/user`),
 * and NEVER `main.ts` or any `ipc_handler.ts` file — those double-register these same channels onto
 * Electron's real `ipcMain` via `backend/ipc`'s `addHandler`/`addListener`, an Electron-only path
 * this sidecar's curated import graph must never reach.
 *
 * Trust-boundary validation (T-34.5-21/T-34.5-22, ASVS V5, mirrors the ported `redeemSteamKey`
 * precedent in `steamAuthFlowRegistration.ts`): `login`'s `sid` and `authGOG`'s `code` are OAuth
 * credentials, untrusted at runtime despite their TypeScript type contracts. Both handlers reject
 * a non-string/empty payload BEFORE calling the runner method, returning the same
 * `{ status: 'failed', data: undefined }` shape `LegendaryUser.login`/`GOGUser.login`'s own
 * internal error path already uses (verified against `legendary/user.ts`'s `errorMessage()`
 * helper and `gog/user.ts:54-56,61-63`'s parse-failure returns) — never a bespoke shape, and
 * never a log line containing the rejected value itself.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import — force `storeManagers/index.ts` to be the INITIALIZATION ENTRY
// before a direct `storeManagers/<runner>/user` import resolves, avoiding the re-entrant "X is
// not a constructor" mid-evaluation crash `steamAuthFlowRegistration.ts`'s own docstring
// documents (`storeManagers/index.ts` imports `steam/library` at its own top, which in turn
// imports `steam/user`, and only THEN constructs its eager `libraryManagerMap` — entering through
// a direct runner `user.ts` import instead risks hitting that same class mid-definition). This
// fix is per-file, not "once is enough": each curated registration module is its own independent
// entry point into the bundle's module graph. Verified for THIS cluster too: `legendary/user.ts`
// imports `libraryManagerMap` from `..` (`storeManagers/index.ts`) and `gog/user.ts` reaches the
// same map via a lazy `await import('../index')` inside `login()`/`getCredentials()` specifically
// to break this same cycle (its own doc comment cites "Phase 27 Plan 02") — both runners are
// reachable through the identical circular-dependency shape this import ordering exists to avoid.
import '../storeManagers'
import { LegendaryUser } from '../storeManagers/legendary/user'
import { GOGUser } from '../storeManagers/gog/user'
import { isEpicServiceOffline } from '../utils'
import { logWarning, LogPrefix } from '../logger'

function logSendFailure(channel: string, error: unknown): void {
  logWarning(
    [
      `[runnerAuthFlowRegistration] ${channel} failed:`,
      error instanceof Error ? error.message : String(error)
    ],
    LogPrefix.Backend
  )
}

/**
 * Registers this plan's 7 channels (6 invoke + 1 send): Epic's `getEpicGamesStatus`/`getUserInfo`/
 * `isLoggedIn`/`login`/`logoutLegendary` and GOG's `authGOG`/`logoutGOG`. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the imports above; the
 * caller decides when registration onto the handler registry happens.
 *
 * Amazon's 4 channels land in plan 34.5-10 — do not add them here.
 *
 * Idempotence guard (Rule 1 fix, discovered by `__tests__/runnerSliceRegistration.test.ts`'s own
 * pre-existing "calling registerXFlows() twice does not throw or stack duplicate listeners"
 * case): `ipcMain.on` (`electronStub.ts`) appends to an array on every call, so a second
 * unguarded call to this function would double-register `logoutGOG`'s listener — unlike the 6
 * `ipcMain.handle` calls above/below, which are naturally idempotent (`Map.set` replaces the
 * existing entry). Mirrors `storeRegistration.ts`'s own `let registered = false` guard.
 */
let registered = false
export function registerRunnerAuthFlows(): void {
  if (registered) {
    return
  }
  registered = true

  // Source: main.ts:772 -> `isEpicServiceOffline()`.
  ipcMain.handle('getEpicGamesStatus', async () => {
    return isEpicServiceOffline()
  })

  // Source: main.ts:868 -> `LegendaryUser.getUserInfo()`.
  ipcMain.handle('getUserInfo', async () => {
    return LegendaryUser.getUserInfo()
  })

  // Source: main.ts:875 -> `LegendaryUser.isLoggedIn()`.
  ipcMain.handle('isLoggedIn', () => {
    return LegendaryUser.isLoggedIn()
  })

  // Source: main.ts:877 -> `LegendaryUser.login(sid)`. `sid` is an Epic authorization code — a
  // credential, untrusted at runtime despite its type contract (T-34.5-21/T-34.5-22). Rejects a
  // non-string/empty payload WITHOUT calling `LegendaryUser.login`, returning the same
  // `{ status: 'failed', data: undefined }` shape the runner's own `errorMessage()` helper
  // already uses. Never logs the payload value on either path.
  ipcMain.handle('login', async (_event: unknown, ...args: unknown[]) => {
    const sid = args[0]
    if (typeof sid !== 'string' || sid.length === 0) {
      logWarning(
        '[runnerAuthFlowRegistration] login rejected: sid must be a non-empty string',
        LogPrefix.Backend
      )
      return { status: 'failed', data: undefined }
    }
    return LegendaryUser.login(sid)
  })

  // Source: main.ts:879 -> `LegendaryUser.logout()`.
  ipcMain.handle('logoutLegendary', () => {
    return LegendaryUser.logout()
  })

  // Source: main.ts:878 -> `GOGUser.login(code)`. `code` is a GOG authorization code — same
  // trust-boundary treatment as `login` above. Rejects a non-string/empty payload WITHOUT calling
  // `GOGUser.login`, returning the same `{ status: 'error' }` shape `GOGUser.login`'s own
  // parse-failure paths already use (`gog/user.ts:54-56,61-63`). Never logs the payload value.
  ipcMain.handle('authGOG', async (_event: unknown, ...args: unknown[]) => {
    const code = args[0]
    if (typeof code !== 'string' || code.length === 0) {
      logWarning(
        '[runnerAuthFlowRegistration] authGOG rejected: code must be a non-empty string',
        LogPrefix.Backend
      )
      return { status: 'error' }
    }
    return GOGUser.login(code)
  })

  // Source: main.ts:880 -> `addListener('logoutGOG', () => GOGUser.logout())` — the phase's
  // Repudiation surface (T-34.5-18). `ipcMain.on`, NEVER `ipcMain.handle`. `GOGUser.logout()` is
  // SYNCHRONOUS (verified: `gog/user.ts:140`, no `async`), so this body wraps the call in a plain
  // try/catch — attaching `.catch()` to a `void` return would itself throw a TypeError and make
  // the failure invisible in exactly the way a send channel already is
  // (`sidecar-send-channels-fail-silently`). Three sign-outs, three runners, and only this one is
  // send-kind: inherited Electron behaviour, deliberately preserved — the registration-kind test
  // is what keeps it honest.
  ipcMain.on('logoutGOG', () => {
    try {
      GOGUser.logout()
    } catch (error) {
      logSendFailure('logoutGOG', error)
    }
  })
}
