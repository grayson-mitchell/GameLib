/**
 * Focus-row selection: the single validity guard and the one-time seed from the
 * retired `libraryTopSection` setting (Phase 48 Plan 05, SPEC R7).
 *
 * Unlike `trayIconVariant.ts`, this module is NOT self-contained: that file is
 * self-contained only because `common/types.ts` imports `TrayIconVariant` from
 * it. Here the dependency runs the other way (`FocusRowSelection` is declared
 * in `common/types.ts`), so there is no cycle.
 *
 * TWO-STORE HAZARD (CR-01). One setting lives in two stores: `config.json`
 * `defaultSettings` (read by `GlobalConfigV0.getSettings()`, where the legacy
 * seed is derived) and the `store/config.json` `settings` mirror (read by the
 * renderer synchronously at module scope). Only `setSetting`/`writeConfig`
 * write the mirror, and both spread the OLD mirror, so a seed derived in
 * `getSettings()` never entered it and the renderer never saw it.
 * `seedFocusRowFromMirror` + `hydrateFocusRowSelection` close that: the mirror
 * stays the renderer's primary source, and the backend's migrated value is
 * fetched once, only while the mirror lacks the key, then written back through
 * the one setter.
 */
import { FocusRowSelection } from 'common/types'

/**
 * The four members of `LibraryView` (`src/frontend/types.ts`). `src/common`
 * cannot import from `src/frontend`, so the list is duplicated on purpose; the
 * anti-drift guard is `focusRowSelectors.test.ts`'s
 * `satisfies Record<LibraryView, true>` case: `tsc` (`pnpm codecheck`) forces
 * the test's own `ALL_VIEWS` to gain any new `LibraryView` member, and that
 * test's runtime `isValidFocusRowSelection` loop then fails if this list was
 * not updated too. Codecheck alone never inspects this list. Not exported.
 */
const FOCUS_ROW_VIEW_VALUES = [
  'all',
  'installed',
  'recentlyPlayed',
  'favourites'
] as const

/**
 * A real shape guard over an untrusted persisted value -- the mitigation for
 * T-48-03. Precedent: `engineWiring.ts`'s WR-04 note, where a malformed
 * localStorage value threw out of a memo and blanked the whole Library
 * screen. Checks shape (object, non-null, `kind` one of the four literals,
 * `value` a non-empty string) -- plus, for `kind: 'view'` ONLY, that `value` is
 * one of the four real views (WR-01): an unknown view used to fall through
 * `passesView`'s default arm and render a strip of ALL games. The other three
 * kinds are not membership-checked; a `collection`/`store`/`runnability` value
 * naming nothing simply selects no games, never throws.
 *
 * Defined HERE (a `src/common` module cannot import from `src/frontend`) and
 * re-exported from `focusRowSelectors.ts`, so there is exactly one definition
 * of "a valid focus-row selection" in the tree.
 */
export function isValidFocusRowSelection(
  value: unknown
): value is NonNullable<FocusRowSelection> {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  const { kind, value: pickValue } = candidate
  if (
    kind !== 'view' &&
    kind !== 'collection' &&
    kind !== 'store' &&
    kind !== 'runnability'
  ) {
    return false
  }
  if (typeof pickValue !== 'string' || pickValue.length === 0) {
    return false
  }
  if (
    kind === 'view' &&
    !(FOCUS_ROW_VIEW_VALUES as readonly string[]).includes(pickValue)
  ) {
    return false
  }
  return true
}

/**
 * Derives the persisted `focusRow` from a profile's RAW stored settings.
 * Precedence:
 *
 * 1. `focusRow` PRESENT (the key exists, whatever its value) -> it wins and
 *    permanently disarms the seed. Valid -> returned unchanged; `null` is a
 *    legitimate "off" selection (the user cleared the row); invalid -> `null`
 *    (WR-02). In no case is `libraryTopSection` consulted, so neither a cleared
 *    row nor a corrupt one is ever resurrected on relaunch.
 * 2. Otherwise the legacy `libraryTopSection` seeds it once:
 *    `recently_played` and `recently_played_installed` -> the recentlyPlayed
 *    view (operator ruling: recency kept, the installed-only qualifier is
 *    dropped -- the shape has no slot for a modifier); `favourites` -> the
 *    favourites view; `disabled`, absent or unrecognised -> `null`.
 *
 * Total: never throws; every degenerate input yields `null`.
 *
 * ORDERING TRAP: pass the RAW on-disk object, never the factory-default-merged
 * one. The factory default carries `focusRow: null`, and `null` is a
 * legitimate present value, so migrating the merged object would always
 * short-circuit on rule 1 and silently discard every legacy
 * `libraryTopSection`. That is a sharper version of the trap in
 * `migrateTrayIconVariant`: there the default merely out-ranked the legacy
 * value, here it is indistinguishable from a deliberate user clear.
 */
