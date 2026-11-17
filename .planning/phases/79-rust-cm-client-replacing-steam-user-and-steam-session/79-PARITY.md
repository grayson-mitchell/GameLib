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

Status: APPROVED (Refresh) — operator decision 2026-11-15: the first sweep (401 entries, zero unexplained diffs incl. platform + metacritic) stands as the Refresh parity evidence, together with the continuation-2 Rust empty-buffer fix (074a283dc) and the live 50-cap run (run 13). Later re-sweeps cannot pass because the TS reference now captures nothing on this account (steam-user replies sha/size only, null buffer); that is a reference-side failure, not a Rust divergence (see Continuation 2)

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

Not approved after continuation 1. Continuation 2 follows.

### Continuation 2 (2026-11-15): findings

**A. Rust demos=0 was a Rust defect (fixed).** The sweep now reports the demos-stage failure class (`demosFailure` in the `steamcm_refresh` result; the class only, never a message body). Run 4 reported `Protocol("pics-parse")`: Steam now answers some apps (the licensed-not-owned candidates, and apps without a usable token) with an EMPTY buffer, and `parse_app` treated an empty buffer as a malformed reply, so one such app failed the whole PICS batch and the fail-soft demos stage returned no demos. Fix (commit 074a283dc): an app with an empty buffer is an entry with `appinfo: null` and `missingToken` as sent, not a failed batch (test `app_with_empty_buffer_is_an_entry_without_appinfo_not_a_failed_batch`; `cargo test -p gamelib-steamcm` 271 passed, clippy and fmt clean). After the fix the Rust demos stage reports `ok` on every run. It was not a timeout, not the 77c1cad60 package change and not the persona cache.
After the fix BOTH sides report demos=0 (390 entries each, 11 fewer than the first sweep). The 11 demo apps now come back with no buffer, so neither side can read their type. This is an account or Steam-side data change since the first sweep, not a divergence: ids, names, playtime, last played and demo membership are equal on all 390 apps in every later run.

**C. steam-user `apps.js:298` crash.** Cause: steam-user itself prefetches the apps of every package it receives with a tokenless `getProductInfo(appids, [], false, ...)` (apps.js 270-273, rejection swallowed); apps Steam answers with a null buffer then make its message handler throw OUT of the socket callback, an uncaught exception that kills the process. It is a steam-user defect on specific CM replies, reproduced 4 of 4 runs today (it did not occur in the first sweep). A try/catch cannot see it. The sweep now (a) gives each null-buffer app record an empty `appinfo` block before steam-user handles it (a wrap of the static `_decodeProto`, node_modules untouched; 1333 to 1661 records per TS Refresh) and (b) keeps a scoped `uncaughtException` guard (0 absorbed once the shim is in). The TS production path (cm=ts) carries the same crash risk; cm=rust does not (item A fix).

**B. The platform-capture app and, now, all of them.** Run 1 of continuation 1 (1 app) cannot be re-isolated: on every run since, the TS reference's capture stages capture NOTHING on this account (`Steam bulk platform capture: scoped=390 captured=0 skipped=390`, same for metacritic), so every app differs on `is_windows_native`, `steamPlatformsCaptured` and `metacritic_score` with TS empty, and Rust holding data (231 metacritic scores). Measured cause on the TS side: its single 390-app `getProductInfo` is answered with a record per app that carries only `sha` and `size` (about 22 KB for the sampled app) and a NULL `buffer`, for 390 of 390 apps, for both the anonymous and the held client; the same with app access tokens fetched first and with `meta_data_only: false` added. steam-user cannot read such a reply. The Rust ops get buffers for the same apps. I did not find why the CM answers the two clients differently; an unverified lead is the request shape (Rust sends `meta_data_only` explicitly; the wrap I tried for that did not change the TS reply, so it is not established). This is a reference-side failure, not a Rust divergence, but it means TS capture parity (platform flags, metacritic) can NOT be re-verified today. The first sweep (before this change in Steam's replies) had zero unexplained on 401 entries including these fields, and 79-27 and 79-28 verified the capture logic against recorded and live data.

**D. Live cap.** Run 13 (store not throttled): Rust in-Refresh enrich attempted=50 enriched=48 delisted=2 failed=0 rateLimited=false notReached=340. The 50 cap holds live, with no 403 and no burst.

Run list for continuation 2 (all exit 1 or 3, none clean): run 4 crashed on the steam-user throw; run 5 exit 1, Rust demos `pics-parse`, TS capture empty; runs 6 and 7 harness iterations (empty-string buffer also throws in kvparser; fixed by an empty `appinfo` block); runs 8 and 10 exit 3 and 1 on the store precondition or the TS capture diff; runs 9, 11, 12, 13 exit 1, all with the same single class of unexplained diff (TS capture empty, 3 field families: `metacritic_score`, platform flags, `steamPlatformsCaptured`). Every other field equal or explained on every run: ids, name, art, playtime, last played, demo.

