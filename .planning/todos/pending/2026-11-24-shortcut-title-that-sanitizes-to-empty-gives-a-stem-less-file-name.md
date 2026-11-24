---
created: 2026-11-24T00:00:00.000Z
title: 'A game title that sanitizes to nothing (CON, NUL.txt, "...") makes shortcut paths with no file stem: .desktop, .lnk and .app'
area: shortcuts
severity: minor
platform: any
ready: code
found_by: 'Phase 94 plan 94-11, porting sanitize-filename and shortcutFiles to Rust (paths goldens darwin-reserved-con, linux-reserved-con, win32-registry-reserved-con; first seen as finding 4 of 94-07).'
files:
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src-tauri/crates/gamelib-shortcuts/src/sanitize.rs
  - src-tauri/crates/gamelib-shortcuts/src/paths.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/paths/linux-reserved-con.json
---

## Problem

`sanitize-filename` returns an empty string for a Windows reserved name (`con`, `prn`, `aux`, `nul`, `com1`..`com9`,
`lpt1`..`lpt9`, with or without an extension), for a name made only of dots, and for one made only of control or
illegal characters. `shortcutFiles` does not check for that: it joins the empty name into `<Desktop>/.desktop`,
`<home>/.local/share/applications/.desktop`, `<Desktop>\.lnk` or `<home>/Applications/.app`. Two games whose titles
both sanitize to nothing then share one shortcut file, and "Remove shortcuts" for either deletes the other's.

The Rust port copies it on purpose (the goldens pin the TypeScript, and `shortcuts_exist` must agree with what the TS
writers did). The exists check for such a title looks at the stem-less path, as the TS does.

A game titled `CON` is rare; the realistic hit is a title made only of characters the filter removes (a title that is
all punctuation from the illegal set).

## Direction

Decide the fallback name (the app name is the stable one) when the sanitized title is empty, in `shortcut_files`, and
apply it in the writers and in `shortcuts_exist` together so they keep agreeing. Record the new answer in
`golden/paths` and `golden/exists` as a delta first.
