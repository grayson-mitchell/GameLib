---
created: 2026-11-23T05:30:00.000Z
title: "PCGamingWiki title search: the term is not URL-encoded, only its spaces are"
area: info
files:
  - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs (page_id: `title.replace(' ', "%20")`)
  - src/backend/wiki_game_info/pcgamingwiki/utils.ts (getPageID: `title.replaceAll(' ', '%20')`)
severity: minor
platform: any
ready: code
---

## Problem

`getPageID` builds the search URL as `...&srsearch=${title.replaceAll(' ', '%20')}&format=json`. Only the spaces
are encoded. The caller has already run the title through `removeSpecialcharacters`, which deletes `: | / * ? < > \
& { } % $ @ ` ! + ' "` and the trademark signs, but it leaves `#`, `=`, `;`, `[`, `]`, `^` and `,` in place. A
title with a `#` (`Fez #1`, `Hotline Miami #2`) turns the rest of the URL into a fragment, so PCGamingWiki is asked
for `srsearch=Fez` with the `&format=json` dropped, and the answer is not JSON: the lookup ends as outcome `error`
and the wiki cache re-fetches it on every visit. An `=` or `;` in a title can add or split a query parameter in the
same way. The AppleGamingWiki lookup does this correctly (`encodeURIComponent`).

Phase 86 (86-20, D-03) copied the construction exactly into `gamelib-info` `wiki::pcgw`, because the 86-06 goldens
pin the request (`srsearch=Elden%20Ring`, and `Anno%201602:%20...` for a ` -` title).

## Why it is parked

It touches only titles with one of those few characters, the effect is a missing Extra info tab (never a wrong
one), and encoding the term changes the request for every title containing `:`, which the goldens pin as a literal
colon.

## If it ever matters

Encode the term with `encodeURIComponent` after the ` -` to `:` replacement, re-record the PCGamingWiki goldens
(a colon becomes `%3A`), and make the same change in both the TS and the Rust source in one commit.

## Resolution

Fixed 2026-11-23 (fix commit `aacc9c11f`). The TS half has no target: `src/backend/wiki_game_info/pcgamingwiki/utils.ts`
was deleted in 86-24 (`fcf981590`), so the "same change in the TS and the Rust" step does not apply, and the D-03 parity
reason for encoding only spaces is gone. In `src-tauri/crates/gamelib-info/src/wiki/pcgw.rs`, `page_id` now builds
`srsearch` with `encode_uri_component(title)` after the ` -` to `:` replacement, as `agw.rs` does, and the module doc is
reworded. The edge test now expects `Anno%201602%3A%20Konigs%20-%20Edition%20%26%20More`, and the new test
`pcgamingwiki_keeps_hash_equals_and_semicolon_inside_the_search_term` pins `Fez%20%231` and
`Rock%3DPaper%3B%20Scissors`. The `#KILLALLZOMBIES` golden (`stale-crossover-miss-now-covered-refetches`) was
re-recorded from a live request (response `date` Sun, 22 Nov 2026 18:11:01 GMT). It is now a zero-hit JSON answer, so
the outcome went from `error` to `notfound`, `requestsMade` is unchanged at 3, and `body-1.html` was replaced by
`body-1.json`. That was the only PCGW golden whose term changed under encoding. `cargo test -p gamelib-info`: all green
(`golden_wiki` 11, `golden_wiki_sources` 8, `wiki_source_edges` 13).
