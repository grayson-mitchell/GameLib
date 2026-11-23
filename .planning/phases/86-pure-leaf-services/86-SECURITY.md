---
phase: "86"
slug: "pure-leaf-services"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
block_on: high
created: "2026-11-23"
---

# Phase 86 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

The register below is built from the `<threat_model>` blocks of plans 86-01 to 86-27 (98 rows,
72 distinct IDs; `T-86-SC` recurs once per plan). Every `mitigate` row was verified against the
source on `main` at `a2b7c7452` (after the round-3 review fixes WR-65 and WR-66) by the
gsd-security-auditor; evidence is under [Verification Evidence](#verification-evidence).

---

## Trust Boundaries

| Boundary | Description | Plans |
|----------|-------------|-------|
| planning record -> later executors | every 86 plan trusts this table for host symbol names | 01 |
| gate -> operator profile and Keychain | the run exercises real keys and real store files | 02, 26 |
| session captures | logs and profile copies hold account data | 02, 26 |
| remote service -> ReqwestHttp | untrusted response bodies and redirects | 03 |
| crate -> logs and errors | URLs carry the ITAD key in the query | 03 |
| shell exit -> in-flight ops | HTTP in flight when GameLib quits | 03 |
| live services -> committed fixtures | recorded requests carry keys and tokens | 04, 06 |
| test harness -> filesystem | temp profiles under tmpdir | 04 |
| gate -> later plans | every later slice trusts these scans to catch surviving TS | 05 |
| operator terminal -> live services | real API keys in use for one record run | 07 |
| recordings -> repo | headers and query strings committed | 07 |
| renderer -> native router | `removeRecent` argument is untrusted | 08, 10, 12, 15, 16, 22 |
| sidecar -> rustInvoke | TS sends the game for `info_recent_add` | 08 |
| concurrent callers -> store | launch and tray removal may overlap | 08 |
| TS shim -> Rust | the shim is the only TS path to recent games | 09 |
| Rust -> filesystem | the override image cleanup deletes files | 10 |
| store table -> Rust host | the table decides whether and how the host opens a file | 11, 17, 24 |
| GitHub raw -> app folder | a downloaded JSON file written to disk and parsed later | 12 |
| releasesInfoReady payload -> status op | the hash comes from the releases JSON | 13 |
| shell -> OS keyring | the two API key slots | 14 |
| dev vault file -> process | plaintext keys in a temp file, dev only | 14 |
| build env -> binary | the baked ITAD key | 14 |
| Rust -> SteamGridDB | the key travels in the Authorization header | 15 |
| Rust -> ITAD | the key rides in the query string | 16 |
| ITAD -> renderer | buyUrl values become links | 16 |
| release workflow -> binaries | which build step carries the ITAD secret | 17 |
| TS resolver -> Rust | the GOG bearer token crosses rustInvoke | 18, 19 |
| GOG catalog -> renderer | product data shown as deals | 18 |
| GitHub release asset -> Rust | a remote index drives a user-facing compatibility claim | 19 |
| bundled asset -> Rust | the cold-start snapshot from the app's public dir | 19 |
| wiki sites -> parsers | untrusted wikitext and JSON | 20 |
| TS -> info_umu_get | appName and runner from the store managers | 20 |
| GOG, gamesdb and HLTB sites -> parsers | untrusted HTML and JSON | 21 |
| HLTB handshake token -> memory | a short-lived credential | 21 |
| eight remote sources -> one cache entry | merged untrusted data written to the user's cache | 22 |
| TS shims -> Rust | the only TS paths to wiki and umu | 23 |
| local repo -> origin | the push publishes the phase | 25 |
| release workflow -> signed artifact | signing identity and secrets | 25 |
| TS caller -> Rust (rustInvoke) | the shims' round trip can now reject (store refusal, :not-ready, transport timeout); the callers decide whether a rejection aborts a user flow | 27 |
| TS logs -> gamelib.log | the new warning lines carry the Rust rejection text | 27 |

---

## Threat Register

| Threat ID | Plan | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|------|----------|-----------|----------|-------------|------------|--------|
| T-86-01 | 86-01 | Tampering | the D-29 table | medium | mitigate | every row carries a shipped file:line or MISSING, the verify gate refuses blanks and TBD, and the operator approves it before any slice plan | closed |
| T-86-SC | 86-01 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-86-02 | 86-02 | Information Disclosure | session captures | medium | mitigate | captures stay under /tmp, are never committed, results carry `~` paths and counts only (contract text) | closed |
| T-86-03 | 86-02 | Tampering | operator profile | high | mitigate | P3 `ditto` copy before anything is touched; every item restores from it; closing inventory | closed |
| T-86-SC | 86-02 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-86-04 | 86-03 | Information Disclosure | ReqwestHttp error mapping | high | mitigate | every reqwest::Error goes through `.without_url()` before it becomes an HttpError; a test asserts a `key=SECRET` URL never appears in error text | closed |
| T-86-05 | 86-03 | Denial of Service | response bodies | medium | mitigate | 16 MiB default cap with per-call smaller caps; a test proves TooLarge without reading the rest | closed |
| T-86-06 | 86-03 | Tampering | redirects | low | accept | `Policy::limited(5)` matches axios's default, so a redirect chain behaves as before (parity); HTTPS-only checks stay where TS had them (the crossover index `assertHttps`, 86-19) | closed |
| T-86-07 | 86-03 | Denial of Service | exit path | medium | mitigate | each op holds a Registrant and races the Shutdown token, so quit cancels in-flight HTTP inside the 3.5 s drain budget | closed |
| T-86-SC | 86-03 | Tampering | crate dependencies | low | accept | no new package: reqwest, rustls, url, jiff, tokio, serde are already locked; Cargo.lock gains only the two in-repo crates | closed |
| T-86-08 | 86-04 | Information Disclosure | recorded fixtures | high | mitigate | the recorder redacts `key`, `Authorization` and `x-auth-token` before writing; fixtureRedaction.test.ts fails on any surviving value and has self-tests | closed |
| T-86-09 | 86-04 | Information Disclosure | state fixtures | medium | mitigate | state is synthetic or from the 85 redacted corpus, never the live operator profile | closed |
| T-86-SC | 86-04 | Tampering | package installs | low | accept | no package is installed; axios and jest are already dependencies | closed |
| T-86-10 | 86-05 | Repudiation | infoPortComplete and infoShimSchedule | medium | mitigate | comment-stripped scans, measured walk floors, and a self-test per scan that plants a violation and observes the failure (82 D-05) | closed |
| T-86-SC | 86-05 | Tampering | package installs | low | accept | no package is installed; `typescript` is already a devDependency | closed |
| T-86-11 | 86-06 | Information Disclosure | HowLongToBeat token and GOG headers in recordings | medium | mitigate | recorder redaction (86-04) plus fixtureRedaction.test.ts in every task's verify | closed |
| T-86-12 | 86-06 | Information Disclosure | GOG bearer token | medium | mitigate | the oracle never spawns gogdl or reads a real token; token cases are synthetic with `REDACTED` | closed |
| T-86-SC | 86-06 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-86-13 | 86-07 | Information Disclosure | ITAD key in query, SteamGridDB key in Authorization | high | mitigate | recorder redaction before write; fixtureRedaction.test.ts and the Task 3 grep after the run; keys stay in the operator's own terminal and are unset afterwards | closed |
| T-86-14 | 86-07 | Repudiation | live cases silently skipped | medium | mitigate | an unrecorded live case fails with "live case not recorded" and a self-test proves it | closed |
| T-86-SC | 86-07 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-86-15 | 86-08 | Tampering | removeRecent args | medium | mitigate | deny_unknown_fields decode, 1024 max length, fixed-literal rejections that never echo the input, manifest valid/invalid vectors | closed |
| T-86-16 | 86-08 | Denial of Service | games.recent read-modify-write | medium | mitigate | one crate Mutex around every RMW; the two-thread test proves no lost update | closed |
| T-86-17 | 86-08 | Tampering | info_recent_add args | low | mitigate | generated strict Args struct validated before dispatch, then the crate's deny_unknown_fields struct | closed |
| T-86-SC | 86-08 | Tampering | crate dependencies | low | accept | no new package | closed |
| T-86-18 | 86-09 | Elevation of Privilege | src/backend/info/recentGames.ts | low | mitigate | the D-06 shape check fails if a shim body grows beyond one typed call, and the schedule pins its deleting phase | closed |
| T-86-SC | 86-09 | Tampering | package installs | low | accept | no package installed | closed |
| T-86-19 | 86-10 | Tampering | override image cleanup | high | mitigate | names only from read_dir of the fixed `game_overrides_images` dir, `<appName>-` prefix match, `remove_file` never follows symlinks, golden cases with a sibling, an unrelated file and a symlink prove nothing else is removed (A4: GameLib-owned dir, outside gamelib-safety's install-tree rule) | closed |
| T-86-20 | 86-10 | Tampering | native args | medium | mitigate | deny_unknown_fields decode, max lengths, manifest invalid vectors, fixed-literal rejections | closed |
| T-86-SC | 86-10 | Tampering | crate dependencies | low | accept | no new package | closed |
| T-86-21 | 86-11 | Tampering | storeTable.json row for game-overrides | high | mitigate | the row moves to EXTRA_ROWS unchanged; `git diff --quiet` on storeTable.json and the generator --check prove identical bytes, so kind (user-state), read-only and corrupt handling are unchanged | closed |
| T-86-22 | 86-11 | Elevation of Privilege | override shims | low | mitigate | D-06 shape check and schedule rows | closed |
| T-86-SC | 86-11 | Tampering | package installs | low | accept | no package installed | closed |
| T-86-23 | 86-12 | Tampering | areweanticheatyet.json download | medium | mitigate | fixed HTTPS URLs from the TS source, body cap from ReqwestHttp, temp-then-rename write so a partial download never replaces the file; the parse on read failing returns null (as TS) | closed |
| T-86-24 | 86-12 | Denial of Service | download at boot | medium | mitigate | the op holds a Shutdown registrant and races the token; the request has a timeout; TS triggers it only after its online wait | closed |
| T-86-25 | 86-12 | Tampering | getAnticheatInfo args | low | mitigate | string with max length 1024, deny_unknown_fields decode, manifest invalid vectors | closed |
| T-86-SC | 86-12 | Tampering | md-5 (new crate) | low | mitigate | research Package Legitimacy Audit verdict OK (RustCrypto/hashes, 12.3M weekly downloads); EXPECTED_LOCKFILE_CRATE_NAMES pins the lockfile name set; used only as a change check, never as a security control | closed |
| T-86-26 | 86-13 | Denial of Service | releasesInfoReady listener | low | mitigate | one listener (bootstrapWirings pins it), the rejection guard kept, the download behind the online wait and a Rust registrant | closed |
| T-86-SC | 86-13 | Tampering | package installs | low | accept | no package installed | closed |
| T-86-27 | 86-14 | Information Disclosure | key values in logs and errors | high | mitigate | log lines carry slot names and outcomes only; `itad key source` logs the source word; reqwest errors already go through `.without_url()` (86-03) | closed |
| T-86-28 | 86-14 | Information Disclosure | dev vault in a packaged build | high | mitigate | exact `GAMELIB_DEV_SECRET_VAULT=1` and `tauri::is_dev()` both required, unit-tested; 0600 file | closed |
| T-86-29 | 86-14 | Elevation of Privilege | keyring slot names | medium | mitigate | slot_account calls keyring_dispatch's allowlist, no new account names; the renderer never names a slot | closed |
| T-86-30 | 86-14 | Information Disclosure | baked key in the shell binary | low | accept | same exposure as the sidecar bundle's baked key today (Phase 47 D-04); the key is a public-tier ITAD client key | closed |
| T-86-SC | 86-14 | Tampering | package installs | low | accept | no new package | closed |
| T-86-31 | 86-15 | Information Disclosure | Authorization header | high | mitigate | never logged; errors mapped without the request headers; fixtures carry `Bearer REDACTED` (fixtureRedaction.test.ts) | closed |
| T-86-32 | 86-15 | Tampering | native steamgriddb.* args | medium | mitigate | zod bounds carried into deny_unknown_fields decodes, manifest invalid vectors, fixed-literal rejections | closed |
| T-86-33 | 86-15 | Elevation of Privilege | setApiKey from the renderer | medium | mitigate | writes only the fixed steamgrid-api-key slot through SgdbKey; trim and empty-clears as before; non-strings rejected at decode | closed |
| T-86-34 | 86-15 | Denial of Service | boot migration | low | mitigate | registrant plus 10 s timeout plus the Shutdown token; one attempt per boot | closed |
| T-86-SC | 86-15 | Tampering | package installs | low | accept | no new package | closed |
| T-86-35 | 86-16 | Information Disclosure | ITAD key in URLs | high | mitigate | `.without_url()` on every reqwest error, failures logged as `{endpoint, status}`, the fixed `[storeSearch:<code>]` marker, a test that no error contains the key, fixtures redacted | closed |
| T-86-36 | 86-16 | Denial of Service | ITAD rate limits | medium | mitigate | the in-memory gate honours Retry-After (clamped), single-flight collapses duplicate requests, stale entries are served instead of retrying | closed |
| T-86-37 | 86-16 | Tampering | buyUrl | medium | mitigate | only `https:` buyUrls pass (isHttpsUrl ported), passed through byte for byte as TS did | closed |
| T-86-38 | 86-16 | Tampering | native ITAD args | medium | mitigate | zod bounds carried into deny_unknown_fields decodes; manifest invalid vectors | closed |
| T-86-SC | 86-16 | Tampering | package installs | low | accept | no new package (sha2 already locked) | closed |
| T-86-39 | 86-17 | Information Disclosure | ITAD secret in the sidecar bundle | low | mitigate | the define is removed with its last consumer, shrinking where the key is embedded to the shell only | closed |
| T-86-40 | 86-17 | Tampering | storeTable rows for the ITAD caches | high | mitigate | EXTRA_ROWS copied unchanged; generator --check and `git diff --quiet` prove identical bytes | closed |
| T-86-41 | 86-17 | Repudiation | release without the key | medium | mitigate | the require step stays; releaseItadKey.test.ts pins the Tauri step env | closed |
| T-86-SC | 86-17 | Tampering | package installs | low | accept | no new package | closed |
| T-86-42 | 86-18 | Information Disclosure | GOG bearer token | high | mitigate | passed in memory only, never logged (fixed log lines), never written; fixtures use `Bearer REDACTED`; reqwest errors via `.without_url()` | closed |
| T-86-43 | 86-18 | Denial of Service | up to 30 concurrent page requests | low | accept | same fan-out and page cap as the TS (MAX_PAGES 30); each request has the 15 s timeout and the op holds a Shutdown registrant | closed |
| T-86-SC | 86-18 | Tampering | package installs | low | accept | no new package | closed |
| T-86-44 | 86-19 | Tampering | poisoned remote index | high | mitigate | schema bounds ported exactly (version, rating range, 1000-entry floor), keep-last-good, HTTPS-only; the five rejection goldens prove each bound | closed |
| T-86-45 | 86-19 | Denial of Service | oversized or gzip-bomb index | medium | mitigate | 5 MB compressed cap from ReqwestHttp; the decompressed size is also capped (a generous bound recorded in the summary) | closed |
| T-86-46 | 86-19 | Tampering | bundled snapshot path | low | mitigate | the path is the shell's own app root plus `public`, never from TS or the renderer | closed |
| T-86-47 | 86-19 | Denial of Service | games list size | low | mitigate | the rustInvoke schema caps the list at 20000 entries | closed |
| T-86-SC | 86-19 | Tampering | crate dependencies | low | accept | flate2 and unicode-normalization are already in Cargo.lock; cargoFeatures proves no new lockfile name | closed |
| T-86-48 | 86-20 | Denial of Service | regex on hostile wikitext | low | accept | the Rust regex engine is linear time (no backtracking blow-up), stronger than the JS engine it replaces | closed |
| T-86-49 | 86-20 | Denial of Service | response bodies | low | mitigate | ReqwestHttp's body cap applies to every source (TS had none; documented safe deviation) | closed |
| T-86-50 | 86-20 | Tampering | info_umu_get args | low | mitigate | strict generated schema plus the crate's deny_unknown_fields struct; runner restricted to the runner enum | closed |
| T-86-SC | 86-20 | Tampering | crate dependencies | low | accept | regex is already locked; no new lockfile name | closed |
| T-86-51 | 86-21 | Information Disclosure | HLTB handshake token | low | mitigate | memory only, never logged or persisted; redacted in fixtures (86-04 rule) | closed |
| T-86-52 | 86-21 | Spoofing | rustls TLS fingerprint vs Cloudflare | medium | mitigate | headers pinned to the recorded TS requests; the D-12 drift run in 86-22 is the live proof and a Rust-only 403 is phase-blocking (Pitfall 11) | closed |
| T-86-53 | 86-21 | Tampering | GOG state | low | mitigate | no GOG cache or store write from Rust (D-23), asserted by a test | closed |
| T-86-SC | 86-21 | Tampering | crate dependencies | low | accept | no new package or reqwest feature | closed |
| T-86-54 | 86-22 | Tampering | getWikiGameInfo args | medium | mitigate | runner enum, length bounds and boolean type in the deny_unknown_fields decode; manifest invalid vectors | closed |
| T-86-55 | 86-22 | Denial of Service | forceRefresh spam | low | accept | same behaviour as TS (the renderer only forces on a user action); each op holds a Shutdown registrant and every request has a timeout | closed |
| T-86-56 | 86-22 | Tampering | cache key from title | low | mitigate | remove_special_characters plus dot-prop 6's `__proto__`/`prototype`/`constructor` refusal in the StoreHost (85) | closed |
| T-86-SC | 86-22 | Tampering | package installs | low | accept | no new package | closed |
| T-86-57 | 86-23 | Elevation of Privilege | src/backend/info/wiki.ts | low | mitigate | D-06 shape check and schedule rows pin each shim and the resolver to one typed call | closed |
| T-86-SC | 86-23 | Tampering | package installs | low | accept | no package installed | closed |
| T-86-58 | 86-24 | Tampering | storeTable rows for wikigameinfo, umu, crossover_index | high | mitigate | EXTRA_ROWS copied unchanged; generator --check and `git diff --quiet` prove identical bytes | closed |
| T-86-59 | 86-24 | Repudiation | a slice silently surviving | medium | mitigate | the nine gate describes plus the schedule's set-equality; every scan has a floor and a self-test (86-05) | closed |
| T-86-SC | 86-24 | Tampering | package installs | low | accept | no package installed | closed |
| T-86-60 | 86-25 | Elevation of Privilege | unauthorised push or release dispatch | high | mitigate | blocking-human checkpoint; never --no-verify; the open-time `git diff --name-only P HEAD` check immediately before the push | closed |
| T-86-61 | 86-25 | Spoofing | signing identity mismatch | high | mitigate | five codesign/spctl/stapler checks compared with the signed Phase 85 build; a mismatch blocks gate item 4 rather than letting it run on a different identity | closed |
| T-86-62 | 86-25 | Information Disclosure | downloaded artifacts and drift output | low | mitigate | artifacts kept in the scratchpad and deleted after the checks; drift output carries shapes and statuses, never keys | closed |
| T-86-SC | 86-25 | Tampering | package installs | low | accept | `pnpm install --frozen-lockfile` only; no new package | closed |
| T-86-63 | 86-26 | Tampering | operator profile during the gate | high | mitigate | P3 copy before anything; every touched store or image restored from it; inventory at close | closed |
| T-86-64 | 86-26 | Information Disclosure | session captures | medium | mitigate | captures stay in /tmp, are never committed, results carry `~` paths and counts only; copies deleted after scoring or their location recorded | closed |
| T-86-SC | 86-26 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-86-65 | 86-27 | Denial of Service | src/backend/launcher.ts runLaunchEventCallback | medium | mitigate | try/catch around the recent-games write; the CR-41 tests prove 'done', the save upload and the return still happen on a rejection (Task 1) | closed |
| T-86-66 | 86-27 | Denial of Service | gog/legendary/nile launch() umu lookup | medium | mitigate | resolveLaunchUmuId returns null on any rejection, and its source gate pins all three launch() bodies to it (Task 2) | closed |
| T-86-67 | 86-27 | Denial of Service | gamedetails getGameInfo, addNonSteamGame | low | mitigate | fall back to tempGameInfo / a null wiki result; WR-42 tests make each call reject (Task 3) | closed |
| T-86-68 | 86-27 | Repudiation | the four new catch sites | low | mitigate | every catch logs a warning naming the operation, so a swallowed failure stays visible in gamelib.log; no catch is silent | closed |
| T-86-69 | 86-27 | Information Disclosure | the new warning lines | low | mitigate | each line logs only the operation text, the app name or title, and the rejection; the four ops (recent, umu, overrides attach, wiki) carry no key or token, and no line logs deps, args or a GameInfo object (T-28-04 rule: never format a token or key into a log line) | closed |
| T-86-70 | 86-27 | Elevation of Privilege | src/backend/info shims and resolvers | low | mitigate | no shim or resolver body changes (D-06/D-24); infoShimSchedule and infoPortComplete run in Tasks 2 and 3 | closed |
| T-86-71 | 86-27 | Information Disclosure | per-library sign-out leaves the wiki cache | low | mitigate | Task 4 passes requestRustInvoke so clearCache(library) empties it again; if skipped, accepted as before (public per-game data, 30-day TTL, nothing account-scoped) and recorded as owed | closed |
| T-86-SC | 86-27 | Tampering | package installs | low | accept | no package is installed or upgraded by this plan | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Verification Evidence

Paths are repo-relative. "Note" marks a mitigation that holds but whose wording or location has moved since the plan.

| Threat ID | Evidence |
|-----------|----------|
| T-86-01 | `86-VALIDATION.md:173-203` D-29 table: 13 rows, each a shipped file:line, no blank or TBD; operator approval in `86-01-SUMMARY.md` Task 3 Decision Record. |
| T-86-02 | `86-HUMAN-UAT.md:53-54,92-93` captures under `/tmp`, never committed, `~` paths and counts only; `git ls-files` tracks no capture. |
| T-86-03 | `86-HUMAN-UAT.md:58-59` P3 `ditto` copy, `:114` closing inventory, `:359-361` restore text; copies taken (`:197-200`, `:374`). |
| T-86-04 | `gamelib-info/src/http.rs:201,216-231` `.without_url()` plus URL/query scrub; test `http_replay.rs` `reqwest_http_errors_never_carry_the_url_or_its_key`. |
| T-86-05 | `http.rs:14` 16 MiB default, `:268-283` declared-length and streaming caps, per-call `max_body`; test `reqwest_http_caps_the_body_by_content_length_and_while_streaming`. |
| T-86-07 | `lib.rs:127-141` `guarded` holds an `info` registrant and races the token; tests `http_replay.rs:739-813`. Note: 3.5 s is the drain budget (`ExitBudget::DEFAULT` = 5 s total − 1.5 s child grace, `gamelib-core/src/shutdown.rs:281-283`). |
| T-86-08, T-86-11, T-86-13 | `src/backend/info/__tests__/fixtureRedaction.test.ts`: 9 rules, floor 900 over 992 files, planted-value self-tests, per-slice walk (widened by WR-61/62). Independent grep: every `key=`, `authorization`, `x-auth-token`, `set-cookie` value is `REDACTED`. Note: the write-time recorder was deleted in 86-24; this permanent scan is now the control. |
| T-86-09 | State fixtures are synthetic (`itad.link/steam-a`, `Game 1`) or public CrossOver data; no `/Users/`, account name or SteamID. |
| T-86-10 | `infoPortComplete.test.ts:922-1085` and `infoShimSchedule.test.ts:281-653`: floors, comment-stripped scans, planted-violation self-tests (237 pass). |
| T-86-12 | Crate spawns nothing (no `Command::new`/`gogdl`); `golden_discounts.rs` passes the literal `REDACTED`. Note: TS oracle deleted in 86-24. |
| T-86-14 | Note: `assertLiveRecorded` left with the TS oracle (86-24); successors are the golden floors (`golden_steamgrid.rs:25-33`, `golden_storeSearch.rs:36`) and Replay failing on an unconsumed exchange (`http_replay.rs:341`). |
| T-86-15 | `src-tauri/src/info_dispatch.rs:386-410` `parse_remove_recent` (1024 UTF-16, fixed literals); `recent.rs:49-59` `deny_unknown_fields`; manifest vectors `nativeChannels.json:367-381`. |
| T-86-16 | `recent.rs:71-75` module Mutex in `add`/`remove`; concurrency tests `golden_recent.rs:492-560`. |
| T-86-17 | `ipc_contract.rs:2900-2915` `InfoRecentAddArgs::from_args` before dispatch; crate re-decodes strictly. Note: the generated Rust struct is not `deny_unknown_fields`; strictness is zod `.strict()` plus the crate struct. |
| T-86-18, T-86-22, T-86-57, T-86-70 | `infoShimSchedule.test.ts` rows with `deletedBy` for every shim; D-06 shape check passes. |
| T-86-19 | `overrides.rs:190-208` fixed dir, names only from `read_dir`, `<appName>-` prefix, `remove_file`; symlink and path-shaped-appName tests. |
| T-86-20 | `info_dispatch.rs:453-468` (1–1024 UTF-16, WR-22); crate `deny_unknown_fields`. Note: manifest `maxLength: 256` and the `native.ts` comment are stale (IN-71); nothing reads them. |
| T-86-21, T-86-40, T-86-58 | `meta/genStoreTable.ts` `EXTRA_ROWS`; `storeTable.json` byte-identical to pre-86 (`afb0a4912`); generator `--check` up to date. |
| T-86-23 | `anticheat.rs:47-52` fixed HTTPS URLs, `:211-225` temp-then-rename, unparseable read answers `null`. |
| T-86-24 | `guarded` registrant, `anticheat.rs:55` 10 s timeout, download after the online wait (`bootstrap.ts:2880-2943`). |
| T-86-25 | `anticheat.rs:75-100` bounds and `deny_unknown_fields`; `info_dispatch.rs:536-549`; manifest vectors. |
| T-86-SC (86-12) | md-5 pinned in `cargoFeatures.test.ts:249`; RESEARCH verdict OK; documented as a change check, not a security control. |
| T-86-26 | One listener with both `.catch` guards (`bootstrap.ts:2880-2950`); `bootstrapWirings.test.ts:440-479`. |
| T-86-27 | `info_secrets.rs:59-143` category-only logging; `shell_log_detail` to stderr only; crate errors are fixed `<op>:secret-<category>`. |
| T-86-28 | `info_secrets.rs:173-175` vault needs env exactly `1` and `is_dev`; `:391-410` packaged build refuses; 0600, `O_NOFOLLOW`, symlink refused (WR-21). |
| T-86-29 | `info_secrets.rs:48-50` accounts only via `keyring_account` allowlist (`main.rs:519-527`). |
| T-86-31 | `steamgrid.rs:174` key only in the header, fixed-category transport errors, `SetKeyArgs` Debug hides the key. |
| T-86-32 | `steamgrid.rs` bounds and `deny_unknown_fields`; `info_dispatch.rs:632-760`; manifest vectors. |
| T-86-33 | `set_api_key` writes only the `steamgrid-api-key` slot; non-strings rejected before the context is read (`info_dispatch.rs:693-720`). |
| T-86-34 | `lib.rs:181-224` `spawn_sgdb_migration`: registrant, 10 s bound, token race, once per boot; `tests/secrets.rs` timeout/shutdown tests. |
| T-86-35 | `itad/mod.rs:239-258` status-less `Fail::Http`, fixed log text; `golden_storeSearch.rs` asserts no key or URL in errors. |
| T-86-36 | `itad/cache.rs:166-177` Retry-After clamp, `itad/gate.rs` single-flight, block-on-429 and serve-stale. |
| T-86-37 | `itad/mapping.rs:59-62,116-121` drops non-HTTPS `buyUrl`. |
| T-86-38 | `info_dispatch.rs:838-1031` bounds; crate re-decodes; manifest vectors. |
| T-86-39 | No ITAD define in `meta/buildSidecar*.ts`; `infoPortComplete.test.ts:373`, `itadKeyDefine.test.ts`. |
| T-86-41 | `.github/workflows/release-tauri.yml` require step and Tauri-step env; `releaseItadKey.test.ts` (16 pass). |
| T-86-42 | `discounts.rs:100-173` Debug hides the token, header only with a flag, fixed log text; `golden_discounts.rs` `the_token_is_sent_only_with_a_flag_and_never_logged`. Note: IN-27 open — generated `InfoGogDiscountsArgs` derives `Debug` with the token (latent; nothing formats it). |
| T-86-44 | `crossover/schema.rs:20-100` strict schema, `fetcher.rs:268-316` HTTPS-only and keep-last-good; rejection goldens. |
| T-86-45 | `fetcher.rs:30` 5 MiB compressed, `:33,148-160` 32 MiB inflated; test `a_gzip_bomb_is_cut_off_at_the_inflated_cap`. |
| T-86-46 | `info_dispatch.rs:148-165` bundled path is the shell's app root + `public`. |
| T-86-47 | `rating_map.rs:26,80` `MAX_GAMES` 20 000; `rustInvoke.ts` `.max(20000)`. |
| T-86-49 | `ReqwestHttp` default cap on every source; `wiki/mod.rs:42` 10 s, `umu.rs:41` 30 s. |
| T-86-50 | `umu.rs:45-62` `deny_unknown_fields` and runner check; generated runner enum. |
| T-86-51 | `wiki/hltb.rs:316-362` redacted Debug, memory-only state; `wiki_hltb_edges.rs` no-log-line test. |
| T-86-52 | 86-22 live drift run (`86-22-SUMMARY.md:133-160`): every wiki case PASS including HLTB, no 403; signed-build UAT `86-HUMAN-UAT.md:331`. |
| T-86-53 | `wiki/gog_ctx.rs` read-only; tree-compare tests in `golden_wiki_sources.rs`. |
| T-86-54 | `info_dispatch.rs:553-590` bounds; `WikiArgs` `deny_unknown_fields`. Note: IN-04 open — bounds are at the shell decode only, and the `rustInvoke.ts:815-817` comment overstates crate-side bounds. |
| T-86-56 | `js.rs:114` `remove_special_characters`; `gamelib-store/src/dotpath.rs:32` refuses `__proto__`/`prototype`/`constructor`. |
| T-86-59 | Per-slice describes plus `oraclePortComplete` in `infoPortComplete.test.ts`; set-equality in `infoShimSchedule.test.ts:290`. |
| T-86-60 | `86-25-SUMMARY.md` Task 2 `push-and-build-ask` checkpoint; diff list recorded; hooks green, no `--no-verify`. |
| T-86-61 | `86-VALIDATION.md:380-416` five signing checks for 0.12.0; designated requirement byte-identical to Phase 85. |
| T-86-62 | Drift output holds statuses only. Note: `dl86-v012/GameLib_0.12.0_aarch64.dmg` (public signed build) still in a 0700 scratchpad — delete with the gate session dir. |
| T-86-63 | `86-HUMAN-UAT.md:197-200,359-361,374,393-421` copy, restore text, inventory. Note: "Restore: none" by operator choice. |
| T-86-64 | `86-HUMAN-UAT.md:417-421` captures under `/private/tmp` (0700/0600), never committed. |
| T-86-65 | `launcher.ts:473-477` try/catch around `addRecentGame`; CR-41 tests. |
| T-86-66 | `umuGameId.ts:19-37` returns `null` on any rejection; used by gog, legendary and nile `launch()`; source gate test. |
| T-86-67 | `gamedetails/dispatch.ts:113-126`, `nonesteamgame.ts:259-271` fallbacks; WR-42 tests. |
| T-86-68 | All new catch sites call `logWarning` (`launcher.ts:476`, `umuGameId.ts:29-35`, `dispatch.ts:117-124`, `nonesteamgame.ts:261-269`, `utils.ts:367-372`). |
| T-86-69 | New warning lines carry operation, appName or title and the rejection only. |
| T-86-71 | `utils.ts:341` `ClearCacheDeps` requires `RustInvokeDeps`, `:367` clears the wiki cache; `legendary/user.ts:124` (WR-64). |

Checks run by the auditor on `main`: `cargo test -p gamelib-info --features testing` (all green),
`cargo test --bin gamelib-shell info_` (70 pass), the jest suites named above (all green), and
`meta/genStoreTable.ts --check` (up to date).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-86-01 | T-86-06 | `Policy::limited(5)` matches axios's default, so redirect chains behave as before; HTTPS-only checks stay where the TS had them (crossover `assert_https`). | plan 86-03 | 2026-11-23 |
| AR-86-02 | T-86-30 | The ITAD key baked into the shell binary has the same exposure as the sidecar bundle's baked key (Phase 47 D-04); it is a public-tier client key. | plan 86-14 | 2026-11-23 |
| AR-86-03 | T-86-43 | Up to 30 concurrent GOG discount page requests: same fan-out and cap as the TS; 15 s per request and a Shutdown registrant. | plan 86-18 | 2026-11-23 |
| AR-86-04 | T-86-48 | Regex on hostile wikitext: the Rust `regex` engine is linear time, stronger than the JS engine it replaces. | plan 86-20 | 2026-11-23 |
| AR-86-05 | T-86-55 | `forceRefresh` spam: same as TS (forced only on a user action); each op holds a registrant and every request has a timeout. | plan 86-22 | 2026-11-23 |
| AR-86-06 | T-86-SC (26 plans) | Package installs: every plan except 86-12 installs nothing or adds no new package or lockfile name; the lockfile name set is pinned by `cargoFeatures.test.ts`. | plans 86-01..11, 13..27 | 2026-11-23 |

*Accepted risks do not resurface in future audit runs.*

---

## Owed Cleanups (non-blocking)

- IN-71: `nativeChannels.json` / `native.ts` say 256 for the override bound; the enforced bound is 1024.
- IN-04: `rustInvoke.ts:815-817` says the crate bounds wiki args; only the shell decode does.
- IN-27: generated `InfoGogDiscountsArgs` derives `Debug` over the GOG token (latent).
- Delete the gate captures and `dl86-v012/` under the 0700 scratchpad once Phase 86 is verified (T-86-62, T-86-64).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-23 | 98 rows (72 IDs) | 98 | 0 | gsd-security-auditor (/gsd-secure-phase 86) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-23
