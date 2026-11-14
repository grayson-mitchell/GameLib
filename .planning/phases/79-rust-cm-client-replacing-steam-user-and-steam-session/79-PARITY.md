# Phase 79 Parity Report

Status: PENDING operator acceptance

Plan 79-24 (CF-01, CF-03, CF-04, CF-05, D-07, D-16; Tier 2 for the CM ops). Sweep: `pnpm steamcm-parity-sweep` (`meta/steamcmParitySweep.ts`), run on the operator's Mac with the dev-vault refresh token. Read-only ops only (no redeem, no credential sign-in). Output is redacted (counts, classes, sha1 prefixes); no key, request code, token, name, SteamID or absolute path appears here.

## Corpus

| Category                                                                | Count                          |
| ----------------------------------------------------------------------- | ------------------------------ |
| Licences (package ids, both sides)                                      | 485                            |
| Packages through PICS (tokens-first, both sides)                        | 485                            |
| Licence app ids reached through those packages                          | 1,144 (steam-user), 1,144 (Rust) |
| Owned apps (`includePlayedFreeGames`)                                   | 390 (steam-user), 390 (Rust)   |
| Owned-app field comparisons (name, playtime, last played)               | 390                            |
| PICS app sample (first 25 owned apps, `inclTokens`)                     | 25                             |
| Depot triples (key SHA-1 and request-code presence)                     | 3                              |
| Content-server lists                                                    | 1                              |
| Own-persona presence                                                    | 1                              |
| Licences carrying a non-zero access token                               | 467                            |

## CM ops sweep

Exit code: 0 (final run, after the fix below). steam-user logged on in process with a random non-zero logonID; the Rust CLI logged on with logonId 0 under a fresh fake HOME, token on stdin only, one session.

Rust logon used the stored steam-session refresh token unchanged and no account name: yes (D-07, CF-03). Licence app ids after tokens-first PICS: 1,144 on both sides (CF-05). Owned apps: 390 on both sides.

| Category                              | Inputs | Equal | Explained                       | Unexplained |
| ------------------------------------- | ------ | ----- | ------------------------------- | ----------- |
| licences (package ids)                | 1      | 1     | 0                               | 0           |
| licence-appids (after tokens-first)   | 1      | 1     | 0                               | 0           |
| owned-set (ids and playtime)          | 1      | 1     | 0                               | 0           |
| owned-field (name/playtime/last)      | 390    | 390   | 0                               | 0           |
| pics (appinfo, 25 apps)               | 25     | 25    | 0                               | 0           |
| depot-key (SHA-1 equality)            | 3      | 3     | 0                               | 0           |
| request-code (presence)               | 3      | 3     | 0                               | 0           |
| content-servers (count)               | 1      | 1     | 0                               | 0           |
| persona (own persona present)         | 1      | 0 or 1 | persona-unsupported 0 or 1      | 0           |

The persona row varied between runs (see DV-79-09): of six full sweeps after the fix, four reported `persona-unsupported` and two reported equal. Both outcomes exit 0. Every other row was identical on every run.

The first sweep (before the fix) exited 1 with licence-appids unexplained (steam-user 1,144 vs Rust 0); see Fixes.

## Divergences

Sources: golden overrides (79-21) and notes from 79-08/09/21, plus what this sweep measured. "Steam-correct side" is the side that matches what the CM sends or what Steam's own client does (63 D-07); where no side is wrong the row says so.

### DV-79-01: licences carry 6 of steam-user's 18 fields

- source: golden override `licenses_three` (class omitted-field)
- steam-user: each licence is the whole `CMsgClientLicenseList.License` (time_next_process, minute_limit, minutes_used, payment_method, purchase_country_code, territory_code, change_number, initial/renewal period and unit, master_package_id, plus the six below).
- Rust: `licenses_json` emits package_id, time_created, owner_id, access_token, license_type, flags.
- Steam-correct side: both carry correct values for the six shared fields (package ids equal on the live account: 485 of 485). The 12 omitted fields are simply not read.
- caller impact: none. GameLib reads `package_id` (and the access token inside the Rust op). A future caller needing the other 12 fields must extend `licenses_json`.
- accepted: pending

### DV-79-02: owned apps omit `img_icon_url`

- source: golden override `owned_apps_two` (omitted-field)
- steam-user: rewrites `img_icon_url` to a steamcdn URL.
- Rust: omits it (the raw owned-game row from the CM does not carry it).
- Steam-correct side: neither is wrong; the field is derived data in steam-user.
- caller impact: none. Refresh does not read it; artwork comes from the store metadata path.
- accepted: pending

### DV-79-03: content servers omit `sourceid`, `preferred_server`, `NumEntriesInClientList`

- source: golden override `content_servers_strings` (omitted-field)
- steam-user: passes all three through from the directory response.
- Rust: `CdnServerRaw` does not carry them.
- Steam-correct side: neither is wrong; the live sweep found equal server counts for the sampled app.
- caller impact: none. The depot pipeline does not read them.
- accepted: pending

