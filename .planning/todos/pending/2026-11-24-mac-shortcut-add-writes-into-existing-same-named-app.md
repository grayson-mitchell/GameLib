---
created: 2026-11-24T00:00:00.000Z
title: 'Adding a macOS shortcut writes into an existing same-named .app instead of replacing or refusing it'
area: shortcuts
severity: minor
platform: macos
ready: code
found_by: 'Phase 94 plan 94-24, filing the quirks the Rust port copied for parity (D-20, D-23). The TypeScript did the same.'
files:
  - src-tauri/crates/gamelib-shortcuts/src/mac.rs
  - src-tauri/crates/gamelib-shortcuts/tests/golden_add.rs
---

## Problem

`write_mac_app` (ported from `generateMacOsApp`) resolves `~/Applications/<sanitized title>.app` and calls
`create_dir_all` on `Contents/Resources` and `Contents/MacOS`, then overwrites `Info.plist` and `run.sh`. It never
checks whether that `.app` already exists. When it does (another game whose title sanitizes to the same name, or an
app the user put there by hand) the add writes into that bundle: GameLib's `Info.plist` and `run.sh` replace the files
of the same name, and every other file in the bundle stays. The result is a bundle that is part the user's app and part
GameLib's launcher, which launches the wrong thing.

The sanitizer makes collisions easy to reach: titles that differ only in characters it strips (`:`, `?`, trademark
signs) land on one folder name. The Rust port copies this on purpose, because the golden cases pin the TypeScript's
behaviour and the removal side (D-29) only deletes what GameLib wrote.

## What fixing it would change

Refuse the add (a named error the renderer can show) when the target `.app` exists and `run.sh` is not GameLib's launch
script, and replace the bundle when it is GameLib's own. That needs the proof check the Desktop link already uses
(`mac.rs`), a new golden case and a recorded delta against the TypeScript.
