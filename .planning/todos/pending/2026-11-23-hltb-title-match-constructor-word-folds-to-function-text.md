---
created: 2026-11-23T08:00:00.000Z
title: "HowLongToBeat title matching folds a trailing word \"constructor\" to the text of a JS function"
area: info
files:
  - src-tauri/crates/gamelib-info/src/wiki/title_match.rs (roman_numeral: the "constructor" arm)
  - src/backend/wiki_game_info/howlongtobeat/titleMatch.ts (normalizeTitle: ROMAN_NUMERALS[last] !== undefined)
severity: minor
platform: any
ready: code
---

## Problem

`normalizeTitle` looks the last word of a title up in `ROMAN_NUMERALS`, a plain object literal, with
`ROMAN_NUMERALS[last] !== undefined`. The lowercase word `constructor` is a property of every object
(`Object.prototype.constructor`), so a multi-word title ending in "Constructor" ("Bridge Constructor", "Car
Mechanic Simulator ... Constructor") has that last word replaced by `String(Object)`, which is
`function Object() { [native code] }`: `normalizeTitle("Bridge Constructor")` is
`"bridge function Object() { [native code] }"`.

The query and every candidate go through the same fold, so two titles that both end in "constructor" still match
each other, but a candidate that does not end in "constructor" is scored against a string full of unrelated
bigrams, and the match is decided by those scores. The match is still conservative (it refuses rather than
guesses), so the effect is a miss on some "... Constructor" titles, never a wrong playtime.

Phase 86 (86-21, D-03) copied this exactly into `gamelib-info` `title_match::normalize_title` (the `constructor`
arm), proven against node, so the Rust lookup and the TS agree until the TS is deleted.

## Why it is parked

It affects only titles ending in "Constructor" and only turns a possible match into a refusal.

## If it ever matters

Look the word up with `Object.hasOwn(ROMAN_NUMERALS, last)` in the TS (or a `Map`) and delete the `constructor` arm
in the Rust, then re-run the `titleMatch` vectors.
