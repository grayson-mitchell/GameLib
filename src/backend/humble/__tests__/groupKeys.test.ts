/**
 * Unit tests for the pure grouping/sorting helper used by the Humble Keys
 * screen (D-21 + live-UAT round 7 generic->Other partition). The helper lives
 * in common/humble/groupKeys.ts (no React/i18n/I/O); this test sits in the
 * backend suite because jest's project roots only cover src/backend.
 */

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import {
  GENERIC_KEY_PLATFORM,
  GROUP_ORDER,
  groupAndSortKeys
} from 'common/humble/groupKeys'

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

describe('GROUP_ORDER', () => {
  test("renders 'other' LAST — after the terminal Expired group", () => {
    expect(GROUP_ORDER[GROUP_ORDER.length - 1]).toBe('other')
    expect(GROUP_ORDER.indexOf('other')).toBeGreaterThan(
      GROUP_ORDER.indexOf('UNREDEEMABLE')
    )
  })

  test('keeps the D-21 urgency-first 5-state order intact before other', () => {
    expect(GROUP_ORDER).toEqual([
      'UNPICKED',
      'UNREVEALED',
      'REVEALED',
      'REDEEMED',
      'UNREDEEMABLE',
      'other'
    ])
  })
})

describe('groupAndSortKeys — generic->Other partition (round 7)', () => {
  test.each<HumbleKeyState>([
    'UNREVEALED',
    'REVEALED',
    'REDEEMED',
    'UNREDEEMABLE'
  ])(
    'a generic-platform key in state %s goes to the other group, not its state group',
    (state) => {
      const key = makeKey({ platform: GENERIC_KEY_PLATFORM, state })
      const groups = groupAndSortKeys([key])
      expect(groups.other).toEqual([key])
      expect(groups[state]).toBeUndefined()
    }
  )

  test('non-generic keys keep flowing through the 5-state grouping', () => {
    const steam = makeKey({ platform: 'steam', state: 'UNREVEALED' })
    const gog = makeKey({ platform: 'gog', state: 'REDEEMED' })
    const expired = makeKey({ platform: 'epic', state: 'UNREDEEMABLE' })
    const groups = groupAndSortKeys([steam, gog, expired])
    expect(groups.UNREVEALED).toEqual([steam])
    expect(groups.REDEEMED).toEqual([gog])
    expect(groups.UNREDEEMABLE).toEqual([expired])
    expect(groups.other).toBeUndefined()
  })

  test('the UNPICKED humble-choice pseudo-entry is NOT generic — stays in UNPICKED', () => {
    const pseudo = makeKey({ platform: 'humble-choice', state: 'UNPICKED' })
    const groups = groupAndSortKeys([pseudo])
    expect(groups.UNPICKED).toEqual([pseudo])
    expect(groups.other).toBeUndefined()
  })

  test('mixed inventory partitions cleanly — display only, states preserved on rows', () => {
    const genericRevealed = makeKey({
      platform: GENERIC_KEY_PLATFORM,
      state: 'REVEALED'
    })
    const genericExpired = makeKey({
      platform: GENERIC_KEY_PLATFORM,
      state: 'UNREDEEMABLE'
    })
    const steamRevealed = makeKey({ platform: 'steam', state: 'REVEALED' })
    const groups = groupAndSortKeys([
      genericRevealed,
      steamRevealed,
      genericExpired
    ])
    expect(groups.REVEALED).toEqual([steamRevealed])
    expect(groups.other).toHaveLength(2)
    // Rows keep their classification untouched (D-30) — grouping never
    // rewrites state.
    expect(groups.other!.map((k) => k.state).sort()).toEqual([
      'REVEALED',
      'UNREDEEMABLE'
    ])
  })
})

describe('groupAndSortKeys — expiring-soonest sort (D-21, shared comparator)', () => {
  const SOON = '2026-07-10T00:00:00.000Z'
  const LATER = '2026-09-01T00:00:00.000Z'

  test('within a state group: expiring-soonest first, no-expiration last', () => {
    const noExpiry = makeKey({ expiration: null })
    const later = makeKey({ expiration: LATER })
    const soon = makeKey({ expiration: SOON })
    const groups = groupAndSortKeys([noExpiry, later, soon])
    expect(groups.UNREVEALED!.map((k) => k.expiration)).toEqual([
      SOON,
      LATER,
      null
    ])
  })

  test('within the other group: same comparator — soonest first, no-expiration last', () => {
    const noExpiry = makeKey({
      platform: GENERIC_KEY_PLATFORM,
      expiration: null
    })
    const later = makeKey({ platform: GENERIC_KEY_PLATFORM, expiration: LATER })
    const soon = makeKey({ platform: GENERIC_KEY_PLATFORM, expiration: SOON })
    const groups = groupAndSortKeys([later, noExpiry, soon])
    expect(groups.other!.map((k) => k.expiration)).toEqual([SOON, LATER, null])
  })

  test('empty input yields no groups at all', () => {
    expect(groupAndSortKeys([])).toEqual({})
  })
})
