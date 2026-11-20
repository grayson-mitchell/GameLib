---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 09
subsystem: steam-cm
tags: [rust, steam-vent, depot, redeem, personas]
requires: [79-04]
provides:
  - ops::depot (depot_key, manifest_request_code, content_servers)
  - ops::account (owned_apps, redeem_key, personas)
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/ops/depot.rs
    - src-tauri/crates/gamelib-steamcm/src/ops/account.rs
    - src-tauri/crates/gamelib-steamcm/src/backend.rs
    - src-tauri/crates/gamelib-steamcm/src/vent.rs
decisions:
  - "redeem_key returns Ok for every CM reply and adds `eresult`; only transport failures are Err"
  - "personas returns an empty map on timeout; Unsupported surfaces as Err"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 09: Depot and account ops Summary

Rust equivalents of steam-user's depot key, manifest request code, CDN host list, owned apps, redeem and persona calls, each with an idempotency const.

## Commits

- 5c87047b5 depot.rs
- 74008899a account.rs, PurchaseRaw receipt, live persona test
- follow-up fix commit: clippy-clean const assertion for the idempotency flags

## Persona proof (D-06)

`personas_live` against the operator's dev-vault token: **player_name present: true**. steam-vent handles
`CMsgClientRequestFriendData` / `CMsgClientPersonaState`, so the sign-in persona name works and D-06's
account-name fallback is only needed when the op times out (empty map) or reports `unsupported`.

## Shapes

- `depot_key`: `{eresult, keyHex}` lowercase hex; non-1 eresult is `Err(EResult(n))`.
- `manifest_request_code`: `{requestCode: "<decimal>"}`; non-numeric id is `Protocol("bad-manifest-id")`.
- `content_servers`: CDN/SteamCache only, filtered by `allowed_app_ids`, load/weightedload as strings; empty is `Protocol("no-content-servers")`. Requests cell 0, max 20 servers.
- `owned_apps`: `{app_count, apps:[{appid,name,playtime_forever,rtime_last_played}]}`.
- `redeem_key`: `{eresult, purchaseResultDetails, packageList}`; `REDEEM_IDEMPOTENT = false`.
- `personas`: `{personas:{[id]:{player_name,persona_state,avatar_hash(hex)}}}`.

## Deviations from Plan

1. **[Rule 3 - Blocking] PurchaseRaw gained `receipt: Vec<u8>`** (backend.rs, vent.rs): packageList needs the binary `purchase_receipt_info`, which the raw struct did not carry. Fake needed no change (Default).
2. **redeem_key adds an `eresult` field and returns Ok on non-OK replies**: steam-user rejects with `purchaseResultDetails`/`packageList` attached, which `Err(CmError)` cannot carry. The 79-20 adapter must reject when `eresult != 1`.
3. **Fields absent from the raw rows**: `content_servers` omits `sourceid`, `preferred_server`, `NumEntriesInClientList` (not in `CdnServerRaw`; TS only reads Host/vhost/weightedload); `owned_apps` omits `img_icon_url` (Refresh does not read it).

## Known Stubs

None.

## Threat Flags

None. Ops never log keys, receipts or names; the live test prints presence only.

## Self-Check: PASSED

`cargo test -p gamelib-steamcm --lib` green (132 passed, 3 ignored live), clippy `-D warnings` and `cargo fmt --check` clean, REDEEM_IDEMPOTENT false (1 match), 3 idempotent consts in depot.rs, no CDN-auth-token references.
