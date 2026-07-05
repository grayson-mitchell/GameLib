/**
 * Unit tests for the pure 5-state classification model (D-30, HSYNC-01/02/03).
 * No axios/electron-store mocking needed — classifyTpk/classifyOrder are pure.
 */

import { classifyTpk, classifyOrder, describeZeroKeyOrder } from '../classify'
import {
  unpickedChoiceMonthOrder,
  unpickedChoiceMonthMissingUrlOrder,
  unrevealedOrder,
  revealedViaFlagOrder,
  redeemedOrder,
  unredeemableOrder,
  malformedTpkOrder,
  resyncTpkFirstSync,
  resyncTpkSecondSync,
  nonSteamPlatformOrder,
  drmFreeOnlyOrder,
  realWorldUnrevealedPurchaseOrder,
  realWorldRedeemedKeyValOrder,
  realWorldExpiredFlagOrder,
  realWorldGiftKeyOrder,
  minimalTpkOrder,
  strippedNoTpkdDictOrder
} from './fixtures/tpks'

const NEVER_REVEALED = () => false
const ALWAYS_REVEALED = () => true

describe('classifyTpk', () => {
  test('expiration in the past -> UNREDEEMABLE, beats every other signal', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: true, expiration: '2020-01-01T00:00:00Z' },
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREDEEMABLE')
  })

  test('redeemedKeyValuePresent true, no past expiration -> REDEEMED, beats local flag', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: true, expiration: null },
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('REDEEMED')
  })

  test('isLocallyRevealed true, not redeemed, not expired -> REVEALED', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null },
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('REVEALED')
  })

  test('none of the above -> UNREVEALED (default)', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null },
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREVEALED')
  })

  test('future expiration does not classify UNREDEEMABLE', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: '2099-01-01T00:00:00Z' },
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREVEALED')
  })
})

