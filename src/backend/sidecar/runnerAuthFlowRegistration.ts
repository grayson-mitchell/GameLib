/**
 * Curated Epic (legendary)/GOG/Amazon (nile) auth + sign-out channel registration for the Tauri
 * sidecar (Phase 34.5 Plans 34.5-06/34.5-10, REQ-34.5-04).
 *
 * Plan 34.5-06 filled in the Epic + GOG channels (7 of the 11 declared below). Plan 34.5-10 adds
 * Amazon's 4 channels (`getAmazonLoginData`/`authAmazon`/`getAmazonUserInfo`/`logoutAmazon`),
 * completing the cluster at 11.
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
 *     - `getAmazonLoginData`   -> main.ts:882 -> `NileUser.getLoginData()`
 *     - `authAmazon`           -> main.ts:883 -> `NileUser.login(data)`
 *     - `getAmazonUserInfo`    -> main.ts:872 -> `NileUser.getUserData()`
 *     - `logoutAmazon`         -> main.ts:884 -> `NileUser.logout()`
 *
 *   send (ipcMain.on, 1):
 *     - `logoutGOG` -> main.ts:880 SEND -> `GOGUser.logout()`. A `send` channel's rejection
 *       reaches NO caller (no reject, no timeout, no console line to the renderer) —
 *       `sidecar-send-channels-fail-silently` project memory. `GOGUser.logout()` gained a D-15
 *       cookie-clear step (Phase 40 plan 04, T-40-04-07) and with it an `async` keyword, but
 *       every line before its first `await` — all of the credential-side cleanup — still runs
 *       SYNCHRONOUSLY the instant the function is called (JS's own run-to-first-await
 *       semantics), so the listener body below keeps its synchronous try/catch AND additionally
 *       chains `.catch()` onto the returned promise: the sync try/catch alone would miss a
 *       genuine async rejection (which surfaces only via the promise, never as a thrown
 *       exception at the call site), while `.catch()` alone would miss a synchronously-throwing
 *       mock/implementation (the exact shape `__tests__/runnerAuthFlows.test.ts` T-34.5-18 pins).
 *       Both defences are load-bearing; neither subsumes the other. This is the phase's only
 *       Repudiation surface (T-34.5-18); the asymmetry (Legendary and Amazon's sign-outs are
 *       handle-kind while GOG's is send-kind) is inherited Electron behaviour, deliberately
 *       preserved, and cross-checked in both directions by `__tests__/runnerAuthFlows.test.ts`.
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`storeManagers/legendary/user`, `storeManagers/gog/user`, `storeManagers/nile/user`),
 * and NEVER `main.ts` or any `ipc_handler.ts` file — those double-register these same channels onto
 * Electron's real `ipcMain` via `backend/ipc`'s `addHandler`/`addListener`, an Electron-only path
 * this sidecar's curated import graph must never reach.
 *
 * Trust-boundary validation (T-34.5-21/T-34.5-22/T-34.5-35, ASVS V5, mirrors the ported
 * `redeemSteamKey` precedent in `steamAuthFlowRegistration.ts`): `login`'s `sid`, `authGOG`'s
 * `code`, and `authAmazon`'s `data` payload are OAuth credentials, untrusted at runtime despite
 * their TypeScript type contracts. All three handlers reject a malformed payload BEFORE calling
 * the runner method — `login`/`authGOG` return the same `{ status: 'failed'/'error', data:
 * undefined }` shape `LegendaryUser.login`/`GOGUser.login`'s own internal error path already uses
 * (verified against `legendary/user.ts`'s `errorMessage()` helper and `gog/user.ts:54-56,61-63`'s
 * parse-failure returns); `authAmazon` returns the same `{ status: 'failed', user: undefined }`
 * shape `NileUser.login`'s own internal failure path already uses (`nile/user.ts:66-71`) — never
 * a bespoke shape, and never a log line containing the rejected value itself (T-34.5-36).
 *
 * ORDERING CONSTRAINT (T-34.5-34, closes the exposure T-34.4.1-44b describes): `authAmazon` mints
 * a real Amazon credential from a value produced by `oauthLoginCapture.ts`'s
 * `matchOAuthRedirect('nile', …)`. That function's input-validation control — the exact-host
 * anchor on `www.amazon.com` (plan 34.5-02, REQ-34.5-02) — MUST land before this channel is
 * registered/consumed, or a code captured from a non-Amazon origin could reach this mint. The
 * anchor's host value is MEDIUM confidence (research Assumption A1) until live-gate item 3
 * confirms it against one real captured redirect — nothing in this file asserts the anchor is
 * empirically correct, only that it is the control this channel depends on.
 */

