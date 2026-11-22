---
phase: quick-261123-9os
plan: 01
subsystem: gamelib-info (PCGamingWiki source)
tags: [rust, url-encoding, pcgamingwiki, golden-fixtures]
status: complete
requires: []
provides:
  - PCGamingWiki title search encodes the whole srsearch term (encodeURIComponent semantics)
affects:
  - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
tech-stack:
  added: []
  patterns: [crate::js::encode_uri_component shared with agw.rs]
key-files:
  modified:
    - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
    - src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/stale-crossover-miss-now-covered-refetches/exchanges.json
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/stale-crossover-miss-now-covered-refetches/result.json
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/stale-crossover-miss-now-covered-refetches/after/store_cache/wikigameinfo.json
  created:
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/stale-crossover-miss-now-covered-refetches/body-1.json
  deleted:
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/stale-crossover-miss-now-covered-refetches/body-1.html
    - .planning/todos/pending/2026-11-23-pcgw-search-term-not-url-encoded.md (moved to completed/)
decisions:
  - "Rust only: the TS half was deleted in 86-24 (fcf981590), so the D-03 parity reason is gone."
commits: 2
plan_head_before: 46dd85cc9fb8acdc842bcd551d2d64c9187f56c6
plan_head_after: f70409a98443586c1faebb42562ab2d836f6cd82
actuals:
  tokens: 12000
  tasks: 3
  commits: 2
metrics:
  completed: 2026-11-23
---

# Phase quick-261123-9os Plan 01: PCGW search term URL-encoding Summary

`pcgw::page_id` now builds the PCGamingWiki title search with `encode_uri_component(title)` (after the ` -` to `:` replacement), so `#`, `&`, `=` and `;` in a title stay inside the `srsearch` term instead of truncating or splitting the URL.

## What was done

- **Task 1 (tracer):** `pcgw.rs` imports and uses `encode_uri_component`; module doc reworded (full encoding, TS deleted in 86-24). `wiki_source_edges.rs`: renamed the URL test to `pcgamingwiki_builds_its_urls_and_sends_the_gamelib_user_agent`, Anno expectation now `Anno%201602%3A%20Konigs%20-%20Edition%20%26%20More`, new test `pcgamingwiki_keeps_hash_equals_and_semicolon_inside_the_search_term` pins `Fez%20%231` and `Rock%3DPaper%3B%20Scissors`.
- **Task 2:** Precondition checked live (HTTP 200, `{"batchcomplete":"","query":{"searchinfo":{"totalhits":0},"search":[]}}`, 71 bytes, response date Sun, 22 Nov 2026 18:11:01 GMT). Re-recorded the `#KILLALLZOMBIES` golden by hand: ex-1 now has the encoded URL, live JSON headers, `bodyFile: body-1.json` (raw live bytes); `body-1.html` removed. `result.json` has the encoded request and `fetchStatus.pcgamingwiki: notfound`; the after-state cache flipped only that value (tabs and missing trailing newline preserved). Fix commit `aacc9c11f`.
- **Task 3:** Full `cargo test -p gamelib-info` green; `graphify update .` run (graphify-out untracked, nothing staged); todo moved to `completed/` with a Resolution section. Docs commit `f70409a98`.

## Verification

- `golden_wiki` 11, `golden_wiki_sources` 8, `wiki_source_edges` 13 passed; whole crate green (lib 129 plus all integration targets).
- `cargo fmt -p gamelib-info -- --check` clean.
- No fixture holds `srsearch=#`; two fixtures hold the encoded `%23KILLALLZOMBIES` URL.
- Fix commit holds exactly 7 paths (body-1.html as D); docs commit is exactly the one rename.

## Deviations from Plan

None - plan executed as written. Note for the orchestrator: a `git checkout -- exchanges.json` I used to redo a botched first scripted edit triggered the repo's husky/pnpm post-checkout hook (a pnpm install ran, "Packages: -168" in its output); no tracked files outside the plan changed.

## Commits

- `aacc9c11f` fix(info): URL-encode the PCGamingWiki search term
- `f70409a98` docs(todo): close the PCGW search term encoding todo

## Known Stubs

None.

## Self-Check: PASSED
