/**
 * Representative raw Humble `getOrderDetail` response fixtures, one per
 * classification state, plus edge cases (malformed tpk, re-sync gaining an
 * expiration, non-Steam platform, DRM-free-only order). Shapes mirror the
 * OrderDetailSchema tightened in adapter.ts (Task 2) — `.passthrough()` at
 * every level, so these intentionally include extra unused fields (e.g.
 * `human_name` on both the order and the tpk) matching the real API shape
 * described in HUMBLE-SPEC-SOURCE.md.
 */

// D-27: unpicked Humble Choice month — subscriptioncontent + choice_url,
// no allocated tpks. `deadline_date` is speculative (Assumption A2) — the
// pseudo-entry must render fine even if this field is absent from the real API.
export const unpickedChoiceMonthOrder = {
  gamekey: 'choice-2026-03',
  human_name: 'Humble Choice — March 2026',
  product: {
    category: 'subscriptioncontent',
    choice_url: 'home/march-2026',
    human_name: 'Humble Choice — March 2026',
    deadline_date: '2026-03-31T23:59:59Z'
  },
  tpkd_dict: { all_tpks: [] }
}

// Same as above but missing choice_url and deadline entirely — must still
// not throw; simply omits the pseudo-entry (Pitfall 2 defensive handling).
export const unpickedChoiceMonthMissingUrlOrder = {
  gamekey: 'choice-2026-04',
  human_name: 'Humble Choice — April 2026',
  product: {
    category: 'subscriptioncontent',
    human_name: 'Humble Choice — April 2026'
  },
  tpkd_dict: { all_tpks: [] }
}

export const unrevealedOrder = {
  gamekey: 'order-unrevealed',
  human_name: 'Some Bundle',
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'somegame_steam',
        human_name: 'Some Game',
        key_type: 'steam',
        redeemed_key_value: null,
        expiration: null
      }
    ]
  }
}

// "Revealed" comes from the isRevealed() lookup passed into classifyOrder,
// not from any field on this fixture itself — the local flag is external
// state (humbleRevealedStore), never embedded in the synced order data.
export const revealedViaFlagOrder = {
  gamekey: 'order-revealed',
  human_name: 'Another Bundle',
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'anothergame_steam',
        human_name: 'Another Game',
        key_type: 'steam',
        redeemed_key_value: null,
        expiration: null
      }
    ]
  }
}

export const redeemedOrder = {
  gamekey: 'order-redeemed',
  human_name: 'Redeemed Bundle',
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'redeemedgame_steam',
        human_name: 'Redeemed Game',
        key_type: 'steam',
        redeemed_key_value: 'ABCD-1234-EFGH',
        expiration: null
      }
    ]
  }
}

// D-30/Open Question 3: redeemed_key_value is present, but expiration is
// ALSO in the past — expiration must still win (UNREDEEMABLE), proving the
// literal D-30 precedence rather than a "redeemed wins" reordering.
export const unredeemableOrder = {
  gamekey: 'order-expired',
  human_name: 'Expired Bundle',
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'expiredgame_steam',
        human_name: 'Expired Game',
        key_type: 'steam',
        redeemed_key_value: 'ZZZZ-9999-YYYY',
        expiration: '2020-01-01T00:00:00Z'
      }
    ]
  }
}

// A null entry and a non-object entry alongside one well-formed tpk — the
// malformed entries must be skipped, never throw out of the loop (T-11-05),
// and the good entry must still classify.
export const malformedTpkOrder = {
  gamekey: 'order-malformed',
  human_name: 'Malformed Bundle',
  tpkd_dict: {
    all_tpks: [
      null,
      'not-an-object',
      {
        machine_name: 'goodgame_steam',
        human_name: 'Good Game',
        key_type: 'steam',
        redeemed_key_value: null,
        expiration: null
      }
    ]
  }
}

