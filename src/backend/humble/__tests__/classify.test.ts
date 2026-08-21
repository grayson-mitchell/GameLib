/**
 * Unit tests for the pure 5-state classification model (D-30, HSYNC-01/02/03).
 * No axios/electron-store mocking needed — classifyTpk/classifyOrder are pure.
 */

import {
  classifyTpk,
  classifyOrder,
  describeZeroKeyOrder,
  describeMissingExpirationTpks,
  describeSkippedEntitlements,
  extractExpiration,
  isTerminal,
  isServerTerminal,
  isFreezeEligible
} from '../classify'
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
  strippedNoTpkdDictOrder,
  realWorldFutureExpiryDateOrder,
  realWorldPastExpiryDateOrder,
  realWorldRelativeExpiryOrder,
  realWorldUndatableActiveOrder,
  ebookBundleOrder,
  mixedKeyAndEntitlementOrder,
  directRedeemEntitlementOrder,
  realWorldDirectRedeemUplayKeyOrder,
  unknownPlatformKeyOrder,
  mixedKeyAndDirectRedeemEntitlementOrder,
  steamKeyWithNumericAppIdOrder,
  steamKeyWithStringAppIdOrder,
  steamKeyWithMalformedAppIdOrder
} from './fixtures/tpks'

const NEVER_REVEALED = () => false
const ALWAYS_REVEALED = () => true

describe('classifyTpk', () => {
  test('expiration in the past -> UNREDEEMABLE, beats every other signal', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: true, expiration: '2020-01-01T00:00:00Z' },
      true,
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREDEEMABLE')
  })

  test('14-07 gap closure: redeemedKeyValuePresent true, no past expiration, not locally redeemed -> REVEALED (server redeemed_key_val means revealed, not redeemed)', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: true, expiration: null },
      true,
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('REVEALED')
  })

  test('isLocallyRevealed true, not redeemed, not expired -> REVEALED', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null },
      true,
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('REVEALED')
  })

  test('none of the above -> UNREVEALED (default)', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null },
      false,
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREVEALED')
  })

  test('future expiration does not classify UNREDEEMABLE', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: '2099-01-01T00:00:00Z' },
      false,
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREVEALED')
  })

  // Phase 14 (D-77): the new local-redeemed precedence tier.
  test('D-77: isLocallyRedeemed true, not server-redeemed, not expired -> REDEEMED', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null },
      false,
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('REDEEMED')
  })

  test('14-07 gap closure: isLocallyRedeemed beats redeemedKeyValuePresent (local mark wins over server-revealed value)', () => {
    // Both signals present: this asserts precedence order, not just the
    // final state — isLocallyRedeemed must be checked BEFORE
    // redeemedKeyValuePresent, the reverse of the old (wrong) precedence.
    const state = classifyTpk(
      { redeemedKeyValuePresent: true, expiration: null },
      false,
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('REDEEMED')
  })

  test('D-77: expiry beats isLocallyRedeemed (a retroactively-expired local mark reclassifies UNREDEEMABLE)', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: '2020-01-01T00:00:00Z' },
      false,
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREDEEMABLE')
  })

  test('D-77: isLocallyRedeemed beats isLocallyRevealed (both true -> REDEEMED, not REVEALED)', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null },
      true,
      true,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('REDEEMED')
  })
})

