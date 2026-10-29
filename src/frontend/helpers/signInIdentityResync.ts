/**
 * Quick 261029-quw item 2 -- re-read the five stores' sign-in identity fields
 * from their config stores.
 *
 * The Library sign-in notice derives its rows from renderer context
 * (`epic.username`, `gog.username`, `amazon.user_id`, `humble.isLoggedIn`,
 * `steam.username`). A login path that writes one of those from a value that
 * can be absent (a login response without a username, a Tauri OAuth payload
 * without `user_id`, a login that finished in the backend and never reached a
 * GlobalState wrapper) leaves the field stale, so the row stays on
 * `not-connected` until a restart re-runs the initial-state reads. This helper
 * is those reads, as a pure function: it returns only the slices (and, within
 * a slice, only the fields) whose identity differs from the store, so the
 * caller can skip `setState` entirely when nothing changed and a refresh can
 * never trigger a re-render loop.
 *
 * Pure and reader-injected on purpose: no `window.api`, no store imports, so a
 * node jest test covers it. The readers mirror the authoritative initial-state
 * expressions in `GlobalState.tsx`.
 */

type Maybe<T> = T | null | undefined

export interface SignInIdentityCurrent {
  epic: { username?: Maybe<string> }
  gog: { username?: Maybe<string> }
  amazon: { user_id?: Maybe<string>; username?: Maybe<string> }
  humble: {
    isLoggedIn?: Maybe<boolean>
    username?: Maybe<string>
    expired?: Maybe<boolean>
  }
  steam?: { username?: Maybe<string> }
}

export interface SignInIdentityReaders {
  /** legendary `userInfo.displayName` */
  legendaryDisplayName: () => Maybe<string>
  /** gog `userData.username` */
  gogUsername: () => Maybe<string>
  /** nile `userData.user_id` */
  nileUserId: () => Maybe<string>
  /** nile `userData.name` */
  nileName: () => Maybe<string>
  /** humble `isLoggedIn` */
  humbleIsLoggedIn: () => Maybe<boolean>
  /** humble `userData.username` */
  humbleUsername: () => Maybe<string>
  /** humble `expired` */
  humbleExpired: () => Maybe<boolean>
  /** steam `userData.username` */
  steamUsername: () => Maybe<string>
}

interface SignInIdentityPatch {
  epic?: { username?: string }
  gog?: { username?: string }
  amazon?: { user_id?: string; username?: string }
  humble?: { isLoggedIn?: boolean; username?: string; expired?: boolean }
  steam?: { username?: string }
}

// null, undefined and '' all mean "no identity", so a logout that wrote null
// does not read as different from a store that holds nothing.
const text = (v: Maybe<string>): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined

function diffText<K extends string>(
  out: Partial<Record<K, string | undefined>>,
  key: K,
  current: Maybe<string>,
  stored: Maybe<string>
): boolean {
  const next = text(stored)
  if (text(current) === next) return false
  out[key] = next
  return true
}

function diffFlag<K extends string>(
  out: Partial<Record<K, boolean>>,
  key: K,
  current: Maybe<boolean>,
  stored: Maybe<boolean>
): boolean {
  if (!!current === !!stored) return false
  out[key] = !!stored
  return true
}

export function resyncSignInIdentity(
  current: SignInIdentityCurrent,
  read: SignInIdentityReaders
): SignInIdentityPatch {
  const patch: SignInIdentityPatch = {}

  const epic: NonNullable<SignInIdentityPatch['epic']> = {}
  if (
    diffText(
      epic,
      'username',
      current.epic.username,
      read.legendaryDisplayName()
    )
  )
    patch.epic = epic

  const gog: NonNullable<SignInIdentityPatch['gog']> = {}
  if (diffText(gog, 'username', current.gog.username, read.gogUsername()))
    patch.gog = gog

  const amazon: NonNullable<SignInIdentityPatch['amazon']> = {}
  const amazonId = diffText(
    amazon,
    'user_id',
    current.amazon.user_id,
    read.nileUserId()
  )
  const amazonName = diffText(
    amazon,
    'username',
    current.amazon.username,
    read.nileName()
  )
  if (amazonId || amazonName) patch.amazon = amazon

  const humble: NonNullable<SignInIdentityPatch['humble']> = {}
  const humbleLogged = diffFlag(
    humble,
    'isLoggedIn',
    current.humble.isLoggedIn,
    read.humbleIsLoggedIn()
  )
  const humbleName = diffText(
    humble,
    'username',
    current.humble.username,
    read.humbleUsername()
  )
  const humbleExpired = diffFlag(
    humble,
    'expired',
    current.humble.expired,
    read.humbleExpired()
  )
  if (humbleLogged || humbleName || humbleExpired) patch.humble = humble

  const steam: NonNullable<SignInIdentityPatch['steam']> = {}
  if (
    diffText(steam, 'username', current.steam?.username, read.steamUsername())
  )
    patch.steam = steam

  return patch
}
