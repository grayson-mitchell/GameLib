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
 */

/**
 * The full set of triggers that can drive a Steam keyring read. `'startup'`
 * is the ONLY non-deliberate value — everything else names a deliberate
 * Steam user action.
 */
export type SteamAuthTrigger =
  | 'startup'
  | 'user-refresh'
  | 'game-page'
  | 'user-install'
  | 'user-play'
  | 'login'

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
  'login'
])

/**
 * Origin -> trigger ALLOWLIST (never a denylist — see `mapRefreshOriginToTrigger`'s
 * own doc comment for why). Every renderer-supplied `origin` string that is
 * NOT a key here maps to `'startup'`, the locked, least-privileged outcome.
 */
const ORIGIN_TO_TRIGGER: Readonly<Record<string, SteamAuthTrigger>> = {
  'action-icons-refresh-button': 'user-refresh',
  'nav-tabs-games-tab': 'user-refresh',
  'redeem-steam-key': 'user-refresh',
  'game-status': 'user-refresh',
  'login-success': 'login',
  'steam-login': 'login'
}

// ── Module-scoped, per-process state ────────────────────────────────────────

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
 */
export function mapRefreshOriginToTrigger(
  origin?: string | null
): SteamAuthTrigger {
  if (!origin) return 'startup'
  return ORIGIN_TO_TRIGGER[origin] ?? 'startup'
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
  noteSteamAuthTrigger(mapRefreshOriginToTrigger(origin))
}
