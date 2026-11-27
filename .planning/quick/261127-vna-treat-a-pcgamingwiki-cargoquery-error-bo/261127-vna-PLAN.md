---
phase: quick-261127-vna
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
  - src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs
  - src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/exchanges.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/body-11.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/body-12.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/exchanges.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/body-10.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/body-11.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/after/store_cache/wikigameinfo.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-mac/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-mac/after/store_cache/wikigameinfo.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/cases.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/MANIFEST.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/exchanges.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-1.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-2.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-3.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-4.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-5.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-6.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-7.json
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-8.html
  - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/body-9.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/events.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/after/store_cache/wikigameinfo.json
  - .planning/todos/completed/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md
files_deleted:
  - .planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md (moved to completed/)
autonomous: true
requirements:
  - "quick:261127-vna"

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "pcgw::get_info for a GOG title whose GOG-id cargoquery answers 2xx with no usable `cargoquery` property (the live permissiondenied error object, an empty object, or `cargoquery: null`) makes the title search and parses the page it finds: outcome ok on a hit, notfound on zero hits. It never returns error for that answer, and it writes one fixed-text diagnostic line with no title and no URL in it"
    - "A non-2xx status or a transport failure on the cargoquery is still outcome error, and no title search is made. Only a 2xx answer that lacks `cargoquery` counts as no GOG id"
    - "The live-gog-linux and live-gog-mac goldens now show the fixed flow. fetchStatus.pcgamingwiki is ok and `pcgamingwiki` equals the object in the live-epic-<platform> golden for the same title, page and day (the TS oracle wrote that object). `howlongtobeat` stays null with fetchStatus.howlongtobeat notfound, because hltb::get's GOG branch reads only the gog.com store page. The requests lists hold the PCGamingWiki search and parse, and the after-state wiki cache holds exactly the bytes the Rust writer produces"
    - "No live network is used. The two new recorded exchanges in each live GOG case are copies of live-epic-<platform> ex-1 (the search) and ex-3 (the parse), and their bodies are byte-identical to those cases' body-1.json and body-3.json"
    - "The new synthetic golden case gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic pins the fallthrough with the real permissiondenied body, so the pin does not depend on whatever the live API answers today. Its recorded directory differs from the cargo-empty synthetic case's only in body-1.json. Its expected directory is identical to the cargo-empty case's, and MANIFEST count is 41"
    - "cargo test -p gamelib-info passes in full. The gamelib-info-cli drift replay test a_recorded_service_that_matches_the_golden_passes_every_wiki_case passes. cargo fmt --check is clean for the crate"
    - "Three commits are made: fix (code + live GOG goldens), test (synthetic case), and docs (todo rename). Each one stages only its own listed paths. No other dirty or untracked file in the tree, including files a concurrent session is editing, is staged, reverted, stashed or committed"
    - "The todo 2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup is in .planning/todos/completed/ with a Resolution section. The section records that the TS half has no target, explains why GOG HLTB stays notfound, and names the fix and test commits"
  artifacts:
    - path: "src-tauri/crates/gamelib-info/src/wiki/pcgw.rs"
      provides: "page_id reads `cargoquery` with optional chaining. A 2xx answer without it is no GOG id and falls through to the title search, and the module doc records this as a departure"
      contains: "2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup"
    - path: "src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs"
      provides: "a new test pinning the fallthrough for the permissiondenied body, an empty object and a null cargoquery, plus the boundary that a 403 cargoquery stays error"
      contains: "pcgamingwiki_reads_a_cargoquery_answer_without_cargoquery_as_no_gog_id"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/exchanges.json"
      provides: "ex-11 (the PCGW title search) and ex-12 (the PCGW parse of pageid 97605), copied from live-epic-linux ex-1 and ex-3"
      contains: "srsearch=Cyberpunk%202077"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/result.json"
      provides: "fetchStatus.pcgamingwiki ok and the PCGW object, with the two PCGW requests in `requests`"
      contains: "\"pcgamingwiki\": \"ok\""
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/MANIFEST.json"
      provides: "count 41 (floor 25 unchanged)"
      contains: "\"count\": 41"
    - path: ".planning/todos/completed/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md"
      provides: "the closed todo with its resolution note"
      contains: "## Resolution"
  key_links:
    - from: "src-tauri/crates/gamelib-info/src/wiki/pcgw.rs"
      to: "src-tauri/crates/gamelib-info/src/wiki/mod.rs"
      via: "get() joins pcgw::get_info. Its outcome becomes fetchStatus.pcgamingwiki, whose `error` value is what staleWikiFetch re-fetches. pcgw.info.steam_id is the ProtonDB/Deck fallback, and pcgw.info.how_long_to_beat_id is handed to hltb::get, whose GOG branch ignores it"
      pattern: "pcgw::get_info\\(ctx, &title, gog_id\\)"
    - from: "src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/exchanges.json"
      to: "src-tauri/crates/gamelib-info/src/http.rs"
      via: "Replay::serve matches by method, host+path and decoded query pairs, and a request with no twin fails as `replay: unmatched request`. The fixed code makes the PCGW search and parse, so both live GOG recordings need those two exchanges, or golden_wiki, golden_wiki_sources and the gamelib-info-cli drift test fail"
      pattern: "action=parse&format=json&pageid=97605"
    - from: "src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/result.json"
      to: "src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs"
      via: "every_run reads result.json `requests`, filters by host, and check_requests compares it in exact order to the URLs the source made. The PCGW order must be cargoquery, search, parse. golden_wiki.rs instead reads exchanges.json, as a multiset, because the GOG cases carry rustOnly exchanges"
      pattern: "GET https://www.pcgamingwiki.com/w/api.php\\?action=query&list=search&srsearch=Cyberpunk%202077&format=json"
    - from: "src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/after/store_cache/wikigameinfo.json"
      to: "src-tauri/crates/gamelib-info/tests/golden_wiki.rs"
      via: "assert_files compares every file under expected/<case>/after to what the run wrote, byte for byte (tab indent, no trailing newline)"
      pattern: "\"pcgamingwiki\": \\{"
    - from: "src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/MANIFEST.json"
      to: "src-tauri/crates/gamelib-info/tests/wiki_golden/mod.rs"
      via: "check_manifest needs MANIFEST count == cases.json length, and one expected/ folder per case id. golden_wiki, golden_wiki_sources and golden_umu all run it"
      pattern: "\"count\""
