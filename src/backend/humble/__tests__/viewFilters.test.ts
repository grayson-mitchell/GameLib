/**
 * Unit tests for the pure Keys-waiting / Giftable-spares membership + sort
 * helpers (D-53/D-54/D-55/D-56, HVIEW-01/HVIEW-02). The helpers live in
 * common/humble/viewFilters.ts (no React/i18n/I/O); this test sits in the
 * backend suite because jest's project roots only cover src/backend.
 */

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import {
  selectKeysWaiting,
  compareWaiting,
  matchesKeySearch,
  isGiftableSpare,
  isGiftable,
  WAITING_STATES,
  REDEEMABLE_ONLY_STATES
} from 'common/humble/viewFilters'
import { GENERIC_KEY_PLATFORM } from 'common/humble/genericKeyPlatform'

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk',
    machineName: `mn-${Math.random().toString(36).slice(2)}`,
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

describe('selectKeysWaiting', () => {
  test.each<HumbleKeyState>(['UNPICKED', 'UNREVEALED', 'REVEALED'])(
    'includes an unowned key in state %s',
    (state) => {
      const key = makeKey({ state, ownedElsewhere: false })
      expect(selectKeysWaiting([key])).toEqual([key])
    }
  )

  test('excludes an unowned key in state UNREDEEMABLE', () => {
    const key = makeKey({ state: 'UNREDEEMABLE', ownedElsewhere: false })
    expect(selectKeysWaiting([key])).toEqual([])
  })

  // 14-07 gap closure: REDEEMED is now produced ONLY by the user's local
  // "Mark as redeemed" action and is ALWAYS undoable — every REDEEMED key
  // stays visible here for its Undo affordance, with no annotation
  // cross-reference needed (this supersedes the WR-02 keep-visible /
  // CR-01 locallyRedeemedPending workarounds).
  test('14-07: includes an unowned REDEEMED (local, undoable) key', () => {
    const key = makeKey({ state: 'REDEEMED', ownedElsewhere: false })
    expect(selectKeysWaiting([key])).toEqual([key])
  })

  test('14-07: an ownedElsewhere REDEEMED key stays excluded', () => {
    const key = makeKey({
      state: 'REDEEMED',
      machineName: 'mn-1',
      ownedElsewhere: true
    })
    expect(selectKeysWaiting([key])).toEqual([])
  })

  // 14-07 gap closure: a key revealed through GameLib whose next sync sees
  // server redeemed_key_val now classifies REVEALED (not REDEEMED), so it
  // stays in WAITING_STATES naturally — no special annotation handling.
  test('14-07: a REVEALED key stays included without any annotations (Finish activation resume)', () => {
    const key = makeKey({ state: 'REVEALED', machineName: 'mn-1' })
    expect(selectKeysWaiting([key])).toEqual([key])
  })

  test.each<HumbleKeyState>([
    'UNPICKED',
    'UNREVEALED',
    'REVEALED',
    'REDEEMED',
    'UNREDEEMABLE'
  ])('excludes an ownedElsewhere key regardless of state (%s)', (state) => {
    const key = makeKey({ state, ownedElsewhere: true })
    expect(selectKeysWaiting([key])).toEqual([])
  })

  test('D-54: a fuzzy-matched ownedElsewhere key is excluded from waiting (matchConfidence is irrelevant)', () => {
    const key = makeKey({
      state: 'UNREVEALED',
      ownedElsewhere: true,
      matchConfidence: 'fuzzy'
    })
    expect(selectKeysWaiting([key])).toEqual([])
  })

  test.each<HumbleKeyState>(['UNPICKED', 'UNREVEALED', 'REVEALED'])(
    'D-53: excludes a generic-platform key in waiting state %s (checkpoint feedback — game keys only)',
    (state) => {
      const key = makeKey({
        state,
        ownedElsewhere: false,
        platform: 'generic'
      })
      expect(selectKeysWaiting([key])).toEqual([])
    }
  )

  test('D-53: a non-generic-platform key in a waiting state is unaffected', () => {
    const key = makeKey({
      state: 'UNREVEALED',
      ownedElsewhere: false,
      platform: 'steam'
    })
    expect(selectKeysWaiting([key])).toEqual([key])
  })

  test('D-56: a dated key always precedes an undated key', () => {
    const dated = makeKey({
      title: 'Z Game',
      expiration: '2026-08-01T00:00:00.000Z'
    })
    const undated = makeKey({ title: 'A Game', expiration: null })
    expect(selectKeysWaiting([undated, dated])).toEqual([dated, undated])
  })

  test('D-56: two dated keys order by soonest-expiring first', () => {
    const soon = makeKey({
      title: 'Soon Game',
      expiration: '2026-07-10T00:00:00.000Z'
    })
    const later = makeKey({
      title: 'Later Game',
      expiration: '2026-09-01T00:00:00.000Z'
    })
    expect(selectKeysWaiting([later, soon])).toEqual([soon, later])
  })

  test('D-56: two undated keys order alphabetically by title', () => {
    const zebra = makeKey({ title: 'Zebra Quest', expiration: null })
    const alpha = makeKey({ title: 'Alpha Quest', expiration: null })
    expect(selectKeysWaiting([zebra, alpha])).toEqual([alpha, zebra])
  })

  test('result is a single flat array, not grouped', () => {
    const a = makeKey({ state: 'UNPICKED', title: 'A' })
    const b = makeKey({ state: 'UNREVEALED', title: 'B' })
    const c = makeKey({ state: 'REVEALED', title: 'C' })
    const result = selectKeysWaiting([a, b, c])
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3)
  })
})

