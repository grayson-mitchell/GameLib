# Steam library ownership sources

How GameLib builds a complete Steam library: owned games from `GetOwnedGames`, plus demos and
unplayed free-to-play titles that only the licenses path reveals. Also what does **not** work:
reading the library over the Web API without an authenticated CM logon (053, 053b — both
INVALIDATED).

## Requirements

- Demos never appear in `Player.GetOwnedGames`, played or not, under any option steam-user
  exposes. The library must union owned games with license-derived apps. _(052)_
- Filter license-derived apps by PICS `common.type`; the raw list is dominated by DLC, tools and
  configs. _(052)_
- Fetch package access tokens before PICS package info, or token-gated packages return no
  appids. _(073)_
- The library read needs the authenticated CM session. A SteamClient refresh token cannot mint
  a web access token outside it, with or without renewal, over either transport. _(053, 053b)_
- On macOS, the authenticated logon runs inside the go-offline wrap (046b) so Mac Steam's
  Friends list stays signed in. _(052, 073)_

## How to Build It

### 1. Owned games (existing path)

```js
// library/refresh.ts — Player.GetOwnedGames#1
const owned = await client.getUserOwnedApps(client.steamID, { includePlayedFreeGames: true })
```

steam-user's defaults apply: `include_appinfo` true, `include_free_sub` false,
`skip_unvetted_apps` true. Measured on the operator's account (052): `current_gamelib` 389,
`plus_free_sub` 389, `plus_unvetted` 390, `all_flags` 390. None of the variants returns a demo.

### 2. Licensed apps (the demo / F2P path)

`client.licenses` is filled by the CM `ClientLicenseList` message right after logon, so a
Refresh that already runs an authenticated session pays nothing extra for it.

```js
const licensesSeen = new Promise((r) => client.once('licenses', r))
// ... after logon:
await Promise.race([licensesSeen, sleep(10000)])
const packageIds = [...new Set((client.licenses ?? []).map((l) => l.package_id))]
const pkgInfo = (await client.getProductInfo([], packageIds, true)).packages // inputs carry access tokens
// each package -> packageinfo.appids; then app info (chunks of 200) for common.type / parent
```

Then:

1. Compute licensed-but-not-owned = license appids − owned appids (754 on the test account).
2. PICS app info only for that remainder (keeps the extra lookups bounded).
3. Keep `common.type === 'Demo'`; optionally `Game` to show unplayed free-to-play titles
   (Dota 2, TF2, Warframe, Path of Exile…), which `includePlayedFreeGames` hides until played.
4. Drop Spacewar (480) and similar SDK test apps.

The subject demo (Schedule I: Free Sample, 3205720) was licensed via package 1136752:
`billingtype 12` (free on demand), `license_type 1`, `payment_method 1024`, `flags 0`; app type
`Demo`, parent `3164500`. Breakdown of the 754-app remainder: 440 DLC, 190 tools, 65 configs,
25 unknown, 9 music, 3 applications, **12 demos, 10 games**.

### 3. Rust parity (073 — later confirmation)

Spike 073 (VALIDATED) reproduced both sources from Rust (steam-vent, refresh-token logon) with
exact parity against steam-user on the same account: `GetOwnedGames` 390 = 390 (ids, names,
`playtime_forever`, `rtime_last_played` identical); licenses → package tokens → PICS → 1,144 =
1,144 appids. The order matters: request package access tokens first, then package info. An
earlier Rust attempt (071a) that skipped tokens got 939. steam-vent has no binary package-KV
reader; 073 used a ~60-line reader in the harness. Family-shared licenses were not exercised.

## What to Avoid

- **Do not assume "free-on-demand licenses are excluded until played".** That note (todo
  `2026-10-30-store-exit-library-refresh-...`) was wrong; playing a demo does not bring it into
  `GetOwnedGames`. _(052, reversal)_
- **Do not try to replace the CM logon with a minted web access token.** Both mint routes failed
  for GameLib's `EAuthTokenPlatformType.SteamClient` token, even though its JWT `aud` includes
  `client, web, renew, derive` and it was unexpired:

  | Attempt                                                               | Result                                 |
  | --------------------------------------------------------------------- | -------------------------------------- |
  | `LoginSession.refreshAccessToken()` (CM websocket, renewal None)      | `AccessDenied` (15)                    |
  | HTTPS form POST `GenerateAccessTokenForApp/v1`, `renewal_type 0`      | HTTP 200, `{"response":{}}`, x-eresult 63 |
  | `LoginSession.renewRefreshToken()` (CM websocket, renewal Allow)      | `AccessDenied` (15)                    |
  | HTTPS form POST, `renewal_type 1`                                     | HTTP 200, `{"response":{}}`, x-eresult 15 |

  Note the HTTPS endpoint returns **HTTP 200 with an empty body** on refusal — read the
  `x-eresult` header, not the status code.
- **Do not run renewal experiments against the real Keychain token without a backup.**
  `renewal_type Allow` can rotate the refresh token. 053b backed up to a 0600 file, compared after,
  and deleted the backup; follow that shape.
- **Do not use a raw licenses list as the library** — filter by type.
- **Do not fetch PICS package info without access tokens** (073).
- **Do not run two wrapped authenticated sessions back to back.** The second wrap refuses until
  Mac Steam finishes reconnecting (~15 s); use a single refcounted entry point. _(073)_

## Constraints

- Library Refresh needs an authenticated CM logon — there is no CM-free route for a SteamClient
  token (053/053b INVALIDATED).
- Untested, both CM-free by construction: a separate **WebBrowser-platform** refresh token
  (second sign-in / QR scan, minted via `finalizelogin`) and an existing store web session
  (`steamLoginSecure` cookie). No spike has tested either yet. Whether store
  `dynamicstore/userdata` lists demos is also open.
- Untested: whether time-limited licenses (free weekends) carry a flag or expiry needing a filter.
- Untested: family-shared licenses (none on the test account).
- The 052 probe ran with GameLib fully quit (the only session on the token).

## Origin

- **052 demo-licenses-vs-owned-apps — VALIDATED.** Demos absent from every `GetOwnedGames`
  variant; licenses → PICS surfaces them plus 10 unplayed F2P games.
- **053 web-api-library-no-cm — INVALIDATED.** Mint refused without a CM session (15 on CM
  websocket, 63 over HTTPS). Mac Steam untouched.
- **053b renewal-mint — INVALIDATED.** Renewal allowed still refused (15 both transports); no new
  refresh token; Keychain verified unchanged.
- **073 rust-owned-apps-parity — VALIDATED** (separate wrap-up; cited here as confirmation).
- Sources: `sources/052-demo-licenses-vs-owned-apps/`, `sources/053-web-api-library-no-cm/`,
  `sources/053b-renewal-mint/` (README + `probe.mjs` each).
