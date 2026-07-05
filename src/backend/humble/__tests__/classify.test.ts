/**
 * Unit tests for the pure 5-state classification model (D-30, HSYNC-01/02/03).
 * No axios/electron-store mocking needed — classifyTpk/classifyOrder are pure.
 */

import { classifyTpk, classifyOrder } from '../classify'
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
  drmFreeOnlyOrder
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
