/**
 * Phase 49 R5 -- the pure dismissal helpers (D-10).
 *
 * Idempotency edges: dismissing twice equals once; re-arming a store that is
 * `expired` removes it exactly once and a second application is a no-op.
 */
import {
  addSignInDismissal,
  normalizeSignInDismissals,
  rearmSignInDismissals
} from '../signInDismissal'
import type { SignInState, SignInStore } from '../signInState'

function statesWith(
  overrides: Partial<Record<SignInStore, SignInState>>
): Record<SignInStore, SignInState> {
  return {
    legendary: 'connected',
    gog: 'connected',
    nile: 'connected',
    humble: 'connected',
    steam: 'connected',
    ...overrides
  }
}

describe('addSignInDismissal', () => {
  it('adds a store to an empty set', () => {
    expect(addSignInDismissal([], 'gog')).toEqual(['gog'])
  })

  it('dismissing twice equals dismissing once', () => {
    const once = addSignInDismissal([], 'gog')
    expect(addSignInDismissal(once, 'gog')).toEqual(once)
  })

  it('returns canonical SIGN_IN_STORES order regardless of insertion order', () => {
    const result = addSignInDismissal(
      addSignInDismissal(['steam'], 'legendary'),
      'nile'
    )
    expect(result).toEqual(['legendary', 'nile', 'steam'])
  })

  it('does not mutate its input', () => {
    const input = Object.freeze(['gog'] as SignInStore[])
    expect(() => addSignInDismissal(input, 'nile')).not.toThrow()
  })
})

describe('rearmSignInDismissals', () => {
  it('removes a dismissed store whose state is expired', () => {
    expect(
      rearmSignInDismissals(['gog', 'nile'], statesWith({ gog: 'expired' }))
    ).toEqual(['nile'])
  })

  it('re-arms exactly once: a second application returns an equal array', () => {
    const states = statesWith({ gog: 'expired' })
    const first = rearmSignInDismissals(['gog', 'nile'], states)
    expect(rearmSignInDismissals(first, states)).toEqual(first)
    expect(first).toEqual(['nile'])
  })

  it('never removes a store that is connected or not-connected', () => {
    const states = statesWith({ gog: 'not-connected', nile: 'connected' })
    expect(rearmSignInDismissals(['gog', 'nile'], states)).toEqual([
      'gog',
      'nile'
    ])
  })

  it('does not mutate its input', () => {
    const input = Object.freeze(['gog'] as SignInStore[])
    expect(() =>
      rearmSignInDismissals(input, statesWith({ gog: 'expired' }))
    ).not.toThrow()
  })
})

describe('normalizeSignInDismissals', () => {
  it.each([undefined, null, 'gog', {}])('turns %p into []', (value) => {
    expect(normalizeSignInDismissals(value)).toEqual([])
  })

  it('drops unknown entries and dedupes', () => {
    expect(normalizeSignInDismissals(['gog', 'zoom', 'gog'])).toEqual(['gog'])
  })

  it('returns canonical order', () => {
    expect(normalizeSignInDismissals(['steam', 'legendary'])).toEqual([
      'legendary',
      'steam'
    ])
  })
})