// HSYNC-03 re-sync fixture: the same tpk (by machine_name), first observed
// with no expiration, then re-fetched with a newly-added past expiration.
export const resyncTpkFirstSync = {
  gamekey: 'order-resync',
  human_name: 'Resync Bundle',
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'resyncgame_steam',
        human_name: 'Resync Game',
        key_type: 'steam',
        redeemed_key_value: null,
        expiration: null
      }
    ]
  }
}

export const resyncTpkSecondSync = {
  gamekey: 'order-resync',
  human_name: 'Resync Bundle',
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'resyncgame_steam',
        human_name: 'Resync Game',
        key_type: 'steam',
        redeemed_key_value: null,
        expiration: '2020-01-01T00:00:00Z'
      }
    ]
  }
}

// D-28: platform-agnostic classification — a non-Steam key_type must
// classify through the same precedence and carry its own platform label.
export const nonSteamPlatformOrder = {
  gamekey: 'order-gog',
  human_name: 'GOG Bundle',
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'goggame_gog',
        human_name: 'GOG Game',
        key_type: 'gog',
        redeemed_key_value: null,
        expiration: null
      }
    ]
  }
}

// D-29: DRM-free-only order — no tpks at all, and the product is not a
// subscriptioncontent Choice month, so it must yield zero HumbleKey entries.
export const drmFreeOnlyOrder = {
  gamekey: 'order-drm-free',
  human_name: 'DRM Free Bundle',
  tpkd_dict: {},
  product: {
    category: 'bundle',
    human_name: 'DRM Free Bundle'
  }
}

// ─── Real-world payload shapes (live-UAT round 3) ─────────────────────────
// Field set verified against two WORKING integrations' models of the live
// API (Playnite HumbleKeysLibrary Models/Order.cs Tpk; FailSpy
// humble-steam-key-redeemer): the redeemed field is `redeemed_key_val`
// (any JSON type — NOT the spec's `redeemed_key_value`) and the expiry
// signal is `is_expired` (bool — NOT an `expiration` timestamp string).
// The earlier fixtures above (spec-shaped) are kept: both shapes must
// classify (shape-tolerant extraction).

// Direct store purchase, key not yet revealed: no redeemed_key_val at all.
export const realWorldUnrevealedPurchaseOrder = {
  gamekey: 'order-real-direct',
  uid: 'uid-real-direct',
  product: {
    category: 'storefront',
    machine_name: 'directgame_storefront',
    human_name: 'Direct Purchase'
  },
  subproducts: [],
  path_ids: ['12345'],
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'directgame_steam',
        gamekey: 'order-real-direct',
        key_type: 'steam',
        visible: true,
        key_type_human_name: 'Steam',
        human_name: 'Direct Game',
        class: 'holiday',
        library_family_name: 'directgame',
        steam_app_id: '123450',
        is_expired: false
      }
    ]
  }
}

// Already-redeemed key: real `redeemed_key_val` field carries the value.
export const realWorldRedeemedKeyValOrder = {
  gamekey: 'order-real-redeemed',
  product: { category: 'bundle', human_name: 'Real Bundle' },
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'realredeemed_steam',
        gamekey: 'order-real-redeemed',
        key_type: 'steam',
        key_type_human_name: 'Steam',
        human_name: 'Real Redeemed Game',
        steam_app_id: '54321',
        is_expired: false,
        redeemed_key_val: 'redeemed-value-string'
      }
    ]
  }
}

// Expired key: real `is_expired: true` flag, no expiration timestamp —
// must classify UNREDEEMABLE even though redeemed_key_val is present
// (D-30 precedence: expiry beats redeemed).
export const realWorldExpiredFlagOrder = {
  gamekey: 'order-real-expired',
  product: { category: 'bundle', human_name: 'Expired Real Bundle' },
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'realexpired_steam',
        gamekey: 'order-real-expired',
        key_type: 'steam',
        human_name: 'Real Expired Game',
        is_expired: true,
        redeemed_key_val: 'redeemed-value-string'
      }
    ]
  }
}