describe('compareWaiting — the surviving comparator (REQ-43-05)', () => {
  // This is the ONE case that distinguished compareWaiting from the grouped
  // presentation's own deleted comparator, which returned 0 for two undated
  // keys and would leave Humble's insertion order — a silent, cosmetic
  // regression nobody would catch in review. See the mutation proof recorded
  // in 43-04-SUMMARY.md.
  test('two undated keys supplied out of alphabetical order sort alphabetically by title', () => {
    const zebra = makeKey({ title: 'Zebra Quest', expiration: null })
    const alpha = makeKey({ title: 'Alpha Quest', expiration: null })
    const middle = makeKey({ title: 'Middle Quest', expiration: null })
    const result = [zebra, middle, alpha].sort(compareWaiting)
    expect(result).toEqual([alpha, middle, zebra])
  })

  test('a dated key always precedes an undated key', () => {
    const dated = makeKey({
      title: 'Z Game',
      expiration: '2026-08-01T00:00:00.000Z'
    })
    const undated = makeKey({ title: 'A Game', expiration: null })
    expect([undated, dated].sort(compareWaiting)).toEqual([dated, undated])
  })

  test('two dated keys order soonest-expiring first', () => {
    const soon = makeKey({
      title: 'Soon Game',
      expiration: '2026-07-10T00:00:00.000Z'
    })
    const later = makeKey({
      title: 'Later Game',
      expiration: '2026-09-01T00:00:00.000Z'
    })
    expect([later, soon].sort(compareWaiting)).toEqual([soon, later])
  })
})

/**
 * 260911-t0p: this describe block previously called WAITING_STATES "the
 * Redeemable-keys-only predicate" -- as of this quick task that is no
 * longer true (see the REDEEMABLE_ONLY_STATES describe block below, which
 * is the actual predicate the checkbox now uses). WAITING_STATES itself is
 * UNCHANGED and these membership assertions remain correct for its real
 * consumers (selectKeysWaiting, the claimGateHolds mirror below) -- only
 * the block's framing needed correcting, not its assertions.
 */
