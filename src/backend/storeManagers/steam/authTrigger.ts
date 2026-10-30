/**
 * `authTrigger.ts` — the Steam keyring deferral gate + trigger-label seam
 * (quick task 260817-d61, D-DEFER-01/D-MEASURE-01/F-34.5-G6-06/REQ-28-02/
 * REQ-28-07/D-08).
 *
 * A LEAF module by design: it imports nothing from `library.ts`, `games.ts`,
 * `user.ts` or `keyringTokenStore.ts`, so every one of those can import this
 * module without creating a cycle. Module state lives at module scope (a
 * per-process singleton, matching the existing `activeTokenStore` pattern in
 * `tokenStore.ts`). Never persisted; never logs a token.
 *
 * Purpose: the observed 9:1 Steam keyring read-failure ratio is HYPOTHESISED
 * to be caused by a context-free macOS Keychain prompt fired unattended
 * during app bootstrap. This module is the single gate that decides whether
 * an automatic (`'startup'`) Steam refresh is allowed to reach the keyring at
 * all, and the single source of the `trigger=` label every `keyring_get`
 * issue/outcome/memo log line carries so the hypothesis can be re-measured on
 * real hardware.
 *
 * REVERSAL (Phase 49, D-14): quick task 260817-d61 kept an automatic Steam
 * refresh away from the keyring at boot. Phase 49 deliberately reverses that
 * for a signed-in account: the boot sign-in probe notes the backend-only
 * `'boot-probe'` trigger, which is deliberate and therefore sticky, so once the
 * pass has run the gate stays unlocked for the process and a later automatic
 * `SteamLibraryManager.refresh()` may open a CM connection where it used to
 * skip. The probe itself reads the keyring only and never connects (D-21); a
 * signed-out account never notes the trigger and never unlocks.
 *
 * REVERSAL (Phase 54, ROADMAP SC1): the sticky gate no longer lets an automatic
 * refresh log on. Only the one-shot grant below does, armed by an explicit
 * Refresh or a sign-in dispatch, so the boot-probe/mount race cannot reach an
 * authenticated logon (debug friends-signout-steam-user).
 */

/**
 * The full set of triggers that can drive a Steam keyring read. `'startup'`
 * is the ONLY non-deliberate value — everything else names a deliberate
 * Steam user action or, for `'boot-probe'`, the deliberate boot sign-in probe.
 */
export type SteamAuthTrigger =
  | 'startup'
  | 'user-refresh'
  | 'game-page'
  | 'user-install'
  | 'user-play'
  | 'login'
  | 'boot-probe'

/**
 * Every trigger except `'startup'`. Used both to decide whether a given
 * trigger unlocks the gate and, doc-comment-adjacent, as the single place
 * that enumerates "what counts as deliberate" — a Set (not a per-call
 * `!== 'startup'` check scattered around) means adding a new deliberate
 * trigger later is a one-line change here, not a hunt through call sites.
 */
const DELIBERATE_TRIGGERS: ReadonlySet<SteamAuthTrigger> = new Set([
  'user-refresh',
  'game-page',
  'user-install',
  'user-play',
  'login',
  'boot-probe'
])

/**
 * Origin -> trigger ALLOWLIST (never a denylist — see `mapRefreshOriginToTrigger`'s
 * own doc comment for why). Every renderer-supplied `origin` string that is
 * NOT a key here maps to `'startup'`, the locked, least-privileged outcome.
 *
 * `'boot-probe'` is a backend-only trigger and must NEVER be mapped from a
 * renderer origin: a renderer-reachable value would let the UI unlock Steam's
 * keyring gate on demand (T-49-16).
 */
const ORIGIN_TO_TRIGGER: Readonly<Record<string, SteamAuthTrigger>> = {
  'action-icons-refresh-button': 'user-refresh',
  'redeem-steam-key': 'user-refresh',
  // The "Retry Steam sync" button: an explicit user Refresh.
  'steam-sync-notice-retry': 'user-refresh',
  // Settings > Clear cache: a deliberate action that may have emptied the
  // list, so it must be able to repopulate it.
  'clear-cache': 'user-refresh',
  // The guided Go Offline dialog's retry.
  'steam-go-offline-retry': 'user-refresh',
  // Leaving the in-app Steam store after an app/cart/checkout page (quick
  // 261030-qqh): deliberate, the user just acted in the store. The renderer
  // gates it on sign-in, app/cart/checkout arming and a 2-minute throttle.
  'steam-store-exit': 'user-refresh',
  // Deliberately unmapped (-> 'startup'): 'game-status' (fires after every
  // install/Play status change), 'nav-tabs-games-tab' (browsing) and
  // 'login-screen' (navigation; a Steam sign-in already granted its own refresh
  // via 'login-success' / 'steam-login'). Play and browse must never log on.
  'login-success': 'login',
  'steam-login': 'login'
}

/**
 * The keyring gate (DELIBERATE_TRIGGERS, sticky) answers "may read the
 * keyring"; this set answers "may this ONE refresh open an authenticated CM
 * logon". 'boot-probe', 'game-page', 'user-play' and 'user-install' are
 * deliberately absent (installs acquire their own lease in depot/games).
 */
const LOGON_GRANTING_TRIGGERS: ReadonlySet<SteamAuthTrigger> = new Set([
  'user-refresh',
  'login'
])