// Gift key (HUMBLE-SPEC-SOURCE §gift fields / D-28): carries gift-specific
// fields, no redeemed_key_val — must classify UNREVEALED (giftable state
// maps into the 5-state model), never be skipped.
export const realWorldGiftKeyOrder = {
  gamekey: 'order-real-gift',
  product: { category: 'bundle', human_name: 'Gifted Bundle' },
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'giftgame_steam',
        gamekey: 'order-real-gift',
        key_type: 'steam',
        key_type_human_name: 'Steam',
        human_name: 'Gifted Game',
        is_gift: true,
        is_expired: false,
        steam_app_id: '99999'
      }
    ]
  }
}

// Minimal structural requirement: a bare object tpk with NO fields at all
// must still classify (fallback identity + 'unknown' platform) — the
// shape-tolerance floor.
export const minimalTpkOrder = {
  gamekey: 'order-minimal',
  tpkd_dict: {
    all_tpks: [{}]
  }
}

// Stripped order: parses ok but carries NO tpkd_dict at all — the shape the
// round-3 zero-keys diagnosis must make self-evident in the logs.
export const strippedNoTpkdDictOrder = {
  gamekey: 'order-stripped',
  uid: 'uid-stripped',
  product: { category: 'bundle', human_name: 'Stripped Order' },
  subproducts: []
}

// ─── Real-world expiration shapes (live-UAT round 4) ──────────────────────
// The spec's single `expiration` string name never matched the live payload,
// so every row showed "No expiration". The real absolute date field is not
// conclusively documented; best-evidence candidate is `expiry_date` (FailSpy
// fork DIASILEDU reads `tpk.get("expiry_date")`). These fixtures cover the
// absolute-date and relative-days shapes extractExpiration must handle.

// Active key with a FUTURE absolute expiry_date (the tester's "Settlement
// Survival expires Aug 3rd 2026" case): is_expired:false, must classify
// UNREVEALED and carry a populated, ISO-normalized expiration for display+sort.
export const realWorldFutureExpiryDateOrder = {
  gamekey: 'order-future-expiry',
  product: { category: 'bundle', human_name: 'Expiring Bundle' },
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'settlementsurvival_steam',
        gamekey: 'order-future-expiry',
        key_type: 'steam',
        key_type_human_name: 'Steam',
        human_name: 'Settlement Survival',
        is_expired: false,
        expiry_date: '2026-08-03T00:00:00Z'
      }
    ]
  }
}

// Key with a PAST absolute expiry_date but NO is_expired flag — the date alone
// must classify UNREDEEMABLE (extractExpiration -> classifyTpk past-date tier).
export const realWorldPastExpiryDateOrder = {
  gamekey: 'order-past-expiry',
  product: { category: 'bundle', human_name: 'Lapsed Bundle' },
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'lapsedgame_steam',
        gamekey: 'order-past-expiry',
        key_type: 'steam',
        human_name: 'Lapsed Game',
        expiry_date: '2020-01-01T00:00:00Z'
      }
    ]
  }
}

// Relative-days shape: `num_days_until_expired` -> extractExpiration computes
// syncTime + N days as the absolute expiration.
export const realWorldRelativeExpiryOrder = {
  gamekey: 'order-relative-expiry',
  product: { category: 'bundle', human_name: 'Relative Bundle' },
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'relativegame_steam',
        gamekey: 'order-relative-expiry',
        key_type: 'steam',
        human_name: 'Relative Game',
        is_expired: false,
        num_days_until_expired: 30
      }
    ]
  }
}

// Active key with NO recognized date field and is_expired:false — the shape the
// round-4 expiration diagnostic must surface (candidate field names, redacted)
// so the true date field can be identified on the next live run.
export const realWorldUndatableActiveOrder = {
  gamekey: 'order-undatable',
  product: { category: 'bundle', human_name: 'Undatable Bundle' },
  tpkd_dict: {
    all_tpks: [
      {
        machine_name: 'undatablegame_steam',
        gamekey: 'order-undatable',
        key_type: 'steam',
        human_name: 'Undatable Game',
        is_expired: false,
        some_unknown_date_field: '2027-01-01T00:00:00Z'
      }
    ]
  }
}