describe('WAITING_STATES membership (REQ-43-07 origin; claim-gate/selectKeysWaiting consumer as of 260911-t0p)', () => {
  test.each<HumbleKeyState>([
    'UNPICKED',
    'UNREVEALED',
    'REVEALED',
    'REDEEMED',
    'UNREDEEMABLE'
  ])(
    'membership for state %s is identical regardless of ownership/platform/matchConfidence',
    (state) => {
      const unowned = makeKey({
        state,
        ownedElsewhere: false,
        platform: 'steam',
        matchConfidence: 'none'
      })
      const ownedGeneric = makeKey({
        state,
        ownedElsewhere: true,
        platform: GENERIC_KEY_PLATFORM,
        matchConfidence: 'fuzzy'
      })
      expect(WAITING_STATES.has(unowned.state)).toBe(
        WAITING_STATES.has(ownedGeneric.state)
      )
    }
  )

  test('D-43-08: UNPICKED is IN the set', () => {
    expect(WAITING_STATES.has('UNPICKED')).toBe(true)
  })

  test('D-43-08: REDEEMED is OUT of the set', () => {
    expect(WAITING_STATES.has('REDEEMED')).toBe(false)
  })

  test('D-43-08: UNREDEEMABLE is OUT of the set', () => {
    expect(WAITING_STATES.has('UNREDEEMABLE')).toBe(false)
  })

  test('260911-t0p regression pin: REVEALED remains IN this set -- protects StoreSearch/Discounts (selectKeysWaiting, hasClaimEligibleState) from a future "tidy-up" merge of WAITING_STATES and REDEEMABLE_ONLY_STATES into one', () => {
    expect(WAITING_STATES.has('REVEALED')).toBe(true)
  })
})

/**
 * 260911-t0p: the actual predicate behind the Humble Keys screen's
 * "Redeemable keys only" checkbox (`screens/Humble/Keys/index.tsx`),
 * replacing the WAITING_STATES-based predicate this describe block's
 * sibling above used to document. Named after the defect it fixes: a
 * REVEALED key is deliberately OUT of this set even though it remains IN
 * WAITING_STATES.
 */
describe('REDEEMABLE_ONLY_STATES as the Redeemable-keys-only predicate (REQ-43-07, 260911-t0p)', () => {
  test.each<HumbleKeyState>([
    'UNPICKED',
    'UNREVEALED',
    'REVEALED',
    'REDEEMED',
    'UNREDEEMABLE'
  ])(
    'membership for state %s is identical regardless of ownership/platform/matchConfidence',
    (state) => {
      const unowned = makeKey({
        state,
        ownedElsewhere: false,
        platform: 'steam',
        matchConfidence: 'none'
      })
      const ownedGeneric = makeKey({
        state,
        ownedElsewhere: true,
        platform: GENERIC_KEY_PLATFORM,
        matchConfidence: 'fuzzy'
      })
      expect(REDEEMABLE_ONLY_STATES.has(unowned.state)).toBe(
        REDEEMABLE_ONLY_STATES.has(ownedGeneric.state)
      )
    }
  )

  test('260911-t0p: UNPICKED is IN the set', () => {
    expect(REDEEMABLE_ONLY_STATES.has('UNPICKED')).toBe(true)
  })

  test('260911-t0p: UNREVEALED is IN the set', () => {
    expect(REDEEMABLE_ONLY_STATES.has('UNREVEALED')).toBe(true)
  })

  test('260911-t0p defect fix: REVEALED is OUT of the set -- the whole point of this quick task', () => {
    expect(REDEEMABLE_ONLY_STATES.has('REVEALED')).toBe(false)
  })

  test('260911-t0p: REDEEMED is OUT of the set', () => {
    expect(REDEEMABLE_ONLY_STATES.has('REDEEMED')).toBe(false)
  })

  test('260911-t0p: UNREDEEMABLE is OUT of the set', () => {
    expect(REDEEMABLE_ONLY_STATES.has('UNREDEEMABLE')).toBe(false)
  })
})

