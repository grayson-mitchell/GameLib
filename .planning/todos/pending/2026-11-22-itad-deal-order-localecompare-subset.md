---
created: 2026-11-23T01:50:00.000Z
title: "ITAD deal tie-break reproduces ICU localeCompare for Latin text only"
area: info
files:
  - src-tauri/crates/gamelib-info/src/itad/collate.rs (locale_compare)
  - src-tauri/crates/gamelib-info/src/itad/mapping.rs (map_deals sort)
  - src/backend/storeSearch/itad.ts (mapDeals: a.storeName.localeCompare(b.storeName))
severity: minor
platform: any
ready: code
---

## Problem

TS sorted the deals of a game by numeric price and broke a tie with `a.storeName.localeCompare(b.storeName)`, which in
Node is ICU collation for the process locale. Phase 86 (86-16, D-03) ported that to Rust without adding ICU:
`gamelib_info::itad::collate::locale_compare` reproduces the ICU root order for ASCII text and the Latin-1 and
Latin Extended-A letters. It compares the whole strings level by level: base letters first (a space before
punctuation before digits before letters), then accents, then case with lower case first.

Every recorded and synthetic 86-07 fixture orders identically, including the equal-price case-and-accent fixture
(`alpha`, `Alpha`, `Álpha`, `Beta`, `epic`, `épic`, `zebra`). The subset is not full collation. These differ from ICU:

- a shop name in another script (Cyrillic, Greek, CJK) sorts after the Latin letters by code point;
- non-ASCII punctuation and symbols (`’`, `–`, `™`) sort after the letters instead of among the punctuation;
- a Latin letter outside Latin-1 and Latin Extended-A (Vietnamese stacked accents, `ð`, `þ`) has no entry in the
  accent table and sorts by code point;
- the user's locale is not consulted (Node used the process locale; Rust always orders as the root locale).

## Why it is parked

The names ITAD returns are Latin shop names (`Steam`, `GOG`, `GamesPlanet UK`, `Épic`), only the order of two deals at
exactly the same price depends on this, and the row shown is the cheapest, so a different order inside a tie changes
which of two equal-price links is listed first. It is not a data or safety issue.

## If it ever matters

Add the `icu_collator` crate (or `unicode-normalization` plus the DUCET table) behind `locale_compare` and keep the
86-07 equal-price fixture and the vectors in `collate.rs` as the guard.
