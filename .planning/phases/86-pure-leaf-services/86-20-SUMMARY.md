---
phase: 86-pure-leaf-services
plan: 20
subsystem: info-wiki-sources
tags: [umu, wiki, pcgamingwiki, applegamingwiki, protondb, steam-deck, codeweavers-slug, regex, js-semantics, replay, d-03, d-04, d-10, sc1, pitfall-4]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-06 wiki and umu goldens (40 cases) with recordings and state folders, 86-19 runner_caps (hasStoreCatalog, umu store) and crossover::normalize::slugify, 86-03 CacheView with the UMU and WIKIGAMEINFO parameters, 86-16 Replay networkError, 86-18 InfoLog sink, the info_dispatch and rustInvoke channel pattern"
provides:
  - "op info_umu_get {appName, runner} and RUST_INFO_UMU_GET (strict schema, runner is the five-name enum); gamelib_info::umu::{get, UmuArgs}"
  - "gamelib_info::wiki::{pcgw, agw, protondb, deck, codeweavers, regexes} plus Thrown, Outcome, get_data and user_agent in wiki/mod.rs: each source returns a typed value with to_json (TS key order, for the wiki cache) and to_value"
  - "wiki::regexes: the 23 wiki and HowLongToBeat patterns with JS `.`, `\\s` (BOM in, NEL out) and `\\d` spelled out, plus the DOT and WS class constants"
  - "js.rs: encode_uri_component (moved from steamgrid), truthy (moved), to_js_text, remove_special_characters, and the JS property-read helpers prop / opt_prop / index (a read of undefined or null throws)"
  - "http::Replay::for_host / for_hosts: keep one source's exchanges out of a multi-source case"
  - "tests/wiki_golden/mod.rs: the fixtures, MANIFEST rules, clock, tap and tree helpers the wiki golden suites share"
affects: [86-21, 86-22, 86-23, 86-24]

actuals:
  tokens: 42000
  tasks: 3
  commits: 3

plan_head_before: f1eb8636d0762bc994ba28805a295076fd7b272f
plan_head_after: 977e31d045ea7854c39ff1b8ffb3b2c072720b64
commits: 3

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/umu.rs
    - src-tauri/crates/gamelib-info/src/js.rs
    - src-tauri/crates/gamelib-info/src/wiki/mod.rs
    - src-tauri/crates/gamelib-info/src/wiki/regexes.rs
    - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
    - src-tauri/crates/gamelib-info/src/wiki/agw.rs
    - src-tauri/crates/gamelib-info/src/wiki/protondb.rs
    - src-tauri/crates/gamelib-info/src/wiki/deck.rs
    - src-tauri/crates/gamelib-info/src/wiki/codeweavers.rs
    - src-tauri/crates/gamelib-info/tests/golden_umu.rs
    - src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs
    - src-tauri/crates/gamelib-info/tests/regex_vectors.rs
    - src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs
    - src-tauri/crates/gamelib-info/tests/wiki_golden/mod.rs
    - .planning/todos/pending/2026-11-22-umu-cached-null-refetched-every-call.md
    - .planning/todos/pending/2026-11-23-pcgw-search-term-not-url-encoded.md
  modified:
    - src-tauri/crates/gamelib-info/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info/src/http.rs
    - src-tauri/crates/gamelib-info/src/steamgrid.rs
    - src-tauri/crates/gamelib-info/tests/http_replay.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/info/__tests__/recentGames.test.ts

