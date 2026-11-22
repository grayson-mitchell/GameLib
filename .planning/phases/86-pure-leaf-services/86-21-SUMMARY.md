---
phase: 86-pure-leaf-services
plan: 21
subsystem: info-wiki-sources
tags: [howlongtobeat, gamesdb, gog, title-match, wiki, cloudflare, replay, d-03, d-10, d-23, sc1, pitfall-3, pitfall-11]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-20 wiki::regexes (every HLTB pattern with node vectors), wiki::get_data, js::{prop, opt_prop, index}, Replay::for_host(s) and the wiki golden harness; 86-19 runner_caps (storeMap, appNameIsSteamAppId) and crossover::GameRef; 86-06 goldens and recordings with the tsOnly and rustOnly GOG exchanges and the pinned clock; 86-04 Replay"
provides:
  - "gamelib_info::wiki::gamesdb::{get -> Result<GamesDb, Thrown>, GamesDb{steam_id, to_json, to_value, has_steam_id}}"
  - "gamelib_info::wiki::gog_ctx::{gamesdb_release, gog_store_url}: the two unauthenticated GOG GETs of D-23, no store write"
  - "gamelib_info::wiki::hltb::{get, get_by_id, get_by_title, get_gog, HltbEntry{to_json, to_value}, HltbState, Credentials}"
  - "gamelib_info::wiki::title_match::{normalize_title, sequel_token, dice_similarity, to_search_terms, pick_best_match, MIN_CONFIDENCE}"
  - "InfoCtx.hltb: HltbState, the in-memory per-process HowLongToBeat credentials cache with a shared single handshake"
  - "http::Replay serves a rustOnly exchange before its tsOnly twin; Tap in the wiki harness keeps request header names"
affects: [86-22, 86-23, 86-24]

actuals:
  tokens: 36000
  tasks: 3
  commits: 3

plan_head_before: 28ad656a410cb4c766a0606cbb96394185ca24b3
plan_head_after: c80fc7f5411f724a83c55439a24d1df79b0a5a1e
commits: 3

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/wiki/gog_ctx.rs
    - src-tauri/crates/gamelib-info/src/wiki/gamesdb.rs
    - src-tauri/crates/gamelib-info/src/wiki/hltb.rs
    - src-tauri/crates/gamelib-info/src/wiki/title_match.rs
    - src-tauri/crates/gamelib-info/tests/wiki_hltb_edges.rs
    - .planning/todos/pending/2026-11-22-rust-wiki-gog-path-skips-gog-api-info-cache.md
    - .planning/todos/pending/2026-11-22-rust-wiki-title-comes-from-renderer-arg.md
    - .planning/todos/pending/2026-11-23-hltb-title-match-constructor-word-folds-to-function-text.md
  modified:
    - src-tauri/crates/gamelib-info/src/ctx.rs
    - src-tauri/crates/gamelib-info/src/http.rs
    - src-tauri/crates/gamelib-info/src/wiki/mod.rs
    - src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs
    - src-tauri/crates/gamelib-info/tests/wiki_golden/mod.rs

key-decisions:
  - "HLTB credentials are an in-memory HltbState on InfoCtx, never persisted, never logged (Debug prints nothing). The TS `inFlight` promise is reproduced with a tokio lock plus a finished-handshake counter: a caller that waited for the lock and finds the counter moved shares that handshake's outcome (success or failure) instead of starting another; a failed handshake clears the cache, so the next caller retries. A forced refresh (the 403 path) skips only the cached value, as in the TS."
  - "Accept-Encoding is not sent (Pitfall 3): BROWSER_HEADERS is copied minus it, so the shell's reqwest (no gzip, brotli or deflate feature) gets an identity body. No reqwest feature, no lockfile change. Every golden run asserts no request carried the header."
  - "Replay now serves a `rustOnly` exchange before an older twin of the same request. The GOG recordings hold three identical `api.gog.com/v2/games/<id>` exchanges (two `tsOnly`, one `rustOnly`), and Rust makes one: without the preference it consumed the first `tsOnly` one and left the `rustOnly` one 'unconsumed'."
  - "gamesdb::get and hltb::get return Result<_, Thrown>. `Err` is exactly where the TS threw OUTSIDE its own try/catch and so failed the whole wiki lookup (a GamesDB answer with data but no game.releases list; a GOG games answer whose `_links` has no `store`, or a store link that is not a URL). 86-22 maps `Err` to the same `null` result. Everything the TS caught is `None` or the empty value."
  - "A mixed GOG case is compared with the recording minus its `tsOnly` exchanges (D-23), sorted when a `rustOnly` exchange is present because the recorder appended it after the flow's own af.gog.com request; every GOG run also asserts the whole profile tree is unchanged and `store_cache/gog_api_info.json` was not created (T-86-53)."
  - "The golden for every GOG case has `howlongtobeat: null` (the recorded gog.com page has no HowLongToBeat box), so the box parse itself is proven by synthetic-page tests in wiki_hltb_edges.rs (time rounding, `parseFloat` prefix rules, the id link, non-200, 5xx, missing box, missing time) rather than by a golden."

