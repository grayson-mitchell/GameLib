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