key-decisions:
  - "`\\s` is the JS WhiteSpace plus LineTerminator set, not just Rust's with a BOM added: JS has U+FEFF and not U+0085 (NEL), Rust's Unicode White_Space is the opposite on both. regexes.rs spells the member list out (WS) and regex_vectors.rs proves it, and DOT, over every UTF-16 code unit against node. The `regex` crate is added with no Unicode table feature, so a stray `\\s` or `\\d` fails to compile instead of quietly matching the Rust set."
  - "The `m` flag never appears: none of the TS patterns that carry it has an anchor, so it was a no-op in JS too. `$` and `^` appear only in the two title-matching patterns, which have no `m` flag, and are `\\z` and `\\A` here."
  - "The JS property-read semantics (`data.query.search[0]?.pageid`, where a read of undefined throws and lands in the source's failure value) are modelled once in js.rs (prop, opt_prop, index) instead of per source, so each source's failure paths are the TS's by construction: PCGamingWiki `error`, AppleGamingWiki, ProtonDB and Steam Deck `null`."
  - "umu has no User-Agent header: the recorded TS request carries none and the endpoint answers 200 without one (checked live), and ReqwestHttp sets none. PCGamingWiki, ProtonDB and Steam Deck send `GameLib/<version> (+repo)` and AppleGamingWiki the browser one, each pinned by Replay and by a unit test."
  - "An umu answer that is not a list, or whose first entry has no `umu_id`, rejects with `info_umu_get:bad-response` and writes nothing: the TS threw there (a failed destructure, a TypeError, or conf refusing to store undefined). An empty list or an empty body is a miss, cached as null."
  - "The sources return typed values with `to_json` in the TS key order (PCGamingWiki steamID, howLongToBeatID, metacritic, opencritic, igdb, direct3DVersions, genres, releaseDate; AppleGamingWiki crossoverRating, wineRating, crossoverLink) so 86-22 can store them in the wiki cache byte for byte."

requirements-completed: []

duration: about 25 min
completed: 2026-11-23
status: complete
---

# Phase 86 Plan 20: umu and the simpler wiki sources Summary

**`info_umu_get` and PCGamingWiki, AppleGamingWiki, ProtonDB, Steam Deck and the CodeWeavers slug now run in Rust and reproduce the 86-06 TS goldens request for request, with every wikitext pattern proven against the JS engine over 282 recorded matches.**

## Accomplishments

- **Task 1 (tracer): `info_umu_get`.** `umu::get` follows `getUmuId`: null with no request and no cache read for a runner whose `hasStoreCatalog` is false, key `<runner>_<appName>`, `GET umu_api.php?codename=<lower-cased>&store=<umu name>` (the query written the way axios writes it), the first match's `umu_id` cached for 6 hours over `CacheView` (`invalidate WhenFalsy`), an empty list cached as null, any failure or non-200 null with nothing written. The channel is end to end: `RUST_INFO_UMU_GET` with a strict schema (runner is the five-name enum), a generated `InfoUmuGetArgs`, a `rust_dispatch` arm and an `info_dispatch` handler. `golden_umu` replays all nine direct `getUmuId` goldens (results, requests, request counts and the cache file bytes), and a canned-transport test pins the answers the goldens cannot reach.
- **Task 2: regexes, PCGamingWiki, AppleGamingWiki.** `wiki/regexes.rs` holds all 23 patterns (8 PCGamingWiki, 3 AppleGamingWiki, 5 HowLongToBeat page scrape, 7 title matching) with `.`, `\s` and `\d` made explicit. `regex_vectors.rs` carries 282 vectors (at least 10 per pattern, each pattern with a matching and a non-matching input) recorded by running the TS patterns, extracted from the TS source files so a drifted copy would have failed, in node over LF, CRLF, a lone CR, U+2028, U+2029, a BOM, NEL, NBSP, a non-ASCII digit and an astral character; it also proves WS and DOT over every UTF-16 code unit. I confirmed the test bites: widening DOT to `[^\n]` failed two tests. `pcgw.rs` and `agw.rs` replay 29 PCGamingWiki and 10 AppleGamingWiki goldens (found, not found, the 403, the live GOG-id `permissiondenied`, the two synthetic cargoquery paths) against the golden `pcgamingwiki`, `fetchStatus.pcgamingwiki` and `applegamingwiki` parts and the golden requests per host in order.
- **Task 3: ProtonDB, Steam Deck, slug.** Both replay the four recorded Linux goldens against the `steamInfo` parts (`compatibilityLevel`, `steamDeckCatagory`); no Steam id (absent or empty) asks nothing. `wiki/codeweavers.rs` re-exports the one `slugify` 86-19 ported and replays every TS slugify vector plus a check that the output is always `[a-z0-9-]`.