import { ipcMain } from '../platform'
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
import { NileUser } from '../storeManagers/nile/user'
import { isEpicServiceOffline } from '../utils'
import { logWarning, LogPrefix } from '../logger'
import type { NileRegisterData } from '../../common/types/nile'

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
 * Registers all 11 auth channels (10 invoke + 1 send): Epic's `getEpicGamesStatus`/`getUserInfo`/
 * `isLoggedIn`/`login`/`logoutLegendary`, GOG's `authGOG`/`logoutGOG`, and Amazon's
 * `getAmazonLoginData`/`authAmazon`/`getAmazonUserInfo`/`logoutAmazon`. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the imports above; the
 * caller decides when registration onto the handler registry happens.
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

  // Source: main.ts:882 -> `NileUser.getLoginData()`. D-12, corrected: the nile CLI's own
  // credential directory is `nile_config` (`nile/constants.ts:4`, wired via `NILE_CONFIG_PATH` at
  // `nile/library.ts:486`) — not `nile_store` (`nile/electronStores.ts:13`), which is the
  // separate PROFILE `configStore` cwd this handler's sibling `getAmazonUserInfo` reads/writes
  // through. Both derive from `appFolder` and resolve through `pathShim`'s already-implemented
  // `userData`, so this delegation needs no new path work.
  ipcMain.handle('getAmazonLoginData', () => {
    return NileUser.getLoginData()
  })

  // ORDERING CONSTRAINT (T-34.5-34, closes T-34.4.1-44b): Source: main.ts:883 ->
  // `NileUser.login(data)`. This channel MINTS a real Amazon credential from a value that can
  // only have reached it via `oauthLoginCapture.ts`'s `matchOAuthRedirect('nile', …)` — and that
  // function's exact-host anchor on `www.amazon.com` (plan 34.5-02, REQ-34.5-02) is the
  // input-validation control protecting this mint. That anchor lands BEFORE this channel is
  // consumed; registering this handler without the anchor already in place would recreate the
  // exposure T-34.4.1-44b describes. The anchor's host value is MEDIUM confidence (research
  // Assumption A1) and its confirmation is live-gate item 3, not a claim this handler may make.
  //
  // `data` is `NileRegisterData` (`common/types/nile.ts:119`) — an authorization code plus its
  // PKCE `code_verifier`/device `serial`/`client_id`, all credentials, untrusted at runtime
  // despite the type contract (T-34.5-35). Rejects a payload that is not the shape
  // `NileUser.login` expects WITHOUT calling it, returning the same `{ status: 'failed', user:
  // undefined }` shape `NileUser.login`'s own internal failure path already uses
  // (`nile/user.ts:66-71`). Never logs the payload value (T-34.5-36) — a captured authorization
  // code is a credential.
  ipcMain.handle('authAmazon', async (_event: unknown, ...args: unknown[]) => {
    const data = args[0] as Partial<NileRegisterData> | undefined | null
    const isValid =
      typeof data === 'object' &&
      data !== null &&
      typeof data.code === 'string' &&
      data.code.length > 0 &&
      typeof data.code_verifier === 'string' &&
      data.code_verifier.length > 0 &&
      typeof data.serial === 'string' &&
      data.serial.length > 0 &&
      typeof data.client_id === 'string' &&
      data.client_id.length > 0
    if (!isValid) {
      logWarning(
        '[runnerAuthFlowRegistration] authAmazon rejected: payload does not match NileRegisterData',
        LogPrefix.Backend
      )
      return { status: 'failed', user: undefined }
    }
    return NileUser.login(data as NileRegisterData)
  })

  // Source: main.ts:872 -> `NileUser.getUserData()`.
  ipcMain.handle('getAmazonUserInfo', async () => {
    return NileUser.getUserData()
  })

  // Source: main.ts:884 -> `NileUser.logout()`. Unchanged body — `NileUser.logout()`
  // (`nile/user.ts`) is `ipcMain.handle`-kind, so unlike `logoutGOG` below its returned promise
  // is already awaited/propagated by the handle mechanism itself; no extra `.catch()` wiring is
  // needed here for a rejection to reach the caller. Amazon cookies landing in the app-wide jar
  // was the INHERITED, previously-accepted T-34.4.1-47 residual (T-34.5-37, `accept`) — that
  // acceptance is now SUPERSEDED by Phase 40 plan 04's D-15 fix (T-40-04-07, disposition
  // `mitigate`): `NileUser.logout()` itself now clears GOG's Amazon-equivalent cookie domain
  // (`AMAZON_COOKIE_HOSTS`, `nile/user.ts`) after its own credential-side cleanup, so the
  // "do not add a cookie clear" instruction this comment used to carry no longer applies — the
  // clear lives inside `NileUser.logout()`, not in this delegation.
  ipcMain.handle('logoutAmazon', () => {
    return NileUser.logout()
  })

  // Source: main.ts:880 -> `addListener('logoutGOG', () => GOGUser.logout())` — the phase's
  // Repudiation surface (T-34.5-18). `ipcMain.on`, NEVER `ipcMain.handle`. `GOGUser.logout()`
  // gained a D-15 cookie-clear step (Phase 40 plan 04, T-40-04-07) and now returns a promise, but
  // every line before its first `await` (all of its credential-side cleanup) still runs
  // synchronously the instant it is called — see the header docblock's `logoutGOG` entry for the
  // full reasoning. This body therefore keeps its original synchronous try/catch (covers a
  // synchronously-throwing implementation/mock — the exact shape
  // `__tests__/runnerAuthFlows.test.ts` T-34.5-18 pins) AND additionally chains `.catch()` onto
  // the call's return value when it looks like a promise (covers a genuine async rejection,
  // which a synchronous try/catch cannot observe). Never awaited here — this stays a fire-and-
  // forget `send` channel by design, exactly as before.
  ipcMain.on('logoutGOG', () => {
    try {
      const result: unknown = GOGUser.logout()
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch((error) => {
          logSendFailure('logoutGOG', error)
        })
      }
    } catch (error) {
      logSendFailure('logoutGOG', error)
    }
  })
}