describe('classifyOrder', () => {
  test('D-27: unpicked Choice month -> single UNPICKED pseudo-entry', () => {
    const entry = classifyOrder(unpickedChoiceMonthOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNPICKED')
    expect(entry.allTerminal).toBe(false)
  })

  // WR-07: deadline_date is a speculative field name (Assumption A2) — it
  // must go through the same parse-and-normalize as every tpk expiration,
  // never be copied raw into HumbleKey.expiration.
  test('WR-07: a parseable deadline_date is ISO-normalized on the UNPICKED pseudo-entry', () => {
    const entry = classifyOrder(unpickedChoiceMonthOrder, NEVER_REVEALED)
    expect(entry.keys[0].expiration).toBe('2026-03-31T23:59:59.000Z')
  })

  test('WR-07: an unparseable deadline_date degrades to null (no "Invalid Date" render, no NaN sort), never throws', () => {
    const drifted = {
      ...unpickedChoiceMonthOrder,
      product: {
        ...unpickedChoiceMonthOrder.product,
        deadline_date: 'March 31st, whenever'
      }
    }
    expect(() => classifyOrder(drifted, NEVER_REVEALED)).not.toThrow()
    const entry = classifyOrder(drifted, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNPICKED')
    expect(entry.keys[0].expiration).toBe(null)
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

  test('14-07 gap closure: redeemed_key_value present -> REVEALED, not REDEEMED (server truth means revealed only)', () => {
    const entry = classifyOrder(redeemedOrder, ALWAYS_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REVEALED')
    expect(entry.allTerminal).toBe(false)
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
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREDEEMABLE')
  })

  test('isExpired false with no expiration does not classify UNREDEEMABLE', () => {
    const state = classifyTpk(
      { redeemedKeyValuePresent: false, expiration: null, isExpired: false },
      false,
      false,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(state).toBe('UNREVEALED')
  })
})

describe('classifyOrder — real-world payload shapes', () => {
  test('direct purchase (real field set, no redeemed_key_val) -> 1 UNREVEALED steam key', () => {
    const entry = classifyOrder(
      realWorldUnrevealedPurchaseOrder,
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.keys[0].platform).toBe('steam')
    expect(entry.keys[0].machineName).toBe('directgame_steam')
  })

  test('14-07 gap closure: real `redeemed_key_val` field (not redeemed_key_value) -> REVEALED, not REDEEMED', () => {
    const entry = classifyOrder(realWorldRedeemedKeyValOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REVEALED')
    expect(entry.allTerminal).toBe(false)
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

  test('shape-tolerance floor: a tpk carrying ONLY key_type still classifies with fallback identity', () => {
    const entry = classifyOrder(minimalTpkOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.keys[0].machineName).toBe('order-minimal:0')
    expect(entry.keys[0].platform).toBe('steam')
  })
})

// ── Download-entitlement filtering (live-UAT round 5, D-29) ───────────────
// A row requires actual key evidence: a `key_type` field with a string value
// (any platform — the filter is key-vs-download-entitlement, never
// platform-based, so D-28 is untouched). Entries without key_type are
// DRM-free download entitlements (the tester's PDF/ebook bundle) and are
// excluded from the inventory entirely.

describe('classifyOrder — download entitlements without key_type (D-29)', () => {
  test('a pure ebook/PDF bundle (entries without key_type) yields ZERO rows', () => {
    const entry = classifyOrder(ebookBundleOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(0)
    expect(entry.allTerminal).toBe(false)
  })

  test('a bare {} tpk (no key evidence) is skipped, not classified', () => {
    const entry = classifyOrder(
      { gamekey: 'order-bare', tpkd_dict: { all_tpks: [{}] } },
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(0)
  })

  test('mixed order (1 steam key + 2 download entitlements) yields exactly 1 row', () => {
    const entry = classifyOrder(mixedKeyAndEntitlementOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].machineName).toBe('actualgame_steam')
    expect(entry.keys[0].platform).toBe('steam')
    expect(entry.keys[0].state).toBe('UNREVEALED')
  })

  test('D-28 untouched: any string key_type still classifies (generic/origin/ubisoft)', () => {
    const entry = classifyOrder(
      {
        gamekey: 'order-platforms',
        tpkd_dict: {
          all_tpks: [
            { machine_name: 'a_generic', key_type: 'generic' },
            { machine_name: 'b_origin', key_type: 'origin' },
            { machine_name: 'c_ubisoft', key_type: 'ubisoft' }
          ]
        }
      },
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(3)
    expect(entry.keys.map((k) => k.platform)).toEqual([
      'generic',
      'origin',
      'ubisoft'
    ])
  })

  test('D-27 unaffected: the UNPICKED pseudo-entry path still fires when all tpks are entitlements', () => {
    // A subscriptioncontent order whose all_tpks carries ONLY no-key_type
    // entries ends with zero classified keys — the unpicked Choice month
    // pseudo-entry (which intentionally has no tpk/key_type) must still be
    // produced.
    const entry = classifyOrder(
      {
        gamekey: 'choice-entitlements',
        product: {
          category: 'subscriptioncontent',
          choice_url: 'home/may-2026',
          human_name: 'Humble Choice — May 2026'
        },
        tpkd_dict: {
          all_tpks: [
            { machine_name: 'wallpaper_pack', human_name: 'Wallpapers' }
          ]
        }
      },
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNPICKED')
  })
})

// ── Direct-redeem entitlement filtering (live-UAT round 6, D-29 v2) ────────
// Round 5's presence check failed live: the tester's PDF-bundle tpks DO carry
// key_type. Evidence-based v2 discriminator (see fixtures/tpks.ts for source
// citations): exclude ONLY `direct_redeem === true` entries whose key_type is
// NOT an evidenced game-store platform. Bare direct_redeem exclusion is
// forbidden (real uplay key carries it); custom_instructions_html presence is
// forbidden (real origin keys carry it); D-28 stays intact.

describe('classifyOrder — direct-redeem entitlements (D-29 v2, round 6)', () => {
  test('a direct-redeem download entitlement WITH key_type yields ZERO rows', () => {
    const entry = classifyOrder(directRedeemEntitlementOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(0)
    expect(entry.allTerminal).toBe(false)
  })

  test('D-28: a REAL uplay key with direct_redeem:true (Rayman Legends shape) is RETAINED — known platform overrides the entitlement signal', () => {
    const entry = classifyOrder(
      realWorldDirectRedeemUplayKeyOrder,
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].platform).toBe('uplay')
    // 14-07 gap closure: redeemed_key_val present -> REVEALED (server truth
    // means revealed only, never REDEEMED without a local mark)
    expect(entry.keys[0].state).toBe('REVEALED')
  })

  test('D-28: an unknown-platform key WITHOUT direct_redeem is retained (no positive entitlement evidence)', () => {
    const entry = classifyOrder(unknownPlatformKeyOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].platform).toBe('weirdstore')
    expect(entry.keys[0].state).toBe('UNREVEALED')
  })

  test('D-28: every evidenced game-store key_type survives even with direct_redeem:true', () => {
    const platforms = [
      'steam',
      'gog',
      'origin',
      'origin_keyless',
      'uplay',
      'epic',
      'epic_keyless',
      'battlenet',
      'nintendo_direct'
    ]
    const entry = classifyOrder(
      {
        gamekey: 'order-all-platforms-direct',
        tpkd_dict: {
          all_tpks: platforms.map((p, i) => ({
            machine_name: `game${i}_${p}`,
            key_type: p,
            direct_redeem: true
          }))
        }
      },
      NEVER_REVEALED
    )
    expect(entry.keys.map((k) => k.platform)).toEqual(platforms)
  })

  test('direct_redeem must be literally true — a truthy non-boolean never excludes', () => {
    const entry = classifyOrder(
      {
        gamekey: 'order-truthy-direct',
        tpkd_dict: {
          all_tpks: [
            {
              machine_name: 'oddgame_odd',
              key_type: 'oddstore',
              direct_redeem: 'yes'
            }
          ]
        }
      },
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(1)
  })

  test('mixed order (1 steam key + 1 direct-redeem entitlement) yields exactly 1 row', () => {
    const entry = classifyOrder(
      mixedKeyAndDirectRedeemEntitlementOrder,
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].machineName).toBe('actualgame2_steam')
  })

  test('D-27 unaffected: the UNPICKED pseudo-entry still fires when all tpks are direct-redeem entitlements', () => {
    const entry = classifyOrder(
      {
        gamekey: 'choice-direct-redeem',
        product: {
          category: 'subscriptioncontent',
          choice_url: 'home/june-2026',
          human_name: 'Humble Choice — June 2026'
        },
        tpkd_dict: {
          all_tpks: [
            {
              machine_name: 'bonus_wallpapers',
              key_type: 'download',
              direct_redeem: true
            }
          ]
        }
      },
      NEVER_REVEALED
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNPICKED')
  })
})

describe('describeZeroKeyOrder — direct-redeem skip reasons with type VALUES (round 6)', () => {
  test('a pure direct-redeem entitlement order is a LEGITIMATE zero-key shape and surfaces key_type/key_type_human_name VALUES', () => {
    const diagnosis = describeZeroKeyOrder(directRedeemEntitlementOrder)
    expect(diagnosis.anomalous).toBe(false)
    expect(diagnosis.detail).toContain('direct-redeem-entitlement')
    // C5 explicitly permits these VALUES — they are platform/type labels,
    // not secrets — and they make the next live run conclusive.
    expect(diagnosis.detail).toContain('key_type=download')
    expect(diagnosis.detail).toContain('key_type_human_name=Download')
  })

  test('C5: the zero-key diagnosis NEVER carries the redeemed key value of a skipped entitlement', () => {
    const diagnosis = describeZeroKeyOrder(directRedeemEntitlementOrder)
    expect(diagnosis.detail).not.toContain('ENTITLEMENT-VALUE-MUST-NOT-LEAK')
  })
})

describe('describeSkippedEntitlements — direct-redeem VALUES in the mixed-order diagnostic (round 6)', () => {
  test('a mixed order reports the skipped direct-redeem count with key_type/key_type_human_name VALUES', () => {
    const detail = describeSkippedEntitlements(
      mixedKeyAndDirectRedeemEntitlementOrder
    )
    expect(detail).not.toBeNull()
    expect(detail).toContain('skippedDirectRedeem=1')
    expect(detail).toContain('key_type=download')
    expect(detail).toContain('key_type_human_name=Download')
  })

  test('C5: the skip diagnostic NEVER carries the redeemed key value of a skipped entitlement', () => {
    const detail = describeSkippedEntitlements(
      mixedKeyAndDirectRedeemEntitlementOrder
    )
    expect(detail).not.toContain('ENTITLEMENT-VALUE-MUST-NOT-LEAK')
  })

  test('a retained direct-redeem KEY (known platform) is not reported as skipped', () => {
    expect(
      describeSkippedEntitlements(realWorldDirectRedeemUplayKeyOrder)
    ).toBeNull()
  })
})

describe('describeMissingExpirationTpks — direct-redeem entitlements are not keys (round 6)', () => {
  test('an undatable direct-redeem entitlement is never diagnosed as a key missing a date', () => {
    expect(
      describeMissingExpirationTpks(
        directRedeemEntitlementOrder,
        new Date('2026-07-06T00:00:00Z')
      )
    ).toBeNull()
  })
})

describe('describeZeroKeyOrder — no-key_type skip reasons (round 5)', () => {
  test('a pure ebook bundle diagnoses each entry as no-key_type with field NAMES', () => {
    const diagnosis = describeZeroKeyOrder(ebookBundleOrder)
    // A download-entitlement-only order is the LEGITIMATE D-29 exclusion
    // shape — informational, not anomalous.
    expect(diagnosis.anomalous).toBe(false)
    expect(diagnosis.detail).toContain('all_tpks=array(2)')
    expect(diagnosis.detail).toContain('[0]:no-key_type(fields=[')
    expect(diagnosis.detail).toContain('[1]:no-key_type(fields=[')
    expect(diagnosis.detail).toContain('machine_name')
    expect(diagnosis.detail).toContain('human_name')
  })

  test('a mix of non-object and no-key_type entries is still anomalous', () => {
    const diagnosis = describeZeroKeyOrder({
      gamekey: 'gk',
      tpkd_dict: {
        all_tpks: ['not-an-object', { machine_name: 'thing_pdf' }]
      }
    })
    expect(diagnosis.anomalous).toBe(true)
    expect(diagnosis.detail).toContain('[0]:non-object(string)')
    expect(diagnosis.detail).toContain('[1]:no-key_type(fields=[')
  })

  test('C5 redaction: no-key_type skip reasons carry field NAMES only, never values', () => {
    const diagnosis = describeZeroKeyOrder({
      gamekey: 'gk',
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'SECRET-NAME-MUST-NOT-LEAK-AS-VALUE',
            secret: 'SECRET-VALUE'
          }
        ]
      }
    })
    expect(diagnosis.detail).toContain('machine_name')
    expect(diagnosis.detail).toContain('secret')
    expect(diagnosis.detail).not.toContain('SECRET-VALUE')
    expect(diagnosis.detail).not.toContain('SECRET-NAME-MUST-NOT-LEAK-AS-VALUE')
  })
})

describe('describeSkippedEntitlements — mixed-order discoverability (round 5)', () => {
  test('a mixed order reports the skipped entitlement count + per-entry field names', () => {
    const detail = describeSkippedEntitlements(mixedKeyAndEntitlementOrder)
    expect(detail).not.toBeNull()
    expect(detail).toContain('skippedNoKeyType=2')
    expect(detail).toContain('[1]:no-key_type(fields=[')
    expect(detail).toContain('[2]:no-key_type(fields=[')
    expect(detail).toContain('machine_name')
  })

  test('an order whose tpks are ALL keys reports nothing (null)', () => {
    expect(
      describeSkippedEntitlements(realWorldUnrevealedPurchaseOrder)
    ).toBeNull()
  })

  test('C5 redaction: field NAMES only, never field values', () => {
    const detail = describeSkippedEntitlements({
      gamekey: 'gk',
      tpkd_dict: {
        all_tpks: [
          { key_type: 'steam', machine_name: 'real_key' },
          { machine_name: 'g', secret: 'SECRET-MUST-NOT-LEAK' }
        ]
      }
    })
    expect(detail).toContain('secret')
    expect(detail).not.toContain('SECRET-MUST-NOT-LEAK')
  })
})

// ── Real-world expiration extraction (live-UAT round 4) ───────────────────
// The real Humble tpk date field name is not conclusively documented; best-
// evidence candidate is `expiry_date` (FailSpy fork DIASILEDU). extractExpiration
// reads a tolerant candidate set and normalizes absolute dates to ISO and a
// relative `num_days_until_expired` count to an absolute ISO from sync time.

describe('extractExpiration — real-world field tolerance', () => {
  const NOW = new Date('2026-07-06T00:00:00Z')

  test('absolute `expiry_date` string -> ISO-normalized', () => {
    const out = extractExpiration({ expiry_date: '2026-08-03T00:00:00Z' }, NOW)
    expect(out).toBe('2026-08-03T00:00:00.000Z')
  })

  test('spec `expiration` string still honored (fallback candidate)', () => {
    const out = extractExpiration({ expiration: '2026-08-03T00:00:00Z' }, NOW)
    expect(out).toBe('2026-08-03T00:00:00.000Z')
  })

  test('relative `num_days_until_expired` -> now + N days as ISO', () => {
    const out = extractExpiration({ num_days_until_expired: 30 }, NOW)
    expect(out).toBe('2026-08-05T00:00:00.000Z')
  })

  test('num_days_until_expired: 0 means "no expiry window", NOT "expires today" -> null', () => {
    expect(extractExpiration({ num_days_until_expired: 0 }, NOW)).toBe(null)
  })

  test('negative num_days_until_expired -> null (no expiry window)', () => {
    expect(extractExpiration({ num_days_until_expired: -5 }, NOW)).toBe(null)
  })

  test('no recognized field -> null', () => {
    expect(
      extractExpiration({ some_unknown_date_field: '2027-01-01' }, NOW)
    ).toBe(null)
  })

  test('unparseable date string -> null, never throws', () => {
    expect(extractExpiration({ expiry_date: 'not-a-date' }, NOW)).toBe(null)
  })

  // WR-02: days > ~1e8 overflows the ECMAScript time range; the invalid
  // Date's .toISOString() used to throw RangeError, violating the "never
  // throws" contract (and crashing the whole sync via the unguarded
  // describeMissingExpirationTpks call path).
  test('WR-02: overflowing num_days_until_expired (beyond the Date range) -> null, never throws', () => {
    expect(() =>
      extractExpiration({ num_days_until_expired: 1e12 }, NOW)
    ).not.toThrow()
    expect(extractExpiration({ num_days_until_expired: 1e12 }, NOW)).toBe(null)
    expect(
      extractExpiration({ num_days_until_expired: Number.MAX_VALUE }, NOW)
    ).toBe(null)
  })
})

describe('classifyOrder — real-world expiration wiring (round 4)', () => {
  const NOW = new Date('2026-07-06T00:00:00Z')

  test('future `expiry_date` -> UNREVEALED with a populated ISO expiration (row display + sort)', () => {
    const entry = classifyOrder(
      realWorldFutureExpiryDateOrder,
      NEVER_REVEALED,
      NOW
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREVEALED')
    expect(entry.keys[0].expiration).toBe('2026-08-03T00:00:00.000Z')
  })

  test('past `expiry_date` (no is_expired flag) -> UNREDEEMABLE via the date alone', () => {
    const entry = classifyOrder(
      realWorldPastExpiryDateOrder,
      NEVER_REVEALED,
      NOW
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('UNREDEEMABLE')
    expect(entry.keys[0].expiration).toBe('2020-01-01T00:00:00.000Z')
  })

  test('relative `num_days_until_expired` -> absolute expiration from sync time', () => {
    const entry = classifyOrder(
      realWorldRelativeExpiryOrder,
      NEVER_REVEALED,
      NOW
    )
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].expiration).toBe('2026-08-05T00:00:00.000Z')
    expect(entry.keys[0].state).toBe('UNREVEALED')
  })
})

describe('describeMissingExpirationTpks — round 4 date-field discovery', () => {
  const NOW = new Date('2026-07-06T00:00:00Z')

  test('active key with no recognized date field -> surfaces its candidate field names', () => {
    const detail = describeMissingExpirationTpks(
      realWorldUndatableActiveOrder,
      NOW
    )
    expect(detail).not.toBeNull()
    expect(detail).toContain('tpksMissingExpiration=1')
    expect(detail).toContain('some_unknown_date_field')
    expect(detail).toContain('machine_name')
  })

  test('key with an extractable expiry_date -> nothing to diagnose (null)', () => {
    expect(
      describeMissingExpirationTpks(realWorldFutureExpiryDateOrder, NOW)
    ).toBeNull()
  })

  test('already-expired key (is_expired true) is not diagnosed', () => {
    expect(
      describeMissingExpirationTpks(realWorldExpiredFlagOrder, NOW)
    ).toBeNull()
  })

  test('download entitlements (no key_type) are not keys — never diagnosed as missing a date', () => {
    expect(describeMissingExpirationTpks(ebookBundleOrder, NOW)).toBeNull()
  })

  test('C5 redaction: diagnosis carries field NAMES only, never field values', () => {
    const detail = describeMissingExpirationTpks(
      {
        gamekey: 'gk',
        tpkd_dict: {
          all_tpks: [
            {
              machine_name: 'g',
              key_type: 'steam',
              is_expired: false,
              secret: 'SECRET-MUST-NOT-LEAK'
            }
          ]
        }
      },
      NOW
    )
    expect(detail).toContain('secret')
    expect(detail).not.toContain('SECRET-MUST-NOT-LEAK')
  })
})

// ── keyindex side-channel + isLocallyRedeemed tier (Phase 14, HCLAIM-01) ──
// classifyOrder must extract each tpk's keyindex into a backend-only
// composite-keyed (`gamekey:machineName`) side-channel — NEVER onto the
// broadcast HumbleKey — and thread a second, composite-keyed predicate
// (isLocallyRedeemed) through to classifyTpk's new precedence tier.

describe('classifyOrder — keyIndexByComposite side-channel (Phase 14)', () => {
  const orderWithKeyindex = {
    gamekey: 'order-keyindex',
    tpkd_dict: {
      all_tpks: [
        {
          machine_name: 'keyindexgame_steam',
          key_type: 'steam',
          human_name: 'Keyindex Game',
          is_expired: false,
          keyindex: 3
        }
      ]
    }
  }

  test('a tpk carrying a numeric keyindex is recorded under the gamekey:machineName composite key', () => {
    const entry = classifyOrder(orderWithKeyindex, NEVER_REVEALED)
    expect(entry.keyIndexByComposite).toEqual({
      'order-keyindex:keyindexgame_steam': 3
    })
  })

  test('a tpk carrying a string keyindex is also recorded (tolerant union)', () => {
    const order = {
      gamekey: 'order-keyindex-str',
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'stringidx_steam',
            key_type: 'steam',
            is_expired: false,
            keyindex: '5'
          }
        ]
      }
    }
    const entry = classifyOrder(order, NEVER_REVEALED)
    expect(entry.keyIndexByComposite).toEqual({
      'order-keyindex-str:stringidx_steam': '5'
    })
  })

  test('a tpk with no keyindex field is simply absent from the map (no throw)', () => {
    const entry = classifyOrder(unrevealedOrder, NEVER_REVEALED)
    expect(entry.keyIndexByComposite).toEqual({})
  })

  test('keyindex NEVER appears on any returned HumbleKey', () => {
    const entry = classifyOrder(orderWithKeyindex, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0]).not.toHaveProperty('keyindex')
  })

  test('a malformed keyindex (object) is tolerated — omitted from the map, order still classifies', () => {
    const order = {
      gamekey: 'order-keyindex-bad',
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'badidx_steam',
            key_type: 'steam',
            is_expired: false,
            keyindex: { nested: true }
          }
        ]
      }
    }
    expect(() => classifyOrder(order, NEVER_REVEALED)).not.toThrow()
    const entry = classifyOrder(order, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keyIndexByComposite).toEqual({})
  })

  test('backward compatibility: existing 2-arg / 3-arg call sites still work (isLocallyRedeemed defaults to always-false)', () => {
    const entry = classifyOrder(
      orderWithKeyindex,
      NEVER_REVEALED,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(entry.keys[0].state).toBe('UNREVEALED')
  })
})

// ── revealedKeyValueByComposite side-channel (CR-01, 14-REVIEW re-review) ──
// A key revealed on Humble's WEBSITE carries redeemed_key_val server-side but
// has no local reveal record — the server value must reach library.ts's
// internal-only revealedKeyValue field via a side-channel (same discipline as
// keyindex: never on the broadcast HumbleKey, never logged).

describe('classifyOrder — revealedKeyValueByComposite side-channel (CR-01)', () => {
  test('a string redeemed_key_val is recorded under the gamekey:machineName composite key', () => {
    const entry = classifyOrder(realWorldRedeemedKeyValOrder, NEVER_REVEALED)
    expect(entry.revealedKeyValueByComposite).toEqual({
      'order-real-redeemed:realredeemed_steam': 'redeemed-value-string'
    })
  })

  test('the spec fallback field redeemed_key_value is also captured', () => {
    const order = {
      gamekey: 'order-fallback-val',
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'fallbackval_steam',
            key_type: 'steam',
            is_expired: false,
            redeemed_key_value: 'fallback-value-string'
          }
        ]
      }
    }
    const entry = classifyOrder(order, NEVER_REVEALED)
    expect(entry.revealedKeyValueByComposite).toEqual({
      'order-fallback-val:fallbackval_steam': 'fallback-value-string'
    })
  })

  test('an OBJECT-shaped redeemed value is omitted from the map (key still classifies REVEALED)', () => {
    const order = {
      gamekey: 'order-object-val',
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'objectval_gog',
            key_type: 'gog',
            is_expired: false,
            redeemed_key_val: { nested: 'structure' }
          }
        ]
      }
    }
    const entry = classifyOrder(order, NEVER_REVEALED)
    expect(entry.revealedKeyValueByComposite).toEqual({})
    // Truthy object still counts as "revealed" for classification.
    expect(entry.keys[0].state).toBe('REVEALED')
  })

  test('a tpk with no redeemed value is simply absent from the map', () => {
    const entry = classifyOrder(unrevealedOrder, NEVER_REVEALED)
    expect(entry.revealedKeyValueByComposite).toEqual({})
  })

  test('the redeemed value NEVER appears on any returned HumbleKey (C4/T-14-02)', () => {
    const entry = classifyOrder(realWorldRedeemedKeyValOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0]).not.toHaveProperty('revealedKeyValue')
    expect(JSON.stringify(entry.keys)).not.toContain('redeemed-value-string')
  })

  test('a skipped direct-redeem entitlement never contributes to the map', () => {
    const entry = classifyOrder(directRedeemEntitlementOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(0)
    expect(entry.revealedKeyValueByComposite).toEqual({})
  })
})

