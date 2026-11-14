# Phase 79 Parity Report

Status: APPROVED (CM ops)

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
| persona (own persona present)         | 1      | 1     | 0                               | 0           |

Re-sweep after the DV-79-09 fix (commits 01e01a3cc, 3fac51c13): 5 completed sweeps on the final code, persona equal in all 5, exit 0 each, every other row identical. A further 5 completed sweeps on the same logic (plus scratch diagnostics) were also equal 5 of 5. Before the fix the persona row was `persona-unsupported` in 2 of 4 sweeps. 3 further sweeps aborted before any comparison with `sweep error: Request timed out` (exit 3): that is steam-user's own `getPersonas` 10 s timeout (the CM also ignores steam-user's request intermittently), not a Rust divergence and not a parity result either way.

The first sweep (before the fix) exited 1 with licence-appids unexplained (steam-user 1,144 vs Rust 0); see Fixes.

## Divergences

Sources: golden overrides (79-21) and notes from 79-08/09/21, plus what this sweep measured. "Steam-correct side" is the side that matches what the CM sends or what Steam's own client does (63 D-07); where no side is wrong the row says so.

### DV-79-01: licences carry 6 of steam-user's 18 fields

- source: golden override `licenses_three` (class omitted-field)
- steam-user: each licence is the whole `CMsgClientLicenseList.License` (time_next_process, minute_limit, minutes_used, payment_method, purchase_country_code, territory_code, change_number, initial/renewal period and unit, master_package_id, plus the six below).
- Rust: `licenses_json` emits package_id, time_created, owner_id, access_token, license_type, flags.
- Steam-correct side: both carry correct values for the six shared fields (package ids equal on the live account: 485 of 485). The 12 omitted fields are simply not read.
- caller impact: none. GameLib reads `package_id` (and the access token inside the Rust op). A future caller needing the other 12 fields must extend `licenses_json`.
- accepted: yes (2026-11-15)

### DV-79-02: owned apps omit `img_icon_url`

- source: golden override `owned_apps_two` (omitted-field)
- steam-user: rewrites `img_icon_url` to a steamcdn URL.
- Rust: omits it (the raw owned-game row from the CM does not carry it).
- Steam-correct side: neither is wrong; the field is derived data in steam-user.
- caller impact: none. Refresh does not read it; artwork comes from the store metadata path.
- accepted: yes (2026-11-15)

### DV-79-03: content servers omit `sourceid`, `preferred_server`, `NumEntriesInClientList`

- source: golden override `content_servers_strings` (omitted-field)
- steam-user: passes all three through from the directory response.
- Rust: `CdnServerRaw` does not carry them.
- Steam-correct side: neither is wrong; the live sweep found equal server counts for the sampled app.
- caller impact: none. The depot pipeline does not read them.
- accepted: yes (2026-11-15)

### DV-79-04: Rust appinfo adds `depotOrder`

- source: golden overrides `anon_pics_480`, `_1007`, `_232250`, `_220` (extra-rust-field)
- steam-user: no such field (JS objects keep insertion order).
- Rust: adds `depotOrder`, the depot ids in source order, on each app entry, replacing what the TS `appinfoOrder` tap computed from steam-user's private `_send`.
- Steam-correct side: both. Every `appinfo` value is identical (live: 25 of 25 equal, 0 explained).
- caller impact: callers get depot order from `depotOrder` instead of the private tap; extra field is ignored elsewhere.
- accepted: yes (2026-11-15)

### DV-79-05: an empty `allowed_app_ids` list

- source: 79-21 SUMMARY (not exercised by a golden; the real directory omits the key when empty)
- steam-user: an empty (truthy) array is a restriction.
- Rust: empty means unrestricted.
- Steam-correct side: Rust. An empty allow-list that excludes every app is not a meaningful directory answer.
- caller impact: only if Steam ever sends an empty list: Rust would offer servers steam-user would filter out.
- accepted: yes (2026-11-15)

### DV-79-06: an empty redeem receipt

