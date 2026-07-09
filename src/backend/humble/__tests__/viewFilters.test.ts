/**
 * Unit tests for the pure Keys-waiting / Giftable-spares membership + sort
 * helpers (D-53/D-54/D-55/D-56, HVIEW-01/HVIEW-02). The helpers live in
 * common/humble/viewFilters.ts (no React/i18n/I/O); this test sits in the
 * backend suite because jest's project roots only cover src/backend.
 */

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import {
  selectKeysWaiting,
  selectGiftableSpares,
  partitionWaitingByUrgency
} from 'common/humble/viewFilters'

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

// D-86/D-87/D-88/D-89: pinned "Expiring soon" section membership for the
// Keys-waiting view. partitionWaitingByUrgency does not accept an injectable
// `now` (unlike getUrgencyTier) — it delegates entirely to getUrgencyTier's
// own `new Date()` default, so these tests compute offsets from the real
// wall-clock at run time (same approach as Phase 13's within-window tests
// would need without a `now` parameter on this helper).
function daysFromRealNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

describe('partitionWaitingByUrgency', () => {
  test('D-87: a key within the urgency window (getUrgencyTier !== null) lands in pinned', () => {
    const urgent = makeKey({
      title: 'Urgent Game',
      state: 'UNREVEALED',
      expiration: daysFromRealNow(5)
    })
    const { pinned, rest } = partitionWaitingByUrgency([urgent])
    expect(pinned).toEqual([urgent])
    expect(rest).toEqual([])
  })

  test('a key outside the urgency window (getUrgencyTier === null) lands in rest', () => {
    const safe = makeKey({
      title: 'Safe Game',
      state: 'UNREVEALED',
      expiration: daysFromRealNow(60)
    })
    const { pinned, rest } = partitionWaitingByUrgency([safe])
    expect(pinned).toEqual([])
    expect(rest).toEqual([safe])
  })

  test('an undated key (expiration null, never badge-eligible) lands in rest', () => {
    const undated = makeKey({ title: 'Undated Game', expiration: null })
    const { pinned, rest } = partitionWaitingByUrgency([undated])
    expect(pinned).toEqual([])
    expect(rest).toEqual([undated])
  })

  test('D-88: pinned and rest are disjoint and their union equals the input, order preserved', () => {
    const urgent = makeKey({
      title: 'Urgent Game',
      machineName: 'mn-urgent',
      expiration: daysFromRealNow(3)
    })
    const warning = makeKey({
      title: 'Warning Game',
      machineName: 'mn-warning',
      expiration: daysFromRealNow(20)
    })
    const safe = makeKey({
      title: 'Safe Game',
      machineName: 'mn-safe',
      expiration: daysFromRealNow(90)
    })
    const undated = makeKey({
      title: 'Undated Game',
      machineName: 'mn-undated',
      expiration: null
    })
    const input = [urgent, warning, safe, undated]
    const { pinned, rest } = partitionWaitingByUrgency(input)

    // Union equals input, membership preserved, no key in both.
    expect([...pinned, ...rest].sort()).not.toBe(input) // sanity: distinct arrays
    expect(pinned.length + rest.length).toBe(input.length)
    const pinnedSet = new Set(pinned)
    const restSet = new Set(rest)
    for (const key of input) {
      const inPinned = pinnedSet.has(key)
      const inRest = restSet.has(key)
      expect(inPinned !== inRest).toBe(true) // exactly one of the two, never both/neither
    }

    // Order preserved within each output (soonest-first inherited from
    // selectKeysWaiting's input ordering — this input is already ordered).
    expect(pinned).toEqual([urgent, warning])
    expect(rest).toEqual([safe, undated])
  })

  test('D-89: when no key is within the urgency window, pinned is empty', () => {
    const safe1 = makeKey({
      title: 'Safe One',
      machineName: 'mn-safe1',
      expiration: daysFromRealNow(45)
    })
    const safe2 = makeKey({ title: 'Safe Two', expiration: null })
    const { pinned, rest } = partitionWaitingByUrgency([safe1, safe2])
    expect(pinned).toEqual([])
    expect(rest).toEqual([safe1, safe2])
  })

  test('D-87: a key exactly at the 30-day boundary lands in pinned (reused threshold)', () => {
    const boundary30 = makeKey({
      title: 'Boundary 30',
      expiration: daysFromRealNow(30)
    })
    const { pinned } = partitionWaitingByUrgency([boundary30])
    expect(pinned).toEqual([boundary30])
  })

  test('D-87: a key exactly at the 7-day boundary lands in pinned (reused threshold)', () => {
    const boundary7 = makeKey({
      title: 'Boundary 7',
      expiration: daysFromRealNow(7)
    })
    const { pinned } = partitionWaitingByUrgency([boundary7])
    expect(pinned).toEqual([boundary7])
  })
})

describe('selectGiftableSpares', () => {
  test('includes an ownedElsewhere + UNREVEALED key', () => {
    const key = makeKey({ ownedElsewhere: true, state: 'UNREVEALED' })
    expect(selectGiftableSpares([key])).toEqual([key])
  })

  test('D-55: excludes an ownedElsewhere + REVEALED key', () => {
    const key = makeKey({ ownedElsewhere: true, state: 'REVEALED' })
    expect(selectGiftableSpares([key])).toEqual([])
  })

  test.each<HumbleKeyState>(['UNPICKED', 'REDEEMED', 'UNREDEEMABLE'])(
    'excludes an ownedElsewhere key in state %s',
    (state) => {
      const key = makeKey({ ownedElsewhere: true, state })
      expect(selectGiftableSpares([key])).toEqual([])
    }
  )

  test('excludes a non-owned key even if UNREVEALED', () => {
    const key = makeKey({ ownedElsewhere: false, state: 'UNREVEALED' })
    expect(selectGiftableSpares([key])).toEqual([])
  })

  test('D-54: a fuzzy-matched ownedElsewhere + UNREVEALED key is included (matchConfidence is irrelevant)', () => {
    const key = makeKey({
      ownedElsewhere: true,
      state: 'UNREVEALED',
      matchConfidence: 'fuzzy'
    })
    expect(selectGiftableSpares([key])).toEqual([key])
  })
})