Not approved. Open: TS capture parity (blocked by the reference), decided below as an operator call.

## Mac Steam path (79-36)

Status: APPROVED (Mac path) (operator, 2026-11-15; DV-79-12 rejected and fixed, re-measured below).

**Shipping state (2026-11-15, UAT-B item 14):** the Mac path is OFF by default (`GAMELIB_STEAM_MAC_PATH=on` opts in, commit 3b7417c05) because its helper makes Friends show "playing Spacewar" (AppID 480) on each Refresh; todo `2026-11-15-mac-steam-path-shows-playing-spacewar.md`. The parity approval above stands for when it is re-enabled; until then macOS Refresh uses the CM path (Refresh section).

The Mac path (D-14) is meant to differ from the CM path, so it is compared against spike 084's set, not against the TS reference. Measured 2026-11-15 on this account with Mac Steam running and signed in to the stored account. The helper ran from `public/bin/arm64/darwin/steam-bridge-helper` (the one `appPaths.steamBridgeHelperPath` resolves to); the older copy under `build/bin/` predates `--steam-owned-apps` and exits 6. Real-profile arm: the `steamcm_mac_owned_apps` op was run through `gamelib-steamcm-cli` single-shot with the operator's real HOME (the helper must reach Steam's pipe), the stored SteamID read from the steam store config; the harness in `meta/` always uses a fake HOME and cannot do this, so the run used a scratchpad script that is not committed. Anonymous CM logon only, no signed-in logon. Counts only.

| Measure | Count |
|---|---|
| Steam reports (subscribed apps) | 1140 (084: 1140) |
| Mac-path games (PICS type game) | 393 (084 type-game set: 393) |
| Mac-path games vs 084 set: common / Mac-only / 084-only | 393 / 0 / 0 |
| 084 owned set (`GetOwnedGames`, 390): covered as Mac games | 385 |
| of the 390: covered as Mac demos | 2 |
| of the 390: not covered (owned type beta x2, application x1) | 3 |
| Mac-only games, not in the 390 (all free-to-play, the 084 list) | 8 |
| Mac-only games, not in the 390 (other) | 0 |
| CM-only licences (in 084's 1144 CM licence set, not in Steam's 1140): ICARUS, ESO, 2 demos | 4 |
| Demos on the Mac path (type demo in Steam's set) | 11 |
| Demos Steam hides, present on the CM path at 084 time (CM-only) | 2 |

Reading: Steam's set has not drifted from 084 at all (393 games, 1140 subscribed, identical). The Mac path covers 387 of the 390 owned entries. The 3 it drops are owned apps whose PICS type is beta or application (the Mac filter keeps only type game plus demos); the CM path (`GetOwnedGames`) lists them. That divergence (DV-79-12) is new and was not named in the plan.

The CM-path demo count was not re-measured: the CM path cannot be run without a signed-in logon, which this plan does not permit. At 084 time it showed 13 demos (Steam's 11 plus the 2 hidden ones); the 79-33 sweeps observed `demos=0` on both CM implementations after Steam stopped returning buffers for the 11 demo apps on the held session, while the anonymous Mac lookup does read their type.

### DV-79-10: free-to-play titles appear on the Mac path
- Mac path: lists the 8 free-to-play games the account holds free licences for (TF2, Dota 2, Warframe, Path of Exile, The Sims 4, Archolos, Enderal, Spacewar); the CM path (`GetOwnedGames`) does not.
- Why: Steam's own library shows them; type game minus free-to-play has no local signal. D-14 accepts F2P inclusion by decision.
- accepted: yes (operator, 2026-11-15)

### DV-79-11: Steam-hidden demos are removed
- Mac path: omits the 2 demos Steam does not treat as subscribed (the CM path shows them from the raw licence list). It also omits licences Steam no longer honours (ICARUS, ESO).
- Why: Steam's set is the better oracle (084).
- accepted: yes (operator, 2026-11-15)

### DV-79-12: owned apps of type beta or application were dropped (resolved)
- Found: 3 of the 390 owned apps (2 beta, 1 application) failed the `common.type == game` filter.
- Operator: rejected as designed, fixed by widening the filter to game, beta and application (tools, DLC, music and the rest still drop). Commit 42117891b, test `beta_and_application_types_survive_but_other_types_still_drop`.
- Re-measured 2026-11-15 (same method, anonymous only): subscribed 1140; Mac-path games 399 (was 393); owned 390 covered 390 of 390 (388 as games, 2 as demos), none uncovered. The 6 extra games are all type beta or application in Steam's subscribed set: the 3 owned ones plus 3 subscribed but not in `GetOwnedGames` (084's type counts: application 4, beta 2 in the set). Explained by the widening; nothing else changed (8 F2P as before, 11 demos).
- accepted: resolved (operator, 2026-11-15)

### DV-79-13: no playtime or last-played from Steam
- Mac path: each entry keeps the playtime and last-played already stored for that app (else 0). The helper gives ids only, so the values go stale between CM refreshes and a new app shows 0. The follow-up todo is created by 79-37.
- Closed by quick-261117-q52: the Mac path now also reads per-app Playtime (minutes) and LastPlayed (unix seconds) from Mac Steam's userdata/<accountId>/config/localconfig.vdf via gamelib-steamfiles, merged per field as max(carried, local). A missing, oversized or malformed file falls back to pure carry-forward; no logon is added (D-14 held). Remaining gap: an app never run on this Mac and never CM-refreshed still shows 0.
- accepted: resolved (quick-261117-q52, 2026-11-17; live check passed 2026-11-17)

## Delete gate (79-38)

pending

## Delete gate (79-38, CF-01)

Operator rule for test.yml (2026-11-15): the gate requires **no new failures compared with the pre-phase baseline**. The baseline is origin/main 4b69058f9, Test run 43548032844. Its 8 failing suites predate phase 79 and are tracked outside it: tauriShellSource, epicOfflineMode, steamLaunchRuntime, shimCoverage, shimGenerate, callbackRegistryHost, gamelibCatalogParity, lintTranslations.

- [x] CM ops APPROVED (section 1).
- [x] Refresh APPROVED (section 2).
- [x] Mac path APPROVED (section 3). It ships OFF by default (3b7417c05) until the Spacewar presence todo is fixed.
- [x] UAT A passed. The operator approved on 2026-11-15; see 79-26-SUMMARY.
- [x] UAT B passed, including the D-09 second arm (item 13: unwrapped, Friends stayed online). The operator approved on 2026-11-15. Item 14 is an accepted issue (Mac path off), item 16 was skipped, and the others pass. 79-UAT.md has the details.
- [x] rust-test.yml green on all three legs: https://github.com/grayson-mitchell/GameLib/actions/runs/43692870596 (a986c318a). macos-latest, ubuntu-latest and windows-latest all succeeded, including the clippy ratchet.
  - Earlier runs 43673042841 (2c79851b2), 43689255783 (52cba2585), 43690607747 (ade3afbb1) and 43691683462 (ba6f108c5) were red. The causes were the CLI op-count test, then Windows compiles of unix-only Mac-path test stubs, then the Windows clippy dead_code and unused_imports ratchet. They were fixed in 5c3db0924, ade3afbb1, ba6f108c5 and a986c318a.
- [x] test.yml has no new failures against the baseline: https://github.com/grayson-mitchell/GameLib/actions/runs/43691683424 (ba6f108c5) fails exactly the 8 baseline suites.
  - a986c318a differs from ba6f108c5 only by a Rust test-import change plus two operator quick tasks committed from another session (261115-szs, 261115-t7m). Its run 43692870579 adds `themeTokens` (the render-site census, 29 expected vs 34; it reproduces on a clean export of HEAD, from quick-261115-szs's game-page menu change) and `steamBridgeKnownFixes` (passes locally on a clean export of HEAD; CI flake). Neither is phase-79 code.
  - The 6 failures phase 79 introduced were fixed in 5c3db0924, 8345575b0, 445106b28, 5e068ed20 and 52cba2585 (the SteamUpdateInfo.scss restore).
- [x] Supply-chain audit (cargo-deny) green: https://github.com/grayson-mitchell/GameLib/actions/runs/43692870623 (a986c318a). The protobuf advisory RUSTSEC-2024-0437 is ignored with a justification (steam-vent pins `=3.5.1`), and tokio was bumped to 1.54.1 (bce156071).

Status: DELETE GATE MET

post-deletion: rust-test 43748179863 green x3, test.yml 43748179910 green (against the baseline)

- Commit 1d65dab25. It carries 79-41..79-44, including the Friends sign-out fix e70995a2c, plus the other sessions' commits.
- **rust-test** https://github.com/grayson-mitchell/GameLib/actions/runs/43748179863: windows-latest, macos-latest and ubuntu-latest all succeeded.
- **test.yml** https://github.com/grayson-mitchell/GameLib/actions/runs/43748179910 (attempt 2): no phase-79 failures. It fails the 8 baseline suites plus 4 from other sessions:
  - `themeTokens` (quick-261115-szs)
  - `flowRegistrationCensus` and `ipcDomainCensus` (quick-261115-tk8)
  - `steamLineCeiling` (`gameLaunch.ts` 1131 lines, from phase 76 commit eea599129; Lint fails the same check)
- `dxvkInstallRemove` failed on attempt 1 (afterEach rmSync "Directory not empty") and passed on the rerun, so it is a flake.
- Code check and Supply-chain audit (43748179923) green.