## Task Commits

1. **Task 1 (tracer): umu end to end** - `251de5548`
2. **Task 2: regexes with JS-parity vectors, PCGamingWiki, AppleGamingWiki** - `4d04340dc`
3. **Task 3: ProtonDB, Steam Deck, CodeWeavers slug** - `977e31d04`

## Counts

| Item | Count |
| ---- | ----- |
| regexes.rs patterns | 23 |
| regex_vectors.rs recorded matches | 282 (min 10 per pattern) |
| direct umu goldens replayed | 9 of 9 |
| PCGamingWiki goldens replayed | 29 (ok, notfound and error all present) |
| AppleGamingWiki goldens replayed | 10 |
| ProtonDB and Steam Deck goldens replayed | 4 |
| shell pins moved | rust_dispatch arms 134 -> 135, RUST_INVOKE_CHANNELS 134 -> 135, new-arm allow-list, RUST_INFO_CHANNELS set |

## Deviations from Plan

**1. [Rule 3 - Blocking] `Replay::for_host` landed in Task 1, not Task 2.** The umu tracer's golden test needs the replay filtered to the umu host (the plan's own Task 1 text says so), so the `http.rs` change came with it; a `for_hosts` variant serves the ProtonDB plus Steam Deck pair.

**2. [Rule 3 - Blocking] The `regex` crate had to be added to `gamelib-info`.** The plan's threat model says regex is already locked (it is, transitively) but the crate did not depend on it. `regex = { version = "1", default-features = false, features = ["std", "perf"] }`: no new lockfile package name, one new dependency edge (`Cargo.lock` +1 line), `cargoFeatures.test.ts` passes.

**3. [Rule 1 - plan wording] `\s` is not "widened with U+FEFF".** The plan's Pitfall 4 wording would still have matched NEL (U+0085), which JS `\s` does not. WS is the exact JS set, proved over every code unit.

**4. [Plan wording] The `m` flag never appears.** None of the TS patterns that carry it has an anchor, so the plan's "`(?m)` where TS used the m flag" has no case; the point is recorded in regexes.rs.

