---
spike: 073
name: rust-owned-apps-parity
type: standard
validates: "Given a refresh-token logon on steam-vent, when it fetches owned games and license-derived apps the way GameLib does, then both sets match steam-user exactly on the operator's account"
verdict: VALIDATED
related: [071a, 071c, 052]
tags: [rust, steam, owned-apps, licenses, pics, redeem, steam-vent, sidecar-retirement, live]
---

# Spike 073: Owned-apps parity

## What This Validates

GameLib's Steam library has two ownership sources today:

- `library/refresh.ts`: `getUserOwnedApps(steamID, { includePlayedFreeGames: true })`, i.e.
  `Player.GetOwnedGames#1` with steam-user's defaults (`include_appinfo` true,
  `include_free_sub` false, `skip_unvetted_apps` true).
- `licensedDemos.ts` (spike 052): `client.licenses` → `getProductInfo([], packageIds, true)` →
  each package's `appids`, for demos `GetOwnedGames` never returns.

Given a steam-vent refresh-token logon, both must match steam-user exactly. Key redeem is checked
too, cheaply.

## How to Run

```bash
cargo build --release
V="$TMPDIR/gamelib-dev-secret-vault.json"; W=../071a-cm-crate-steamroom/run-authed.sh
$W ./target/release/spike-073-owned owned "$V" --redeem-bogus   # -> out/rust-*.json
sleep 15   # let Mac Steam finish reconnecting, or the next wrap refuses (see trail)
$W node steam-user-owned.mjs "$V"                              # -> out/node-*.json
```

`parity.txt` holds the diff output from the run.

## Investigation Trail

1. **Rust run** (one logon, wrap LogOff in 400 ms): 485 licenses via subscription;
   `Player.GetOwnedGames#1` → **390 games** in 0.41 s; package access tokens for 485 packages
   (481 issued), then PICS package info → **1,144 app IDs** in 1.10 s. The answer came in
   **1 message**, so `job_multi` again saw no split (071c's gap stays open). Binary package KV
   was read with a 60-line reader in the harness; steam-vent has none.
2. **Bogus redeem** (`ClientRegisterKey` with `AAAAA-BBBBB-CCCCC`): `CMsgClientPurchaseResponse`
   came back as a job reply, `eresult` 2, `purchase_result_details` 14 (BadActivationCode). The
   message round-trips; nothing was redeemed. One attempt only, to stay well clear of Steam's
   failed-activation lockout. A real key was not tried.
3. **steam-user reference, first try: refused by the wrap.** It started right after the Rust
   run's `goonline`, while Mac Steam was still reconnecting, so no fresh LogOff appeared. The
   wrap behaved as designed and did not log on. GameLib's own `macSteamOffline.ts` has the same
   exposure for back-to-back authenticated sessions, so the refcounted single entry point matters.
4. **steam-user reference after 15 s:** `getUserOwnedApps` 390; 485 packages → 1,144 app IDs.
5. **Diff:** owned games identical in app IDs, `name`, `playtime_forever` and `rtime_last_played`
   (0 of 390 differ). License app IDs identical (1,144 = 1,144). 754 are licensed-not-owned, the
   demo candidates.
6. **Why 071a got 939:** steamroom asked for package info **without access tokens**. Packages
   that need a token come back without their app IDs. Fetch package tokens first, as steam-user
   does.

## Results

**VALIDATED.** Both of GameLib's ownership sources are reproducible from Rust with exact parity:

| Source | steam-user | steam-vent | Match |
|---|---|---|---|
| `Player.GetOwnedGames#1` (GameLib options) | 390 | 390 | ✓ ids, names, playtime, last played |
| licenses → PICS packages → appids | 1,144 | 1,144 | ✓ identical set |
| redeem (`ClientRegisterKey`) | — | job reply, BadActivationCode | message works; real key untested |

Not covered: **family-shared licenses.** None on this account (071a counted 0 licenses with
another `owner_id`), so Family Sharing ownership isn't exercised.