- source: 79-21 SUMMARY (steam-user's `BinaryKVParser.parse` throws on an empty buffer, measured)
- steam-user: `redeemKey` never resolves.
- Rust: resolves with an empty `packageList`.
- Steam-correct side: Rust (a hang is not a result).
- caller impact: a redeem that returns no receipt now completes (with no packages) instead of hanging until the caller's timeout.
- accepted: yes (2026-11-15)

### DV-79-07: package tokens are taken first, from the licence then from PICS

- source: 79-08 notes plus this sweep
- steam-user: requests packages, then re-requests the `missingToken` ones; for a package with `inclTokens`, a licence's non-zero access token is used.
- Rust: asks for access tokens before the request (CF-05, one round trip) and, since the fix in this plan, also prefers a licence's non-zero token for a package, like steam-user.
- Steam-correct side: equal results measured: 485 packages, 1,144 app ids on both sides, 0 `missingToken`.
- caller impact: none observable; fewer round trips.
- accepted: yes (2026-11-15)

### DV-79-08: `redeem_key` returns Ok plus the eresult

- source: 79-09/79-17 adapter
- steam-user: a non-OK purchase result rejects with an error carrying `eresult`, `purchaseResultDetails` and `packageList`.
- Rust: the op returns the result with `eresult`; the TS `RustCmClient.redeemKey` adapter rejects with the same error shape when `eresult != 1`.
- Steam-correct side: both (same observable behaviour through the adapter).
- caller impact: none through the adapter; a direct `steamcm_redeem_key` caller must check `eresult` itself. Not exercised live (read-only sweep).
- accepted: yes (2026-11-15)

### DV-79-09: own persona is intermittently absent after other session ops

- source: this sweep (class persona-unsupported, closed list in the plan)
- steam-user: `getPersonas([own id])` returned the own persona on every run. steam-user keeps the persona state Steam pushes at logon and serves from that cache.
- Rust: asks the CM each call and waits 5 s, returning an empty map on silence (79-09). Measured with scratch sessions: present when it is the first op after logon (3 of 3) and after a licence read (1 of 1); absent after a PICS product-info op (1 of 1) and when asked a second time in the same session (1 of 1). The cause is Steam-side behaviour (Steam seems to answer an own-id friend-data request once, early in a session); not root-caused beyond that.
- Steam-correct side: not decided. Steam's answer to the live request is the truth, steam-user hides the silence behind its cache.
- caller impact: persona names are fetched at sign-in as the first op after logon, where Rust returned the persona every time it was measured. A later caller of the persona op could get an empty map. Option if rejected: have the Rust session cache the persona state it receives at logon.
- rejected — operator: "Reject DV-09 only" (2026-11-15)
- resolved: Rust now caches the logon persona state (commit 01e01a3cc) and resends the friend-data request inside its unchanged 5 s window (commit 3fac51c13); re-sweep persona presence equal in every completed run (5 of 5 on the final code, 10 of 10 across the fix; see CM ops sweep). Further finding: Steam does not push own persona state at logon on a steam-vent session (the cache only fills from replies), and the CM answers a single friend-data request intermittently, so the resend is what removed the empty result.

## Fixes made during the sweep

1. Package PICS parse (Rust bug, commit 77c1cad60). The first sweep returned `packageinfo: null` for all 485 packages (0 of 1,144 licence app ids). `packageinfo_to_json` read the package id from the 4-byte buffer header, but real Steam sends `01 00 00 00` there; the id is the root key, and steam-user looks the root key up by the requested id. Rust now takes the id from the answer. The hand-written fixture (79-08) had assumed the header was the id; it now carries the real header. After the fix: 485 of 485 packages parse and app ids match 1,144 to 1,144.
2. Licence-token fallback for packages (same commit, steam-user `apps.js` 215-223): with `inclTokens`, a package uses its licence's non-zero access token ahead of the PICS-supplied one. A unit test pins it. It did not change the live result by itself (the header bug was the cause); kept for parity.
3. Persona cache and resend (Rust, commits 01e01a3cc and 3fac51c13; DV-79-09 rejected by the operator). `PersonaCache` (per connection, so scoped to one logon and dropped on logout, rebuild or replace) absorbs every `CMsgClientPersonaState` the connection receives, subscribed before logon, name-bearing entries only; the `personas` op answers from it on a full hit, else asks the CM (steam-user's 0x7fff flag set), resending every 1.25 s inside the 5 s bound, empty map on silence. Result shape unchanged. Unit tests pin cache hit/miss/scope; the resend and live subscription live in `vent.rs` and are covered by the live sweep only (the fake has no push channel).
4. Re-ran `cargo test -p gamelib-steamcm` (267 passed after the persona cache), `cargo clippy -p gamelib-steamcm --tests`, `cargo fmt --check`, and `pnpm exec jest src/backend/storeManagers/steam/cm meta/__tests__/gamelibSteamcmCli.test.ts meta/__tests__/steamcmParitySweep.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts` (all passed).

## Refresh sweep (79-33)

Status: PENDING RE-SWEEP (Refresh) — operator decisions recorded 2026-11-15; the post-fix re-sweep did not complete cleanly (see Re-run after the decision)

Plan 79-33 (D-12, D-16). Sweep: `pnpm steamcm-refresh-parity-sweep` (`meta/steamcmRefreshParitySweep.ts`), run on the operator's Mac with the dev-vault refresh token. Read-only ops only (no redeem, no credential sign-in). Output is redacted (counts and classes only); no name, URL, id, SteamID or absolute path appears here.

Method: the real `refresh()` runs in process twice with only `GAMELIB_STEAMCM_CM` toggled (`ts`, then `rust`), each from empty stores rooted in a temp dir, with the real `SteamUser` (steam-user for `ts`; the Rust CLI over one kept-open ndjson session for `rust`) and the dev-vault token. The library is snapshotted right after each `refresh()` returns (post-refresh: on `rust` the library `steamcm_refresh` returned, persisted unchanged by the thin TS caller). Each side then runs the lazy per-game enrichment (`fetchMetadataIfNeeded`, concurrency 4) and the in-memory library is snapshotted again (at rest). Diffs are by app id.

Exit code: 0 (final run, after the fix below).

### Corpus

| Category                                              | ts  | rust |
| ----------------------------------------------------- | --- | ---- |
| Owned apps (`includePlayedFreeGames`)                 | 390 | 390  |
| Licensed demos                                        | 11  | 11   |
| Library entries after Refresh (owned + demos)         | 401 | 401  |
| Entries with art after Refresh                        | 0   | 161  |
| Entries with art at rest (after lazy enrichment)      | 58  | 169  |
| Entries with a metacritic score after Refresh         | 231 | 231  |

Rust in-Refresh enrichment summary (final run): attempted=169 enriched=161 delisted=7 failed=0 rateLimited=true budgetHit=false notReached=233 (the stage stopped at the first HTTP 429, the 233 are served by the lazy path). Earlier runs: 143 enriched / 7 delisted / rateLimited, and 149 / 7 / rateLimited.

### Per-field results (final run)

| Field                     | Stage        | Inputs | Equal | Explained                    | Unexplained |
| ------------------------- | ------------ | ------ | ----- | ---------------------------- | ----------- |
| app ids (set)             | post-refresh | 1      | 1     | 0                            | 0           |
| title                     | post-refresh | 401    | 368   | enriched-in-refresh=33       | 0           |
| art (all `art_*`)         | post-refresh | 401    | 240   | enriched-in-refresh=161      | 0           |
| metacritic                | post-refresh | 401    | 401   | 0                            | 0           |
| playtime                  | post-refresh | 401    | 401   | 0                            | 0           |
| last played               | post-refresh | 401    | 401   | 0                            | 0           |
| demo membership           | post-refresh | 401    | 401   | 0                            | 0           |
| every other field         | post-refresh | 401    | 233   | enriched-in-refresh=168      | 0           |
| app ids (set)             | at rest      | 1      | 1     | 0                            | 0           |
| title                     | at rest      | 401    | 367   | enrichment-coverage=34       | 0           |
| art (all `art_*`)         | at rest      | 401    | 228   | enrichment-coverage=173      | 0           |
| metacritic                | at rest      | 401    | 399   | enrichment-coverage=2        | 0           |
| playtime                  | at rest      | 401    | 401   | 0                            | 0           |
| last played               | at rest      | 401    | 401   | 0                            | 0           |
| demo membership           | at rest      | 401    | 401   | 0                            | 0           |
| every other field         | at rest      | 401    | 221   | enrichment-coverage=180      | 0           |

"every other field" is every key the rows above do not name (platform flags, `mac_arch`, `is_delisted`, `steamPlatformsCaptured`, `store_url`, `extra` minus playtime and last played, and so on). `enrichment-coverage` means only one side holds store enrichment for that app at rest (the Rust Refresh enriched it; the TS side enriched only the 60-app lazy sample, or the store throttled one side), so its store-derived fields are not comparable. Apps enriched on both sides at rest: 27 in the final run, 57 in the best earlier run; every compared field on them was equal.

### Fixes made during the sweep

1. Rust `appdetails` language (commit 371199f09). With one app, Rust returned German genres and description in 12 of 18 direct calls (three batches) and in one sweep run, where the TS client (and curl) always returned English. `Accept-Language` did not change it; `l=english` made 8 of 8 English. Rust now sends `l=english`; the mock servers in the crate's tests parse the id up to `&`. `cargo test -p gamelib-steamcm --lib` 267 passed, clippy `--all-targets -D warnings` clean, fmt clean. See DV-79-12.

### Sweep limits (not divergences)

- The in-process stack ran under a fresh fake HOME, so there is no Steam install: the install maps were empty on both sides and install state is not compared (that code is the same TS on both paths).
- The anonymous CM client was not wired, so the TS side took the held-session fallback for the platform and metacritic captures. Rust reports its own anon/held split. Both sides ended with the same platform and metacritic values on every app compared.
- The Steam store (Akamai) answers 403 after a burst of `appdetails` calls and recovers within minutes. The lazy enrichment was therefore a deterministic 60-app sample per side (the same ids on both), not every owned app as the plan wrote, and the sweep waits out a throttle before each store-heavy phase and exits 3 when fewer than 20 apps are enriched on both sides. Four earlier runs were discarded for a throttled side (exit 1 or 3).

### Divergences

#### DV-79-10: Rust Refresh enriches from the store inside Refresh; TS Refresh only seeds from the cache

- source: 79-29/79-30 design (the Rust stage), measured here
- ts: Refresh builds each entry from cached metadata only; art, store text, platform flags and the title come later from the lazy per-game path.
- rust: Refresh also fetches `appdetails`, 5 at a time within a 20 s budget, stopping at the first HTTP 429. Measured: 143 to 161 of 401 enriched per Refresh, 7 delisted found, 233 to 251 left for the lazy path. Enriched entries carry art, the store title (33 entries differ from the owned-apps name at that point), platform flags, `mac_arch` and the delisted verdict.
- Steam-correct side: neither is wrong; the store data is the same data the lazy path fetches. Where both sides held enrichment at rest the values were equal (27 apps in the final run, 57 in the best earlier run, zero unexplained).
- caller impact: art and store text appear for roughly 40 percent of the library right after a Refresh instead of one by one as games are opened. The title of an enriched entry changes at Refresh time. A Refresh now sends up to a few hundred store requests in one burst, which tripped the store's 403 throttle during this sweep.
- accepted: yes, with change (2026-11-15) — operator: "Fix DV-11 and cap DV-10"; cap 50 store requests per Refresh (`ENRICH_REFRESH_MAX_REQUESTS`, commit 2f836a4a1); the remainder is `not_reached` for the lazy path. Concurrency 5 and the 20 s budget unchanged. The lazy single-app op is not capped.

#### DV-79-11: the Rust enrichment stage stops on HTTP 429 but not on HTTP 403

- source: `refresh/enrich.rs`, measured here
- ts: no in-Refresh enrichment; the lazy path logs a failure per app and moves on.
- rust: the stage stops at the first 429. The store's throttle answers 403 (Akamai), which the stage counts as a plain failure and keeps going: one run attempted 358 apps, `failed=351`, `budgetHit`, with zero enriched.
- Steam-correct side: stopping is. A 403 burst only extends the block and wastes the budget.
- caller impact: while the store is throttling, a Refresh spends its 20 s on requests that all fail, and the entries stay unenriched until the lazy path (also throttled) succeeds. Not data loss. If rejected, the fix is to treat 403 like 429 in `enrich.rs` and re-run.
- accepted: rejected — operator: "Fix DV-11 and cap DV-10" (2026-11-15)
- resolved: 403 stops the stage like 429 (rateLimited=true, the 403 app and everything unstarted or in flight go to `not_reached`, no further requests) (commit 2f836a4a1; unit test `stage_stops_at_the_first_403`). Live re-sweep: see Re-run after the decision.

#### DV-79-12: Rust asks the store for English explicitly; TS sends no language

- source: commit 371199f09, measured here
- ts: `appdetails?appids=N`, no language. On this host the store answered English every time.
- rust: `appdetails?appids=N&l=english`. Without it the Rust request got German text in 12 of 18 direct calls, so the Refresh and the lazy path could store non-English genres and descriptions for the same game.
- Steam-correct side: rust (explicit). The TS request depends on the store's own language guess for the connection.
- caller impact: Rust-written store text is always English. A TS-written entry may be localised by the store's guess until the TS path is deleted (79-41). No user language setting is read on either path today.
- accepted: yes (2026-11-15)


### Re-run after the decision

Unit tests (`cargo test -p gamelib-steamcm --lib` 270 passed, clippy `--all-targets -D warnings` and fmt clean): 403 stops the stage, the cap limits attempted to 50 with 30 of 80 `not_reached`, the lazy single-app fetch makes 60 consecutive requests unaffected.

Live re-sweep, three runs, none clean:

1. Exit 1. The store was still throttled for Rust (waited 482 s before Refresh, 101 s before lazy): in-Refresh enrich attempted=5 enriched=0 rateLimited=true notReached=390, so the 403 stop and the cap held (5 attempted, no burst) but the cap itself (attempted <= 50 with enrichment) was not exercised live. Equal on all compared apps: name, art, metacritic, playtime, last played, demo membership. Unexplained: 1 app at post-refresh (`is_windows_native` empty on Rust, `steamPlatformsCaptured` differs) and the same app's `extra` at rest. Rust reported owned=390 demos=0 against ts owned=390 demos=11, so the library was 390 vs 401 and the 11 demos were absent on this Rust run; not investigated.
2. and 3. Exit 1 before any comparison: the TS side's `steam-user` threw `Cannot read properties of null (reading 'toString')` in `components/apps.js:298` (an app info record with a null buffer) during its own Refresh, twice in a row. Per the plan the sweep was not looped further.

Not approved. Open: the 1 unexplained platform-capture app, the missing Rust demos on run 1, and a clean re-run once the `steam-user` null-buffer crash is addressed or avoided.

## Mac Steam path (79-36)

pending

## Delete gate (79-38)

pending