patterns-established:
  - "A source that talks to several hosts is replayed with Replay::for_hosts over all of them and compared with a request list derived from the recording (rust_requests), not from the golden requests, when D-23 exchanges are involved."
  - "Scripted Http stub (tests/wiki_hltb_edges.rs): answers by closure, records whole requests, yields once before answering so concurrent callers genuinely interleave."

requirements-completed: []

duration: about 55 min
completed: 2026-11-23
status: complete
---

# Phase 86 Plan 21: HowLongToBeat, GamesDB and the GOG context Summary

**HowLongToBeat by id, by title (the init handshake, the search with its honeypot headers and body, the 403 re-handshake) and through gog.com, GamesDB, the two unauthenticated GOG GETs of D-23 and the title-match scoring now run in Rust and reproduce the 86-06 goldens request for request, with no Accept-Encoding, no GOG store write and the search token held in memory only.**

## Accomplishments

- **GamesDB and the GOG GETs (Task 1, the tracer).** `gog_ctx::gamesdb_release` GETs `gamesdb.gog.com/platforms/<store>/external_releases/<id>` and `gog_store_url` GETs `api.gog.com/v2/games/<id>?locale=en-US`, derives the `_links.store.href` and applies `getExtraInfo`'s rewrite (`af.gog.com`, `as=1838482841`, query re-serialised the form-urlencoded way, checked against `new URL` and `searchParams.set` in node). `gamesdb::get` returns `{steamID}` equal to the golden for every case: GOG and Epic through the request, Steam appId and sideload with no request. The tracer's end-to-end check (`golden_wiki_sources`) passed on the first run after the Replay `rustOnly` fix.
- **HowLongToBeat (Tasks 2 and 3).** `hltb::get` is `getHowLongToBeat`: GOG store-page box, `/game/<id>` `__NEXT_DATA__`, and the by-title search for a non-GOG game with no id or a stale one. The search body is built as an ordered JSON object (`to_compact_bytes`) so the recorded body matches byte for byte, with the honeypot pair under its server-chosen key last. Every request carries the TS browser headers and `Referer`; the init GET carries `?t=<clock>`.
- **Title matching.** `title_match` ports `titleMatch.ts` (NFKD normalisation, trailing roman-numeral fold, sequel token, bigram Dice in UTF-16 units, search terms, `pick_best_match` with the confidence, margin and sequel rules). Every `titleMatch.test.ts` vector is repeated, plus node-recorded Unicode and `constructor` cases.
- **Credentials.** `InfoCtx.hltb` (`HltbState`) caches the handshake in memory per process, shares one in-flight handshake between concurrent callers, and never keeps a failed one.

## Task Commits

| Task | Commit | What |
| --- | --- | --- |
| 1 (tracer) | `21e4ed2c1` | gog_ctx, gamesdb, Replay `rustOnly` preference, GamesDB goldens and the no-store-write assertion |
| 2 and 3 | `5cab70ef3` | hltb (id, title, GOG box), title_match, InfoCtx.hltb, HLTB goldens, edge tests |
| 3 (todos) | `c80fc7f54` | the two D-23 todos and the constructor-fold todo |

## Counts