export function migrateFocusRowSelection(
  stored: { focusRow?: unknown; libraryTopSection?: unknown } | null | undefined
): FocusRowSelection {
  // `in`, not `stored?.focusRow !== undefined`: only `in` tells "key present
  // with value null" apart from "key absent", and that is the whole guard.
  if (stored !== null && stored !== undefined && 'focusRow' in stored) {
    // Present key, valid or not: authoritative. Invalid becomes `null` and
    // never reaches the legacy switch below (WR-02).
    return isValidFocusRowSelection(stored.focusRow) ? stored.focusRow : null
  }

  switch (stored?.libraryTopSection) {
    case 'recently_played':
    case 'recently_played_installed':
      return { kind: 'view', value: 'recentlyPlayed' }
    case 'favourites':
      return { kind: 'view', value: 'favourites' }
    default:
      return null
  }
}

/**
 * What the renderer can decide SYNCHRONOUSLY at module scope from the
 * `store/config.json` `settings` mirror alone.
 *
 * `needsMigratedValue` is true exactly when the mirror has no `focusRow` key at
 * all: the profile has never been through first-launch hydration, so the seed
 * the backend derived from `libraryTopSection` (which lives in `config.json`,
 * not in the mirror) has not reached this renderer yet.
 */
interface FocusRowMirrorSeed {
  focusRow: FocusRowSelection
  needsMigratedValue: boolean
}

/**
 * The renderer's synchronous seed (CR-01). A PRESENT `focusRow` key is
 * authoritative even when its value is invalid (invalid becomes `null`): this is
 * the WR-02 rule mirrored on the renderer side, so a present key permanently
 * disarms the legacy seed. An absent key -- or a mirror that is absent or not an
 * object -- yields `null` plus `needsMigratedValue: true`, which tells
 * `GlobalState` to ask the backend for the migrated value once.
 *
 * Total: never throws.
 */
export function seedFocusRowFromMirror(
  mirrorSettings: unknown
): FocusRowMirrorSeed {
  if (
    mirrorSettings !== null &&
    typeof mirrorSettings === 'object' &&
    'focusRow' in mirrorSettings
  ) {
    const stored = (mirrorSettings as { focusRow: unknown }).focusRow
    return {
      focusRow: isValidFocusRowSelection(stored) ? stored : null,
      needsMigratedValue: false
    }
  }
  return { focusRow: null, needsMigratedValue: true }
}

export interface FocusRowHydrationDeps {
  /** `window.api.requestAppSettings`: reaches `GlobalConfig.get().getSettings()`. */
  requestAppSettings: () => Promise<unknown>
  /** `window.api.setSetting`: the one setter, which writes the mirror AND `config.json`. */
  setSetting: (payload: {
    appName: 'default'
    key: 'focusRow'
    value: FocusRowSelection
  }) => void
  applyFocusRow: (value: FocusRowSelection) => void
  /** True once the user has made their own pick; checked AFTER the await. */
  hasUserPicked: () => boolean
  onError: (error: unknown) => void
}

/**
 * First-launch hydration (CR-01): asks the backend for the migrated `focusRow`,
 * applies it, and persists it through the one setter so the key is present in
 * the mirror and in `config.json` from then on (which is what makes the seed
 * run once).
 *
 * NEVER rejects: the whole body is one try/catch that reports to `onError` and
 * resolves `undefined`, so a caller may `void` it without leaving an unhandled
 * rejection. The `onError` call is itself guarded (WR-03): a reporter that
 * throws must not escape the catch and turn the `void` into an unhandled
 * rejection. Resolves `undefined` when skipped (user picked first, or failure).
 */
export async function hydrateFocusRowSelection(
  deps: FocusRowHydrationDeps
): Promise<FocusRowSelection | undefined> {
  try {
    const settings = await deps.requestAppSettings()
    // After the await, not before: the race is a pick made while the IPC was in
    // flight, and that pick must never be overwritten.
    if (deps.hasUserPicked()) {
      return undefined
    }
    const migrated = (settings as { focusRow?: unknown } | null | undefined)
      ?.focusRow
    const value: FocusRowSelection = isValidFocusRowSelection(migrated)
      ? migrated
      : null
    deps.applyFocusRow(value)
    // Always write, `null` included: the write is what makes the key present.
    deps.setSetting({ appName: 'default', key: 'focusRow', value })
    return value
  } catch (error) {
    try {
      deps.onError(error)
    } catch (reportError) {
      // The reporter is the IPC bridge; if it is down too, the console is the
      // last place either error can go.
      console.error('focusRow hydration failed', error, reportError)
    }
    return undefined
  }
}
