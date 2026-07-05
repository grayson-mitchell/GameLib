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
