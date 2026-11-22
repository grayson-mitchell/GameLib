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
