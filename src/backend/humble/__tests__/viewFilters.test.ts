/**
 * Unit tests for the pure Keys-waiting / Giftable-spares membership + sort
 * helpers (D-53/D-54/D-55/D-56, HVIEW-01/HVIEW-02). The helpers live in
 * common/humble/viewFilters.ts (no React/i18n/I/O); this test sits in the
 * backend suite because jest's project roots only cover src/backend.
 */

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import {
  selectKeysWaiting,
  selectGiftableSpares
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
  ])(
    'excludes an ownedElsewhere key regardless of state (%s)',
    (state) => {
      const key = makeKey({ state, ownedElsewhere: true })
      expect(selectKeysWaiting([key])).toEqual([])
    }
  )

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
