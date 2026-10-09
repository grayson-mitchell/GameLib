/**
 * Phase 49 R1 -- the sign-in selector's truth table, over all five stores.
 *
 * The module under test was introduced by the tracer (plan 49-01 Task 1);
 * this file pins its full contract. Test 2 is the regression guard for the
 * one rule whose order matters (D-07, RESEARCH Pitfall 3): a latched expiry
 * flag must beat `loggedIn: false`, because legendary deletes `user.json` on
 * the very verdict that latches the flag.
 */
import {
  SIGN_IN_STORES,
  parseSignInStore,
  resolveSignInState,
  resolveSignInStates,
  sanitizeSignInProbeOutcomeMap,
  type SignInProbeOutcome,
  type SignInSelectorInput,
  type SignInSelectorInputs,
  type SignInState,
  type SignInStore
} from '../signInState'

const OUTCOMES: Array<SignInProbeOutcome | undefined> = [
  'healthy',
  'expired',
  'unknown',
  undefined
]
const FOUR_STATES: readonly SignInState[] = [
  'connected',
  'not-connected',
  'expired',
  'unknown'
]

/** The rule table, written independently of the implementation. */
function predict(
  loggedIn: boolean,
  expiredFlag: boolean,
  outcome: SignInProbeOutcome | undefined
): SignInState {
  if (expiredFlag) return 'expired'
  if (!loggedIn) return 'not-connected'
  if (outcome === 'healthy') return 'connected'
  return 'unknown'
}

interface TableRow {
  store: SignInStore
  loggedIn: boolean
  expiredFlag: boolean
  outcome: SignInProbeOutcome | undefined
}

const table: TableRow[] = []
for (const store of SIGN_IN_STORES) {
  for (const loggedIn of [true, false]) {
    for (const expiredFlag of [true, false]) {
      for (const outcome of OUTCOMES) {
        table.push({ store, loggedIn, expiredFlag, outcome })
      }
    }
  }
}

describe('R1: exhaustive selector table', () => {
  it('enumerates 5 stores x 2 x 2 x 4 = 80 cases', () => {
    expect(table).toHaveLength(80)
  })

  it.each(table)(
    '$store loggedIn=$loggedIn expiredFlag=$expiredFlag outcome=$outcome -> one of four states',
    ({ store, loggedIn, expiredFlag, outcome }) => {
      const inputs = {} as SignInSelectorInputs
      for (const s of SIGN_IN_STORES) {
        inputs[s] = { loggedIn: false, expiredFlag: false, outcome: undefined }
      }
      inputs[store] = { loggedIn, expiredFlag, outcome }

      const state = resolveSignInStates(inputs)[store]
      expect(state).toBe(predict(loggedIn, expiredFlag, outcome))
      expect(FOUR_STATES).toContain(state)
    }
  )
})

describe('D-07 precedence', () => {
  it('expiredFlag yields expired for all 8 loggedIn x outcome combinations, including logged out', () => {
    let seen = 0
    for (const loggedIn of [true, false]) {
      for (const outcome of OUTCOMES) {
        expect(
          resolveSignInState({ loggedIn, expiredFlag: true, outcome })
        ).toBe('expired')
        seen += 1
      }
    }
    expect(seen).toBe(8)
  })

  it('logged in, no flag: pending/unknown/expired outcomes are unknown, healthy is connected', () => {
    for (const outcome of [undefined, 'unknown', 'expired'] as const) {
      expect(
        resolveSignInState({ loggedIn: true, expiredFlag: false, outcome })
      ).toBe('unknown')
    }
    expect(
      resolveSignInState({
        loggedIn: true,
        expiredFlag: false,
        outcome: 'healthy'
      })
    ).toBe('connected')
  })

  it('not-connected needs no probe at all', () => {
    for (const outcome of OUTCOMES) {
      expect(
        resolveSignInState({ loggedIn: false, expiredFlag: false, outcome })
      ).toBe('not-connected')
    }
  })

  it('RED specimen: a logged-in-first reimplementation misreports a proven expiry, which the real module never does', () => {
    // The wrong order the header warns about -- branches 1 and 2 swapped.
    const wrongOrder = (input: SignInSelectorInput): SignInState => {
      if (!input.loggedIn) return 'not-connected'
      if (input.expiredFlag) return 'expired'
      if (input.outcome === 'healthy') return 'connected'
      return 'unknown'
    }
    const legendaryAfterVerdict: SignInSelectorInput = {
      loggedIn: false,
      expiredFlag: true,
      outcome: undefined
    }

    expect(wrongOrder(legendaryAfterVerdict)).toBe('not-connected')
    expect(resolveSignInState(legendaryAfterVerdict)).toBe('expired')
    expect(resolveSignInState(legendaryAfterVerdict)).not.toBe(
      wrongOrder(legendaryAfterVerdict)
    )
  })
})

describe('R1 idempotency', () => {
  it('is pure: repeated calls on frozen input are deep-equal and do not mutate', () => {
    const inputs = {} as SignInSelectorInputs
    for (const store of SIGN_IN_STORES) {
      inputs[store] = Object.freeze({
        loggedIn: true,
        expiredFlag: store === 'steam',
        outcome: store === 'gog' ? 'healthy' : undefined
      }) as SignInSelectorInput
    }
    Object.freeze(inputs)

    const first = resolveSignInStates(inputs)
    const second = resolveSignInStates(inputs)

    expect(second).toEqual(first)
    expect(first).toEqual({
      legendary: 'unknown',
      gog: 'connected',
      nile: 'unknown',
      humble: 'unknown',
      steam: 'expired'
    })
  })
})

describe('R1 concurrency: a sign-in completing after a stale expired verdict', () => {
  it('flips from expired to connected', () => {
    const before = resolveSignInState({
      loggedIn: true,
      expiredFlag: true,
      outcome: 'expired'
    })
    const after = resolveSignInState({
      loggedIn: true,
      expiredFlag: false,
      outcome: 'healthy'
    })
    expect(before).toBe('expired')
    expect(after).toBe('connected')
  })
})

describe('parseSignInStore (T-49-01)', () => {
  it.each(['legendary', 'gog', 'nile', 'humble', 'steam'])(
    'accepts %s',
    (id) => {
      expect(parseSignInStore(id)).toBe(id)
    }
  )

  it.each([
    '',
    null,
    undefined,
    'zoom',
    'sideload',
    '__proto__',
    'constructor',
    'steam/../gog',
    'STEAM',
    42
  ])('rejects %p', (value) => {
    expect(parseSignInStore(value)).toBeNull()
  })
})

describe('sanitizeSignInProbeOutcomeMap', () => {
  it('keeps a known store with a known outcome', () => {
    expect(sanitizeSignInProbeOutcomeMap({ gog: 'expired' })).toEqual({
      gog: 'expired'
    })
  })

  it('drops an unknown store key', () => {
    expect(sanitizeSignInProbeOutcomeMap({ zoom: 'healthy' })).toEqual({})
  })

  it('drops an unknown outcome value', () => {
    expect(sanitizeSignInProbeOutcomeMap({ gog: 'connected' })).toEqual({})
  })

  it.each([null, 'steam', ['steam'], undefined, 7])(
    'returns {} for non-object input %p',
    (value) => {
      expect(sanitizeSignInProbeOutcomeMap(value)).toEqual({})
    }
  )
})