**5. [Rule 2 - scope] Shared test support and an edge-case suite.** `tests/wiki_golden/mod.rs` (shared by `golden_umu` and `golden_wiki_sources`) and `tests/wiki_source_edges.rs` (awkward-title URLs, the User-Agent each source sends, each failure value, the keys' order) are not in the plan's file list; the edge suite covers the paths no recorded golden reaches.

**6. [Plan wording] `steamgrid.rs` and `http_replay.rs` were touched.** `encode_uri_component` and `truthy` moved to `js.rs` (the plan said to move the former); `http_replay.rs` gained the `for_host` test.

### Auth gates

None. Every source here is public and keyless.

## D-03 quirks copied (not fixed)

- **umu cached null is re-fetched on every call** (an expired truthy id is kept): `.planning/todos/pending/2026-11-22-umu-cached-null-refetched-every-call.md`.
- **PCGamingWiki search term encodes only spaces** (a `#` in a title cuts the URL; every colon stays literal): `.planning/todos/pending/2026-11-23-pcgw-search-term-not-url-encoded.md`.
- **PCGamingWiki's live GOG-id cargoquery answers `permissiondenied` with HTTP 200**, so every GOG title ends `error`: already filed by 86-06 (`2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md`); the live goldens pin it and `wiki_source_edges.rs` reproduces it.
- Smaller lenient behaviours, documented in each module's header and pinned by `wiki_source_edges.rs`, not worth a todo: an empty `direct3d versions` or `genres` is `[""]`; ProtonDB's tier and the Deck category are passed through as sent (only truthiness / `Number.isFinite` is checked); AppleGamingWiki caches "checked, none found" as three empty texts.

## Notes for 86-21, 86-22, 86-23

- **86-21 (HowLongToBeat, GOG):** `wiki::regexes` already holds the HLTB page patterns (`next_data`, `gog_main`, `gog_main_sides`, `gog_completionist`, `gog_hltb_id`) and the title-matching ones (`combining_marks`, `ampersand`, `non_alphanumeric_run`, `all_digits`, `trademark_glyphs`, `whitespace_run`, `trailing_punctuation`), each with vectors; use them rather than writing a pattern. `wiki::get_data(ctx, url, user_agent)` is the axios-shaped GET (2xx only, JSON when it parses, BOM stripped) and `js::{prop, opt_prop, index}` the property reads; HLTB's `validateStatus < 500` GETs need their own request (not `get_data`).
- **86-22 (aggregator):** each source returns a typed value with `to_json()` in the TS key order for the wiki cache: `pcgw::get_info(ctx, title, gog_id) -> PcgwResult {info, outcome}` (`Outcome::word()` is the `fetchStatus` word), `agw::get_info -> Option<AgwInfo>` (None = retry), `protondb::get_info(ctx, Option<&str>) -> Option<ProtonDb>`, `deck::get_comp -> Option<DeckComp>`, `umu::get(ctx, UmuArgs) -> Result<Value, String>`. The `title` passed to pcgw/agw is `js::remove_special_characters(game.title)`, which is also the wiki cache key. `golden_wiki_sources.rs` shows how the Steam id for ProtonDB and the Deck is derived (`steam_id_of`).
- **86-23 (shims):** `RUST_INFO_UMU_GET` has NO TS caller yet and no infoShimSchedule row (86-10's channel pattern); the GOG, Epic and Amazon store managers' shims add the row and the callers together. A rejected `info_umu_get` frame means a bad-response or a store problem (`info_umu_get:store-unavailable`, `:store-write`), and the TS getUmuId only ever rejected on those same shapes.

## Verification

- `cargo test -p gamelib-info --features testing` (golden_umu 6, golden_wiki_sources 5, regex_vectors 5, wiki_source_edges 12, http_replay 31, plus every earlier suite and the 104 unit tests), `cargo test --bin gamelib-shell info_dispatch` (45), `cargo clippy -p gamelib-info --all-targets -- -D warnings`, `cargo fmt -p gamelib-info -- --check`, `rustfmt --check` on the touched shell files (only the generated `ipc_contract.rs` differs, foreign), `pnpm check:ipc-contract`: green.
- `pnpm codecheck`, `pnpm find-deadcode` (312 baselined, unchanged), `pnpm planning-gates` (12/12), prettier on the touched TS paths: green. `pnpm backend-di-ceilings` fails only on the two known foreign files (optInDlc.test.ts, libraryStoreFollowers.test.ts).
- `pnpm exec jest --selectProjects Meta`: 88 suites passed, 2799 tests (run after the `regex` dependency edge, before Task 3 which changed no Meta input). `pnpm exec jest --selectProjects Backend Common`: 645 suites passed, 14570 tests, 0 failed (after the last code commit).
- Live: `curl` of the umu endpoint with no `User-Agent` (what the Rust request sends) answered 200 with a list.

## Known Stubs

None.

## Threat Flags

None. T-86-48 (the Rust `regex` engine is linear time: no backtracking blow-up on hostile wikitext), T-86-49 (ReqwestHttp's body cap and a 10 s / 30 s per-request bound apply to every source, which the TS lacked for umu), T-86-50 (strict generated schema with the runner enum plus the crate's `deny_unknown_fields` struct and runner table) are mitigated as planned; T-86-SC: no new lockfile package name.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-info/src/{umu,js}.rs, src-tauri/crates/gamelib-info/src/wiki/{mod,regexes,pcgw,agw,protondb,deck,codeweavers}.rs, tests/{golden_umu,golden_wiki_sources,regex_vectors,wiki_source_edges}.rs, tests/wiki_golden/mod.rs, both todos
- FOUND commits: 251de5548, 4d04340dc, 977e31d04
