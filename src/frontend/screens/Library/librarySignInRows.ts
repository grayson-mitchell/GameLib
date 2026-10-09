import {
  SIGN_IN_STORES,
  type SignInState,
  type SignInStore
} from 'common/signInState'

/**
 * Phase 49 D-09/D-11 -- the executable form of the Library sign-in notice's
 * row decision.
 *
 * WHY this is a standalone module rather than logic inlined in the
 * `LibrarySignInNotice` component: the component imports `./index.scss`, and
 * this repo's Frontend jest project has no jsdom and no stylesheet transform.
 * Anything that imports the component dies at that import before the first
 * assertion runs, so the decision is the only part Jest can prove directly --
 * the same extraction `librarySyncIndicator.ts` and `steamTileState.ts` use.
 *
 * The only runtime import is the canonical store order from `common`, which
 * itself has no imports.
 *
 * Row rules (R4, R5, D-11), walked in canonical `SIGN_IN_STORES` order so the
 * result is stable for every permutation of input state:
 *
 *   - `expired`                         -> a row, NEVER dismissible. The user
 *     had a working session and lost it; a dismiss must not be able to hide a
 *     proven expiry, so the dismissed set is not even consulted for this kind.
 *   - `not-connected`, not dismissed    -> a dismissible row. The store was
 *     simply never connected (or signed out on purpose), which is information,
 *     not a failure.
 *   - `not-connected`, dismissed        -> no row.
 *   - `connected` / `unknown`           -> no row. `unknown` means "could not
 *     tell" and must never be rendered as a sign-in problem.
 *
 * Two stores in the same state are two rows; rows are never merged.
 */

// Exported on purpose ahead of its first cross-module import: this is the
// public row shape plan 49-01 directs this module to publish for the
// `LibrarySignInNotice` component.
// ts-prune-ignore-next
export type LibrarySignInRowKind = 'expired' | 'not-connected'

// Same reason as `LibrarySignInRowKind` above: the component that renders
// these rows imports its stylesheet, so Jest proves the decision through
// this module and the component consumes the exported shape at runtime.
// ts-prune-ignore-next
export interface LibrarySignInRow {
  store: SignInStore
  kind: LibrarySignInRowKind
  dismissible: boolean
}

interface LibrarySignInRowsInput {
  states: Record<SignInStore, SignInState>
  /** The persisted dismissed set (`AppSettings.dismissedSignInNotices`). */
  dismissed: readonly SignInStore[]
}

export function resolveLibrarySignInRows({
  states,
  dismissed
}: LibrarySignInRowsInput): LibrarySignInRow[] {
  const rows: LibrarySignInRow[] = []
  for (const store of SIGN_IN_STORES) {
    const state = states[store]
    if (state === 'expired') {
      // A proven expiry always gets a row and ignores the dismissed set.
      rows.push({ store, kind: 'expired', dismissible: false })
    } else if (state === 'not-connected' && !dismissed.includes(store)) {
      rows.push({ store, kind: 'not-connected', dismissible: true })
    }
  }
  return rows
}
