---
created: 2026-11-22
title: PCGamingWiki cargoquery now answers permissiondenied, so every GOG title's wiki lookup errors
area: wiki_game_info
files:
  - src/backend/wiki_game_info/pcgamingwiki/utils.ts
severity: medium
platform: any
ready: code
---

## Problem

Recorded live during 86-06 (`recorded/wiki/live-gog-linux`, ex-1): the GOG-id lookup in `getPageID`
(`action=cargoquery ... GOGcom_ID HOLDS <id>`) now returns HTTP 200 with
`{"error":{"code":"permissiondenied","info":"You don't have permission to run arbitrary Cargo queries."}}`.
`data.cargoquery[0]` throws on the missing key, so `getInfoFromPCGamingWiki` returns outcome `error`
for every GOG title. `staleWikiFetch` treats `error` as stale, so each GOG details-page visit
refetches, and GOG titles never get PCGamingWiki data or a HowLongToBeat id from it.

The golden `live-gog-linux` pins this behaviour (fetchStatus.pcgamingwiki is `error`); the two
synthetic GOG cases (`gog-pcgw-cargo-*`) pin the paths that work when the API answers normally.

## Fix direction

Skip the cargo query (or treat an `error` body as "no id") and fall through to the title search.
This changes TS and, once ported, Rust output: re-record the goldens at that time. The Rust port in
86 must reproduce the current behaviour until then.

## Resolution

Fixed 2026-11-27 (fix commit `bae1378bb`, test commit `74516d3de`). The TS half has no target:
`src/backend/wiki_game_info/` was deleted in 86-24 (`fcf981590`), so the "same change in the TS and the Rust" step does
not apply. In `src-tauri/crates/gamelib-info/src/wiki/pcgw.rs`, `page_id` now reads the GOG-id cargoquery answer as
`data?.cargoquery?.[0]?.title?.pageID`: a 2xx answer without `cargoquery` (the live `permissiondenied` error object,
`{}`, or a null `cargoquery`) is no GOG id, so the lookup falls through to the title search and one fixed-text note is
logged, with no title and no URL in it. A non-2xx status or a transport failure of the cargo query is still outcome
`error`. The cargo query is kept, so GOG-id lookups resume if PCGamingWiki restores the permission. The module doc
records this as the second departure from the TS and the throw bullet is gone from the D-03 list.

The two live GOG goldens (`live-gog-linux`, `live-gog-mac`) took the PCGamingWiki search and parse exchanges, offline,
as byte copies of ex-1 and ex-3 of the same-day `live-epic-*` recordings of the same title. Their `pcgamingwiki` object
comes from the TS-oracle Epic goldens, and `fetchStatus.pcgamingwiki` is now `ok`. The new synthetic case
`gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic` pins the fallthrough with the real
permissiondenied body, whatever the live API answers; the MANIFEST count is now 41. A new edge test,
`pcgamingwiki_reads_a_cargoquery_answer_without_cargoquery_as_no_gog_id`, pins the three answer shapes, a zero-hit
search (`notfound`) and the 403 boundary.

GOG `howlongtobeat` stays `notfound`. `hltb::get`'s GOG branch reads only the gog.com store page and never uses
PCGamingWiki's `howLongToBeatID` (a D-03 parity point listed in `hltb.rs`), so the "no HowLongToBeat id" symptom in the
Problem section is not changed by this fix. A follow-up todo is warranted only if GOG titles should use that id.

`cargo test -p gamelib-info`: all green (`golden_wiki` 11, `golden_wiki_sources` 8, `wiki_source_edges` 16, lib 185),
and the `gamelib-info-cli` drift wiki replay test passes.