---

<objective>
Close todo `2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup`. PCGamingWiki now answers the GOG-id lookup (`action=cargoquery ... GOGcom_ID HOLDS <id>`) with HTTP 200 and `{"error":{"code":"permissiondenied",...}}`. The Rust `pcgw::page_id` reads `data.cargoquery[0]`, which throws on the missing key. As a result every GOG title's PCGamingWiki lookup ends in outcome `error`, and the wiki cache re-fetches it on every details-page visit.

Fix: read a 2xx cargoquery answer that has no `cargoquery` as "no GOG id" and fall through to the title search. Then update the two live GOG goldens to show the fixed flow (offline, from responses already recorded), add a synthetic golden case that pins the permissiondenied fallthrough, and close the todo.

Purpose: GOG titles get PCGamingWiki data again, and stop re-fetching on every visit. The cargo query is kept rather than skipped, so GOG-id lookups work again if PCGamingWiki restores the permission. The two existing synthetic cases (`gog-pcgw-cargo-id-hit-synthetic`, `gog-pcgw-cargo-empty-falls-back-to-title-search-synthetic`) keep pinning that path, unchanged.

Output: the `pcgw.rs` fix with its module doc, one new edge test, updated live-gog-linux/mac goldens, one new synthetic golden case, and the closed todo. Three commits: fix, test, docs.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md

Facts established at planning time (2026-11-27), measured on this tree. Do not re-derive them.

**The TS half is gone; this is Rust only.**
- `src/backend/wiki_game_info/` was deleted in 86-24 (`fcf981590`). There is no `utils.ts` left to change.
- The todo said "the Rust port in 86 must reproduce the current behaviour until then". That port is `src-tauri/crates/gamelib-info/src/wiki/pcgw.rs`, which copies the throw on purpose. Its module doc lists the throw under "Parity points copied, not fixed (D-03)" (lines 13-19, the second bullet). Quick task `261123-9os` set the precedent of departing from the deleted TS here.

**Fix site: `pcgw.rs` `page_id`, lines 178-207.**
- The GOG branch calls `get_data` (it errors on non-2xx and on transport failure; a 2xx body is parsed JSON, or the text itself when it does not parse).
- It then reads `index(prop(Some(&data), "cargoquery")?, 0)?`. `prop` on an object without the key is `Ok(None)`, and `index(None, _)` is `Err(TypeError)`, so the result is outcome `error`.
- The JS-semantics helpers are in `src-tauri/crates/gamelib-info/src/js.rs` (lines 77-102):
  - `opt_prop` reads `undefined`/`null` as `Ok(None)`.
  - `prop` and `index` throw on `undefined`/`null`. On a non-object scalar they answer `Ok(None)`.
- `ctx.note(&str)` writes one diagnostic line.

**What changes in the aggregator (`wiki/mod.rs` lines 280-350).**
- The PCGW outcome becomes `fetchStatus.pcgamingwiki`.
- `hltb::get(ctx, &game, pcgw_id)` takes PCGW's `howLongToBeatID`. For a GOG runner, though, hltb.rs `get` (around line 566) goes only to the gog.com store page (`get_gog`) and never uses that id. It has no title-search fallback either; hltb.rs's doc lists that as a D-03 parity point.
- So for the live GOG goldens, `howlongtobeat` stays null and `fetchStatus.howlongtobeat` stays `notfound`. That is out of scope here: the Resolution records it, and nothing is changed.
- The Steam id for ProtonDB/Deck comes from GamesDB first, which already has 1091500. Those requests do not change.

**Golden consumers.**
- `tests/golden_wiki.rs` `replay_case`:
  - It replays `recorded/wiki/<case>/exchanges.json` through `info_wiki_get` and compares the result to `expected/<case>/result.json` `ops[i].result` as JSON values.
  - It compares the requests made (the exchanges minus `tsOnly`) as a multiset. Per-host order is skipped when any `rustOnly` exchange exists, and both live GOG cases already have one.
  - `replay.finish()` fails on any unconsumed non-`tsOnly` exchange.
  - `assert_files` compares `expected/<case>/after/**`, byte for byte.
- `tests/golden_wiki_sources.rs`:
  - `every_run` reads `result.json` `requests` (exact order per host).
  - The PCGW test (`pcgamingwiki_matches_every_ts_golden_that_asked_it`, line 180) uses `Replay::for_hosts`. It also asserts that `ok`, `notfound` and `error` each occur at least once. `error` still occurs after this change, through `pcgw-403-is-error-not-notfound` and `stale-pcgw-error-status-refetches`.
  - Its comment at lines 208-209 names the permissiondenied answer as one of the failures, and becomes false.
  - The HLTB test there passes `result.pcgamingwiki.howLongToBeatID` to `hltb::get`. For GOG that id is ignored, so its requests do not change.
- `src-tauri/crates/gamelib-info-cli/src/drift.rs` test `a_recorded_service_that_matches_the_golden_passes_every_wiki_case` (around line 1090) replays `live-gog-mac` and `live-gog-linux` against their `result.json` and calls `replay.finish()`. It turns red too until the recordings are updated.
- `Replay` (`src/http.rs` `serve`, around line 578) matches a request by method, host+path and decoded query pairs. A request with no twin fails as `replay: unmatched request`, and the failure is sticky.

**Recordings.**
- `recorded/wiki/live-gog-linux` has exchanges ex-1..ex-10 and bodies body-1..body-10. Its ex-1 is the cargoquery, and its `body-1.json` (373 bytes) is the real permissiondenied body. ex-10 is `rustOnly`. There is no PCGW search or parse exchange.
- `recorded/wiki/live-gog-mac` has exchanges ex-1..ex-9 and bodies body-1..body-9 (body-8 is `.html`). Its ex-1 is the same permissiondenied answer, and ex-9 is `rustOnly`.
- `recorded/wiki/live-epic-linux` and `live-epic-mac` (same title "Cyberpunk 2077", recorded live the same day by the same recorder, with the same request headers) both have:
  - ex-1 = `GET https://www.pcgamingwiki.com/w/api.php?action=query&list=search&srsearch=Cyberpunk%202077&format=json`, with bodyFile `body-1.json`;
  - ex-3 = `GET https://www.pcgamingwiki.com/w/api.php?action=parse&format=json&pageid=97605&redirects=true&prop=wikitext`, with bodyFile `body-3.json`.
