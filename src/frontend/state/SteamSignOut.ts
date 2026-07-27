import { SteamUserData } from 'common/types/steam'

/**
 * Phase 34.4 gap fix (in-phase deviation, live-gate item 2 / REQ-34.4-02):
 * the real Steam sign-out flow GlobalState.tsx's `steamLogout` delegates to.
 *
 * `logoutSteam` (`preload/api/steam.ts`'s `makeListenerCaller`) is a `send`
 * channel with NO response protocol at all -- the call returns as soon as
 * the message is dispatched, before `SteamUser.logout()` (`steam/user.ts:249`)
 * has actually run, let alone finished. `SteamUser.logout()` is async (it
 * awaits `getTokenStore().clearToken()`, which may be an RPC round-trip to
 * Rust's keyring seam under Tauri) -- so firing `logoutSteam` and *then*
 * immediately clearing local state / reloading is a race: if the reload
 * wins, `steamConfigStore.userData` (not yet cleared) rehydrates the same
 * signed-in identity on reload and the tile silently reverts to "Logout".
 * That was the original G-30-01 symptom. A Tauri-only guard added at the
 * time short-circuited `steamLogout` before it ever called `logoutSteam`,
 * on the premise that no sidecar listener existed at all for it (true at
 * the time -- no longer true since Phase 34.4 Plan 01 registered
 * `steamAuthFlowRegistration.ts`'s `ipcMain.on('logoutSteam', ...)`). That
 * guard is gone from GlobalState.tsx; `performSteamLogout` below is what
 * replaces it, for BOTH builds (Electron's `ipcRenderer.send` is exactly as
 * fire-and-forget as the Tauri sidecar's stdio transport, so the same race
 * existed there too, just less visibly -- this is not a Tauri-only fix).
 *
 * The chosen signed-out signal is `getSteamUserInfo` (an `invoke`, so unlike
 * `logoutSteam` it has a real completion signal): `SteamUser.logout()` calls
 * `configStore.delete('userData')`, and `SteamUser.getUserDetails()` (what
 * `getSteamUserInfo` delegates to) reads that exact same
 * `configStore.get_nodefault('userData')` key -- so it resolves to
 * `undefined` once, and only once, logout has actually run. Both Electron
 * (`main.ts:918`'s `addHandler('getSteamUserInfo', ...)`) and the Tauri
 * sidecar (`steamAuthFlowRegistration.ts`'s
 * `ipcMain.handle('getSteamUserInfo', ...)`) call the identical
 * `SteamUser.getUserDetails()`, so this signal is real and equally valid in
 * both builds.
 *
 * Extracted as standalone, directly-testable functions (mirrors
 * SteamClientSetup.ts's `handleSteamClientSetupRequiredSignal`) rather than
 * inlined in GlobalState.tsx, for two reasons: the race-handling logic can
 * be proven with real behavioral tests, and GlobalState.tsx itself is NOT
 * safely importable under this project's `node`-environment frontend jest
 * project (it reads `window.localStorage` at module scope -- see
 * `src/frontend/jest.config.js`'s docstring on why there is no DOM harness
 * here at all).
 */

export interface WaitForSteamSignedOutOptions {
  /** Total number of `getSteamUserInfo` reads attempted before giving up. */
  maxAttempts?: number
  /** Delay between reads, in milliseconds. */
  intervalMs?: number
  /** Injectable so tests can resolve instantly instead of waiting for real timers. */
  delay?: (ms: number) => Promise<void>
}

const defaultDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

// 20 attempts * 150ms = 3s worst-case bound. Generous enough for a keyring
// RPC round-trip, short enough that a genuinely broken sign-out surfaces the
// honest failure dialog quickly rather than hanging the UI.
export const STEAM_SIGN_OUT_DEFAULT_MAX_ATTEMPTS = 20
export const STEAM_SIGN_OUT_DEFAULT_INTERVAL_MS = 150

/**
 * Polls `getSteamUserInfo` until it reports signed-out (`undefined`/falsy)
 * or `maxAttempts` is exhausted. Returns `true` once confirmed signed-out,
 * `false` on timeout -- callers MUST treat `false` as a real failure (surface
 * an honest error), never as a silent success.
 *
 * `getSteamUserInfo` is a real `invoke` channel, so a single read can reject
 * (transport hiccup across the IPC seam, an unhandled exception inside
 * `SteamUser.getUserDetails()`, etc). A rejection on one attempt is not a
 * definitive answer -- it means "this read didn't confirm signed-out", the
 * same as a resolved-but-still-signed-in read, so it's treated identically:
 * logged, then retried on the next attempt within the existing budget. This
 * is required, not just nice-to-have -- `performSteamLogout` below depends on
 * this promise always *settling* (never rejecting) so it can call exactly
 * one of `onSignedOut` / `onSignOutFailed`, per its own documented contract.
 * Letting a rejection propagate out of this loop would break that contract
 * silently (WR-01): neither callback would run, and the caller would be left
 * with stale local state and no failure dialog. `console.warn` (not
 * `window.api.logInfo`) is deliberate: this module is extracted precisely so
 * it has no `window` dependency and stays importable under this project's
 * `node`-environment frontend jest project (see the module docstring above).
 */
export async function waitForSteamSignedOut(
  getSteamUserInfo: () => Promise<SteamUserData | undefined>,
  {
    maxAttempts = STEAM_SIGN_OUT_DEFAULT_MAX_ATTEMPTS,
    intervalMs = STEAM_SIGN_OUT_DEFAULT_INTERVAL_MS,
    delay = defaultDelay
  }: WaitForSteamSignedOutOptions = {}
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const userInfo = await getSteamUserInfo()
      if (!userInfo) {
        return true
      }
    } catch (error) {
      // Transient, not terminal: treat a failed read the same as "still
      // signed in" for this attempt and keep polling until the budget
      // above is exhausted. See the docstring above for why this must
      // never propagate out of this loop.
      console.warn(
        `[SteamSignOut] getSteamUserInfo poll attempt ${attempt + 1}/${maxAttempts} failed, retrying:`,
        error
      )
    }
    if (attempt < maxAttempts - 1) {
      await delay(intervalMs)
    }
  }
  return false
}

export interface PerformSteamLogoutDeps {
  logoutSteam: () => void
  getSteamUserInfo: () => Promise<SteamUserData | undefined>
  /** Called exactly once, only after sign-out is confirmed. */
  onSignedOut: () => void
  /** Called exactly once, only if the poll window is exhausted without confirmation. */
  onSignOutFailed: () => void
  waitOptions?: WaitForSteamSignedOutOptions
}

/**
 * Orchestrates the full sign-out flow: fires the fire-and-forget
 * `logoutSteam` send, polls for confirmation via `waitForSteamSignedOut`,
 * then calls exactly one of `onSignedOut` / `onSignOutFailed` -- never both,
 * never neither, and never `onSignedOut` before confirmation lands. This is
 * the race fix: the caller's local-state clear + reload (Electron) or
 * whatever else `onSignedOut` does must not run until this promise settles.
 */
export async function performSteamLogout({
  logoutSteam,
  getSteamUserInfo,
  onSignedOut,
  onSignOutFailed,
  waitOptions
}: PerformSteamLogoutDeps): Promise<void> {
  logoutSteam()

  const signedOut = await waitForSteamSignedOut(getSteamUserInfo, waitOptions)

  if (signedOut) {
    onSignedOut()
  } else {
    onSignOutFailed()
  }
}
