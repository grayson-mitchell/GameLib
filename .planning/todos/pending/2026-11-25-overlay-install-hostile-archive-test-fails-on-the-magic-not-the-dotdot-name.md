---
created: 2026-11-25T00:00:00.000Z
title: "The hostile-archive install test builds a header with no ustar magic, so it never reaches the ../x path check it names"
area: testing
severity: minor
platform: any
ready: code
files:
  - src/backend/__tests__/knownFixOverlayInstall.test.ts
  - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/overlay_install/expected/outcome-hostile-archive-with-a-real-dotdot-entry/events.json
---

## Problem

`refuses a hostile archive whose sha matches the pin` builds its tar header with
`h.write('0ustar\0' + '00', 156, 'ascii')`, which writes the typeflag, the magic and the version
contiguously from offset 156. The reader looks for the magic at offset 257, finds zeros and refuses the
entry with `not a POSIX ustar entry`, before it ever reads the `../x` name. The test passes, and the
`existsSync(join(root, '..', 'x'))` probe passes, but the zip-slip path check (`".." path segment`) is not
what stops the archive in that test.

## Why it is minor

The path check itself is covered by `knownFixOverlayArchive.test.ts` (`rejects %s`, `dotdot segment`), so the
traversal defence is tested; only the install-level test of it is weaker than its title says.

## Recorded, not fixed (D-20)

Phase 88 plan 06 records the test as found (`knownFixOverlayInstall--...refuses-a-hostile-archive-whose-sha-matches-the-pin`,
warning `not a POSIX ustar entry`) and adds `outcome-hostile-archive-with-a-real-dotdot-entry`, which uses a
well-formed header and is refused with `".." path segment: ../x`. Fixing the TS test is a separate change.