describe('matchesKeySearch — title only (REQ-43-09, REQ-43-21)', () => {
  const key = makeKey({
    title: 'Some Game',
    origin: 'A very special gift just for you'
  })

  test('a query matching only origin returns no match', () => {
    expect(matchesKeySearch(key, 'special gift')).toBe(false)
  })

  test('a lowercase substring of the title matches', () => {
    expect(matchesKeySearch(key, 'some ga')).toBe(true)
  })

  test('an uppercase query matches case-insensitively', () => {
    expect(matchesKeySearch(key, 'SOME GAME')).toBe(true)
  })

  test('an empty query matches everything', () => {
    expect(matchesKeySearch(key, '')).toBe(true)
  })

  test('a whitespace-only query matches everything', () => {
    expect(matchesKeySearch(key, '   ')).toBe(true)
  })

  test('REQ-43-21/260911-t0p: a title match AND REDEEMABLE_ONLY_STATES membership compose as the screen will use them', () => {
    // 260911-t0p: repointed from WAITING_STATES, which the screen's
    // "Redeemable keys only" checkbox no longer uses (see index.tsx's
    // filteredKeys). A REDEEMED key would compose to `false` against
    // EITHER set (REDEEMED is out of both), which would not prove this
    // test tracks the real call site -- REVEALED is the discriminating
    // state (IN WAITING_STATES, OUT of REDEEMABLE_ONLY_STATES), so using
    // it here is load-bearing, not incidental.
    const revealedMatch = makeKey({
      title: 'Some Game',
      state: 'REVEALED',
      ownedElsewhere: false
    })
    const composed =
      matchesKeySearch(revealedMatch, 'some game') &&
      REDEEMABLE_ONLY_STATES.has(revealedMatch.state)
    expect(composed).toBe(false)
  })
})

describe('isGiftableSpare (scenario 3)', () => {
  test('true for ownedElsewhere + UNREVEALED', () => {
    const key = makeKey({ ownedElsewhere: true, state: 'UNREVEALED' })
    expect(isGiftableSpare(key)).toBe(true)
  })

  test('D-55: false for ownedElsewhere + REVEALED', () => {
    const key = makeKey({ ownedElsewhere: true, state: 'REVEALED' })
    expect(isGiftableSpare(key)).toBe(false)
  })

  test('false for unowned + UNREVEALED', () => {
    const key = makeKey({ ownedElsewhere: false, state: 'UNREVEALED' })
    expect(isGiftableSpare(key)).toBe(false)
  })

  test('false for owned + REDEEMED', () => {
    const key = makeKey({ ownedElsewhere: true, state: 'REDEEMED' })
    expect(isGiftableSpare(key)).toBe(false)
  })

  // D2: `isGiftableSpare` is platform-blind and STAYS platform-blind -- this
  // divergence from `isGiftable` (which now excludes every keyless
  // key_type) is deliberate, not a gap. The spare CLASSIFICATION answers
  // "is this copy surplus to me", never "may it be gifted"; only the
  // affordance gate (`isGiftable`) narrows on platform.
  test('D2: true for ownedElsewhere + UNREVEALED + epic_keyless -- spare classification is platform-blind, unlike isGiftable', () => {
    const key = makeKey({
      ownedElsewhere: true,
      state: 'UNREVEALED',
      platform: 'epic_keyless'
    })
    expect(isGiftableSpare(key)).toBe(true)
  })
})

/**
 * Quick task 260911-nyq. The defect these tests exist for: the gift
 * affordance was gated on `isGiftableSpare` (`ownedElsewhere && UNREVEALED`)
 * while the claim affordance is gated on `!ownedElsewhere`, so no key could
 * ever hold both and `43-UI-SPEC.md:313` scenario 2's Claim+Gift pair was
 * unreachable for every key in every library.
 *
 * `claimGateHolds` below MIRRORS the real claim gate at
 * `screens/Humble/Keys/index.tsx:421-424`. It is a mirror, not the article
 * itself, because that gate is an inline expression inside a React component
 * closure with no exported form to import. If the real gate is ever changed,
 * this mirror must change with it — the co-occurrence assertion is only as
 * honest as this copy.
 */