// ── Module-scoped, per-process state ────────────────────────────────────────

let pendingRefreshLogonGrant: 'user-refresh' | 'login' | null = null
let unlocked = false
let lastTrigger: SteamAuthTrigger | undefined

/**
 * Records that `trigger` occurred. If `trigger` is deliberate and the gate
 * was previously locked, this is the locked->unlocked TRANSITION: the gate
 * is unlocked (sticky — see the module doc comment on why a non-sticky gate
 * would be a worse bug than the one this plan fixes) and `true` is returned.
 * A second (or later) deliberate note, or any `'startup'` note, returns
 * `false` — there is no transition to report.
 */
export function noteSteamAuthTrigger(trigger: SteamAuthTrigger): boolean {
  lastTrigger = trigger
  if (!DELIBERATE_TRIGGERS.has(trigger)) return false
  if (unlocked) return false
  unlocked = true
  return true
}

/** Whether the gate is currently unlocked. Sticky for the life of the process. */
export function isSteamAuthUnlocked(): boolean {
  return unlocked
}

/**
 * The trigger that unlocked the gate, or — while still locked — the most
 * recent trigger noted (which may itself be `'startup'`). Never `undefined`
 * (defaults to `'startup'`, the honest "nothing has happened yet" state) and
 * never a token value; this is a log label only.
 */
export function currentTriggerLabel(): string {
  return lastTrigger ?? 'startup'
}

/**
 * Restores the locked state. Used by tests (call in `beforeEach` so gate
 * state does not leak between specs in the same test file) and by Steam
 * logout, so a signed-out session does not leave a stale unlock behind for
 * whichever account signs in next.
 */
export function resetSteamAuthTrigger(): void {
  unlocked = false
  lastTrigger = undefined
  pendingRefreshLogonGrant = null
}

/**
 * Returns and clears the pending one-shot refresh logon grant. Called
 * synchronously as `refresh()`'s first statement, so a grant armed by the
 * dispatch that triggered this refresh is consumed by THIS refresh.
 */
export function consumeSteamRefreshLogonGrant():
  | 'user-refresh'
  | 'login'
  | null {
  const grant = pendingRefreshLogonGrant
  pendingRefreshLogonGrant = null
  return grant
}

/**
 * Maps a renderer-supplied `refreshLibrary` `origin` string to a
 * `SteamAuthTrigger`. This is an ALLOWLIST, not a denylist: only the origins
 * named in `ORIGIN_TO_TRIGGER` above are deliberate. An unrecognised,
 * missing, or newly-added-but-not-yet-listed origin falls through to
 * `'startup'` — the LOCKED, least-privileged outcome. A denylist would
 * silently classify any future automatic origin as deliberate the moment it
 * was added (nobody would notice until the keyring started prompting on
 * bootstrap again), reintroducing this exact defect with no code change to
 * this file. `'mount'` and `'push'` are automatic origins and are
 * deliberately NOT listed here — they fall through to `'startup'` along with
 * everything else unrecognised.
 *
 * 49-REVIEW WR-04: the lookup below is own-property-guarded because
 * `ORIGIN_TO_TRIGGER` is a plain object literal and therefore inherits from
 * `Object.prototype`. A bare bracket index on `'__proto__'` or
 * `'constructor'` would resolve through the prototype chain to an object or
 * a function instead of `undefined`, which slips past a `?? 'startup'`
 * fallback and breaks `currentTriggerLabel()`'s "never undefined, a log
 * label" string contract. Same shared pattern, same reasoning, as the
 * renderer-origin guard at `steamFlowRegistration.ts`'s T-34.5-C4-10 site.
 */
export function mapRefreshOriginToTrigger(
  origin?: string | null
): SteamAuthTrigger {
  if (typeof origin !== 'string' || origin.length === 0) return 'startup'
  if (!Object.prototype.hasOwnProperty.call(ORIGIN_TO_TRIGGER, origin)) {
    return 'startup'
  }
  return ORIGIN_TO_TRIGGER[origin]
}

/**
 * Notes a refresh trigger derived from a `refreshLibrary` dispatch, but ONLY
 * when the dispatch is Steam-inclusive: `runner === 'steam'`, or `runner` is
 * `undefined` / `null` / `'all'` (the three shapes that already include
 * Steam in `libraryManagerMap`'s fan-out — see `main.ts`/`steamFlowRegistration.ts`).
 * A named NON-Steam runner (a GOG login, an Epic refresh) must NEVER unlock
 * the Steam keyring gate — that would be a privilege-escalation bug (T-d61-03):
 * a user acting on an unrelated store would silently arm a Steam Keychain
 * read they never asked for. Steam-inclusive dispatches route the origin
 * through the allowlist above; everything else is a no-op.
 */
export function noteRefreshTrigger(
  runner: string | null | undefined,
  origin?: string | null
): void {
  const steamInclusive =
    runner === 'steam' ||
    runner === undefined ||
    runner === null ||
    runner === 'all'
  if (!steamInclusive) return
  const trigger = mapRefreshOriginToTrigger(origin)
  noteSteamAuthTrigger(trigger)
  if (
    (trigger === 'user-refresh' || trigger === 'login') &&
    LOGON_GRANTING_TRIGGERS.has(trigger)
  ) {
    pendingRefreshLogonGrant = trigger
  }
}