describe('classifyOrder — isLocallyRedeemed composite predicate (D-77)', () => {
  const order = {
    gamekey: 'order-local-redeem',
    tpkd_dict: {
      all_tpks: [
        {
          machine_name: 'localredeem_steam',
          key_type: 'steam',
          is_expired: false
        }
      ]
    }
  }

  test('isLocallyRedeemed(gamekey, machineName) true -> classifies REDEEMED', () => {
    const isLocallyRedeemed = (gamekey: string, machineName: string) =>
      gamekey === 'order-local-redeem' && machineName === 'localredeem_steam'
    const entry = classifyOrder(
      order,
      NEVER_REVEALED,
      new Date('2026-01-01T00:00:00Z'),
      isLocallyRedeemed
    )
    expect(entry.keys[0].state).toBe('REDEEMED')
  })

  test('isLocallyRedeemed false (default) -> classifies UNREVEALED, unaffected', () => {
    const entry = classifyOrder(
      order,
      NEVER_REVEALED,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(entry.keys[0].state).toBe('UNREVEALED')
  })

  test('14-07 gap closure: isLocallyRedeemed wins over server redeemedKeyValuePresent at the classifyOrder level too', () => {
    const redeemedOrderLocal = {
      gamekey: 'order-local-redeem-2',
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'localredeem2_steam',
            key_type: 'steam',
            is_expired: false,
            redeemed_key_val: 'server-value'
          }
        ]
      }
    }
    const entry = classifyOrder(
      redeemedOrderLocal,
      NEVER_REVEALED,
      new Date('2026-01-01T00:00:00Z'),
      () => true
    )
    expect(entry.keys[0].state).toBe('REDEEMED')
  })

  test('14-07 gap closure: a server-revealed key with NO local mark classifies REVEALED, never REDEEMED', () => {
    const redeemedOrderLocal = {
      gamekey: 'order-local-redeem-3',
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'localredeem3_steam',
            key_type: 'steam',
            is_expired: false,
            redeemed_key_val: 'server-value'
          }
        ]
      }
    }
    const entry = classifyOrder(
      redeemedOrderLocal,
      NEVER_REVEALED,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(entry.keys[0].state).toBe('REVEALED')
  })
})

