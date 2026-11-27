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
status: CLOSED
closed: 2026-11-27
closed_by: "operator decision -- won't fix; the Latin subset stands"
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

## Resolution

**CLOSED 2026-11-27 (operator decision): won't fix. The Latin subset in `collate.rs` stands.**

A quick-task plan (261127-uzm, discarded) measured the fix. `icu_collator` pinned at `~2.2`, so it shares the ICU4X 2.2
tree `url` → `idna` already locks, adds seven crates and about 1.15 MiB (+1,206,304 bytes) to a stripped, LTO,
opt-level "s" probe binary. Most of that is collation data for every locale; the compiled-data constructor takes the
locale at runtime, so root-only data would need ICU4X datagen in the build. That cost buys the order of two deals at
exactly the same price, and only when a shop name falls outside the subset, which no ITAD shop does today.

Findings worth keeping if this is reopened:

- Use the root locale, not the process locale. Sorted deals go into the store cache and golden fixtures, and
  gamelib-info reads no environment.
- `Intl.Collator('und')` in Node is not root on its own. V8 falls back to the process locale (sv-SE under
  `LANG=sv_SE.UTF-8` sorts ö after z). Derive expected orders with `LC_ALL=C LANG=C`, which resolves en-US, an
  untailored locale.
- `™` is not a gap in the sense the Problem section says: ICU expands it to the letters `t` `m`, so it sorts among
  the letters, not the punctuation.
- ICU4X 2.2.1 root and Node 22 (ICU 78.3, CLDR 48.0) gave identical orders on the 86-07 guard set and on the
  other-script, punctuation and ð/þ/Vietnamese sets. All existing `collate.rs` vectors agree with real ICU.
- icu_collator needs Rust 1.86, but gamelib-info declares `rust-version` 1.77.2, so use `OnceLock`, not `LazyLock`
  (clippy `incompatible_msrv`).

Reopen this if ITAD starts returning shops named in another script, or if a locale-aware UI sort lands in Rust and
brings ICU in anyway.
