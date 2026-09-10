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
  WAITING_STATES
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

describe('WAITING_STATES as the Redeemable-keys-only predicate (REQ-43-07)', () => {
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

  test('REQ-43-21: a title match AND WAITING_STATES membership compose as the screen will use them', () => {
    const redeemedMatch = makeKey({
      title: 'Some Game',
      state: 'REDEEMED',
      ownedElsewhere: false
    })
    const composed =
      matchesKeySearch(redeemedMatch, 'some game') &&
      WAITING_STATES.has(redeemedMatch.state)
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
})