- `cargo test -p gamelib-info --features testing`: 346 passed, 0 failed (lib 123 unit tests, golden_wiki_sources 8, wiki_hltb_edges 13, wiki_source_edges, regex_vectors, http_replay and every earlier suite).
- Golden coverage: GamesDB and HowLongToBeat each over all 29 golden cases whose wiki op made requests (GamesDB asks only for GOG and Epic, and answers the empty id silently for Steam appId and sideload); HowLongToBeat by id (Steam, sideload and the dotted title), by title (the 403 re-handshake case and the ambiguous refusal), nothing found, and the 4 GOG cases.
- Two mutations were run and both failed the suite as they should: a changed `Accept-Language` (the golden header pin) and removing the shared-handshake check (the concurrency tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replay consumed the wrong GOG twin**
- **Found during:** Task 1
- **Issue:** the GOG recordings hold three identical `api.gog.com/v2/games/<id>` exchanges (two `tsOnly`, one `rustOnly`). Rust makes one request; Replay matched the first free twin (a `tsOnly` one) and `finish()` then failed on the unconsumed `rustOnly` exchange. The plan's "tsOnly exchanges were the only ones left over" could not hold.
- **Fix:** `Replay` reads `rustOnly` and prefers such an exchange when several free ones match a request (86-04's file, `src/http.rs`, not in the plan's file list).
- **Files modified:** src-tauri/crates/gamelib-info/src/http.rs
- **Commit:** `21e4ed2c1`

**2. [Rule 2 - Missing critical] Shared single handshake and no-log of credentials**
- **Found during:** Task 2
- **Issue:** the plan's `Mutex<Option<Credentials>>` alone would let concurrent title lookups each run a handshake (the TS shared one in-flight promise) and the type needed a `Debug` that cannot print the token (T-86-51).
- **Fix:** `HltbState` (cache, tokio lock, finished counter) and a redacting `Debug`; tests cover three concurrent callers and a shared failure.
- **Files modified:** src-tauri/crates/gamelib-info/src/wiki/hltb.rs, src-tauri/crates/gamelib-info/src/ctx.rs
- **Commit:** `5cab70ef3`

**3. [Plan structure] Tasks 2 and 3 share one code commit**
- `get_gog` lives in hltb.rs and the HLTB golden test covers every branch (id, title, GOG) in one run, so splitting them would have meant a commit with a deliberately broken GOG branch. Task 3's own commit is the two required todos plus the constructor-fold one. Task 1 was committed on a reduced `wiki/mod.rs`, `ctx.rs` and golden test so it compiles and passes alone.

**4. [Rule 2] A third todo**
- the `constructor` fold quirk found while porting `normalizeTitle` (below), filed rather than silently copied.

### Auth gates

None. Every request is public and keyless.

## D-03 quirks copied (not fixed)

- **`normalizeTitle("... Constructor")`** folds the last word to the text of `Object.prototype.constructor` (`bridge function Object() { [native code] }`), because the TS roman table is an object literal. Copied and proven against node: `.planning/todos/pending/2026-11-23-hltb-title-match-constructor-word-folds-to-function-text.md`.
- **D-23 differences** (both filed): no `gog_api_info` write and no requirements or changelog GETs (`2026-11-22-rust-wiki-gog-path-skips-gog-api-info-cache.md`); the title comes from the caller's argument (`2026-11-22-rust-wiki-title-comes-from-renderer-arg.md`).
- Smaller behaviours copied, documented in the module headers and pinned by `wiki_hltb_edges.rs`: a GOG game has no title-search fallback; a GamesDB answer with data but no `game.releases` list fails the whole wiki lookup (`Err`); a null entry read before a steam match does too; a `steamID` that is a number is passed through as sent; a 5xx and a transport failure are `None` for every HLTB request; a non-string search `game_name` makes the whole by-title lookup `None`.

## Notes for 86-22, 86-23

- **86-22 (aggregator):** the calls are `gamesdb::get(ctx, title, app_name, runner) -> Result<GamesDb, Thrown>` (`GamesDb::to_json()` for the cache, `has_steam_id()` for `gamesdb?.steamID || pcgamingwiki?.steamID`) and `hltb::get(ctx, &GameRef{runner, app_name, title}, pcgw_hltb_id) -> Result<Option<HltbEntry>, Thrown>`. `title` for HLTB is the game's RAW title (the cleaned `remove_special_characters` one is only for pcgw, agw and the cache key). `Err` from either means the TS rejected: the whole lookup is `null`. `HltbEntry::to_json()` is the cache value in TS key order. The GOG wiki recordings are compared with `rust_requests` in `golden_wiki_sources.rs` (recording minus `tsOnly`).
- **Live check (D-12):** the requests are pinned to the recorded TS ones, but the live proof against Cloudflare (T-86-52, Pitfall 11) is 86-22's drift run. The cases to add there are an HLTB by-id page, the init plus a title search, and a GOG store page; a Rust-only 403 is phase-blocking.
- The credentials handshake time comes from `ctx.clock`, so a test or the drift run pins `?t=` the same way the goldens do.

## Verification

- `cargo test -p gamelib-info --features testing` (346 passed), `cargo clippy -p gamelib-info --all-targets --features testing -- -D warnings` (clean), `rustfmt --edition 2021 --check` over every touched Rust file, `cargo check -p gamelib-info-cli`: green.
- `pnpm planning-gates` 12/12; `pnpm codecheck` exit 0 at the last commit. The `<verify>` lines' `cargo fmt -p gamelib-info --check` is replaced by per-path `rustfmt --check` (the sequential-execution rule against workspace `cargo fmt`).
- Not run: the workspace-wide jest and the shell crate's tests (no TS or shell file changed; the shell has foreign clippy failures already recorded).

## Known Stubs

None.

## Threat Flags

None new. T-86-51 (token memory only, never logged: `Debug` is redacted, a test asserts no line or profile file carries it), T-86-53 (no GOG or other store write, asserted by tree comparison on every GOG golden and edge run) are mitigated as planned. T-86-52 (rustls fingerprint vs Cloudflare) is open until 86-22's live drift run; T-86-SC: no new package, reqwest feature or lockfile change.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-info/src/wiki/{gog_ctx,gamesdb,hltb,title_match}.rs, tests/wiki_hltb_edges.rs, the three todos
- FOUND commits: 21e4ed2c1, 5cab70ef3, c80fc7f54
