---
created: 2026-11-24T00:00:00.000Z
title: 'The Linux .desktop Exec line carries the app name and runner unencoded, so a name with a space or ampersand breaks the launch'
area: shortcuts
severity: minor
platform: linux
ready: code
found_by: 'Phase 94 plan 94-24, filing the quirks the Rust port copied for parity (D-20, D-23). Recorded in linux.rs and the 94-14 summary.'
files:
  - src-tauri/crates/gamelib-shortcuts/src/linux.rs
  - src-tauri/crates/gamelib-shortcuts/src/launch_url.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/text
---

## Problem

The macOS `run.sh` and the Windows `.lnk` percent-encode `appName` and `runner` in the `gamelib://launch?...` URL. The
Linux `.desktop` template did not: its `Exec=` line holds them raw. An `appName` with a space or `&` splits the
`Exec` arguments (the `.desktop` spec splits on whitespace and treats `%` as a field code), and a `Name=` line holding a
newline starts a new key. Store app names are mostly safe ids (Epic ids, GOG numeric ids, Amazon ids), so this bites a
sideloaded game whose app name the user typed.

`linux.rs` reproduces the TypeScript byte for byte on purpose, pinned by the `golden/text` replay, so fixing it is a
deliberate golden change.

## What fixing it would change

Encode the two query values the way the other arms do, quote `Exec` per the Desktop Entry spec, strip newlines from
`Name=`, and re-record the Linux text goldens with a recorded delta against the TypeScript. Verify by double-clicking the
Desktop file on a Linux machine with a sideloaded game named with a space and an ampersand.
