/**
 * Phase 49 R4/R5 -- the full Library sign-in row decision (D-09, D-10, D-11).
 *
 * The decision is a pure function over the five derived sign-in states and the
 * persisted dismissed set, so it is proven directly here with the real pure
 * modules and no mocks (the component itself cannot be imported under the
 * Frontend project's node environment -- see `librarySignInRows.ts`).
 */
import {
  SIGN_IN_STORES,
  type SignInState,
  type SignInStore
} from 'common/signInState'
import {
  addSignInDismissal,
  normalizeSignInDismissals,
  rearmSignInDismissals
} from 'common/signInDismissal'
import { resolveLibrarySignInRows } from '../librarySignInRows'

function statesWith(
  base: SignInState,
  overrides: Partial<Record<SignInStore, SignInState>> = {}
): Record<SignInStore, SignInState> {
  return {
    legendary: base,
    gog: base,
    nile: base,
    humble: base,
    steam: base,
    ...overrides
  }
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]]
  }
  const out: T[][] = []
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)]
    for (const tail of permutations(rest)) {
      out.push([item, ...tail])
    }
  })
  return out
}

describe('resolveLibrarySignInRows -- which stores get a row (R4)', () => {
  it('all five connected -> no rows', () => {
    expect(
      resolveLibrarySignInRows({
        states: statesWith('connected'),
        dismissed: []
      })
    ).toEqual([])
  })

  it('all five unknown -> no rows (unknown is never a row)', () => {
    expect(
      resolveLibrarySignInRows({
        states: statesWith('unknown'),
        dismissed: []
      })
    ).toEqual([])
  })

  it('one expired store -> exactly one non-dismissible expired row', () => {
    expect(
      resolveLibrarySignInRows({
        states: statesWith('connected', { steam: 'expired' }),
        dismissed: []
      })
    ).toEqual([{ store: 'steam', kind: 'expired', dismissible: false }])
  })

  it('one never-connected store -> one dismissible not-connected row', () => {
    expect(
      resolveLibrarySignInRows({
        states: statesWith('connected', { humble: 'not-connected' }),
        dismissed: []
      })
    ).toEqual([{ store: 'humble', kind: 'not-connected', dismissible: true }])
  })

  it('two stores in the same state are two rows, never merged (adjacency)', () => {
    const rows = resolveLibrarySignInRows({
      states: statesWith('connected', {
        gog: 'not-connected',
        nile: 'not-connected'
      }),
      dismissed: []
    })
    expect(rows).toEqual([
      { store: 'gog', kind: 'not-connected', dismissible: true },
      { store: 'nile', kind: 'not-connected', dismissible: true }
    ])
  })
})

describe('resolveLibrarySignInRows -- canonical order (R4)', () => {
  it('yields SIGN_IN_STORES order for every permutation of a fixed state set', () => {
    const assignment: Record<SignInStore, SignInState> = {
      legendary: 'expired',
      gog: 'not-connected',
      nile: 'expired',
      humble: 'not-connected',
      steam: 'expired'
    }
    const orders = permutations([...SIGN_IN_STORES])
    // Self-asserted case count: 5! = 120. A generator that silently produced
    // fewer permutations would make the loop below vacuous.
    expect(orders).toHaveLength(120)

    for (const order of orders) {
      // Rebuild the input with its keys inserted in this permutation's order,
      // so the result can only be canonical if the function walks
      // SIGN_IN_STORES rather than the object's key order.
      const states = {} as Record<SignInStore, SignInState>
      for (const store of order) {
        states[store] = assignment[store]
      }
      const rows = resolveLibrarySignInRows({ states, dismissed: [] })
      expect(rows.map((row) => row.store)).toEqual([...SIGN_IN_STORES])
    }
  })
})

describe('resolveLibrarySignInRows -- dismissal (R5)', () => {
  it('a dismissed not-connected store has no row', () => {
    expect(
      resolveLibrarySignInRows({
        states: statesWith('connected', { gog: 'not-connected' }),
        dismissed: ['gog']
      })
    ).toEqual([])
  })

  it('an expired store listed as dismissed still has a non-dismissible row', () => {
    expect(
      resolveLibrarySignInRows({
        states: statesWith('connected', { gog: 'expired' }),
        dismissed: ['gog']
      })
    ).toEqual([{ store: 'gog', kind: 'expired', dismissible: false }])
  })

  it('dismissing twice produces the same rows as dismissing once', () => {
    const states = statesWith('not-connected')
    const once = addSignInDismissal([], 'gog')
    const twice = addSignInDismissal(once, 'gog')
    expect(resolveLibrarySignInRows({ states, dismissed: twice })).toEqual(
      resolveLibrarySignInRows({ states, dismissed: once })
    )
  })

  it('a restart keeps the dismissal: the persisted value normalises back to the same omission', () => {
    const persisted: unknown = ['gog']
    const states = statesWith('connected', { gog: 'not-connected' })
    const rows = resolveLibrarySignInRows({
      states,
      dismissed: normalizeSignInDismissals(persisted)
    })
    expect(rows.map((row) => row.store)).not.toContain('gog')
  })

  it('connect-then-expire re-arms the dismissal once, and the not-connected row re-shows exactly once', () => {
    let dismissed: SignInStore[] = ['gog']

    // 1. dismissed while never connected: no row.
    const neverConnected = statesWith('connected', { gog: 'not-connected' })
    expect(
      resolveLibrarySignInRows({ states: neverConnected, dismissed })
    ).toEqual([])

    // 2. the user connects: still no row; the dismissal is not pruned.
    const connected = statesWith('connected')
    dismissed = rearmSignInDismissals(dismissed, connected)
    expect(dismissed).toEqual(['gog'])
    expect(resolveLibrarySignInRows({ states: connected, dismissed })).toEqual(
      []
    )

    // 3. the session expires: an expired row, and the re-arm drops 'gog'.
    const expired = statesWith('connected', { gog: 'expired' })
    dismissed = rearmSignInDismissals(dismissed, expired)
    expect(dismissed).toEqual([])
    expect(resolveLibrarySignInRows({ states: expired, dismissed })).toEqual([
      { store: 'gog', kind: 'expired', dismissible: false }
    ])

    // 4. signed out again: the not-connected row re-shows, dismissible,
    //    exactly once.
    const again = resolveLibrarySignInRows({
      states: neverConnected,
      dismissed
    })
    expect(again).toEqual([
      { store: 'gog', kind: 'not-connected', dismissible: true }
    ])
    expect(again.filter((row) => row.store === 'gog')).toHaveLength(1)

    // A second re-arm application changes nothing.
    expect(rearmSignInDismissals(dismissed, expired)).toEqual(dismissed)
  })
})