- The epic linux and mac copies of each body are byte-identical (`cmp` checked).
- These are exactly the two requests the fixed code makes for the GOG title, so the live GOG cases can take them offline. No live network is needed, and none may be used.

**No regen mechanism exists.**
- The 86-06 TS oracle that wrote `golden/wiki` and `recorded/wiki` was deleted in 86-24.
- `gamelib-info-cli` has only `op --replay` and `drift` (shape-only, live).
- Quick 261123-9os hand-edited its golden.
- Here the new expected values are not invented. They are copied from the TS-oracle-written `live-epic-<platform>` goldens, and the byte-for-byte after-state check then proves that the Rust writer agrees.

**Expected values today, and what the fix makes them.**
- `expected/live-gog-<p>/result.json`:
  - `ops[0].result` today has `pcgamingwiki: null` and `fetchStatus {pcgamingwiki: error, howlongtobeat: notfound}`.
  - `ops[0].requestsMade` is 9 (linux) / 8 (mac), equal to `requests` length.
  - After the fix only `pcgamingwiki` and `fetchStatus.pcgamingwiki` change in the result. `pcgamingwiki` becomes the object in `expected/live-epic-<p>/result.json` `ops[0].result.pcgamingwiki`; the cargo-empty synthetic case's object is equal to it too (checked).
- `expected/live-gog-<p>/after/store_cache/wikigameinfo.json` changes the same two values inside the `"Cyberpunk 2077"` entry. The value is taken from `expected/live-epic-<p>/after/store_cache/wikigameinfo.json`. Key order is the same in both files.
- `events.json` (`[]`), `umu.json` (linux) and `crossover_index.json` (mac) are untouched.

**Fixture formats.** Measured by a load-then-dump round trip that reproduced each file byte for byte:
- `exchanges.json`, `result.json`, `cases.json` and `MANIFEST.json`: Python `json.dumps(obj, indent=2, ensure_ascii=True)` plus one trailing `\n`.
- `after/store_cache/wikigameinfo.json`: `json.dumps(obj, indent="\t", ensure_ascii=True)` with NO trailing newline.
- Python dicts keep key order, so replacing a value keeps its position.

**Synthetic case model: `gog-pcgw-cargo-empty-falls-back-to-title-search-synthetic`** (the last entry of `cases.json`, index 39 of 40).
- Recorded dir: `body-1.json` (`{"cargoquery":[]}`), body-2..body-9 (body-8 is `.html`) and `exchanges.json`. Its ex-1 is flagged `"synthetic": true` with response headers `{"content-type": "application/json"}`.
- Expected dir: `result.json`, `events.json`, and `after/store_cache/wikigameinfo.json`.
- There is no `state/wiki/` dir for it.
- The fixed code gives a permissiondenied cargo answer exactly the same downstream flow and requests as an empty one. So a copy of that case with only body-1.json swapped for the real permissiondenied bytes has expected output byte-identical to it.
- No Rust code reads the `synthetic`/`fromRecorded` keys. They are documentation that the deleted recorder wrote.
- `MANIFEST.json` is `{"count": 40, "floor": 25}`. No test hard-codes 40, and the `WIKI_CASES_FLOOR` of 31 is a floor.

**Baselines at HEAD (measured).**
- `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info --test golden_wiki --test golden_wiki_sources --test wiki_source_edges`: 11 / 8 / 15 passed, about 39 s warm.
- The drift wiki replay test (`-p gamelib-info-cli a_recorded_service_that_matches_the_golden_passes_every_wiki_case`): 1 passed, about 65 s.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-info -- --check` exits 0.
- `git status` shows the gamelib-info and gamelib-info-cli crates clean.

**Formatter rule (gamelib-conventions).**
- `pcgw.rs`, `wiki_source_edges.rs` and `golden_wiki_sources.rs` report `{ "ignored": false, "inferredParser": null }` from `npx prettier --file-info`, and `npx prettier --check` on a `.rs` exits 2 ("No parser could be inferred"). Their formatter check is rustfmt.
- Every fixture path under `src-tauri/crates/gamelib-info/tests/fixtures` and every `.planning/` path reports `{ "ignored": true, "inferredParser": null }`, so a prettier check over them would be vacuous and is omitted.

**Working tree hygiene. Another session is live in this tree.**
- The tree has unrelated dirty and untracked files: `.planning/state.json`, spike logs, a stray `Schedule I Free Sample.dxvk-cache`, `src-tauri/crates/gamelib-humble/tests/fixtures/recorded/real/`, and others.
- The set is changing under concurrent work. During planning the dirty `gamelib-proc` files moved from `src/probe.rs` to `src/job.rs`, `src/kill_tree.rs` and `tests/orphans.rs`, a sign that phase 88.2 is executing in parallel.
- `gamelib-proc` is in `gamelib-info`'s test build graph, through the `gamelib-engine` dev-dependency (`cargo tree` checked). So a red build in a crate outside `gamelib-info` may be that session's work in progress. STOP and report such a failure, and do not fix, stash or revert anything outside this plan.
- `cargo` may print "Blocking waiting for file lock" while the other session builds. Wait for it; that is not a failure.
- Stage by explicit path only, with plain `git add <path>` / `git mv`. Never use `git add -A`, `git add .`, `git commit -a`, `git stash`, or the gsd-tools `commit` without `--files`; that last one sweeps every dirty `.planning` file.

**Other locations.**
- `.claude/worktrees/phase-94` and `.claude/worktrees/agent-*` hold copies of these fixtures and of the todo. Never touch them, and scope every grep to `src-tauri/crates/...` or `.planning/todos/...`, never the repo root.
- `graphify-out/` is untracked. Run `graphify update .` after the code change, and commit nothing from it.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Read a 2xx cargoquery answer without `cargoquery` as no GOG id, end to end through pcgw::get_info, pinned by a new edge test</name>
  <files>src-tauri/crates/gamelib-info/src/wiki/pcgw.rs, src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs, src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs</files>
  <read_first>src-tauri/crates/gamelib-info/src/wiki/pcgw.rs (whole file, 224 lines), src-tauri/crates/gamelib-info/src/js.rs (lines 70-102), src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs (lines 1-95 and 270-335), src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs (lines 200-215)</read_first>
  <behavior>
    - The live permissiondenied body (HTTP 200, an `error` object with `code` permissiondenied, `info` "You don't have permission to run arbitrary Cargo queries.", and no `cargoquery`), followed by a search hit `{query:{search:[{pageid:12}]}}` and that page's wikitext, gives outcome Ok. Exactly 3 URLs are requested, in the order cargoquery, then the URL containing `list=search`, then the one containing `pageid=12`. The run's diagnostic lines contain the fixed note, and no line contains the title or `://`.
    - The same with a cargo body of `{}` gives Ok with 3 URLs.
    - The same with `{"cargoquery": null}` gives Ok with 3 URLs.
    - The permissiondenied body followed by a zero-hit search `{query:{search:[]}}` gives outcome NotFound, not Error, with 2 URLs.
    - A cargoquery answered with status 403 (any body) is still Outcome::Error with exactly 1 URL; no title search is made.
    - The existing arms are unchanged and still pass: the cargoquery hit (2 URLs), the empty cargoquery array falling back (3 URLs), and the empty GOG id skipping the cargoquery.
  </behavior>
  <action>
