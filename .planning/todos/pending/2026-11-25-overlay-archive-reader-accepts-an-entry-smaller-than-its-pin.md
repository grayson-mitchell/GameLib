---
created: 2026-11-25T00:00:00.000Z
title: "readOverlayTarGz accepts an entry smaller than its pinned size; only the installer's later verify catches it"
area: backend
severity: minor
platform: any
ready: code
files:
  - src/backend/knownFixOverlayArchive.ts
  - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/overlay_archive/expected/entry-smaller-than-the-pinned-size-is-accepted/result.json
---

## Problem

`readOverlayTarGz(archive, expected, cap)` takes the pinned size of each path as an upper bound:
`if (size > want) throw 'entry larger than expected'`. An entry that is smaller, including an empty one,
is accepted and returned as is. The strict reader's own doc says it "accepts nothing but regular files
whose paths are exactly the expected set", and a reader of the name would expect the sizes to be exact too.

## Why it is minor

The only caller, `installOnce` in `knownFixOverlayInstall.ts`, writes the files into a temp dir and runs
`verifyInstalledOverlay`, which compares every file's size and sha256 to the catalogue pin before the
rename, so a short entry never reaches the overlays folder. It is a latent trap for a second caller of the
reader, not a live defect.

## Recorded, not fixed (D-20)

Phase 88 plan 06 records the behaviour as the golden
`overlay_archive/expected/entry-smaller-than-the-pinned-size-is-accepted` (two entries, 3 bytes and 0
bytes against a pin of 5, both accepted). The Rust reader (88-10) replays it as recorded. Making the
reader exact is a separate decision with its own golden diff.
