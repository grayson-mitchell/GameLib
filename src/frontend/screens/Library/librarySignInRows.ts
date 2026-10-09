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
 * This tracer carries the `expired` slice only. The `not-connected` kind and
 * the dismissed-set input arrive in plan 49-09 Task 1.
 */

// Exported on purpose ahead of its first cross-module import: this is the
// public row shape plan 49-01 directs this module to publish for the
// `LibrarySignInNotice` component, and plan 49-09 widens it (`not-connected`).
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
}

export function resolveLibrarySignInRows({
  states
}: LibrarySignInRowsInput): LibrarySignInRow[] {
  const rows: LibrarySignInRow[] = []
  for (const store of SIGN_IN_STORES) {
    // A proven expiry always gets a row and is never dismissible: the user
    // had a working session and lost it.
    if (states[store] === 'expired') {
      rows.push({ store, kind: 'expired', dismissible: false })
    }
  }
  return rows
}