In `src-tauri/crates/gamelib-info/src/wiki/pcgw.rs` `page_id`, GOG branch (lines 184-196):

1. Replace the strict read of `data.cargoquery[0]` with the optional-chained read `data?.cargoquery?.[0]?.title?.pageID`:
   - Read `cargoquery` with `opt_prop(Some(&data), "cargoquery")?`.
   - If that is `None`, or `Some` of a JSON null, there is no GOG id. Call `ctx.note` with the fixed text `pcgamingwiki gog id answer has no cargoquery, searching by title`, and continue to the title search below. Do not return.
   - Otherwise keep the existing `index(..., 0)?` and the `opt_prop` chain to `pageID`, and keep the `truthy` filter exactly as it is.
   - Update the inline comment above it to show the optional-chained JS form.
2. Leave these exactly as they are:
   - `get_data`, which still returns `Err` for non-2xx and transport failures, so those remain outcome `error` with no search (Claude's discretion, recorded in the doc below: a request that failed is not the same as an answer that says there is no id);
   - the cargoquery URL, the title search, `wiki_text`, `lookup` and `get_info`.
3. Module doc (lines 1-19):
   - In the departures paragraph (lines 5-12), say there are now two departures from the TS. Add the second one: a 2xx cargoquery answer with no `cargoquery` property is read as no GOG id and falls through to the title search. The live API's `permissiondenied` error object (HTTP 200) is that answer today. The TS threw on it, so every GOG title was `error` and re-fetched on every visit. Cite todo `2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup`. State that a non-2xx status or a transport failure of the cargo query is still `error`.
   - In "Parity points copied, not fixed (D-03)", delete the second bullet, the one about the GOG-id cargoquery's permissiondenied answer. Amend the first bullet so its "an answer without the property the code reads" clause excepts the cargoquery answer covered above.
   - Keep the third bullet (the empty `direct3d versions`/`genres` list) as it is.

In `src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs`:

4. In `pcgamingwiki_uses_the_gog_id_first_and_falls_back_to_the_title_search` (line 275), delete the arm that answers the cargoquery with the permissiondenied error object and asserts `Outcome::Error` and 1 URL, together with its comment line. Keep the hit, empty and empty-GOG-id arms untouched.
5. Add a new `#[tokio::test]` named `pcgamingwiki_reads_a_cargoquery_answer_without_cargoquery_as_no_gog_id`, placed directly after that test. It implements every bullet of `<behavior>`:
   - Use the file's `run(rules)` / `ok(json!(...))` / `urls(&run)` helpers and the `Routed` first-match-by-substring rules.
   - The cargo rule needle is `action=cargoquery`; the others are `list=search` and `pageid=12`. Note that the cargo URL's `pageID%3D` does not match `pageid=12`, because the match is case-sensitive.
   - Build the page answer like the existing `page` value (`{parse:{wikitext:{"*": "|steam appid  = 7\n"}}}`).
   - For the 403 arm, use `Ok((403, String::from("{}")))` as the Answer.
   - Use title `Cyberpunk 2077` and GOG id `Some("1423049311")`.
   - Assert the note line through `run.lines.0.lock()` contents, plus the no-title and no-`://` rule.
6. Extend the module doc's exception clause (lines 3-5) to name this second departure from the TS (the cargoquery answer without `cargoquery`, same todo id).

In `src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs`:

7. Lines 208-209: reword the comment so the failures it names are only the two recorded 403s, `pcgw-403-is-error-not-notfound` and `stale-pcgw-error-status-refetches`. The live GOG cases are no longer failures. Do not change the assertion.

Do NOT commit in this task. With only this task applied, golden_wiki, golden_wiki_sources and the gamelib-info-cli drift test are red on the live GOG cases: the fixed code now makes the PCGW search, which those recordings do not hold. Task 2 adds those exchanges, and the fix commit is made there, so no commit is ever red.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info --test wiki_source_edges   # 16 passed [HEAD=15 EXPECT==16]</automated>
    <automated>cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-info -- --check</automated>
    <automated>test "$(grep -cF 'so reading it throws' src-tauri/crates/gamelib-info/src/wiki/pcgw.rs)" -eq 0   # deliberate doc-text gate on the removed D-03 bullet [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(grep -cF 'opt_prop(Some(&data), "cargoquery")' src-tauri/crates/gamelib-info/src/wiki/pcgw.rs)" -eq 1   # [HEAD=0 EXPECT==1]</automated>
    <automated>test "$(grep -cF 'Reading it throws' src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs)" -eq 0   # deliberate doc-text gate on the deleted arm's comment [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(grep -cF 'fn pcgamingwiki_reads_a_cargoquery_answer_without_cargoquery_as_no_gog_id' src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs)" -eq 1   # [HEAD=0 EXPECT==1]</automated>
    <automated>test "$(grep -cF 'and the live GOG-id' src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs)" -eq 0   # deliberate doc-text gate on the stale comment [HEAD=1 EXPECT==0]</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info --test golden_wiki 2>&1 | grep -q 'live-gog-'   # expected-red probe: the live GOG recordings lack the PCGW search; this greps the failure text, not a pass</automated>
    Formatter: prettier has no parser for `.rs`. `--file-info` reports `ignored: false, inferredParser: null` for all three files, and `--check` exits 2. The rustfmt check above is the formatter check for this task's files.
  </verify>
  <done>`pcgw.rs` reads `cargoquery` with optional chaining. A 2xx answer without it notes one fixed line and searches by title; a non-2xx or transport failure is still `error`. The module doc records the second departure, and the throw bullet is gone. `wiki_source_edges` passes with 16 tests: the permissiondenied, `{}` and null-cargoquery arms fall through, a zero-hit search is notfound, and a 403 cargoquery stays error. The golden_wiki_sources comment no longer names the permissiondenied answer as a failure. rustfmt is clean. `golden_wiki` fails naming a live GOG case, which is the input to Task 2. Nothing is committed yet.</done>
</task>

<task type="auto">
  <name>Task 2: Add the PCGW search and parse to the live GOG recordings from the Epic recordings, update their expected result and after-state, and commit the fix</name>
  <files>src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/exchanges.json, src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/body-11.json, src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/body-12.json, src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/exchanges.json, src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/body-10.json, src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/body-11.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/result.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/after/store_cache/wikigameinfo.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-mac/result.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-mac/after/store_cache/wikigameinfo.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/cases.json</files>
  <read_first>src-tauri/crates/gamelib-info/tests/golden_wiki.rs (lines 76-207), src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs (lines 76-120 and 393-421), src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-linux/result.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-mac/after/store_cache/wikigameinfo.json</read_first>
  <precondition>Task 1 is applied: `cargo test ... --test wiki_source_edges` passes with 16 tests, and `golden_wiki` fails naming a live GOG case.</precondition>
  <action>
Do all fixture writes with ONE scratch Python script, saved in the session scratchpad (never in the repo) and run with `python3 -I <script>` from the checkout root. Do not hand-edit these JSON files. The script does the following for each platform `p` in (linux, mac), with `G` = `live-gog-<p>` and `E` = `live-epic-<p>`, under `src-tauri/crates/gamelib-info/tests/fixtures`.

0. Round-trip guard. Before writing anything, load each target JSON file and re-dump it in its measured format (from `<context>`); the re-dump must equal the file's current bytes. Abort with an error if any file fails. Targets: `G`'s `exchanges.json`, `result.json` and `after/store_cache/wikigameinfo.json`, plus `golden/wiki/cases.json`.

1. Recorded exchanges for `recorded/wiki/<G>`:
   - From `recorded/wiki/<E>/exchanges.json`, take the exchange whose `request.url` equals the PCGW search URL (`...action=query&list=search&srsearch=Cyberpunk%202077&format=json`) and the one equal to the PCGW parse URL (`...action=parse&format=json&pageid=97605&redirects=true&prop=wikitext`). Assert exactly one of each, with ids ex-1 and ex-3.
   - Deep-copy both. Change only `id` and `response.bodyFile`; add no flags (no `rustOnly`, no `tsOnly`, no new keys).
     - linux: the search becomes `ex-11` with `body-11.json`, the parse `ex-12` with `body-12.json`.
     - mac: the search becomes `ex-10` with `body-10.json`, the parse `ex-11` with `body-11.json`.
   - Append both to the end of `G`'s exchange list, search first.
   - Assert that the new body filenames do not already exist.
   - Copy the bodies byte for byte with `shutil.copyfile`: `<E>/body-1.json` to the search body, `<E>/body-3.json` to the parse body.
   - Dump `exchanges.json` in its format.
2. `golden/wiki/expected/<G>/result.json`:
   - In `requests`, insert `GET <search url>` and then `GET <parse url>` directly after the line `GET https://gamesdb.gog.com/platforms/gog/external_releases/1423049311`. The PCGW per-host order becomes cargoquery, search, parse, which `golden_wiki_sources` checks exactly.
   - Set `ops[0].requestsMade` to the new `requests` length: linux 9 becomes 11, mac 8 becomes 10.
   - Set `ops[0].result.pcgamingwiki` to `expected/<E>/result.json` `ops[0].result.pcgamingwiki`.
   - Set `ops[0].result.fetchStatus.pcgamingwiki` to `ok`.
   - Assert that `ops[0].result.howlongtobeat` is still null and `fetchStatus.howlongtobeat` is still `notfound`. Change nothing else, and dump in its format.
3. `golden/wiki/expected/<G>/after/store_cache/wikigameinfo.json`:
   - In the `Cyberpunk 2077` entry, set `pcgamingwiki` to the `Cyberpunk 2077` entry's `pcgamingwiki` of `expected/<E>/after/store_cache/wikigameinfo.json`.
   - Set `fetchStatus.pcgamingwiki` to `ok`.
   - Leave the `__internal__` and `__timestamp` keys and every other value untouched. Dump with tab indent and no trailing newline.
4. `golden/wiki/cases.json`: append one sentence to the `note` of the case with id `<G>`, and change nothing else:
   - The sentence: "The GOG-id cargoquery answers permissiondenied (live); since quick 261127-vna that is read as no GOG id and the PCGamingWiki title search and page read follow, their two exchanges (<new ids>) copied byte for byte from <E> ex-1 and ex-3, the same two requests recorded the same day."
   - Substitute the real new ids and the case name for `<new ids>` and `<E>`.
   - Dump in its format.

Then:

5. Run the three golden and edge targets and the drift test (the `<verify>` commands below). All must pass.
   - If `golden_wiki` reports a byte mismatch on an after-state file, do not guess. Add a temporary local debug print of the written bytes in the test, compare, fix the expected file only if the sole difference is one of the two values set in step 3, then remove the print.
   - Never change `pcgw.rs` logic to fit a fixture. If the Rust result differs from the Epic-derived value, STOP and report it.
6. Commit the fix:
   - `git add` exactly these paths: the three `.rs` files from Task 1, the six recorded paths and four expected paths in this task's `<files>`, and `cases.json`.
   - `git diff --cached --name-status` must list exactly those 14 paths: `A` for the four new body files, `M` for the rest.
   - Subject: `fix(info): read a PCGamingWiki cargoquery answer without cargoquery as no GOG id`.
   - Body:
     - PCGamingWiki answers the GOG-id cargoquery with HTTP 200 and a permissiondenied error object. The port copied the TS throw on the missing `cargoquery` (D-03), so every GOG title's lookup was `error` and re-fetched on each visit.
     - A 2xx answer without `cargoquery` is now no GOG id, and the lookup falls through to the title search. A failed request is still `error`. The TS is gone (86-24, `fcf981590`).
     - The live GOG goldens take the search and parse exchanges from the same-day live Epic recordings of the same title, with no network. `pcgamingwiki` and its outcome come from the Epic goldens the TS oracle wrote. GOG HowLongToBeat still reads only the gog.com page, so it stays notfound.
   - End the message with the session's attribution lines from the system-reminder.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info --test golden_wiki --test golden_wiki_sources --test wiki_source_edges   # 11 / 8 / 16 passed</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info-cli a_recorded_service_that_matches_the_golden_passes_every_wiki_case 2>&1 | grep -q 'a_recorded_service_that_matches_the_golden_passes_every_wiki_case ... ok'   # [HEAD: ok; red after Task 1 alone; EXPECT: ok]</automated>
    <automated>R=src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki && cmp $R/live-gog-linux/body-11.json $R/live-epic-linux/body-1.json && cmp $R/live-gog-linux/body-12.json $R/live-epic-linux/body-3.json && cmp $R/live-gog-mac/body-10.json $R/live-epic-mac/body-1.json && cmp $R/live-gog-mac/body-11.json $R/live-epic-mac/body-3.json   # [HEAD: the four gog body files absent]</automated>
    <automated>X=src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected && for p in linux mac; do test "$(grep -cF '"pcgamingwiki": "error"' $X/live-gog-$p/result.json)" -eq 0 && test "$(grep -cF '"pcgamingwiki": "error"' $X/live-gog-$p/after/store_cache/wikigameinfo.json)" -eq 0 && test "$(grep -cF '"pcgamingwiki": "ok"' $X/live-gog-$p/result.json)" -eq 1 || exit 1; done   # per file, the error count [HEAD=1 EXPECT==0] and the ok count in result.json [HEAD=0 EXPECT==1]</automated>
    <automated>python3 -I -c 'import json,sys;X="src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/";L=lambda c:json.load(open(X+c+"/result.json"));sys.exit(0 if all(L("live-gog-"+p)["ops"][0]["result"]["pcgamingwiki"]==L("live-epic-"+p)["ops"][0]["result"]["pcgamingwiki"] and L("live-gog-"+p)["ops"][0]["result"]["fetchStatus"]=={"pcgamingwiki":"ok","howlongtobeat":"notfound"} and L("live-gog-"+p)["ops"][0]["result"]["howlongtobeat"] is None and L("live-gog-"+p)["ops"][0]["requestsMade"]==len(L("live-gog-"+p)["requests"]) for p in ("linux","mac")) else 1)'   # GOG pcgamingwiki equals the TS-oracle Epic object; HLTB unchanged; requestsMade consistent [HEAD: exit 1]</automated>
    <automated>for p in linux mac; do test "$(grep -cF 'GET https://www.pcgamingwiki.com/w/api.php?action=query&list=search&srsearch=Cyberpunk%202077&format=json' src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/live-gog-$p/result.json)" -eq 1 && test "$(grep -cF 'https://www.pcgamingwiki.com/w/api.php?action=parse&format=json&pageid=97605' src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-$p/exchanges.json)" -eq 1 || exit 1; done   # per platform, each count [HEAD=0 EXPECT==1]</automated>
    <automated>FIX=$(git log -1 --format=%H --fixed-strings --grep='fix(info): read a PCGamingWiki cargoquery answer without cargoquery as no GOG id') && test -n "$FIX" && names=$(git show --name-only --format= "$FIX") && test "$(printf '%s\n' "$names" | wc -l | tr -d ' ')" -eq 14 && test "$(printf '%s\n' "$names" | grep -vcE '^src-tauri/crates/gamelib-info/(src/wiki/pcgw\.rs|tests/(wiki_source_edges|golden_wiki_sources)\.rs|tests/fixtures/golden/wiki/cases\.json|tests/fixtures/(recorded/wiki|golden/wiki/expected)/live-gog-(linux|mac)/)')" -eq 0   # the fix commit (resolved by subject, not HEAD) holds exactly the 14 intended paths</automated>
    Formatter: every path this task writes is a fixture under `src-tauri/crates/gamelib-info/tests/fixtures`, which is prettier-ignored (`--file-info` reports `ignored: true`; `.prettierignore` line 50), so `prettier --check` would be vacuous and is omitted. Consistency is kept by the round-trip guard in step 0. It proves the dump format reproduces each untouched file byte for byte, and `golden_wiki`'s byte compare then checks the after-state against the Rust writer.
  </verify>
  <done>Both live GOG recordings hold the PCGW search and parse as byte copies of the Epic exchanges. Their expected result has `pcgamingwiki` equal to the Epic object, `fetchStatus.pcgamingwiki` ok, HLTB still notfound, `requests` including the two PCGW lines in per-host order, and `requestsMade` 11 (linux) / 10 (mac). The after-state wiki caches match the Rust writer byte for byte. The cases.json notes record the provenance. golden_wiki (11), golden_wiki_sources (8), wiki_source_edges (16) and the drift wiki replay test all pass. The fix commit contains exactly the 14 intended paths.</done>
</task>

<task type="auto">
  <name>Task 3: Add the permissiondenied synthetic golden case, run the full gate, refresh the graph, and close the todo</name>
  <files>src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/{exchanges.json, body-1.json, body-2.json, body-3.json, body-4.json, body-5.json, body-6.json, body-7.json, body-8.html, body-9.json}, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/{result.json, events.json, after/store_cache/wikigameinfo.json}, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/cases.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/MANIFEST.json, .planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md, .planning/todos/completed/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md</files>
  <read_first>src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-empty-falls-back-to-title-search-synthetic/exchanges.json (ex-1 only), .planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md, .planning/todos/completed/2026-11-23-pcgw-search-term-not-url-encoded.md (its `## Resolution` section, as the shape model)</read_first>
  <action>
Let `S` = `gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic` and `C` = `gog-pcgw-cargo-empty-falls-back-to-title-search-synthetic`, under `src-tauri/crates/gamelib-info/tests/fixtures`.

1. Create the synthetic case with one scratch Python script (scratchpad, `python3 -I`, run from the checkout root).
   - Assert that neither `recorded/wiki/<S>` nor `golden/wiki/expected/<S>` exists yet.
   - Copy the whole `recorded/wiki/<C>` directory to `recorded/wiki/<S>` (`shutil.copytree`, all 10 files byte for byte). Then overwrite `recorded/wiki/<S>/body-1.json` with a byte copy of `recorded/wiki/live-gog-linux/body-1.json`, the real 373-byte live permissiondenied answer.
   - Leave `exchanges.json` as copied. ex-1 keeps `"synthetic": true` and its `content-type: application/json` header, and its URL is the same cargoquery URL.
   - Copy the whole `golden/wiki/expected/<C>` directory to `golden/wiki/expected/<S>` unchanged. The fixed code gives the permissiondenied answer the same requests, result, events and after-state as an empty cargoquery.
   - Do not create a `state/wiki/<S>` directory; `<C>` has none.
   - Run the round-trip guard from Task 2 step 0 on `cases.json` and `MANIFEST.json`.
   - In `golden/wiki/cases.json`, append one new object at the end of the list (after `<C>`, currently the last entry), with keys in this order:
     - `id` = `<S>`;
     - `note` = "The GOG-id PCGamingWiki lookup answers HTTP 200 with the live permissiondenied error object and no cargoquery (the real body of live-gog-linux ex-1). It is read as no GOG id and falls through to the title search, then the page text is parsed (the recorded Cyberpunk search and page bodies). Pins the fallthrough whatever the live API answers. Added by quick 261127-vna; expected output identical to the cargo-empty case. D-23 exchanges as above.";
     - `platform` = `windows`;
     - `ops` = a deep copy of `<C>`'s `ops`;
     - `synthetic` = three objects, each with `method` `GET` and `path` `/w/api.php`, carrying `fromRecorded` `{case: live-gog-linux, file: body-1.json}`, then `{case: live-epic-linux, file: body-1.json}`, then `{case: live-epic-linux, file: body-3.json}`.
   - In `golden/wiki/MANIFEST.json`, set `count` to 41 and leave `floor` at 25.
   - Dump both files in their format.
2. Run the full crate suite, `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info`, which must be all green; record the per-target counts. Then run the drift wiki replay test again.
3. Commit the test:
   - `git add` the two new directories plus `cases.json` and `MANIFEST.json`.
   - `git diff --cached --name-status` must list exactly 15 paths: 13 `A` (10 recorded, 3 expected) and 2 `M`.
   - Subject: `test(info): pin the PCGamingWiki cargoquery permissiondenied fallthrough with a synthetic GOG golden`.
   - The body says why: the live GOG goldens pin it only while the live API keeps refusing.
   - End with the session's attribution lines.
4. Run `graphify update .` from the checkout root, per CLAUDE.md. `graphify-out/` is untracked; stage nothing from it.
5. Close the todo:
   - Run `git mv .planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md .planning/todos/completed/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md`.
   - Append a `## Resolution` section in the shape of the 261123-9os todo, prose wrapped to the file's ~100-column width. Leave the frontmatter unchanged; `completed/` is exempt from the triage gate. The section says:
     - The fix date is 2026-11-27.
     - The TS half has no target, because `src/backend/wiki_game_info/` was deleted in 86-24 (`fcf981590`).
     - What `pcgw.rs` `page_id` now does: a 2xx cargoquery answer without `cargoquery` is no GOG id, so the lookup falls through to the title search and a fixed-text note is logged. A failed request is still `error`. The cargo query is kept, so GOG-id lookups resume if the permission returns.
     - The two live GOG goldens took the PCGW search and parse exchanges, offline, from the same-day `live-epic-*` recordings. Their `pcgamingwiki` object came from the TS-oracle Epic goldens, and fetchStatus.pcgamingwiki is now `ok`.
     - The new synthetic case `<S>` pins the fallthrough; the MANIFEST count is now 41.
     - GOG `howlongtobeat` stays `notfound`. `hltb::get`'s GOG branch reads only the gog.com store page and never uses PCGamingWiki's `howLongToBeatID` (a D-03 parity point listed in `hltb.rs`). So "no HowLongToBeat id" from the Problem section is not changed by this fix. A follow-up todo is warranted only if GOG titles should use that id.
     - The short hashes of the fix and test commits, and the full-suite counts.
6. Commit the docs:
   - Stage the rename.
   - `git diff --cached --name-status` must show only the one `R` row.
   - Subject: `docs(todo): close the PCGW cargoquery permissiondenied todo`, ending with the session's attribution lines.
   - Do not use the gsd-tools `commit` without `--files`.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info-cli a_recorded_service_that_matches_the_golden_passes_every_wiki_case 2>&1 | grep -q 'a_recorded_service_that_matches_the_golden_passes_every_wiki_case ... ok'</automated>
    <automated>cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-info -- --check</automated>
    <automated>F=src-tauri/crates/gamelib-info/tests/fixtures && S=gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic && C=gog-pcgw-cargo-empty-falls-back-to-title-search-synthetic && test "$(diff -rq $F/recorded/wiki/$C $F/recorded/wiki/$S | wc -l | tr -d ' ')" -eq 1 && diff -rq $F/recorded/wiki/$C $F/recorded/wiki/$S | grep -q 'body-1.json' && cmp $F/recorded/wiki/$S/body-1.json $F/recorded/wiki/live-gog-linux/body-1.json && diff -r $F/golden/wiki/expected/$C $F/golden/wiki/expected/$S   # [HEAD: S dirs absent]</automated>
    <automated>W=src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki && test "$(grep -cF '"id": "gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic"' $W/cases.json)" -eq 1 && python3 -I -c 'import json,sys;W="src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/";m=json.load(open(W+"MANIFEST.json"));c=json.load(open(W+"cases.json"));sys.exit(0 if m=={"count":41,"floor":25} and len(c)==41 else 1)'   # [HEAD: id count 0, count 40 EXPECT: 1, 41]</automated>
    <automated>T=$(git log -1 --format=%H --fixed-strings --grep='test(info): pin the PCGamingWiki cargoquery permissiondenied fallthrough') && test -n "$T" && names=$(git show --name-only --format= "$T") && test "$(printf '%s\n' "$names" | wc -l | tr -d ' ')" -eq 15 && test "$(printf '%s\n' "$names" | grep -vcE '^src-tauri/crates/gamelib-info/tests/fixtures/(golden/wiki/(MANIFEST|cases)\.json|(recorded/wiki|golden/wiki/expected)/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/)')" -eq 0   # the test commit holds exactly its 15 paths</automated>
    <automated>test ! -e .planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md && test "$(grep -c '^## Resolution' .planning/todos/completed/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md)" -eq 1   # [HEAD: pending present, completed absent EXPECT: moved, 1 Resolution heading]</automated>
    <automated>DOCS=$(git log -1 --format=%H --fixed-strings --grep='docs(todo): close the PCGW cargoquery permissiondenied todo') && test -n "$DOCS" && st=$(git show --name-status --format= -M "$DOCS") && test "$(printf '%s\n' "$st" | wc -l | tr -d ' ')" -eq 1 && printf '%s\n' "$st" | grep -qE '^R[0-9]*[[:space:]]+\.planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup\.md[[:space:]]+\.planning/todos/completed/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup\.md$'   # the docs commit is exactly the one rename</automated>
    Formatter: every path this task writes is either a fixture under `src-tauri/crates/gamelib-info/tests/fixtures` or a `.planning/` path, and both are prettier-ignored (`--file-info` reports `ignored: true`), so `prettier --check` is omitted. The round-trip guard keeps `cases.json` and `MANIFEST.json` in their corpus format. The resolution note is hand-matched to the todo corpus's wrap.
  </verify>
  <done>The synthetic case exists. Its recorded directory differs from the cargo-empty case's only in the real permissiondenied body-1.json, its expected directory is identical to that case's, and cases.json and MANIFEST both count 41. The full `gamelib-info` suite and the drift wiki replay test pass, and rustfmt is clean. The graph is refreshed and uncommitted. The todo is in `completed/` with a Resolution section naming both commits and the GOG HLTB caveat. The test commit holds exactly its 15 paths, and the docs commit is exactly the one rename. The pre-existing dirty files are untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| PCGamingWiki API answer → page id | a third-party 2xx body decides whether a GOG id lookup counts as answered |
| copied recorded exchanges → committed fixtures | response bodies and headers from another case become this case's test oracle |
| diagnostic note → gamelib.log | a new log line on every GOG lookup that falls through |
| dirty working tree → git history | unrelated in-progress edits sit beside this task's files |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-vna-01 | Tampering | pcgw.rs page_id cargoquery read | low | mitigate | Only the absence (or null) of `cargoquery` in a 2xx answer counts as no id. The page id read from a present answer keeps its `truthy` filter, and `wiki_text`'s `is_numeric_id` gate (WR-03) still keeps a non-digit id out of the parse URL. A non-2xx answer or a transport failure is still `error`. All of this is pinned by the new edge test (Task 1). |
| T-vna-02 | Information disclosure | the new `ctx.note` line | low | mitigate | The note is fixed text with no title, id or URL. The new edge test and `golden_wiki_sources`' check (no `://`, no title in any line) enforce that (Task 1). |
| T-vna-03 | Information disclosure | copied exchanges in live-gog-* | low | mitigate | The copied exchanges are already committed in live-epic-*. Their request headers are only `accept` and the GameLib `user-agent`, so no cookie or credential is copied. No live request is made (Task 2). |
| T-vna-04 | Tampering | golden oracle derived from code under test | medium | mitigate | No expected value is generated by the code under test. `pcgamingwiki` and its outcome are copied from the TS-oracle-written live-epic goldens, and the synthetic case's expected output is a byte copy of the cargo-empty case's. `golden_wiki`'s byte compare then checks the Rust writer against those values. A difference stops the run instead of being written into a fixture (Task 2 step 5). |
| T-vna-05 | Repudiation | commits on a dirty tree | medium | mitigate | Staging is by explicit path only, and `git diff --cached --name-status` is checked before each commit. Verify gates assert each commit's exact path count and allowed prefixes, and that the docs commit is the single rename. Those per-commit gates are what prove no foreign path rode along, including files a concurrent session is editing. The gsd-tools `commit` without `--files` is not used. |
| T-vna-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed or added. The fix uses in-crate helpers (`crate::js::opt_prop`), and the scratch scripts use only the Python standard library run with `-I`, so there is no package-legitimacy surface. |
</threat_model>

<verification>
- `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info` is all green, including golden_wiki (11), golden_wiki_sources (8) and wiki_source_edges (16).
- `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-info-cli a_recorded_service_that_matches_the_golden_passes_every_wiki_case` passes.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-info -- --check` exits 0.
- No expected file of either live GOG case still holds an error outcome for PCGamingWiki, and both hold the Epic-derived `pcgamingwiki` object.
- The fix, test and docs commits are each resolved by subject rather than by `HEAD`. They hold 14 paths, 15 paths and 1 rename, and nothing else.
</verification>

<success_criteria>
- A GOG title whose GOG-id cargoquery answers permissiondenied gets its PCGamingWiki data from the title search. Its outcome is `ok` (or `notfound`), never `error`, so the wiki cache no longer re-fetches it on every visit.
- The live GOG goldens and a new synthetic golden pin the fallthrough, with expected values taken from TS-oracle goldens and no live network used. Every other golden is unchanged and passes.
- The todo is closed with a resolution note that records the GOG HowLongToBeat caveat. Each of the three commits carries only its own paths.
</success_criteria>

<output>
Create `.planning/quick/261127-vna-treat-a-pcgamingwiki-cargoquery-error-bo/261127-vna-SUMMARY.md` when done
</output>