function claimGateHolds(key: HumbleKey): boolean {
  return (
    !key.ownedElsewhere &&
    key.platform !== GENERIC_KEY_PLATFORM &&
    (WAITING_STATES.has(key.state) || key.state === 'REDEEMED')
  )
}

describe('the claim gate and the gift gate are NOT mutually exclusive', () => {
  test('a single key satisfies BOTH gates -- UI-SPEC scenario 2s pair is reachable', () => {
    const key = makeKey({
      ownedElsewhere: false,
      state: 'UNREVEALED',
      platform: 'steam'
    })
    expect(claimGateHolds(key)).toBe(true)
    expect(isGiftable(key)).toBe(true)
  })

  test('the old spare-based gate could NEVER co-occur with the claim gate', () => {
    const shapes: HumbleKey[] = [
      makeKey({ ownedElsewhere: false, state: 'UNREVEALED' }),
      makeKey({ ownedElsewhere: true, state: 'UNREVEALED' }),
      makeKey({ ownedElsewhere: false, state: 'REVEALED' }),
      makeKey({ ownedElsewhere: true, state: 'REVEALED' }),
      makeKey({ ownedElsewhere: false, state: 'REDEEMED' }),
      makeKey({ ownedElsewhere: true, state: 'REDEEMED' })
    ]
    // Regression anchor: this is the exact contradiction the bug was made of.
    // It must stay true of `isGiftableSpare`, which keeps its spare meaning.
    expect(shapes.some((k) => claimGateHolds(k) && isGiftableSpare(k))).toBe(
      false
    )
    // ...and must now be FALSE of the affordance gate that replaced it.
    expect(shapes.some((k) => claimGateHolds(k) && isGiftable(k))).toBe(true)
  })
})

describe('isGiftable (the affordance gate)', () => {
  test('true for an unowned UNREVEALED key -- the shape the old gate refused', () => {
    expect(
      isGiftable(makeKey({ ownedElsewhere: false, state: 'UNREVEALED' }))
    ).toBe(true)
  })

  test('still true for an owned UNREVEALED key -- gift-only must not regress', () => {
    expect(
      isGiftable(makeKey({ ownedElsewhere: true, state: 'UNREVEALED' }))
    ).toBe(true)
  })

  test('spec 2.1: false once REVEALED -- reveal forfeits the gift link', () => {
    expect(
      isGiftable(makeKey({ ownedElsewhere: false, state: 'REVEALED' }))
    ).toBe(false)
    expect(
      isGiftable(makeKey({ ownedElsewhere: true, state: 'REVEALED' }))
    ).toBe(false)
  })

  test('false for REDEEMED, UNREDEEMABLE and UNPICKED', () => {
    for (const state of [
      'REDEEMED',
      'UNREDEEMABLE',
      'UNPICKED'
    ] as HumbleKeyState[]) {
      expect(isGiftable(makeKey({ state }))).toBe(false)
    }
  })

  test('false for every keyless key_type -- none has a code to transfer', () => {
    for (const platform of ['gog_keyless', 'epic_keyless', 'origin_keyless']) {
      expect(isGiftable(makeKey({ state: 'UNREVEALED', platform }))).toBe(false)
    }
  })

  test('still true for the keyed siblings of the excluded types -- the widen must not sweep them in', () => {
    for (const platform of ['steam', 'gog', 'epic', 'origin', 'uplay']) {
      expect(isGiftable(makeKey({ state: 'UNREVEALED', platform }))).toBe(true)
    }
  })

  test('D3 closed-set proof: true for an unrecognised foo_keyless -- not a suffix match', () => {
    expect(
      isGiftable(makeKey({ state: 'UNREVEALED', platform: 'foo_keyless' }))
    ).toBe(true)
  })

  test('true for a generic-platform key -- gifting needs no redeem destination', () => {
    expect(
      isGiftable(
        makeKey({ state: 'UNREVEALED', platform: GENERIC_KEY_PLATFORM })
      )
    ).toBe(true)
  })
})