describe('classifyOrder', () => {
  test('D-27: unpicked Choice month -> single UNPICKED pseudo-entry', () => {
    const entry = classifyOrder(unpickedChoiceMonthOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNPICKED')
    expect(entry.allTerminal).toBe(false)
  })

  test('D-27: unpicked Choice month missing choice_url -> never throws, omits pseudo-entry', () => {
    expect(() =>
      classifyOrder(unpickedChoiceMonthMissingUrlOrder, NEVER_REVEALED)
    ).not.toThrow()
    const entry = classifyOrder(
      unpickedChoiceMonthMissingUrlOrder,
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(0)
  })

  test('UNREVEALED tpk classifies UNREVEALED when not locally revealed', () => {
    const entry = classifyOrder(unrevealedOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.allTerminal).toBe(false)
  })

  test('HSYNC-02: revealed-flag + no redeemed value -> REVEALED, survives being read from an external store lookup', () => {
    const isRevealed = (machineName: string) =>
      machineName === 'anothergame_steam'
    const entry = classifyOrder(revealedViaFlagOrder, isRevealed)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REVEALED')
  })

  test('redeemed_key_value present -> REDEEMED', () => {
    const entry = classifyOrder(redeemedOrder, ALWAYS_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REDEEMED')
    expect(entry.allTerminal).toBe(true)
  })

  test('past expiration -> UNREDEEMABLE even when redeemedKeyValuePresent is true', () => {
    const entry = classifyOrder(unredeemableOrder, ALWAYS_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREDEEMABLE')
    expect(entry.allTerminal).toBe(true)
  })

  test('T-11-05: a malformed tpk entry is skipped, other tpks in the same order still classify', () => {
    expect(() => classifyOrder(malformedTpkOrder, NEVER_REVEALED)).not.toThrow()
    const entry = classifyOrder(malformedTpkOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
  })

  test('HSYNC-03: a cached tpk without expiration, re-classified with a newly-added expiration, returns UNREDEEMABLE', () => {
    const firstSync = classifyOrder(resyncTpkFirstSync, NEVER_REVEALED)
    expect(firstSync.keys[0].state).toBe('UNREVEALED')

    // classifyOrder always reads the FRESH raw response, never merges the
    // previous cache entry forward (Pitfall 5) — calling it again with the
    // second-sync fixture (same tpk, now with an expiration) must reclassify.
    const secondSync = classifyOrder(resyncTpkSecondSync, NEVER_REVEALED)
    expect(secondSync.keys[0].state).toBe('UNREDEEMABLE')
  })

  test('D-28: a non-Steam key_type classifies through the same precedence and carries its own platform label', () => {
    const entry = classifyOrder(nonSteamPlatformOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.keys[0].platform).toBe('gog')
  })

  test('D-29: a DRM-free-only order (no tpks, no subscriptioncontent product) yields zero HumbleKey entries', () => {
    const entry = classifyOrder(drmFreeOnlyOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(0)
    expect(entry.allTerminal).toBe(false)
  })
})

// ── Real-world payload shapes (live-UAT round 3) ──────────────────────────
// Field names verified against Playnite HumbleKeysLibrary's Tpk model and
// FailSpy's humble-steam-key-redeemer: `redeemed_key_val` (not the spec's
// `redeemed_key_value`) and `is_expired` (bool, not an `expiration` string).

describe('classifyTpk — real-world is_expired flag', () => {
  test('isExpired true -> UNREDEEMABLE, beats redeemed and local reveal (D-30 precedence)', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: true, expiration: null, isExpired: true },
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREDEEMABLE')
  })

  test('isExpired false with no expiration does not classify UNREDEEMABLE', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null, isExpired: false },
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREVEALED')
  })
})

describe('classifyOrder — real-world payload shapes', () => {
  test('direct purchase (real field set, no redeemed_key_val) -> 1 UNREVEALED steam key', () => {
    const entry = classifyOrder(realWorldUnrevealedPurchaseOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.keys[0].platform).toBe('steam')
    expect(entry.keys[0].machineName).toBe('directgame_steam')
  })

  test('real `redeemed_key_val` field (not redeemed_key_value) -> REDEEMED', () => {
    const entry = classifyOrder(realWorldRedeemedKeyValOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REDEEMED')
    expect(entry.allTerminal).toBe(true)
  })

  test('real `is_expired: true` flag (no expiration timestamp) -> UNREDEEMABLE even when redeemed_key_val present', () => {
    const entry = classifyOrder(realWorldExpiredFlagOrder, ALWAYS_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREDEEMABLE')
  })

  test('gift key (is_gift: true, no redeemed_key_val) classifies UNREVEALED — never skipped (D-28)', () => {
    const entry = classifyOrder(realWorldGiftKeyOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.keys[0].platform).toBe('steam')
  })

  test('shape-tolerance floor: a bare {} tpk still classifies with fallback identity', () => {
    const entry = classifyOrder(minimalTpkOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.keys[0].machineName).toBe('order-minimal:0')
    expect(entry.keys[0].platform).toBe('unknown')
  })
})

describe('describeZeroKeyOrder — redacted structural diagnosis (round 3)', () => {
  test('order with no tpkd_dict at all -> anomalous, names the absence and the top-level field names', () => {
    const diagnosis = describeZeroKeyOrder(strippedNoTpkdDictOrder)
    expect(diagnosis.anomalous).toBe(true)
    expect(diagnosis.detail).toContain('tpkd_dict=absent')
    expect(diagnosis.detail).toContain('order_fields=')
    expect(diagnosis.detail).toContain('gamekey')
    expect(diagnosis.detail).toContain('subproducts')
  })

  test('tpkd_dict null -> anomalous, reported as null', () => {
    const diagnosis = describeZeroKeyOrder({
      gamekey: 'gk',
      tpkd_dict: null
    })
    expect(diagnosis.anomalous).toBe(true)
    expect(diagnosis.detail).toContain('tpkd_dict=null')
  })

  test('tpkd_dict present but all_tpks absent -> anomalous, names tpkd_dict field names', () => {
    const diagnosis = describeZeroKeyOrder({
      gamekey: 'gk',
      tpkd_dict: { some_other_key_group: [] } as never
    })
    expect(diagnosis.anomalous).toBe(true)
    expect(diagnosis.detail).toContain('tpkd_dict.all_tpks=absent')
    expect(diagnosis.detail).toContain('some_other_key_group')
  })

  test('explicit empty all_tpks array -> NOT anomalous (legit DRM-free shape, D-29)', () => {
    const diagnosis = describeZeroKeyOrder({
      gamekey: 'gk',
      tpkd_dict: { all_tpks: [] }
    })
    expect(diagnosis.anomalous).toBe(false)
    expect(diagnosis.detail).toContain('all_tpks=array(0)')
  })

  test('non-empty all_tpks of non-object elements -> anomalous, per-element skip reasons', () => {
    const diagnosis = describeZeroKeyOrder({
      gamekey: 'gk',
      tpkd_dict: { all_tpks: [null, 'a-string', 42] }
    })
    expect(diagnosis.anomalous).toBe(true)
    expect(diagnosis.detail).toContain('all_tpks=array(3)')
    expect(diagnosis.detail).toContain('[0]:non-object(null)')
    expect(diagnosis.detail).toContain('[1]:non-object(string)')
    expect(diagnosis.detail).toContain('[2]:non-object(number)')
  })

  test('C5 redaction: diagnosis carries field NAMES only, never field values', () => {
    const diagnosis = describeZeroKeyOrder({
      gamekey: 'gk',
      secret_field: 'SECRET-VALUE-MUST-NOT-LEAK',
      tpkd_dict: null
    } as never)
    expect(diagnosis.detail).toContain('secret_field')
    expect(diagnosis.detail).not.toContain('SECRET-VALUE-MUST-NOT-LEAK')
  })
})