// ── Steam AppID capture (Phase 12, HDEDUP-01/02) ──────────────────────────
// classifyOrder must capture steam_app_id into HumbleKey.steamAppId
// (stringified) ONLY for platform === 'steam' tpks; default the two
// ownership-overlay fields for every classified key; tolerate a malformed
// steam_app_id without throwing.

describe('classifyOrder — steamAppId capture (Phase 12)', () => {
  test('a numeric steam_app_id (620) stringifies to steamAppId === "620"', () => {
    const entry = classifyOrder(steamKeyWithNumericAppIdOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].steamAppId).toBe('620')
  })

  test('a string steam_app_id ("620") yields steamAppId === "620"', () => {
    const entry = classifyOrder(steamKeyWithStringAppIdOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].steamAppId).toBe('620')
  })

  test('a non-Steam tpk (key_type: gog) yields steamAppId === undefined', () => {
    const entry = classifyOrder(nonSteamPlatformOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].steamAppId).toBeUndefined()
  })

  test('every classified key defaults ownedElsewhere: false and matchConfidence: "none"', () => {
    const entry = classifyOrder(steamKeyWithNumericAppIdOrder, NEVER_REVEALED)
    expect(entry.keys[0].ownedElsewhere).toBe(false)
    expect(entry.keys[0].matchConfidence).toBe('none')
  })

  test('T-12-01a: a malformed steam_app_id (an object) does not throw; order still classifies with steamAppId undefined', () => {
    expect(() =>
      classifyOrder(steamKeyWithMalformedAppIdOrder, NEVER_REVEALED)
    ).not.toThrow()
    const entry = classifyOrder(steamKeyWithMalformedAppIdOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].steamAppId).toBeUndefined()
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

// ── 14-08 gap closure (Task 2): server-terminality freeze predicate ──────

describe('isServerTerminal (14-08 gap closure)', () => {
  test('true for REVEALED, REDEEMED, UNREDEEMABLE (server-final states)', () => {
    expect(isServerTerminal('REVEALED')).toBe(true)
    expect(isServerTerminal('REDEEMED')).toBe(true)
    expect(isServerTerminal('UNREDEEMABLE')).toBe(true)
  })

  test('false for UNPICKED/UNREVEALED (still awaiting server action)', () => {
    expect(isServerTerminal('UNPICKED')).toBe(false)
    expect(isServerTerminal('UNREVEALED')).toBe(false)
  })

  test('isTerminal (user-journey terminality) is UNCHANGED — still REDEEMED/UNREDEEMABLE only', () => {
    // WR-02 (14-08 re-review): this guard must actually exercise isTerminal
    // — the one regression it exists to catch (someone "simplifying"
    // isTerminal to include REVEALED, which would freeze REVEALED orders
    // under allTerminal and break patchCachedState's recompute) is only
    // caught by asserting isTerminal's OWN outputs. REVEALED is
    // server-terminal but NOT user-journey terminal.
    expect(isTerminal('REVEALED')).toBe(false)
    expect(isServerTerminal('REVEALED')).toBe(true)
    expect(isTerminal('REDEEMED')).toBe(true)
    expect(isTerminal('UNREDEEMABLE')).toBe(true)
    expect(isTerminal('UNREVEALED')).toBe(false)
    expect(isTerminal('UNPICKED')).toBe(false)
  })
})

describe('isFreezeEligible (14-08 gap closure, single-sourced freeze predicate)', () => {
  test('VALUE-BACKED REVEALED with expiration:null is eligible (server-final, no pending expiry to re-check)', () => {
    expect(
      isFreezeEligible({
        state: 'REVEALED',
        expiration: null,
        revealedKeyValuePresent: true
      })
    ).toBe(true)
  })

  test('CR-01 (14-08 re-review): flag-only REVEALED (no key value present) is NEVER eligible — freezing it would strand the D-78 "unconfirmed — sync to check" reconciliation and the D-66 website-reveal pickup', () => {
    // Absent signal (the safe default — e.g. a caller that has no value
    // information at all) treated as NOT present.
    expect(isFreezeEligible({ state: 'REVEALED', expiration: null })).toBe(
      false
    )
    // Explicit false — the write-ahead-flag-only state produced by the
    // ambiguous / rejected_by_server reveal outcomes.
    expect(
      isFreezeEligible({
        state: 'REVEALED',
        expiration: null,
        revealedKeyValuePresent: false
      })
    ).toBe(false)
  })

  test('REVEALED with a LIVE FUTURE expiration is NOT eligible even when value-backed (retroactive expiry preserved — no standalone recompute exists)', () => {
    expect(
      isFreezeEligible({
        state: 'REVEALED',
        expiration: '2099-01-01T00:00:00.000Z',
        revealedKeyValuePresent: true
      })
    ).toBe(false)
    expect(
      isFreezeEligible({
        state: 'REVEALED',
        expiration: '2099-01-01T00:00:00.000Z'
      })
    ).toBe(false)
  })

  test('REDEEMED is always eligible regardless of expiration — no expiry guard added (behavior preserved)', () => {
    expect(isFreezeEligible({ state: 'REDEEMED', expiration: null })).toBe(true)
    expect(
      isFreezeEligible({
        state: 'REDEEMED',
        expiration: '2099-01-01T00:00:00.000Z'
      })
    ).toBe(true)
  })

  test('UNREDEEMABLE is always eligible regardless of expiration — no expiry guard added (behavior preserved)', () => {
    expect(isFreezeEligible({ state: 'UNREDEEMABLE', expiration: null })).toBe(
      true
    )
    expect(
      isFreezeEligible({
        state: 'UNREDEEMABLE',
        expiration: '2099-01-01T00:00:00.000Z'
      })
    ).toBe(true)
  })

  test('UNPICKED/UNREVEALED are never eligible', () => {
    expect(isFreezeEligible({ state: 'UNPICKED', expiration: null })).toBe(
      false
    )
    expect(isFreezeEligible({ state: 'UNREVEALED', expiration: null })).toBe(
      false
    )
  })
})

describe('classifyOrder — freezeEligible (14-08 gap closure, restores D-24 freeze for server-terminal orders)', () => {
  test('an order whose only key is REVEALED (server redeemed_key_value, no expiration) computes freezeEligible:true', () => {
    const entry = classifyOrder(redeemedOrder, NEVER_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REVEALED')
    expect(entry.keys[0].expiration).toBe(null)
    expect(entry.freezeEligible).toBe(true)
  })

  test('CR-01 (14-08 re-review): a FLAG-ONLY REVEALED key (local write-ahead flag, NO server redeemed value) computes freezeEligible:false — the order must keep re-fetching so the ambiguous-reveal reconciliation / website-reveal value pickup can ever land', () => {
    // revealedViaFlagOrder carries redeemed_key_value: null — REVEALED comes
    // purely from the injected isRevealed lookup (the humbleRevealedStore
    // write-ahead flag), exactly the state the D-78 ambiguous and WR-06
    // rejected_by_server outcomes leave behind.
    const entry = classifyOrder(revealedViaFlagOrder, ALWAYS_REVEALED)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REVEALED')
    expect(entry.keys[0].expiration).toBe(null)
    expect(entry.freezeEligible).toBe(false)
  })

  test('an order whose only key is REVEALED with a LIVE FUTURE expiration computes freezeEligible:false (partitionGamekeys keeps re-fetching it)', () => {
    const NOW = new Date('2026-07-06T00:00:00Z')
    // Force REVEALED via the isRevealed flag (not redeemed_key_value) so the
    // future-expiry fixture — which carries no redeemed_key_value — still
    // classifies REVEALED rather than UNREVEALED.
    const isRevealed = (machineName: string) =>
      machineName === 'settlementsurvival_steam'
    const entry = classifyOrder(realWorldFutureExpiryDateOrder, isRevealed, NOW)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0].state).toBe('REVEALED')
    expect(entry.keys[0].expiration).not.toBe(null)
    expect(entry.freezeEligible).toBe(false)
  })

  test('REDEEMED/UNREDEEMABLE freeze exactly as before — no behavior change for those states', () => {
    const entry = classifyOrder(unredeemableOrder, ALWAYS_REVEALED)
    expect(entry.keys[0].state).toBe('UNREDEEMABLE')
    expect(entry.allTerminal).toBe(true)
    expect(entry.freezeEligible).toBe(true)
  })

  test('a non-terminal order (UNREVEALED) computes freezeEligible:false, matching allTerminal', () => {
    const entry = classifyOrder(unrevealedOrder, NEVER_REVEALED)
    expect(entry.allTerminal).toBe(false)
    expect(entry.freezeEligible).toBe(false)
  })

  test('D-27: an UNPICKED pseudo-entry never computes freezeEligible:true', () => {
    const entry = classifyOrder(unpickedChoiceMonthOrder, NEVER_REVEALED)
    expect(entry.keys[0].state).toBe('UNPICKED')
    expect(entry.freezeEligible).toBe(false)
  })
})