### DV-79-04: Rust appinfo adds `depotOrder`

- source: golden overrides `anon_pics_480`, `_1007`, `_232250`, `_220` (extra-rust-field)
- steam-user: no such field (JS objects keep insertion order).
- Rust: adds `depotOrder`, the depot ids in source order, on each app entry, replacing what the TS `appinfoOrder` tap computed from steam-user's private `_send`.
- Steam-correct side: both. Every `appinfo` value is identical (live: 25 of 25 equal, 0 explained).
- caller impact: callers get depot order from `depotOrder` instead of the private tap; extra field is ignored elsewhere.
- accepted: pending

### DV-79-05: an empty `allowed_app_ids` list

- source: 79-21 SUMMARY (not exercised by a golden; the real directory omits the key when empty)
- steam-user: an empty (truthy) array is a restriction.
- Rust: empty means unrestricted.
- Steam-correct side: Rust. An empty allow-list that excludes every app is not a meaningful directory answer.
- caller impact: only if Steam ever sends an empty list: Rust would offer servers steam-user would filter out.
- accepted: pending

### DV-79-06: an empty redeem receipt

- source: 79-21 SUMMARY (steam-user's `BinaryKVParser.parse` throws on an empty buffer, measured)
- steam-user: `redeemKey` never resolves.
- Rust: resolves with an empty `packageList`.
- Steam-correct side: Rust (a hang is not a result).
- caller impact: a redeem that returns no receipt now completes (with no packages) instead of hanging until the caller's timeout.
- accepted: pending

### DV-79-07: package tokens are taken first, from the licence then from PICS

- source: 79-08 notes plus this sweep
- steam-user: requests packages, then re-requests the `missingToken` ones; for a package with `inclTokens`, a licence's non-zero access token is used.
- Rust: asks for access tokens before the request (CF-05, one round trip) and, since the fix in this plan, also prefers a licence's non-zero token for a package, like steam-user.
- Steam-correct side: equal results measured: 485 packages, 1,144 app ids on both sides, 0 `missingToken`.
- caller impact: none observable; fewer round trips.
- accepted: pending

### DV-79-08: `redeem_key` returns Ok plus the eresult

- source: 79-09/79-17 adapter
- steam-user: a non-OK purchase result rejects with an error carrying `eresult`, `purchaseResultDetails` and `packageList`.
- Rust: the op returns the result with `eresult`; the TS `RustCmClient.redeemKey` adapter rejects with the same error shape when `eresult != 1`.
- Steam-correct side: both (same observable behaviour through the adapter).
- caller impact: none through the adapter; a direct `steamcm_redeem_key` caller must check `eresult` itself. Not exercised live (read-only sweep).
- accepted: pending

### DV-79-09: own persona is intermittently absent after other session ops

- source: this sweep (class persona-unsupported, closed list in the plan)
- steam-user: `getPersonas([own id])` returned the own persona on every run. steam-user keeps the persona state Steam pushes at logon and serves from that cache.
- Rust: asks the CM each call and waits 5 s, returning an empty map on silence (79-09). Measured with scratch sessions: present when it is the first op after logon (3 of 3) and after a licence read (1 of 1); absent after a PICS product-info op (1 of 1) and when asked a second time in the same session (1 of 1). The cause is Steam-side behaviour (Steam seems to answer an own-id friend-data request once, early in a session); not root-caused beyond that.
- Steam-correct side: not decided. Steam's answer to the live request is the truth, steam-user hides the silence behind its cache.
- caller impact: persona names are fetched at sign-in as the first op after logon, where Rust returned the persona every time it was measured. A later caller of the persona op could get an empty map. Option if rejected: have the Rust session cache the persona state it receives at logon.
- accepted: pending

## Fixes made during the sweep

1. Package PICS parse (Rust bug, commit 77c1cad60). The first sweep returned `packageinfo: null` for all 485 packages (0 of 1,144 licence app ids). `packageinfo_to_json` read the package id from the 4-byte buffer header, but real Steam sends `01 00 00 00` there; the id is the root key, and steam-user looks the root key up by the requested id. Rust now takes the id from the answer. The hand-written fixture (79-08) had assumed the header was the id; it now carries the real header. After the fix: 485 of 485 packages parse and app ids match 1,144 to 1,144.
2. Licence-token fallback for packages (same commit, steam-user `apps.js` 215-223): with `inclTokens`, a package uses its licence's non-zero access token ahead of the PICS-supplied one. A unit test pins it. It did not change the live result by itself (the header bug was the cause); kept for parity.
3. Re-ran `cargo test -p gamelib-steamcm` (265 passed), `cargo clippy -p gamelib-steamcm --tests`, `cargo fmt --check`, and `pnpm exec jest src/backend/storeManagers/steam/cm meta/__tests__/gamelibSteamcmCli.test.ts meta/__tests__/steamcmParitySweep.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts` (all passed).

## Refresh sweep (79-33)

pending

## Mac Steam path (79-36)

pending

## Delete gate (79-38)

pending
